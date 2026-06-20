import { SurfaceGenerationProvider } from './surface_generation_provider';
import { generateSurfaceDataFromRequest, SurfaceData, SurfaceGenerationRequest } from './surface_generator';

interface PendingRequest {
  id: number;
  request: SurfaceGenerationRequest;
  resolve: (data: SurfaceData) => void;
  reject: (error: Error) => void;
}

interface SurfaceWorkerResponse {
  id: number;
  ok: boolean;
  data?: SurfaceData;
  error?: string;
}

export class WorkerSurfaceGenerationProvider implements SurfaceGenerationProvider {
  private worker: Worker | null = null;
  private nextId = 1;
  private activeRequest: PendingRequest | null = null;
  private queuedRequest: PendingRequest | null = null;

  /** Generates surface data. */
  generateSurfaceData(request: SurfaceGenerationRequest): SurfaceData {
    return generateSurfaceDataFromRequest(request);
  }

  /** Generates surface data async. */
  generateSurfaceDataAsync(request: SurfaceGenerationRequest): Promise<SurfaceData> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(this.generateSurfaceData(request));
    }

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.queuedRequest) {
        this.queuedRequest.reject(new Error('Surface generation superseded by a newer request.'));
      }
      this.queuedRequest = { id, request, resolve, reject };
      this.dispatchNextRequest();
    });
  }

  /** Terminates the worker and rejects any pending requests. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.activeRequest?.reject(new Error('Surface generation worker disposed.'));
    this.queuedRequest?.reject(new Error('Surface generation worker disposed.'));
    this.activeRequest = null;
    this.queuedRequest = null;
  }

  /** Sends the newest queued surface request when the worker becomes idle. */
  private dispatchNextRequest(): void {
    if (this.activeRequest || !this.queuedRequest) return;
    const worker = this.getWorker();
    this.activeRequest = this.queuedRequest;
    this.queuedRequest = null;
    worker.postMessage({
      id: this.activeRequest.id,
      request: this.activeRequest.request,
    });
  }

  /** Returns worker. */
  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./surface_generation_worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<SurfaceWorkerResponse>) => {
      const response = event.data;
      const pending = this.activeRequest;
      if (!pending || pending.id !== response.id) return;
      this.activeRequest = null;
      if (response.ok && response.data) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error ?? 'Surface generation worker failed.'));
      }
      this.dispatchNextRequest();
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Surface generation worker error.');
      this.activeRequest?.reject(error);
      this.queuedRequest?.reject(error);
      this.activeRequest = null;
      this.queuedRequest = null;
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }
}
