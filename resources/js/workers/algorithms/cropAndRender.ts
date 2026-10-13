import type { CropTransform, ExportFormat, Size } from '../../shared/types';

/**
 * Алгоритм 1: интерактивное кадрирование и проекция координат.
 *
 * s_min = max(W_t / W_src, H_t / H_src)            — режим cover без пустых полей
 * X_draw = round((W_t − W_src·s) / 2 + Δx)
 * Y_draw = round((H_t − H_src·s) / 2 + Δy)
 *
 * Safe Zones и рамка скругления НИКОГДА не рисуются здесь — только в PresetCardCanvas.vue.
 */

export interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Максимальное приближение относительно s_min, доступное в UI. */
export const MAX_ZOOM_FACTOR = 8;

export function minScale(src: Size, target: Size): number {
  return Math.max(target.width / src.width, target.height / src.height);
}

export function defaultTransform(src: Size, target: Size): CropTransform {
  return { scale: minScale(src, target), dx: 0, dy: 0 };
}

/**
 * Ограничивает масштаб диапазоном [s_min, s_min·MAX_ZOOM_FACTOR], а смещение — так,
 * чтобы изображение всегда полностью покрывало холст (без пустых полей).
 */
export function clampTransform(t: CropTransform, src: Size, target: Size): CropTransform {
  const sMin = minScale(src, target);
  const scale = Math.min(Math.max(t.scale, sMin), sMin * MAX_ZOOM_FACTOR);
  const maxDx = Math.max(0, (src.width * scale - target.width) / 2);
  const maxDy = Math.max(0, (src.height * scale - target.height) / 2);

  return {
    scale,
    dx: clamp(t.dx, -maxDx, maxDx),
    dy: clamp(t.dy, -maxDy, maxDy),
  };
}

export function computeDrawRect(src: Size, target: Size, t: CropTransform): DrawRect {
  const width = src.width * t.scale;
  const height = src.height * t.scale;

  return {
    x: Math.round((target.width - width) / 2 + t.dx),
    y: Math.round((target.height - height) / 2 + t.dy),
    width,
    height,
  };
}

/**
 * Зум колесом мыши относительно точки-якоря (в координатах цели):
 * пиксель исходника под курсором остается на месте.
 */
export function zoomAt(t: CropTransform, factor: number, anchor: { x: number; y: number }, src: Size, target: Size): CropTransform {
  const sMin = minScale(src, target);
  const newScale = Math.min(Math.max(t.scale * factor, sMin), sMin * MAX_ZOOM_FACTOR);

  const x0 = (target.width - src.width * t.scale) / 2 + t.dx;
  const y0 = (target.height - src.height * t.scale) / 2 + t.dy;
  const u = (anchor.x - x0) / t.scale;
  const v = (anchor.y - y0) / t.scale;

  const x1 = anchor.x - u * newScale;
  const y1 = anchor.y - v * newScale;

  return clampTransform(
    {
      scale: newScale,
      dx: x1 - (target.width - src.width * newScale) / 2,
      dy: y1 - (target.height - src.height * newScale) / 2,
    },
    src,
    target,
  );
}

export function panBy(t: CropTransform, deltaX: number, deltaY: number, src: Size, target: Size): CropTransform {
  return clampTransform({ scale: t.scale, dx: t.dx + deltaX, dy: t.dy + deltaY }, src, target);
}

// ----------------------------- Водяной знак (Free) -----------------------------

export interface WatermarkLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fontSize: number;
  textX: number;
  textY: number;
}

/**
 * Геометрия плашки «microcrop.ru» в правом нижнем углу.
 * Размер шрифта пропорционален короткой стороне кадра (min 11px).
 */
export function watermarkLayout(target: Size, text: string): WatermarkLayout {
  const short = Math.min(target.width, target.height);
  const fontSize = Math.max(11, Math.round(short * 0.045));
  const padX = Math.round(fontSize * 0.6);
  const padY = Math.round(fontSize * 0.35);
  // Оценка ширины текста без измерения (воркер может не иметь шрифтов): ~0.58em на символ.
  const textWidth = Math.ceil(text.length * fontSize * 0.58);
  const width = textWidth + padX * 2;
  const height = fontSize + padY * 2;
  const margin = Math.max(4, Math.round(short * 0.025));
  const x = target.width - width - margin;
  const y = target.height - height - margin;

  return {
    x,
    y,
    width,
    height,
    radius: Math.round(height / 2),
    fontSize,
    textX: x + width / 2,
    textY: y + height / 2,
  };
}

export type Render2DContext = Pick<
  OffscreenCanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'moveTo'
  | 'arcTo'
  | 'closePath'
  | 'fill'
  | 'fillText'
  | 'fillRect'
  | 'drawImage'
  | 'globalAlpha'
  | 'fillStyle'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'imageSmoothingEnabled'
  | 'imageSmoothingQuality'
>;

export function drawWatermark(ctx: Render2DContext, target: Size, text: string): WatermarkLayout {
  const l = watermarkLayout(target, text);

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#0b0d12';
  roundRectPath(ctx, l.x, l.y, l.width, l.height, l.radius);
  ctx.fill();

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${l.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, l.textX, l.textY);
  ctx.restore();

  return l;
}

function roundRectPath(ctx: Render2DContext, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// ----------------------------- Рендер кадра -----------------------------

export interface RenderOptions {
  format: ExportFormat;
  watermark: boolean;
  watermarkText: string;
}

/**
 * Рисует кадр пресета на контексте целевого размера.
 * Отделено от создания OffscreenCanvas, чтобы логику можно было тестировать с фейковым контекстом.
 */
export function renderFrame(
  ctx: Render2DContext,
  source: CanvasImageSource,
  src: Size,
  target: Size,
  transform: CropTransform,
  options: RenderOptions,
): DrawRect {
  const t = clampTransform(transform, src, target);
  const rect = computeDrawRect(src, target, t);

  if (options.format === 'jpg') {
    // JPEG не поддерживает прозрачность: подложка вместо черного фона по умолчанию.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);

  if (options.watermark) {
    drawWatermark(ctx, target, options.watermarkText);
  }

  return rect;
}

/**
 * Создает OffscreenCanvas целевого размера и рендерит в него кадр (только внутри воркера).
 */
export function renderPreset(
  source: ImageBitmap,
  target: Size,
  transform: CropTransform,
  options: RenderOptions,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext('2d', { alpha: options.format !== 'jpg' });
  if (!ctx) {
    throw new Error('OffscreenCanvas 2D context is not available');
  }

  renderFrame(ctx, source, { width: source.width, height: source.height }, target, transform, options);

  return canvas;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
