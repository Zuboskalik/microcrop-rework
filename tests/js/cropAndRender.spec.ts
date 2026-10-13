import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ZOOM_FACTOR,
  clampTransform,
  computeDrawRect,
  defaultTransform,
  minScale,
  panBy,
  renderFrame,
  watermarkLayout,
  zoomAt,
  type Render2DContext,
} from '@/workers/algorithms/cropAndRender';

const src = { width: 2000, height: 1000 };
const icon = { width: 512, height: 512 };
const cover = { width: 800, height: 470 };

describe('minScale (cover)', () => {
  it('uses the max of axis ratios so there are no empty fields', () => {
    expect(minScale(src, icon)).toBeCloseTo(512 / 1000);
    expect(minScale(src, cover)).toBeCloseTo(Math.max(800 / 2000, 470 / 1000));
  });

  it('supports upscaling of small sources', () => {
    expect(minScale({ width: 100, height: 100 }, icon)).toBeCloseTo(5.12);
  });
});

describe('computeDrawRect', () => {
  it('centers the image with zero offset (formula from spec)', () => {
    const t = defaultTransform(src, icon);
    const r = computeDrawRect(src, icon, t);
    // X = round((512 − 2000·0.512)/2 + 0) = round(−256) = −256
    expect(r.x).toBe(Math.round((512 - 2000 * t.scale) / 2));
    expect(r.y).toBe(0);
    expect(r.width).toBeCloseTo(1024);
    expect(r.height).toBeCloseTo(512);
  });

  it('applies Δx / Δy and rounds coordinates', () => {
    const r = computeDrawRect(src, icon, { scale: 0.512, dx: 10.4, dy: -3.6 });
    expect(r.x).toBe(Math.round(-256 + 10.4));
    expect(r.y).toBe(Math.round(0 - 3.6));
  });
});

describe('clampTransform', () => {
  it('never allows scale below s_min or above the zoom cap', () => {
    const sMin = minScale(src, icon);
    expect(clampTransform({ scale: 0.01, dx: 0, dy: 0 }, src, icon).scale).toBeCloseTo(sMin);
    expect(clampTransform({ scale: 999, dx: 0, dy: 0 }, src, icon).scale).toBeCloseTo(sMin * MAX_ZOOM_FACTOR);
  });

  it('keeps the canvas fully covered', () => {
    const t = clampTransform({ scale: 0.512, dx: 10_000, dy: 10_000 }, src, icon);
    const r = computeDrawRect(src, icon, t);
    expect(r.x).toBeLessThanOrEqual(0);
    expect(r.y).toBeLessThanOrEqual(0);
    expect(r.x + r.width).toBeGreaterThanOrEqual(icon.width - 0.5);
    expect(r.y + r.height).toBeGreaterThanOrEqual(icon.height - 0.5);
  });
});

describe('zoomAt / panBy', () => {
  it('keeps the source pixel under the anchor in place', () => {
    const t0 = { scale: 1, dx: 0, dy: 0 };
    const anchor = { x: 300, y: 200 };
    const t1 = zoomAt(t0, 1.5, anchor, src, cover);
    const before = computeDrawRect(src, cover, t0);
    const after = computeDrawRect(src, cover, t1);
    const u0 = (anchor.x - before.x) / t0.scale;
    const u1 = (anchor.x - after.x) / t1.scale;
    expect(u1).toBeCloseTo(u0, 0);
  });

  it('clamps panning to image bounds', () => {
    const t = panBy(defaultTransform(src, icon), 5000, 0, src, icon);
    expect(t.dx).toBeCloseTo((2000 * t.scale - 512) / 2);
  });
});

describe('watermark & render', () => {
  it('places the watermark plate in the bottom-right corner inside the frame', () => {
    const l = watermarkLayout(cover, 'microcrop.ru');
    expect(l.x + l.width).toBeLessThan(cover.width);
    expect(l.y + l.height).toBeLessThan(cover.height);
    expect(l.x).toBeGreaterThan(cover.width / 2);
    expect(l.y).toBeGreaterThan(cover.height / 2);
  });

  function fakeCtx() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    } as unknown as Render2DContext & Record<string, ReturnType<typeof vi.fn>>;
  }

  it('draws the watermark text only in free mode', () => {
    const free = fakeCtx();
    renderFrame(free, {} as CanvasImageSource, src, cover, defaultTransform(src, cover), {
      format: 'png',
      watermark: true,
      watermarkText: 'microcrop.ru',
    });
    expect(free.fillText).toHaveBeenCalledWith('microcrop.ru', expect.any(Number), expect.any(Number));

    const pro = fakeCtx();
    renderFrame(pro, {} as CanvasImageSource, src, cover, defaultTransform(src, cover), {
      format: 'png',
      watermark: false,
      watermarkText: 'microcrop.ru',
    });
    expect(pro.fillText).not.toHaveBeenCalled();
    expect(pro.drawImage).toHaveBeenCalledTimes(1);
  });

  it('fills an opaque background for JPEG', () => {
    const ctx = fakeCtx();
    renderFrame(ctx, {} as CanvasImageSource, src, cover, defaultTransform(src, cover), {
      format: 'jpg',
      watermark: false,
      watermarkText: '',
    });
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, cover.width, cover.height);
  });
});
