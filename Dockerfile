# syntax=docker/dockerfile:1

# ---------- 1. Сборка фронтенда (Vite) ----------
FROM node:22-alpine AS assets
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY resources ./resources
RUN npm run build

# ---------- 2. PHP-зависимости ----------
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction
COPY . .
RUN composer dump-autoload --optimize --no-dev

# ---------- 3. PHP-FPM 8.3 (Laravel API + SEO shell) ----------
FROM php:8.3-fpm-alpine AS app
WORKDIR /var/www/html
# pdo_sqlite, sodium, mbstring, openssl уже включены в официальный образ.
RUN apk add --no-cache sqlite \
    && docker-php-ext-install opcache
COPY docker/php/php.ini /usr/local/etc/php/conf.d/zz-microcrop.ini
COPY docker/php/www.conf /usr/local/etc/php-fpm.d/zz-www.conf
COPY --from=vendor --chown=www-data:www-data /app /var/www/html
COPY --from=assets --chown=www-data:www-data /app/public/build /var/www/html/public/build
COPY docker/php/entrypoint.sh /usr/local/bin/microcrop-entrypoint
RUN chmod +x /usr/local/bin/microcrop-entrypoint
ENTRYPOINT ["microcrop-entrypoint"]
CMD ["php-fpm"]

# ---------- 4. Nginx (статика SPA + проксирование в PHP-FPM) ----------
FROM nginx:1.27-alpine AS web
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=vendor /app/public /var/www/html/public
COPY --from=assets /app/public/build /var/www/html/public/build
