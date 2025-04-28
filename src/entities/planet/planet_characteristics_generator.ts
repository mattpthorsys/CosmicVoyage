// src/entities/planet/planet_characteristics_generator.ts
import { PRNG } from '../../utils/prng';
import { MineralRichness, ELEMENTS, GRAVITATIONAL_CONSTANT_G, BOLTZMANN_CONSTANT_K } from '../../constants'; // <<< Import G and K
import { generatePhysicalBase, calculateGravity } from './physical_generator';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateAtmosphere } from './atmosphere_generator';
import { calculateSurfaceTemp } from './temperature_calculator';
import { generateHydrosphere, generateLithosphere } from './surface_descriptor';
import { calculateElementAbundance, determineMineralRichness, getBaseMinerals } from './resource_generator';

// --- Interface (ensure magneticFieldStrength is added from previous step) ---
export interface PlanetCharacteristics {
    diameter: number;
    density: number;
    gravity: number;
    mass: number;
    escapeVelocity: number;
    atmosphere: Atmosphere;
    surfaceTemp: number;
    hydrosphere: string;
    lithosphere: string;
    mineralRichness: MineralRichness;
    baseMinerals: number;
    elementAbundance: Record<string, number>;
    magneticFieldStrength: number;
    axialTilt: number; // in radians
}

/** Main function to generate all characteristics. */
export function generatePlanetCharacteristics(
    planetType: string,
    orbitDistance: number,
    planetPRNG: PRNG,
    parentStarType: string
): PlanetCharacteristics {
    logger.info(`[CharGen] Generating characteristics for Type: ${planetType}, Orbit: ${orbitDistance.toExponential(2)}m, Star: ${parentStarType}...`);

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
    const atmosphere = generateAtmosphere(planetPRNG, planetType, gravity, escapeVelocity, parentStarType, orbitDistance);

    // 5. Calculate Final Surface Temperature (uses atmosphere)
    const surfaceTemp = calculateSurfaceTemp(planetType, orbitDistance, parentStarType, atmosphere);

    // 6. Generate Surface Descriptors (use final temp)
    const hydrosphere = generateHydrosphere(planetPRNG, planetType, surfaceTemp, atmosphere);
    const lithosphere = generateLithosphere(planetPRNG, planetType);

    // 7. Generate Resources (use final temp, lithosphere, gravity)
    const mineralRichness = determineMineralRichness(planetPRNG, planetType);
    const baseMinerals = getBaseMinerals(planetPRNG, mineralRichness);
    const elementAbundance = calculateElementAbundance(planetPRNG, planetType, surfaceTemp, lithosphere, gravity);

    // 8. Generate Magnetic Field (from previous step)
    let magneticFieldStrength: number = 0;
    // ... (insert magnetic field generation logic here as before, using diameter/density) ...
    const fieldRoll = planetPRNG.random();
    switch (planetType) { /* ... (same logic as previous step) ... */
         case 'Molten': case 'Rock': case 'Oceanic':
            if (fieldRoll < 0.7) {
                const sizeFactor = Math.max(0.5, diameter / 12000);
                const densityFactor = Math.max(0.5, density / 4.0);
                magneticFieldStrength = planetPRNG.random(10, 80) * sizeFactor * densityFactor;
            } break;
        case 'GasGiant': case 'IceGiant':
             if (fieldRoll < 0.9) magneticFieldStrength = planetPRNG.random(100, 2000);
             break;
        case 'Frozen': case 'Lunar':
             if (fieldRoll < 0.15) magneticFieldStrength = planetPRNG.random(0.1, 5);
             break;
    }
    magneticFieldStrength = Math.max(0, magneticFieldStrength);
    logger.debug(`[CharGen:${planetType}] Magnetic Field Generated: ${magneticFieldStrength.toFixed(1)} µT`);

    // 8. Generate Axial Tilt (in radians)
    const axialTilt = planetPRNG.random(0, Math.PI / 4)


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
        hydrosphere,
        lithosphere,
        mineralRichness,
        baseMinerals,
        elementAbundance,
        magneticFieldStrength,
        axialTilt
    };
}