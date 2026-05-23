// src/rendering/nebula_renderer.ts

import { PerlinNoise } from '../generation/perlin';
import { CONFIG } from '../config';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour } from './colour';
import { logger } from '../utils/logger';

type NebulaKind = 'emission' | 'reflection' | 'dark' | 'planetary' | 'remnant';

type NebulaRegion = {
  kind: NebulaKind;
  density: number;
  regionX: number;
  regionY: number;
  darkWeight: number;
  reflectionWeight: number;
  emissionWeight: number;
};

const BLACK: RgbColour = { r: 0, g: 0, b: 0 };

const NEBULA_PALETTES: Record<NebulaKind, string[]> = {
  emission: ['#100205', '#26070C', '#3E1119', '#55212A', '#60404A'],
  reflection: ['#02060C', '#07131F', '#102A3A', '#1D4558', '#315D6A'],
  dark: ['#000000', '#020202', '#060504', '#0D0A08', '#14100C'],
  planetary: ['#01090A', '#0B2929', '#235A54', '#4E766C', '#522632'],
  remnant: ['#030408', '#1B0B12', '#3E2024', '#543336', '#17444C'],
};

/** Handles the generation and caching of naturalistic nebula background colours. */
export class NebulaRenderer {
  private nebulaNoiseGenerator: PerlinNoise;
  private nebulaColorCache: Record<string, string> = {};
  private nebulaCacheSize: number = 0;
  private readonly maxNebulaCacheSize: number = 10000;
  private readonly defaultBgColor: string = CONFIG.DEFAULT_BG_COLOUR;
  private readonly nebulaCachePrecision: number;
  private readonly palettesRgb: Record<NebulaKind, RgbColour[]>;

  constructor() {
    const nebulaSeed = CONFIG.SEED + '_nebula';
    this.nebulaNoiseGenerator = new PerlinNoise(nebulaSeed);
    this.nebulaCachePrecision = Math.max(0, Math.min(10, CONFIG.NEBULA_CACHE_PRECISION));
    this.palettesRgb = {
      emission: NEBULA_PALETTES.emission.map(hexToRgb),
      reflection: NEBULA_PALETTES.reflection.map(hexToRgb),
      dark: NEBULA_PALETTES.dark.map(hexToRgb),
      planetary: NEBULA_PALETTES.planetary.map(hexToRgb),
      remnant: NEBULA_PALETTES.remnant.map(hexToRgb),
    };
    logger.info(`[NebulaRenderer] Initialized natural nebula renderer with seed "${nebulaSeed}".`);
  }

  /** Clears the nebula colour cache. */
  clearCache(): void {
    logger.debug('[NebulaRenderer.clearCache] Clearing nebula colour cache.');
    this.nebulaColorCache = {};
    this.nebulaCacheSize = 0;
    this.nebulaNoiseGenerator.clearCache();
  }

  /** Gets the background colour for a given world coordinate, considering nebula effects. */
  getBackgroundColor(worldX: number, worldY: number): string {
    try {
      const cacheKey = `${worldX.toFixed(this.nebulaCachePrecision)},${worldY.toFixed(this.nebulaCachePrecision)}`;
      if (this.nebulaColorCache[cacheKey]) return this.nebulaColorCache[cacheKey];

      const finalHex = this.sampleNaturalNebula(worldX, worldY);
      if (this.nebulaCacheSize < this.maxNebulaCacheSize) {
        this.nebulaColorCache[cacheKey] = finalHex;
        this.nebulaCacheSize++;
      }
      return finalHex;
    } catch (error) {
      logger.warn(
        `[NebulaRenderer.getBackgroundColor] Error calculating nebula colour at ${worldX},${worldY}: ${error}`
      );
      return this.defaultBgColor;
    }
  }

  private sampleNaturalNebula(worldX: number, worldY: number): string {
    const scale = CONFIG.NEBULA_SCALE;
    const region = this.getNebulaRegion(worldX, worldY, scale);
    if (!region) return this.defaultBgColor;

    const warpScale = scale * 0.38;
    const warpX = this.signedNoise(worldX * warpScale + 17.3, worldY * warpScale - 41.2);
    const warpY = this.signedNoise(worldX * warpScale - 73.5, worldY * warpScale + 11.8);
    const warpedX = worldX * scale + warpX * 2.7;
    const warpedY = worldY * scale + warpY * 2.7;

    const cloud = this.fbm(warpedX, warpedY, 4, 0.54, 2.05);
    const wisps = this.ridgedNoise(warpedX * 1.9 + 31.1, warpedY * 1.9 - 8.7, 4);
    const dust = this.fbm(worldX * scale * 1.35 - 82.5, worldY * scale * 1.35 + 19.4, 3, 0.62, 2.2);
    const edgeFalloff = this.smoothstep(0.1, 1, cloud);
    let alpha = region.density * (0.2 + edgeFalloff * 0.46 + wisps * 0.18);

    if (region.kind === 'dark') {
      alpha *= 0.48 + dust * 0.35;
    } else if (region.kind === 'reflection') {
      alpha *= 0.72;
    } else if (region.kind === 'planetary' || region.kind === 'remnant') {
      alpha *= this.shellIntensity(worldX, worldY, region);
    }

    alpha *= Math.max(0, Math.min(1, CONFIG.NEBULA_INTENSITY));
    if (alpha < 0.008) return this.defaultBgColor;

    const colour = this.sampleNebulaColour(region, cloud, wisps);
    const dustOcclusion = Math.max(0, dust - 0.56) * (region.kind === 'dark' ? 0.75 : 0.52);
    const attenuated = interpolateColour(colour, BLACK, Math.min(0.78, dustOcclusion));
    const brightness = region.kind === 'dark'
      ? 0.18 + alpha * 0.32
      : 0.3 + alpha * (region.kind === 'remnant' ? 0.72 : 0.62);
    const final = interpolateColour(BLACK, attenuated, Math.min(0.82, brightness));
    return rgbToHex(final.r, final.g, final.b);
  }

  private getNebulaRegion(worldX: number, worldY: number, scale: number): NebulaRegion | null {
    const regionScale = scale * 0.115;
    const regionX = worldX * regionScale;
    const regionY = worldY * regionScale;
    const broadCloud = this.fbm(regionX, regionY, 4, 0.58, 1.85);
    const finePresence = this.normalizedNoise(regionX * 2.7 + 45.2, regionY * 2.7 - 9.6);
    const presence = broadCloud * 0.86 + finePresence * 0.14;
    const threshold = 0.47 + CONFIG.NEBULA_SPARSITY * 0.045;
    const density = this.smoothstep(threshold, 0.96, presence);
    if (density < 0.018) return null;

    const typeValue = this.normalizedNoise(regionX * 0.83 - 118.0, regionY * 0.83 + 57.0);
    const rareValue = this.normalizedNoise(regionX * 3.8 + 6.4, regionY * 3.8 - 91.3);
    let darkWeight = 1 - this.smoothstep(0.16, 0.38, typeValue);
    let reflectionWeight = this.smoothstep(0.18, 0.38, typeValue) * (1 - this.smoothstep(0.43, 0.66, typeValue));
    let emissionWeight = this.smoothstep(0.48, 0.72, typeValue);
    const totalWeight = Math.max(0.0001, darkWeight + reflectionWeight + emissionWeight);
    darkWeight /= totalWeight;
    reflectionWeight /= totalWeight;
    emissionWeight /= totalWeight;
    let kind: NebulaKind;
    if (rareValue > 0.968 && density > 0.48) {
      kind = rareValue > 0.986 ? 'remnant' : 'planetary';
      darkWeight = 0;
      reflectionWeight = kind === 'planetary' ? 0.55 : 0.32;
      emissionWeight = 1 - reflectionWeight;
    } else if (typeValue < 0.22) {
      kind = 'dark';
    } else if (typeValue < 0.48) {
      kind = 'reflection';
    } else {
      kind = 'emission';
    }
    return { kind, density, regionX, regionY, darkWeight, reflectionWeight, emissionWeight };
  }

  private sampleNebulaColour(region: NebulaRegion, cloud: number, wisps: number): RgbColour {
    const factor = this.smoothstep(0.06, 0.98, cloud * 0.72 + wisps * 0.28);
    if (region.kind === 'planetary' || region.kind === 'remnant') {
      return this.sampleNebulaPalette(region.kind, factor);
    }

    const dark = this.sampleNebulaPalette('dark', factor);
    const reflection = this.sampleNebulaPalette('reflection', factor);
    const emission = this.sampleNebulaPalette('emission', factor);
    const darkReflection = this.mixWeighted(dark, region.darkWeight, reflection, region.reflectionWeight);
    const combinedWeight = region.darkWeight + region.reflectionWeight;
    const base = this.mixWeighted(
      darkReflection,
      combinedWeight,
      emission,
      region.emissionWeight
    );
    const oxygenHint = Math.max(0, region.emissionWeight - 0.55) * this.smoothstep(0.72, 0.98, wisps) * 0.16;
    return interpolateColour(base, { r: 42, g: 86, b: 88 }, oxygenHint);
  }

  private sampleNebulaPalette(kind: NebulaKind, factor: number): RgbColour {
    const palette = this.palettesRgb[kind];
    const softenedFactor = 0.08 + Math.max(0, Math.min(0.999, factor)) * 0.84;
    const scaled = softenedFactor * (palette.length - 1);
    const index1 = Math.floor(scaled);
    const index2 = Math.min(palette.length - 1, index1 + 1);
    const localMix = this.smoothstep(0, 1, scaled - index1);
    return interpolateColour(palette[index1], palette[index2], localMix);
  }

  private mixWeighted(first: RgbColour, firstWeight: number, second: RgbColour, secondWeight: number): RgbColour {
    const total = firstWeight + secondWeight;
    if (total <= 0.0001) return BLACK;
    return interpolateColour(first, second, secondWeight / total);
  }

  private shellIntensity(worldX: number, worldY: number, region: NebulaRegion): number {
    const cellX = Math.floor(region.regionX);
    const cellY = Math.floor(region.regionY);
    const centerX = cellX + 0.25 + this.hashUnit(`${cellX},${cellY}:cx`) * 0.5;
    const centerY = cellY + 0.25 + this.hashUnit(`${cellX},${cellY}:cy`) * 0.5;
    const dx = region.regionX - centerX;
    const dy = region.regionY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const radius = region.kind === 'remnant' ? 0.42 : 0.28;
    const shell = 1 - Math.min(1, Math.abs(distance - radius) / (region.kind === 'remnant' ? 0.16 : 0.09));
    const filament = this.ridgedNoise(worldX * CONFIG.NEBULA_SCALE * 2.8, worldY * CONFIG.NEBULA_SCALE * 2.8, 3);
    return Math.max(0, shell) * (0.48 + filament * 0.52);
  }

  private fbm(x: number, y: number, octaves: number, persistence: number, lacunarity: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let amplitudeSum = 0;
    for (let octave = 0; octave < octaves; octave++) {
      total += this.signedNoise(x * frequency, y * frequency) * amplitude;
      amplitudeSum += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return Math.max(0, Math.min(1, total / Math.max(0.0001, amplitudeSum) * 0.5 + 0.5));
  }

  private ridgedNoise(x: number, y: number, octaves: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let amplitudeSum = 0;
    for (let octave = 0; octave < octaves; octave++) {
      const ridge = 1 - Math.abs(this.signedNoise(x * frequency, y * frequency));
      total += ridge * ridge * amplitude;
      amplitudeSum += amplitude;
      amplitude *= 0.48;
      frequency *= 2.15;
    }
    return Math.max(0, Math.min(1, total / Math.max(0.0001, amplitudeSum)));
  }

  private normalizedNoise(x: number, y: number): number {
    return this.signedNoise(x, y) * 0.5 + 0.5;
  }

  private signedNoise(x: number, y: number): number {
    return Math.max(-1, Math.min(1, this.nebulaNoiseGenerator.get(x, y) * 1.65));
  }

  private smoothstep(edge0: number, edge1: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  private hashUnit(seed: string): number {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
  }
}
