<?php

use App\Models\User;

it('extends from now when the subscription has expired', function () {
    $now = 1_700_000_000_000;
    $delta = 48 * 3600 * 1000;

    expect(User::extendedProUntil(0, $delta, $now))->toBe($now + $delta)
        ->and(User::extendedProUntil($now - 1000, $delta, $now))->toBe($now + $delta);
});

it('stacks on top of an active subscription', function () {
    $now = 1_700_000_000_000;
    $current = $now + 10 * 24 * 3600 * 1000;
    $delta = 30 * 24 * 3600 * 1000;

    expect(User::extendedProUntil($current, $delta, $now))->toBe($current + $delta);
});

it('defines plan prices and durations from the spec', function () {
    expect(config('microcrop.plans'))->toBe([
        'pass_48h' => ['amount_rub' => 190, 'duration_ms' => 172_800_000],
        'pro_30d' => ['amount_rub' => 490, 'duration_ms' => 2_592_000_000],
        'pro_365d' => ['amount_rub' => 1990, 'duration_ms' => 31_536_000_000],
    ]);
});
