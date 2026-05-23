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
    if (planetType === 'GasGiant') {
        return generateGasGiantPhysicalBase(prng);
    }
    if (planetType === 'IceGiant') {
        return generateIceGiantPhysicalBase(prng);
    }

    return generateSolidPhysicalBase(prng, planetType);
}

function generateGasGiantPhysicalBase(prng: PRNG): { diameter: number; density: number } {
    // Jovian planets: Saturn through high-mass Jupiter analogues. Radius does
    // not grow linearly with mass because hydrogen-helium interiors compress.
    const diameter = prng.randomInt(74000, 158000);
    const radiusClass = (diameter - 74000) / (158000 - 74000);
    const densityCenter = 0.62 + radiusClass * 0.72;
    const density = Math.max(0.45, Math.min(1.85, densityCenter + prng.random(-0.22, 0.28)));
    logger.debug(`[PhysGen] Gas giant physical base: Diameter=${diameter}km, Density=${density.toFixed(2)} g/cm³`);
    return { diameter, density };
}

function generateIceGiantPhysicalBase(prng: PRNG): { diameter: number; density: number } {
    // Uranus/Neptune class worlds are smaller but denser than gas giants due to
    // larger water/ammonia/methane ice and rock fractions.
    const diameter = prng.randomInt(30000, 65000);
    const radiusClass = (diameter - 30000) / (65000 - 30000);
    const densityCenter = 1.25 + radiusClass * 0.45;
    const density = Math.max(1.05, Math.min(2.15, densityCenter + prng.random(-0.18, 0.25)));
    logger.debug(`[PhysGen] Ice giant physical base: Diameter=${diameter}km, Density=${density.toFixed(2)} g/cm³`);
    return { diameter, density };
}

function generateSolidPhysicalBase(prng: PRNG, planetType: string): { diameter: number; density: number } {
    const profile = getSolidPlanetProfile(planetType);
    const diameter = prng.randomInt(profile.minDiameter, profile.maxDiameter);
    const sizeClass = (diameter - profile.minDiameter) / Math.max(1, profile.maxDiameter - profile.minDiameter);
    const compressionBoost = profile.compression * sizeClass;
    const density = Math.max(
        profile.minDensity,
        Math.min(profile.maxDensity, profile.baseDensity + compressionBoost + prng.random(-profile.variance, profile.variance))
    );

    logger.debug(`[PhysGen] ${planetType} physical base: Diameter=${diameter}km, Density=${density.toFixed(2)} g/cm³`);
    return { diameter, density };
}

function getSolidPlanetProfile(planetType: string): {
    minDiameter: number;
    maxDiameter: number;
    minDensity: number;
    maxDensity: number;
    baseDensity: number;
    variance: number;
    compression: number;
} {
    switch (planetType) {
        case 'Molten':
            // Dense rocky/metal-rich bodies, from small volcanic worlds to hot super-Earths.
            return { minDiameter: 4500, maxDiameter: 18500, minDensity: 3.8, maxDensity: 7.8, baseDensity: 4.4, variance: 0.55, compression: 2.2 };
        case 'Rock':
            // Mercury/Mars/Earth/super-Earth class rocky bodies.
            return { minDiameter: 3500, maxDiameter: 19000, minDensity: 3.1, maxDensity: 6.8, baseDensity: 3.5, variance: 0.45, compression: 2.1 };
        case 'Oceanic':
            // Water-rich terrestrial worlds: lower bulk density, with compression on larger examples.
            return { minDiameter: 6500, maxDiameter: 20000, minDensity: 2.4, maxDensity: 5.2, baseDensity: 2.7, variance: 0.35, compression: 1.65 };
        case 'Lunar':
            // Moon/large-satellite class differentiated rocky/icy-rock bodies.
            return { minDiameter: 900, maxDiameter: 6500, minDensity: 1.9, maxDensity: 4.1, baseDensity: 2.2, variance: 0.28, compression: 1.25 };
        case 'Frozen':
            // Ice-rock bodies from dwarf planets to cold super-Earths.
            return { minDiameter: 1800, maxDiameter: 15000, minDensity: 0.9, maxDensity: 3.6, baseDensity: 1.15, variance: 0.28, compression: 1.55 };
        default:
            return { minDiameter: 3000, maxDiameter: 17000, minDensity: 2.8, maxDensity: 6.3, baseDensity: 3.2, variance: 0.45, compression: 2.0 };
    }
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
