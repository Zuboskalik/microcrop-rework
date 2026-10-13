<?php

namespace App\Services\Billing;

/**
 * Нормализованное представление платежа, полученное от шлюза.
 */
final class GatewayPayment
{
    /**
     * @param  array<string, string>  $metadata
     */
    public function __construct(
        public readonly string $id,
        public readonly string $status,
        public readonly string $amountValue,
        public readonly string $currency,
        public readonly array $metadata = [],
        public readonly ?string $confirmationData = null,
        public readonly ?string $confirmationUrl = null,
        public readonly bool $paid = false,
    ) {}

    public function isSucceeded(): bool
    {
        return $this->status === 'succeeded';
    }

    public function isCanceled(): bool
    {
        return $this->status === 'canceled';
    }

    /**
     * @param  array<string, mixed>  $data  Объект платежа из REST API ЮKassa v3
     */
    public static function fromYooKassa(array $data): self
    {
        $confirmation = $data['confirmation'] ?? [];

        return new self(
            id: (string) ($data['id'] ?? ''),
            status: (string) ($data['status'] ?? ''),
            amountValue: (string) ($data['amount']['value'] ?? '0.00'),
            currency: (string) ($data['amount']['currency'] ?? ''),
            metadata: array_map('strval', (array) ($data['metadata'] ?? [])),
            confirmationData: $confirmation['confirmation_data'] ?? null,
            confirmationUrl: $confirmation['confirmation_url'] ?? null,
            paid: (bool) ($data['paid'] ?? false),
        );
    }
}
