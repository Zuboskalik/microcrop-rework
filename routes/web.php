<?php

use App\Http\Controllers\SeoLandingController;
use Illuminate\Support\Facades\Route;

// Программные SEO-роуты: каждый активирует свой фильтр площадок во Vue.
Route::get('/', [SeoLandingController::class, 'show'])->name('landing.home');
Route::get('/yandex-games-promo', [SeoLandingController::class, 'show'])
    ->defaults('slug', 'yandex-games-promo')->name('landing.yandex');
Route::get('/telegram-mini-app-assets', [SeoLandingController::class, 'show'])
    ->defaults('slug', 'telegram-mini-app-assets')->name('landing.telegram');
Route::get('/vk-play-cover-maker', [SeoLandingController::class, 'show'])
    ->defaults('slug', 'vk-play-cover-maker')->name('landing.vk');

Route::get('/auth/yandex/callback', [SeoLandingController::class, 'yandexCallback'])->name('auth.yandex.callback');
