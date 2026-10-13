<?php

namespace App\Services\License;

use RuntimeException;

/**
 * Подписывает конфигурацию экспорта Ed25519-ключом сервера.
 * Web Worker проверяет подпись публичным ключом (WebCrypto) перед сборкой .zip без водяного знака.
 *
 * Формат токена: base64url(json_payload) + "." + base64url(signature)
 */
class ExportConfigSigner
{
    private readonly string $secretKey;

    private readonly string $publicKey;

    /**
     * @param  string  $seed  32-байтовый seed (выводится из APP_KEY)
     */
    public function __construct(string $seed)
    {
        if (strlen($seed) !== SODIUM_CRYPTO_SIGN_SEEDBYTES) {
            throw new RuntimeException('Export signer seed must be 32 bytes.');
        }

        $keyPair = sodium_crypto_sign_seed_keypair($seed);
        $this->secretKey = sodium_crypto_sign_secretkey($keyPair);
        $this->publicKey = sodium_crypto_sign_publickey($keyPair);
    }

    public static function fromAppKey(string $appKey): self
    {
        if ($appKey === '') {
            throw new RuntimeException('APP_KEY is not set. Run `php artisan key:generate`.');
        }

        return new self(hash('sha256', 'microcrop-export-config|'.$appKey, true));
    }

    public function publicKeyBase64(): string
    {
        return base64_encode($this->publicKey);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function sign(array $payload): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $signature = sodium_crypto_sign_detached($json, $this->secretKey);

        return self::b64url($json).'.'.self::b64url($signature);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }

        $json = self::b64urlDecode($parts[0]);
        $signature = self::b64urlDecode($parts[1]);
        if ($json === null || $signature === null || strlen($signature) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return null;
        }

        if (! sodium_crypto_sign_verify_detached($signature, $json, $this->publicKey)) {
            return null;
        }

        $payload = json_decode($json, true);

        return is_array($payload) ? $payload : null;
    }

    private static function b64url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    private static function b64urlDecode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
