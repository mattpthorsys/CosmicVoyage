import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { LocalNebulaColourProvider, NebulaColourProvider } from './nebula_colour_provider';

/** Handles the generation and caching of naturalistic nebula background colours. */
export class NebulaRenderer {
  private nebulaColorCache: Record<string, string> = {};
  private nebulaCacheSize: number = 0;
  private readonly pendingPrefetchKeys = new Set<string>();
  private readonly maxNebulaCacheSize: number = 10000;
  private readonly defaultBgColor: string = CONFIG.DEFAULT_BG_COLOUR;
  private readonly nebulaCachePrecision: number;
  private readonly provider: NebulaColourProvider;
  private lastPrefetchSignature = '';

  /** Initializes NebulaRenderer. */
  constructor(provider: NebulaColourProvider = new LocalNebulaColourProvider()) {
    this.provider = provider;
    this.nebulaCachePrecision = Math.max(0, Math.min(10, CONFIG.NEBULA_CACHE_PRECISION));
    logger.info('[NebulaRenderer] Initialized natural nebula renderer.');
  }

  /** Clears the nebula colour cache. */
  clearCache(): void {
    logger.debug('[NebulaRenderer.clearCache] Clearing nebula colour cache.');
    this.nebulaColorCache = {};
    this.nebulaCacheSize = 0;
    this.pendingPrefetchKeys.clear();
    this.lastPrefetchSignature = '';
    this.provider.clearCache();
  }

  /** Gets the background colour for a given world coordinate, considering nebula effects. */
  getBackgroundColor(worldX: number, worldY: number): string {
    try {
      const cacheKey = this.getCacheKey(worldX, worldY);
      if (this.nebulaColorCache[cacheKey]) return this.nebulaColorCache[cacheKey];

      const finalHex = this.provider.getBackgroundColor(worldX, worldY);
      this.storeCachedColour(cacheKey, finalHex);
      return finalHex;
    } catch (error) {
      logger.warn(
        `[NebulaRenderer.getBackgroundColor] Error calculating nebula colour at ${worldX},${worldY}: ${error}`
      );
      return this.defaultBgColor;
    }
  }

  /** Prefetches nebula colours for the visible world region. */
  prefetchRegion(startWorldX: number, startWorldY: number, cols: number, rows: number, margin = 0): void {
    const signature = `${startWorldX},${startWorldY}|${cols}x${rows}|${margin}`;
    if (signature === this.lastPrefetchSignature) return;
    this.lastPrefetchSignature = signature;

    const availableCacheSlots =
      this.maxNebulaCacheSize - this.nebulaCacheSize - this.pendingPrefetchKeys.size;
    if (availableCacheSlots <= 0) return;

    const requests: Array<{ worldX: number; worldY: number }> = [];
    collectRequests: for (let y = -margin; y < rows + margin; y++) {
      for (let x = -margin; x < cols + margin; x++) {
        const worldX = startWorldX + x;
        const worldY = startWorldY + y;
        const cacheKey = this.getCacheKey(worldX, worldY);
        if (this.nebulaColorCache[cacheKey] || this.pendingPrefetchKeys.has(cacheKey)) continue;
        this.pendingPrefetchKeys.add(cacheKey);
        requests.push({ worldX, worldY });
        if (requests.length >= availableCacheSlots) break collectRequests;
      }
    }
    if (requests.length === 0) return;

    void this.provider
      .getBackgroundColorsAsync(requests)
      .then((samples) => {
        for (const { worldX, worldY, colour } of samples) {
          const cacheKey = this.getCacheKey(worldX, worldY);
          this.pendingPrefetchKeys.delete(cacheKey);
          this.storeCachedColour(cacheKey, colour);
        }
      })
      .catch((error) => {
        if (this.lastPrefetchSignature === signature) {
          this.lastPrefetchSignature = '';
        }
        for (const { worldX, worldY } of requests) {
          this.pendingPrefetchKeys.delete(this.getCacheKey(worldX, worldY));
        }
        logger.debug(`[NebulaRenderer.prefetchRegion] Nebula prefetch failed: ${error}`);
      });
  }

  /** Returns cache key. */
  private getCacheKey(worldX: number, worldY: number): string {
    return `${worldX.toFixed(this.nebulaCachePrecision)},${worldY.toFixed(this.nebulaCachePrecision)}`;
  }

  /** Stores a sampled nebula colour and evicts the oldest entry when needed. */
  private storeCachedColour(cacheKey: string, colour: string): void {
    if (this.nebulaColorCache[cacheKey] || this.nebulaCacheSize >= this.maxNebulaCacheSize) return;
    this.nebulaColorCache[cacheKey] = colour;
    this.nebulaCacheSize++;
  }
}
