<?php

namespace App\Http\Controllers;

use App\Services\License\ExportConfigSigner;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

/**
 * Программные SEO-страницы: предзаполненные <title>, <meta description>, <h1> и справка
 * отдаются сервером, чтобы роботы индексировали страницу без выполнения JS.
 */
class SeoLandingController extends Controller
{
    /**
     * @var array<string, array{filter: string, title: string, description: string, h1: string, text: string}>
     */
    public const PAGES = [
        'yandex-games-promo' => [
            'filter' => 'yandex_games',
            'title' => 'Генератор обложек и иконок для Яндекс Игр онлайн — MicroCrop',
            'description' => 'Сделайте иконку 512×512 и обложки 800×470 / 450×600 для Яндекс Игр из одного арта: кроп, проверка Safe Zones и автоматическое сжатие под лимит веса. Всё в браузере, без загрузки на сервер.',
            'h1' => 'Генератор обложек и иконок для Яндекс Игр онлайн (с проверкой Safe Zones)',
            'text' => 'Загрузите мастер-арт, подвиньте и отмасштабируйте кадр в каждом пресете и проверьте, что важные элементы не перекрываются бейджами каталога, градиентом названия и скруглением углов. Файлы сжимаются в WebP или PNG под ограничения модерации Яндекс Игр прямо в вашем браузере.',
        ],
        'telegram-mini-app-assets' => [
            'filter' => 'telegram',
            'title' => 'Размеры обложек и сжатие графики для Telegram Mini Apps — MicroCrop',
            'description' => 'Промо-картинка 640×360 для BotFather и Telegram Mini App: кроп, safe zone под кнопку запуска и сжатие PNG / JPG до 500 КБ локально в браузере.',
            'h1' => 'Размеры обложек и сжатие графики для Telegram Mini Apps (BotFather WebP / PNG)',
            'text' => 'MicroCrop готовит промо-изображение бота 640×360 под требования BotFather: показывает зону, которую перекрывает кнопка запуска и описание, и подгоняет вес файла под лимит без отправки картинки на сервер.',
        ],
        'vk-play-cover-maker' => [
            'filter' => 'vk_play',
            'title' => 'Обложки и баннеры для VK Play и RuStore — MicroCrop',
            'description' => 'Каталожная обложка VK Play 1920×1080 (16:9) из одного арта: кадрирование, безопасные отступы и сжатие JPG / PNG до 2 МБ прямо в браузере.',
            'h1' => 'Подготовка промо-материалов и баннеров для каталога VK Play и RuStore',
            'text' => 'Подготовьте каталожные обложки 16:9 для VK Play и RuStore: интерактивный кроп, маска безопасной зоны у нижней кромки и автоматическое попадание в лимит веса файла. Изображения обрабатываются только на вашем устройстве.',
        ],
    ];

    public function show(Request $request, ExportConfigSigner $signer, string $slug = 'yandex-games-promo'): View
    {
        $page = self::PAGES[$slug] ?? abort(404);

        return view('app', [
            'seo' => $page,
            'canonical' => url($slug === 'yandex-games-promo' && $request->path() === '/' ? '/' : $slug),
            'boot' => [
                'locale' => config('microcrop.locale'),
                'platformFilter' => $page['filter'],
                'telegramBot' => config('microcrop.telegram.bot_username'),
                'yandexClientId' => config('microcrop.yandex.client_id'),
                'yandexRedirectUri' => config('microcrop.yandex.redirect_uri'),
                'exportPublicKey' => $signer->publicKeyBase64(),
                'devLogin' => app()->environment('local') && (bool) config('microcrop.dev_login'),
                'domain' => config('microcrop.domain'),
            ],
        ]);
    }

    /**
     * Callback Яндекс ID: SPA прочитает ?code= и обменяет его через POST /api/auth/yandex.
     */
    public function yandexCallback(Request $request, ExportConfigSigner $signer): View
    {
        return $this->show($request, $signer, 'yandex-games-promo');
    }
}
