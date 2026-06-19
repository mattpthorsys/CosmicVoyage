import { PRNG } from '../../utils/prng';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateHeightmap } from './heightmap_generator';
import { generateSurfaceElementMap, SurfaceElementGenerationProfile } from './surface_element_generator';
import { generateRgbPaletteCache, generateHeightLevelColors } from './surface_colour_generator';
import { createSurfaceLiquidOverlay, isLiquidCovered, SurfaceLiquidOverlay } from './surface_liquid';
import { RgbColour } from '../../rendering/colour';

// Interface for the generated surface data package
export interface SurfaceData {
  heightmap: number[][] | null;
  heightLevelColors: string[] | null;
  rgbPaletteCache: RgbColour[] | null;
  surfaceElementMap: string[][] | null;
  liquidOverlay: SurfaceLiquidOverlay | null;
}

export interface SurfaceGenerationRequest {
  planetType: string;
  mapSeed: string;
  prngSeed: string;
  atmosphere: Atmosphere;
  planetAbundance: Record<string, number>;
  profile?: SurfaceElementGenerationProfile;
}

/** Worker-safe pure surface generation entry point. */
export function generateSurfaceDataFromRequest(request: SurfaceGenerationRequest): SurfaceData {
  return generateSurfaceDataInternal(
    request.planetType,
    request.mapSeed,
    new PRNG(request.prngSeed),
    request.atmosphere,
    request.planetAbundance,
    request.profile ?? {}
  );
}

/** Generates surface data (heightmap, colours, palettes, element map) for a planet. */
export class SurfaceGenerator {
  private prng: PRNG;
  private planetType: string;
  private mapSeed: string;
  private atmosphere: Atmosphere; // Needed for crater check

  /** Initializes SurfaceGenerator. */
  constructor(planetType: string, mapSeed: string, prng: PRNG, atmosphere: Atmosphere) {
    this.planetType = planetType;
    this.mapSeed = mapSeed;
    this.prng = prng; // Use the planet-specific PRNG
    this.atmosphere = atmosphere;

    logger.debug(`[SurfaceGen] Initialized for Type: ${planetType}, Seed: ${mapSeed}. Element Noise Seeded.`);
  }

  /** Generates all necessary surface data based on planet type. */
  generateSurfaceData(
    planetAbundance: Record<string, number>,
    profile: SurfaceElementGenerationProfile = {}
  ): SurfaceData {
    return generateSurfaceDataInternal(
      this.planetType,
      this.mapSeed,
      this.prng,
      this.atmosphere,
      planetAbundance,
      profile
    );
  }
} // End SurfaceGenerator class

/** Generates surface data internal. */
function generateSurfaceDataInternal(
  planetType: string,
  mapSeed: string,
  prng: PRNG,
  atmosphere: Atmosphere,
  planetAbundance: Record<string, number>,
  profile: SurfaceElementGenerationProfile = {}
): SurfaceData {
  logger.info(`[SurfaceGen:${planetType}] Generating surface data...`);
  let heightmap: number[][] | null = null;
  let heightLevelColors: string[] | null = null;
  let rgbPaletteCache: RgbColour[] | null = null;
  let surfaceElementMap: string[][] | null = null;
  let liquidOverlay: SurfaceLiquidOverlay | null = null;

  rgbPaletteCache = generateRgbPaletteCache(planetType);

  // --- Handle Gas Giants/Ice Giants (Palette Cache Only) ---
  if (planetType === 'GasGiant' || planetType === 'IceGiant') {
    if (!rgbPaletteCache) {
      logger.error(`[SurfaceGen:${planetType}] Failed to generate RGB palette.`);
    } else {
      logger.info(`[SurfaceGen:${planetType}] Generated RGB palette cache.`);
    }
  }
  // --- Handle Solid Planets (Heightmap, Colors, Element Map) ---
  else {
    heightmap = generateHeightmap(mapSeed, planetType, atmosphere);

    if (heightmap) {
      liquidOverlay = createSurfaceLiquidOverlay({
        planetType,
        hydrosphere: profile.hydrosphere ?? '',
        surfaceTemp: profile.surfaceTemp ?? 288,
        atmosphere,
        heightmap,
      });

      surfaceElementMap = generateSurfaceElementMap(
        planetType,
        mapSeed,
        prng,
        planetAbundance,
        heightmap,
        profile
      );

      if (!surfaceElementMap) {
        logger.error(`[SurfaceGen:${planetType}] Surface element map generation failed.`);
      } else if (liquidOverlay) {
        surfaceElementMap = maskSubmergedElements(surfaceElementMap, heightmap, liquidOverlay);
      }

      if (rgbPaletteCache) {
        heightLevelColors = generateHeightLevelColors(planetType, rgbPaletteCache);
        if (heightLevelColors) {
          logger.info(
            `[SurfaceGen:${planetType}] Generated heightmap (${heightmap.length}x${heightmap.length}), element map, and height level colours.`
          );
        } else {
          logger.error(`[SurfaceGen:${planetType}] Failed to generate height level colours.`);
        }
      } else {
        logger.error(
          `[SurfaceGen:${planetType}] Failed to generate RGB palette, cannot generate height level colours.`
        );
        heightLevelColors = null;
      }
    } else {
      logger.error(
        `[SurfaceGen:${planetType}] Heightmap generation failed. Cannot generate colours or element map.`
      );
      heightLevelColors = null;
      rgbPaletteCache = null;
      surfaceElementMap = null;
    }
  }

  return { heightmap, heightLevelColors, rgbPaletteCache, surfaceElementMap, liquidOverlay };
}

/** Masks submerged elements. */
function maskSubmergedElements(
  elementMap: string[][],
  heightmap: number[][],
  liquidOverlay: SurfaceLiquidOverlay
): string[][] {
  return elementMap.map((row, y) =>
    row.map((element, x) => (isLiquidCovered(heightmap[y]?.[x] ?? 0, liquidOverlay) ? '' : element))
  );
}
