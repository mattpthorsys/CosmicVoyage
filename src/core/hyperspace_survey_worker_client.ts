import { CONFIG } from '../config';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import {
  HyperspaceSurveyCellData,
  HyperspaceSurveyCellProvider,
  HyperspaceSurveyCellRequest,
  LocalHyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';
import {
  HyperspaceTileGenerationProvider,
  LocalHyperspaceTileGenerationProvider,
} from '../rendering/hyperspace_tile_generation_provider';
import { HyperspaceTileRequest, HyperspaceTileSample } from '../rendering/hyperspace_tile_generation';

interface PendingCellRequest {
  resolve: (cells: HyperspaceSurveyCellData[]) => void;
  reject: (error: Error) => void;
}

interface PendingTileRequest {
  resolve: (tiles: HyperspaceTileSample[]) => void;
  reject: (error: Error) => void;
}

interface HyperspaceSurveyWorkerResponse {
  id: number;
  kind: 'cells' | 'tiles';
  ok: boolean;
  cells?: HyperspaceSurveyCellData[];
  tiles?: HyperspaceTileSample[];
  error?: string;
}

export class WorkerHyperspaceSurveyCellProvider
  implements HyperspaceSurveyCellProvider, HyperspaceTileGenerationProvider
{
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pendingCells = new Map<number, PendingCellRequest>();
  private readonly pendingTiles = new Map<number, PendingTileRequest>();
  private readonly fallback: LocalHyperspaceSurveyCellProvider;
  private readonly tileFallback: LocalHyperspaceTileGenerationProvider;

  /** Initializes WorkerHyperspaceSurveyCellProvider. */
  constructor(private readonly seed = CONFIG.SEED) {
    this.fallback = new LocalHyperspaceSurveyCellProvider(new SystemDataGenerator(new PRNG(seed)));
    this.tileFallback = new LocalHyperspaceTileGenerationProvider(seed);
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
      this.pendingCells.set(id, { resolve, reject });
      worker.postMessage({ id, kind: 'cells', seed: this.seed, requests });
    });
  }

  /** Generates complete hyperspace render tiles in the shared worker. */
  getTilesAsync(requests: readonly HyperspaceTileRequest[]): Promise<HyperspaceTileSample[]> {
    if (requests.length === 0) return Promise.resolve([]);
    if (typeof Worker === 'undefined') {
      return this.tileFallback.getTilesAsync(requests);
    }

    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingTiles.set(id, { resolve, reject });
      worker.postMessage({ id, kind: 'tiles', seed: this.seed, requests });
    });
  }

  /** Clears cache. */
  clearCache(): void {
    this.fallback.clearCache();
    this.tileFallback.clearCache();
  }

  /** Terminates the worker and rejects any pending requests. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingCells.forEach(({ reject }) => reject(new Error('Hyperspace survey worker disposed.')));
    this.pendingTiles.forEach(({ reject }) => reject(new Error('Hyperspace tile worker disposed.')));
    this.pendingCells.clear();
    this.pendingTiles.clear();
  }

  /** Returns worker. */
  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./hyperspace_survey_worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<HyperspaceSurveyWorkerResponse>) => {
      const response = event.data;
      if (response.kind === 'cells') {
        const pending = this.pendingCells.get(response.id);
        if (!pending) return;
        this.pendingCells.delete(response.id);
        if (response.ok && response.cells) {
          pending.resolve(response.cells);
        } else {
          pending.reject(new Error(response.error ?? 'Hyperspace survey worker failed.'));
        }
      } else {
        const pending = this.pendingTiles.get(response.id);
        if (!pending) return;
        this.pendingTiles.delete(response.id);
        if (response.ok && response.tiles) {
          pending.resolve(response.tiles);
        } else {
          pending.reject(new Error(response.error ?? 'Hyperspace tile worker failed.'));
        }
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Hyperspace survey worker error.');
      this.pendingCells.forEach(({ reject }) => reject(error));
      this.pendingTiles.forEach(({ reject }) => reject(error));
      this.pendingCells.clear();
      this.pendingTiles.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }
}
