// src/entities/planet/heightmap_generator.ts
import { HeightmapGenerator as BaseHeightmapGenerator } from '../../generation/heightmap';
import { CONFIG } from '../../config';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet'; // Import type for crater check

/**
 * Generates a planetary heightmap, potentially adding craters based on type/atmosphere.
 *
 * @param mapSeed - The seed string for the heightmap PRNG.
 * @param planetType - The type of the planet (e.g., 'Rock', 'Lunar').
 * @param atmosphere - The planet's atmosphere object (for crater determination).
 * @returns The generated 2D heightmap array, or null on error.
 */
export function generateHeightmap(
  mapSeed: string,
  planetType: string,
  atmosphere: Atmosphere
): number[][] | null {
  logger.info(
    `[HeightmapGenFunc] Generating heightmap for ${planetType} (Seed: ${mapSeed})...`
  );
  const mapSizeTarget = CONFIG.PLANET_MAP_BASE_SIZE;
  try {
    const generator = new BaseHeightmapGenerator(
      mapSizeTarget,
      CONFIG.PLANET_SURFACE_ROUGHNESS,
      mapSeed // Use the specific map seed
    );
    let generatedMap = generator.generate(); // Generate the base map

    if (
      !generatedMap ||
      generatedMap.length < 1 ||
      generatedMap[0].length !== generatedMap.length
    ) {
      throw new Error('BaseHeightmapGenerator returned invalid map dimensions.');
    }

    // Add craters for specific types after base generation
    if (
      planetType === 'Lunar' ||
      (planetType === 'Rock' && (!atmosphere || atmosphere.density === 'None'))
    ) {
      generatedMap = addCratersToHeightmap(
        generatedMap,
        generator['prng'] // Access the PRNG from the generator instance
      ); // Modifies map in place
    }

    logger.info(
      `[HeightmapGenFunc] Generated ${generatedMap.length}x${generatedMap.length} heightmap for ${planetType}.`
    );
    return generatedMap;
  } catch (error) {
    logger.error(
      `[HeightmapGenFunc] Heightmap generation failed for ${planetType}: ${error}`
    );
    return null;
  }
}

/**
 * Adds impact craters to a given heightmap.
 * (Internal helper function, copied and adapted from the original SurfaceGenerator)
 *
 * @param heightmap - The 2D heightmap array to modify.
 * @param craterPRNG - The PRNG instance to use for crater generation.
 * @returns The modified heightmap array.
 */
function addCratersToHeightmap(
  heightmap: number[][],
  craterPRNG: import('../../utils/prng').PRNG // Use imported PRNG type
): number[][] {
  if (!heightmap) return heightmap;
  const mapSize = heightmap.length;
  if (mapSize <= 0) return heightmap;

  logger.info(`[CraterFunc] Adding impact craters...`);
  const numCraters = craterPRNG.randomInt(
    Math.floor(mapSize / 15),
    Math.floor(mapSize / 5)
  );
  logger.debug(`[CraterFunc] Generating ${numCraters} craters.`);

  for (let i = 0; i < numCraters; i++) {
    const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10)));
    const cx = craterPRNG.randomInt(0, mapSize - 1);
    const cy = craterPRNG.randomInt(0, mapSize - 1);
    const depthFactor = craterPRNG.random(0.5, 2.0);
    const rimFactor = craterPRNG.random(0.1, 0.3);
    const maxDepth = r * depthFactor;
    const rimHeight = maxDepth * rimFactor;
    const startY = Math.max(0, cy - r - 2);
    const endY = Math.min(mapSize - 1, cy + r + 2);
    const startX = Math.max(0, cx - r - 2);
    const endX = Math.min(mapSize - 1, cx + r + 2);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq <= (r + 1) ** 2) {
          const dist = Math.sqrt(distSq);
          const currentH = heightmap[y]?.[x] ?? 0; // Add nullish coalescing for safety
          let deltaH = 0;
          if (dist < r)
            deltaH -= maxDepth * ((Math.cos((dist / r) * Math.PI) + 1) / 2); // Depression
          const rimPeakDist = r * 0.85;
          const rimWidth = r * 0.3;
          if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) {
            deltaH +=
              rimHeight *
              ((Math.cos(((dist - rimPeakDist) / rimWidth) * Math.PI) + 1) /
                2); // Rim
          }
          // Ensure heightmap access is valid before writing
          if (heightmap[y] !== undefined) {
              heightmap[y][x] = Math.max(
                  0,
                  Math.min(
                      CONFIG.PLANET_HEIGHT_LEVELS - 1,
                      Math.round(currentH + deltaH)
                  )
              );
          } else {
               logger.warn(`[CraterFunc] Invalid heightmap access at y=${y}`);
          }
        }
      }
    }
  }
  logger.info(`[CraterFunc] Finished adding ${numCraters} craters.`);
  return heightmap;
}