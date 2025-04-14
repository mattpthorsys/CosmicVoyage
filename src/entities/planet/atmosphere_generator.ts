// FILE: src/entities/planet/atmosphere_generator.ts
// Contains logic for generating planetary atmosphere details.

import { PRNG } from '../../utils/prng';
import { PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES } from '../../constants';
import { logger } from '../../utils/logger';
import { Atmosphere, AtmosphereComposition } from '../../entities/planet'; // Import types used/returned

/** Generates atmospheric composition (nested helper). */
function generateAtmosphereComposition(
    prng: PRNG,
    density: string,
    planetType: string,
    parentStarType: string,
    orbitDistance: number
): AtmosphereComposition {
    logger.debug(`[AtmoGen] Generating composition for density '${density}'...`);
    if (density === 'None') {
        logger.debug(`[AtmoGen] Composition: None`);
        return { None: 100 };
    }

    const comp: AtmosphereComposition = {};
    let remaining = 100.0;
    const numGases = prng.randomInt(2, 6);
    // Approx temp calculation (simplified from Planet class)
    const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp;
    const approxTemp = (PLANET_TYPES[planetType]?.baseTemp ?? 300) *
                       (starTempApprox / SPECTRAL_TYPES['G'].temp) ** 0.25 * // Luminosity approx
                       (50000 / Math.max(1000, orbitDistance)) ** 0.5 + // Distance effect (sqrt)
                       prng.random(-50, 50);
    logger.debug(`[AtmoGen] Approx temp for gas comp: ${approxTemp.toFixed(0)}K`);

    let primaryGas = 'Nitrogen';
    if (planetType === 'GasGiant' || planetType === 'IceGiant') {
        primaryGas = prng.choice(['Hydrogen', 'Helium'])!;
    } else if (approxTemp < 150) { // Cold
         primaryGas = prng.choice(['Nitrogen', 'Nitrogen', 'Methane', 'Carbon Dioxide', 'Argon'])!;
    } else if (approxTemp > 500) { // Hot
         primaryGas = prng.choice(['Carbon Dioxide', 'Carbon Dioxide', 'Nitrogen', 'Sulfur Dioxide', 'Water Vapor'])!;
    } else { // Temperate
         primaryGas = prng.choice(['Nitrogen', 'Nitrogen', 'Nitrogen', 'Carbon Dioxide', 'Argon', 'Water Vapor'])!;
    }
    logger.debug(`[AtmoGen] Primary gas chosen: ${primaryGas}`);

    const primaryPercent = prng.random(50, 95);
    comp[primaryGas] = primaryPercent;
    remaining -= primaryPercent;
    logger.debug(`[AtmoGen] Primary ${primaryGas}: ${primaryPercent.toFixed(1)}%, ${remaining.toFixed(1)}% remaining.`);

    const usedGases = new Set<string>([primaryGas]);
    let availableGases = ATMOSPHERE_GASES.filter(g => !usedGases.has(g));
    for (let i = 1; i < numGases && remaining > 0.1 && availableGases.length > 0; i++) {
        const gasIndex = prng.randomInt(0, availableGases.length - 1);
        const gas = availableGases.splice(gasIndex, 1)[0];
        usedGases.add(gas);

        const percent = (i === numGases - 1 || availableGases.length === 0) // Last gas gets remainder
            ? remaining
            : prng.random(0.1, remaining / 1.5);
        if (percent > 0.05) { // Only add if significant
            comp[gas] = percent;
            remaining -= percent;
        }
    }

    // Normalize (simplified for brevity)
    let totalRaw = Object.values(comp).reduce((s, p) => s + p, 0);
    const finalComp: AtmosphereComposition = {};
    if (totalRaw > 0) {
        const scaleFactor = 100 / totalRaw;
        for (const gas in comp) {
            const normalized = Math.round(comp[gas] * scaleFactor * 10) / 10; // Round to 1 decimal
            if (normalized > 0) finalComp[gas] = normalized;
        }
        // Final adjustment (simplified)
        let finalTotal = Object.values(finalComp).reduce((s, p) => s + p, 0);
        if (Math.abs(finalTotal - 100) > 0.1 && finalComp[primaryGas]) {
            finalComp[primaryGas] = Math.max(0, Math.round((finalComp[primaryGas] + (100 - finalTotal)) * 10) / 10); // Adjust primary gas
        }
    } else {
        finalComp['Nitrogen'] = 100; // Fallback
    }

    logger.debug(`[AtmoGen] Final Composition: ${JSON.stringify(finalComp)}`);
    return finalComp;
}


/** Generates the atmosphere properties. */
export function generateAtmosphere(
    prng: PRNG,
    planetType: string,
    gravity: number, // Still useful for density adjustment
    parentStarType: string,
    orbitDistance: number
): Atmosphere {
    logger.debug(`[AtmoGen] Generating atmosphere (Type: ${planetType}, Gravity: ${gravity.toFixed(2)}g)...`);
    const densityRoll = prng.random();
    let densityIndex = 0;
    if (densityRoll < 0.2) densityIndex = 0; // None
    else if (densityRoll < 0.5) densityIndex = 1; // Thin
    else if (densityRoll < 0.85) densityIndex = 2; // Earth-like
    else densityIndex = 3;                        // Thick

    let initialDensity = ATMOSPHERE_DENSITIES[densityIndex];
    logger.debug(`[AtmoGen] Initial density roll: ${densityRoll.toFixed(2)} -> ${initialDensity}`);

    // Adjustments based on type and gravity
    if (planetType === 'GasGiant' || planetType === 'IceGiant') {
      densityIndex = 3; // Thick
    } else if (planetType === 'Lunar' || planetType === 'Molten') {
      densityIndex = prng.choice([0, 0, 1])!; // High chance of None
    } else if (gravity < 0.3 && densityIndex > 1) {
      densityIndex = 1; // Low gravity limits thick atmospheres
    }

    const finalDensity = ATMOSPHERE_DENSITIES[densityIndex];
    const pressure = densityIndex === 0 ? 0 : Math.max(0.01, prng.random(0.01, 5) * densityIndex * Math.sqrt(gravity)); // Pressure scales with density and gravity
    logger.debug(`[AtmoGen] Final Density: ${finalDensity}, Pressure: ${pressure.toFixed(3)} bar`);

    // Generate composition
    const composition = generateAtmosphereComposition(prng, finalDensity, planetType, parentStarType, orbitDistance); // Calls internal helper
    return { density: finalDensity, pressure, composition };
}