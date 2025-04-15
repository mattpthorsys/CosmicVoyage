// Place this function in src/entities/planet/temperature_calculator.ts
// It replaces the existing calculateSurfaceTemp function.

import { Atmosphere } from '../../entities/planet';
import { PLANET_TYPES, SPECTRAL_TYPES } from '../../constants';
import { logger } from '../../utils/logger';

// --- Physical Constants ---
const STEFAN_BOLTZMANN_SIGMA = 5.670374419e-8; // W m^-2 K^-4

// --- Estimated Albedos (Reflectivity: 0=absorbs all, 1=reflects all) ---
// These are approximate values, adjust as needed for gameplay balance
const PLANET_ALBEDOS: Record<string, number> = {
    'Molten':   0.08, // Very dark, absorbs heat
    'Rock':     0.25, // Varies, average rock/soil
    'Oceanic':  0.15, // Dark water absorbs, clouds/ice reflect more
    'Lunar':    0.12, // Dark regolith
    'GasGiant': 0.35, // Depends on clouds, Jupiter ~0.34
    'IceGiant': 0.30, // Depends on clouds, Neptune ~0.29
    'Frozen':   0.70, // High reflectivity for ice/snow
    'Default':  0.30  // Fallback
};


/**
 * Calculates surface temperature based on stellar radiation, distance, albedo, and greenhouse effect.
 * Uses MKS units internally.
 * @param planetType - The type string of the planet.
 * @param orbitDistance_m - The orbital distance in METERS.
 * @param parentStarType - The spectral type of the parent star.
 * @param atmosphere - The planet's generated atmosphere object.
 * @returns The calculated average surface temperature in Kelvin (K), or a default value on error.
 */
export function calculateSurfaceTemp(
    planetType: string,
    orbitDistance_m: number,
    parentStarType: string,
    atmosphere: Atmosphere // Pass generated atmosphere
): number {
    logger.debug(`[TempCalc] Calculating surface temp (Type: ${planetType}, Orbit: ${orbitDistance_m.toExponential(2)}m)...`);

    const starInfo = SPECTRAL_TYPES[parentStarType];
    if (!starInfo || !starInfo.temp || !starInfo.radius || starInfo.radius <= 0) {
        logger.error(`[TempCalc] Missing or invalid star data (Temp/Radius) for type ${parentStarType}. Using fallback temp.`);
        return PLANET_TYPES[planetType]?.baseTemp ?? 280; // Fallback to old base temp
    }

    const starTemp_K = starInfo.temp;
    const starRadius_m = starInfo.radius;

    // 1. Calculate Star's Total Luminosity (Watts) using Stefan-Boltzmann Law
    // L = 4 * pi * R^2 * sigma * T^4
    const starSurfaceArea_m2 = 4 * Math.PI * Math.pow(starRadius_m, 2);
    const starLuminosity_W = starSurfaceArea_m2 * STEFAN_BOLTZMANN_SIGMA * Math.pow(starTemp_K, 4);

    if (!Number.isFinite(starLuminosity_W) || starLuminosity_W <= 0) {
         logger.error(`[TempCalc] Calculated invalid star luminosity (${starLuminosity_W} W). Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    logger.debug(`[TempCalc] Star Luminosity: ${starLuminosity_W.toExponential(3)} W`);

    // 2. Calculate Energy Flux at Planet's Orbit (W/m^2)
    // Flux = L / (4 * pi * D^2)
    const orbitalSphereArea_m2 = 4 * Math.PI * Math.pow(orbitDistance_m, 2);
    if (!Number.isFinite(orbitalSphereArea_m2) || orbitalSphereArea_m2 <= 0) {
         logger.error(`[TempCalc] Calculated invalid orbital sphere area for distance ${orbitDistance_m.toExponential(2)}m. Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    const flux_W_m2 = starLuminosity_W / orbitalSphereArea_m2;
    logger.debug(`[TempCalc] Flux at orbit: ${flux_W_m2.toExponential(3)} W/m^2`);

    // 3. Estimate Planetary Albedo
    const albedo = PLANET_ALBEDOS[planetType] ?? PLANET_ALBEDOS['Default'];
    logger.debug(`[TempCalc] Estimated Albedo: ${albedo}`);

    // 4. Calculate Equilibrium Temperature (K) - Temperature without greenhouse effect
    // AbsorbedFlux = sigma * T_eq^4 --> T_eq = (AbsorbedFlux / sigma)^(1/4)
    // AbsorbedFlux = IncidentFlux * (1 - albedo)
    const absorbedFlux = flux_W_m2 * (1 - albedo);
    if (!Number.isFinite(absorbedFlux) || absorbedFlux < 0) {
         logger.error(`[TempCalc] Calculated invalid absorbed flux (${absorbedFlux}). Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    const equilibriumTemp_K = Math.pow(absorbedFlux / STEFAN_BOLTZMANN_SIGMA, 0.25);

    if (!Number.isFinite(equilibriumTemp_K)) {
         logger.error(`[TempCalc] Calculated non-finite equilibrium temperature (${equilibriumTemp_K}). Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    logger.debug(`[TempCalc] Equilibrium Temp (no greenhouse): ${equilibriumTemp_K.toFixed(1)}K`);

    // 5. Apply Greenhouse Effect based on atmosphere
    // (Using the same logic as before, but applying to equilibriumTemp_K)
    let greenhouseFactor = 1.0;
    let greenhouseDesc = "None";
    if (atmosphere.density === 'Thin') {
        greenhouseFactor = 1.05 + (atmosphere.pressure / 0.5) * 0.05; // Small effect, scales slightly with pressure
        greenhouseDesc = "Slight";
    } else if (atmosphere.density === 'Earth-like') {
        greenhouseFactor = 1.10 + (atmosphere.pressure / 1.0) * 0.15; // Moderate effect
        greenhouseDesc = "Moderate";
    } else if (atmosphere.density === 'Thick') {
        greenhouseFactor = 1.25 + (atmosphere.pressure / 2.0) * 0.35; // Significant effect, scales more with pressure
        greenhouseDesc = "Significant";
    }

    // Bonus for specific gases
    const co2 = atmosphere.composition['Carbon Dioxide'] || 0;
    const methane = atmosphere.composition['Methane'] || 0;
    const waterVapor = atmosphere.composition['Water Vapor'] || 0;
    let gasBonus = 1.0;
    if (co2 > 20 || methane > 5 || waterVapor > 1) gasBonus *= 1.15; // More sensitive bonus
    if (co2 > 80 || methane > 20 || waterVapor > 5) gasBonus *= 1.25; // Runaway potential

    greenhouseFactor *= gasBonus;
    greenhouseFactor = Math.max(1.0, Math.min(greenhouseFactor, 3.0)); // Clamp factor to avoid extremes

    logger.debug(`[TempCalc] Greenhouse: Density=${atmosphere.density}, Pressure=${atmosphere.pressure.toFixed(3)}, CO2=${co2}%, CH4=${methane}%, H2O=${waterVapor}% -> Factor=${greenhouseFactor.toFixed(2)} (${greenhouseDesc}, GasBonus=${gasBonus.toFixed(2)})`);

    const surfaceTemp_K = equilibriumTemp_K * greenhouseFactor;

    // Final clamping and rounding
    const finalTemp = Math.max(2, Math.round(surfaceTemp_K)); // Ensure minimum temp above absolute zero

    if (!Number.isFinite(finalTemp)) {
         logger.error(`[TempCalc] Calculated final temperature is non-finite (${finalTemp}). Equilibrium: ${equilibriumTemp_K}, Factor: ${greenhouseFactor}. Using fallback.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }

    logger.debug(`[TempCalc] Final Surface Temp: ${finalTemp}K`);
    return finalTemp;
}