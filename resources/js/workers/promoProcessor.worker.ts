/// <reference lib="webworker" />
/**
 * Web Worker MicroCrop: ВСЯ обработка графики (рендер на OffscreenCanvas, водяной знак,
 * сжатие WebP/PNG/JPG под лимит, сборка .zip) выполняется только здесь.
 */
import type { PromoWorkerRequest, PromoWorkerResponse } from '../shared/types';
import { renderPreset } from './algorithms/cropAndRender';
import { compressToBudget, offscreenCanvasEncoders } from './algorithms/smartCompressor';
import { verifyExportToken } from './algorithms/exportToken';
import { runExportJob } from './exportJob';

declare const self: DedicatedWorkerGlobalScope;

function post(message: PromoWorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

self.addEventListener('message', (event: MessageEvent<PromoWorkerRequest>) => {
  const request = event.data;

  if (request.type === 'export') {
    const { source, watermarkText } = request;

    void runExportJob<OffscreenCanvas>(request, {
      render: (item, watermark) =>
        renderPreset(source, { width: item.width, height: item.height }, item.transform, {
          format: item.format,
          watermark,
          watermarkText,
        }),
      compress: async (canvas, item) => {
        try {
          return await compressToBudget(canvas, item.format, item.maxSizeKb, offscreenCanvasEncoders);
        } finally {
          // Освобождаем пиксельный буфер холста сразу, не дожидаясь GC.
          canvas.width = 0;
          canvas.height = 0;
        }
      },
      verifyToken: (token, publicKey) => verifyExportToken(token, publicKey),
      post,
    }).finally(() => {
      // ImageBitmap, переданный в воркер, обязательно закрывается после отрисовки.
      source.close();
    });
  }
});
