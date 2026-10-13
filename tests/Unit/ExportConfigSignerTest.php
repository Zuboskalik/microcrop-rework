<?php

use App\Services\License\ExportConfigSigner;

it('signs and verifies an export config', function () {
    $signer = ExportConfigSigner::fromAppKey('base64:test-key');
    $token = $signer->sign(['sub' => 1, 'batchZip' => true]);

    expect($signer->verify($token))->toBe(['sub' => 1, 'batchZip' => true]);
});

it('rejects tokens signed with another key', function () {
    $a = ExportConfigSigner::fromAppKey('key-a');
    $b = ExportConfigSigner::fromAppKey('key-b');

    expect($b->verify($a->sign(['sub' => 1])))->toBeNull();
});

it('exposes a 32-byte Ed25519 public key', function () {
    $signer = ExportConfigSigner::fromAppKey('key');

    expect(strlen(base64_decode($signer->publicKeyBase64())))->toBe(32);
});
