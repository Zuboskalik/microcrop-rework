<?php

use App\Models\User;
use App\Services\License\ExportConfigSigner;
use Laravel\Sanctum\Sanctum;

it('refuses export config for free users', function () {
    Sanctum::actingAs(User::create(['provider' => 'telegram', 'external_id' => '1']));

    $this->getJson('/api/license/export-config')->assertStatus(402);
});

it('issues a signed export config for pro users', function () {
    $proUntil = User::nowMs() + 3600_000;
    $user = User::create(['provider' => 'telegram', 'external_id' => '1', 'pro_until' => $proUntil]);
    Sanctum::actingAs($user);

    $response = $this->getJson('/api/license/export-config')->assertOk();

    $payload = app(ExportConfigSigner::class)->verify($response->json('token'));
    expect($payload)->not->toBeNull()
        ->and($payload['sub'])->toBe($user->id)
        ->and($payload['watermark'])->toBeFalse()
        ->and($payload['batchZip'])->toBeTrue()
        ->and($payload['exp'])->toBeLessThanOrEqual($proUntil);
});
