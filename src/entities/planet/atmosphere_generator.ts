// FILE: src/entities/planet/atmosphere_generator.ts
// Contains logic for generating planetary atmosphere details.
// REFACTORED: Extracted logic from generateAtmosphereComposition into helper functions.
// UPDATED: April 2025 - Expanded GAS_MOLECULAR_MASS_KG with additional gases.

import { PRNG } from '../../utils/prng';
import { PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, BOLTZMANN_CONSTANT_K } from '../../constants';
import { logger } from '../../utils/logger';
import { Atmosphere, AtmosphereComposition } from '../../entities/planet'; // Import types used/returned

// --- Constants ---
const ESCAPE_THRESHOLD_FACTOR = 6.0; // Gas likely escapes if V_th > V_esc / 6

// --- Molecular Masses ---

/**
 * Approximate molecular masses for atmospheric gases in kilograms (kg).
 * Used for calculating thermal escape velocity.
 * Keys MUST match the names used in the ATMOSPHERE_GASES array in constants.ts.
 */
const GAS_MOLECULAR_MASS_KG: Record<string, number> = {
    // Original Gases
    'Hydrogen': 3.347e-27,        // H₂
    'Helium': 6.646e-27,          // He
    'Methane': 2.663e-26,         // CH₄
    'Ammonia': 2.828e-26,         // NH₃
    'Water Vapor': 2.991e-26,     // H₂O
    'Neon': 3.351e-26,           // Ne
    'Carbon Monoxide': 4.651e-26, // CO
    'Nitrogen': 4.652e-26,        // N₂
    'Oxygen': 5.313e-26,         // O₂
    'Argon': 6.634e-26,          // Ar
    'Carbon Dioxide': 7.308e-26,  // CO₂
    'Fluorine': 6.310e-26,        // F₂
    'Sulfur Dioxide': 1.064e-25,  // SO₂
    'Chlorine': 1.177e-25,        // Cl₂
    'Ethane': 4.993e-26,         // C₂H₆
    'Xenon': 2.180e-25,          // Xe

    // New Gases (Added April 2025) - Masses calculated from amu * 1.66054e-27 kg/amu
    'Atomic Hydrogen': 1.674e-27,     // H
    'Hydrogen Cyanide': 4.488e-26,   // HCN (27.03 amu)
    'Formaldehyde': 4.987e-26,      // H₂CO (30.03 amu)
    'Hydrogen Sulfide': 5.659e-26,   // H₂S (34.08 amu)
    'Silicon Monoxide': 7.321e-26,   // SiO (44.09 amu)
    'Carbonyl Sulfide': 9.976e-26,   // OCS (60.08 amu)
    'Acetylene': 4.324e-26,         // C₂H₂ (26.04 amu)
    'Methanol': 5.320e-26,          // CH₃OH (32.04 amu)
    'Formic Acid': 7.643e-26,       // HCOOH (46.03 amu)
    'Silane': 5.334e-26,            // SiH₄ (32.12 amu)
    'Phosphine': 5.646e-26,         // PH₃ (34.00 amu)
    'Hydrogen Chloride': 6.054e-26, // HCl (36.46 amu)
    'Nitric Oxide': 4.983e-26,      // NO (30.01 amu)
    'Nitrous Oxide': 7.308e-26,     // N₂O (44.01 amu) - Same mass as CO2
    'Ozone': 7.971e-26,             // O₃ (48.00 amu)
    'Sulfur Monoxide': 7.980e-26,   // SO (48.06 amu)
    'Silicon Dioxide': 9.976e-26,   // SiO₂ (60.08 amu) - Same mass as OCS
    'Magnesium Oxide': 6.692e-26,   // MgO (40.30 amu)
    'Iron Oxide': 1.193e-25,        // FeO (71.84 amu)
    'Diatomic Carbon': 3.989e-26    // C₂ (24.02 amu)
};

// --- Helper Functions ---

/** Calculates approximate RMS thermal velocity for a gas */
function calculateThermalVelocity(temperature_K: number, gasMass_kg: number): number {
    if (!gasMass_kg || gasMass_kg <= 0 || temperature_K <= 0) return 0;
    // v_rms = sqrt(3 * k * T / m)
    return Math.sqrt((3 * BOLTZMANN_CONSTANT_K * temperature_K) / gasMass_kg);
}

/** Calculates base weights for primary atmosphere gases based on type and temp */
function _getBasePrimaryWeights(planetType: string, approxTemp_K: number): Record<string, number> {
    if (planetType === 'GasGiant' || planetType === 'IceGiant') {
        return {'Hydrogen': 75, 'Helium': 25};
    } else if (approxTemp_K < 150) { // Cold
        return {'Nitrogen': 50, 'Methane': 20, 'Carbon Dioxide': 15, 'Argon': 15};
    } else if (approxTemp_K > 500) { // Hot
        return {'Carbon Dioxide': 50, 'Nitrogen': 20, 'Sulfur Dioxide': 15, 'Water Vapor': 15};
    } else { // Temperate
        return {'Nitrogen': 60, 'Carbon Dioxide': 15, 'Argon': 10, 'Water Vapor': 15};
    }
}

/** Calculates adjusted weights for primary gases considering escape velocity */
function _calculatePrimaryGasWeights(
    planetType: string,
    approxTemp_K: number,
    escapeVelocity: number
): { weights: Record<string, number>, totalWeight: number } {
    const baseWeights = _getBasePrimaryWeights(planetType, approxTemp_K);
    const adjustedWeights: Record<string, number> = {};
    let totalAdjustedWeight = 0;

    for (const gas in baseWeights) {
        let weight = baseWeights[gas];
        const gasMass = GAS_MOLECULAR_MASS_KG[gas];
        if (gasMass) {
            const v_th = calculateThermalVelocity(approxTemp_K, gasMass);
            if (v_th * ESCAPE_THRESHOLD_FACTOR > escapeVelocity) {
                weight *= 0.01; // Reduce weight significantly if likely to escape
                logger.debug(`[AtmoGen] Reduced weight for primary gas ${gas} due to escape velocity.`);
            }
        }
        if (weight > 0) {
            adjustedWeights[gas] = weight;
            totalAdjustedWeight += weight;
        }
    }
    return { weights: adjustedWeights, totalWeight: totalAdjustedWeight };
}

/** Chooses the primary gas based on calculated weights */
function _choosePrimaryGas(weights: Record<string, number>, totalWeight: number, prng: PRNG): string {
    let primaryGas = 'Nitrogen'; // Default fallback
    if (totalWeight > 0) {
        let roll = prng.random(0, totalWeight);
        for (const gas in weights) {
            roll -= weights[gas];
            if (roll <= 0) {
                primaryGas = gas;
                break;
            }
        }
    } else {
        logger.warn(`[AtmoGen] All potential primary gases likely escaped or weights were zero. Defaulting primary to Nitrogen.`);
    }
    logger.debug(`[AtmoGen] Primary gas chosen: ${primaryGas}`);
    return primaryGas;
}

/** Distributes the remaining percentage among available secondary gases */
function _distributeSecondaryGases(
    primaryGas: string,
    primaryPercent: number,
    escapeVelocity: number,
    approxTemp_K: number,
    numGasesToGenerate: number, // Total number of gases to aim for
    prng: PRNG
): AtmosphereComposition {
    const composition: AtmosphereComposition = { [primaryGas]: primaryPercent };
    let remainingPercent = 100.0 - primaryPercent;
    const usedGases = new Set<string>([primaryGas]);

    // Filter available gases based on escape velocity
    let availableGases = ATMOSPHERE_GASES.filter(g => {
        if (usedGases.has(g)) return false;
        const gasMass = GAS_MOLECULAR_MASS_KG[g];
        if (!gasMass) {
            logger.warn(`[AtmoGen] Molecular mass missing for potential secondary gas: ${g}. Excluding.`);
            return false; // Exclude if mass data is missing
        }
        const v_th = calculateThermalVelocity(approxTemp_K, gasMass);
        return (v_th * ESCAPE_THRESHOLD_FACTOR < escapeVelocity);
    });

    logger.debug(`[AtmoGen] Available secondary gases after escape filter: ${availableGases.length > 0 ? availableGases.join(', ') : 'None'}`);

    for (let i = 1; i < numGasesToGenerate && remainingPercent > 0.1 && availableGases.length > 0; i++) {
        const gasIndex = prng.randomInt(0, availableGases.length - 1);
        const gas = availableGases.splice(gasIndex, 1)[0]; // Remove chosen gas
        usedGases.add(gas);

        // Last gas gets remainder, otherwise assign portion
        const percent = (i === numGasesToGenerate - 1 || availableGases.length === 0)
            ? remainingPercent
            : prng.random(0.1, remainingPercent / 1.5);

        if (percent > 0.05) { // Only add if significant
            composition[gas] = percent;
            remainingPercent -= percent;
        }
    }
    // Any tiny leftover percentage is implicitly lost in normalization/rounding

    return composition;
}

/** Normalizes composition percentages to sum roughly to 100 */
function _normalizeComposition(composition: AtmosphereComposition, primaryGas: string): AtmosphereComposition {
    let totalRaw = Object.values(composition).reduce((s, p) => s + p, 0);
    const finalComp: AtmosphereComposition = {};

    if (totalRaw > 0) {
        const scaleFactor = 100 / totalRaw;
        for (const gas in composition) {
            const normalized = Math.round(composition[gas] * scaleFactor * 10) / 10; // Round to 1 decimal
            if (normalized > 0) finalComp[gas] = normalized;
        }

        // Adjust primary gas to force total to 100% after rounding
        let finalTotal = Object.values(finalComp).reduce((s, p) => s + p, 0);
        if (Math.abs(finalTotal - 100) > 0.1 && finalComp[primaryGas] !== undefined) {
            finalComp[primaryGas] = Math.max(0, Math.round((finalComp[primaryGas] + (100 - finalTotal)) * 10) / 10);
            // Recalculate final total just in case rounding causes issues
            finalTotal = Object.values(finalComp).reduce((s, p) => s + p, 0);
            if (Math.abs(finalTotal - 100) > 0.1) {
                 logger.warn(`[AtmoGen] Normalization adjustment failed to reach 100%. Final total: ${finalTotal.toFixed(1)}%`);
            }
        } else if (finalComp[primaryGas] === undefined && Math.abs(finalTotal - 100) > 0.1) {
             // If primary gas ended up at 0% after normalization, adjust the most abundant gas
             let mostAbundantGas = '';
             let maxPercent = 0;
             for (const gas in finalComp) {
                 if (finalComp[gas] > maxPercent) {
                     maxPercent = finalComp[gas];
                     mostAbundantGas = gas;
                 }
             }
             if (mostAbundantGas) {
                 finalComp[mostAbundantGas] = Math.max(0, Math.round((finalComp[mostAbundantGas] + (100 - finalTotal)) * 10) / 10);
             }
        }
    } else if (primaryGas && composition[primaryGas] !== undefined) {
         // If totalRaw was somehow 0, ensure primary gas is 100% if it existed initially
         finalComp[primaryGas] = 100;
    } else {
         // If all else fails, report None
         finalComp['None'] = 100;
    }

    logger.debug(`[AtmoGen] Final Composition: ${JSON.stringify(finalComp)}`);
    return finalComp;
}


// --- Main Generator Functions ---

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

    // Approx temp calculation (remains the same for internal generation logic)
    const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp;
    // Use a simplified temperature estimation based on planet type's base temp and star type
    // This avoids circular dependency on the final calculated surface temp
    const approxTemp_K = (PLANET_TYPES[planetType]?.baseTemp ?? 300) *
                       Math.pow(starTempApprox / SPECTRAL_TYPES['G'].temp, 0.5); // Simple scaling based on star temp
    logger.debug(`[AtmoGen] Approx temp for gas comp: ${approxTemp_K.toFixed(0)}K`);

    // 1. Calculate Primary Gas Weights (considering escape velocity)
    const { weights: primaryWeights, totalWeight: totalPrimaryWeight } = _calculatePrimaryGasWeights(
        planetType,
        approxTemp_K,
        escapeVelocity
    );

    // 2. Choose Primary Gas
    const primaryGas = _choosePrimaryGas(primaryWeights, totalPrimaryWeight, prng);

    // 3. Determine Primary Percentage and Distribute Secondary Gases
    const primaryPercent = prng.random(50, 95);
    const numGasesToGenerate = prng.randomInt(2, 6);
    const composition = _distributeSecondaryGases(
        primaryGas,
        primaryPercent,
        escapeVelocity,
        approxTemp_K,
        numGasesToGenerate,
        prng
    );

    // 4. Normalize Composition
    const finalComposition = _normalizeComposition(composition, primaryGas);

    return finalComposition;
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
    // Base roll
    if (densityRoll < 0.2) densityIndex = 0;        // None
    else if (densityRoll < 0.5) densityIndex = 1;   // Thin
    else if (densityRoll < 0.85) densityIndex = 2;  // Earth-like
    else densityIndex = 3;                          // Thick

    let initialDensity = ATMOSPHERE_DENSITIES[densityIndex];
    logger.debug(`[AtmoGen] Initial density roll: ${densityRoll.toFixed(2)} -> ${initialDensity}`);

    // Adjustments based on type and escape velocity
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
    // Ensure pressure is non-zero only if density is not None
    const pressure = densityIndex === 0
        ? 0
        : Math.max(0.001, prng.random(0.01, 5) * (densityIndex + 1) * Math.sqrt(gravity));

    logger.debug(`[AtmoGen] Final Density: ${finalDensity}, Pressure: ${pressure.toFixed(3)} bar`);

    // Generate composition (passing escape velocity)
    const composition = generateAtmosphereComposition(prng, finalDensity, planetType, escapeVelocity, parentStarType, orbitDistance);

    return { density: finalDensity, pressure, composition };
}