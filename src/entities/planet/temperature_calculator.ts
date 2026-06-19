// Place this function in src/entities/planet/temperature_calculator.ts
// It replaces the existing calculateSurfaceTemp function.

import { Atmosphere } from '../../entities/planet';
import { PLANET_TYPES } from '../../constants/planetary';
import { SPECTRAL_TYPES } from '../../constants/stellar';
import { logger } from '../../utils/logger';
import { StellarEnvironment, estimateEvolutionaryLuminosityFactor } from '../stellar_environment';

// --- Physical Constants ---
const STEFAN_BOLTZMANN_SIGMA = 5.670374419e-8; // W m^-2 K^-4

// --- Estimated Albedos (Reflectivity: 0=absorbs all, 1=reflects all) ---
// These are approximate values, adjust as needed for gameplay balance
const PLANET_ALBEDOS: Record<string, number> = {
  Molten: 0.08, // Very dark, absorbs heat
  Rock: 0.25, // Varies, average rock/soil
  Oceanic: 0.15, // Dark water absorbs, clouds/ice reflect more
  Hycean: 0.22,
  Greenhouse: 0.72,
  CarbonRich: 0.18,
  Chthonian: 0.1,
  Cryovolcanic: 0.68,
  DwarfIce: 0.62,
  Lunar: 0.12, // Dark regolith
  GasGiant: 0.35, // Depends on clouds, Jupiter ~0.34
  IceGiant: 0.3, // Depends on clouds, Neptune ~0.29
  Frozen: 0.7, // High reflectivity for ice/snow
  Default: 0.3, // Fallback
};

export interface TemperatureProfile {
  average: number;
  min: number;
  max: number;
}

export interface TemperatureProfileOptions {
  diameterKm?: number;
  densityGcm3?: number;
  ageGyr?: number;
  axialTiltRad?: number;
  tidallyLocked?: boolean;
  tidalHeatingFactor?: number;
}

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
  atmosphere: Atmosphere, // Pass generated atmosphere
  stellarEnvironment?: StellarEnvironment,
  totalFlux_W_m2?: number
): number {
  return calculateTemperatureProfile(
    planetType,
    orbitDistance_m,
    parentStarType,
    atmosphere,
    stellarEnvironment,
    totalFlux_W_m2
  ).average;
}

/** Calculates temperature profile. */
export function calculateTemperatureProfile(
  planetType: string,
  orbitDistance_m: number,
  parentStarType: string,
  atmosphere: Atmosphere,
  stellarEnvironment?: StellarEnvironment,
  totalFlux_W_m2?: number,
  options: TemperatureProfileOptions = {}
): TemperatureProfile {
  // Use a slightly different logger prefix for clarity
  const logPrefix = `[TempCalc:${planetType}]`;
  logger.debug(`${logPrefix} Calculating surface temp (Orbit: ${orbitDistance_m.toExponential(2)}m)...`);

  const starInfo = SPECTRAL_TYPES[parentStarType];
  // Ensure starInfo and necessary properties (temp, radius) exist and are valid numbers
  if (
    !starInfo ||
    typeof starInfo.temp !== 'number' ||
    typeof starInfo.radius !== 'number' ||
    starInfo.radius <= 0 ||
    !Number.isFinite(starInfo.temp) ||
    !Number.isFinite(starInfo.radius)
  ) {
    logger.error(
      `${logPrefix} Missing or invalid star data (Temp/Radius) for type ${parentStarType}. Using fallback temp.`
    );
    return fallbackProfile(planetType, options);
  }

  const starTemp_K = starInfo.temp;
  const starRadius_m = starInfo.radius;

  // --- 1. Calculate Star's Total Luminosity (Watts) ---
  const starSurfaceArea_m2 = 4 * Math.PI * Math.pow(starRadius_m, 2);
  const evolutionFactor = stellarEnvironment ? estimateEvolutionaryLuminosityFactor(stellarEnvironment) : 1;
  const starLuminosity_W =
    starSurfaceArea_m2 * STEFAN_BOLTZMANN_SIGMA * Math.pow(starTemp_K, 4) * evolutionFactor;

  if (!Number.isFinite(starLuminosity_W) || starLuminosity_W <= 0) {
    logger.error(
      `${logPrefix} Calculated invalid star luminosity (${starLuminosity_W} W). Using fallback temp.`
    );
    return fallbackProfile(planetType, options);
  }
  logger.debug(
    `${logPrefix} Star Luminosity: ${starLuminosity_W.toExponential(3)} W (Evolution factor ${evolutionFactor.toFixed(2)})`
  );

  // --- 2. Calculate Energy Flux at Planet's Orbit (W/m^2) ---
  if ((!Number.isFinite(orbitDistance_m) || orbitDistance_m <= 0) && totalFlux_W_m2 === undefined) {
    logger.error(`${logPrefix} Invalid orbit distance (${orbitDistance_m}m). Using fallback temp.`);
    return fallbackProfile(planetType, options);
  }
  const orbitalSphereArea_m2 = orbitDistance_m > 0 ? 4 * Math.PI * Math.pow(orbitDistance_m, 2) : 1;

  // Check for potential division by zero or invalid area
  if (!Number.isFinite(orbitalSphereArea_m2) || orbitalSphereArea_m2 <= 0) {
    logger.error(
      `${logPrefix} Calculated invalid orbital sphere area for distance ${orbitDistance_m.toExponential(2)}m. Using fallback temp.`
    );
    return fallbackProfile(planetType, options);
  }
  const flux_W_m2 = Math.max(0.0001, totalFlux_W_m2 ?? starLuminosity_W / orbitalSphereArea_m2);
  logger.debug(`${logPrefix} Flux at orbit: ${flux_W_m2.toExponential(3)} W/m^2`);

  // --- 3. Estimate Planetary Albedo ---
  const albedo = PLANET_ALBEDOS[planetType] ?? PLANET_ALBEDOS['Default'];
  logger.debug(`${logPrefix} Estimated Albedo: ${albedo}`);

  // --- 4. Calculate Equilibrium Temperature (K) ---
  // T_eq = (Flux * (1 - albedo) / (4 * sigma)) ^ 0.25
  const absorbedFluxFactor = flux_W_m2 * (1 - albedo);
  if (!Number.isFinite(absorbedFluxFactor) || absorbedFluxFactor < 0) {
    logger.error(
      `${logPrefix} Calculated invalid absorbed flux factor (${absorbedFluxFactor}). Using fallback temp.`
    );
    return fallbackProfile(planetType, options);
  }
  // Ensure denominator is positive before division and taking the root
  const denominator = 4 * STEFAN_BOLTZMANN_SIGMA;
  if (denominator <= 0) {
    logger.error(`${logPrefix} Invalid Stefan-Boltzmann constant calculation. Using fallback temp.`);
    return fallbackProfile(planetType, options);
  }
  const equilibriumBase = absorbedFluxFactor / denominator;
  if (equilibriumBase < 0) {
    logger.error(
      `${logPrefix} Calculated negative base for equilibrium temperature (${equilibriumBase}). Using fallback temp.`
    );
    return fallbackProfile(planetType, options); // Cannot take root of negative number
  }

  const equilibriumTemp_K = Math.pow(equilibriumBase, 0.25);

  if (!Number.isFinite(equilibriumTemp_K)) {
    logger.error(
      `${logPrefix} Calculated non-finite equilibrium temperature (${equilibriumTemp_K}). Flux: ${flux_W_m2.toExponential(3)}, Albedo: ${albedo}. Using fallback temp.`
    );
    return fallbackProfile(planetType, options);
  }
  logger.debug(`${logPrefix} Equilibrium Temp (no greenhouse): ${equilibriumTemp_K.toFixed(1)}K`);

  // --- 5. Apply Greenhouse Effect ---
  let greenhouseFactor = 1.0;
  let greenhouseDesc = 'None';
  if (atmosphere && atmosphere.density && atmosphere.density !== 'None') {
    const pressureFactor = Math.max(0, atmosphere.pressure); // Use pressure >= 0
    if (atmosphere.density === 'Thin') {
      greenhouseFactor = 1.0 + (pressureFactor / 0.5) * 0.05; // Reduced base effect
      greenhouseDesc = 'Slight';
    } else if (atmosphere.density === 'Trace') {
      greenhouseFactor = 1.0 + Math.min(0.03, pressureFactor * 0.12);
      greenhouseDesc = 'Trace';
    } else if (atmosphere.density === 'Earth-like') {
      greenhouseFactor = 1.05 + (pressureFactor / 1.0) * 0.15; // Reduced base effect
      greenhouseDesc = 'Moderate';
    } else if (atmosphere.density === 'Thick') {
      greenhouseFactor = 1.1 + (pressureFactor / 2.0) * 0.3; // Reduced base effect, adjusted scaling
      greenhouseDesc = 'Significant';
    } else if (atmosphere.density === 'Superdense') {
      greenhouseFactor = 1.2 + Math.log10(pressureFactor + 1) * 0.55;
      greenhouseDesc = 'Extreme';
    }

    // Bonus for specific gases
    if (atmosphere.composition) {
      const co2 = atmosphere.composition['Carbon Dioxide'] || 0;
      const methane = atmosphere.composition['Methane'] || 0;
      const waterVapor = atmosphere.composition['Water Vapor'] || 0;
      let gasBonus = 1.0;
      // Apply bonus multiplicatively based on percentages
      gasBonus *= 1 + (co2 / 100) * 0.5; // CO2 effect (max +50%)
      gasBonus *= 1 + (methane / 100) * 1.0; // Methane effect (max +100%)
      gasBonus *= 1 + (waterVapor / 100) * 0.8; // Water vapor effect (max +80%)

      greenhouseFactor *= gasBonus;
      logger.debug(
        `${logPrefix} Greenhouse Gas Bonus: ${gasBonus.toFixed(2)} (CO2=${co2}%, CH4=${methane}%, H2O=${waterVapor}%)`
      );
    } else {
      logger.warn(`${logPrefix} Atmosphere composition data missing for greenhouse gas bonus calculation.`);
    }
    // Clamp the final factor
    greenhouseFactor = Math.max(1.0, Math.min(greenhouseFactor, 3.5)); // Allow slightly higher max factor
  } else {
    logger.debug(`${logPrefix} No significant atmosphere density for greenhouse effect.`);
  }
  logger.debug(
    `${logPrefix} Greenhouse Details: Density=${atmosphere?.density ?? 'N/A'}, Pressure=${atmosphere?.pressure?.toFixed(3) ?? 'N/A'} -> Factor=${greenhouseFactor.toFixed(2)} (${greenhouseDesc})`
  );

  const radiativeSurfaceTemp_K = equilibriumTemp_K * greenhouseFactor;
  const internalHeat_K = calculateInternalHeatContribution(
    planetType,
    options.diameterKm,
    options.densityGcm3,
    stellarEnvironment?.ageGyr ?? options.ageGyr
  );
  const tidalHeat_K = calculateTidalHeatContribution(planetType, options.tidalHeatingFactor ?? 0);
  const surfaceTemp_K = Math.pow(
    Math.pow(Math.max(2, radiativeSurfaceTemp_K), 4) + Math.pow(internalHeat_K, 4) + Math.pow(tidalHeat_K, 4),
    0.25
  );

  // --- Final clamping and rounding ---
  const finalTemp = Math.max(2, Math.round(surfaceTemp_K)); // Ensure minimum temp above absolute zero (2K is background temp)

  if (!Number.isFinite(finalTemp)) {
    logger.error(
      `${logPrefix} Calculated final temperature is non-finite (${finalTemp}). Equilibrium: ${equilibriumTemp_K.toFixed(1)}K, Factor: ${greenhouseFactor.toFixed(2)}. Using fallback.`
    );
    return fallbackProfile(planetType, options); // Fallback
  }

  const range = calculateTemperatureRange(finalTemp, planetType, atmosphere, options);
  logger.debug(
    `${logPrefix} Final Surface Temp: ${finalTemp}K (min ${range.min}K, max ${range.max}K, internal ${internalHeat_K.toFixed(1)}K, tidal ${tidalHeat_K.toFixed(1)}K)`
  );
  return range;
}

/** Creates temperature profile from average. */
export function createTemperatureProfileFromAverage(
  averageTemp_K: number,
  planetType: string,
  atmosphere: Atmosphere,
  options: TemperatureProfileOptions = {}
): TemperatureProfile {
  return calculateTemperatureRange(Math.max(2, Math.round(averageTemp_K)), planetType, atmosphere, options);
}

/** Calculates temperature range. */
function calculateTemperatureRange(
  averageTemp_K: number,
  planetType: string,
  atmosphere: Atmosphere,
  options: TemperatureProfileOptions
): TemperatureProfile {
  const atmosphereBuffer = getAtmosphereBuffer(atmosphere);
  const tilt = Math.max(0, Math.min(Math.PI / 2, options.axialTiltRad ?? 0));
  const tiltFactor = Math.sin(tilt);
  const lockedFactor = options.tidallyLocked ? 1 : 0;
  const thinSurfaceBoost =
    planetType === 'Lunar' ||
    planetType === 'DwarfIce' ||
    planetType === 'Chthonian' ||
    atmosphere.density === 'None' ||
    atmosphere.density === 'Trace'
      ? 1.35
      : 1;
  const giantDamping =
    planetType === 'GasGiant' || planetType === 'IceGiant'
      ? 0.35
      : planetType === 'Hycean' || planetType === 'Greenhouse'
        ? 0.55
        : 1;
  const variationFraction = Math.max(
    0.035,
    (0.09 + tiltFactor * 0.22 + lockedFactor * 0.42) * atmosphereBuffer * thinSurfaceBoost * giantDamping
  );
  const geothermalFloor =
    calculateInternalHeatContribution(planetType, options.diameterKm, options.densityGcm3, options.ageGyr) *
    0.35;
  const tidalFloor = calculateTidalHeatContribution(planetType, options.tidalHeatingFactor ?? 0) * 0.4;
  const min = Math.max(
    2,
    Math.round(Math.max(geothermalFloor + tidalFloor, averageTemp_K * (1 - variationFraction)))
  );
  const max = Math.max(min, Math.round(averageTemp_K * (1 + variationFraction * 1.15)));
  return { average: averageTemp_K, min, max };
}

/** Returns atmosphere buffer. */
function getAtmosphereBuffer(atmosphere: Atmosphere): number {
  switch (atmosphere.density) {
    case 'Superdense':
      return 0.18;
    case 'Thick':
      return 0.38;
    case 'Earth-like':
      return 0.58;
    case 'Thin':
      return 0.82;
    case 'Trace':
      return 1.05;
    case 'None':
    default:
      return 1.18;
  }
}

/** Calculates internal heat contribution. */
function calculateInternalHeatContribution(
  planetType: string,
  diameterKm?: number,
  densityGcm3?: number,
  ageGyr?: number
): number {
  const diameterFactor = Math.sqrt(Math.max(0.08, (diameterKm ?? 6500) / 12742));
  const densityFactor = Math.max(0.25, Math.min(1.8, (densityGcm3 ?? 3.2) / 5.51));
  const ageFactor = Math.max(0.22, Math.pow(4.6 / Math.max(0.08, ageGyr ?? 4.6), 0.32));
  const typeBase =
    planetType === 'GasGiant'
      ? 34
      : planetType === 'IceGiant'
        ? 22
        : planetType === 'Molten' || planetType === 'Chthonian'
          ? 18
          : planetType === 'Hycean'
            ? 11
            : planetType === 'Rock' ||
                planetType === 'Oceanic' ||
                planetType === 'Greenhouse' ||
                planetType === 'CarbonRich'
              ? 8
              : planetType === 'Frozen' || planetType === 'Cryovolcanic'
                ? 5
                : planetType === 'DwarfIce'
                  ? 2
                  : 3;
  return Math.max(0, typeBase * diameterFactor * densityFactor * ageFactor);
}

/** Calculates tidal heat contribution. */
function calculateTidalHeatContribution(planetType: string, tidalHeatingFactor: number): number {
  const clamped = Math.max(0, Math.min(1, tidalHeatingFactor));
  if (clamped <= 0) return 0;
  const typeScale =
    planetType === 'Lunar' || planetType === 'Cryovolcanic'
      ? 120
      : planetType === 'Frozen' || planetType === 'DwarfIce'
        ? 95
        : planetType === 'Rock' ||
            planetType === 'Greenhouse' ||
            planetType === 'CarbonRich' ||
            planetType === 'Chthonian'
          ? 80
          : planetType === 'Oceanic' || planetType === 'Hycean'
            ? 65
            : 35;
  return typeScale * Math.pow(clamped, 0.9);
}

/** Builds a conservative temperature profile when the detailed model cannot be used. */
function fallbackProfile(planetType: string, options: TemperatureProfileOptions): TemperatureProfile {
  const average = PLANET_TYPES[planetType]?.baseTemp ?? 280;
  return calculateTemperatureRange(
    average,
    planetType,
    { density: 'None', pressure: 0, composition: { None: 100 } },
    options
  );
}
