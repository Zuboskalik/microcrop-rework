<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Crop, Eye, EyeOff, FileArchive, Loader2, LogOut, ShieldCheck, Sparkles, User } from 'lucide-vue-next';
import { usePromoWorkspaceStore } from './stores/usePromoWorkspaceStore';
import { consumeYandexCallback } from './shared/yandexAuth';
import MasterDropzone from './components/canvas/MasterDropzone.vue';
import PresetCardCanvas from './components/canvas/PresetCardCanvas.vue';
import PlatformFilterBar from './components/controls/PlatformFilterBar.vue';
import SbpPaywallModal from './components/paywall/SbpPaywallModal.vue';
import LoginButtons from './components/auth/LoginButtons.vue';

const store = usePromoWorkspaceStore();
const { t, locale } = useI18n();

const paywallOpen = ref(false);
const loginOpen = ref(false);

const proUntilLabel = computed(() =>
  store.license ? new Date(store.license.pro_until).toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US') : '',
);

function setLocale(value: 'ru' | 'en'): void {
  locale.value = value;
  document.documentElement.lang = value;
  try {
    localStorage.setItem('microcrop.locale', value);
  } catch {
    // ignore
  }
}

async function onZipClick(): Promise<void> {
  if (!store.source) return;
  if (store.isPro) {
    await store.exportZip();
  } else {
    paywallOpen.value = true;
  }
}

async function onUnlocked(): Promise<void> {
  // Автоматическая разблокировка: сразу после оплаты собираем архив без водяных знаков.
  await store.exportZip();
  paywallOpen.value = false;
}

onMounted(async () => {
  const callback = consumeYandexCallback();
  if (callback) {
    await store.loginYandex(callback.code).catch(() => undefined);
  } else {
    await store.refreshLicense().catch(() => undefined);
  }
  // SEO-блок из Blade остается в DOM для роботов; фильтр уже активирован из data-boot.
});

onBeforeUnmount(() => store.dispose());
</script>

<template>
  <div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
    <!-- Шапка -->
    <header class="flex flex-wrap items-center gap-3">
      <a href="/" class="flex items-center gap-2 text-zinc-100">
        <span class="flex h-8 w-8 items-center justify-center rounded-md bg-accent-600"><Crop class="h-5 w-5 text-white" /></span>
        <span class="font-semibold tracking-tight">MicroCrop</span>
      </a>
      <span class="hidden text-sm text-zinc-500 md:inline">{{ t('app.tagline') }}</span>

      <div class="ml-auto flex items-center gap-2">
        <div class="flex overflow-hidden rounded-md border border-surface-600 text-xs" :title="t('app.language')">
          <button
            v-for="code in ['ru', 'en'] as const"
            :key="code"
            type="button"
            class="px-2 py-1 uppercase"
            :class="locale === code ? 'bg-surface-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'"
            @click="setLocale(code)"
          >
            {{ code }}
          </button>
        </div>

        <template v-if="store.isAuthenticated">
          <span class="flex items-center gap-1.5 text-sm text-zinc-300">
            <User class="h-4 w-4" /> {{ store.license?.username ?? store.license?.provider }}
            <span v-if="store.isPro" class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">PRO</span>
          </span>
          <button type="button" class="rounded p-1.5 text-zinc-500 hover:bg-surface-700 hover:text-zinc-200" :title="t('auth.logout')" @click="store.logout()">
            <LogOut class="h-4 w-4" />
          </button>
        </template>
        <div v-else class="relative">
          <button type="button" class="btn-ghost" @click="loginOpen = !loginOpen">{{ t('auth.login') }}</button>
          <div v-if="loginOpen" class="panel absolute right-0 z-40 mt-2 w-64 p-3 shadow-xl">
            <LoginButtons @authenticated="loginOpen = false" />
          </div>
        </div>
      </div>
    </header>

    <!-- Панель управления -->
    <div class="flex flex-wrap items-center gap-3">
      <PlatformFilterBar />
      <label class="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
        <input v-model="store.showSafeZones" type="checkbox" class="hidden" />
        <Eye v-if="store.showSafeZones" class="h-4 w-4 text-red-400" />
        <EyeOff v-else class="h-4 w-4" />
        {{ t('app.showSafeZones') }}
      </label>
      <span class="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
        <ShieldCheck class="h-4 w-4 text-emerald-500" /> {{ t('app.localFirst') }}
      </span>
    </div>

    <MasterDropzone />

    <!-- Сетка пресетов -->
    <section class="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <PresetCardCanvas v-for="preset in store.visiblePresets" :key="preset.id" :preset="preset" />
    </section>

    <!-- Пакетный экспорт -->
    <footer class="panel sticky bottom-3 z-30 flex flex-wrap items-center gap-3 p-3 shadow-xl">
      <div class="text-sm text-zinc-400">
        <template v-if="!store.source">{{ t('export.noSource') }}</template>
        <template v-else-if="store.isPro">{{ t('export.proNote', { date: proUntilLabel }) }}</template>
        <template v-else>{{ t('export.freeNote') }}</template>
        <p v-if="store.lastError" class="text-red-400">{{ t(store.lastError) }}</p>
      </div>

      <button
        type="button"
        class="btn-primary ml-auto py-2"
        :disabled="!store.source || store.exporting || store.visiblePresets.length === 0"
        @click="onZipClick"
      >
        <Loader2 v-if="store.exporting && store.progress" class="h-4 w-4 animate-spin" />
        <FileArchive v-else-if="store.isPro" class="h-4 w-4" />
        <Sparkles v-else class="h-4 w-4" />
        <template v-if="store.exporting && store.progress">
          {{ t('export.progress', { done: store.progress.done, total: store.progress.total }) }}
        </template>
        <template v-else>{{ store.isPro ? t('export.zip') : t('export.zipPaywall') }}</template>
      </button>
    </footer>

    <SbpPaywallModal :open="paywallOpen" @close="paywallOpen = false" @unlocked="onUnlocked" />
  </div>
</template>
