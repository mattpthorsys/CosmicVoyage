import { CONFIG } from '../config';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import {
  HyperspaceSurveyCellData,
  HyperspaceSurveyCellProvider,
  HyperspaceSurveyCellRequest,
  LocalHyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';

interface PendingRequest {
  resolve: (cells: HyperspaceSurveyCellData[]) => void;
  reject: (error: Error) => void;
}

interface HyperspaceSurveyWorkerResponse {
  id: number;
  ok: boolean;
  cells?: HyperspaceSurveyCellData[];
  error?: string;
}

export class WorkerHyperspaceSurveyCellProvider implements HyperspaceSurveyCellProvider {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly fallback: LocalHyperspaceSurveyCellProvider;

  /** Initializes WorkerHyperspaceSurveyCellProvider. */
  constructor(private readonly seed = CONFIG.SEED) {
    this.fallback = new LocalHyperspaceSurveyCellProvider(new SystemDataGenerator(new PRNG(seed)));
  }

  /** Returns cell data. */
  getCellData(worldX: number, worldY: number): HyperspaceSurveyCellData {
    return this.fallback.getCellData(worldX, worldY);
  }

  /** Returns cell data batch async. */
  getCellDataBatchAsync(
    requests: readonly HyperspaceSurveyCellRequest[]
  ): Promise<HyperspaceSurveyCellData[]> {
    if (requests.length === 0) return Promise.resolve([]);
    if (typeof Worker === 'undefined') {
      return this.fallback.getCellDataBatchAsync(requests);
    }

    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, seed: this.seed, requests });
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
    this.pending.forEach(({ reject }) => reject(new Error('Hyperspace survey worker disposed.')));
    this.pending.clear();
  }

  /** Returns worker. */
  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./hyperspace_survey_worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<HyperspaceSurveyWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok && response.cells) {
        pending.resolve(response.cells);
      } else {
        pending.reject(new Error(response.error ?? 'Hyperspace survey worker failed.'));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Hyperspace survey worker error.');
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }
}
