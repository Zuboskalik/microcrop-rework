<?php

namespace App\Services\Billing;

use App\Contracts\PaymentGatewayInterface;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Оплата по СБП через REST API ЮKassa v3 (режим самозанятого, чеки НПД уходят в «Мой Налог»).
 */
class YooKassaSbpService implements PaymentGatewayInterface
{
    public function __construct(
        private readonly string $shopId,
        private readonly string $secretKey,
        private readonly string $apiUrl,
        private readonly string $returnUrl,
        private readonly string $receiptDescription,
        private readonly ?int $vatCode = null,
        private readonly ?string $receiptFallbackEmail = null,
    ) {
        if ($this->shopId === '' || $this->secretKey === '') {
            throw new RuntimeException('YooKassa credentials are not configured (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY).');
        }
    }

    public function createPayment(User $user, string $planId, int $amountRub): GatewayPayment
    {
        $amount = ['value' => number_format($amountRub, 2, '.', ''), 'currency' => 'RUB'];

        $item = [
            'description' => $this->receiptDescription,
            'quantity' => '1.00',
            'amount' => $amount,
            'payment_mode' => 'full_payment',
            'payment_subject' => 'service',
        ];
        if ($this->vatCode !== null) {
            $item['vat_code'] = $this->vatCode;
        }

        $receipt = ['items' => [$item]];
        if ($this->receiptFallbackEmail) {
            $receipt['customer'] = ['email' => $this->receiptFallbackEmail];
        }

        $response = $this->client()
            ->withHeaders(['Idempotence-Key' => (string) Str::uuid()])
            ->post($this->apiUrl.'/payments', [
                'amount' => $amount,
                'capture' => true,
                'payment_method_data' => ['type' => 'sbp'],
                // QR-код СБП рисуется на клиенте из confirmation_data.
                'confirmation' => ['type' => 'qr', 'return_url' => $this->returnUrl],
                'description' => "microcrop.ru: {$planId}",
                'metadata' => ['user_id' => (string) $user->id, 'plan_id' => $planId],
                'receipt' => $receipt,
            ]);

        if ($response->failed()) {
            throw new RuntimeException('YooKassa create payment failed: HTTP '.$response->status().' '.$response->body());
        }

        return GatewayPayment::fromYooKassa($response->json());
    }

    public function fetchPayment(string $paymentId): GatewayPayment
    {
        if (! Str::isUuid($paymentId)) {
            throw new RuntimeException('Invalid YooKassa payment id.');
        }

        $response = $this->client()->get($this->apiUrl.'/payments/'.$paymentId);

        if ($response->failed()) {
            throw new RuntimeException('YooKassa fetch payment failed: HTTP '.$response->status());
        }

        return GatewayPayment::fromYooKassa($response->json());
    }

    private function client(): PendingRequest
    {
        return Http::withBasicAuth($this->shopId, $this->secretKey)
            ->acceptJson()
            ->asJson()
            ->timeout(15);
    }
}
