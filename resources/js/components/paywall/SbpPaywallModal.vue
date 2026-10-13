<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import { CircleCheck, ExternalLink, Loader2, QrCode, X, ArrowLeft } from 'lucide-vue-next';
import type { CreateSbpResponse, PlanId } from '../../shared/types';
import { api } from '../../shared/api';
import { usePromoWorkspaceStore } from '../../stores/usePromoWorkspaceStore';
import LoginButtons from '../auth/LoginButtons.vue';

/**
 * Модалка оплаты по СБП: выбор тарифа → QR-код → поллинг статуса →
 * событие `unlocked`, по которому воркспейс сразу собирает .zip без водяных знаков.
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'unlocked'): void }>();

const store = usePromoWorkspaceStore();
const { t } = useI18n();

const PLANS: { id: PlanId; amount: number }[] = [
  { id: 'pass_48h', amount: 190 },
  { id: 'pro_30d', amount: 490 },
  { id: 'pro_365d', amount: 1990 },
];
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

type Step = 'plans' | 'qr' | 'succeeded' | 'canceled' | 'error';

const step = ref<Step>('plans');
const selectedPlan = ref<PlanId>('pass_48h');
const payment = ref<CreateSbpResponse | null>(null);
const creating = ref(false);
const qrCanvas = ref<HTMLCanvasElement | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollStartedAt = 0;

const selectedAmount = computed(() => PLANS.find((p) => p.id === selectedPlan.value)?.amount ?? 0);

function stopPolling(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function reset(): void {
  stopPolling();
  step.value = 'plans';
  payment.value = null;
  creating.value = false;
}

watch(
  () => props.open,
  (open) => {
    if (!open) reset();
  },
);

onBeforeUnmount(stopPolling);

async function pay(): Promise<void> {
  if (!store.authToken) return;
  creating.value = true;
  try {
    payment.value = await api.createSbp(store.authToken, selectedPlan.value);
    step.value = 'qr';
    await nextTick();
    if (qrCanvas.value && payment.value.qr_payload) {
      await QRCode.toCanvas(qrCanvas.value, payment.value.qr_payload, {
        width: 232,
        margin: 1,
        color: { dark: '#0b0d12', light: '#ffffff' },
      });
    }
    pollStartedAt = Date.now();
    schedulePoll();
  } catch {
    step.value = 'error';
  } finally {
    creating.value = false;
  }
}

function schedulePoll(): void {
  stopPolling();
  pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
}

async function poll(): Promise<void> {
  if (!payment.value || !store.authToken || !props.open) return;

  try {
    const status = await api.paymentStatus(store.authToken, payment.value.payment_id);
    store.applyLicense(status.license);

    if (status.status === 'succeeded') {
      step.value = 'succeeded';
      stopPolling();
      emit('unlocked');
      return;
    }
    if (status.status === 'canceled') {
      step.value = 'canceled';
      stopPolling();
      return;
    }
  } catch {
    // временная ошибка сети — продолжаем поллинг
  }

  if (Date.now() - pollStartedAt < POLL_TIMEOUT_MS) schedulePoll();
}

function close(): void {
  reset();
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div class="panel w-full max-w-md p-5 shadow-2xl">
        <header class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-zinc-100">{{ t('paywall.title') }}</h2>
            <p class="mt-1 text-sm text-zinc-400">{{ t('paywall.subtitle') }}</p>
          </div>
          <button type="button" class="rounded p-1 text-zinc-500 hover:bg-surface-700 hover:text-zinc-200" :aria-label="t('paywall.close')" @click="close">
            <X class="h-5 w-5" />
          </button>
        </header>

        <!-- Шаг 1: тариф (+ вход, если нужен) -->
        <section v-if="step === 'plans'" class="space-y-3">
          <label
            v-for="plan in PLANS"
            :key="plan.id"
            class="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 transition-colors"
            :class="selectedPlan === plan.id ? 'border-accent-500 bg-accent-600/10' : 'border-surface-600 hover:bg-surface-800'"
          >
            <span class="flex items-center gap-2 text-sm text-zinc-200">
              <input v-model="selectedPlan" type="radio" name="plan" :value="plan.id" class="accent-sky-500" />
              {{ t(`paywall.plans.${plan.id}`) }}
            </span>
            <span class="font-mono text-sm text-zinc-100">{{ plan.amount }} ₽</span>
          </label>

          <div v-if="!store.isAuthenticated" class="rounded-md border border-surface-600 bg-surface-800 p-3">
            <p class="mb-2 text-sm text-zinc-300">{{ t('auth.required') }}</p>
            <LoginButtons />
          </div>

          <button type="button" class="btn-primary w-full py-2" :disabled="!store.isAuthenticated || creating" @click="pay">
            <Loader2 v-if="creating" class="h-4 w-4 animate-spin" />
            <QrCode v-else class="h-4 w-4" />
            {{ t('paywall.pay', { amount: selectedAmount }) }}
          </button>
        </section>

        <!-- Шаг 2: QR-код СБП -->
        <section v-else-if="step === 'qr'" class="flex flex-col items-center gap-3 text-center">
          <canvas ref="qrCanvas" class="rounded-md bg-white p-1" width="232" height="232" />
          <p class="text-sm text-zinc-300">{{ t('paywall.scan') }}</p>
          <a
            v-if="payment?.confirmation_url"
            :href="payment.confirmation_url"
            target="_blank"
            rel="noopener"
            class="btn-ghost"
          >
            <ExternalLink class="h-4 w-4" /> {{ t('paywall.openBank') }}
          </a>
          <p class="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 class="h-4 w-4 animate-spin" /> {{ t('paywall.waiting') }}
          </p>
        </section>

        <section v-else-if="step === 'succeeded'" class="flex flex-col items-center gap-3 py-6 text-center">
          <CircleCheck class="h-12 w-12 text-emerald-400" />
          <p class="text-zinc-200">{{ t('paywall.succeeded') }}</p>
          <button type="button" class="btn-ghost" @click="close">{{ t('paywall.close') }}</button>
        </section>

        <section v-else class="flex flex-col items-center gap-3 py-6 text-center">
          <p class="text-zinc-300">{{ step === 'canceled' ? t('paywall.canceled') : t('paywall.error') }}</p>
          <button type="button" class="btn-ghost" @click="reset">
            <ArrowLeft class="h-4 w-4" /> {{ t('paywall.back') }}
          </button>
        </section>
      </div>
    </div>
  </Teleport>
</template>
