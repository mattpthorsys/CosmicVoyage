// src/entities/planet/planet_characteristics_generator.ts
import { PRNG } from '../../utils/prng';
import { MineralRichness, ELEMENTS, GRAVITATIONAL_CONSTANT_G, BOLTZMANN_CONSTANT_K } from '../../constants'; // <<< Import G and K
import { generatePhysicalBase, calculateGravity } from './physical_generator';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateAtmosphere } from './atmosphere_generator';
import { calculateTemperatureProfile } from './temperature_calculator';
import { generateHydrosphere, generateLithosphere } from './surface_descriptor';
import { calculateElementAbundance, determineMineralRichness, getBaseMinerals } from './resource_generator';
import { StellarEnvironment, getDefaultStellarEnvironment } from '../stellar_environment';

// --- Interface (ensure magneticFieldStrength is added from previous step) ---
export interface PlanetCharacteristics {
    diameter: number;
    density: number;
    gravity: number;
    mass: number;
    escapeVelocity: number;
    atmosphere: Atmosphere;
    surfaceTemp: number;
    surfaceTempMin: number;
    surfaceTempMax: number;
    hydrosphere: string;
    lithosphere: string;
    mineralRichness: MineralRichness;
    baseMinerals: number;
    elementAbundance: Record<string, number>;
    magneticFieldStrength: number;
    axialTilt: number; // in radians
    tidallyLocked: boolean;
    rotationPeriodHours: number;
    orbitalInclination: number; // in radians
}

export interface PlanetGenerationOptions {
    tidallyLocked?: boolean;
    rotationPeriodHours?: number;
}

/** Main function to generate all characteristics. */
export function generatePlanetCharacteristics(
    planetType: string,
    orbitDistance: number,
    planetPRNG: PRNG,
    parentStarType: string,
    stellarEnvironment?: StellarEnvironment,
    totalFlux_W_m2?: number,
    options: PlanetGenerationOptions = {}
): PlanetCharacteristics {
    const environment = stellarEnvironment ?? getDefaultStellarEnvironment(parentStarType);
    logger.info(`[CharGen] Generating characteristics for Type: ${planetType}, Orbit: ${orbitDistance.toExponential(2)}m, Star: ${parentStarType}, Age: ${environment.ageGyr} Gyr, [Fe/H]: ${environment.metallicityFeH}...`);

    // 1. Generate Base Physical Properties
    const { diameter, density } = generatePhysicalBase(planetPRNG, planetType);
    const radius_m = diameter * 1000 / 2; // Radius in meters
    const density_kg_m3 = density * 1000; // Density in kg/m^3

    // 2. Calculate Mass (kg)
    const volume_m3 = (4 / 3) * Math.PI * Math.pow(radius_m, 3);
    const mass_kg = volume_m3 * density_kg_m3;

    // 3. Calculate Gravity (relative to Earth G) & Escape Velocity (m/s)
    const gravity = calculateGravity(diameter, density); // Already calculates relative G
    const escapeVelocity = Math.sqrt((2 * GRAVITATIONAL_CONSTANT_G * mass_kg) / radius_m);

    logger.debug(`[CharGen:${planetType}] Calculated Mass: ${mass_kg.toExponential(3)} kg, Escape Velocity: ${escapeVelocity.toFixed(0)} m/s`);

    // 4. Generate Atmosphere (NOW pass escape velocity)
    const atmosphere = generateAtmosphere(planetPRNG, planetType, gravity, escapeVelocity, parentStarType, orbitDistance, environment);

    const axialTilt = planetPRNG.random(0, Math.PI / 4);
    const tidallyLocked = options.tidallyLocked ?? false;
    const orbitalInclination = planetPRNG.random(0, Math.PI / 18);

    // 5. Calculate Final Surface Temperature (uses atmosphere and physical state)
    const temperatureProfile = calculateTemperatureProfile(
        planetType,
        orbitDistance,
        parentStarType,
        atmosphere,
        environment,
        totalFlux_W_m2,
        {
            diameterKm: diameter,
            densityGcm3: density,
            ageGyr: environment.ageGyr,
            axialTiltRad: axialTilt,
            tidallyLocked,
            tidalHeatingFactor: 0,
        }
    );
    const surfaceTemp = temperatureProfile.average;

    // 6. Generate Surface Descriptors (use final temp)
    const hydrosphere = generateHydrosphere(planetPRNG, planetType, surfaceTemp, atmosphere, {
        surfaceTempMin: temperatureProfile.min,
        surfaceTempMax: temperatureProfile.max,
        gravity,
        escapeVelocity,
        diameterKm: diameter,
        densityGcm3: density,
        orbitDistanceM: orbitDistance,
        environment,
    });
    const lithosphere = generateLithosphere(planetPRNG, planetType);

    // 7. Generate Resources (use final temp, lithosphere, gravity)
    const mineralRichness = determineMineralRichness(planetPRNG, planetType, environment.metallicityFeH);
    const baseMinerals = getBaseMinerals(planetPRNG, mineralRichness);
    const elementAbundance = calculateElementAbundance(
        planetPRNG,
        planetType,
        surfaceTemp,
        lithosphere,
        gravity,
        environment.metallicityFeH
    );

    // 8. Generate Magnetic Field (from previous step)
    let magneticFieldStrength: number = 0;
    // ... (insert magnetic field generation logic here as before, using diameter/density) ...
    const fieldRoll = planetPRNG.random();
    switch (planetType) { /* ... (same logic as previous step) ... */
         case 'Molten': case 'Rock': case 'Oceanic': case 'Hycean': case 'Greenhouse': case 'CarbonRich': case 'Chthonian':
            if (fieldRoll < 0.7) {
                const sizeFactor = Math.max(0.5, diameter / 12000);
                const densityFactor = Math.max(0.5, density / 4.0);
                magneticFieldStrength = planetPRNG.random(10, 80) * sizeFactor * densityFactor;
            } break;
        case 'GasGiant': case 'IceGiant':
             if (fieldRoll < 0.9) magneticFieldStrength = planetPRNG.random(100, 2000);
             break;
        case 'Frozen': case 'Cryovolcanic': case 'DwarfIce': case 'Lunar':
             if (fieldRoll < 0.15) magneticFieldStrength = planetPRNG.random(0.1, 5);
             break;
    }
    magneticFieldStrength = Math.max(0, magneticFieldStrength);
    logger.debug(`[CharGen:${planetType}] Magnetic Field Generated: ${magneticFieldStrength.toFixed(1)} µT`);

    const rotationPeriodHours = options.rotationPeriodHours ?? generateRotationPeriodHours(planetPRNG, planetType, diameter, density, orbitDistance, tidallyLocked);

    logger.info(`[CharGen] Characteristics generated for ${planetType}. Gravity: ${gravity.toFixed(2)}g, EscapeVel: ${escapeVelocity.toFixed(0)} m/s, Richness: ${mineralRichness}.`);

    // Return the complete characteristics object
    return {
        diameter,
        density,
        gravity,
        mass: mass_kg, // <<< Include mass
        escapeVelocity, // <<< Include escape velocity
        atmosphere,
        surfaceTemp,
        surfaceTempMin: temperatureProfile.min,
        surfaceTempMax: temperatureProfile.max,
        hydrosphere,
        lithosphere,
        mineralRichness,
        baseMinerals,
        elementAbundance,
        magneticFieldStrength,
        axialTilt,
        tidallyLocked,
        rotationPeriodHours,
        orbitalInclination
    };
}

export function generateRotationPeriodHours(
    prng: PRNG,
    planetType: string,
    diameterKm: number,
    densityGcm3: number,
    orbitDistance_m: number,
    tidallyLocked: boolean
): number {
    if (tidallyLocked) return 0;

    let baseHours: number;
    switch (planetType) {
        case 'GasGiant':
            baseHours = prng.random(8, 18);
            break;
        case 'IceGiant':
            baseHours = prng.random(11, 24);
            break;
        case 'Molten':
        case 'Chthonian':
            baseHours = prng.random(28, 240);
            break;
        case 'Lunar':
        case 'DwarfIce':
            baseHours = prng.random(60, 900);
            break;
        case 'Frozen':
        case 'Cryovolcanic':
            baseHours = prng.random(18, 160);
            break;
        case 'Oceanic':
        case 'Hycean':
            baseHours = prng.random(14, 54);
            break;
        case 'Greenhouse':
            baseHours = prng.random(80, 1200);
            break;
        case 'CarbonRich':
            baseHours = prng.random(10, 80);
            break;
        case 'Rock':
        default:
            baseHours = prng.random(12, 72);
            break;
    }

    const sizeFactor = Math.max(0.65, Math.min(1.8, Math.sqrt(diameterKm / 12742)));
    const densityFactor = Math.max(0.75, Math.min(1.25, Math.sqrt(5.51 / Math.max(0.4, densityGcm3))));
    const closeOrbitSlowdown =
        orbitDistance_m > 0 && orbitDistance_m < 0.18 * 1.495978707e11
            ? 1 + Math.pow((0.18 * 1.495978707e11 - orbitDistance_m) / (0.18 * 1.495978707e11), 1.6) * 5
            : 1;

    return Math.round(baseHours * sizeFactor * densityFactor * closeOrbitSlowdown * 10) / 10;
}
