// FILE: src/entities/planet/surface_descriptor.ts
// Contains logic for generating descriptive text for planet surfaces (hydrosphere, lithosphere).

import { PRNG } from '../../utils/prng';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet'; // Import dependent types

/** Generates hydrosphere description based on temperature and pressure. */
export function generateHydrosphere(prng: PRNG, planetType: string, surfaceTemp: number, atmosphere: Atmosphere): string {
    logger.debug(`[SurfDesc] Generating hydrosphere (Temp: ${surfaceTemp}K, Pressure: ${atmosphere.pressure.toFixed(3)} bar)...`);
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
    logger.debug(`[SurfDesc] Hydrosphere determined: ${description}`);
    return description;
}

/** Generates lithosphere description based on planet type. */
export function generateLithosphere(prng: PRNG, planetType: string): string {
     logger.debug(`[SurfDesc] Generating lithosphere for type ${planetType}...`);
     let description: string;
     switch (planetType) {
         case 'Molten': description = 'Silicate Lava Flows, Rapidly Cooling Crust'; break;
         case 'Rock': description = prng.choice(['Silicate Rock (Granite/Basalt), Tectonically Active?', 'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?', 'Iron-Rich Crust, Evidence of Metallic Core'])!; break;
         case 'Oceanic': description = 'Submerged Silicate Crust, Probable Hydrothermal Vents'; break;
         case 'Lunar': description = 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles'; break;
         case 'GasGiant': description = 'No Solid Surface Defined'; break;
         case 'IceGiant': description = 'No Solid Surface Defined, Deep Icy/Fluid Mantle'; break;
         case 'Frozen': description = prng.choice(['Water Ice Dominant, Ammonia/Methane Ices Present', 'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism', 'Mixed Ice/Rock Surface, Sublimation Features'])!; break;
         default: description = 'Unknown Composition'; logger.warn(`[SurfDesc] Unknown planet type '${planetType}' for lithosphere.`); break;
     }
     logger.debug(`[SurfDesc] Lithosphere determined: ${description}`);
     return description;
}