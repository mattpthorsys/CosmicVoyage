// FILE: src/entities/planet/surface_descriptor.ts
// Contains logic for generating descriptive text for planet surfaces (hydrosphere, lithosphere).

import { PRNG } from '../../utils/prng';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet'; // Import dependent types
import { AU_IN_METERS } from '../../constants/physics';
import { StellarEnvironment, estimateStellarActivity, getSpectralClass } from '../stellar_environment';

export interface HydrosphereContext {
    surfaceTempMin?: number;
    surfaceTempMax?: number;
    gravity?: number;
    escapeVelocity?: number;
    diameterKm?: number;
    densityGcm3?: number;
    orbitDistanceM?: number;
    environment?: StellarEnvironment;
}

/** Generates hydrosphere description based on phase stability, volatile retention, and stellar environment. */
export function generateHydrosphere(
    prng: PRNG,
    planetType: string,
    surfaceTemp: number,
    atmosphere: Atmosphere,
    context: HydrosphereContext = {}
): string {
    logger.debug(`[SurfDesc] Generating hydrosphere (Temp: ${surfaceTemp}K, Pressure: ${atmosphere.pressure.toFixed(3)} bar)...`);
    const tempK = surfaceTemp;
    const pressure = atmosphere.pressure;
    const minTemp = context.surfaceTempMin ?? surfaceTemp;
    const maxTemp = context.surfaceTempMax ?? surfaceTemp;
    const volatileScore = estimateSurfaceVolatileRetention(planetType, surfaceTemp, atmosphere, context);
    const activity = context.environment && context.orbitDistanceM
        ? estimateStellarActivity(context.environment, context.orbitDistanceM / AU_IN_METERS)
        : 1;

    // Direct types, constrained by the current physical environment.
    if (planetType === 'GasGiant' || planetType === 'IceGiant') return 'N/A (Gaseous/Fluid Interior)';
    if (planetType === 'Molten') return pressure > 20 ? 'Rock vapour and supercritical silicate volatiles' : 'None; volatiles thermally stripped';
    if (planetType === 'Chthonian') return 'None; irradiated metal-silicate surface';
    if (planetType === 'Hycean') return getHyceanHydrosphere(tempK, pressure, volatileScore);
    if (planetType === 'Oceanic') return getOceanicHydrosphere(tempK, pressure, volatileScore);
    if (planetType === 'Greenhouse') return getGreenhouseHydrosphere(tempK, pressure, volatileScore);
    if (planetType === 'CarbonRich') return getCarbonRichHydrosphere(tempK, pressure, volatileScore);
    if (planetType === 'Cryovolcanic') return getCryovolcanicHydrosphere(tempK, atmosphere, context, volatileScore);
    if (planetType === 'DwarfIce') return getDwarfIceHydrosphere(tempK, atmosphere, volatileScore);
    if (planetType === 'Frozen') return getFrozenHydrosphere(tempK, atmosphere, context, volatileScore);
    if (planetType === 'Lunar') {
        if (volatileScore > 0.45 && maxTemp < 170) return 'Cold-trapped polar water ice and volatile frost';
        return volatileScore > 0.22 ? 'Trace polar ice in permanent shadow' : 'None; regolith largely devolatilised';
    }

    const liquidWater = pressure >= 0.006 && minTemp <= estimateWaterBoilingPointK(pressure) && maxTemp >= 273;
    const brine = pressure >= 0.01 && minTemp <= 273 && maxTemp >= 245;
    const hydrocarbon = isHydrocarbonLiquidCandidate(minTemp, maxTemp, atmosphere, pressure, volatileScore);
    const nitrogen = isNitrogenLiquidCandidate(minTemp, maxTemp, atmosphere, pressure, volatileScore);

    let description: string;
    if (volatileScore < 0.18 || (activity > 3.3 && pressure < 0.3)) {
        description = tempK > 360 ? 'None; surface volatiles photolysed or thermally lost' : 'Trace adsorbed ice in sheltered regolith';
    } else if (liquidWater && volatileScore > 0.72) {
        description = prng.choice(['Significant Saline Oceans and Seas', 'Connected shallow seas with polar ice caps'])!;
    } else if (liquidWater && volatileScore > 0.38) {
        description = prng.choice(['Lakes, Rivers, and Small Saline Seas', 'Arid basins with seasonal brines'])!;
    } else if (brine && volatileScore > 0.3) {
        description = 'Perchlorate brines and widespread ground ice';
    } else if (hydrocarbon) {
        description = pressure > 0.6 ? 'Methane/Ethane Lakes over water-ice bedrock' : 'Patchy methane frost with transient hydrocarbon pools';
    } else if (nitrogen) {
        description = 'Nitrogen frost plains with transient cryogenic basins';
    } else if (tempK < 245 && volatileScore > 0.35) {
        description = volatileScore > 0.65 ? 'Global Ice Sheet with buried brine reservoirs' : 'Regional water ice deposits and dry cold traps';
    } else if (tempK > estimateWaterBoilingPointK(pressure)) {
        description = pressure > 22 && volatileScore > 0.5 ? 'Supercritical water reservoir beneath dense steam' : 'Trace water vapour; surface liquid unstable';
    } else {
        description = 'Dry silicate surface with sparse hydrated minerals';
    }
    logger.debug(`[SurfDesc] Hydrosphere determined: ${description}`);
    return description;
}

export function estimateSurfaceVolatileRetention(
    planetType: string,
    surfaceTemp: number,
    atmosphere: Atmosphere,
    context: HydrosphereContext = {}
): number {
    const gravity = context.gravity ?? 1;
    const escapeVelocity = context.escapeVelocity ?? 11000;
    const age = context.environment?.ageGyr ?? 4.6;
    const metallicity = context.environment?.metallicityFeH ?? 0;
    const orbitAu = context.orbitDistanceM && context.orbitDistanceM > 0 ? context.orbitDistanceM / AU_IN_METERS : 1;
    const activity = context.environment ? estimateStellarActivity(context.environment, orbitAu) : 1;
    const spectralClass = context.environment ? getSpectralClass(context.environment.starType) : 'G';
    const pressure = atmosphere.pressure;

    const metallicityFactor = Math.max(0.18, Math.min(1.8, Math.pow(10, metallicity * 0.55)));
    const gravityFactor = Math.max(0.08, Math.min(1.5, Math.pow(Math.max(0.05, gravity), 0.72)));
    const escapeFactor = Math.max(0.08, Math.min(1.6, Math.pow(escapeVelocity / 11200, 0.8)));
    const isColdIcyBody = planetType === 'Frozen' || planetType === 'Cryovolcanic' || planetType === 'DwarfIce';
    const pressureFactor = isColdIcyBody
        ? Math.max(0.42, Math.min(1.35, Math.log10(pressure + 1.2) + 0.58))
        : Math.max(0.1, Math.min(1.5, Math.log10(pressure + 1.2) + 0.45));
    const ageLoss = Math.max(0.35, Math.min(1.18, Math.pow(4.6 / Math.max(0.15, age), 0.18)));
    const activityLoss = Math.max(0.18, 1 / Math.pow(activity, 0.55));
    const hotLoss = surfaceTemp > 340 ? Math.max(0.05, 1 - (surfaceTemp - 340) / 420) : 1;
    const closeOrbitLoss = orbitAu < 0.18 ? Math.max(0.1, orbitAu / 0.18) : 1;
    const coolStarRetention = spectralClass === 'M' || spectralClass === 'K' ? 1.08 : spectralClass === 'O' || spectralClass === 'B' || spectralClass === 'A' ? 0.78 : 1;
    const coldTrapRetention = isColdIcyBody && surfaceTemp < 170 ? 1.45 : isColdIcyBody && surfaceTemp < 245 ? 1.18 : 1;

    const typeFactor =
        planetType === 'Oceanic' || planetType === 'Hycean' ? 1.65 :
        planetType === 'Cryovolcanic' ? 2.45 :
        planetType === 'Frozen' ? 2.05 :
        planetType === 'DwarfIce' ? 1.85 :
        planetType === 'Greenhouse' ? 0.52 :
        planetType === 'CarbonRich' ? 0.35 :
        planetType === 'Lunar' || planetType === 'Chthonian' || planetType === 'Molten' ? 0.16 :
        1;

    const score = metallicityFactor * gravityFactor * escapeFactor * pressureFactor * ageLoss * activityLoss * hotLoss * closeOrbitLoss * coolStarRetention * coldTrapRetention * typeFactor;
    return Math.max(0, Math.min(1, score / 1.8));
}

function getHyceanHydrosphere(tempK: number, pressure: number, volatileScore: number): string {
    if (volatileScore < 0.32) return 'Hydrogen-rich atmosphere over desiccated high-pressure ice';
    if (tempK > 430) return 'Steam-rich supercritical ocean beneath hydrogen envelope';
    if (tempK < 240) return 'Global ice-covered high-pressure ocean beneath hydrogen-rich air';
    if (pressure < 10) return 'Deep ocean with modest hydrogen-rich atmosphere';
    return 'Global High-Pressure Ocean beneath Hydrogen-Rich Air';
}

function getOceanicHydrosphere(tempK: number, pressure: number, volatileScore: number): string {
    if (volatileScore < 0.35) return 'Remnant evaporite basins and hydrated crust';
    if (tempK > estimateWaterBoilingPointK(pressure)) return pressure > 22 ? 'Supercritical global water layer under steam atmosphere' : 'Runaway steam atmosphere over desiccating ocean basins';
    if (tempK < 250) return 'Global ice shell over deep saline ocean';
    return volatileScore > 0.72 ? 'Global Saline Ocean' : 'Shallow saline seas with exposed island arcs';
}

function getGreenhouseHydrosphere(tempK: number, pressure: number, volatileScore: number): string {
    if (tempK > 650 || volatileScore < 0.16) return 'Desiccated basins; water lost to space';
    if (pressure > 20 && tempK > 373) return 'Dense steam and supercritical water traces above dry basalt';
    if (pressure > 1.5) return 'Sulfuric acid cloud reservoir; no stable surface ocean';
    return 'Desiccated basins with trace acid aerosols';
}

function getCarbonRichHydrosphere(tempK: number, pressure: number, volatileScore: number): string {
    if (volatileScore < 0.22) return 'Dry carbon-rich crust, scarce surface water';
    if (tempK >= 90 && tempK <= 190 && pressure > 0.1) return 'Hydrocarbon tars and methane/ethane basin deposits';
    if (tempK < 240) return 'CO/CH4 frosts over dry carbonaceous ice-rock';
    return 'Hydrated minerals only; free water oxygen-starved';
}

function getCryovolcanicHydrosphere(tempK: number, atmosphere: Atmosphere, context: HydrosphereContext, volatileScore: number): string {
    const youngOrDense = (context.environment?.ageGyr ?? 4.6) < 3.5 || (context.densityGcm3 ?? 2.2) > 2.0;
    if (volatileScore < 0.18) return 'Depleted ice shell with dormant cryovolcanic fractures';
    if (isHydrocarbonLiquidCandidate(tempK - 22, tempK + 24, atmosphere, atmosphere.pressure, volatileScore, 0.16)) return 'Methane-rich cryovolcanic lakes over fractured ice';
    if (isNitrogenLiquidCandidate(tempK - 18, tempK + 20, atmosphere, atmosphere.pressure, volatileScore, 0.16)) return 'Nitrogen-methane cryogenic basins on fractured ice';
    if (tempK >= 170 && tempK <= 265 && volatileScore > 0.24) return 'Ammonia-water cryolava reservoirs and unstable surface slush';
    if (youngOrDense || volatileScore > 0.32) return 'Volatile Ice Shell, Subsurface Ocean Likely';
    return 'Thick ice shell with isolated brine pockets';
}

function getDwarfIceHydrosphere(tempK: number, atmosphere: Atmosphere, volatileScore: number): string {
    if (volatileScore < 0.12) return 'Desiccated ice-rock regolith with sparse cold traps';
    if (isNitrogenLiquidCandidate(tempK - 15, tempK + 18, atmosphere, atmosphere.pressure, volatileScore, 0.12)) return 'Nitrogen frost plains with transient cryogenic basins';
    if (isHydrocarbonLiquidCandidate(tempK - 18, tempK + 24, atmosphere, atmosphere.pressure, volatileScore, 0.12)) return 'Methane/Ethane Lakes over water-ice bedrock';
    if (tempK >= 55 && tempK <= 125 && volatileScore > 0.16) return 'Patchy Nitrogen/Methane Frosts over Ice-Rock';
    if (tempK < 55) return 'Hard water ice and nitrogen frost in low-gravity regolith';
    return 'Sublimating volatile frost with exposed ice-rock';
}

function getFrozenHydrosphere(tempK: number, atmosphere: Atmosphere, context: HydrosphereContext, volatileScore: number): string {
    if (volatileScore < 0.14) return 'Dry frozen regolith with trace polar ice';
    if (isHydrocarbonLiquidCandidate(tempK - 22, tempK + 26, atmosphere, atmosphere.pressure, volatileScore, 0.14)) return 'Methane/Ethane Lakes over water-ice bedrock';
    if (isNitrogenLiquidCandidate(tempK - 18, tempK + 22, atmosphere, atmosphere.pressure, volatileScore, 0.14)) return 'Nitrogen frost plains with transient cryogenic basins';
    if (tempK > 273 && atmosphere.pressure > 0.01) return 'Cold brine seas amid retreating ice cover';
    if (tempK >= 240 && tempK <= 278 && volatileScore > 0.22) return 'Perchlorate brines and widespread ground ice';
    const internalWarmth = (context.densityGcm3 ?? 2.8) > 2.35 || (context.environment?.ageGyr ?? 4.6) < 4.2 || volatileScore > 0.38;
    if (internalWarmth) return 'Global Ice Sheet, Subsurface Ocean Possible';
    return 'Global ice sheet with scattered ammonia and methane frost';
}

function estimateWaterBoilingPointK(pressureBar: number): number {
    if (pressureBar <= 0.006) return 0;
    if (pressureBar >= 22.064) return 647;
    return Math.max(273, Math.min(647, 373.15 + Math.log(Math.max(0.01, pressureBar)) * 28));
}

function isHydrocarbonLiquidCandidate(minTemp: number, maxTemp: number, atmosphere: Atmosphere, pressure: number, volatileScore: number, minVolatileScore: number = 0.3): boolean {
    const methane = (atmosphere.composition['Methane'] || 0) + (atmosphere.composition['Ethane'] || 0);
    const pressureOk = pressure > 0.0005 || atmosphere.density === 'Thin' || atmosphere.density === 'Earth-like' || atmosphere.density === 'Thick';
    return volatileScore > minVolatileScore && methane > 2.5 && pressureOk && minTemp <= 190 && maxTemp >= 88;
}

function isNitrogenLiquidCandidate(minTemp: number, maxTemp: number, atmosphere: Atmosphere, pressure: number, volatileScore: number, minVolatileScore: number = 0.28): boolean {
    const nitrogen = atmosphere.composition['Nitrogen'] || 0;
    return volatileScore > minVolatileScore && nitrogen > 12 && pressure > 0.0005 && minTemp <= 96 && maxTemp >= 63;
}

/** Generates lithosphere description based on planet type. */
export function generateLithosphere(prng: PRNG, planetType: string): string {
     logger.debug(`[SurfDesc] Generating lithosphere for type ${planetType}...`);
     let description: string;
     switch (planetType) {
         case 'Molten': description = 'Silicate Lava Flows, Rapidly Cooling Crust'; break;
         case 'Rock': description = prng.choice(['Silicate Rock (Granite/Basalt), Tectonically Active?', 'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?', 'Iron-Rich Crust, Evidence of Metallic Core'])!; break;
         case 'Oceanic': description = 'Submerged Silicate Crust, Probable Hydrothermal Vents'; break;
         case 'Hycean': description = 'Global ocean over high-pressure ice and silicate mantle'; break;
         case 'Greenhouse': description = 'Basaltic highlands, tessera terrain, sulfur-bearing plains'; break;
         case 'CarbonRich': description = prng.choice(['Graphite-Carbide Crust, Diamond-Bearing Mantle Possible', 'Dry Carbonaceous Highlands and Carbide Basins'])!; break;
         case 'Chthonian': description = 'Exposed Iron-Silicate Core, Ablated Mantle Remnants'; break;
         case 'Cryovolcanic': description = 'Fractured Ice Shell, Ammonia-Water Cryolava Flows'; break;
         case 'DwarfIce': description = 'Low-Gravity Ice-Rock Regolith, Volatile Frost Fields'; break;
         case 'Lunar': description = 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles'; break;
         case 'GasGiant': description = 'No Solid Surface Defined'; break;
         case 'IceGiant': description = 'No Solid Surface Defined, Deep Icy/Fluid Mantle'; break;
         case 'Frozen': description = prng.choice(['Water Ice Dominant, Ammonia/Methane Ices Present', 'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism', 'Mixed Ice/Rock Surface, Sublimation Features'])!; break;
         default: description = 'Unknown Composition'; logger.warn(`[SurfDesc] Unknown planet type '${planetType}' for lithosphere.`); break;
     }
     logger.debug(`[SurfDesc] Lithosphere determined: ${description}`);
     return description;
}
