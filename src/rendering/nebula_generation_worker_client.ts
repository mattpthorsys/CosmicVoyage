import { NebulaColourProvider, LocalNebulaColourProvider } from './nebula_colour_provider';
import { NebulaColourRequest, NebulaColourSample } from './nebula_colour_sampler';

interface PendingRequest {
  resolve: (samples: NebulaColourSample[]) => void;
  reject: (error: Error) => void;
}

interface NebulaWorkerResponse {
  id: number;
  ok: boolean;
  samples?: NebulaColourSample[];
  error?: string;
}

export class WorkerNebulaColourProvider implements NebulaColourProvider {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly fallback = new LocalNebulaColourProvider();

  /** Returns background color. */
  getBackgroundColor(worldX: number, worldY: number): string {
    return this.fallback.getBackgroundColor(worldX, worldY);
  }

  /** Returns background colors async. */
  getBackgroundColorsAsync(requests: readonly NebulaColourRequest[]): Promise<NebulaColourSample[]> {
    if (requests.length === 0) return Promise.resolve([]);
    if (typeof Worker === 'undefined') {
      return this.fallback.getBackgroundColorsAsync(requests);
    }

    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, requests });
    });
  }

  /** Clears cache. */
  clearCache(): void {
    this.fallback.clearCache();
  }

  /** Terminates the worker and rejects any pending requests. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ reject }) => reject(new Error('Nebula generation worker disposed.')));
    this.pending.clear();
  }

  /** Returns worker. */
  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./nebula_generation_worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<NebulaWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok && response.samples) {
        pending.resolve(response.samples);
      } else {
        pending.reject(new Error(response.error ?? 'Nebula generation worker failed.'));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Nebula generation worker error.');
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }
}
