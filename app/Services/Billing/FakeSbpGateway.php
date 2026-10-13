<?php

namespace App\Services\Billing;

use App\Contracts\PaymentGatewayInterface;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Эмулятор СБП для локальной разработки (BILLING_DRIVER=fake).
 * Платеж автоматически становится 'succeeded' через BILLING_FAKE_SUCCESS_DELAY секунд.
 * Никогда не используется в production — см. AppServiceProvider.
 */
class FakeSbpGateway implements PaymentGatewayInterface
{
    public function __construct(private readonly int $successDelaySeconds = 5) {}

    public function createPayment(User $user, string $planId, int $amountRub): GatewayPayment
    {
        $id = (string) Str::uuid();
        $state = [
            'created_at' => time(),
            'amount' => number_format($amountRub, 2, '.', ''),
            'metadata' => ['user_id' => (string) $user->id, 'plan_id' => $planId],
        ];
        Cache::put($this->key($id), $state, now()->addDay());

        return new GatewayPayment(
            id: $id,
            status: 'pending',
            amountValue: $state['amount'],
            currency: 'RUB',
            metadata: $state['metadata'],
            confirmationData: 'https://qr.nspk.ru/FAKE'.strtoupper(substr(str_replace('-', '', $id), 0, 24)).'?type=02&bank=100000000111&sum='.($amountRub * 100).'&cur=RUB',
        );
    }

    public function fetchPayment(string $paymentId): GatewayPayment
    {
        $state = Cache::get($this->key($paymentId));
        if ($state === null) {
            throw new RuntimeException('Fake payment not found.');
        }

        $succeeded = time() - $state['created_at'] >= $this->successDelaySeconds;

        return new GatewayPayment(
            id: $paymentId,
            status: $succeeded ? 'succeeded' : 'pending',
            amountValue: $state['amount'],
            currency: 'RUB',
            metadata: $state['metadata'],
            paid: $succeeded,
        );
    }

    private function key(string $id): string
    {
        return 'fake_sbp_payment:'.$id;
    }
}
