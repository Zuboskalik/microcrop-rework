import type {
  CompressionReport,
  ExportConfig,
  ExportItem,
  PromoWorkerRequest,
  PromoWorkerResponse,
  WorkerErrorCode,
} from '../shared/types';
import type { CompressionResult } from './algorithms/smartCompressor';
import { mimeFor } from './algorithms/smartCompressor';
import { ExportTokenError } from './algorithms/exportToken';
import { packZip } from './algorithms/zipPacker';

type ExportRequest = Extract<PromoWorkerRequest, { type: 'export' }>;

/**
 * Зависимости пайплайна экспорта. В воркере — OffscreenCanvas + WASM,
 * в тестах — фейки, чтобы проверить политику лицензирования и сборку архива.
 */
export interface ExportJobDeps<F> {
  render(item: ExportItem, watermark: boolean): F;
  compress(frame: F, item: ExportItem): Promise<CompressionResult>;
  verifyToken(token: string, publicKey: string): Promise<ExportConfig>;
  post(message: PromoWorkerResponse, transfer?: Transferable[]): void;
}

class JobError extends Error {
  constructor(
    public readonly code: WorkerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Алгоритм 3: защита Free-тарифа.
 * - Free: водяной знак рисуется принудительно, файлы отдаются строго по одному.
 * - Pro (без водяного знака и/или .zip): обязателен валидный подписанный токен с сервера.
 */
export async function runExportJob<F>(request: ExportRequest, deps: ExportJobDeps<F>): Promise<void> {
  const { jobId, items, mode, license } = request;

  try {
    if (items.length === 0) {
      throw new JobError('bad_request', 'No items to export');
    }

    let watermark = true;

    if (license.tier === 'free') {
      if (mode === 'zip' || items.length > 1) {
        throw new JobError('license_required', 'Batch .zip export requires a Pro license');
      }
    } else {
      const config = await verify(deps, license.token, license.publicKey);
      if (mode === 'zip' && !config.batchZip) {
        throw new JobError('license_required', 'Export config does not allow batch export');
      }
      watermark = config.watermark;
    }

    if (mode === 'single' && items.length > 1) {
      throw new JobError('bad_request', 'Single mode accepts exactly one item');
    }

    const outputs: { item: ExportItem; result: CompressionResult; report: CompressionReport }[] = [];

    for (const [index, item] of items.entries()) {
      let frame: F;
      try {
        frame = deps.render(item, watermark);
      } catch (e) {
        throw new JobError('render_failed', `Render failed for ${item.presetId}: ${errorMessage(e)}`);
      }

      let result: CompressionResult;
      try {
        result = await deps.compress(frame, item);
      } catch (e) {
        throw new JobError('encode_failed', `Encoding failed for ${item.presetId}: ${errorMessage(e)}`);
      }

      const report: CompressionReport = {
        presetId: item.presetId,
        fileName: fileNameFor(item),
        format: item.format,
        bytes: result.bytes,
        maxBytes: result.maxBytes,
        withinBudget: result.withinBudget,
        quality: result.quality,
        quantized: result.quantized,
        attempts: result.attempts,
        watermarked: watermark,
      };
      outputs.push({ item, result, report });
      deps.post({ type: 'progress', jobId, done: index + 1, total: items.length, presetId: item.presetId });
    }

    if (mode === 'single') {
      const { item, result, report } = outputs[0]!;
      deps.post(
        { type: 'file', jobId, fileName: report.fileName, mime: mimeFor(item.format), buffer: result.buffer, report },
        [result.buffer],
      );
      return;
    }

    const zip = packZip(outputs.map(({ result, report }) => ({ name: report.fileName, data: new Uint8Array(result.buffer) })));
    const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    deps.post(
      {
        type: 'zip',
        jobId,
        fileName: request.archiveName ?? 'microcrop_promo.zip',
        buffer,
        reports: outputs.map((o) => o.report),
      },
      [buffer],
    );
  } catch (e) {
    const code: WorkerErrorCode = e instanceof JobError || e instanceof ExportTokenError ? e.code : 'render_failed';
    deps.post({ type: 'error', jobId, code, message: errorMessage(e) });
  }
}

export function fileNameFor(item: ExportItem): string {
  return `${item.fileName}.${item.format}`;
}

async function verify<F>(deps: ExportJobDeps<F>, token: string, publicKey: string): Promise<ExportConfig> {
  try {
    return await deps.verifyToken(token, publicKey);
  } catch (e) {
    if (e instanceof ExportTokenError) throw e;
    throw new JobError('license_invalid', errorMessage(e));
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
