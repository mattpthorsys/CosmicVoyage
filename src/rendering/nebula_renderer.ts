// src/rendering/nebula_renderer.ts

import { PerlinNoise } from '../generation/perlin';
import { CONFIG } from '../config';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour } from './colour';
import { logger } from '../utils/logger';

/** Handles the generation and caching of nebula background colours. */
export class NebulaRenderer {
  private nebulaNoiseGenerator: PerlinNoise;
  private nebulaColorCache: Record<string, string> = {}; // Maps "x,y" string to hex colour string
  private nebulaCacheSize: number = 0;
  private readonly maxNebulaCacheSize: number = 10000;
  private readonly defaultBgColor: string = CONFIG.DEFAULT_BG_COLOUR;
  private readonly baseNebulaColorsRgb: RgbColour[];
  private readonly nebulaCachePrecision: number;

  constructor() {
    const nebulaSeed = CONFIG.SEED + '_nebula';
    this.nebulaNoiseGenerator = new PerlinNoise(nebulaSeed);
    this.baseNebulaColorsRgb = CONFIG.NEBULA_COLOURS.map(colour =>
      typeof colour === 'string' ? hexToRgb(colour) : colour
    ); // Pre-convert hex to RGB if necessary
    this.nebulaCachePrecision = Math.max(
      0,
      Math.min(10, CONFIG.NEBULA_CACHE_PRECISION)
    );
    logger.info(
      `[NebulaRenderer] Initialized with seed "${nebulaSeed}" and ${this.baseNebulaColorsRgb.length} base colours.`
    );
  }

  /** Clears the nebula colour cache. */
  clearCache(): void {
    logger.debug('[NebulaRenderer.clearCache] Clearing nebula colour cache.');
    this.nebulaColorCache = {};
    this.nebulaCacheSize = 0;
  }

  /** Gets the background colour for a given world coordinate, considering nebula effects. */
  getBackgroundColor(worldX: number, worldY: number): string {
    try {
      const cacheKey = `${worldX.toFixed(
        this.nebulaCachePrecision
      )},${worldY.toFixed(this.nebulaCachePrecision)}`;

      // Check cache first
      if (this.nebulaColorCache[cacheKey]) {
        // logger.debug(`Nebula cache hit for ${cacheKey}`); // Very noisy
        return this.nebulaColorCache[cacheKey];
      }

      // Calculate base noise value for nebula structure
      let noiseVal = this.nebulaNoiseGenerator.get(
        worldX * CONFIG.NEBULA_SCALE,
        worldY * CONFIG.NEBULA_SCALE
      );
      const maskNoiseVal = this.nebulaNoiseGenerator.get(
        worldX * CONFIG.NEBULA_SCALE * 0.75,
        worldY * CONFIG.NEBULA_SCALE * 0.75
      );

      // Interpolate between base nebula colours
      if (this.baseNebulaColorsRgb.length < 2) {
        logger.warn(
          '[NebulaRenderer] Not enough base nebula colours configured (< 2).'
        );
        return this.defaultBgColor; // Fallback if not enough colours
      }

      const factor = (noiseVal + 1) / 2; // Normalize noise to 0-1 range
      const scale = factor * (this.baseNebulaColorsRgb.length - 1);
      const index1 = Math.floor(scale);
      const index2 = Math.min(
        this.baseNebulaColorsRgb.length - 1,
        index1 + 1
      );
      const interpFactor = scale - index1;

      const interpNebulaColor = interpolateColour(
        this.baseNebulaColorsRgb[index1],
        this.baseNebulaColorsRgb[index2],
        interpFactor
      );

      // Gradient masking based on a second noise value
      let finalRgb = { ...interpNebulaColor }; // Start with the interpolated colour
      const gradient = (maskNoise: number, sparsity: number): number => {
        // Adjust the influence of sparsity
        const adjustedSparsity = Math.pow(sparsity, 0.7);
        // Scale and shift the noise value to create the gradient
        const scaledNoise = (maskNoise + 1) / 2;
        // Calculate alpha (opacity) based on adjusted sparsity
        return Math.max(0, 1 - scaledNoise * (1 / (1 - adjustedSparsity)));
      };

      let alpha = gradient(maskNoiseVal, CONFIG.NEBULA_SPARSITY);

      // Apply nebula intensity adjustment
      alpha = Math.min(1, alpha * CONFIG.NEBULA_INTENSITY);

      if (alpha < 1) {
        // Interpolate between nebula colour and black based on alpha
        const black: RgbColour = { r: 0, g: 0, b: 0 };
        finalRgb = interpolateColour(black, finalRgb, alpha);
      }

      const finalHex = rgbToHex(finalRgb.r, finalRgb.g, finalRgb.b);

      // Add to cache if space available
      if (this.nebulaCacheSize < this.maxNebulaCacheSize) {
        this.nebulaColorCache[cacheKey] = finalHex;
        this.nebulaCacheSize++;
      }

      return finalHex;
    } catch (error) {
      logger.warn(
        `[NebulaRenderer.getBackgroundColor] Error getting Perlin noise or calculating colour at ${worldX},${worldY}: ${error}`
      );
      return this.defaultBgColor; // Fallback on error
    }
  }
}