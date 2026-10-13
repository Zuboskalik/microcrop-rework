<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 32);              // 'telegram' | 'yandex'
            $table->string('external_id', 64);           // ID пользователя в TG или Яндексе
            $table->string('username')->nullable();
            $table->unsignedBigInteger('pro_until')->default(0); // Unix timestamp (ms)
            $table->timestamps();
            $table->unique(['provider', 'external_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
