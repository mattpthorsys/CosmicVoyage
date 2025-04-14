// src/generation/planet_characteristics_generator.ts (Gravity calculated from Density & Diameter)

import { PRNG } from '../../utils/prng';
import { MineralRichness, ELEMENTS } from '../../constants';
import { generatePhysicalBase, calculateGravity } from './physical_generator';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateAtmosphere } from './atmosphere_generator';
import { calculateSurfaceTemp } from './temperature_calculator';
import { generateHydrosphere, generateLithosphere } from './surface_descriptor';
import { calculateElementAbundance, determineMineralRichness, getBaseMinerals } from './resource_generator';


// Interface for the generated characteristics package - ADD elementAbundance & density
export interface PlanetCharacteristics {
    diameter: number;
    density: number; // NEW: Density in g/cm³
    gravity: number; // Now calculated
    atmosphere: Atmosphere;
    surfaceTemp: number; // Calculated *after* atmosphere
    hydrosphere: string;
    lithosphere: string;
    mineralRichness: MineralRichness;
    baseMinerals: number;
    elementAbundance: Record<string, number>;
}

/** Main function to generate all characteristics. */
export function generatePlanetCharacteristics(
    planetType: string,
    orbitDistance: number,
    planetPRNG: PRNG,
    parentStarType: string
): PlanetCharacteristics {
    logger.info(`[CharGen] Generating characteristics for Type: ${planetType}, Orbit: ${orbitDistance.toFixed(0)}, Star: ${parentStarType}...`);

    const { diameter, density } = generatePhysicalBase(planetPRNG, planetType); // Use imported function
    const gravity = calculateGravity(diameter, density); // Use imported function

    // Proceed with other characteristics, passing the calculated gravity
    const atmosphere = generateAtmosphere(planetPRNG, planetType, gravity, parentStarType, orbitDistance);
    const surfaceTemp = calculateSurfaceTemp(planetType, orbitDistance, parentStarType, atmosphere);
    const hydrosphere = generateHydrosphere(planetPRNG, planetType, surfaceTemp, atmosphere);
    const lithosphere = generateLithosphere(planetPRNG, planetType);
    const mineralRichness = determineMineralRichness(planetPRNG, planetType);
    const baseMinerals = getBaseMinerals(planetPRNG, mineralRichness); // Use helper if needed
    const elementAbundance = calculateElementAbundance(planetPRNG, planetType, surfaceTemp, lithosphere, gravity);

    logger.info(`[CharGen] Characteristics generated for ${planetType}. Gravity: ${gravity.toFixed(2)}g, Richness Category: ${mineralRichness}.`);

    return {
        diameter,
        density, // Include density
        gravity, // Use calculated gravity
        atmosphere,
        surfaceTemp,
        hydrosphere,
        lithosphere,
        mineralRichness,
        baseMinerals,
        elementAbundance
    };
}