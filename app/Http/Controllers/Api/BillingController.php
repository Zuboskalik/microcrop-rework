<?php

namespace App\Http\Controllers\Api;

use App\Contracts\PaymentGatewayInterface;
use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\User;
use App\Services\Billing\BillingPlans;
use App\Services\Billing\PaymentActivationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Оплата по СБП (QR-код) и обработка вебхуков ЮKassa.
 */
class BillingController extends Controller
{
    public function plans(): JsonResponse
    {
        $plans = [];
        foreach (BillingPlans::all() as $id => $plan) {
            $plans[] = ['id' => $id, 'amount_rub' => $plan['amount_rub'], 'duration_ms' => $plan['duration_ms']];
        }

        return response()->json(['plans' => $plans]);
    }

    public function createSbp(Request $request, PaymentGatewayInterface $gateway): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'string', Rule::in(array_keys(BillingPlans::all()))],
        ]);

        /** @var User $user */
        $user = $request->user();
        $planId = $data['plan_id'];
        $amount = BillingPlans::amountRub($planId);

        try {
            $remote = $gateway->createPayment($user, $planId, $amount);
        } catch (Throwable $e) {
            Log::error('SBP payment creation failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Payment provider is unavailable.'], 502);
        }

        $payment = Payment::query()->create([
            'id' => $remote->id,
            'user_id' => $user->id,
            'plan_id' => $planId,
            'amount_rub' => $amount,
            'status' => Payment::STATUS_PENDING,
        ]);

        return response()->json([
            'payment_id' => $payment->id,
            'plan_id' => $planId,
            'amount_rub' => $amount,
            'status' => $payment->status,
            'qr_payload' => $remote->confirmationData,
            'confirmation_url' => $remote->confirmationUrl ?? $remote->confirmationData,
        ], 201);
    }

    /**
     * Поллинг статуса из модалки оплаты. Статус перепроверяется у шлюза,
     * поэтому разблокировка работает даже при задержке вебхука.
     */
    public function paymentStatus(Request $request, string $paymentId, PaymentActivationService $activation): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $payment = Payment::query()->whereKey($paymentId)->where('user_id', $user->id)->firstOrFail();

        try {
            $payment = $activation->sync($payment);
        } catch (Throwable $e) {
            Log::warning('Payment status sync failed', ['payment_id' => $paymentId, 'error' => $e->getMessage()]);
        }

        return response()->json([
            'payment_id' => $payment->id,
            'status' => $payment->status,
            'license' => LicenseController::userPayload($user->refresh()),
        ]);
    }

    /**
     * Вебхук ЮKassa. Тело запроса — только подсказка «какой платеж проверить».
     */
    public function webhook(Request $request, PaymentActivationService $activation): JsonResponse
    {
        $paymentId = $request->input('object.id');
        if (! is_string($paymentId) || $paymentId === '') {
            return response()->json(['ok' => true]);
        }

        $payment = Payment::query()->find($paymentId);
        if ($payment === null) {
            return response()->json(['ok' => true]); // неизвестный платеж — игнорируем
        }

        try {
            $activation->sync($payment);
        } catch (Throwable $e) {
            Log::error('Webhook processing failed', ['payment_id' => $paymentId, 'error' => $e->getMessage()]);

            // Не-2xx ответ заставит ЮKassa повторить доставку уведомления.
            return response()->json(['ok' => false], 500);
        }

        return response()->json(['ok' => true]);
    }
}
