// FILE: src/entities/planet/temperature_calculator.ts
// Contains logic for calculating planetary surface temperature.

import { Atmosphere } from '../../entities/planet';
import { PLANET_TYPES, SPECTRAL_TYPES } from '../../constants';
import { logger } from '../../utils/logger';

/** Calculates surface temperature based on various factors. */
export function calculateSurfaceTemp(
    planetType: string,
    orbitDistance: number,
    parentStarType: string,
    atmosphere: Atmosphere // Pass generated atmosphere
): number {
    logger.debug(`[TempCalc] Calculating surface temp (Orbit: ${orbitDistance.toFixed(0)})...`);
    const starInfo = SPECTRAL_TYPES[parentStarType];
    const starTemp = starInfo?.temp ?? SPECTRAL_TYPES['G'].temp;
    const starLuminosityFactor = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4;
    const distFactor = (50000 / Math.max(1000, orbitDistance)) ** 2; // Inverse square law
    let basePlanetTemp = PLANET_TYPES[planetType]?.baseTemp ?? 300; // Get base temp from type
    let temp = basePlanetTemp * (starLuminosityFactor * distFactor) ** 0.25; // Apply radiation balance
    logger.debug(`[TempCalc] Temp before greenhouse: ${temp.toFixed(1)}K`);

    // Greenhouse effect based on atmosphere
    let greenhouseFactor = 1.0;
    if (atmosphere.density === 'Earth-like') greenhouseFactor = 1.15;
    else if (atmosphere.density === 'Thick') greenhouseFactor = 1.6;

    const co2 = atmosphere.composition['Carbon Dioxide'] || 0;
    const methane = atmosphere.composition['Methane'] || 0;
    if (co2 > 50 || methane > 20) greenhouseFactor *= 1.3; // Stronger effect

    temp *= greenhouseFactor;
    logger.debug(`[TempCalc] Temp after greenhouse (${greenhouseFactor.toFixed(2)}x): ${temp.toFixed(1)}K`);

    // Further adjustments based on type
    if (planetType === 'Frozen' || planetType === 'IceGiant') temp *= 0.8; // Higher albedo
    if (planetType === 'Molten' || planetType === 'Lunar') temp *= 1.05; // Lower albedo/internal heat?

    const finalTemp = Math.max(2, Math.round(temp)); // Ensure minimum temp, round
    logger.debug(`[TempCalc] Final Surface Temp: ${finalTemp}K`);
    return finalTemp;
}