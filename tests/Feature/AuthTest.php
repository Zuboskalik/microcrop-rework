<?php

use App\Models\User;
use App\Services\Auth\TelegramAuthVerifier;
use App\Services\Auth\YandexOAuthClient;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config(['microcrop.telegram.bot_token' => '123:ABC']);
    app()->forgetInstance(TelegramAuthVerifier::class);
});

it('logs in via Telegram and issues a Sanctum token', function () {
    $fields = ['id' => 777, 'first_name' => 'Anna', 'username' => 'anna_dev', 'auth_date' => time()];
    $fields['hash'] = hash_hmac('sha256', TelegramAuthVerifier::dataCheckString($fields), hash('sha256', '123:ABC', true));

    $response = $this->postJson('/api/auth/telegram', $fields)->assertOk();

    expect($response->json('user.username'))->toBe('anna_dev')
        ->and($response->json('user.is_pro'))->toBeFalse()
        ->and(User::where(['provider' => 'telegram', 'external_id' => '777'])->exists())->toBeTrue();

    $this->withToken($response->json('token'))->getJson('/api/license/status')
        ->assertOk()->assertJsonPath('provider', 'telegram');
});

it('rejects a forged Telegram payload', function () {
    $this->postJson('/api/auth/telegram', [
        'id' => 1, 'auth_date' => time(), 'hash' => str_repeat('a', 64),
    ])->assertStatus(401);
});

it('logs in via Yandex ID authorization code', function () {
    config(['microcrop.yandex.client_id' => 'cid', 'microcrop.yandex.client_secret' => 'secret']);
    app()->forgetInstance(YandexOAuthClient::class);

    Http::fake([
        'oauth.yandex.ru/token' => Http::response(['access_token' => 'ya-token']),
        'login.yandex.ru/info*' => Http::response(['id' => '555', 'login' => 'ya_user']),
    ]);

    $this->postJson('/api/auth/yandex', ['code' => 'abc'])
        ->assertOk()
        ->assertJsonPath('user.provider', 'yandex')
        ->assertJsonPath('user.username', 'ya_user');

    Http::assertSent(fn ($request) => $request->url() === 'https://oauth.yandex.ru/token' && $request['code'] === 'abc');
});

it('hides dev login outside of local environment', function () {
    config(['microcrop.dev_login' => true]);

    $this->postJson('/api/auth/dev')->assertNotFound();
});

it('requires authentication for license endpoints', function () {
    $this->getJson('/api/license/status')->assertUnauthorized();
    $this->getJson('/api/license/export-config')->assertUnauthorized();
});

it('returns pro_until = 0 for a freshly created user', function () {
    config(['microcrop.dev_login' => true]);
    app()->detectEnvironment(fn () => 'local');

    $this->postJson('/api/auth/dev', ['username' => 'tester'])
        ->assertOk()
        ->assertJsonPath('user.pro_until', 0)
        ->assertJsonPath('user.is_pro', false);
});
