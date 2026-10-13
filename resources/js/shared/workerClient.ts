import type { PromoWorkerRequest, PromoWorkerResponse, PromoWorkerResult, WorkerErrorCode } from './types';

type ExportRequest = Extract<PromoWorkerRequest, { type: 'export' }>;

export class WorkerJobError extends Error {
  constructor(
    public readonly code: WorkerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Обертка над promoProcessor.worker.ts: один воркер на вкладку, задания различаются jobId.
 */
export class PromoWorkerClient {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<
    string,
    { resolve: (r: PromoWorkerResult) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void }
  >();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL('../workers/promoProcessor.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<PromoWorkerResponse>) => this.handle(event.data));
    worker.addEventListener('error', (event) => {
      const error = new WorkerJobError('render_failed', event.message || 'Worker crashed');
      for (const job of this.pending.values()) job.reject(error);
      this.pending.clear();
      this.terminate();
    });
    this.worker = worker;
    return worker;
  }

  /**
   * Запускает экспорт. ImageBitmap передается через transfer (без копирования) и
   * становится недоступным в главном потоке — передавайте отдельный экземпляр.
   */
  run(request: Omit<ExportRequest, 'jobId' | 'type'>, onProgress?: (done: number, total: number) => void): Promise<PromoWorkerResult> {
    const jobId = `job-${++this.seq}`;
    const message: ExportRequest = { type: 'export', jobId, ...request };

    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject, onProgress });
      this.ensureWorker().postMessage(message, [request.source]);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private handle(message: PromoWorkerResponse): void {
    const job = this.pending.get(message.jobId);
    if (!job) return;

    switch (message.type) {
      case 'progress':
        job.onProgress?.(message.done, message.total);
        return;
      case 'error':
        this.pending.delete(message.jobId);
        job.reject(new WorkerJobError(message.code, message.message));
        return;
      case 'file':
      case 'zip':
        this.pending.delete(message.jobId);
        job.resolve(message);
        return;
    }
  }
}

/**
 * Скачивание результата: ObjectURL обязательно освобождается после клика.
 */
export function downloadBuffer(buffer: ArrayBuffer, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Отложенный revoke: часть браузеров начинает загрузку асинхронно после click().
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
