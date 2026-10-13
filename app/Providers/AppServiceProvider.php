<?php

namespace App\Providers;

use App\Contracts\PaymentGatewayInterface;
use App\Services\Auth\TelegramAuthVerifier;
use App\Services\Auth\YandexOAuthClient;
use App\Services\Billing\FakeSbpGateway;
use App\Services\Billing\YooKassaSbpService;
use App\Services\License\ExportConfigSigner;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use RuntimeException;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(PaymentGatewayInterface::class, function (Application $app) {
            $driver = config('microcrop.billing.driver');

            if ($driver === 'fake') {
                if ($app->environment('production')) {
                    throw new RuntimeException('BILLING_DRIVER=fake is forbidden in production.');
                }

                return new FakeSbpGateway((int) config('microcrop.billing.fake_success_delay'));
            }

            return new YooKassaSbpService(
                shopId: (string) config('microcrop.yookassa.shop_id'),
                secretKey: (string) config('microcrop.yookassa.secret_key'),
                apiUrl: rtrim((string) config('microcrop.yookassa.api_url'), '/'),
                returnUrl: (string) config('microcrop.yookassa.return_url'),
                receiptDescription: (string) config('microcrop.yookassa.receipt_description'),
                vatCode: config('microcrop.yookassa.vat_code'),
                receiptFallbackEmail: config('microcrop.yookassa.receipt_fallback_email'),
            );
        });

        $this->app->singleton(TelegramAuthVerifier::class, fn () => new TelegramAuthVerifier(
            (string) config('microcrop.telegram.bot_token'),
            (int) config('microcrop.telegram.auth_max_age'),
        ));

        $this->app->singleton(YandexOAuthClient::class, fn () => new YandexOAuthClient(
            (string) config('microcrop.yandex.client_id'),
            (string) config('microcrop.yandex.client_secret'),
            (string) config('microcrop.yandex.redirect_uri'),
        ));

        $this->app->singleton(ExportConfigSigner::class, fn () => ExportConfigSigner::fromAppKey((string) config('app.key')));
    }

    public function boot(): void
    {
        // SQLite в режиме WAL: конкурентные чтения без блокировки записи.
        if (config('database.default') === 'sqlite' && config('database.connections.sqlite.database') !== ':memory:') {
            try {
                DB::statement('PRAGMA journal_mode=WAL;');
            } catch (Throwable) {
                // База еще не создана (например, до `touch database/database.sqlite`).
            }
        }
    }
}
