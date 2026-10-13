<?php

namespace App\Contracts;

use App\Models\User;
use App\Services\Billing\GatewayPayment;

/**
 * Контракт платежного шлюза: ЮKassa СБП (RU) сейчас, Paddle/Stripe (GLOBAL) — в будущем.
 */
interface PaymentGatewayInterface
{
    /**
     * Создает платеж и возвращает данные для подтверждения (QR-код / ссылку).
     */
    public function createPayment(User $user, string $planId, int $amountRub): GatewayPayment;

    /**
     * Запрашивает актуальное состояние платежа напрямую у шлюза (источник истины).
     */
    public function fetchPayment(string $paymentId): GatewayPayment;
}
