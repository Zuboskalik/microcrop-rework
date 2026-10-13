import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { runExportJob, type ExportJobDeps } from '@/workers/exportJob';
import { ExportTokenError } from '@/workers/algorithms/exportToken';
import type { ExportConfig, ExportItem, PromoWorkerRequest, PromoWorkerResponse } from '@/shared/types';

type ExportRequest = Extract<PromoWorkerRequest, { type: 'export' }>;

const item = (id: string, format: ExportItem['format'] = 'png'): ExportItem => ({
  presetId: id,
  fileName: id,
  width: 10,
  height: 10,
  maxSizeKb: 1,
  format,
  transform: { scale: 1, dx: 0, dy: 0 },
});

function harness(config: Partial<ExportConfig> | Error = {}) {
  const messages: PromoWorkerResponse[] = [];
  const watermarks: boolean[] = [];
  const deps: ExportJobDeps<{ id: string }> = {
    render(i, watermark) {
      watermarks.push(watermark);
      return { id: i.presetId };
    },
    async compress(frame) {
      const bytes = new TextEncoder().encode(frame.id);
      return { buffer: bytes.buffer, bytes: bytes.byteLength, maxBytes: 1024, withinBudget: true, attempts: 1 };
    },
    async verifyToken() {
      if (config instanceof Error) throw config;
      return { v: 1, sub: 1, watermark: false, batchZip: true, iat: 0, exp: Date.now() + 1000, ...config };
    },
    post(m) {
      messages.push(m);
    },
  };
  return { deps, messages, watermarks };
}

const request = (over: Partial<ExportRequest>): ExportRequest => ({
  type: 'export',
  jobId: 'job',
  source: {} as ImageBitmap,
  items: [item('a')],
  mode: 'single',
  license: { tier: 'free' },
  watermarkText: 'microcrop.ru',
  ...over,
});

describe('runExportJob — Free tier protection', () => {
  it('forces the watermark for free single export', async () => {
    const h = harness();
    await runExportJob(request({}), h.deps);
    expect(h.watermarks).toEqual([true]);
    const file = h.messages.find((m) => m.type === 'file');
    expect(file).toMatchObject({ fileName: 'a.png', mime: 'image/png' });
    expect(file && file.type === 'file' && file.report.watermarked).toBe(true);
  });

  it('refuses .zip for free tier', async () => {
    const h = harness();
    await runExportJob(request({ mode: 'zip', items: [item('a'), item('b')] }), h.deps);
    expect(h.messages).toEqual([expect.objectContaining({ type: 'error', code: 'license_required' })]);
    expect(h.watermarks).toEqual([]);
  });

  it('refuses multiple files at once for free tier', async () => {
    const h = harness();
    await runExportJob(request({ items: [item('a'), item('b')] }), h.deps);
    expect(h.messages[0]).toMatchObject({ type: 'error', code: 'license_required' });
  });
});

describe('runExportJob — Pro tier', () => {
  const pro = { tier: 'pro' as const, token: 't', publicKey: 'k' };

  it('builds a zip without watermark when the signed config allows it', async () => {
    const h = harness();
    await runExportJob(request({ mode: 'zip', license: pro, items: [item('a', 'png'), item('b', 'webp')] }), h.deps);
    expect(h.watermarks).toEqual([false, false]);
    const progress = h.messages.filter((m) => m.type === 'progress');
    expect(progress).toHaveLength(2);
    const zip = h.messages.find((m) => m.type === 'zip');
    expect(zip?.type).toBe('zip');
    if (zip?.type === 'zip') {
      const files = unzipSync(new Uint8Array(zip.buffer));
      expect(Object.keys(files).sort()).toEqual(['a.png', 'b.webp']);
      expect(zip.reports).toHaveLength(2);
    }
  });

  it('rejects an invalid token', async () => {
    const h = harness(new ExportTokenError('license_invalid', 'bad'));
    await runExportJob(request({ mode: 'zip', license: pro, items: [item('a')] }), h.deps);
    expect(h.messages).toEqual([expect.objectContaining({ type: 'error', code: 'license_invalid' })]);
  });

  it('rejects an expired token', async () => {
    const h = harness(new ExportTokenError('license_expired', 'expired'));
    await runExportJob(request({ mode: 'zip', license: pro, items: [item('a')] }), h.deps);
    expect(h.messages[0]).toMatchObject({ code: 'license_expired' });
  });

  it('respects batchZip=false in the signed config', async () => {
    const h = harness({ batchZip: false });
    await runExportJob(request({ mode: 'zip', license: pro, items: [item('a')] }), h.deps);
    expect(h.messages[0]).toMatchObject({ type: 'error', code: 'license_required' });
  });
});
