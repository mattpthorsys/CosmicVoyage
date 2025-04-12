// src/generation/planet_characteristics_generator.ts (Complete File with Modifications)

import { PRNG } from '../../utils/prng';
// Assuming ELEMENTS is now defined in constants.ts from the previous step
import { PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, MineralRichness, ELEMENTS, ElementInfo } from '../../constants'; // Added ELEMENTS, ElementInfo
import { logger } from '../../utils/logger';
import { Atmosphere, AtmosphereComposition } from '../../entities/planet'; // Import types

// Interface for the generated characteristics package - ADD elementAbundance
export interface PlanetCharacteristics {
    diameter: number;
    gravity: number;
    atmosphere: Atmosphere;
    surfaceTemp: number; // Calculated *after* atmosphere
    hydrosphere: string;
    lithosphere: string;
    mineralRichness: MineralRichness; // Keep this for potential high-level display/summary
    baseMinerals: number; // Keep this maybe for total potential mining yield? Or remove if focusing solely on specific elements.
    elementAbundance: Record<string, number>; // NEW: Stores abundance (e.g., parts per million, or a relative scale) for each element
}

/** Generates the core physical properties of a planet. */
function generatePhysical(prng: PRNG): { diameter: number, gravity: number } {
    const diameter = Math.max(1000, prng.randomInt(2000, 20000)); // km [cite: 1685]
    const gravity = Math.max(0.01, prng.random(0.1, 2.5)); // G [cite: 1685]
    logger.debug(`[CharGen] Physicals: Diameter=${diameter}km, Gravity=${gravity.toFixed(2)}g`);
    return { diameter, gravity }; // [cite: 1686]
}

/** Generates the atmosphere properties. */
function generateAtmosphere(
    prng: PRNG,
    planetType: string,
    gravity: number, // Needed for density adjustment [cite: 1687]
    parentStarType: string,
    orbitDistance: number // Needed for composition generation [cite: 1687]
): Atmosphere {
    logger.debug(`[CharGen] Generating atmosphere (Type: ${planetType}, Gravity: ${gravity.toFixed(2)}g)...`);
    const densityRoll = prng.random(); // [cite: 1688]
    let densityIndex = 0;
    if (densityRoll < 0.2) densityIndex = 0;        // None [cite: 1689]
    else if (densityRoll < 0.5) densityIndex = 1; // Thin [cite: 1689]
    else if (densityRoll < 0.85) densityIndex = 2; // Earth-like [cite: 1690]
    else densityIndex = 3;                       // Thick [cite: 1690]
    let initialDensity = ATMOSPHERE_DENSITIES[densityIndex]; // [cite: 1690]
    logger.debug(`[CharGen] Initial density roll: ${densityRoll.toFixed(2)} -> ${initialDensity}`);

    // Adjustments based on type and gravity
    if (planetType === 'GasGiant' || planetType === 'IceGiant') {
      densityIndex = 3; // Thick [cite: 1692]
    } else if (planetType === 'Lunar' || planetType === 'Molten') {
      densityIndex = prng.choice([0, 0, 1])!; // High chance of None [cite: 1693]
    } else if (gravity < 0.3 && densityIndex > 1) {
      densityIndex = 1; // Low gravity limits thick atmospheres [cite: 1694]
    }

    const finalDensity = ATMOSPHERE_DENSITIES[densityIndex]; // [cite: 1695]
    const pressure = densityIndex === 0 ? 0 : Math.max(0.01, prng.random(0.01, 5) * densityIndex); // [cite: 1695]
    logger.debug(`[CharGen] Final Density: ${finalDensity}, Pressure: ${pressure.toFixed(3)} bar`);

    // Generate composition [cite: 1696]
    const composition = generateAtmosphereComposition(prng, finalDensity, planetType, parentStarType, orbitDistance); // Pass necessary params [cite: 1696]
    return { density: finalDensity, pressure, composition }; // [cite: 1697]
}

/** Generates atmospheric composition (nested helper). */
function generateAtmosphereComposition(
    prng: PRNG,
    density: string,
    planetType: string,
    parentStarType: string,
    orbitDistance: number // Needed for approximate temp calculation [cite: 1697]
): AtmosphereComposition {
    logger.debug(`[CharGen] Generating composition for density '${density}'...`);
    if (density === 'None') { // [cite: 1698]
        logger.debug(`[CharGen] Composition: None`);
        return { None: 100 }; // [cite: 1699]
    }

    const comp: AtmosphereComposition = {}; // [cite: 1700]
    let remaining = 100.0; // [cite: 1700]
    const numGases = prng.randomInt(2, 6); // [cite: 1700]

    // Approx temp calculation (simplified from Planet class) [cite: 1700]
    const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp; // [cite: 1701]
    const approxTemp = (PLANET_TYPES[planetType]?.baseTemp ?? 300) * // [cite: 1701]
                       (starTempApprox / SPECTRAL_TYPES['G'].temp) ** 0.25 * // Luminosity approx [cite: 1702]
                       (50000 / Math.max(1000, orbitDistance)) ** 0.5 + // Distance effect (sqrt not ^0.25*2) [cite: 1702]
                       prng.random(-50, 50); // [cite: 1702]
    logger.debug(`[CharGen] Approx temp for gas comp: ${approxTemp.toFixed(0)}K`);

    let primaryGas = 'Nitrogen'; // [cite: 1703]
    if (planetType === 'GasGiant' || planetType === 'IceGiant') { // [cite: 1703]
        primaryGas = prng.choice(['Hydrogen', 'Helium'])!; // [cite: 1704]
    } else if (approxTemp < 150) { // Cold [cite: 1704]
         primaryGas = prng.choice(['Nitrogen', 'Nitrogen', 'Methane', 'Carbon Dioxide', 'Argon'])!; // [cite: 1705]
    } else if (approxTemp > 500) { // Hot [cite: 1705]
         primaryGas = prng.choice(['Carbon Dioxide', 'Carbon Dioxide', 'Nitrogen', 'Sulfur Dioxide', 'Water Vapor'])!; // [cite: 1706]
    } else { // Temperate [cite: 1706]
         primaryGas = prng.choice(['Nitrogen', 'Nitrogen', 'Nitrogen', 'Carbon Dioxide', 'Argon', 'Water Vapor'])!; // [cite: 1707]
    }
    logger.debug(`[CharGen] Primary gas chosen: ${primaryGas}`);

    const primaryPercent = prng.random(50, 95); // [cite: 1707]
    comp[primaryGas] = primaryPercent; // [cite: 1708]
    remaining -= primaryPercent; // [cite: 1708]
    logger.debug(`[CharGen] Primary ${primaryGas}: ${primaryPercent.toFixed(1)}%, ${remaining.toFixed(1)}% remaining.`);

    const usedGases = new Set<string>([primaryGas]); // [cite: 1708]
    let availableGases = ATMOSPHERE_GASES.filter(g => !usedGases.has(g)); // [cite: 1709]
    for (let i = 1; i < numGases && remaining > 0.1 && availableGases.length > 0; i++) { // [cite: 1709]
        const gasIndex = prng.randomInt(0, availableGases.length - 1); // [cite: 1710]
        const gas = availableGases.splice(gasIndex, 1)[0]; // [cite: 1710]
        usedGases.add(gas); // [cite: 1711]
        const percent = (i === numGases - 1 || availableGases.length === 0) // Last gas gets remainder [cite: 1711]
            ? remaining // [cite: 1711]
            : prng.random(0.1, remaining / 1.5); // [cite: 1712]
        if (percent > 0.05) { // Only add if significant [cite: 1712]
            comp[gas] = percent; // [cite: 1713]
            remaining -= percent; // [cite: 1713]
        }
    }

    // Normalize (simplified for brevity, full logic from Planet class recommended) [cite: 1714]
    let totalRaw = Object.values(comp).reduce((s, p) => s + p, 0); // [cite: 1714]
    const finalComp: AtmosphereComposition = {}; // [cite: 1714]
    if (totalRaw > 0) { // [cite: 1715]
        const scaleFactor = 100 / totalRaw; // [cite: 1715]
        for (const gas in comp) { // [cite: 1715]
            const normalized = Math.round(comp[gas] * scaleFactor * 10) / 10; // Round to 1 decimal [cite: 1716]
            if (normalized > 0) finalComp[gas] = normalized; // [cite: 1717]
        }
        // Final adjustment (simplified) [cite: 1717]
        let finalTotal = Object.values(finalComp).reduce((s, p) => s + p, 0); // [cite: 1718]
        if (Math.abs(finalTotal - 100) > 0.1 && finalComp[primaryGas]) { // [cite: 1718]
            finalComp[primaryGas] = Math.max(0, Math.round((finalComp[primaryGas] + (100 - finalTotal)) * 10) / 10); // Adjust primary gas to make sum 100 [cite: 1719]
        }
    } else { // [cite: 1719]
        finalComp['Nitrogen'] = 100; // Fallback [cite: 1720]
    }

    logger.debug(`[CharGen] Final Composition: ${JSON.stringify(finalComp)}`);
    return finalComp; // [cite: 1721]
}


/** Calculates surface temperature based on various factors. */
function calculateSurfaceTemp(
    planetType: string,
    orbitDistance: number,
    parentStarType: string,
    atmosphere: Atmosphere // Pass generated atmosphere [cite: 1721]
): number {
    logger.debug(`[CharGen] Calculating surface temp (Orbit: ${orbitDistance.toFixed(0)})...`);
    const starInfo = SPECTRAL_TYPES[parentStarType]; // [cite: 1722]
    const starTemp = starInfo?.temp ?? SPECTRAL_TYPES['G'].temp; // [cite: 1722]
    const starLuminosityFactor = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4; // [cite: 1723]
    const distFactor = (50000 / Math.max(1000, orbitDistance)) ** 2; // Inverse square law [cite: 1723]
    let basePlanetTemp = PLANET_TYPES[planetType]?.baseTemp ?? 300; // Get base temp from type [cite: 1723]
    let temp = basePlanetTemp * (starLuminosityFactor * distFactor) ** 0.25; // Apply radiation balance [cite: 1724]
    logger.debug(`[CharGen] Temp before greenhouse: ${temp.toFixed(1)}K`);

    // Greenhouse effect based on atmosphere [cite: 1724]
    let greenhouseFactor = 1.0; // [cite: 1725]
    if (atmosphere.density === 'Earth-like') greenhouseFactor = 1.15; // [cite: 1725]
    else if (atmosphere.density === 'Thick') greenhouseFactor = 1.6; // [cite: 1726]
    const co2 = atmosphere.composition['Carbon Dioxide'] || 0; // [cite: 1727]
    const methane = atmosphere.composition['Methane'] || 0; // [cite: 1727]
    if (co2 > 50 || methane > 20) greenhouseFactor *= 1.3; // Stronger effect for high greenhouse gases [cite: 1728]
    temp *= greenhouseFactor; // [cite: 1728]
    logger.debug(`[CharGen] Temp after greenhouse (${greenhouseFactor.toFixed(2)}x): ${temp.toFixed(1)}K`);

    // Further adjustments based on type [cite: 1728]
    if (planetType === 'Frozen' || planetType === 'IceGiant') temp *= 0.8; // Higher albedo [cite: 1729]
    if (planetType === 'Molten' || planetType === 'Lunar') temp *= 1.05; // Lower albedo/internal heat? [cite: 1729]

    const finalTemp = Math.max(2, Math.round(temp)); // Ensure minimum temp, round [cite: 1730]
    logger.debug(`[CharGen] Final Surface Temp: ${finalTemp}K`);
    return finalTemp; // [cite: 1730]
}

/** Generates hydrosphere description based on temperature and pressure. */
function generateHydrosphere(prng: PRNG, planetType: string, surfaceTemp: number, atmosphere: Atmosphere): string {
    logger.debug(`[CharGen] Generating hydrosphere (Temp: ${surfaceTemp}K, Pressure: ${atmosphere.pressure.toFixed(3)} bar)...`);
    // Direct types [cite: 1732]
    if (planetType === 'Oceanic') return 'Global Saline Ocean'; // [cite: 1733]
    if (planetType === 'Frozen') return 'Global Ice Sheet, Subsurface Ocean Possible'; // [cite: 1734]
    if (planetType === 'Molten' || planetType === 'Lunar') return 'None'; // [cite: 1734]
    if (planetType === 'GasGiant' || planetType === 'IceGiant') return 'N/A (Gaseous/Fluid Interior)'; // [cite: 1735]

    // Logic for Rock/other types [cite: 1736]
    const tempK = surfaceTemp; // [cite: 1736]
    const pressure = atmosphere.pressure; // [cite: 1737]
    const waterTriplePointPressure = 0.006; // Pressure below which liquid water is unstable [cite: 1737]
    const approxBoilingPoint = 373.15 + (pressure - 1) * 35; // Very rough boiling point adjustment [cite: 1737]
    let description: string; // [cite: 1738]
    if (tempK < 273.15) { // Below freezing [cite: 1738]
        description = (pressure > waterTriplePointPressure) // [cite: 1738]
            ? prng.choice(['Polar Ice Caps, Surface Ice Deposits', 'Scattered Subsurface Ice Pockets'])! // [cite: 1739]
            : 'Trace Ice Sublimating'; // [cite: 1740]
    } else if (tempK < approxBoilingPoint) { // Between freezing and boiling [cite: 1740]
        description = (pressure > 0.01) // Need some pressure for liquid [cite: 1740]
            ? prng.choice(['Arid, Trace Liquid Water Possible', 'Lakes, Rivers, Small Seas', 'Significant Oceans and Seas'])! // [cite: 1741]
            : 'Atmospheric Water Vapor (Low Pressure)'; // [cite: 1742]
    } else { // Above boiling [cite: 1742]
        description = (pressure > 0.01) // [cite: 1742]
            ? (pressure > 5 && prng.random() < 0.3) ? 'Atmospheric Water Vapor, Potential Supercritical Fluid' : 'Trace Water Vapor' // [cite: 1743]
            : 'None (Too Hot, Low Pressure)'; // [cite: 1744]
    }
    logger.debug(`[CharGen] Hydrosphere determined: ${description}`);
    return description; // [cite: 1744]
}

/** Generates lithosphere description based on planet type. */
function generateLithosphere(prng: PRNG, planetType: string): string {
     logger.debug(`[CharGen] Generating lithosphere for type ${planetType}...`);
     let description: string; // [cite: 1745]
     switch (planetType) { // [cite: 1746]
         case 'Molten': description = 'Silicate Lava Flows, Rapidly Cooling Crust'; break; // [cite: 1746]
         case 'Rock': description = prng.choice(['Silicate Rock (Granite/Basalt), Tectonically Active?', 'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?', 'Iron-Rich Crust, Evidence of Metallic Core'])!; break; // [cite: 1747]
         case 'Oceanic': description = 'Submerged Silicate Crust, Probable Hydrothermal Vents'; break; // [cite: 1749]
         case 'Lunar': description = 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles'; break; // [cite: 1749]
         case 'GasGiant': description = 'No Solid Surface Defined'; break; // [cite: 1750]
         case 'IceGiant': description = 'No Solid Surface Defined, Deep Icy/Fluid Mantle'; break; // [cite: 1751]
         case 'Frozen': description = prng.choice(['Water Ice Dominant, Ammonia/Methane Ices Present', 'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism', 'Mixed Ice/Rock Surface, Sublimation Features'])!; break; // [cite: 1751]
         default: description = 'Unknown Composition'; logger.warn(`[CharGen] Unknown planet type '${planetType}' for lithosphere.`); break; // [cite: 1752]
     }
     logger.debug(`[CharGen] Lithosphere determined: ${description}`);
     return description; // [cite: 1754]
}

// --- NEW Function: Calculate Element Abundance ---
/** Calculates the abundance of each defined element based on planet properties. */
function calculateElementAbundance(
    prng: PRNG,
    planetType: string,
    surfaceTemp: number,
    lithosphere: string // Use generated lithosphere description
    // Add other relevant characteristics if needed (e.g., gravity, atmosphere density)
): Record<string, number> {
    logger.debug(`[CharGen] Calculating element abundance for Type: ${planetType}, Temp: ${surfaceTemp}K, Litho: ${lithosphere}...`);
    const abundance: Record<string, number> = {};
    const abundancePRNG = prng.seedNew("element_abundance");

    for (const key in ELEMENTS) {
        const element = ELEMENTS[key];
        let frequency = element.baseFrequency;

        // --- Apply Modifiers based on Planet Characteristics ---
        // Example Modifiers (Expand these rules significantly based on desired realism/gameplay)

        // Type-based modifiers
        switch (planetType) {
            case 'Rock':
                if (['IRON', 'SILICON', 'ALUMINIUM', 'MAGNESIUM', 'NICKEL', 'SULFUR'].includes(key)) frequency *= 1.5;
                if (['GOLD', 'PLATINUM', 'URANIUM', 'NEODYMIUM', 'DYSPROSIUM', 'LEAD', 'ZINC', 'TIN', 'COPPER'].includes(key)) frequency *= 1.2; // Richer in metals
                if (['WATER_ICE', 'HELIUM'].includes(key)) frequency *= 0.1; // Less likely on standard rock
                break;
            case 'Molten':
                if (['IRON', 'NICKEL', 'SULFUR', 'TITANIUM', 'TUNGSTEN', 'URANIUM', 'THORIUM', 'PLATINUM', 'PALLADIUM', 'RHODIUM', 'GOLD'].includes(key)) frequency *= 1.8; // Concentrated heavy/heat-resistant elements
                if (['WATER_ICE', 'HELIUM', 'PHOSPHORUS', 'POTASSIUM', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.01; // Volatiles boiled off
                if (['SILICON', 'ALUMINIUM', 'MAGNESIUM'].includes(key)) frequency *= 0.5; // Less dominant than metals
                break;
            case 'Oceanic':
                 // Assume dissolved minerals accessible via specialized means later? For surface mining:
                if (['WATER_ICE'].includes(key)) frequency = 0; // It's liquid water
                if (['MAGNESIUM', 'POTASSIUM', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.2; // Present, but dissolved/hard to mine directly
                if (['IRON', 'COPPER', 'ZINC', 'SILICON', 'ALUMINIUM'].includes(key)) frequency *= 0.1; // Locked in crust
                if (['SULFUR', 'PHOSPHORUS'].includes(key)) frequency *= 0.3; // Potential from vents/life
                break;
            case 'Lunar':
                if (['SILICON', 'ALUMINIUM', 'TITANIUM', 'IRON', 'MAGNESIUM'].includes(key)) frequency *= 1.1; // Regolith composition
                if (['HELIUM3'].includes(key)) frequency *= 2.0; // Solar wind implantation (NOTE: Helium-3 not in the real list, use HELIUM?) -> Keep HELIUM check separate
                if (['HELIUM'].includes(key)) frequency *= 1.5; // General helium from solar wind
                 // Very low volatiles/atmospherics
                if (['WATER_ICE', 'CARBON', 'PHOSPHORUS', 'SULFUR', 'POTASSIUM', 'LEAD', 'TIN', 'ZINC', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.05;
                break;
            case 'GasGiant':
            case 'IceGiant':
                 // Only allow specific elements relevant to gas giants (assuming scoop tech later)
                if (!['HELIUM', 'HYDROGEN'].includes(key)) { // Assuming HYDROGEN could be added to ELEMENTS if needed, remove ice types for gas giants
                    frequency = 0;
                } else {
                    frequency *= 5.0; // Significantly boost relevant gases
                }
                 // Ice giants might have some ices accessible in upper layers
                 if (planetType === 'IceGiant' && ['WATER_ICE', 'METHANE_ICE', 'AMMONIA_ICE'].includes(key)) { // Add ice checks back for IceGiant
                    frequency = ELEMENTS[key].baseFrequency * 1.5; // Reset frequency and boost
                 } else if (planetType === 'IceGiant') {
                    // Reduce frequency of non-gas/ice elements even further for Ice Giants compared to Gas Giants if desired
                 }
                break;
            case 'Frozen':
                if (['WATER_ICE', 'CARBON', 'SILICON', 'AMMONIA_ICE'].includes(key)) frequency *= 1.6; // Ices and some rock base
                if (['IRON', 'NICKEL', 'COPPER', 'ALUMINIUM'].includes(key)) frequency *= 0.7; // Metals trapped under ice
                if (['GOLD', 'PLATINUM', 'PALLADIUM', 'RHODIUM'].includes(key)) frequency *= 0.5; // Less geological activity?
                if (['HELIUM'].includes(key)) frequency *= 0.2; // Might trap some
                break;
        }

        // Lithosphere-based modifiers (Simple examples)
        if (lithosphere.includes('Tectonically Active') && ['GOLD', 'SILVER', 'COPPER', 'LEAD', 'ZINC', 'URANIUM', 'PLATINUM', 'PALLADIUM', 'RHODIUM', 'TUNGSTEN', 'TIN', 'INDIUM', 'GALLIUM', 'GERMANIUM'].includes(key)) {
             frequency *= 1.3; // More hydrothermal activity/concentration
        }
        if (lithosphere.includes('Iron-Rich') && ['IRON', 'NICKEL', 'COBALT', 'MAGNESIUM'].includes(key)) {
            frequency *= 1.5;
        }
         if (lithosphere.includes('Carbonaceous') && ['CARBON', 'PHOSPHORUS', 'SULFUR'].includes(key)) { // Note: CARBON not in real list
            frequency *= 1.4;
        }
        if (lithosphere.includes('Regolith') && ['SILICON', 'ALUMINIUM', 'IRON', 'TITANIUM', 'HELIUM'].includes(key)) { // Lunar type adjustment overlap
            frequency *= 1.1;
        }

        // Temperature-based modifiers (Simple examples)
        if (surfaceTemp > 600) { // Very hot
            if (['WATER_ICE', 'AMMONIA_ICE', 'HELIUM', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.001; // Volatiles gone
            if (['TUNGSTEN', 'RHODIUM', 'PLATINUM', 'THORIUM', 'URANIUM'].includes(key)) frequency *= 1.1; // Heat resistant may concentrate
        } else if (surfaceTemp < 100) { // Very cold
            if (['IRON', 'NICKEL', 'TUNGSTEN', 'COPPER', 'ZINC'].includes(key)) frequency *= 0.8; // Maybe less accessible under deep ice?
            if (['WATER_ICE', 'HELIUM'].includes(key)) frequency *= 1.2; // Trapped ices/gases
        }

        // --- Apply Randomness ---
        // Use a large base scale and then adjust with randomness
        // This creates a wide potential range based on frequency
        let calculatedAbundance = (frequency > 0)
            ? Math.pow(abundancePRNG.random(0.001, 1), 1 / Math.max(0.01, frequency)) * 10000 * frequency // Ensure frequency doesn't cause issues if near zero, skew results
            : 0;

        // Add some +/- variation
        calculatedAbundance *= abundancePRNG.random(0.7, 1.3);

        // Ensure non-negative and potentially round or floor
        abundance[key] = Math.max(0, Math.round(calculatedAbundance)); // Store as integer ppm or relative value
    }
    logger.debug(`[CharGen] Final Element Abundance: ${JSON.stringify(abundance)}`);
    return abundance;
}

/** Determines mineral richness based on planet type and PRNG roll. (Kept for summary) */
function determineMineralRichness(prng: PRNG, planetType: string): MineralRichness {
    logger.debug(`[CharGen] Determining mineral richness category for type ${planetType}...`);
    const mineralPRNG = prng.seedNew("minerals"); // Use planet's PRNG [cite: 1756]
    let baseChance = 0.5; // Default chance to have *any* minerals [cite: 1756]
    switch (planetType) { // [cite: 1756]
        case 'Molten': baseChance = 0.6; break; // [cite: 1757]
        case 'Rock': baseChance = 0.8; break; // [cite: 1757]
        case 'Lunar': baseChance = 0.7; break; // [cite: 1757]
        case 'Frozen': baseChance = 0.4; break; // [cite: 1758]
        case 'Oceanic': baseChance = 0.2; break; // Lower chance for easily mineable [cite: 1758]
        case 'GasGiant': case 'IceGiant': return MineralRichness.NONE; // Cannot mine surface [cite: 1758]
        default: baseChance = 0.5; // [cite: 1759]
    }
     // Roll to see if *any* significant minerals exist [cite: 1759]
    if (mineralPRNG.random() > baseChance) { // [cite: 1759]
        logger.debug(`[CharGen] Mineral richness failed base chance (${baseChance.toFixed(2)}). Richness: None`);
        return MineralRichness.NONE; // [cite: 1759]
    }
     // If minerals exist, determine richness level [cite: 1759]
    const roll = mineralPRNG.random(); // [cite: 1760]
    let richness: MineralRichness; // [cite: 1760]
    if (roll < 0.40) richness = MineralRichness.POOR;       // 40% chance [cite: 1760]
    else if (roll < 0.75) richness = MineralRichness.AVERAGE; // 35% chance [cite: 1761]
    else if (roll < 0.95) richness = MineralRichness.RICH;    // 20% chance [cite: 1761]
    else richness = MineralRichness.EXCEPTIONAL; // 5% chance [cite: 1762]
    logger.debug(`[CharGen] Mineral richness category determined: ${richness}`);
    return richness; // [cite: 1762]
}

/** Calculates base minerals based on richness level. (Kept for summary)*/
function calculateBaseMinerals(prng: PRNG, richness: MineralRichness): number {
    let factor = 0; // [cite: 1763]
    switch (richness) { // [cite: 1763]
        case MineralRichness.POOR: factor = 1; break; // [cite: 1764]
        case MineralRichness.AVERAGE: factor = 2; break; // [cite: 1764]
        case MineralRichness.RICH: factor = 5; break; // [cite: 1764]
        case MineralRichness.EXCEPTIONAL: factor = 10; break; // [cite: 1765]
        default: return 0; // No minerals [cite: 1765]
    }
    // Base amount calculation - maybe represents total extractable units? [cite: 1765]
    const baseAmount = Math.round(factor * 1000 * prng.random(0.8, 1.2)); // [cite: 1766]
    logger.debug(`[CharGen] Base minerals (legacy value): ${baseAmount} (Factor: ${factor}, Richness: ${richness})`);
    return baseAmount; // [cite: 1766]
}


/** Main function to generate all characteristics. */
export function generatePlanetCharacteristics(
    planetType: string,
    orbitDistance: number,
    planetPRNG: PRNG, // Use the planet-specific PRNG passed in [cite: 1767]
    parentStarType: string
): PlanetCharacteristics {
    logger.info(`[CharGen] Generating characteristics for Type: ${planetType}, Orbit: ${orbitDistance.toFixed(0)}, Star: ${parentStarType}...`);
    const { diameter, gravity } = generatePhysical(planetPRNG); // Uses planetPRNG [cite: 1767]
    const atmosphere = generateAtmosphere(planetPRNG, planetType, gravity, parentStarType, orbitDistance); // Uses planetPRNG [cite: 1768]
    // Note: Temp calculation now correctly uses the generated atmosphere [cite: 1768]
    const surfaceTemp = calculateSurfaceTemp(planetType, orbitDistance, parentStarType, atmosphere); // [cite: 1769]
    const hydrosphere = generateHydrosphere(planetPRNG, planetType, surfaceTemp, atmosphere); // Uses planetPRNG [cite: 1769]
    const lithosphere = generateLithosphere(planetPRNG, planetType); // Uses planetPRNG [cite: 1769]
    const mineralRichness = determineMineralRichness(planetPRNG, planetType); // Uses planetPRNG [cite: 1770]
    const baseMinerals = calculateBaseMinerals(planetPRNG, mineralRichness); // Uses planetPRNG [cite: 1770]

    // Calculate element abundance using the new function [cite: 1770]
    const elementAbundance = calculateElementAbundance(planetPRNG, planetType, surfaceTemp, lithosphere); // Uses planetPRNG

    logger.info(`[CharGen] Characteristics generated for ${planetType}. Richness Category: ${mineralRichness}.`);
    return { // [cite: 1771]
        diameter,
        gravity,
        atmosphere,
        surfaceTemp,
        hydrosphere,
        lithosphere,
        mineralRichness, // Keep for summary?
        baseMinerals,    // Keep for summary?
        elementAbundance // Add the new map
    };
}