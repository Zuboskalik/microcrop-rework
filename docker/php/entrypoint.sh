#!/bin/sh
set -e
cd /var/www/html

DB_FILE="${DB_DATABASE:-/var/www/html/database/data/database.sqlite}"
mkdir -p "$(dirname "$DB_FILE")" storage/framework/cache storage/framework/sessions storage/framework/views storage/logs
[ -f "$DB_FILE" ] || touch "$DB_FILE"
chown -R www-data:www-data "$(dirname "$DB_FILE")" storage bootstrap/cache

php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

exec "$@"
