<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id UUID платежа в ЮKassa
 * @property int $user_id
 * @property string $plan_id
 * @property int $amount_rub
 * @property string $status
 * @property int|null $succeeded_at Unix timestamp (ms)
 */
class Payment extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_SUCCEEDED = 'succeeded';

    public const STATUS_CANCELED = 'canceled';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'plan_id',
        'amount_rub',
        'status',
        'succeeded_at',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'amount_rub' => 'integer',
            'succeeded_at' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
