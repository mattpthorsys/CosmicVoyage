import { SurfaceGenerationProvider } from './surface_generation_provider';
import { generateSurfaceDataFromRequest, SurfaceData, SurfaceGenerationRequest } from './surface_generator';

interface PendingRequest {
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
  private readonly pending = new Map<number, PendingRequest>();

  /** Generates surface data. */
  generateSurfaceData(request: SurfaceGenerationRequest): SurfaceData {
    return generateSurfaceDataFromRequest(request);
  }

  /** Generates surface data async. */
  generateSurfaceDataAsync(request: SurfaceGenerationRequest): Promise<SurfaceData> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(this.generateSurfaceData(request));
    }

    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, request });
    });
  }

  /** Terminates the worker and rejects any pending requests. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ reject }) => reject(new Error('Surface generation worker disposed.')));
    this.pending.clear();
  }

  /** Returns worker. */
  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./surface_generation_worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<SurfaceWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok && response.data) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error ?? 'Surface generation worker failed.'));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Surface generation worker error.');
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }
}
