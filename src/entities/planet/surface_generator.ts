// src/entities/planet/surface_generator.ts (Added Sparsity Check)

import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateHeightmap } from './heightmap_generator';
import { generateSurfaceElementMap } from './surface_element_generator';
import { generateRgbPaletteCache, generateHeightLevelColors } from './surface_colour_generator';
import { RgbColour } from '../../rendering/colour';

// Interface for the generated surface data package
export interface SurfaceData {
  heightmap: number[][] | null;
  heightLevelColors: string[] | null;
  rgbPaletteCache: RgbColour[] | null;
  surfaceElementMap: string[][] | null;
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

    rgbPaletteCache = generateRgbPaletteCache(this.planetType);

    // --- Handle Gas Giants/Ice Giants (Palette Cache Only) ---
    if (this.planetType === 'GasGiant' || this.planetType === 'IceGiant') {
      if (!rgbPaletteCache) {
        logger.error(`[SurfaceGen:${this.planetType}] Failed to generate RGB palette.`);
      } else {
        logger.info(`[SurfaceGen:${this.planetType}] Generated RGB palette cache.`);
      }
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
        if (rgbPaletteCache) {
          heightLevelColors = generateHeightLevelColors(this.planetType, rgbPaletteCache);
          if (heightLevelColors) {
            logger.info(
              `[SurfaceGen:${this.planetType}] Generated heightmap (${heightmap.length}x${heightmap.length}), element map, and height level colours.`
            );
          } else {
            logger.error(`[SurfaceGen:${this.planetType}] Failed to generate height level colours.`);
          }
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
} // End SurfaceGenerator class
