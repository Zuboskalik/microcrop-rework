# MicroCrop (microcrop.ru)

Local-First Micro-SaaS для инди-разработчиков игр: пакетная генерация, кроп и сжатие обложек, иконок
и баннеров для **Яндекс Игр, Telegram Mini Apps, VK Play и RuStore** из одного мастер-арта —
с интерактивными масками безопасных зон (Safe Zones).

Все вычисления (кадрирование, водяной знак, сжатие WebP/PNG под лимит в КБ, сборка .zip) выполняются
**в браузере** внутри Web Worker. Сервер никогда не получает изображения пользователей.

- **Стек:** Laravel 12 + SQLite (WAL) + Sanctum · Vue 3 + Pinia + TypeScript + Tailwind · Web Workers + OffscreenCanvas · `@jsquash/webp`, `upng-js`, `fflate`
- **Спецификация и правила для ИИ-агента:** [`CLAUDE.md`](CLAUDE.md)
- **Запуск локально и сценарий проверки:** [`LOCAL_SETUP.md`](LOCAL_SETUP.md)

```bash
composer install && npm install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate
composer run dev   # http://localhost:8000
```
