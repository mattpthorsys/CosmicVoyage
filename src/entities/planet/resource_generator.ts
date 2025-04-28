// FILE: src/entities/planet/resource_generator.ts
// Contains logic for generating planetary resource characteristics (element abundance, richness).
// REFACTORED: Extracted weight adjustment logic into helper functions.

import { PRNG } from '../../utils/prng';
import { MineralRichness, ELEMENTS, ElementInfo } from '../../constants';
import { logger } from '../../utils/logger';

// --- Helper Functions for Weight Adjustment ---

/** Calculates weight adjustment based on planet type suitability. */
function _getElementTypeFactor(element: ElementInfo, planetType: string): number {
  let factor = 1.0;
  if (element.typeHints && element.typeHints.includes(planetType)) {
    factor *= 1.5; // Boost if type hint matches
  }
  // Penalize non-gases heavily on gas/ice giants
  if ((planetType === 'GasGiant' || planetType === 'IceGiant') && !element.isGas) {
    factor *= 0.01;
  }
  return factor;
}

/** Calculates weight adjustment based on temperature/melting point suitability. */
function _getTemperatureSuitabilityFactor(element: ElementInfo, planetType: string, surfaceTemp: number): number {
  let factor = 1.0;
  if (element.meltingPoint !== undefined) {
    // Check if meltingPoint exists
    // Boost elements molten at surface temp on Molten planets
    if (planetType === 'Molten' && element.meltingPoint < surfaceTemp) {
      factor *= 1.3;
    }
    // Penalize elements solid at surface temp on Frozen planets
    if (planetType === 'Frozen' && element.meltingPoint > surfaceTemp - 50) {
      // Check if solid
      factor *= 0.5;
    }
    // Penalize volatile elements if surface temp is high
    if (element.meltingPoint < surfaceTemp - 200) {
      // Significantly below surface temp
      factor *= 0.8;
    }
    // Slightly boost refractory elements if surface temp is high
    if (element.meltingPoint > surfaceTemp + 500) {
      // Significantly above surface temp
      factor *= 1.1;
    }
  }
  return factor;
}

/** Calculates weight adjustment based on lithosphere description. */
function _getLithosphereFactor(element: ElementInfo, lithosphere: string): number {
  let factor = 1.0;
  if (lithosphere.includes('Carbonaceous') && element.group === 'Carbon') factor *= 1.4;
  if (lithosphere.includes('Iron-Rich') && element.group === 'Metal') factor *= 1.3;
  if (lithosphere.includes('Silicate') && element.group === 'Silicate') factor *= 1.2;
  return factor;
}

/** Calculates weight adjustment based on gravity and atomic weight (heavier sinks). */
function _getGravityFactor(element: ElementInfo, gravity: number): number {
  let factor = 1.0;
  if (element.atomicWeight) {
    // Adjust slightly based on gravity relative to Earth (1 G)
    // Positive effect if gravity > 1 and weight > 100 (heavier sink)
    // Negative effect if gravity < 1 and weight > 100 (less likely to sink)
    // Positive effect if gravity < 1 and weight < 100 (lighter float)
    // Negative effect if gravity > 1 and weight < 100 (less likely to float)
    // Simplified: slightly increase heavy elements with high grav, decrease with low grav
    // Use a smaller coefficient (e.g., 0.05 instead of 0.1) for a subtler effect
    factor *= 1 + (element.atomicWeight / 100) * (gravity - 1) * 0.05;
  }
  return factor;
}

// --- Original Functions (Modified & Helpers) ---

/** Calculates a base value for minerals based on richness (legacy or helper). */
function calculateBaseMinerals(prng: PRNG, richness: MineralRichness): number {
  let base: number;
  switch (richness) {
    case MineralRichness.ULTRA_POOR:
      base = prng.randomInt(5, 20);
      break;
    case MineralRichness.POOR:
      base = prng.randomInt(15, 40);
      break;
    case MineralRichness.AVERAGE:
      base = prng.randomInt(30, 70);
      break;
    case MineralRichness.RICH:
      base = prng.randomInt(60, 120);
      break;
    case MineralRichness.ULTRA_RICH:
      base = prng.randomInt(100, 200);
      break;
    default:
      base = 0;
  }
  logger.debug(`[ResGen] Base minerals calculated for ${richness}: ${base}`);
  return base;
}

/** Determines the overall mineral richness category. */
export function determineMineralRichness(prng: PRNG, planetType: string): MineralRichness {
  let richness: MineralRichness;
  const roll = prng.random();
  // Base chance based on type
  let richChance = 0.1; // Base chance for RICH or ULTRA_RICH
  let poorChance = 0.2; // Base chance for POOR or ULTRA_POOR
  if (planetType === 'Rock' || planetType === 'Molten' || planetType === 'Lunar') {
    richChance = 0.25;
    poorChance = 0.15;
  } else if (planetType === 'Frozen') {
    richChance = 0.05;
    poorChance = 0.3;
  } else if (planetType === 'Oceanic') {
    richChance = 0.08;
    poorChance = 0.25;
  } else if (planetType === 'GasGiant' || planetType === 'IceGiant') {
    return MineralRichness.NONE; // No surface minerals
  }

  if (roll < richChance / 2) richness = MineralRichness.ULTRA_RICH;
  else if (roll < richChance) richness = MineralRichness.RICH;
  else if (roll < richChance + (1.0 - richChance - poorChance))
    richness = MineralRichness.AVERAGE; // Average fills the middle
  else if (roll < 1.0 - poorChance / 2) richness = MineralRichness.POOR;
  else richness = MineralRichness.ULTRA_POOR;

  logger.debug(`[ResGen] Mineral richness determined: ${richness} (Roll: ${roll.toFixed(3)})`);
  return richness;
}

/** Calculates the relative abundance of various elements using helper functions for weighting. */
export function calculateElementAbundance(
  prng: PRNG,
  planetType: string,
  surfaceTemp: number,
  lithosphere: string, // Pass lithosphere for context
  gravity: number // Pass gravity for context
): Record<string, number> {
  const abundance: Record<string, number> = {};
  let totalWeight = 0;
  const elementKeys = Object.keys(ELEMENTS);

  logger.debug(
    `[ResGen] Calculating element abundance (Type: ${planetType}, Temp: ${surfaceTemp}K, Lith: ${lithosphere}, Grav: ${gravity.toFixed(
      2
    )}g)...`
  );
  for (const key of elementKeys) {
    const element = ELEMENTS[key];
    if (!element || element.baseFrequency <= 0) continue; // Skip non-mineable or zero-frequency

    let weight = element.baseFrequency * prng.random(0.5, 1.5); // Base weight + randomness

    // Apply adjustment factors by calling helper functions
    weight *= _getElementTypeFactor(element, planetType);
    weight *= _getTemperatureSuitabilityFactor(element, planetType, surfaceTemp);
    weight *= _getLithosphereFactor(element, lithosphere);
    weight *= _getGravityFactor(element, gravity);
    // Removed the separate temperature/volatility factor as it's now part of _getTemperatureSuitabilityFactor

    weight = Math.max(0.0001, weight); // Ensure minimum chance
    abundance[key] = weight;
    totalWeight += weight;
  }

  // Normalize to percentages
  if (totalWeight > 0) {
    for (const key in abundance) {
      // Use `in` for Records
      if (Object.hasOwn(abundance, key)) {
        // Ensure it's own property
        abundance[key] = (abundance[key] / totalWeight) * 100;
      }
    }
  } else {
    logger.warn(`[ResGen:${planetType}] Total calculated element weight was zero. Abundance map will be empty.`);
  }

  logger.debug(`[ResGen] Final element abundance calculated: ${Object.keys(abundance).length} elements.`);
  return abundance;
}

/** Helper to get base minerals - exported if needed separately, otherwise keep internal */
export function getBaseMinerals(prng: PRNG, richness: MineralRichness): number {
  return calculateBaseMinerals(prng, richness);
}
