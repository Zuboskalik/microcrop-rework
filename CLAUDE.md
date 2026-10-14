# CLAUDE.md — Спецификация MVP проекта MicroCrop (microcrop.ru)

## 1. Обзор проекта и ключевое архитектурное правило

**MicroCrop (`microcrop.ru`)** — это Local-First Micro-SaaS для инди-разработчиков игр (Яндекс Игры, Telegram Mini Apps, VK Play, RuStore).

**Фокус MVP (v0.1) — Store Promo & Safe-Zone Generator:**
Пакетная генерация, кроп и сжатие обложек, иконок и баннеров из одного мастер-арта под жесткие техтребования игровых площадок с интерактивными масками безопасных зон (`Safe Zones`, которые перекрываются элементами UI сторов). Архитектура закладывает фундамент для подключения модулей `AI Sprite Slicer` и `WebGL Texture Packer` в версии v0.2, а также переключения локали (`ru` / `en`) для глобального релиза.

### ЖЕСТКОЕ ОГРАНИЧЕНИЕ ИНФРАСТРУКТУРЫ (Zero-Server-Compute)

* Сервер НИКОГДА не принимает, не хранит и не обрабатывает изображения пользователей.


* **100% вычислений** (кадрирование, масштабирование, рендер водяных знаков, сжатие в WebP/PNG под лимиты в килобайтах и сборка `.zip` архива) происходят исключительно в браузере клиента внутри `Web Workers` с использованием `OffscreenCanvas`, `TypedArrays` и `WebAssembly`.


* **Laravel-бэкенд отвечает только за:**
1. Отдачу предрендеренных SEO-метатегов в корневом Blade-шаблоне и раздачу статики SPA.


2. Авторизацию без паролей (Telegram Login Widget и Яндекс ID).


3. Проверку и выдачу статуса подписки (`pro_until`) и подписанной конфигурации экспорта.


4. Прием платежей по СБП через ЮKassa (режим для самозанятых НПД) и безопасную обработку вебхуков.





---

## 2. Технический стек

### Backend (Laravel API + SEO Shell)

* **Framework:** `PHP 8.3+` + `Laravel 12` (минималистичная структура без лишних провайдеров).
* **Database:** `SQLite` в режиме `WAL` (`database/database.sqlite`, нативная поддержка в Laravel, потребление ОЗУ менее 40 МБ, нулевая нагрузка на CPU).


* **Auth & Tokens:** `Laravel Sanctum` (или stateless JWT на базе `lcobucci/jwt` с проверкой `HMAC-SHA256` подписи от Telegram и OAuth-ответа от Яндекс ID).


* **Payments:** Изолированный сервис `App\Services\Billing\YooKassaService` (REST API ЮKassa v3, генерация QR-кодов СБП, верификация вебхуков) за интерфейсом `PaymentGatewayInterface` для легкой замены на Stripe/Paddle в глобальной версии.



### Frontend (`resources/js`)

* **Core:** `Vue 3` (`<script setup lang="ts">`) + `Vite` (`laravel-vite-plugin`) + `TypeScript`.


* **State Management:** `Pinia` (хранение исходного `ImageBitmap`, параметров трансформации каждого пресета и статуса лицензии).


* **Localization:** `vue-i18n` (словари `ru.json` и `en.json`; на домене `.ru` по умолчанию зафиксирована локаль `ru`).
* **UI & Styling:** `Tailwind CSS` + `lucide-vue-next` (темная тема по умолчанию в стиле профессиональных gamedev-утилит вроде Aseprite / TexturePacker).


* **Вычислительное ядро (Client Worker):**
* Нативные `Web Workers` + `OffscreenCanvas` (передача буферов без копирования памяти через `Transferable Objects`).


* `@jsquash/webp` и `upng-js` — клиентское WASM-сжатие промо-материалов в WebP и 8-bit PNG для автоматического попадания в лимиты веса площадок.


* `fflate` — сверхбыстрая сборка итогового `.zip` архива в оперативной памяти браузера.





### Команды разработки (для ИИ-агента)

```bash
# Установка PHP и JS зависимостей
composer install && npm install

# Инициализация SQLite и миграций
touch database/database.sqlite && php artisan migrate

# Запуск сервера разработки (Laravel + Vite HMR)
composer run dev

# Проверка типов TypeScript и тесты (Pest + Vitest)
npm run typecheck && npm run test && php artisan test

# Сборка продакшен-бандла
npm run build

```

---

## 3. Структура директорий (Laravel + Vue 3 Monolith)

```text
microcrop.ru/
├── CLAUDE.md
├── composer.json
├── package.json
├── vite.config.ts
├── docker-compose.yml                        # Nginx + PHP-FPM 8.3 (лимит RAM 256MB)
├── app/
│   ├── Contracts/
│   │   └── PaymentGatewayInterface.php       # Контракт под ЮKassa (RU) и Paddle/Stripe (GLOBAL)
│   ├── Http/Controllers/Api/
│   │   ├── AuthController.php                # /api/auth/telegram, /api/auth/yandex
│   │   ├── BillingController.php             # /api/billing/create-sbp, /api/billing/webhook
│   │   └── LicenseController.php             # /api/license/status, /api/license/export-config
│   ├── Http/Controllers/
│   │   └── SeoLandingController.php          # Инъекция H1/Title/Meta для SEO-роутов
│   ├── Models/
│   │   ├── User.php
│   │   └── Payment.php
│   └── Services/Billing/
│       └── YooKassaSbpService.php            # Логика СБП + чеки для самозанятых (НПД)
├── database/
│   ├── database.sqlite
│   └── migrations/
│       ├── 0001_01_01_000000_create_users_table.php
│       └── 0001_01_01_000001_create_payments_table.php
├── resources/
│   ├── views/
│   │   └── app.blade.php                     # Корневой шаблон с динамическими SEO-тегами
│   └── js/
│       ├── app.ts
│       ├── locales/                          # Словари ru.json / en.json
│       ├── shared/
│       │   ├── presets.ts                    # Матрица размеров и Safe Zones площадок
│       │   └── types.ts                      # Контракты Worker-а, тарифов и пресетов
│       ├── stores/
│       │   └── usePromoWorkspaceStore.ts     # Стор Pinia (мастер-исходник, зум/кроп карточек)
│       ├── components/
│       │   ├── canvas/
│       │   │   ├── MasterDropzone.vue        # Загрузка исходного арта (Drag & Drop)
│       │   │   └── PresetCardCanvas.vue      # Интерактивный превью-холст с красными Safe Zones
│       │   ├── paywall/
│       │   │   └── SbpPaywallModal.vue       # Модалка с QR-кодом СБП и поллингом статуса
│       │   └── controls/
│       │       └── PlatformFilterBar.vue     # Переключатель площадок (Яндекс, TG, VK)
│       └── workers/                          # ВСЯ обработка графики и сжатие только здесь
│           ├── promoProcessor.worker.ts
│           └── algorithms/
│               ├── cropAndRender.ts          # Отрисовка на OffscreenCanvas + водяной знак
│               └── smartCompressor.ts        # Авто-подгон веса файла (WebP/PNG) под maxSizeKb
└── routes/
    ├── api.php
    └── web.php                               # Программные SEO-роуты

```

---

## 4. Спецификация алгоритмов внутри Web Worker (`promoProcessor.worker.ts`)

Все операции с пикселями и кодированием выполняются строго внутри воркера. Главный поток Vue передает исходный файл как `ImageBitmap` или `ArrayBuffer` через `transfer: [buffer]`, чтобы избежать клонирования в памяти.

### 4.1. Алгоритм 1: Интерактивное кадрирование и проекция координат

Пользователь загружает один мастер-арт размера $W_{\text{src}} \times H_{\text{src}}$ и настраивает положение картинки внутри каждого пресета с целевым разрешением $W_{\text{target}} \times H_{\text{target}}$.

1. Для каждого пресета в Pinia хранится состояние трансформации: масштаб $s \ge s_{\min}$ (где $s_{\min} = \max(W_{\text{target}} / W_{\text{src}}, H_{\text{target}} / H_{\text{src}})$ — режим `cover` без пустых полей) и смещение центра $(\Delta x, \Delta y)$.
2. Координаты отрисовки на целевом `OffscreenCanvas` размера $W_{\text{target}} \times H_{\text{target}}$ вычисляются по формуле:

$$X_{\text{draw}} = \text{round}\left(\frac{W_{\text{target}} - W_{\text{src}} \cdot s}{2} + \Delta x\right), \quad Y_{\text{draw}} = \text{round}\left(\frac{H_{\text{target}} - H_{\text{src}} \cdot s}{2} + \Delta y\right)$$


3. **Разделение слоев (Preview vs Export):**
* Красные полупрозрачные маски безопасных зон (`Safe Zones`) и рамка скругления углов (`borderRadiusPct`) рендерятся **только** во фронтенд-компоненте `PresetCardCanvas.vue` поверх превью и **никогда** не попадают в `OffscreenCanvas` внутри воркера при финальном экспорте.





### 4.2. Алгоритм 2: Smart Byte-Budgeting (Авто-подгон веса под техтребования стора)

Модерация Яндекс Игр и Telegram отклоняет файлы, если их размер превышает `maxSizeKb` (например, $500\text{ KB}$ для иконки). Воркер обязан гарантировать соблюдение лимита:

1. Если выбран формат `webp`:
* Вызывается WASM-кодировщик `@jsquash/webp` с начальным качеством $Q = 92$.


* Если размер полученного буфера $S_{\text{bytes}} > \text{maxSizeKb} \times 1024$, запускается цикл снижения качества с шагом $\Delta Q = 7$ (вплоть до $Q_{\min} = 50$), пока условие $S_{\text{bytes}} \le \text{maxSizeKb} \times 1024$ не будет выполнено.


2. Если выбран формат `png`:
* Сначала выполняется попытка кодирования в 24-bit/32-bit PNG.
* Если $S_{\text{bytes}} > \text{maxSizeKb} \times 1024$, вызывается квантование палитры через `upng-js` (256 цветов, 8-bit PNG), что уменьшает вес файла на 60–70% без видимой потери качества на витрине.





### 4.3. Алгоритм 3: Защита Free-тарифа (Водяной знак в Воркере)

1. В бесплатном режиме (`isPro === false`) перед сжатием кадра в `OffscreenCanvas` воркер принудительно отрисовывает в правом нижнем углу полупрозрачную плашку `microcrop.ru` и отдает файлы только по одному.


2. Для пакетной сборки `.zip` без водяного знака через `fflate` воркер требует подписанный серверный токен конфигурации из эндпоинта `GET /api/license/export-config`.



---

## 5. Матрица пресетов (`resources/js/shared/presets.ts`)

Координаты `safeZones` задаются в относительных долях от `0.0` до `1.0` от ширины и высоты баннера:

```typescript
export interface SafeZoneRect {
  labelKey: string; // Ключ локализации для vue-i18n
  label: string;    // Дефолтный текст (RU)
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PromoPreset {
  id: string;
  region: ('ru' | 'global')[];
  platform: 'yandex_games' | 'telegram' | 'vk_play' | 'rustore';
  title: string;
  fileName: string;
  width: number;
  height: number;
  maxSizeKb: number;
  formats: ('webp' | 'png' | 'jpg')[];
  borderRadiusPct?: number;
  safeZones: SafeZoneRect[];
}

export const PROMO_PRESETS: PromoPreset[] = [
  {
    id: 'ya_icon',
    region: ['ru'],
    platform: 'yandex_games',
    title: 'Яндекс Игры — Иконка',
    fileName: 'yandex_icon_512x512',
    width: 512,
    height: 512,
    maxSizeKb: 500,
    formats: ['png', 'webp'],
    borderRadiusPct: 22,
    safeZones: [
      { labelKey: 'sz.ya_badge', label: 'Бейдж рейтинга / Новинка', x: 0.0, y: 0.0, width: 1.0, height: 0.18 },
      { labelKey: 'sz.ya_bottom_radius', label: 'Скругление углов нижней кромки', x: 0.0, y: 0.85, width: 1.0, height: 0.15 }
    ]
  },
  {
    id: 'ya_cover_horizontal',
    region: ['ru'],
    platform: 'yandex_games',
    title: 'Яндекс Игры — Обложка (Горизонтальная)',
    fileName: 'yandex_cover_800x470',
    width: 800,
    height: 470,
    maxSizeKb: 1000,
    formats: ['png', 'webp'],
    safeZones: [
      { labelKey: 'sz.ya_top_bars', label: 'Верхние плашки каталога', x: 0.0, y: 0.0, width: 1.0, height: 0.16 },
      { labelKey: 'sz.ya_bottom_grad', label: 'Градиент названия и кнопки', x: 0.0, y: 0.72, width: 1.0, height: 0.28 }
    ]
  },
  {
    id: 'ya_cover_vertical',
    region: ['ru'],
    platform: 'yandex_games',
    title: 'Яндекс Игры — Обложка (Мобильная)',
    fileName: 'yandex_vertical_450x600',
    width: 450,
    height: 600,
    maxSizeKb: 1000,
    formats: ['png', 'webp'],
    safeZones: [
      { labelKey: 'sz.ya_top_badges', label: 'Бейджи сверху', x: 0.0, y: 0.0, width: 1.0, height: 0.15 },
      { labelKey: 'sz.ya_bottom_ui', label: 'Нижняя зона UI', x: 0.0, y: 0.78, width: 1.0, height: 0.22 }
    ]
  },
  {
    id: 'tg_miniapp_promo',
    region: ['ru', 'global'],
    platform: 'telegram',
    title: 'Telegram Mini App — Промо бота (BotFather)',
    fileName: 'tg_bot_promo_640x360',
    width: 640,
    height: 360,
    maxSizeKb: 500,
    formats: ['png', 'jpg'],
    safeZones: [
      { labelKey: 'sz.tg_launch_btn', label: 'Кнопка запуска / описание', x: 0.0, y: 0.80, width: 1.0, height: 0.20 }
    ]
  },
  {
    id: 'vk_play_catalog',
    region: ['ru'],
    platform: 'vk_play',
    title: 'VK Play — Каталожная обложка (16:9)',
    fileName: 'vk_play_1920x1080',
    width: 1920,
    height: 1080,
    maxSizeKb: 2048,
    formats: ['jpg', 'png'],
    safeZones: [
      { labelKey: 'sz.vk_margin', label: 'Отступ от краев (10%)', x: 0.0, y: 0.85, width: 1.0, height: 0.15 }
    ]
  }
];

```

---

## 6. Схема БД, Авторизация и Оплата в Laravel (Самозанятость РФ + СБП)

### 6.1. Миграции SQLite (`database/migrations`)

В `AppServiceProvider::boot()` обязательно включается режим `DB::statement('PRAGMA journal_mode=WAL;');`.

```php
// Таблица users
Schema::create('users', function (Blueprint $table) {
    $table->id();
    $table->string('provider', 32);              // 'telegram' | 'yandex'
    $table->string('external_id', 64);           // ID пользователя в TG или Яндексе
    $table->string('username')->nullable();
    $table->unsignedBigInteger('pro_until')->default(0); // Unix timestamp (ms)
    $table->timestamps();
    $table->unique(['provider', 'external_id']);
});

// Таблица payments
Schema::create('payments', function (Blueprint $table) {
    $table->uuid('id')->primary();               // UUID платежа в ЮKassa
    $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
    $table->string('plan_id', 32);               // 'pass_48h' | 'pro_30d' | 'pro_365d'
    $table->unsignedInteger('amount_rub');       // 190 | 490 | 1990
    $table->string('status', 32)->index();       // 'pending' | 'succeeded' | 'canceled'
    $table->unsignedBigInteger('succeeded_at')->nullable();
    $table->timestamps();
});

```

### 6.2. Тарифные планы и математика продления

* `pass_48h` (импульсный триггер перед релизом): стоимость **190 ₽**, добавляет $\Delta t = 48 \times 3600 \times 1000\text{ ms}$.


* `pro_30d`: стоимость **490 ₽**, добавляет $\Delta t = 30 \times 24 \times 3600 \times 1000\text{ ms}$.


* `pro_365d`: стоимость **1990 ₽**, добавляет $\Delta t = 365 \times 24 \times 3600 \times 1000\text{ ms}$.


* При успешной оплате новое значение `pro_until` вычисляется в миллисекундах как:



$$T_{\text{new}} = \max(\text{now\_ms}(), T_{\text{current}}) + \Delta t$$



### 6.3. Интеграция с ЮKassa (`YooKassaSbpService.php`)

1. Пользователь нажимает «Скачать готовый архив без водяных знаков (190 ₽ на 48ч)».


2. Vue-клиент вызывает `POST /api/billing/create-sbp` с токеном авторизации.


3. Laravel обращается через `Http::withBasicAuth($shopId, $secretKey)->withHeaders(['Idempotence-Key' => Str::uuid()])` к `POST [https://api.yookassa.ru/v3/payments](https://api.yookassa.ru/v3/payments)`:


* Передает `payment_method_data: ['type' => 'sbp']`.


* Передает `metadata: ['user_id' => $user->id, 'plan_id' => $planId]`.


* Передает объект `receipt` с позицией: `"Предоставление доступа к расширенному функционалу веб-сервиса microcrop.ru"` (для автоматической отправки чека в ФНС / «Мой Налог»).




4. При получении вебхука на `POST /api/billing/webhook` Laravel **не доверяет телу запроса вслепую**: он делает встречный `GET [https://api.yookassa.ru/v3/payments/](https://api.yookassa.ru/v3/payments/){payment_id}`, проверяет `status === 'succeeded'` и внутри `DB::transaction()` обновляет запись в `payments` и поле `pro_until` пользователя.



---

## 7. Программный SEO под поиск Яндекса и Google (`routes/web.php`)

Чтобы поисковые роботы сразу индексировали целевые страницы без ожидания выполнения JS, контроллер `SeoLandingController` отдает Blade-шаблон `app.blade.php` с предзаполненными `<title>`, `<meta name="description">` и SEO-блоком `<h1>` + краткой текстовой справкой под канвасом, а Vue при монтировании автоматически активирует нужный фильтр площадок:

1. `GET /` и `GET /yandex-games-promo` — **Генератор обложек и иконок для Яндекс Игр онлайн (с проверкой Safe Zones)** (активирует фильтр `yandex_games`).


2. `GET /telegram-mini-app-assets` — **Размеры обложек и сжатие графики для Telegram Mini Apps (BotFather WebP / PNG)** (активирует фильтр `telegram`).


3. `GET /vk-play-cover-maker` — **Подготовка промо-материалов и баннеров для каталога VK Play и RuStore** (активирует фильтр `vk_play`).



---

## 8. Правила написания кода для ИИ-агента (Coding Guardrails)

1. **Никаких утечек памяти в браузере:**
* Каждый созданный `URL.createObjectURL(blob)` обязан очищаться через `URL.revokeObjectURL(url)` в хуке `onBeforeUnmount` или перед перегенерацией превью.


* Каждый `ImageBitmap`, переданный в воркер, после отрисовки на `OffscreenCanvas` должен закрываться вызовом `bitmap.close()`.




2. **Никаких блокировок UI-потока:**
* Запрещено выполнять сжатие в WebP/PNG или генерацию `.zip` в главном потоке Vue. Любое кодирование изображений и цикл подбора размера файла (`Smart Byte-Budgeting`) выполняются строго в `promoProcessor.worker.ts`.




3. **Строгая типизация сообщений Worker-а:**
* Все сообщения между Vue и Web Worker должны быть типизированы через Discriminated Unions (`type PromoWorkerRequest = ...`, `type PromoWorkerResponse = ...`) в `resources/js/shared/types.ts`.




4. **План реализации MVP (порядок шагов для агента):**
* **Шаг 1:** Настроить Laravel 12 + SQLite (`WAL`), миграции `users` и `payments`, Vite-конфигурацию для Vue 3 + TypeScript + Tailwind CSS и файл пресетов `resources/js/shared/presets.ts`.


* **Шаг 2:** Реализовать Web Worker (`promoProcessor.worker.ts`) с алгоритмами `cropAndRender.ts` (включая рендер водяного знака для Free-тарифа), `smartCompressor.ts` (авто-подгон под `maxSizeKb`) и упаковкой в `.zip` через `fflate`, покрыв логику unit-тестами на `Vitest`.


* **Шаг 3:** Собрать интерактивный UI-воркспейс на Vue 3 (`MasterDropzone.vue`, сетку карточек `PresetCardCanvas.vue` с поддержкой перетаскивания/зума мыши и слоем красных масок `Safe Zones`), а также SEO-роутинг в `SeoLandingController`.


* **Шаг 4:** Реализовать контроллеры авторизации (`Telegram` / `Яндекс ID`), сервис `YooKassaSbpService` для оплаты по QR-коду СБП и модальное окно `SbpPaywallModal.vue` с автоматической разблокировкой скачивания `.zip` после оплаты.

---

## 9. Заметки по реализации v0.1 (актуальное состояние кода)

* **Локальный запуск и проверка:** см. `LOCAL_SETUP.md`.
* **Версия фреймворка:** проект переведен с Laravel 11 (указан в исходной спецификации `CLAUDE.md — Спецификация MVP 2.md`) на **Laravel 12** — у 11-й ветки закончилась поддержка исправлений безопасности. Структура приложения не изменилась.
* **Дополнительные файлы сверх дерева из §3** (без них MVP не собрать):
  * `resources/js/App.vue` — корневой компонент воркспейса; `components/auth/LoginButtons.vue` — Telegram Login Widget, Яндекс ID и dev-вход.
  * `resources/js/shared/api.ts` (клиент Laravel API), `shared/workerClient.ts` (обертка над воркером + скачивание с `revokeObjectURL`), `shared/yandexAuth.ts` (OAuth-редирект и проверка `state`).
  * `resources/js/workers/exportJob.ts` — пайплайн экспорта с политикой Free/Pro (тестируется без браузера); `workers/algorithms/zipPacker.ts` (`fflate`), `workers/algorithms/exportToken.ts` (проверка подписи).
  * `app/Services/Billing/{GatewayPayment,BillingPlans,PaymentActivationService,FakeSbpGateway}.php`, `app/Services/Auth/{TelegramAuthVerifier,YandexOAuthClient}.php`, `app/Services/License/ExportConfigSigner.php`, `config/microcrop.php`.
  * `Dockerfile`, `docker/` — образы PHP-FPM и Nginx для `docker-compose.yml`.
* **Авторизация:** Laravel Sanctum, Bearer-токен (хранится в `localStorage`). Яндекс ID — authorization code flow: `/auth/yandex/callback` отдает SPA, SPA отправляет `code` в `POST /api/auth/yandex`.
* **Подписанная конфигурация экспорта:** `GET /api/license/export-config` возвращает токен `base64url(json).base64url(sig)`, подписанный **Ed25519** (ключ детерминированно выводится из `APP_KEY`). Публичный ключ передается в SPA через `data-boot`, воркер проверяет подпись через WebCrypto. Это защита от «случайного» обхода; полностью клиентскую проверку при желании можно обойти — водяной знак остается основным барьером Free-тарифа.
* **Статус оплаты:** помимо вебхука есть `GET /api/billing/payments/{id}` — модалка поллит его, а сервер перепроверяет статус встречным `GET /v3/payments/{id}`. Активация идемпотентна (повторный вебхук не продлевает подписку дважды) и сверяет сумму, валюту и `metadata`.
* **Чек НПД:** в `receipt.items` передается описание из §6.3; `vat_code` и `customer.email` добавляются только если заданы `YOOKASSA_VAT_CODE` / `YOOKASSA_RECEIPT_EMAIL`.
* **Локальная разработка без внешних сервисов:** `BILLING_DRIVER=fake` (эмулятор СБП, платеж «проходит» через `BILLING_FAKE_SUCCESS_DELAY` секунд; запрещен в production) и `MICROCROP_DEV_LOGIN=true` (кнопка «Dev-вход», работает только при `APP_ENV=local`).
* **JPG:** спецификация не задает алгоритм для `jpg` — используется та же лестница качества, что и для WebP (92 → 50, шаг 7), нативным кодировщиком `OffscreenCanvas`.
* **Тесты:** Vitest — `tests/js/*.spec.ts`; Pest — `tests/Unit`, `tests/Feature`.
