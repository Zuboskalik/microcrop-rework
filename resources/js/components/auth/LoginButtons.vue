<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bug, LogIn } from 'lucide-vue-next';
import type { TelegramAuthData } from '../../shared/types';
import { usePromoWorkspaceStore } from '../../stores/usePromoWorkspaceStore';
import { startYandexLogin } from '../../shared/yandexAuth';

const emit = defineEmits<{ (e: 'authenticated'): void }>();

const store = usePromoWorkspaceStore();
const { t } = useI18n();

const telegramContainer = ref<HTMLDivElement | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

const CALLBACK = 'onMicrocropTelegramAuth';

type TelegramWindow = Window & { [CALLBACK]?: (user: TelegramAuthData) => void };

async function guard(action: () => Promise<void>): Promise<void> {
  error.value = null;
  busy.value = true;
  try {
    await action();
    emit('authenticated');
  } catch {
    error.value = t('auth.failed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  const bot = store.boot.telegramBot;
  if (!bot || !telegramContainer.value) return;

  (window as TelegramWindow)[CALLBACK] = (user) => void guard(() => store.loginTelegram(user));

  // Официальный Telegram Login Widget: скрипт сам рисует кнопку в контейнере.
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', bot);
  script.setAttribute('data-size', 'medium');
  script.setAttribute('data-radius', '6');
  script.setAttribute('data-request-access', 'write');
  script.setAttribute('data-onauth', `${CALLBACK}(user)`);
  telegramContainer.value.appendChild(script);
});

onBeforeUnmount(() => {
  delete (window as TelegramWindow)[CALLBACK];
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="store.boot.telegramBot" ref="telegramContainer" class="min-h-[28px]" />

    <button v-if="store.boot.yandexClientId" type="button" class="btn-ghost" :disabled="busy" @click="startYandexLogin(store.boot)">
      <span class="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">Я</span>
      {{ t('auth.yandex') }}
    </button>

    <button
      v-if="store.boot.devLogin"
      type="button"
      class="btn-ghost border-dashed"
      :disabled="busy"
      @click="guard(() => store.loginDev())"
    >
      <Bug class="h-4 w-4" />
      {{ t('auth.dev') }}
    </button>

    <p
      v-if="!store.boot.telegramBot && !store.boot.yandexClientId && !store.boot.devLogin"
      class="flex items-center gap-1.5 text-xs text-zinc-500"
    >
      <LogIn class="h-3.5 w-3.5" /> {{ t('auth.notConfigured') }}
    </p>

    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>
