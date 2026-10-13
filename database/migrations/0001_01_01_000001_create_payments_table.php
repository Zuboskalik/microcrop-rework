<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();               // UUID платежа в ЮKassa
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('plan_id', 32);               // 'pass_48h' | 'pro_30d' | 'pro_365d'
            $table->unsignedInteger('amount_rub');       // 190 | 490 | 1990
            $table->string('status', 32)->index();       // 'pending' | 'succeeded' | 'canceled'
            $table->unsignedBigInteger('succeeded_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
