<?php

use App\Services\Auth\TelegramAuthVerifier;

function telegramPayload(string $botToken, array $fields): array
{
    $check = TelegramAuthVerifier::dataCheckString($fields);
    $fields['hash'] = hash_hmac('sha256', $check, hash('sha256', $botToken, true));

    return $fields;
}

it('accepts a correctly signed widget payload', function () {
    $verifier = new TelegramAuthVerifier('123:ABC');
    $data = telegramPayload('123:ABC', ['id' => 42, 'first_name' => 'Ivan', 'username' => 'ivan', 'auth_date' => time()]);

    expect($verifier->verify($data))->toBeTrue();
});

it('rejects a tampered payload', function () {
    $verifier = new TelegramAuthVerifier('123:ABC');
    $data = telegramPayload('123:ABC', ['id' => 42, 'auth_date' => time()]);
    $data['id'] = 43;

    expect($verifier->verify($data))->toBeFalse();
});

it('rejects a payload signed with another bot token', function () {
    $verifier = new TelegramAuthVerifier('123:ABC');
    $data = telegramPayload('999:XYZ', ['id' => 42, 'auth_date' => time()]);

    expect($verifier->verify($data))->toBeFalse();
});

it('rejects stale auth_date', function () {
    $verifier = new TelegramAuthVerifier('123:ABC', 3600);
    $data = telegramPayload('123:ABC', ['id' => 42, 'auth_date' => time() - 7200]);

    expect($verifier->verify($data))->toBeFalse();
});

it('builds data_check_string sorted alphabetically without hash', function () {
    expect(TelegramAuthVerifier::dataCheckString(['username' => 'u', 'id' => 1, 'auth_date' => 5, 'hash' => 'x']))
        ->toBe("auth_date=5\nid=1\nusername=u");
});
