<?php

return [

    /*
    | Публичный домен продукта (используется в чеке и водяном знаке).
    */
    'domain' => env('MICROCROP_DOMAIN', 'microcrop.ru'),

    /*
    | Локаль по умолчанию. На домене .ru зафиксирована 'ru'.
    */
    'locale' => env('MICROCROP_LOCALE', 'ru'),

    /*
    | Вход для локального тестирования без Telegram/Яндекса.
    | Работает ТОЛЬКО при APP_ENV=local и MICROCROP_DEV_LOGIN=true.
    */
    'dev_login' => (bool) env('MICROCROP_DEV_LOGIN', false),

    /*
    | Срок жизни подписанной конфигурации экспорта (секунды).
    */
    'export_token_ttl' => (int) env('MICROCROP_EXPORT_TOKEN_TTL', 900),

    'telegram' => [
        'bot_username' => env('TELEGRAM_BOT_USERNAME'),
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        // Максимальный возраст auth_date от Telegram Login Widget (секунды).
        'auth_max_age' => (int) env('TELEGRAM_AUTH_MAX_AGE', 86400),
    ],

    'yandex' => [
        'client_id' => env('YANDEX_CLIENT_ID'),
        'client_secret' => env('YANDEX_CLIENT_SECRET'),
        'redirect_uri' => env('YANDEX_REDIRECT_URI', rtrim((string) env('APP_URL'), '/').'/auth/yandex/callback'),
    ],

    'billing' => [
        // 'yookassa' — боевой шлюз; 'fake' — эмулятор СБП для локальной разработки.
        'driver' => env('BILLING_DRIVER', 'yookassa'),
        // Через сколько секунд фейковый платеж считается оплаченным.
        'fake_success_delay' => (int) env('BILLING_FAKE_SUCCESS_DELAY', 5),
    ],

    'yookassa' => [
        'shop_id' => env('YOOKASSA_SHOP_ID'),
        'secret_key' => env('YOOKASSA_SECRET_KEY'),
        'api_url' => env('YOOKASSA_API_URL', 'https://api.yookassa.ru/v3'),
        'return_url' => env('YOOKASSA_RETURN_URL', env('APP_URL')),
        'receipt_description' => 'Предоставление доступа к расширенному функционалу веб-сервиса microcrop.ru',
        // Для чеков самозанятых (НПД) vat_code не передается. Заполните, только если
        // магазин подключен к онлайн-кассе 54-ФЗ (например, 1 — «без НДС»).
        'vat_code' => env('YOOKASSA_VAT_CODE') !== null && env('YOOKASSA_VAT_CODE') !== '' ? (int) env('YOOKASSA_VAT_CODE') : null,
        // Контакт покупателя для чека, если провайдер не дал email/телефон.
        'receipt_fallback_email' => env('YOOKASSA_RECEIPT_EMAIL'),
    ],

    /*
    | Тарифные планы. duration_ms — Δt, добавляемое к pro_until.
    */
    'plans' => [
        'pass_48h' => ['amount_rub' => 190, 'duration_ms' => 48 * 3600 * 1000],
        'pro_30d' => ['amount_rub' => 490, 'duration_ms' => 30 * 24 * 3600 * 1000],
        'pro_365d' => ['amount_rub' => 1990, 'duration_ms' => 365 * 24 * 3600 * 1000],
    ],
];
