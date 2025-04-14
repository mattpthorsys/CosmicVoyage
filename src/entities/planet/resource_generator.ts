// FILE: src/entities/planet/resource_generator.ts
// Contains logic for generating planetary resource characteristics (element abundance, richness).

import { PRNG } from '../../utils/prng';
import { MineralRichness, ELEMENTS, ElementInfo } from '../../constants';
import { logger } from '../../utils/logger';

/** Calculates a base value for minerals based on richness (legacy or helper). */
function calculateBaseMinerals(prng: PRNG, richness: MineralRichness): number {
    let base: number;
    switch (richness) {
        case MineralRichness.ULTRA_POOR: base = prng.randomInt(5, 20); break;
        case MineralRichness.POOR: base = prng.randomInt(15, 40); break;
        case MineralRichness.AVERAGE: base = prng.randomInt(30, 70); break;
        case MineralRichness.RICH: base = prng.randomInt(60, 120); break;
        case MineralRichness.ULTRA_RICH: base = prng.randomInt(100, 200); break;
        default: base = 0;
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
         richChance = 0.25; poorChance = 0.15;
    } else if (planetType === 'Frozen') {
         richChance = 0.05; poorChance = 0.3;
    } else if (planetType === 'Oceanic') {
         richChance = 0.08; poorChance = 0.25;
    } else if (planetType === 'GasGiant' || planetType === 'IceGiant') {
         return MineralRichness.NONE; // No surface minerals
    }

    if (roll < richChance / 2) richness = MineralRichness.ULTRA_RICH;
    else if (roll < richChance) richness = MineralRichness.RICH;
    else if (roll < richChance + (1.0 - richChance - poorChance)) richness = MineralRichness.AVERAGE; // Average fills the middle
    else if (roll < 1.0 - poorChance / 2) richness = MineralRichness.POOR;
    else richness = MineralRichness.ULTRA_POOR;

    logger.debug(`[ResGen] Mineral richness determined: ${richness} (Roll: ${roll.toFixed(3)})`);
    // Calculate base minerals here if needed, or return it separately
    // const baseMinerals = calculateBaseMinerals(prng, richness);
    return richness;
    // Or return { richness, baseMinerals } if both are needed by caller
}


/** Calculates the relative abundance of various elements. */
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

    logger.debug(`[ResGen] Calculating element abundance (Type: ${planetType}, Temp: ${surfaceTemp}K, Lith: ${lithosphere}, Grav: ${gravity.toFixed(2)}g)...`);

    for (const key of elementKeys) {
        const element = ELEMENTS[key];
        if (!element || element.baseFrequency <= 0) continue; // Skip non-mineable or zero-frequency

        let weight = element.baseFrequency * prng.random(0.5, 1.5); // Base weight + randomness

        // Adjust weight based on planet type suitability
        if (element.typeHints && element.typeHints.includes(planetType)) weight *= 1.5;
        if ((planetType === 'GasGiant' || planetType === 'IceGiant') && !element.isGas) weight *= 0.01; // Heavy elements rare on gas giants

        if (element.meltingPoint !== undefined) {
            if ((planetType === 'Molten') && element.meltingPoint < surfaceTemp) weight *= 1.3; // More likely if molten
            if ((planetType === 'Frozen') && element.meltingPoint > surfaceTemp - 50) weight *= 0.5; // Less likely if solid when planet is frozen
        }

        // Adjust based on lithosphere description
        if (lithosphere.includes('Carbonaceous') && element.group === 'Carbon') weight *= 1.4;
        if (lithosphere.includes('Iron-Rich') && element.group === 'Metal') weight *= 1.3;
        if (lithosphere.includes('Silicate') && element.group === 'Silicate') weight *= 1.2;

        // Adjust based on gravity (heavier elements sink? slight effect)
        if(element.atomicWeight)
            weight *= (1 + (element.atomicWeight / 100) * (gravity - 1) * 0.1);
        
        // Adjust based on temperature (volatility)
        if (element.meltingPoint !== undefined) { // Check if meltingPoint exists
            if (element.meltingPoint < surfaceTemp - 200) weight *= 0.8;
            if (element.meltingPoint > surfaceTemp + 500) weight *= 1.1;
        }

        weight = Math.max(0.0001, weight); // Ensure minimum chance
        abundance[key] = weight;
        totalWeight += weight;
    }

    // Normalize to percentages
    if (totalWeight > 0) {
        for (const key of elementKeys) {
            if (abundance[key]) {
                abundance[key] = (abundance[key] / totalWeight) * 100;
            }
        }
    }

    logger.debug(`[ResGen] Final element abundance calculated: ${Object.keys(abundance).length} elements.`);
    return abundance;
}

/** Helper to get base minerals - exported if needed separately, otherwise keep internal */
export function getBaseMinerals(prng: PRNG, richness: MineralRichness): number {
    return calculateBaseMinerals(prng, richness);
}