/**
 * Контракты Worker-а, тарифов и пресетов.
 * Все сообщения между Vue и promoProcessor.worker.ts — строго через discriminated unions.
 */

export type ExportFormat = 'webp' | 'png' | 'jpg';

/** Трансформация мастер-арта внутри пресета: масштаб s ≥ s_min и смещение центра (Δx, Δy) в пикселях цели. */
export interface CropTransform {
  scale: number;
  dx: number;
  dy: number;
}

export interface PresetState extends CropTransform {
  format: ExportFormat;
}

export interface Size {
  width: number;
  height: number;
}

/** Одна позиция экспорта, передаваемая в воркер. */
export interface ExportItem {
  presetId: string;
  fileName: string;
  width: number;
  height: number;
  maxSizeKb: number;
  format: ExportFormat;
  transform: CropTransform;
}

/** Конфигурация, подписанная сервером (GET /api/license/export-config). */
export interface ExportConfig {
  v: number;
  sub: number;
  watermark: boolean;
  batchZip: boolean;
  iat: number;
  exp: number;
}

export type ExportLicense =
  | { tier: 'free' }
  | { tier: 'pro'; token: string; publicKey: string };

export type ExportMode = 'single' | 'zip';

export interface CompressionReport {
  presetId: string;
  fileName: string;
  format: ExportFormat;
  bytes: number;
  maxBytes: number;
  withinBudget: boolean;
  /** Итоговое качество 0–100 для WebP/JPG. */
  quality?: number;
  /** PNG был квантован до 8-bit палитры (256 цветов). */
  quantized?: boolean;
  attempts: number;
  watermarked: boolean;
}

// ----------------------------- Worker protocol -----------------------------

export type PromoWorkerRequest =
  | {
      type: 'export';
      jobId: string;
      /** Мастер-арт, переданный через transfer: [source]. Воркер закрывает его после рендера. */
      source: ImageBitmap;
      items: ExportItem[];
      mode: ExportMode;
      license: ExportLicense;
      watermarkText: string;
      archiveName?: string;
    };

export type WorkerErrorCode =
  | 'license_required'
  | 'license_invalid'
  | 'license_expired'
  | 'bad_request'
  | 'render_failed'
  | 'encode_failed';

export type PromoWorkerResponse =
  | { type: 'progress'; jobId: string; done: number; total: number; presetId: string }
  | { type: 'file'; jobId: string; fileName: string; mime: string; buffer: ArrayBuffer; report: CompressionReport }
  | { type: 'zip'; jobId: string; fileName: string; buffer: ArrayBuffer; reports: CompressionReport[] }
  | { type: 'error'; jobId: string; code: WorkerErrorCode; message: string };

export type PromoWorkerResult = Extract<PromoWorkerResponse, { type: 'file' | 'zip' }>;

// ----------------------------- Billing / License -----------------------------

export type PlanId = 'pass_48h' | 'pro_30d' | 'pro_365d';

export interface BillingPlan {
  id: PlanId;
  amount_rub: number;
  duration_ms: number;
}

export interface LicenseStatus {
  id: number;
  provider: 'telegram' | 'yandex' | 'dev';
  username: string | null;
  pro_until: number;
  is_pro: boolean;
  server_time: number;
}

export interface CreateSbpResponse {
  payment_id: string;
  plan_id: PlanId;
  amount_rub: number;
  status: PaymentStatus;
  qr_payload: string | null;
  confirmation_url: string | null;
}

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled';

export interface PaymentStatusResponse {
  payment_id: string;
  status: PaymentStatus;
  license: LicenseStatus;
}

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/** Данные, переданные Blade-шаблоном в data-boot. */
export interface BootConfig {
  locale: 'ru' | 'en';
  platformFilter: string;
  telegramBot: string | null;
  yandexClientId: string | null;
  yandexRedirectUri: string | null;
  exportPublicKey: string;
  devLogin: boolean;
  domain: string;
}
