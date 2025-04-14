// src/entities/planet/surface_element_generator.ts
import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { ELEMENTS } from '../../constants';
import { logger } from '../../utils/logger';
import { PerlinNoise } from '../../generation/perlin';

/**
 * Generates the surface element map with sparsity.
 * Uses overall planet abundance, heightmap, and noise to distribute elements.
 *
 * @param planetType - The type of the planet.
 * @param mapSeed - The seed string for noise generation.
 * @param prng - The PRNG instance for this planet.
 * @param planetAbundance - Record of overall element abundance for the planet.
 * @param heightmap - The 2D heightmap array.
 * @returns The generated 2D surface element map (string[][]), or null on error.
 */
export function generateSurfaceElementMap(
  planetType: string, // Added planetType for logging context
  mapSeed: string,    // Added mapSeed for noise generator
  prng: PRNG,         // Added PRNG for cell choices
  planetAbundance: Record<string, number>,
  heightmap: number[][]
): string[][] | null {
  if (!heightmap) {
    logger.error("[SurfElemGen] Cannot generate element map without a valid heightmap.");
    return null;
  }
  const mapSize = heightmap.length;
  if (mapSize <= 0) {
    logger.error(`[SurfElemGen] Invalid mapSize (${mapSize}) for element map generation.`);
    return null;
  }

  logger.info(`[SurfElemGen:${planetType}] Generating ${mapSize}x${mapSize} surface element map...`);
  const surfaceMap: string[][] = Array.from({ length: mapSize }, () => new Array(mapSize).fill(''));

  // --- Prepare weighted list based on overall planet abundance ---
  const weightedPlanetElements: { key: string; weight: number }[] = [];
  let totalPlanetWeight = 0;
  for (const key in planetAbundance) {
    const abundance = planetAbundance[key];
    if (abundance > 0) {
      const weight = abundance;
      weightedPlanetElements.push({ key: key, weight: weight });
      totalPlanetWeight += weight;
    }
  }

  if (totalPlanetWeight <= 0) {
    logger.warn(`[SurfElemGen:${planetType}] No elements with abundance > 0 found for planet. Surface map will be empty.`);
    return surfaceMap;
  }

  // --- Initialize Noise Generator ---
  const elementNoiseGenerator = new PerlinNoise(mapSeed + "_elements"); // Use mapSeed

  // --- Generate map cell by cell ---
  const elementNoiseScale = 0.08;
  const heightInfluenceFactor = 0.4;
  const baseSparsityThreshold = 0.9995;
  const richnessFactor = 0.1;

  for (let y = 0; y < mapSize; y++) {
    for (let x = 0; x < mapSize; x++) {
      const elementClusterNoise = elementNoiseGenerator.get(x * elementNoiseScale, y * elementNoiseScale);
      const localRichnessNoise = elementNoiseGenerator.get(x * 0.2 + 100, y * 0.2 + 100);
      const heightVal = (heightmap[y]?.[x] ?? 0) / (CONFIG.PLANET_HEIGHT_LEVELS - 1);

      let localTotalWeight = 0;
      const localWeights: { key: string; adjustedWeight: number }[] = [];
      for (const element of weightedPlanetElements) {
        let adjustedWeight = element.weight;
        let noiseAffinity = 1.0 - Math.abs(elementClusterNoise);
        if (element.key === 'GOLD' || element.key === 'PLATINUM') {
          noiseAffinity = (elementClusterNoise > 0.6) ? 2.0 : 0.1;
        } else if (element.key === 'IRON' || element.key === 'SILICON') {
          noiseAffinity = 1.0;
        }
        adjustedWeight *= (0.5 + noiseAffinity);
        if (['IRON', 'LEAD', 'GOLD', 'PLATINUM', 'TUNGSTEN', 'URANIUM', 'RHODIUM', 'PALLADIUM', 'NICKEL', 'COPPER', 'ZINC', 'TIN', 'COBALT'].includes(element.key)) {
             adjustedWeight *= (1.0 - heightVal * heightInfluenceFactor);
        } else if (['ALUMINIUM', 'SILICON', 'LITHIUM', 'BORON', 'MAGNESIUM'].includes(element.key)) {
             adjustedWeight *= (0.8 + heightVal * heightInfluenceFactor);
        } else if (['WATER_ICE'].includes(element.key)) {
             adjustedWeight *= (0.5 + heightVal * heightInfluenceFactor * 1.5);
        }
        adjustedWeight = Math.max(0, adjustedWeight);

        if (adjustedWeight > 0) {
          localWeights.push({ key: element.key, adjustedWeight: adjustedWeight });
          localTotalWeight += adjustedWeight;
        }
      }

      let potentialElement = '';
      if (localTotalWeight > 0 && localWeights.length > 0) {
        const cellChoicePRNG = prng.seedNew(`elem_${x}_${y}`); // Use planet's PRNG seeded per cell
        let roll = cellChoicePRNG.random(0, localTotalWeight);
        for (const localElement of localWeights) {
          roll -= localElement.adjustedWeight;
          if (roll <= 0) {
            potentialElement = localElement.key;
            break;
          }
        }
        if (!potentialElement) potentialElement = localWeights[localWeights.length - 1].key;
      }

      let chosenElement = '';
      if (potentialElement) {
        const sparsityThreshold = baseSparsityThreshold * (1.0 - (localRichnessNoise + 1) / 2 * richnessFactor);
        const sparsityRoll = prng.random(); // Sparsity roll uses the main planet PRNG here
        if (sparsityRoll > sparsityThreshold) {
          chosenElement = potentialElement;
        }
      }
      if (surfaceMap[y] !== undefined) {
          surfaceMap[y][x] = chosenElement;
      } else {
          logger.warn(`[SurfElemGen] Invalid y index ${y} accessing surfaceMap.`);
      }
    }
  }

  logger.info(`[SurfElemGen:${planetType}] Surface element map generated successfully.`);
  return surfaceMap;
}