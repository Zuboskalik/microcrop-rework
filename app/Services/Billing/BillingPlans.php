<?php

namespace App\Services\Billing;

use InvalidArgumentException;

/**
 * Реестр тарифов: pass_48h (190 ₽), pro_30d (490 ₽), pro_365d (1990 ₽).
 */
final class BillingPlans
{
    /**
     * @return array<string, array{amount_rub: int, duration_ms: int}>
     */
    public static function all(): array
    {
        return config('microcrop.plans');
    }

    public static function exists(string $planId): bool
    {
        return array_key_exists($planId, self::all());
    }

    public static function amountRub(string $planId): int
    {
        return self::get($planId)['amount_rub'];
    }

    public static function durationMs(string $planId): int
    {
        return self::get($planId)['duration_ms'];
    }

    /**
     * @return array{amount_rub: int, duration_ms: int}
     */
    private static function get(string $planId): array
    {
        $plans = self::all();
        if (! isset($plans[$planId])) {
            throw new InvalidArgumentException("Unknown plan [{$planId}]");
        }

        return $plans[$planId];
    }
}
