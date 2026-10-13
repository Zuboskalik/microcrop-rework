<?php

dataset('landings', [
    ['/', 'Генератор обложек и иконок для Яндекс Игр онлайн', 'yandex_games'],
    ['/yandex-games-promo', 'Генератор обложек и иконок для Яндекс Игр онлайн', 'yandex_games'],
    ['/telegram-mini-app-assets', 'Размеры обложек и сжатие графики для Telegram Mini Apps', 'telegram'],
    ['/vk-play-cover-maker', 'Подготовка промо-материалов и баннеров для каталога VK Play и RuStore', 'vk_play'],
]);

it('renders pre-filled SEO tags and activates the platform filter', function (string $url, string $h1, string $filter) {
    $response = $this->get($url);

    $response->assertOk()
        ->assertSee('<title>', false)
        ->assertSee('<meta name="description"', false)
        ->assertSee($h1)
        ->assertSee('&quot;platformFilter&quot;:&quot;'.$filter.'&quot;', false);
})->with('landings');

it('serves the SPA shell on the Yandex ID callback route', function () {
    $this->get('/auth/yandex/callback?code=x&state=y')->assertOk()->assertSee('id="app"', false);
});
