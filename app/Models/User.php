<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Пользователь без пароля: идентифицируется парой (provider, external_id).
 *
 * @property int $id
 * @property string $provider
 * @property string $external_id
 * @property string|null $username
 * @property int $pro_until Unix timestamp в миллисекундах
 */
class User extends Authenticatable
{
    use HasApiTokens;

    /**
     * Значения по умолчанию, совпадающие с DEFAULT в миграции
     * (иначе у только что созданной модели pro_until === null).
     */
    protected $attributes = [
        'pro_until' => 0,
    ];

    protected $fillable = [
        'provider',
        'external_id',
        'username',
        'pro_until',
    ];

    protected function casts(): array
    {
        return [
            'pro_until' => 'integer',
        ];
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    public function isPro(?int $nowMs = null): bool
    {
        return $this->pro_until > ($nowMs ?? self::nowMs());
    }

    /**
     * T_new = max(now_ms(), T_current) + Δt
     */
    public static function extendedProUntil(int $currentMs, int $deltaMs, int $nowMs): int
    {
        return max($nowMs, $currentMs) + $deltaMs;
    }
}
