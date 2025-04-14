// src/generation/planet_characteristics_generator.ts (Gravity calculated from Density & Diameter)

import { PRNG } from '../../utils/prng';
import { PLANET_TYPES, SPECTRAL_TYPES, MineralRichness, ELEMENTS, ElementInfo } from '../../constants';
import { generatePhysicalBase, calculateGravity } from './physical_generator';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet';
import { generateAtmosphere } from './atmosphere_generator';
import { calculateSurfaceTemp } from './temperature_calculator';

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

/** Generates hydrosphere description based on temperature and pressure. */
function generateHydrosphere(prng: PRNG, planetType: string, surfaceTemp: number, atmosphere: Atmosphere): string {
    logger.debug(`[CharGen] Generating hydrosphere (Temp: ${surfaceTemp}K, Pressure: ${atmosphere.pressure.toFixed(3)} bar)...`);
    // Direct types
    if (planetType === 'Oceanic') return 'Global Saline Ocean';
    if (planetType === 'Frozen') return 'Global Ice Sheet, Subsurface Ocean Possible';
    if (planetType === 'Molten' || planetType === 'Lunar') return 'None';
    if (planetType === 'GasGiant' || planetType === 'IceGiant') return 'N/A (Gaseous/Fluid Interior)';

    // Logic for Rock/other types
    const tempK = surfaceTemp;
    const pressure = atmosphere.pressure;
    const waterTriplePointPressure = 0.006; // Pressure below which liquid water is unstable
    const approxBoilingPoint = 373.15 + (pressure - 1) * 35; // Very rough boiling point adjustment

    let description: string;
    if (tempK < 273.15) { // Below freezing
        description = (pressure > waterTriplePointPressure)
            ? prng.choice(['Polar Ice Caps, Surface Ice Deposits', 'Scattered Subsurface Ice Pockets'])!
            : 'Trace Ice Sublimating';
    } else if (tempK < approxBoilingPoint) { // Between freezing and boiling
        description = (pressure > 0.01) // Need some pressure for liquid
            ? prng.choice(['Arid, Trace Liquid Water Possible', 'Lakes, Rivers, Small Seas', 'Significant Oceans and Seas'])!
            : 'Atmospheric Water Vapor (Low Pressure)';
    } else { // Above boiling
        description = (pressure > 0.01)
            ? (pressure > 5 && prng.random() < 0.3) ? 'Atmospheric Water Vapor, Potential Supercritical Fluid' : 'Trace Water Vapor'
            : 'None (Too Hot, Low Pressure)';
    }
    logger.debug(`[CharGen] Hydrosphere determined: ${description}`);
    return description;
}

/** Generates lithosphere description based on planet type. */
function generateLithosphere(prng: PRNG, planetType: string): string {
     logger.debug(`[CharGen] Generating lithosphere for type ${planetType}...`);
     let description: string;
     switch (planetType) {
         case 'Molten': description = 'Silicate Lava Flows, Rapidly Cooling Crust'; break;
         case 'Rock': description = prng.choice(['Silicate Rock (Granite/Basalt), Tectonically Active?', 'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?', 'Iron-Rich Crust, Evidence of Metallic Core'])!; break;
         case 'Oceanic': description = 'Submerged Silicate Crust, Probable Hydrothermal Vents'; break;
         case 'Lunar': description = 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles'; break;
         case 'GasGiant': description = 'No Solid Surface Defined'; break;
         case 'IceGiant': description = 'No Solid Surface Defined, Deep Icy/Fluid Mantle'; break;
         case 'Frozen': description = prng.choice(['Water Ice Dominant, Ammonia/Methane Ices Present', 'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism', 'Mixed Ice/Rock Surface, Sublimation Features'])!; break;
         default: description = 'Unknown Composition'; logger.warn(`[CharGen] Unknown planet type '${planetType}' for lithosphere.`); break;
     }
     logger.debug(`[CharGen] Lithosphere determined: ${description}`);
     return description;
}

/** Calculates the abundance of each defined element based on planet properties. */
function calculateElementAbundance(
    prng: PRNG,
    planetType: string,
    surfaceTemp: number,
    lithosphere: string,
    gravity: number // Add gravity as a factor
): Record<string, number> {
    logger.debug(`[CharGen] Calculating element abundance for Type: ${planetType}, Temp: ${surfaceTemp}K, Litho: ${lithosphere}, Gravity: ${gravity.toFixed(2)}g...`);
    const abundance: Record<string, number> = {};
    const abundancePRNG = prng.seedNew("element_abundance");

    for (const key in ELEMENTS) {
        const element = ELEMENTS[key];
        let frequency = element.baseFrequency;

        // --- Apply Modifiers ---
        // (Type modifiers as before)
        switch (planetType) {
            case 'Rock':
                if (['IRON', 'SILICON', 'ALUMINIUM', 'MAGNESIUM', 'NICKEL', 'SULFUR'].includes(key)) frequency *= 1.5;
                if (['GOLD', 'PLATINUM', 'URANIUM', 'NEODYMIUM', 'DYSPROSIUM', 'LEAD', 'ZINC', 'TIN', 'COPPER'].includes(key)) frequency *= 1.2;
                if (['WATER_ICE', 'HELIUM'].includes(key)) frequency *= 0.1;
                break;
            case 'Molten':
                if (['IRON', 'NICKEL', 'SULFUR', 'TITANIUM', 'TUNGSTEN', 'URANIUM', 'THORIUM', 'PLATINUM', 'PALLADIUM', 'RHODIUM', 'GOLD'].includes(key)) frequency *= 1.8;
                if (['WATER_ICE', 'HELIUM', 'PHOSPHORUS', 'POTASSIUM', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.01;
                if (['SILICON', 'ALUMINIUM', 'MAGNESIUM'].includes(key)) frequency *= 0.5;
                break;
            case 'Oceanic':
                if (['WATER_ICE'].includes(key)) frequency = 0;
                if (['MAGNESIUM', 'POTASSIUM', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.2;
                if (['IRON', 'COPPER', 'ZINC', 'SILICON', 'ALUMINIUM'].includes(key)) frequency *= 0.1;
                if (['SULFUR', 'PHOSPHORUS'].includes(key)) frequency *= 0.3;
                break;
            case 'Lunar':
                if (['SILICON', 'ALUMINIUM', 'TITANIUM', 'IRON', 'MAGNESIUM'].includes(key)) frequency *= 1.1;
                if (['HELIUM'].includes(key)) frequency *= 1.5;
                if (['WATER_ICE', 'CARBON', 'PHOSPHORUS', 'SULFUR', 'POTASSIUM', 'LEAD', 'TIN', 'ZINC', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.05;
                break;
            case 'GasGiant':
            case 'IceGiant':
                if (!['HELIUM', 'HYDROGEN'].includes(key)) { frequency = 0; }
                else { frequency *= 5.0; }
                if (planetType === 'IceGiant' && ['WATER_ICE', 'METHANE_ICE', 'AMMONIA_ICE'].includes(key)) {
                    frequency = ELEMENTS[key].baseFrequency * 1.5;
                }
                break;
            case 'Frozen':
                if (['WATER_ICE', 'CARBON', 'SILICON', 'AMMONIA_ICE'].includes(key)) frequency *= 1.6;
                if (['IRON', 'NICKEL', 'COPPER', 'ALUMINIUM'].includes(key)) frequency *= 0.7;
                if (['GOLD', 'PLATINUM', 'PALLADIUM', 'RHODIUM'].includes(key)) frequency *= 0.5;
                if (['HELIUM'].includes(key)) frequency *= 0.2;
                break;
        }
        // (Lithosphere modifiers as before)
        if (lithosphere.includes('Tectonically Active') && ['GOLD', 'SILVER', 'COPPER', 'LEAD', 'ZINC', 'URANIUM', 'PLATINUM', 'PALLADIUM', 'RHODIUM', 'TUNGSTEN', 'TIN', 'INDIUM', 'GALLIUM', 'GERMANIUM'].includes(key)) {
             frequency *= 1.3;
        }
        if (lithosphere.includes('Iron-Rich') && ['IRON', 'NICKEL', 'COBALT', 'MAGNESIUM'].includes(key)) { frequency *= 1.5; }
        if (lithosphere.includes('Carbonaceous') && ['CARBON', 'PHOSPHORUS', 'SULFUR'].includes(key)) { frequency *= 1.4; }
        if (lithosphere.includes('Regolith') && ['SILICON', 'ALUMINIUM', 'IRON', 'TITANIUM', 'HELIUM'].includes(key)) { frequency *= 1.1; }

        // (Temperature modifiers as before)
        if (surfaceTemp > 600) { // Very hot
            if (['WATER_ICE', 'AMMONIA_ICE', 'HELIUM', 'LITHIUM', 'BORON'].includes(key)) frequency *= 0.001;
            if (['TUNGSTEN', 'RHODIUM', 'PLATINUM', 'THORIUM', 'URANIUM'].includes(key)) frequency *= 1.1;
        } else if (surfaceTemp < 100) { // Very cold
            if (['IRON', 'NICKEL', 'TUNGSTEN', 'COPPER', 'ZINC'].includes(key)) frequency *= 0.8;
            if (['WATER_ICE', 'HELIUM'].includes(key)) frequency *= 1.2;
        }

        // NEW: Gravity modifier (Higher gravity concentrates heavier elements?)
        if (gravity > 1.5 && ['IRON', 'GOLD', 'PLATINUM', 'PALLADIUM', 'RHODIUM', 'LEAD', 'TUNGSTEN', 'URANIUM', 'THORIUM', 'NICKEL', 'COPPER', 'ZINC', 'TIN'].includes(key)) {
            frequency *= (1 + (gravity - 1.5) * 0.2); // Increase freq by 20% per G above 1.5
        } else if (gravity < 0.5 && ['HELIUM'].includes(key)) {
            frequency *= (1 + (0.5 - gravity) * 0.5); // Lighter gravity holds less gas? Or more accumulates? Let's say easier escape -> less He. Modifier was *1.5 before, reduce based on low G? Let's INCREASE freq for less escape.
        }

        // Apply Randomness
        let calculatedAbundance = (frequency > 0)
            ? Math.pow(abundancePRNG.random(0.001, 1), 1 / Math.max(0.01, frequency)) * 10000 * frequency
            : 0;
        calculatedAbundance *= abundancePRNG.random(0.7, 1.3);
        abundance[key] = Math.max(0, Math.round(calculatedAbundance));
    }
    logger.debug(`[CharGen] Final Element Abundance: ${JSON.stringify(abundance)}`);
    return abundance;
}

/** Determines mineral richness based on planet type and PRNG roll. (Kept for summary) */
function determineMineralRichness(prng: PRNG, planetType: string): MineralRichness {
    logger.debug(`[CharGen] Determining mineral richness category for type ${planetType}...`);
    const mineralPRNG = prng.seedNew("minerals");
    let baseChance = 0.5;
    switch (planetType) {
        case 'Molten': baseChance = 0.6; break;
        case 'Rock': baseChance = 0.8; break;
        case 'Lunar': baseChance = 0.7; break;
        case 'Frozen': baseChance = 0.4; break;
        case 'Oceanic': baseChance = 0.2; break;
        case 'GasGiant': case 'IceGiant': return MineralRichness.NONE;
        default: baseChance = 0.5;
    }
    if (mineralPRNG.random() > baseChance) {
        logger.debug(`[CharGen] Mineral richness failed base chance (${baseChance.toFixed(2)}). Richness: None`);
        return MineralRichness.NONE;
    }
    const roll = mineralPRNG.random();
    let richness: MineralRichness;
    if (roll < 0.40) richness = MineralRichness.POOR;
    else if (roll < 0.75) richness = MineralRichness.AVERAGE;
    else if (roll < 0.95) richness = MineralRichness.RICH;
    else richness = MineralRichness.EXCEPTIONAL;
    logger.debug(`[CharGen] Mineral richness category determined: ${richness}`);
    return richness;
}

/** Calculates base minerals based on richness level. (Kept for summary)*/
function calculateBaseMinerals(prng: PRNG, richness: MineralRichness): number {
    let factor = 0;
    switch (richness) {
        case MineralRichness.POOR: factor = 1; break;
        case MineralRichness.AVERAGE: factor = 2; break;
        case MineralRichness.RICH: factor = 5; break;
        case MineralRichness.EXCEPTIONAL: factor = 10; break;
        default: return 0;
    }
    const baseAmount = Math.round(factor * 1000 * prng.random(0.8, 1.2));
    logger.debug(`[CharGen] Base minerals (legacy value): ${baseAmount} (Factor: ${factor}, Richness: ${richness})`);
    return baseAmount;
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
    const baseMinerals = calculateBaseMinerals(planetPRNG, mineralRichness);

    // Calculate element abundance, now passing gravity as well
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