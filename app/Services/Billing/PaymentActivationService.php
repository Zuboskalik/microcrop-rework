<?php

namespace App\Services\Billing;

use App\Contracts\PaymentGatewayInterface;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Синхронизирует локальную запись платежа с состоянием в шлюзе.
 * Тело вебхука никогда не используется как источник истины: статус всегда
 * перепроверяется встречным запросом GET /v3/payments/{id}.
 */
class PaymentActivationService
{
    public function __construct(private readonly PaymentGatewayInterface $gateway) {}

    public function sync(Payment $payment): Payment
    {
        if ($payment->status !== Payment::STATUS_PENDING) {
            return $payment;
        }

        $remote = $this->gateway->fetchPayment($payment->id);

        if ($remote->isCanceled()) {
            $payment->update(['status' => Payment::STATUS_CANCELED]);

            return $payment;
        }

        if (! $remote->isSucceeded()) {
            return $payment;
        }

        if (! $this->matches($payment, $remote)) {
            Log::warning('Payment mismatch between gateway and local record', ['payment_id' => $payment->id]);

            return $payment;
        }

        return DB::transaction(function () use ($payment) {
            /** @var Payment $locked */
            $locked = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            if ($locked->status === Payment::STATUS_SUCCEEDED) {
                return $locked; // идемпотентность: повторный вебхук не продлевает подписку дважды
            }

            $nowMs = User::nowMs();

            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($locked->user_id);
            $user->pro_until = User::extendedProUntil($user->pro_until, BillingPlans::durationMs($locked->plan_id), $nowMs);
            $user->save();

            $locked->status = Payment::STATUS_SUCCEEDED;
            $locked->succeeded_at = $nowMs;
            $locked->save();

            return $locked;
        });
    }

    private function matches(Payment $payment, GatewayPayment $remote): bool
    {
        return $remote->id === $payment->id
            && $remote->currency === 'RUB'
            && $remote->amountValue === number_format($payment->amount_rub, 2, '.', '')
            && ($remote->metadata['user_id'] ?? null) === (string) $payment->user_id
            && ($remote->metadata['plan_id'] ?? null) === $payment->plan_id;
    }
}
