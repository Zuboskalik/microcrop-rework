<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Auth\TelegramAuthVerifier;
use App\Services\Auth\YandexOAuthClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Беспарольная авторизация: Telegram Login Widget и Яндекс ID.
 * Выдает Bearer-токен Laravel Sanctum.
 */
class AuthController extends Controller
{
    public function telegram(Request $request, TelegramAuthVerifier $verifier): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'integer'],
            'auth_date' => ['required', 'integer'],
            'hash' => ['required', 'string', 'size:64'],
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'username' => ['nullable', 'string', 'max:255'],
            'photo_url' => ['nullable', 'string', 'max:2048'],
        ]);

        // Подпись проверяется по исходным строковым значениям, как их прислал виджет.
        $raw = $request->only(['id', 'auth_date', 'hash', 'first_name', 'last_name', 'username', 'photo_url']);

        if (! $verifier->verify($raw)) {
            return response()->json(['message' => 'Invalid Telegram signature.'], 401);
        }

        $username = $data['username'] ?? trim(($data['first_name'] ?? '').' '.($data['last_name'] ?? ''));

        return $this->issueToken('telegram', (string) $data['id'], $username ?: null);
    }

    public function yandex(Request $request, YandexOAuthClient $client): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:512'],
        ]);

        try {
            $profile = $client->userFromCode($data['code']);
        } catch (Throwable $e) {
            Log::warning('Yandex ID auth failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Yandex ID authorization failed.'], 401);
        }

        return $this->issueToken('yandex', $profile['id'], $profile['login']);
    }

    /**
     * Вход для локального тестирования без внешних провайдеров.
     */
    public function dev(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local') && config('microcrop.dev_login'), 404);

        $data = $request->validate([
            'username' => ['nullable', 'string', 'max:64'],
        ]);
        $username = $data['username'] ?? 'dev';

        return $this->issueToken('dev', 'dev:'.$username, $username);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    private function issueToken(string $provider, string $externalId, ?string $username): JsonResponse
    {
        $user = User::query()->firstOrCreate(
            ['provider' => $provider, 'external_id' => $externalId],
            ['username' => $username],
        );

        if ($username !== null && $user->username !== $username) {
            $user->update(['username' => $username]);
        }

        $token = $user->createToken('spa', ['*'], now()->addDays(30))->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => LicenseController::userPayload($user),
        ]);
    }
}
