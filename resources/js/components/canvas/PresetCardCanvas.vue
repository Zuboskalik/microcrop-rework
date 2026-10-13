<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Loader2, RotateCcw, CircleCheck, TriangleAlert } from 'lucide-vue-next';
import type { PromoPreset } from '../../shared/presets';
import type { ExportFormat } from '../../shared/types';
import { usePromoWorkspaceStore } from '../../stores/usePromoWorkspaceStore';
import { MAX_ZOOM_FACTOR, computeDrawRect, minScale } from '../../workers/algorithms/cropAndRender';
import { formatBytes } from '../../shared/workerClient';

/**
 * Интерактивное превью пресета: перетаскивание кадра мышью/пальцем, зум колесом,
 * слой красных Safe Zones и рамка скругления углов.
 * Маски рисуются ТОЛЬКО здесь и никогда не попадают в экспорт (воркер о них не знает).
 */
const props = defineProps<{ preset: PromoPreset }>();

const store = usePromoWorkspaceStore();
const { t, te, locale } = useI18n();

const canvas = ref<HTMLCanvasElement | null>(null);
const wrapper = ref<HTMLDivElement | null>(null);
const cssWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;
let frame = 0;
let dragPointer: number | null = null;
let lastPoint = { x: 0, y: 0 };

const state = computed(() => store.presetStates[props.preset.id]);
const report = computed(() => store.reports[props.preset.id]);
const aspect = computed(() => props.preset.height / props.preset.width);
const title = computed(() => (te(`presets.${props.preset.id}`) ? t(`presets.${props.preset.id}`) : props.preset.title));
const busy = computed(() => store.exportingPresetId === props.preset.id);

const zoomFactor = computed(() => {
  if (!state.value || !store.sourceSize) return 1;
  return state.value.scale / minScale(store.sourceSize, props.preset);
});

function zoneLabel(labelKey: string, fallback: string): string {
  return te(labelKey) ? t(labelKey) : fallback;
}

function scheduleDraw(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

function draw(): void {
  const el = canvas.value;
  if (!el || cssWidth.value === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const W = props.preset.width;
  const H = props.preset.height;
  const pxW = Math.round(cssWidth.value * dpr);
  const pxH = Math.round(cssWidth.value * aspect.value * dpr);
  if (el.width !== pxW || el.height !== pxH) {
    el.width = pxW;
    el.height = pxH;
  }

  const ctx = el.getContext('2d');
  if (!ctx) return;

  // k: пикселей устройства на 1 пиксель целевого кадра
  const k = pxW / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pxW, pxH);
  ctx.setTransform(k, 0, 0, k, 0, 0);

  ctx.fillStyle = '#181c25';
  ctx.fillRect(0, 0, W, H);

  const src = store.source;
  if (src && state.value && store.sourceSize) {
    const rect = computeDrawRect(store.sourceSize, props.preset, state.value);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height);
  }

  if (!store.showSafeZones) return;

  const unit = dpr / k; // 1 CSS-пиксель в координатах кадра
  drawRoundedCornersMask(ctx, W, H, unit);

  ctx.font = `600 ${11 * unit}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  for (const zone of props.preset.safeZones) {
    const x = zone.x * W;
    const y = zone.y * H;
    const w = zone.width * W;
    const h = zone.height * H;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([4 * unit, 3 * unit]);
    ctx.lineWidth = 1 * unit;
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
    ctx.strokeRect(x + unit / 2, y + unit / 2, w - unit, h - unit);
    ctx.setLineDash([]);

    const label = zoneLabel(zone.labelKey, zone.label);
    const pad = 4 * unit;
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(127, 29, 29, 0.85)';
    ctx.fillRect(x + pad, y + pad, textW + pad * 2, 11 * unit + pad * 1.5);
    ctx.fillStyle = '#fee2e2';
    ctx.fillText(label, x + pad * 2, y + pad * 1.6);
  }
}

function drawRoundedCornersMask(ctx: CanvasRenderingContext2D, W: number, H: number, unit: number): void {
  const pct = props.preset.borderRadiusPct;
  if (!pct) return;
  const r = (pct / 100) * Math.min(W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.roundRect(0, 0, W, H, r);
  ctx.fillStyle = 'rgba(11, 13, 18, 0.7)';
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.roundRect(unit, unit, W - 2 * unit, H - 2 * unit, r);
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.lineWidth = 1.5 * unit;
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
  ctx.stroke();
  ctx.restore();
}

// ----------------------------- Взаимодействие -----------------------------

function toTarget(cssDelta: number): number {
  return cssDelta * (props.preset.width / cssWidth.value);
}

function onPointerDown(event: PointerEvent): void {
  if (!store.source) return;
  dragPointer = event.pointerId;
  lastPoint = { x: event.clientX, y: event.clientY };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (dragPointer !== event.pointerId) return;
  const dx = event.clientX - lastPoint.x;
  const dy = event.clientY - lastPoint.y;
  lastPoint = { x: event.clientX, y: event.clientY };
  store.pan(props.preset.id, toTarget(dx), toTarget(dy));
}

function onPointerUp(event: PointerEvent): void {
  if (dragPointer === event.pointerId) dragPointer = null;
}

function onWheel(event: WheelEvent): void {
  if (!store.source) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const anchor = { x: toTarget(event.clientX - rect.left), y: toTarget(event.clientY - rect.top) };
  const factor = Math.exp(-event.deltaY * 0.0015);
  store.zoom(props.preset.id, factor, anchor);
}

function onZoomInput(event: Event): void {
  if (!store.sourceSize) return;
  const value = Number((event.target as HTMLInputElement).value);
  store.setScale(props.preset.id, value * minScale(store.sourceSize, props.preset));
}

function onFormat(event: Event): void {
  store.setFormat(props.preset.id, (event.target as HTMLSelectElement).value as ExportFormat);
}

// ----------------------------- Жизненный цикл -----------------------------

watch(
  () => [store.source, state.value, store.showSafeZones, cssWidth.value, locale.value],
  scheduleDraw,
  { deep: true },
);

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width > 0) cssWidth.value = width;
  });
  if (wrapper.value) resizeObserver.observe(wrapper.value);
  scheduleDraw();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <article class="panel flex flex-col overflow-hidden">
    <header class="flex items-start justify-between gap-2 border-b border-surface-700 px-3 py-2">
      <div class="min-w-0">
        <h3 class="truncate text-sm font-medium text-zinc-100" :title="title">{{ title }}</h3>
        <p class="font-mono text-xs text-zinc-500">
          {{ preset.width }}×{{ preset.height }} · {{ t('card.limit', { kb: preset.maxSizeKb }) }}
          <template v-if="preset.borderRadiusPct"> · {{ t('card.rounded', { pct: preset.borderRadiusPct }) }}</template>
        </p>
      </div>
      <button
        type="button"
        class="rounded p-1 text-zinc-500 hover:bg-surface-700 hover:text-zinc-200 disabled:opacity-40"
        :title="t('card.reset')"
        :disabled="!store.source"
        @click="store.resetPreset(preset.id)"
      >
        <RotateCcw class="h-4 w-4" />
      </button>
    </header>

    <div ref="wrapper" class="relative bg-surface-950 p-0">
      <canvas
        ref="canvas"
        class="block w-full touch-none select-none"
        :class="store.source ? 'cursor-grab active:cursor-grabbing' : ''"
        :style="{ aspectRatio: `${preset.width} / ${preset.height}` }"
        :title="store.source ? t('card.dragHint') : ''"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      />
    </div>

    <div class="mt-auto space-y-2 px-3 py-2 text-xs">
      <label class="flex items-center gap-2 text-zinc-400">
        <span class="w-16 shrink-0">{{ t('card.zoom') }}</span>
        <input
          type="range"
          class="w-full accent-sky-500"
          min="1"
          :max="MAX_ZOOM_FACTOR"
          step="0.01"
          :value="zoomFactor"
          :disabled="!store.source"
          @input="onZoomInput"
        />
        <span class="w-12 text-right font-mono">{{ zoomFactor.toFixed(2) }}×</span>
      </label>

      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-zinc-400">
          {{ t('card.format') }}
          <select
            class="rounded border border-surface-600 bg-surface-800 px-2 py-1 font-mono uppercase text-zinc-200"
            :value="state?.format ?? preset.formats[0]"
            :disabled="!store.source"
            @change="onFormat"
          >
            <option v-for="format in preset.formats" :key="format" :value="format">{{ format }}</option>
          </select>
        </label>

        <button
          type="button"
          class="btn-ghost ml-auto"
          :disabled="!store.source || store.exporting"
          @click="store.exportSingle(preset.id)"
        >
          <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
          <Download v-else class="h-4 w-4" />
          {{ store.isPro ? t('card.download') : t('card.downloadFree') }}
        </button>
      </div>

      <div v-if="report" class="flex items-center gap-1.5" :class="report.withinBudget ? 'text-emerald-400' : 'text-amber-400'">
        <CircleCheck v-if="report.withinBudget" class="h-3.5 w-3.5" />
        <TriangleAlert v-else class="h-3.5 w-3.5" />
        <span class="font-mono">
          <template v-if="report.format === 'png'">
            {{ report.quantized ? t('card.resultPng8', { size: formatBytes(report.bytes) }) : t('card.resultPng', { size: formatBytes(report.bytes) }) }}
          </template>
          <template v-else>{{ t('card.result', { size: formatBytes(report.bytes), quality: report.quality ?? '' }) }}</template>
        </span>
        <span v-if="!report.withinBudget">— {{ t('card.overBudget') }}</span>
      </div>
    </div>
  </article>
</template>
