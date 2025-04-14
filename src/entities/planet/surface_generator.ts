// src/entities/planet/surface_generator.ts (Added Sparsity Check)

import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { PLANET_TYPES, ELEMENTS } from '../../constants';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour } from '../../rendering/colour';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateHeightmap } from './heightmap_generator';
import { generateSurfaceElementMap } from './surface_element_generator';

// Interface for the generated surface data package - ADD surfaceElementMap
export interface SurfaceData {
  heightmap: number[][] | null;
  heightLevelColors: string[] | null;
  rgbPaletteCache: RgbColour[] | null;
  surfaceElementMap: string[][] | null; // NEW: Stores dominant element key per coordinate
}

/** Generates surface data (heightmap, colours, palettes, element map) for a planet. */
export class SurfaceGenerator {
  private prng: PRNG;
  private planetType: string;
  private mapSeed: string;
  private atmosphere: Atmosphere; // Needed for crater check

  constructor(planetType: string, mapSeed: string, prng: PRNG, atmosphere: Atmosphere) {
    this.planetType = planetType;
    this.mapSeed = mapSeed;
    this.prng = prng; // Use the planet-specific PRNG
    this.atmosphere = atmosphere;

    logger.debug(`[SurfaceGen] Initialized for Type: ${planetType}, Seed: ${mapSeed}. Element Noise Seeded.`);
  }

  /** Generates all necessary surface data based on planet type. */
  generateSurfaceData(planetAbundance: Record<string, number>): SurfaceData {
    logger.info(`[SurfaceGen:${this.planetType}] Generating surface data...`);
    let heightmap: number[][] | null = null;
    let heightLevelColors: string[] | null = null;
    let rgbPaletteCache: RgbColour[] | null = null;
    let surfaceElementMap: string[][] | null = null;

    // --- Handle Gas Giants/Ice Giants (Palette Cache Only) ---
    if (this.planetType === 'GasGiant' || this.planetType === 'IceGiant') {
      rgbPaletteCache = this.generateRgbPaletteCache();
      logger.info(`[SurfaceGen:${this.planetType}] Generated RGB palette cache.`);
    }
    // --- Handle Solid Planets (Heightmap, Colors, Element Map) ---
    else {
      heightmap = generateHeightmap(this.mapSeed, this.planetType, this.atmosphere);

      if (heightmap) {
        // Generate Element Map using overall planet abundance and heightmap
        surfaceElementMap = generateSurfaceElementMap(
          this.planetType, // Pass necessary context
          this.mapSeed,
          this.prng,
          planetAbundance,
          heightmap
        );

        if (!surfaceElementMap) {
          logger.error(`[SurfaceGen:${this.planetType}] Surface element map generation failed.`);
        }

        // Generate colours based on the final heightmap
        rgbPaletteCache = this.generateRgbPaletteCache();
        if (rgbPaletteCache) {
          heightLevelColors = this.generateHeightLevelColors(rgbPaletteCache);
          logger.info(
            `[SurfaceGen:${this.planetType}] Generated heightmap (${heightmap.length}x${heightmap.length}), element map, and height level colours.`
          );
        } else {
          logger.error(
            `[SurfaceGen:${this.planetType}] Failed to generate RGB palette, cannot generate height level colours.`
          );
          heightLevelColors = null;
        }
      } else {
        logger.error(
          `[SurfaceGen:${this.planetType}] Heightmap generation failed. Cannot generate colours or element map.`
        );
        heightLevelColors = null;
        rgbPaletteCache = null;
        surfaceElementMap = null;
      }
    }

    return { heightmap, heightLevelColors, rgbPaletteCache, surfaceElementMap };
  }

  /** Generates or retrieves the RGB palette cache for the planet type. */
  private generateRgbPaletteCache(): RgbColour[] | null {
    logger.debug(`[SurfaceGen:${this.planetType}] Generating/retrieving RGB palette cache...`);
    const planetPaletteHex = PLANET_TYPES[this.planetType]?.colours;
    if (!planetPaletteHex || planetPaletteHex.length === 0) {
      logger.error(`[SurfaceGen:${this.planetType}] Planet visual data (colour palette) missing or empty.`);
      return null;
    }
    try {
      const cache = planetPaletteHex.map((hex) => hexToRgb(hex));
      logger.debug(`[SurfaceGen:${this.planetType}] RGB palette cache ready (${cache.length} colours).`);
      return cache;
    } catch (e) {
      logger.error(`[SurfaceGen:${this.planetType}] Failed to parse colour palette: ${e}`);
      return null;
    }
  }

  /** Generates the array of hex colour strings for each height level. */
  private generateHeightLevelColors(rgbPalette: RgbColour[]): string[] | null {
    if (!rgbPalette || rgbPalette.length < 1) {
      logger.error(
        `[SurfaceGen:${this.planetType}] Cannot generate height colours: RGB palette cache is invalid or empty.`
      );
      return null;
    }

    logger.info(`[SurfaceGen:${this.planetType}] Generating height level colours...`);
    const numPaletteColours = rgbPalette.length;
    const heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS);
    logger.debug(
      `[SurfaceGen:${this.planetType}] Interpolating ${numPaletteColours} palette colours across ${CONFIG.PLANET_HEIGHT_LEVELS} height levels...`
    );
    for (let h = 0; h < CONFIG.PLANET_HEIGHT_LEVELS; h++) {
      const colourIndexFloat = (h / (CONFIG.PLANET_HEIGHT_LEVELS - 1)) * (numPaletteColours - 1);
      const index1 = Math.max(0, Math.min(numPaletteColours - 1, Math.floor(colourIndexFloat)));
      const index2 = Math.min(numPaletteColours - 1, index1 + 1);
      const factor = colourIndexFloat - index1;

      let terrainRgb: RgbColour;
      if (index1 === index2 || factor === 0) {
        terrainRgb = rgbPalette[index1];
      } else if (index1 < numPaletteColours && index2 < numPaletteColours) {
        terrainRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor);
      } else {
        logger.warn(
          `[SurfaceGen:${this.planetType}] Height colour generation encountered invalid palette indices (${index1}, ${index2}) at height ${h}. Using fallback.`
        );
        terrainRgb = rgbPalette[index1]; // Fallback
      }
      heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b);
    }
    logger.info(`[SurfaceGen:${this.planetType}] Height level colours generated successfully.`);
    return heightLevelColors;
  }
} // End SurfaceGenerator class
