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
    // Use a slightly different logger prefix for clarity
    const logPrefix = `[TempCalc:${planetType}]`;
    logger.debug(`${logPrefix} Calculating surface temp (Orbit: ${orbitDistance_m.toExponential(2)}m)...`);

    const starInfo = SPECTRAL_TYPES[parentStarType];
    // Ensure starInfo and necessary properties (temp, radius) exist and are valid numbers
    if (!starInfo || typeof starInfo.temp !== 'number' || typeof starInfo.radius !== 'number' || starInfo.radius <= 0 || !Number.isFinite(starInfo.temp) || !Number.isFinite(starInfo.radius)) {
        logger.error(`${logPrefix} Missing or invalid star data (Temp/Radius) for type ${parentStarType}. Using fallback temp.`);
        return PLANET_TYPES[planetType]?.baseTemp ?? 280; // Fallback to old base temp
    }

    const starTemp_K = starInfo.temp;
    const starRadius_m = starInfo.radius;

    // --- 1. Calculate Star's Total Luminosity (Watts) ---
    const starSurfaceArea_m2 = 4 * Math.PI * Math.pow(starRadius_m, 2);
    const starLuminosity_W = starSurfaceArea_m2 * STEFAN_BOLTZMANN_SIGMA * Math.pow(starTemp_K, 4);

    if (!Number.isFinite(starLuminosity_W) || starLuminosity_W <= 0) {
         logger.error(`${logPrefix} Calculated invalid star luminosity (${starLuminosity_W} W). Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    logger.debug(`${logPrefix} Star Luminosity: ${starLuminosity_W.toExponential(3)} W`);

    // --- 2. Calculate Energy Flux at Planet's Orbit (W/m^2) ---
    if (!Number.isFinite(orbitDistance_m) || orbitDistance_m <= 0) {
        logger.error(`${logPrefix} Invalid orbit distance (${orbitDistance_m}m). Using fallback temp.`);
        return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    const orbitalSphereArea_m2 = 4 * Math.PI * Math.pow(orbitDistance_m, 2);

    // Check for potential division by zero or invalid area
    if (!Number.isFinite(orbitalSphereArea_m2) || orbitalSphereArea_m2 <= 0) {
         logger.error(`${logPrefix} Calculated invalid orbital sphere area for distance ${orbitDistance_m.toExponential(2)}m. Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    const flux_W_m2 = starLuminosity_W / orbitalSphereArea_m2;
    logger.debug(`${logPrefix} Flux at orbit: ${flux_W_m2.toExponential(3)} W/m^2`);

    // --- 3. Estimate Planetary Albedo ---
    const albedo = PLANET_ALBEDOS[planetType] ?? PLANET_ALBEDOS['Default'];
    logger.debug(`${logPrefix} Estimated Albedo: ${albedo}`);

    // --- 4. Calculate Equilibrium Temperature (K) ---
    // T_eq = (Flux * (1 - albedo) / (4 * sigma)) ^ 0.25
    const absorbedFluxFactor = flux_W_m2 * (1 - albedo);
    if (!Number.isFinite(absorbedFluxFactor) || absorbedFluxFactor < 0) {
         logger.error(`${logPrefix} Calculated invalid absorbed flux factor (${absorbedFluxFactor}). Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    // Ensure denominator is positive before division and taking the root
    const denominator = 4 * STEFAN_BOLTZMANN_SIGMA;
    if (denominator <= 0) {
         logger.error(`${logPrefix} Invalid Stefan-Boltzmann constant calculation. Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    const equilibriumBase = absorbedFluxFactor / denominator;
    if (equilibriumBase < 0) {
         logger.error(`${logPrefix} Calculated negative base for equilibrium temperature (${equilibriumBase}). Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280; // Cannot take root of negative number
    }

    const equilibriumTemp_K = Math.pow(equilibriumBase, 0.25);

    if (!Number.isFinite(equilibriumTemp_K)) {
         logger.error(`${logPrefix} Calculated non-finite equilibrium temperature (${equilibriumTemp_K}). Flux: ${flux_W_m2.toExponential(3)}, Albedo: ${albedo}. Using fallback temp.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280;
    }
    logger.debug(`${logPrefix} Equilibrium Temp (no greenhouse): ${equilibriumTemp_K.toFixed(1)}K`);

    // --- 5. Apply Greenhouse Effect ---
    let greenhouseFactor = 1.0;
    let greenhouseDesc = "None";
    if (atmosphere && atmosphere.density && atmosphere.density !== 'None') {
        let pressureFactor = Math.max(0, atmosphere.pressure); // Use pressure >= 0
        if (atmosphere.density === 'Thin') {
            greenhouseFactor = 1.0 + (pressureFactor / 0.5) * 0.05; // Reduced base effect
            greenhouseDesc = "Slight";
        } else if (atmosphere.density === 'Earth-like') {
            greenhouseFactor = 1.05 + (pressureFactor / 1.0) * 0.15; // Reduced base effect
            greenhouseDesc = "Moderate";
        } else if (atmosphere.density === 'Thick') {
            greenhouseFactor = 1.1 + (pressureFactor / 2.0) * 0.30; // Reduced base effect, adjusted scaling
            greenhouseDesc = "Significant";
        }

        // Bonus for specific gases
        if (atmosphere.composition) {
            const co2 = atmosphere.composition['Carbon Dioxide'] || 0;
            const methane = atmosphere.composition['Methane'] || 0;
            const waterVapor = atmosphere.composition['Water Vapor'] || 0;
            let gasBonus = 1.0;
            // Apply bonus multiplicatively based on percentages
            gasBonus *= (1 + (co2 / 100) * 0.5); // CO2 effect (max +50%)
            gasBonus *= (1 + (methane / 100) * 1.0); // Methane effect (max +100%)
            gasBonus *= (1 + (waterVapor / 100) * 0.8); // Water vapor effect (max +80%)

            greenhouseFactor *= gasBonus;
            logger.debug(`${logPrefix} Greenhouse Gas Bonus: ${gasBonus.toFixed(2)} (CO2=${co2}%, CH4=${methane}%, H2O=${waterVapor}%)`);
        } else {
             logger.warn(`${logPrefix} Atmosphere composition data missing for greenhouse gas bonus calculation.`);
        }
        // Clamp the final factor
        greenhouseFactor = Math.max(1.0, Math.min(greenhouseFactor, 3.5)); // Allow slightly higher max factor
    } else {
         logger.debug(`${logPrefix} No significant atmosphere density for greenhouse effect.`);
    }
    logger.debug(`${logPrefix} Greenhouse Details: Density=${atmosphere?.density ?? 'N/A'}, Pressure=${atmosphere?.pressure?.toFixed(3) ?? 'N/A'} -> Factor=${greenhouseFactor.toFixed(2)} (${greenhouseDesc})`);

    const surfaceTemp_K = equilibriumTemp_K * greenhouseFactor;

    // --- Final clamping and rounding ---
    const finalTemp = Math.max(2, Math.round(surfaceTemp_K)); // Ensure minimum temp above absolute zero (2K is background temp)

    if (!Number.isFinite(finalTemp)) {
         logger.error(`${logPrefix} Calculated final temperature is non-finite (${finalTemp}). Equilibrium: ${equilibriumTemp_K.toFixed(1)}K, Factor: ${greenhouseFactor.toFixed(2)}. Using fallback.`);
         return PLANET_TYPES[planetType]?.baseTemp ?? 280; // Fallback
    }

    logger.debug(`${logPrefix} Final Surface Temp: ${finalTemp}K`);
    return finalTemp;
}