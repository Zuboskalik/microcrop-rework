<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ImageUp, RefreshCw } from 'lucide-vue-next';
import { usePromoWorkspaceStore } from '../../stores/usePromoWorkspaceStore';

const store = usePromoWorkspaceStore();
const { t } = useI18n();

const input = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const error = ref<string | null>(null);
const loading = ref(false);
const thumbUrl = ref<string | null>(null);

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const RECOMMENDED_MIN = 1080;

const lowRes = computed(() => {
  const size = store.sourceSize;
  return size !== null && Math.min(size.width, size.height) < RECOMMENDED_MIN;
});

// Каждый ObjectURL обязательно освобождается перед заменой и при размонтировании.
watch(
  () => store.sourceFile,
  (file) => {
    if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
    thumbUrl.value = file ? URL.createObjectURL(file) : null;
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
});

async function accept(file: File | undefined): Promise<void> {
  if (!file) return;
  error.value = null;
  if (file.type && !ACCEPT.includes(file.type)) {
    error.value = t('dropzone.invalid');
    return;
  }
  loading.value = true;
  try {
    await store.setSource(file);
  } catch {
    error.value = t('dropzone.invalid');
  } finally {
    loading.value = false;
  }
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  void accept(event.dataTransfer?.files?.[0]);
}

function onChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  void accept(target.files?.[0]);
  target.value = '';
}
</script>

<template>
  <div>
    <input ref="input" type="file" class="hidden" :accept="ACCEPT.join(',')" @change="onChange" />

    <!-- Компактный вид, когда арт уже загружен -->
    <div
      v-if="store.source"
      class="panel flex items-center gap-3 p-2"
      :class="dragging ? 'border-accent-500' : ''"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <img v-if="thumbUrl" :src="thumbUrl" alt="" class="h-12 w-12 rounded object-cover" />
      <div class="min-w-0 flex-1 text-sm">
        <div class="truncate text-zinc-200">{{ store.sourceFile?.name }}</div>
        <div class="font-mono text-xs text-zinc-500">
          {{ store.sourceSize?.width }}×{{ store.sourceSize?.height }} px
        </div>
        <div v-if="lowRes" class="text-xs text-amber-400">{{ t('dropzone.lowRes', { size: RECOMMENDED_MIN }) }}</div>
      </div>
      <button type="button" class="btn-ghost" :disabled="loading" @click="input?.click()">
        <RefreshCw class="h-4 w-4" />
        {{ t('dropzone.replace') }}
      </button>
    </div>

    <!-- Большая зона загрузки -->
    <button
      v-else
      type="button"
      class="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors"
      :class="
        dragging
          ? 'border-accent-500 bg-accent-600/10'
          : 'border-surface-600 bg-surface-900 hover:border-surface-600 hover:bg-surface-800'
      "
      :disabled="loading"
      @click="input?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <ImageUp class="h-10 w-10 text-accent-400" />
      <span class="text-lg font-medium text-zinc-100">{{ t('dropzone.title') }}</span>
      <span class="max-w-md text-sm text-zinc-500">{{ t('dropzone.hint') }}</span>
    </button>

    <p v-if="error" class="mt-2 text-sm text-red-400">{{ error }}</p>
  </div>
</template>
