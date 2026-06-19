import { HyperspaceSurveyCell } from '../core/hyperspace_survey';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { logger } from '../utils/logger';
import { NebulaRenderer } from './nebula_renderer';
import { createHyperspaceTile, HyperspaceTile } from './hyperspace_tile_generation';
import {
  getHyperspaceTileGenerationProvider,
  HyperspaceTileGenerationProvider,
} from './hyperspace_tile_generation_provider';

export type { HyperspaceTile } from './hyperspace_tile_generation';

/** Builds and caches complete hyperspace cells from survey, nebula, and starfield data. */
export class HyperspaceTileProvider {
  private readonly tileCache: Map<string, HyperspaceTile> = new Map();
  private readonly pendingTilePrefetchKeys = new Set<string>();
  private readonly maxTileCacheSize = 60000;
  private prefetchGeneration = 0;
  private lastTilePrefetchSignature = '';

  /** Initializes HyperspaceTileProvider. */
  constructor(
    private readonly nebulaRenderer: NebulaRenderer,
    private readonly systemDataGenerator: SystemDataGenerator,
    private readonly tileGenerationProvider: HyperspaceTileGenerationProvider = getHyperspaceTileGenerationProvider()
  ) {}

  /** Clears cache. */
  clearCache(): void {
    this.tileCache.clear();
    this.pendingTilePrefetchKeys.clear();
    this.lastTilePrefetchSignature = '';
    this.prefetchGeneration++;
    this.tileGenerationProvider.clearCache();
  }

  /** Prefetches background tiles around the current hyperspace viewport. */
  prefetchBackgroundRegion(
    startWorldX: number,
    startWorldY: number,
    cols: number,
    rows: number,
    margin = 0
  ): void {
    this.nebulaRenderer.prefetchRegion(startWorldX, startWorldY, cols, rows, margin);
  }

  /** Prefetches every uncached tile intersecting the supplied region. */
  prefetchTileRegion(
    startWorldX: number,
    startWorldY: number,
    cols: number,
    rows: number,
    viewCenterX: number,
    viewCenterY: number,
    margin = 0
  ): void {
    const signature = `${startWorldX},${startWorldY}|${cols}x${rows}|${viewCenterX},${viewCenterY}|${margin}`;
    if (signature === this.lastTilePrefetchSignature) return;
    this.lastTilePrefetchSignature = signature;

    const availableCacheSlots =
      this.maxTileCacheSize - this.tileCache.size - this.pendingTilePrefetchKeys.size;
    if (availableCacheSlots <= 0) return;

    const requests: Array<{ worldX: number; worldY: number; rangeCells: number }> = [];
    collect: for (let y = -margin; y < rows + margin; y++) {
      for (let x = -margin; x < cols + margin; x++) {
        const worldX = startWorldX + x;
        const worldY = startWorldY + y;
        const rangeCells = Math.hypot(x - viewCenterX, y - viewCenterY);
        const key = this.getTileKey(worldX, worldY, rangeCells);
        if (this.tileCache.has(key) || this.pendingTilePrefetchKeys.has(key)) continue;

        this.pendingTilePrefetchKeys.add(key);
        requests.push({ worldX, worldY, rangeCells });
        if (requests.length >= availableCacheSlots) break collect;
      }
    }

    if (requests.length === 0) return;
    const generation = this.prefetchGeneration;
    void this.tileGenerationProvider
      .getTilesAsync(requests)
      .then((samples) => {
        if (generation !== this.prefetchGeneration) return;
        for (const sample of samples) {
          const key = this.getTileKey(sample.worldX, sample.worldY, sample.rangeCells);
          this.pendingTilePrefetchKeys.delete(key);
          if (!this.tileCache.has(key)) {
            this.cacheTile(key, sample.tile);
          }
        }
      })
      .catch((error) => {
        if (generation !== this.prefetchGeneration) return;
        if (this.lastTilePrefetchSignature === signature) {
          this.lastTilePrefetchSignature = '';
        }
        for (const request of requests) {
          this.pendingTilePrefetchKeys.delete(
            this.getTileKey(request.worldX, request.worldY, request.rangeCells)
          );
        }
        logger.debug(`[HyperspaceTileProvider.prefetchTileRegion] Tile prefetch failed: ${error}`);
      });
  }

  /** Returns tile. */
  getTile(worldX: number, worldY: number, rangeCells: number): HyperspaceTile {
    const key = this.getTileKey(worldX, worldY, rangeCells);
    const cached = this.tileCache.get(key);
    if (cached) return cached;

    const bg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);
    const system = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
    const phenomenon = system.exists
      ? null
      : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
    return this.cacheTile(key, createHyperspaceTile(bg, system, phenomenon, worldX, worldY, rangeCells));
  }

  /** Returns tile from survey cell. */
  getTileFromSurveyCell(cell: HyperspaceSurveyCell): HyperspaceTile {
    const key = this.getTileKey(cell.worldX, cell.worldY, cell.rangeCells);
    const cached = this.tileCache.get(key);
    if (cached) return cached;

    const bg = this.nebulaRenderer.getBackgroundColor(cell.worldX, cell.worldY);
    return this.cacheTile(
      key,
      createHyperspaceTile(bg, cell.system, cell.phenomenon, cell.worldX, cell.worldY, cell.rangeCells)
    );
  }

  /** Stores a generated hyperspace tile and evicts the oldest entry when full. */
  private cacheTile(key: string, tile: HyperspaceTile): HyperspaceTile {
    if (this.tileCache.size >= this.maxTileCacheSize) {
      const firstKey = this.tileCache.keys().next().value;
      if (firstKey !== undefined) this.tileCache.delete(firstKey);
    }
    this.tileCache.set(key, tile);
    return tile;
  }

  /** Returns tile key. */
  private getTileKey(worldX: number, worldY: number, rangeCells: number): string {
    return `${worldX},${worldY}|${Math.floor(rangeCells)}`;
  }
}
