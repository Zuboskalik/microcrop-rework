<!DOCTYPE html>
<html lang="{{ $boot['locale'] }}" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $seo['title'] }}</title>
    <meta name="description" content="{{ $seo['description'] }}">
    <link rel="canonical" href="{{ $canonical }}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{{ $seo['title'] }}">
    <meta property="og:description" content="{{ $seo['description'] }}">
    <meta property="og:url" content="{{ $canonical }}">
    <meta name="theme-color" content="#0b0d12">
    <link rel="icon" href="/favicon.ico">
    @vite(['resources/css/app.css', 'resources/js/app.ts'])
</head>
<body class="min-h-screen bg-surface-950 text-zinc-200 antialiased">
    <div id="app" data-boot="{{ json_encode($boot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) }}"></div>

    {{-- SEO-блок: виден роботам и пользователю без выполнения JS, Vue монтируется выше. --}}
    <section id="seo-block" class="mx-auto max-w-5xl px-4 pb-12 pt-4 text-sm text-zinc-400">
        <h1 class="mb-2 text-lg font-semibold text-zinc-200">{{ $seo['h1'] }}</h1>
        <p>{{ $seo['text'] }}</p>
        <nav class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
            <a class="hover:text-zinc-300" href="/yandex-games-promo">Яндекс Игры</a>
            <a class="hover:text-zinc-300" href="/telegram-mini-app-assets">Telegram Mini Apps</a>
            <a class="hover:text-zinc-300" href="/vk-play-cover-maker">VK Play и RuStore</a>
        </nav>
    </section>
</body>
</html>
