<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\License\ExportConfigSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Статус подписки и подписанная конфигурация экспорта для Web Worker-а.
 */
class LicenseController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        return response()->json(self::userPayload($request->user()));
    }

    public function exportConfig(Request $request, ExportConfigSigner $signer): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $nowMs = User::nowMs();

        if (! $user->isPro($nowMs)) {
            return response()->json(['message' => 'Pro subscription required.'], 402);
        }

        $expiresAt = min($user->pro_until, $nowMs + config('microcrop.export_token_ttl') * 1000);

        $config = [
            'v' => 1,
            'sub' => $user->id,
            'watermark' => false,
            'batchZip' => true,
            'iat' => $nowMs,
            'exp' => $expiresAt,
        ];

        return response()->json([
            'token' => $signer->sign($config),
            'config' => $config,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public static function userPayload(User $user): array
    {
        $nowMs = User::nowMs();

        return [
            'id' => $user->id,
            'provider' => $user->provider,
            'username' => $user->username,
            'pro_until' => $user->pro_until,
            'is_pro' => $user->isPro($nowMs),
            'server_time' => $nowMs,
        ];
    }
}
