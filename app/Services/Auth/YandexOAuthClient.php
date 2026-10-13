<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * OAuth 2.0 (authorization code) для Яндекс ID.
 *
 * @see https://yandex.ru/dev/id/doc/ru/codes/code-url
 */
class YandexOAuthClient
{
    public function __construct(
        private readonly string $clientId,
        private readonly string $clientSecret,
        private readonly string $redirectUri,
    ) {}

    public function isConfigured(): bool
    {
        return $this->clientId !== '' && $this->clientSecret !== '';
    }

    public function authorizeUrl(string $state): string
    {
        return 'https://oauth.yandex.ru/authorize?'.http_build_query([
            'response_type' => 'code',
            'client_id' => $this->clientId,
            'redirect_uri' => $this->redirectUri,
            'state' => $state,
        ]);
    }

    /**
     * Обменивает code на access_token и возвращает профиль пользователя.
     *
     * @return array{id: string, login: string|null}
     */
    public function userFromCode(string $code): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Yandex ID is not configured.');
        }

        $token = Http::asForm()->timeout(15)->post('https://oauth.yandex.ru/token', [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
        ]);

        $accessToken = $token->json('access_token');
        if ($token->failed() || ! is_string($accessToken)) {
            throw new RuntimeException('Yandex token exchange failed.');
        }

        $info = Http::withHeaders(['Authorization' => 'OAuth '.$accessToken])
            ->timeout(15)
            ->get('https://login.yandex.ru/info', ['format' => 'json']);

        $id = $info->json('id');
        if ($info->failed() || ! is_scalar($id) || (string) $id === '') {
            throw new RuntimeException('Yandex user info request failed.');
        }

        return ['id' => (string) $id, 'login' => $info->json('login')];
    }
}
