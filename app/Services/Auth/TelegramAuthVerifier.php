<?php

namespace App\Services\Auth;

/**
 * Проверка данных Telegram Login Widget:
 * secret_key = SHA256(bot_token), hash = HMAC_SHA256(data_check_string, secret_key).
 *
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
class TelegramAuthVerifier
{
    public function __construct(
        private readonly string $botToken,
        private readonly int $maxAgeSeconds = 86400,
    ) {}

    /**
     * @param  array<string, scalar|null>  $data  Поля, полученные от виджета (id, first_name, username, auth_date, hash, ...)
     */
    public function verify(array $data, ?int $now = null): bool
    {
        if ($this->botToken === '' || ! isset($data['hash'], $data['id'], $data['auth_date'])) {
            return false;
        }

        $hash = (string) $data['hash'];
        $checkString = self::dataCheckString($data);
        $secretKey = hash('sha256', $this->botToken, true);
        $expected = hash_hmac('sha256', $checkString, $secretKey);

        if (! hash_equals($expected, strtolower($hash))) {
            return false;
        }

        $age = ($now ?? time()) - (int) $data['auth_date'];

        return $age >= -60 && $age <= $this->maxAgeSeconds;
    }

    /**
     * @param  array<string, scalar|null>  $data
     */
    public static function dataCheckString(array $data): string
    {
        unset($data['hash']);
        $data = array_filter($data, fn ($v) => $v !== null && $v !== '');
        ksort($data, SORT_STRING);

        $lines = [];
        foreach ($data as $key => $value) {
            $lines[] = $key.'='.$value;
        }

        return implode("\n", $lines);
    }
}
