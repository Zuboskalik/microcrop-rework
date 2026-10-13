import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.ts'],
            refresh: true,
        }),
        vue({
            template: {
                transformAssetUrls: { base: null, includeAbsolute: false },
            },
        }),
    ],
    resolve: {
        alias: { '@': '/resources/js' },
    },
    // WASM-кодировщик @jsquash/webp загружает .wasm через new URL(..., import.meta.url):
    // пре-бандлинг esbuild ломает эти пути, поэтому пакет исключен из optimizeDeps.
    optimizeDeps: {
        exclude: ['@jsquash/webp'],
    },
    worker: {
        format: 'es',
    },
    build: {
        target: 'es2022',
    },
});
