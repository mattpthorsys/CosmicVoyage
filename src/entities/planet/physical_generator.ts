// FILE: src/entities/planet/physical_generator.ts
// Contains logic for generating basic physical properties like diameter, density, and gravity.

import { PRNG } from '../../utils/prng';
import { logger } from '../../utils/logger';

// Constants for Gravity Calculation (moved here)
const EARTH_DENSITY_GRAMS_PER_CM3 = 5.51;
const EARTH_DIAMETER_KM = 12742;

/**
 * Generates base physical properties: diameter and density.
 */
export function generatePhysicalBase(prng: PRNG, planetType: string): { diameter: number, density: number } {
    const diameter = Math.max(1000, prng.randomInt(2000, 20000)); // km

    // Generate density based on type (example ranges in g/cm³)
    let density: number;
    switch (planetType) {
         case 'Molten': density = prng.random(4.0, 7.0); break;
         case 'Rock': density = prng.random(3.0, 6.0); break;
         case 'Oceanic': density = prng.random(2.8, 4.5); break;
         case 'Lunar': density = prng.random(2.5, 4.0); break;
         case 'GasGiant': density = prng.random(0.5, 2.0); break;
         case 'IceGiant': density = prng.random(1.0, 2.5); break;
         case 'Frozen': density = prng.random(1.5, 3.5); break;
         default: density = prng.random(3.0, 5.5); // Default fallback
    }
    density = Math.max(0.1, density); // Ensure minimum density

    logger.debug(`[PhysGen] Physical Base: Diameter=<span class="math-inline">\{diameter\}km, Density\=</span>{density.toFixed(2)} g/cm³`);
    return { diameter, density };
}

/** Calculates surface gravity relative to Earth (1 G) */
export function calculateGravity(diameter: number, density: number): number {
    // g_planet / g_earth = (density_planet * diameter_planet) / (density_earth * diameter_earth)
    const relativeDensity = density / EARTH_DENSITY_GRAMS_PER_CM3;
    const relativeDiameter = diameter / EARTH_DIAMETER_KM;
    const gravity = relativeDensity * relativeDiameter; // Relative to Earth G

    // Clamp gravity to a reasonable range (e.g., 0.01g to 10g?)
    const clampedGravity = Math.max(0.01, Math.min(10.0, gravity));
    logger.debug(`[PhysGen] Gravity Calculation: RelDensity=<span class="math-inline">\{relativeDensity\.toFixed\(3\)\}, RelDiameter\=</span>{relativeDiameter.toFixed(3)} -> RawGravity=<span class="math-inline">\{gravity\.toFixed\(3\)\}g \-\> ClampedGravity\=</span>{clampedGravity.toFixed(3)}g`);
    return clampedGravity;
}