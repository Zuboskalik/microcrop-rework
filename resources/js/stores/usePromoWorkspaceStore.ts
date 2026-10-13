import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import { PROMO_PRESETS, filterPresets, findPreset, type PlatformFilter, type PromoPreset } from '../shared/presets';
import type {
  BootConfig,
  CompressionReport,
  CropTransform,
  ExportFormat,
  ExportItem,
  ExportLicense,
  LicenseStatus,
  PresetState,
  Size,
  TelegramAuthData,
} from '../shared/types';
import { api, ApiError, loadToken, saveToken } from '../shared/api';
import { PromoWorkerClient, WorkerJobError, downloadBuffer } from '../shared/workerClient';
import { clampTransform, defaultTransform, panBy, zoomAt } from '../workers/algorithms/cropAndRender';

/**
 * Pinia-стор воркспейса: мастер-исходник (ImageBitmap), трансформации каждого пресета,
 * статус лицензии и экспорт через Web Worker.
 */
export const usePromoWorkspaceStore = defineStore('promoWorkspace', () => {
  // ----------------------------- Boot -----------------------------
  const boot = ref<BootConfig>({
    locale: 'ru',
    platformFilter: 'yandex_games',
    telegramBot: null,
    yandexClientId: null,
    yandexRedirectUri: null,
    exportPublicKey: '',
    devLogin: false,
    domain: 'microcrop.ru',
  });

  // ----------------------------- Источник -----------------------------
  /** ImageBitmap не делаем глубоко реактивным: Proxy поверх него ломает drawImage/transfer. */
  const source = shallowRef<ImageBitmap | null>(null);
  const sourceFile = shallowRef<File | null>(null);
  const sourceSize = computed<Size | null>(() =>
    source.value ? { width: source.value.width, height: source.value.height } : null,
  );

  // ----------------------------- Пресеты -----------------------------
  const platformFilter = ref<PlatformFilter>('yandex_games');
  const region = ref<'ru' | 'global'>('ru');
  const showSafeZones = ref(true);
  const presetStates = reactive<Record<string, PresetState>>({});
  const reports = reactive<Record<string, CompressionReport | undefined>>({});

  const visiblePresets = computed<PromoPreset[]>(() => filterPresets(platformFilter.value, region.value));

  // ----------------------------- Лицензия -----------------------------
  const authToken = ref<string | null>(loadToken());
  const license = ref<LicenseStatus | null>(null);
  const isAuthenticated = computed(() => authToken.value !== null && license.value !== null);
  const isPro = computed(() => license.value !== null && license.value.pro_until > Date.now());

  // ----------------------------- Экспорт -----------------------------
  const exporting = ref(false);
  const exportingPresetId = ref<string | null>(null);
  const progress = ref<{ done: number; total: number } | null>(null);
  const lastError = ref<string | null>(null);
  const worker = new PromoWorkerClient();

  function init(config: BootConfig): void {
    boot.value = config;
    region.value = config.locale === 'ru' ? 'ru' : 'global';
    setPlatformFilter(config.platformFilter);
  }

  function setPlatformFilter(value: string): void {
    const allowed: PlatformFilter[] = ['all', 'yandex_games', 'telegram', 'vk_play', 'rustore'];
    platformFilter.value = (allowed as string[]).includes(value) ? (value as PlatformFilter) : 'all';
  }

  async function setSource(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    source.value?.close();
    source.value = bitmap;
    sourceFile.value = file;

    for (const preset of PROMO_PRESETS) {
      resetPreset(preset.id, presetStates[preset.id]?.format ?? preset.formats[0]!);
      reports[preset.id] = undefined;
    }
  }

  function clearSource(): void {
    source.value?.close();
    source.value = null;
    sourceFile.value = null;
  }

  function targetOf(preset: PromoPreset): Size {
    return { width: preset.width, height: preset.height };
  }

  function resetPreset(presetId: string, format?: ExportFormat): void {
    const preset = findPreset(presetId);
    if (!preset || !sourceSize.value) return;
    presetStates[presetId] = {
      ...defaultTransform(sourceSize.value, targetOf(preset)),
      format: format ?? presetStates[presetId]?.format ?? preset.formats[0]!,
    };
    reports[presetId] = undefined;
  }

  function applyTransform(presetId: string, next: (t: CropTransform, src: Size, target: Size) => CropTransform): void {
    const preset = findPreset(presetId);
    const state = presetStates[presetId];
    if (!preset || !state || !sourceSize.value) return;
    const t = next(state, sourceSize.value, targetOf(preset));
    presetStates[presetId] = { ...state, ...t };
    reports[presetId] = undefined;
  }

  function pan(presetId: string, deltaX: number, deltaY: number): void {
    applyTransform(presetId, (t, src, target) => panBy(t, deltaX, deltaY, src, target));
  }

  function zoom(presetId: string, factor: number, anchor: { x: number; y: number }): void {
    applyTransform(presetId, (t, src, target) => zoomAt(t, factor, anchor, src, target));
  }

  function setScale(presetId: string, scale: number): void {
    applyTransform(presetId, (t, src, target) => {
      const anchor = { x: target.width / 2, y: target.height / 2 };
      return zoomAt(t, scale / t.scale, anchor, src, target);
    });
  }

  function setFormat(presetId: string, format: ExportFormat): void {
    const state = presetStates[presetId];
    if (!state) return;
    presetStates[presetId] = { ...state, format };
    reports[presetId] = undefined;
  }

  function exportItem(preset: PromoPreset): ExportItem {
    const state = presetStates[preset.id]!;
    const transform = clampTransform(state, sourceSize.value!, targetOf(preset));
    return {
      presetId: preset.id,
      fileName: preset.fileName,
      width: preset.width,
      height: preset.height,
      maxSizeKb: preset.maxSizeKb,
      format: state.format,
      transform: { scale: transform.scale, dx: transform.dx, dy: transform.dy },
    };
  }

  /**
   * Свежий ImageBitmap для воркера: он будет передан через transfer и закрыт внутри воркера,
   * а превью продолжит пользоваться своим экземпляром.
   */
  async function bitmapForWorker(): Promise<ImageBitmap> {
    if (!source.value) throw new Error('No source');
    return createImageBitmap(source.value);
  }

  async function exportLicense(): Promise<ExportLicense> {
    if (!isPro.value || !authToken.value) return { tier: 'free' };
    const { token } = await api.exportConfig(authToken.value);
    return { tier: 'pro', token, publicKey: boot.value.exportPublicKey };
  }

  async function exportSingle(presetId: string): Promise<void> {
    const preset = findPreset(presetId);
    if (!preset || !source.value || exporting.value) return;

    await runExport(async () => {
      exportingPresetId.value = presetId;
      const result = await worker.run({
        source: await bitmapForWorker(),
        items: [exportItem(preset)],
        mode: 'single',
        license: await exportLicense(),
        watermarkText: boot.value.domain,
      });
      if (result.type === 'file') {
        reports[presetId] = result.report;
        downloadBuffer(result.buffer, result.fileName, result.mime);
      }
    });
  }

  async function exportZip(): Promise<void> {
    if (!source.value || exporting.value) return;
    const presets = visiblePresets.value;
    if (presets.length === 0) return;

    await runExport(async () => {
      const result = await worker.run(
        {
          source: await bitmapForWorker(),
          items: presets.map(exportItem),
          mode: 'zip',
          license: await exportLicense(),
          watermarkText: boot.value.domain,
          archiveName: `microcrop_${platformFilter.value}.zip`,
        },
        (done, total) => (progress.value = { done, total }),
      );
      if (result.type === 'zip') {
        for (const report of result.reports) reports[report.presetId] = report;
        downloadBuffer(result.buffer, result.fileName, 'application/zip');
      }
    });
  }

  async function runExport(job: () => Promise<void>): Promise<void> {
    exporting.value = true;
    lastError.value = null;
    progress.value = null;
    try {
      await job();
    } catch (e) {
      if (e instanceof WorkerJobError) lastError.value = `export.errors.${e.code}`;
      else if (e instanceof ApiError && e.status === 402) lastError.value = 'export.errors.license_required';
      else if (e instanceof ApiError) lastError.value = 'export.errors.network';
      else lastError.value = 'export.errors.render_failed';
      console.error(e);
    } finally {
      exporting.value = false;
      exportingPresetId.value = null;
      progress.value = null;
    }
  }

  // ----------------------------- Авторизация -----------------------------

  function setSession(token: string | null, status: LicenseStatus | null): void {
    authToken.value = token;
    license.value = status;
    saveToken(token);
  }

  async function refreshLicense(): Promise<void> {
    if (!authToken.value) return;
    try {
      license.value = await api.licenseStatus(authToken.value);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession(null, null);
      else throw e;
    }
  }

  async function loginTelegram(data: TelegramAuthData): Promise<void> {
    const r = await api.authTelegram(data);
    setSession(r.token, r.user);
  }

  async function loginYandex(code: string): Promise<void> {
    const r = await api.authYandex(code);
    setSession(r.token, r.user);
  }

  async function loginDev(username = 'dev'): Promise<void> {
    const r = await api.authDev(username);
    setSession(r.token, r.user);
  }

  async function logout(): Promise<void> {
    const token = authToken.value;
    setSession(null, null);
    if (token) await api.logout(token).catch(() => undefined);
  }

  function applyLicense(status: LicenseStatus): void {
    license.value = status;
  }

  function dispose(): void {
    worker.terminate();
    clearSource();
  }

  return {
    boot,
    source,
    sourceFile,
    sourceSize,
    platformFilter,
    region,
    showSafeZones,
    presetStates,
    reports,
    visiblePresets,
    authToken,
    license,
    isAuthenticated,
    isPro,
    exporting,
    exportingPresetId,
    progress,
    lastError,
    init,
    setPlatformFilter,
    setSource,
    clearSource,
    resetPreset,
    pan,
    zoom,
    setScale,
    setFormat,
    exportSingle,
    exportZip,
    refreshLicense,
    loginTelegram,
    loginYandex,
    loginDev,
    logout,
    applyLicense,
    dispose,
  };
});
