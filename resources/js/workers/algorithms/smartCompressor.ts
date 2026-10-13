import UPNG from 'upng-js';
import type { ExportFormat } from '../../shared/types';

/**
 * Алгоритм 2: Smart Byte-Budgeting — авто-подгон веса файла под maxSizeKb площадки.
 *
 * WebP: Q = 92, при S > maxSizeKb·1024 снижаем Q с шагом 7 до Q_min = 50.
 * PNG:  сначала 24/32-bit PNG; если не влезает — квантование палитры (256 цветов, 8-bit) через upng-js.
 * JPG:  та же лестница качества, что и для WebP (нативный JPEG-кодировщик OffscreenCanvas).
 */

export const QUALITY_START = 92;
export const QUALITY_STEP = 7;
export const QUALITY_MIN = 50;
export const PNG_PALETTE_COLORS = 256;

/** [92, 85, 78, 71, 64, 57, 50] */
export function qualityLadder(start = QUALITY_START, step = QUALITY_STEP, min = QUALITY_MIN): number[] {
  const ladder: number[] = [];
  for (let q = start; q > min; q -= step) ladder.push(q);
  ladder.push(min);
  return ladder;
}

export function budgetBytes(maxSizeKb: number): number {
  return maxSizeKb * 1024;
}

/**
 * Набор кодировщиков. Абстрагирован, чтобы алгоритм подбора тестировался без WASM и OffscreenCanvas.
 * F — представление кадра (в воркере это OffscreenCanvas).
 */
export interface FrameEncoders<F> {
  webp(frame: F, quality: number): Promise<ArrayBuffer>;
  jpg(frame: F, quality: number): Promise<ArrayBuffer>;
  /** Полноцветный 24/32-bit PNG без потерь. */
  png(frame: F): Promise<ArrayBuffer>;
  /** 8-bit PNG с палитрой из `colors` цветов. */
  pngQuantized(frame: F, colors: number): Promise<ArrayBuffer>;
}

export interface CompressionResult {
  buffer: ArrayBuffer;
  bytes: number;
  maxBytes: number;
  withinBudget: boolean;
  quality?: number;
  quantized?: boolean;
  attempts: number;
}

export async function compressToBudget<F>(
  frame: F,
  format: ExportFormat,
  maxSizeKb: number,
  encoders: FrameEncoders<F>,
): Promise<CompressionResult> {
  const maxBytes = budgetBytes(maxSizeKb);

  if (format === 'png') {
    const full = await encoders.png(frame);
    if (full.byteLength <= maxBytes) {
      return { buffer: full, bytes: full.byteLength, maxBytes, withinBudget: true, quantized: false, attempts: 1 };
    }

    const quantized = await encoders.pngQuantized(frame, PNG_PALETTE_COLORS);
    // Если палитра почему-то не помогла (например, крошечная картинка), отдаем меньший из вариантов.
    const best = quantized.byteLength < full.byteLength ? quantized : full;

    return {
      buffer: best,
      bytes: best.byteLength,
      maxBytes,
      withinBudget: best.byteLength <= maxBytes,
      quantized: best === quantized,
      attempts: 2,
    };
  }

  const encode = format === 'webp' ? encoders.webp : encoders.jpg;
  let attempts = 0;
  let last: { buffer: ArrayBuffer; quality: number } | null = null;

  for (const quality of qualityLadder()) {
    attempts++;
    const buffer = await encode.call(encoders, frame, quality);
    last = { buffer, quality };
    if (buffer.byteLength <= maxBytes) {
      return { buffer, bytes: buffer.byteLength, maxBytes, withinBudget: true, quality, attempts };
    }
  }

  // Q_min достигнут, но лимит не выполнен — возвращаем самый легкий вариант с флагом.
  const result = last!;
  return {
    buffer: result.buffer,
    bytes: result.buffer.byteLength,
    maxBytes,
    withinBudget: false,
    quality: result.quality,
    attempts,
  };
}

export function mimeFor(format: ExportFormat): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
  }
}

export function extensionFor(format: ExportFormat): string {
  return format;
}

/** 8-bit PNG из RGBA-буфера (квантование палитры до `colors` цветов). */
export function encodePngQuantizedRgba(rgba: ArrayBuffer, width: number, height: number, colors = PNG_PALETTE_COLORS): ArrayBuffer {
  return UPNG.encode([rgba], width, height, colors);
}

// ----------------------------- Кодировщики для воркера -----------------------------

type WebpEncode = (data: ImageData, options?: { quality?: number }) => Promise<ArrayBuffer>;
let webpEncoder: Promise<WebpEncode> | null = null;

function loadWebpEncoder(): Promise<WebpEncode> {
  // WASM-модуль подгружается лениво при первом экспорте в WebP.
  webpEncoder ??= import('@jsquash/webp/encode').then((m) => m.default as WebpEncode);
  return webpEncoder;
}

function readPixels(canvas: OffscreenCanvas): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context is not available');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function blobToBuffer(canvas: OffscreenCanvas, type: string, quality?: number): Promise<ArrayBuffer> {
  const blob = await canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  if (blob.type !== type) {
    throw new Error(`Browser cannot encode ${type}`);
  }
  return blob.arrayBuffer();
}

export const offscreenCanvasEncoders: FrameEncoders<OffscreenCanvas> = {
  async webp(canvas, quality) {
    const encode = await loadWebpEncoder();
    return encode(readPixels(canvas), { quality });
  },
  jpg(canvas, quality) {
    return blobToBuffer(canvas, 'image/jpeg', quality / 100);
  },
  png(canvas) {
    return blobToBuffer(canvas, 'image/png');
  },
  async pngQuantized(canvas, colors) {
    const pixels = readPixels(canvas);
    const rgba = pixels.data.buffer.slice(pixels.data.byteOffset, pixels.data.byteOffset + pixels.data.byteLength);
    return encodePngQuantizedRgba(rgba, canvas.width, canvas.height, colors);
  },
};
