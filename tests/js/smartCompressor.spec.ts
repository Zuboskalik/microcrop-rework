import { describe, expect, it } from 'vitest';
import UPNG from 'upng-js';
import {
  QUALITY_MIN,
  compressToBudget,
  encodePngQuantizedRgba,
  qualityLadder,
  type FrameEncoders,
} from '@/workers/algorithms/smartCompressor';

/** Фейковый кадр: размер выходного файла задается функцией от качества. */
interface FakeFrame {
  sizeAt(quality: number): number;
  pngFull: number;
  pngQuantized: number;
}

function encoders(calls: string[]): FrameEncoders<FakeFrame> {
  return {
    async webp(f, q) {
      calls.push(`webp:${q}`);
      return new ArrayBuffer(f.sizeAt(q));
    },
    async jpg(f, q) {
      calls.push(`jpg:${q}`);
      return new ArrayBuffer(f.sizeAt(q));
    },
    async png(f) {
      calls.push('png');
      return new ArrayBuffer(f.pngFull);
    },
    async pngQuantized(f, colors) {
      calls.push(`png8:${colors}`);
      return new ArrayBuffer(f.pngQuantized);
    },
  };
}

const KB = 1024;

describe('qualityLadder', () => {
  it('starts at Q=92 and steps by 7 down to Q_min=50', () => {
    expect(qualityLadder()).toEqual([92, 85, 78, 71, 64, 57, 50]);
  });
});

describe('compressToBudget — webp', () => {
  it('returns the first attempt when it already fits', async () => {
    const calls: string[] = [];
    const frame: FakeFrame = { sizeAt: () => 100 * KB, pngFull: 0, pngQuantized: 0 };
    const r = await compressToBudget(frame, 'webp', 500, encoders(calls));
    expect(calls).toEqual(['webp:92']);
    expect(r.withinBudget).toBe(true);
    expect(r.quality).toBe(92);
  });

  it('lowers quality step by step until the limit is satisfied', async () => {
    const calls: string[] = [];
    // размер линейно зависит от качества: 10 KB на единицу Q
    const frame: FakeFrame = { sizeAt: (q) => q * 10 * KB, pngFull: 0, pngQuantized: 0 };
    const r = await compressToBudget(frame, 'webp', 700, encoders(calls));
    expect(calls).toEqual(['webp:92', 'webp:85', 'webp:78', 'webp:71', 'webp:64']);
    expect(r.quality).toBe(64);
    expect(r.bytes).toBeLessThanOrEqual(700 * KB);
    expect(r.withinBudget).toBe(true);
  });

  it('stops at Q_min and flags the budget miss', async () => {
    const calls: string[] = [];
    const frame: FakeFrame = { sizeAt: () => 5000 * KB, pngFull: 0, pngQuantized: 0 };
    const r = await compressToBudget(frame, 'webp', 500, encoders(calls));
    expect(calls.at(-1)).toBe(`webp:${QUALITY_MIN}`);
    expect(r.withinBudget).toBe(false);
    expect(r.attempts).toBe(7);
  });

  it('uses the same ladder for jpg', async () => {
    const calls: string[] = [];
    const frame: FakeFrame = { sizeAt: (q) => (q > 80 ? 900 * KB : 300 * KB), pngFull: 0, pngQuantized: 0 };
    const r = await compressToBudget(frame, 'jpg', 500, encoders(calls));
    expect(calls).toEqual(['jpg:92', 'jpg:85', 'jpg:78']);
    expect(r.quality).toBe(78);
  });
});

describe('compressToBudget — png', () => {
  it('keeps full-color PNG when it fits', async () => {
    const calls: string[] = [];
    const r = await compressToBudget({ sizeAt: () => 0, pngFull: 400 * KB, pngQuantized: 150 * KB }, 'png', 500, encoders(calls));
    expect(calls).toEqual(['png']);
    expect(r.quantized).toBe(false);
  });

  it('falls back to 256-color 8-bit palette when over budget', async () => {
    const calls: string[] = [];
    const r = await compressToBudget({ sizeAt: () => 0, pngFull: 900 * KB, pngQuantized: 300 * KB }, 'png', 500, encoders(calls));
    expect(calls).toEqual(['png', 'png8:256']);
    expect(r.quantized).toBe(true);
    expect(r.withinBudget).toBe(true);
    expect(r.bytes).toBe(300 * KB);
  });
});

describe('encodePngQuantizedRgba (upng-js)', () => {
  it('produces a valid 8-bit palette PNG', () => {
    const w = 64;
    const h = 64;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = (i * 7) % 256;
      rgba[i * 4 + 1] = (i * 13) % 256;
      rgba[i * 4 + 2] = (i * 29) % 256;
      rgba[i * 4 + 3] = 255;
    }
    const png = encodePngQuantizedRgba(rgba.buffer, w, h, 256);
    const sig = new Uint8Array(png.slice(0, 8));
    expect(Array.from(sig)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const decoded = UPNG.decode(png);
    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(decoded.depth).toBeLessThanOrEqual(8);
    expect(decoded.ctype).toBe(3); // indexed color
  });
});
