// FILE: src/entities/planet/atmosphere_generator.ts
// Contains logic for generating planetary atmosphere details.

import { PRNG } from '../../utils/prng';
import { PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, BOLTZMANN_CONSTANT_K } from '../../constants';
import { logger } from '../../utils/logger';
import { Atmosphere, AtmosphereComposition } from '../../entities/planet'; // Import types used/returned

// --- Molecular Masses (Approximate, kg per molecule) ---
// Calculated from molar mass (g/mol) / Avogadro's Number (approx 6.02214e23) / 1000 (g to kg)
const GAS_MOLECULAR_MASS_KG: Record<string, number> = {
    'Hydrogen': 3.347e-27,   // H2 (Molar Mass ~2.016 g/mol)
    'Helium': 6.646e-27,     // He (Molar Mass ~4.003 g/mol)
    'Methane': 2.663e-26,    // CH4 (Molar Mass ~16.04 g/mol)
    'Ammonia': 2.828e-26,    // NH3 (Molar Mass ~17.03 g/mol)
    'Water Vapor': 2.991e-26,// H2O (Molar Mass ~18.015 g/mol)
    'Neon': 3.351e-26,      // Ne (Molar Mass ~20.18 g/mol)
    'Carbon Monoxide': 4.651e-26, // CO (Molar Mass ~28.01 g/mol)
    'Nitrogen': 4.652e-26,   // N2 (Molar Mass ~28.01 g/mol)
    'Oxygen': 5.313e-26,    // O2 (Molar Mass ~32.00 g/mol)
    'Argon': 6.634e-26,     // Ar (Molar Mass ~39.95 g/mol)
    'Carbon Dioxide': 7.308e-26,// CO2 (Molar Mass ~44.01 g/mol)
    'Fluorine': 6.310e-26,   // F2 (Molar Mass ~38.00 g/mol)
    'Sulfur Dioxide': 1.064e-25,// SO2 (Molar Mass ~64.06 g/mol)
    'Chlorine': 1.177e-25,   // Cl2 (Molar Mass ~70.90 g/mol)
    'Ethane': 4.993e-26,    // C2H6 (Molar Mass ~30.07 g/mol)
    'Xenon': 2.180e-25,     // Xe (Molar Mass ~131.29 g/mol)
    // Add any other gases from ATMOSPHERE_GASES if they differ
};

/** Generates atmospheric composition, considering escape velocity */
function generateAtmosphereComposition(
    prng: PRNG,
    density: string,
    planetType: string,
    escapeVelocity: number, // <<< Added escape velocity
    parentStarType: string,
    orbitDistance: number
): AtmosphereComposition {
    logger.debug(`[AtmoGen] Generating composition for density '${density}' (V_esc: ${escapeVelocity.toFixed(0)} m/s)...`);
    if (density === 'None') {
        logger.debug(`[AtmoGen] Composition: None`);
        return { None: 100 };
    }

    const comp: AtmosphereComposition = {};
    let remaining = 100.0;
    const numGases = prng.randomInt(2, 6);

    // Approx temp calculation (use the same logic as before for consistency *within* generation)
    const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp;
    const approxTemp_K = (PLANET_TYPES[planetType]?.baseTemp ?? 300) *
                       (starTempApprox / SPECTRAL_TYPES['G'].temp) ** 0.25 *
                       (50000 / Math.max(1000, orbitDistance)) ** 0.5 + // Use original distance units here *only* for this approx temp
                       prng.random(-50, 50);
    logger.debug(`[AtmoGen] Approx temp for gas comp: ${approxTemp_K.toFixed(0)}K`);

    // Calculate thermal velocities for light gases
    const v_th_H2 = calculateThermalVelocity(approxTemp_K, GAS_MOLECULAR_MASS_KG['Hydrogen']);
    const v_th_He = calculateThermalVelocity(approxTemp_K, GAS_MOLECULAR_MASS_KG['Helium']);
    const escapeThresholdFactor = 6.0; // Gas likely escapes if V_th > V_esc / 6

    // --- Determine Primary Gas Weights ---
    const primaryGasWeights: Record<string, number> = {};
    let totalPrimaryWeight = 0;

    // Base weights based on type/temp (similar to before)
    let basePrimary: Record<string, number> = {};
    if (planetType === 'GasGiant' || planetType === 'IceGiant') {
        basePrimary = {'Hydrogen': 75, 'Helium': 25};
    } else if (approxTemp_K < 150) { // Cold
         basePrimary = {'Nitrogen': 50, 'Methane': 20, 'Carbon Dioxide': 15, 'Argon': 15};
    } else if (approxTemp_K > 500) { // Hot
         basePrimary = {'Carbon Dioxide': 50, 'Nitrogen': 20, 'Sulfur Dioxide': 15, 'Water Vapor': 15};
    } else { // Temperate
         basePrimary = {'Nitrogen': 60, 'Carbon Dioxide': 15, 'Argon': 10, 'Water Vapor': 15};
    }

    // Adjust weights based on escape velocity
    for (const gas in basePrimary) {
        let weight = basePrimary[gas];
        const gasMass = GAS_MOLECULAR_MASS_KG[gas];
        if (gasMass) {
             const v_th = calculateThermalVelocity(approxTemp_K, gasMass);
             if (v_th * escapeThresholdFactor > escapeVelocity) {
                 // Reduce weight significantly if likely to escape
                 weight *= 0.01; // Greatly reduce chance
                 logger.debug(`[AtmoGen] Reduced weight for primary gas ${gas} due to escape velocity.`);
             }
        }
        if (weight > 0) {
            primaryGasWeights[gas] = weight;
            totalPrimaryWeight += weight;
        }
    }

    // Choose Primary Gas
    let primaryGas = 'Nitrogen'; // Default fallback
    if (totalPrimaryWeight > 0) {
        let roll = prng.random(0, totalPrimaryWeight);
        for (const gas in primaryGasWeights) {
            roll -= primaryGasWeights[gas];
            if (roll <= 0) {
                primaryGas = gas;
                break;
            }
        }
    } else {
        // If all likely primary gases would escape, default to heavier trace? Or handle as 'None'?
        // For now, let's stick with Nitrogen as a fallback, but could return {None: 100}
        logger.warn(`[AtmoGen] All potential primary gases likely escaped for V_esc=${escapeVelocity.toFixed(0)} m/s. Defaulting primary to Nitrogen.`);
    }

    logger.debug(`[AtmoGen] Primary gas chosen: ${primaryGas}`);

    // --- Generate Composition ---
    const primaryPercent = prng.random(50, 95);
    comp[primaryGas] = primaryPercent;
    remaining -= primaryPercent;
    logger.debug(`[AtmoGen] Primary ${primaryGas}: ${primaryPercent.toFixed(1)}%, ${remaining.toFixed(1)}% remaining.`);

    const usedGases = new Set<string>([primaryGas]);
    // Filter available gases based on escape velocity *before* secondary selection
    let availableGases = ATMOSPHERE_GASES.filter(g => {
        if (usedGases.has(g)) return false;
        const gasMass = GAS_MOLECULAR_MASS_KG[g];
        if (!gasMass) return false; // Skip gases without mass defined
        const v_th = calculateThermalVelocity(approxTemp_K, gasMass);
        // Only include if thermal velocity is reasonably below escape velocity
        return (v_th * escapeThresholdFactor < escapeVelocity);
    });

    logger.debug(`[AtmoGen] Available secondary gases after escape velocity filter: ${availableGases.length > 0 ? availableGases.join(', ') : 'None'}`);

    for (let i = 1; i < numGases && remaining > 0.1 && availableGases.length > 0; i++) {
        const gasIndex = prng.randomInt(0, availableGases.length - 1);
        const gas = availableGases.splice(gasIndex, 1)[0]; // Remove chosen gas
        usedGases.add(gas);

        const percent = (i === numGases - 1 || availableGases.length === 0) // Last gas gets remainder
            ? remaining
            : prng.random(0.1, remaining / 1.5); // Assign portion of remainder

        if (percent > 0.05) { // Only add if significant
            comp[gas] = percent;
            remaining -= percent;
        }
    }

    // Normalize and round (same logic as before)
    let totalRaw = Object.values(comp).reduce((s, p) => s + p, 0);
    const finalComp: AtmosphereComposition = {};
    if (totalRaw > 0) {
        const scaleFactor = 100 / totalRaw;
        for (const gas in comp) {
            const normalized = Math.round(comp[gas] * scaleFactor * 10) / 10;
            if (normalized > 0) finalComp[gas] = normalized;
        }
        let finalTotal = Object.values(finalComp).reduce((s, p) => s + p, 0);
        if (Math.abs(finalTotal - 100) > 0.1 && finalComp[primaryGas]) {
             // Adjust primary gas to make total exactly 100
            finalComp[primaryGas] = Math.max(0, Math.round((finalComp[primaryGas] + (100 - finalTotal)) * 10) / 10);
            // Recalculate final total just in case rounding causes issues
            finalTotal = Object.values(finalComp).reduce((s, p) => s + p, 0);
            if (Math.abs(finalTotal - 100) > 0.1) {
                 logger.warn(`[AtmoGen] Normalization adjustment failed to reach 100%. Final total: ${finalTotal.toFixed(1)}%`);
                 // Handle edge case if primary gas adjustment leads to negative or still not 100%
            }
        }
    } else {
        finalComp[primaryGas] = 100; // Fallback if totalRaw was 0
    }


    logger.debug(`[AtmoGen] Final Composition: ${JSON.stringify(finalComp)}`);
    return finalComp;
}

/** Generates the atmosphere properties, considering escape velocity */
export function generateAtmosphere(
    prng: PRNG,
    planetType: string,
    gravity: number, // Still used for pressure calculation
    escapeVelocity: number, // <<< Accept escape velocity
    parentStarType: string,
    orbitDistance: number // Still needed for approx temp in composition
): Atmosphere {
    logger.debug(`[AtmoGen] Generating atmosphere (Type: ${planetType}, Gravity: ${gravity.toFixed(2)}g, V_esc: ${escapeVelocity.toFixed(0)} m/s)...`);

    // --- Determine Density ---
    const densityRoll = prng.random();
    let densityIndex = 0;
    // Base roll (same as before)
    if (densityRoll < 0.2) densityIndex = 0; // None
    else if (densityRoll < 0.5) densityIndex = 1; // Thin
    else if (densityRoll < 0.85) densityIndex = 2; // Earth-like
    else densityIndex = 3;                        // Thick

    let initialDensity = ATMOSPHERE_DENSITIES[densityIndex];
    logger.debug(`[AtmoGen] Initial density roll: ${densityRoll.toFixed(2)} -> ${initialDensity}`);

    // Adjustments based on type and NOW escape velocity
    if (planetType === 'GasGiant' || planetType === 'IceGiant') {
      densityIndex = 3; // Always Thick
    } else if (planetType === 'Lunar' || planetType === 'Molten') {
      densityIndex = prng.choice([0, 0, 1])!; // High chance of None/Thin
    } else {
         // Reduce chance of thick/earth-like for low escape velocity
         const earthLikeEscVel = 11200; // m/s
         if (escapeVelocity < earthLikeEscVel * 0.3 && densityIndex > 1) { // If V_esc < ~3360 m/s
             densityIndex = prng.choice([0, 1])!; // Likely None or Thin
             logger.debug(`[AtmoGen] Reduced density index to ${densityIndex} due to low escape velocity.`);
         } else if (escapeVelocity < earthLikeEscVel * 0.7 && densityIndex > 2) { // If V_esc < ~7840 m/s
             densityIndex = prng.choice([1, 2])!; // Likely Thin or Earth-like
             logger.debug(`[AtmoGen] Reduced density index to ${densityIndex} due to moderate escape velocity.`);
         }
    }

    const finalDensity = ATMOSPHERE_DENSITIES[densityIndex];

    // Calculate Pressure (scales with density index and gravity)
    const pressure = densityIndex === 0 ? 0 : Math.max(0.001, prng.random(0.01, 5) * (densityIndex + 1) * Math.sqrt(gravity));
    logger.debug(`[AtmoGen] Final Density: ${finalDensity}, Pressure: ${pressure.toFixed(3)} bar`);

    // Generate composition (passing escape velocity)
    const composition = generateAtmosphereComposition(prng, finalDensity, planetType, escapeVelocity, parentStarType, orbitDistance);

    return { density: finalDensity, pressure, composition };
}

/** Calculates approximate RMS thermal velocity for a gas */
export function calculateThermalVelocity(temperature_K: number, gasMass_kg: number): number {
    if (!gasMass_kg || gasMass_kg <= 0 || temperature_K <= 0) return 0;
    // v_rms = sqrt(3 * k * T / m)
    return Math.sqrt((3 * BOLTZMANN_CONSTANT_K * temperature_K) / gasMass_kg);
}