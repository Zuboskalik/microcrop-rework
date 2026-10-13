<?php

use App\Contracts\PaymentGatewayInterface;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

const PAYMENT_ID = '2f2b6a42-000f-5000-8000-1a2b3c4d5e6f';

beforeEach(function () {
    config([
        'microcrop.billing.driver' => 'yookassa',
        'microcrop.yookassa.shop_id' => 'shop',
        'microcrop.yookassa.secret_key' => 'secret',
        'microcrop.yookassa.api_url' => 'https://api.yookassa.ru/v3',
    ]);
    app()->forgetInstance(PaymentGatewayInterface::class);
});

function yookassaPayment(string $status, User $user, string $plan = 'pass_48h', string $amount = '190.00'): array
{
    return [
        'id' => PAYMENT_ID,
        'status' => $status,
        'paid' => $status === 'succeeded',
        'amount' => ['value' => $amount, 'currency' => 'RUB'],
        'metadata' => ['user_id' => (string) $user->id, 'plan_id' => $plan],
        'confirmation' => ['type' => 'qr', 'confirmation_data' => 'https://qr.nspk.ru/AS1000'],
    ];
}

it('creates an SBP payment in YooKassa with receipt and metadata', function () {
    $user = User::create(['provider' => 'telegram', 'external_id' => '1']);
    Sanctum::actingAs($user);
    Http::fake(['api.yookassa.ru/v3/payments' => Http::response(yookassaPayment('pending', $user))]);

    $this->postJson('/api/billing/create-sbp', ['plan_id' => 'pass_48h'])
        ->assertCreated()
        ->assertJsonPath('payment_id', PAYMENT_ID)
        ->assertJsonPath('qr_payload', 'https://qr.nspk.ru/AS1000');

    Http::assertSent(function ($request) use ($user) {
        return $request->url() === 'https://api.yookassa.ru/v3/payments'
            && $request->hasHeader('Idempotence-Key')
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('shop:secret'))
            && $request['payment_method_data'] === ['type' => 'sbp']
            && $request['amount'] === ['value' => '190.00', 'currency' => 'RUB']
            && $request['metadata'] === ['user_id' => (string) $user->id, 'plan_id' => 'pass_48h']
            && $request['receipt']['items'][0]['description'] === 'Предоставление доступа к расширенному функционалу веб-сервиса microcrop.ru';
    });

    expect(Payment::find(PAYMENT_ID))->status->toBe('pending')->amount_rub->toBe(190);
});

it('rejects unknown plans', function () {
    Sanctum::actingAs(User::create(['provider' => 'telegram', 'external_id' => '1']));

    $this->postJson('/api/billing/create-sbp', ['plan_id' => 'free_forever'])->assertUnprocessable();
});

it('activates the subscription only after a counter GET confirms success', function () {
    $user = User::create(['provider' => 'telegram', 'external_id' => '1']);
    Payment::create(['id' => PAYMENT_ID, 'user_id' => $user->id, 'plan_id' => 'pass_48h', 'amount_rub' => 190, 'status' => 'pending']);
    Http::fake(['api.yookassa.ru/v3/payments/'.PAYMENT_ID => Http::response(yookassaPayment('succeeded', $user))]);

    $before = User::nowMs();
    $this->postJson('/api/billing/webhook', ['type' => 'notification', 'event' => 'payment.succeeded', 'object' => ['id' => PAYMENT_ID]])
        ->assertOk();

    $user->refresh();
    expect(Payment::find(PAYMENT_ID)->status)->toBe('succeeded')
        ->and($user->pro_until)->toBeGreaterThanOrEqual($before + 48 * 3600 * 1000)
        ->and($user->isPro())->toBeTrue();

    Http::assertSent(fn ($r) => $r->method() === 'GET' && str_ends_with($r->url(), '/payments/'.PAYMENT_ID));
});

it('does not trust the webhook body when YooKassa says the payment is still pending', function () {
    $user = User::create(['provider' => 'telegram', 'external_id' => '1']);
    Payment::create(['id' => PAYMENT_ID, 'user_id' => $user->id, 'plan_id' => 'pro_365d', 'amount_rub' => 1990, 'status' => 'pending']);
    Http::fake(['api.yookassa.ru/*' => Http::response(yookassaPayment('pending', $user, 'pro_365d', '1990.00'))]);

    $this->postJson('/api/billing/webhook', ['event' => 'payment.succeeded', 'object' => ['id' => PAYMENT_ID, 'status' => 'succeeded']])
        ->assertOk();

    expect($user->refresh()->pro_until)->toBe(0)
        ->and(Payment::find(PAYMENT_ID)->status)->toBe('pending');
});

it('rejects a succeeded payment whose amount or metadata do not match', function () {
    $user = User::create(['provider' => 'telegram', 'external_id' => '1']);
    Payment::create(['id' => PAYMENT_ID, 'user_id' => $user->id, 'plan_id' => 'pro_365d', 'amount_rub' => 1990, 'status' => 'pending']);
    Http::fake(['api.yookassa.ru/*' => Http::response(yookassaPayment('succeeded', $user, 'pro_365d', '1.00'))]);

    $this->postJson('/api/billing/webhook', ['object' => ['id' => PAYMENT_ID]])->assertOk();

    expect($user->refresh()->pro_until)->toBe(0);
});

it('is idempotent for repeated webhooks', function () {
    $user = User::create(['provider' => 'telegram', 'external_id' => '1']);
    Payment::create(['id' => PAYMENT_ID, 'user_id' => $user->id, 'plan_id' => 'pass_48h', 'amount_rub' => 190, 'status' => 'pending']);
    Http::fake(['api.yookassa.ru/*' => Http::response(yookassaPayment('succeeded', $user))]);

    $this->postJson('/api/billing/webhook', ['object' => ['id' => PAYMENT_ID]])->assertOk();
    $first = $user->refresh()->pro_until;
    $this->postJson('/api/billing/webhook', ['object' => ['id' => PAYMENT_ID]])->assertOk();

    expect($user->refresh()->pro_until)->toBe($first);
});

it('stacks a new purchase on top of an active subscription', function () {
    $active = User::nowMs() + 10 * 24 * 3600 * 1000;
    $user = User::create(['provider' => 'telegram', 'external_id' => '1', 'pro_until' => $active]);
    Payment::create(['id' => PAYMENT_ID, 'user_id' => $user->id, 'plan_id' => 'pro_30d', 'amount_rub' => 490, 'status' => 'pending']);
    Http::fake(['api.yookassa.ru/*' => Http::response(yookassaPayment('succeeded', $user, 'pro_30d', '490.00'))]);

    $this->postJson('/api/billing/webhook', ['object' => ['id' => PAYMENT_ID]])->assertOk();

    expect($user->refresh()->pro_until)->toBe($active + 30 * 24 * 3600 * 1000);
});

it('ignores webhooks for unknown payments', function () {
    Http::fake();

    $this->postJson('/api/billing/webhook', ['object' => ['id' => PAYMENT_ID]])->assertOk();

    Http::assertNothingSent();
});

it('unlocks via status polling and hides other users payments', function () {
    $user = User::create(['provider' => 'telegram', 'external_id' => '1']);
    $other = User::create(['provider' => 'telegram', 'external_id' => '2']);
    Payment::create(['id' => PAYMENT_ID, 'user_id' => $user->id, 'plan_id' => 'pass_48h', 'amount_rub' => 190, 'status' => 'pending']);
    Http::fake(['api.yookassa.ru/*' => Http::response(yookassaPayment('succeeded', $user))]);

    Sanctum::actingAs($other);
    $this->getJson('/api/billing/payments/'.PAYMENT_ID)->assertNotFound();

    Sanctum::actingAs($user);
    $this->getJson('/api/billing/payments/'.PAYMENT_ID)
        ->assertOk()
        ->assertJsonPath('status', 'succeeded')
        ->assertJsonPath('license.is_pro', true);
});

it('completes the full flow with the fake SBP gateway', function () {
    config(['microcrop.billing.driver' => 'fake', 'microcrop.billing.fake_success_delay' => 0]);
    app()->forgetInstance(PaymentGatewayInterface::class);
    Sanctum::actingAs($user = User::create(['provider' => 'dev', 'external_id' => 'dev:1']));

    $id = $this->postJson('/api/billing/create-sbp', ['plan_id' => 'pro_30d'])->assertCreated()->json('payment_id');

    $this->getJson('/api/billing/payments/'.$id)->assertJsonPath('status', 'succeeded');
    expect($user->refresh()->isPro())->toBeTrue();
});
