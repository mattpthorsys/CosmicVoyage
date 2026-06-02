// Place this function in src/entities/planet/surface_element_generator.ts
// It replaces the existing generateSurfaceElementMap function.

import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { ELEMENTS, MineralRichness } from '../../constants'; // Ensure ELEMENTS is imported
import { logger } from '../../utils/logger';
import { PerlinNoise } from '../../generation/perlin';

export interface SurfaceElementGenerationProfile {
  mineralRichness?: MineralRichness;
  baseMinerals?: number;
  metallicityFeH?: number;
  surfaceTemp?: number;
  hydrosphere?: string;
}

const VOLATILE_KEYS = new Set(['DEUTERIUM', 'WATER_ICE', 'AMMONIA_ICE', 'METHANE_ICE', 'HYDROGEN', 'HELIUM']);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRichnessDensityFactor(richness: MineralRichness = MineralRichness.AVERAGE): number {
  switch (richness) {
    case MineralRichness.NONE:
      return 0;
    case MineralRichness.ULTRA_POOR:
      return 0.42;
    case MineralRichness.POOR:
      return 0.68;
    case MineralRichness.RICH:
      return 1.45;
    case MineralRichness.ULTRA_RICH:
      return 2.1;
    case MineralRichness.AVERAGE:
    default:
      return 1;
  }
}

function getColdVolatileFactor(surfaceTemp: number | undefined): number {
  if (surfaceTemp === undefined) return 1;
  if (surfaceTemp <= 90) return 1.9;
  if (surfaceTemp <= 150) return 1.65;
  if (surfaceTemp <= 230) return 1.35;
  if (surfaceTemp <= 273) return 1.12;
  if (surfaceTemp <= 320) return 0.72;
  return 0.32;
}

function getVolatileAbundance(planetAbundance: Record<string, number>): number {
  return Object.entries(planetAbundance).reduce((sum, [key, abundance]) => {
    return VOLATILE_KEYS.has(key) ? sum + Math.max(0, abundance) : sum;
  }, 0);
}

/**
 * Generates the surface element map with sparsity, considering altitude.
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
  planetType: string, // For logging context
  mapSeed: string,    // For noise generator
  prng: PRNG,         // For cell choices
  planetAbundance: Record<string, number>,
  heightmap: number[][],
  profile: SurfaceElementGenerationProfile = {}
): string[][] | null {
  if (!heightmap || heightmap.length === 0 || !heightmap[0] || heightmap[0].length !== heightmap.length) {
    logger.error("[SurfElemGen] Cannot generate element map: Invalid heightmap provided.");
    return null;
  }
  const mapSize = heightmap.length;
  const maxPossibleHeight = CONFIG.PLANET_HEIGHT_LEVELS - 1; // Max value from heightmap normalization

  logger.info(`[SurfElemGen:${planetType}] Generating ${mapSize}x${mapSize} surface element map (with altitude factor)...`);
  const surfaceMap: string[][] = Array.from({ length: mapSize }, () => new Array(mapSize).fill(''));

  // --- Prepare weighted list based on overall planet abundance ---
  const weightedPlanetElements: { key: string; weight: number }[] = [];
  let totalPlanetWeight = 0;
  for (const key in planetAbundance) {
    const abundance = planetAbundance[key];
    if (abundance > 0 && ELEMENTS[key]) { // Check if element exists in constants
      const weight = abundance; // Use overall abundance as base weight
      weightedPlanetElements.push({ key: key, weight: weight });
      totalPlanetWeight += weight;
    }
  }

  if (totalPlanetWeight <= 0) {
    logger.warn(`[SurfElemGen:${planetType}] No elements with abundance > 0 found for planet. Surface map will be empty.`);
    return surfaceMap; // Return empty map
  }

  // --- Initialize Noise Generator for Clustering ---
  // Use a different seed for element clustering than the heightmap itself
  const elementNoiseGenerator = new PerlinNoise(mapSeed + "_elements_cluster");
  const elementNoiseScale = 0.08; // Controls the size of element clusters

  // --- Noise Generator for Sparsity/Richness Patches ---
  const richnessNoiseGenerator = new PerlinNoise(mapSeed + "_elements_richness");
  const richnessNoiseScale = 0.15; // Controls the size of richness patches

  // --- Sparsity Settings ---
  const richnessDensityFactor = getRichnessDensityFactor(profile.mineralRichness);
  const baseMineralFactor = clamp(0.65 + (profile.baseMinerals ?? 45) / 90, 0.45, 2.35);
  const metalDensityFactor = clamp(Math.pow(10, (profile.metallicityFeH ?? 0) * 0.12), 0.78, 1.28);
  const volatileDensityFactor = clamp(
    1 + (getVolatileAbundance(planetAbundance) / 100) * getColdVolatileFactor(profile.surfaceTemp) * 0.72,
    1,
    2.1
  );
  const depositDensityFactor = clamp(
    richnessDensityFactor * baseMineralFactor * metalDensityFactor * volatileDensityFactor,
    0,
    3.1
  );
  const depositFrequencyScale = 0.2;
  const baseSparsity = 0.005 * depositDensityFactor * depositFrequencyScale; // Base chance of finding any deposit.
  const richnessInfluence = 0.3 * depositDensityFactor * depositFrequencyScale; // Rich worlds have broader deposit patches.

  // --- Generate map cell by cell ---
  for (let y = 0; y < mapSize; y++) {
    for (let x = 0; x < mapSize; x++) {

      // 1. Determine if *anything* should spawn here (Sparsity Check)
      const richnessNoise = (richnessNoiseGenerator.get(x * richnessNoiseScale, y * richnessNoiseScale) + 1) / 2; // Noise 0-1
      const localSparsityThreshold = clamp(baseSparsity + richnessNoise * richnessInfluence, 0, 0.58); // Cells in rich areas are less sparse
      const cellChoicePRNG = prng.seedNew(`elem_cell_${x}_${y}`);
      const sparsityRoll = cellChoicePRNG.random();

      if (sparsityRoll > localSparsityThreshold) {
        surfaceMap[y][x] = ''; // Cell remains empty
        continue; // Skip to next cell
      }

      // 2. Calculate Element Weights for this specific cell
      const elementClusterNoise = (elementNoiseGenerator.get(x * elementNoiseScale, y * elementNoiseScale) + 1) / 2; // Noise 0-1
      // Normalize heightmap value to 0-1 range
      const heightVal = (heightmap[y]?.[x] ?? 0) / maxPossibleHeight;

      let localTotalWeight = 0;
      const localWeights: { key: string; adjustedWeight: number }[] = [];

      for (const elementData of weightedPlanetElements) {
        const key = elementData.key;
        const elementInfo = ELEMENTS[key]; // Get full element info
        let adjustedWeight = elementData.weight; // Start with base planet abundance weight

        // --- Noise Affinity (Clustering) ---
        // Make some elements prefer clustering, others more uniform
        let noiseAffinityFactor = 1.0;
        // Example: Precious metals strongly cluster where noise is high
        if (['GOLD', 'PLATINUM', 'RHODIUM', 'PALLADIUM', 'URANIUM'].includes(key)) {
            noiseAffinityFactor = Math.pow(elementClusterNoise, 3); // Sharp peak at high noise
        } else if (key === 'DEUTERIUM') {
            noiseAffinityFactor = planetType === 'Frozen'
              ? 0.35 + Math.pow(elementClusterNoise, 2.2) * 1.65
              : 0.25 + Math.pow(elementClusterNoise, 3.0) * 1.35;
        } else if (elementInfo.group === 'Ice') {
            noiseAffinityFactor = 0.28 + Math.pow(elementClusterNoise, 2.0) * 1.55;
        } else if (['IRON', 'SILICON', 'CARBON'].includes(key)) {
            noiseAffinityFactor = 0.8 + elementClusterNoise * 0.4; // More uniform, slight cluster preference
        } // Add more rules as needed...
        adjustedWeight *= noiseAffinityFactor;

        // --- Altitude Affinity ---
        let altitudeFactor = 1.0;
        // Heavier elements slightly more common lower down
        if (key === 'DEUTERIUM') {
             altitudeFactor = planetType === 'Oceanic'
               ? 0.55 + (1.0 - heightVal) * 1.1
               : 0.45 + Math.pow(heightVal, 1.7) * 1.8;
        }
        else if (elementInfo.atomicWeight > 100) { // e.g., Lead, Uranium, Tungsten, Gold, Platinum etc.
             altitudeFactor = (1.0 - heightVal * 0.5); // Decrease weight by up to 50% at max height
        }
        // Lighter crustal elements slightly more common higher up
        else if (elementInfo.atomicWeight < 30 && elementInfo.group !== 'Gas' && elementInfo.group !== 'Noble' && elementInfo.group !== 'Ice') { // e.g., Li, B, C, Mg, Al, Si, P, S
             altitudeFactor = (0.7 + heightVal * 0.6); // Increase weight by up to 30% at max height (from base 0.7)
        }
        // Ices much more common higher up (colder)
        else if (elementInfo.group === 'Ice') {
             altitudeFactor = Math.pow(heightVal, 2) * 2.0; // Strong preference for high altitude
        }
        adjustedWeight *= altitudeFactor;

        if (VOLATILE_KEYS.has(key)) {
          adjustedWeight *= getColdVolatileFactor(profile.surfaceTemp);
          if (planetType === 'Frozen') adjustedWeight *= 1.45;
          if (planetType === 'Oceanic' && key === 'DEUTERIUM') adjustedWeight *= 1.25;
        }
        if (elementInfo.group === 'Metal' || elementInfo.group === 'Actinide' || elementInfo.group === 'Lanthanide' || elementInfo.group === 'Metalloid') {
          adjustedWeight *= clamp(Math.pow(10, (profile.metallicityFeH ?? 0) * 0.18), 0.65, 1.55);
        }

        // --- Temperature Affinity (Simple proxy using altitude) ---
        // Volatiles less likely at lowest (hottest proxy) altitudes
        if (elementInfo.meltingPoint < 300 && heightVal < 0.1) { // MP < 300K and lowest 10% altitude
            adjustedWeight *= 0.1;
        }

        // Ensure non-negative weight
        adjustedWeight = Math.max(0, adjustedWeight);

        if (adjustedWeight > 0) {
          localWeights.push({ key: key, adjustedWeight: adjustedWeight });
          localTotalWeight += adjustedWeight;
        }
      }

      // 3. Choose Element based on Local Weights
      let potentialElement = '';
      if (localTotalWeight > 0 && localWeights.length > 0) {
        let roll = cellChoicePRNG.random(0, localTotalWeight);
        for (const localElement of localWeights) {
          roll -= localElement.adjustedWeight;
          if (roll <= 0) {
            potentialElement = localElement.key;
            break;
          }
        }
        // Fallback if precision issues occur
        if (!potentialElement) potentialElement = localWeights[localWeights.length - 1].key;
      }

      // Assign the chosen element (only if sparsity check passed earlier)
      surfaceMap[y][x] = potentialElement;

    } // end x loop
  } // end y loop

  logger.info(`[SurfElemGen:${planetType}] Surface element map generated successfully (with altitude factor).`);
  return surfaceMap;
} // End generateSurfaceElementMap function
