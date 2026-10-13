<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\LicenseController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->middleware('throttle:20,1')->group(function () {
    Route::post('telegram', [AuthController::class, 'telegram']);
    Route::post('yandex', [AuthController::class, 'yandex']);
    Route::post('dev', [AuthController::class, 'dev']);
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
});

Route::get('billing/plans', [BillingController::class, 'plans']);
Route::post('billing/webhook', [BillingController::class, 'webhook'])->middleware('throttle:120,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('billing/create-sbp', [BillingController::class, 'createSbp'])->middleware('throttle:10,1');
    Route::get('billing/payments/{paymentId}', [BillingController::class, 'paymentStatus'])->middleware('throttle:60,1');

    Route::get('license/status', [LicenseController::class, 'status']);
    Route::get('license/export-config', [LicenseController::class, 'exportConfig'])->middleware('throttle:30,1');
});
