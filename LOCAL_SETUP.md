# MicroCrop — запуск локально для тестирования

Инструкция по разворачиванию MVP v0.1 (Store Promo & Safe-Zone Generator) на своём компьютере.
Для локальной проверки **не нужны** ни Telegram-бот, ни Яндекс ID, ни магазин ЮKassa: в `.env.example`
уже включены dev-вход и эмулятор оплаты по СБП.

---

## 1. Что нужно установить

| Инструмент | Версия | Проверка |
|---|---|---|
| PHP | 8.3 или новее | `php -v` |
| Composer | 2.x | `composer -V` |
| Node.js | 20 или новее (рекомендуется 22 LTS) | `node -v` |
| Git | любая | `git --version` |
| Браузер | Chrome / Edge 137+, Firefox 129+, Safari 17+ | — |

У PHP должны быть включены расширения: `pdo_sqlite`, `sqlite3`, `sodium`, `mbstring`, `openssl`, `fileinfo`, `curl`.
Проверить: `php -m`.

**Windows:** откройте `php.ini` (путь покажет `php --ini`) и уберите `;` в начале строк:

```ini
extension=curl
extension=fileinfo
extension=mbstring
extension=openssl
extension=pdo_sqlite
extension=sodium
extension=sqlite3
```

---

## 2. Установка

```bash
git clone https://github.com/zuboskalik/microcrop-rework.git
cd microcrop-rework
git checkout main

composer install
npm install
```

### Конфигурация и база данных

**macOS / Linux (bash):**

```bash
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
php artisan key:generate
New-Item database\database.sqlite -ItemType File
php artisan migrate
```

> Кроссплатформенный вариант создания файла БД: `php -r "touch('database/database.sqlite');"`

После `migrate` база SQLite работает в режиме WAL (включается в `AppServiceProvider::boot()`).

---

## 3. Запуск

```bash
composer run dev
```

Команда одновременно запускает `php artisan serve` (http://localhost:8000) и Vite с HMR.
Откройте **http://localhost:8000**.

Если `composer run dev` не стартует, запустите два процесса в двух терминалах:

```bash
php artisan serve
npm run dev
```

**Вариант без Vite-сервера (как на проде):** `npm run build`, затем только `php artisan serve`.
Если до этого запускался `npm run dev`, удалите файл `public/hot`, иначе страница будет ждать Vite.

---

## 4. Что проверить (сценарий приёмки)

### 4.1 SEO-страницы (без JS)
Откройте исходный код (Ctrl+U) каждой страницы. В нём уже должны быть `<title>`, `<meta name="description">` и `<h1>`:

| URL | Активный фильтр |
|---|---|
| http://localhost:8000/ | Яндекс Игры |
| http://localhost:8000/yandex-games-promo | Яндекс Игры |
| http://localhost:8000/telegram-mini-app-assets | Telegram |
| http://localhost:8000/vk-play-cover-maker | VK Play |

### 4.2 Воркспейс
1. Перетащите любую картинку (PNG / JPG / WebP, лучше от 2000 px) в зону загрузки.
2. Появятся карточки пресетов с **красными Safe Zones** и, у иконки Яндекса, затемнённой рамкой скругления углов 22%.
3. В карточке: **перетаскивание мышью** двигает кадр, **колесо мыши** масштабирует относительно курсора,
   слайдер «Масштаб» — тоже. Изображение нельзя уменьшить так, чтобы появились пустые поля (режим `cover`).
4. Переключатель **Safe Zones** скрывает/показывает маски.
5. Фильтр площадок меняет набор карточек и адрес страницы.
6. Переключатель **RU / EN** меняет язык интерфейса.

### 4.3 Free-тариф
1. Нажмите **«Скачать с водяным знаком»** в любой карточке.
2. Скачается один файл (например, `yandex_icon_512x512.png`) с плашкой **microcrop.ru** в правом нижнем углу.
   Красных масок в файле быть **не должно**.
3. Под карточкой появится отчёт о весе: например «139 KB · PNG-8 (256 цветов)» — значит, полноцветный PNG
   не влез в лимит 500 КБ и был автоматически квантован. Для WebP/JPG показывается итоговое качество `Q`.

### 4.4 Оплата по СБП (эмулятор) и Pro-архив
1. Нажмите **«Скачать готовый архив без водяных знаков (190 ₽ на 48ч)»**.
2. В модалке нажмите **«Dev-вход (локально)»** — это вход без Telegram / Яндекса.
3. Выберите тариф и нажмите **«Оплатить … ₽ по СБП»** — появится QR-код (в эмуляторе он фиктивный).
4. Через ~5 секунд эмулятор «подтвердит» оплату, модалка покажет «Оплата получена!»,
   и браузер **автоматически скачает** `.zip` со всеми пресетами текущего фильтра **без водяных знаков**.
5. В шапке появится бейдж **PRO**; кнопки карточек теперь называются «Скачать» и отдают файлы без водяного знака.

Проверить, что подписка записалась в БД:

```bash
php artisan tinker --execute="dump(App\Models\User::all(['id','provider','username','pro_until'])->toArray()); dump(App\Models\Payment::all()->toArray());"
```

Сбросить Pro для повторной проверки (сервер можно не останавливать), затем обновить страницу:

```bash
php artisan tinker --execute="App\Models\User::query()->update(['pro_until' => 0]);"
```

Полный сброс базы: **остановите** `composer run dev` / `php artisan serve`, удалите файлы
`database/database.sqlite`, `database/database.sqlite-wal`, `database/database.sqlite-shm`, создайте пустой
`database/database.sqlite` заново и выполните `php artisan migrate`. Не используйте `php artisan migrate:fresh`
при запущенном сервере: в режиме WAL это может повредить файл SQLite («file is not a database»).

### 4.5 Изображения не уходят на сервер
Откройте DevTools → Network и повторите экспорт: запросы идут только к `/api/license/*` и `/api/billing/*`
и содержат лишь JSON. Вся обработка — во вкладке DevTools → Sources → `promoProcessor.worker`.

---

## 5. Автотесты

```bash
npm run typecheck     # vue-tsc
npm run test          # Vitest: кроп/проекция, водяной знак, Smart Byte-Budgeting, zip, подпись Ed25519, политика Free/Pro
php artisan test      # Pest: Telegram-подпись, Яндекс ID, ЮKassa (создание, вебхук со встречным GET, идемпотентность), лицензия, SEO
```

Одной командой (как в спецификации): `npm run typecheck && npm run test && php artisan test`.

---

## 6. Подключение реальных сервисов (необязательно для локальной проверки)

Все ключи задаются в `.env`. После изменения `.env` перезапустите `php artisan serve`.

### Telegram Login Widget
1. Создайте бота у [@BotFather](https://t.me/BotFather), выполните `/setdomain` и укажите домен сайта.
   Telegram **не принимает `localhost`** — для локальной проверки нужен публичный HTTPS-туннель
   (например, `ngrok http 8000`), его домен и укажите в `/setdomain` и в `APP_URL`.
2. Заполните `TELEGRAM_BOT_USERNAME` (без `@`) и `TELEGRAM_BOT_TOKEN`.

### Яндекс ID
1. Создайте приложение на https://oauth.yandex.ru/client/new (платформа «Веб-сервисы»).
2. Redirect URI: `http://localhost:8000/auth/yandex/callback` (должен совпадать с `YANDEX_REDIRECT_URI`).
3. Доступ к данным: «Доступ к логину, имени и фамилии».
4. Заполните `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`.

### ЮKassa (СБП, самозанятый)
1. В личном кабинете ЮKassa создайте **тестовый магазин** и выпустите секретный ключ.
2. В `.env`: `BILLING_DRIVER=yookassa`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`.
3. Webhook (необязателен локально — статус подтягивается поллингом из модалки):
   `https://<ваш-домен>/api/billing/webhook`, событие `payment.succeeded` (и `payment.canceled`).
4. `YOOKASSA_VAT_CODE` оставьте пустым для чеков самозанятого; `YOOKASSA_RECEIPT_EMAIL` — если ЮKassa требует контакт покупателя для чека.

Для продакшена обязательно: `APP_ENV=production`, `APP_DEBUG=false`, `MICROCROP_DEV_LOGIN=false`, `BILLING_DRIVER=yookassa`
(эмулятор оплаты в production выдаёт ошибку при старте).

---

## 7. Docker (production-like)

```bash
cp .env.example .env        # заполните APP_KEY (php artisan key:generate --show) и ключи сервисов
docker compose up -d --build
```

Сайт откроется на http://localhost:8080 (порт меняется переменной `MICROCROP_HTTP_PORT`).
Контейнер `app` (PHP-FPM 8.3) ограничен 256 MB RAM, база SQLite хранится в volume `sqlite`,
миграции выполняются при старте контейнера.

> Docker-конфигурация не прогонялась в среде, где писался код (там не было Docker-демона).
> Для приёмки MVP используйте шаги 2–4; Docker стоит проверить отдельно перед деплоем.

---

## 8. Частые проблемы

| Симптом | Решение |
|---|---|
| `could not find driver` при `migrate` | Включите `pdo_sqlite` и `sqlite3` в `php.ini` |
| `Call to undefined function sodium_…` | Включите `extension=sodium` в `php.ini` |
| `Vite manifest not found` | Запустите `npm run dev` или выполните `npm run build` |
| Страница пустая, в консоли ошибки загрузки с `:5173` | Vite не запущен, а файл `public/hot` остался — удалите его или запустите `npm run dev` |
| `APP_KEY is not set` | `php artisan key:generate` |
| Нет кнопки «Dev-вход» | Проверьте `APP_ENV=local` и `MICROCROP_DEV_LOGIN=true` в `.env` |
| «Лицензия не подтверждена» при Pro-экспорте | Браузер без Ed25519 в WebCrypto — обновите его до версии из таблицы в п.1 |
| `file is not a database` | Файл SQLite поврежден (обычно после `migrate:fresh` при запущенном сервере) — выполните полный сброс базы из п. 4.4 |
| Порт 8000 занят | `php artisan serve --port=8001` и поменяйте `APP_URL` |
