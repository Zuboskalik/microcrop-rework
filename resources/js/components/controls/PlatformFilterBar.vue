<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Gamepad2, LayoutGrid, Send, MonitorPlay } from 'lucide-vue-next';
import { PLATFORM_FILTERS, type PlatformFilter } from '../../shared/presets';
import { usePromoWorkspaceStore } from '../../stores/usePromoWorkspaceStore';

const store = usePromoWorkspaceStore();
const { t } = useI18n();

const icons: Record<PlatformFilter, unknown> = {
  all: LayoutGrid,
  yandex_games: Gamepad2,
  telegram: Send,
  vk_play: MonitorPlay,
  rustore: MonitorPlay,
};

// Синхронизация адреса с SEO-роутами без перезагрузки страницы.
const routes: Partial<Record<PlatformFilter, string>> = {
  yandex_games: '/yandex-games-promo',
  telegram: '/telegram-mini-app-assets',
  vk_play: '/vk-play-cover-maker',
};

function select(filter: PlatformFilter): void {
  store.setPlatformFilter(filter);
  const path = routes[filter];
  if (path && window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}
</script>

<template>
  <nav class="flex flex-wrap gap-1 rounded-lg border border-surface-700 bg-surface-900 p-1" role="tablist">
    <button
      v-for="filter in PLATFORM_FILTERS"
      :key="filter"
      type="button"
      role="tab"
      :aria-selected="store.platformFilter === filter"
      class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
      :class="
        store.platformFilter === filter
          ? 'bg-accent-600 text-white'
          : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-100'
      "
      @click="select(filter)"
    >
      <component :is="icons[filter]" class="h-4 w-4" />
      {{ t(`filter.${filter}`) }}
    </button>
  </nav>
</template>
