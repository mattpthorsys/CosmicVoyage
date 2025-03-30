// src/entities/planet.ts (Enhanced Logging)

import { CONFIG } from '../config';
// Removed unused GLYPHS import
import { PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, MineralRichness, GLYPHS } from '../constants'; // Added GLYPHS back for heightmap legend potentially? Check Renderer.
import { PRNG } from '../utils/prng';
import { HeightmapGenerator } from '../generation/heightmap';
import { RgbColour, hexToRgb, interpolateColour, rgbToHex } from '../rendering/colour';
import { logger } from '../utils/logger'; // Import the logger
// Removed unused Perlin import

// --- Interfaces and Types ---
export type AtmosphereComposition = Record<string, number>; // Gas name -> Percentage

export interface Atmosphere {
    density: string; // e.g., 'None', 'Thin', 'Thick'
    pressure: number; // Surface pressure in bars (approx)
    composition: AtmosphereComposition;
}

export class Planet {
    // Core Identification & Orbit
    readonly name: string;
    readonly type: string; // e.g., 'Rock', 'GasGiant'
    readonly orbitDistance: number; // Distance from star
    orbitAngle: number; // Current angle in orbit (radians), mutable
    systemX: number; // Current X position in system coords, mutable
    systemY: number; // Current Y position in system coords, mutable

    // Physical Characteristics
    readonly diameter: number; // In km
    readonly gravity: number; // In G's
    readonly surfaceTemp: number; // Average surface temp in Kelvin
    readonly atmosphere: Atmosphere;
    readonly hydrosphere: string; // Description (e.g., 'Global Ocean', 'None')
    readonly lithosphere: string; // Description (e.g., 'Silicate Rock')

    // Resources & Gameplay
    readonly mineralRichness: MineralRichness;
    readonly baseMinerals: number; // Theoretical max mineable amount (scaling factor)
    scanned: boolean = false; // Has the player scanned this planet?
    primaryResource: string | null = null; // Result of scan (e.g., 'Iron', 'Water')

    // Generation & State
    readonly systemPRNG: PRNG; // PRNG seeded specifically for this planet
    readonly mapSeed: string; // Seed specifically for heightmap generation

    // Mutable state / caches - populated by ensureSurfaceReady() or rendering
    heightmap: number[][] | null = null; // 2D array for surface height (solid planets)
    rgbPaletteCache: RgbColour[] | null = null; // Cache for planet type base colours (RGB objects)
    heightLevelColors: string[] | null = null; // Cache for hex colours corresponding to each height level

    // Moons (Optional future feature)
    moons: Planet[] = []; // Moons are treated as smaller planets for now

    constructor(
        name: string,
        type: string,
        orbitDistance: number,
        angle: number,
        systemPRNG: PRNG,
        parentStarType: string // e.g., 'G', 'M'
    ) {
        this.name = name; //
        this.type = type; //
        this.orbitDistance = orbitDistance;
        this.orbitAngle = angle; // Initial angle

        // Seed a PRNG specifically for this planet based on the system's PRNG and planet name
        this.systemPRNG = systemPRNG.seedNew("planet_" + name); //
        logger.debug(`[Planet:${this.name}] Initialized PRNG with seed: ${this.systemPRNG.getInitialSeed()}`);

        // Initial position calculation based on orbit
        this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance; //
        this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance; //

        // --- Generate Physical Characteristics ---
        this.diameter = Math.max(1000, this.systemPRNG.randomInt(2000, 20000)); // km
        this.gravity = Math.max(0.01, this.systemPRNG.random(0.1, 2.5)); // G
        logger.debug(`[Planet:${this.name}] Generated Base Physics: Diameter=${this.diameter}km, Gravity=${this.gravity.toFixed(2)}g`);

        // Generate atmosphere first, as temperature depends on it
        this.atmosphere = this.generateAtmosphere(parentStarType); // Logs internally
        // Calculate temperature based on star, distance, and atmosphere
        this.surfaceTemp = this.calculateSurfaceTemp(parentStarType); // Logs internally
        // Determine water presence and state
        this.hydrosphere = this.generateHydrosphere(); // Logs internally
        // Determine surface rock/ice type
        this.lithosphere = this.generateLithosphere(); // Logs internally
        // Determine potential for mining
        this.mineralRichness = this.determineMineralRichness(); // Logs internally
        // Calculate base amount for mining yield scaling
        this.baseMinerals = this.calculateBaseMinerals(); // Logs internally

        // Create a specific seed for deterministic map generation
        this.mapSeed = this.systemPRNG.getInitialSeed() + "_map"; //
        logger.debug(`[Planet:${this.name}] Map seed set: ${this.mapSeed}`);

        logger.info(`[Planet:${this.name}] Created Planet: Type=${this.type}, Orbit=${this.orbitDistance.toFixed(0)}, Temp=${this.surfaceTemp}K, Atmosphere=${this.atmosphere.density}, Minerals=${this.mineralRichness}`);

        // Moons could be generated here if needed
    }

    // --- Generation Methods ---

    private generateAtmosphere(parentStarType: string): Atmosphere {
         logger.debug(`[Planet:${this.name}] Generating atmosphere (Star Type: ${parentStarType})...`);
         const densityRoll = this.systemPRNG.random(); //
         let densityIndex = 0;
         if (densityRoll < 0.2) densityIndex = 0; // None (20%)
         else if (densityRoll < 0.5) densityIndex = 1; // Thin (30%)
         else if (densityRoll < 0.85) densityIndex = 2; // Earth-like (35%)
         else densityIndex = 3; // Thick (15%)

         let initialDensity = ATMOSPHERE_DENSITIES[densityIndex];
         logger.debug(`[Planet:${this.name}] Atmosphere initial density roll: ${densityRoll.toFixed(2)} -> ${initialDensity}`);

         // Adjust density based on type/gravity
         if (this.type === 'GasGiant' || this.type === 'IceGiant') {
              logger.debug(`[Planet:${this.name}] Adjusting density to Thick for ${this.type}.`);
              densityIndex = 3; // Always Thick
         } else if (this.type === 'Lunar' || this.type === 'Molten') {
              const choice = this.systemPRNG.choice([0, 0, 1])!; // Likely None/Thin
              logger.debug(`[Planet:${this.name}] Adjusting density for ${this.type} (Roll: ${choice}).`);
              densityIndex = choice;
         } else if (this.gravity < 0.3 && densityIndex > 1) {
              logger.debug(`[Planet:${this.name}] Reducing density due to low gravity (${this.gravity.toFixed(2)}g).`);
              densityIndex = 1; // Low gravity struggles to hold thick atmosphere
         }

         const finalDensity = ATMOSPHERE_DENSITIES[densityIndex]; //
         const pressure = densityIndex === 0 ? 0 : Math.max(0.01, this.systemPRNG.random(0.01, 5) * (densityIndex)); // Pressure scales with density index
         logger.debug(`[Planet:${this.name}] Final Atmosphere Density: ${finalDensity}, Pressure: ${pressure.toFixed(3)} bar`);

         // Pass density to composition generator
         const composition = this.generateAtmosphereComposition(finalDensity, parentStarType); // Logs internally

         return { density: finalDensity, pressure, composition }; //
     }

     private generateAtmosphereComposition(density: string, parentStarType: string): AtmosphereComposition {
         logger.debug(`[Planet:${this.name}] Generating atmosphere composition for density '${density}'...`);
         if (density === 'None') {
             logger.debug(`[Planet:${this.name}] Atmosphere composition: None`);
             return { None: 100 }; //
         }

         const comp: AtmosphereComposition = {}; // Raw percentages
         let remaining = 100.0;
         const numGases = this.systemPRNG.randomInt(2, 6); //

         // Determine primary gas based on type and estimated temp (rough guess before temp is final)
         // Nullish Coalescing for safety if star/planet type somehow invalid
         const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp; //
         const approxTemp = (PLANET_TYPES[this.type]?.baseTemp ?? 300) * (starTempApprox / SPECTRAL_TYPES['G'].temp) ** 0.25 + this.systemPRNG.random(-50, 50); // Simplified temp calc for gas choice
         logger.debug(`[Planet:${this.name}] Approx temp for gas comp: ${approxTemp.toFixed(0)}K`);

         let primaryGas = 'Nitrogen'; // Default fallback
         if (this.type === 'GasGiant' || this.type === 'IceGiant') {
             primaryGas = this.systemPRNG.choice(['Hydrogen', 'Helium'])!; //
         } else if (approxTemp < 150) { // Very cold
             primaryGas = this.systemPRNG.choice(['Nitrogen', 'Nitrogen', 'Methane', 'Carbon Dioxide', 'Argon'])!; //
         } else if (approxTemp > 500) { // Very hot
             primaryGas = this.systemPRNG.choice(['Carbon Dioxide', 'Carbon Dioxide', 'Nitrogen', 'Sulfur Dioxide', 'Water Vapor'])!; //
         } else { // Habitable-ish range
             primaryGas = this.systemPRNG.choice(['Nitrogen', 'Nitrogen', 'Nitrogen', 'Carbon Dioxide', 'Argon', 'Water Vapor'])!; //
         }
         logger.debug(`[Planet:${this.name}] Primary atmosphere gas chosen: ${primaryGas}`);

         // Assign primary gas percentage
         const primaryPercent = this.systemPRNG.random(50, 95); //
         comp[primaryGas] = primaryPercent;
         remaining -= primaryPercent;
         logger.debug(`[Planet:${this.name}] Primary gas ${primaryGas} at ${primaryPercent.toFixed(1)}%, ${remaining.toFixed(1)}% remaining for ${numGases -1} other gases.`);

         // Add secondary gases
         const usedGases = new Set<string>([primaryGas]); //
         let availableGases = ATMOSPHERE_GASES.filter(g => !usedGases.has(g)); //

         for (let i = 1; i < numGases && remaining > 0.1 && availableGases.length > 0; i++) {
             const gasIndex = this.systemPRNG.randomInt(0, availableGases.length - 1); //
             const gas = availableGases.splice(gasIndex, 1)[0]; // Pick and remove from available
             usedGases.add(gas);

             // Assign percentage, give remainder to last gas
             const percent = (i === numGases - 1 || availableGases.length === 0)
                 ? remaining // Assign the rest to the last one
                 : this.systemPRNG.random(0.1, remaining / 1.5); // Assign portion to others
             if (percent > 0.05) { // Only add if significant percentage
                 comp[gas] = percent; //
                 remaining -= percent;
                 logger.debug(`[Planet:${this.name}] Added secondary gas ${gas} at ${percent.toFixed(1)}%, ${remaining.toFixed(1)}% remaining.`);
             } else {
                  logger.debug(`[Planet:${this.name}] Skipping negligible secondary gas ${gas} (${percent.toFixed(1)}%).`);
             }
         }

         // Normalize percentages to sum exactly to 100, rounding appropriately
         let totalRaw = Object.values(comp).reduce((s, p) => s + p, 0);
         const finalComp: AtmosphereComposition = {};
         if (totalRaw > 0) {
             const scaleFactor = 100 / totalRaw; //
             let runningTotal = 0;
             const keys = Object.keys(comp).sort((a, b) => comp[b] - comp[a]); // Process major gases first
             logger.debug(`[Planet:${this.name}] Normalizing composition. Raw total: ${totalRaw.toFixed(2)}%, Scale: ${scaleFactor.toFixed(3)}`);

             for (let i = 0; i < keys.length; i++) {
                 const gas = keys[i];
                 const isLast = (i === keys.length - 1); //
                 let roundedPercent: number;

                 if (isLast) {
                      // Assign remaining percentage to ensure total is 100
                     roundedPercent = Math.max(0, 100 - runningTotal); //
                     logger.debug(`[Planet:${this.name}] Assigning remaining ${roundedPercent.toFixed(1)}% to last gas ${gas}.`);
                 } else {
                     const scaledValue = comp[gas] * scaleFactor; //
                     // Round smaller percentages to 1 decimal place, larger to whole number
                     roundedPercent = scaledValue >= 1 ? Math.round(scaledValue) : Math.round(scaledValue * 10) / 10; //
                 }

                 // Final rounding for last element if needed (e.g., if it was 9.95)
                 if(isLast) roundedPercent = roundedPercent >= 1 ? Math.round(roundedPercent) : Math.round(roundedPercent * 10) / 10;

                 if (roundedPercent > 0) {
                     finalComp[gas] = roundedPercent; //
                     runningTotal += roundedPercent; // Use the final rounded percent for the running total
                     logger.debug(`[Planet:${this.name}] Normalized ${gas}: ${comp[gas].toFixed(1)}% -> ${roundedPercent}% (Running total: ${runningTotal.toFixed(1)}%)`);
                 }
             }
             // Final check for 100% total due to potential rounding cascade issues
              let finalTotalCheck = Object.values(finalComp).reduce((s, p) => s + p, 0); //
              if (Math.abs(finalTotalCheck - 100) > 0.01) {
                   logger.warn(`[Planet:${this.name}] Normalization resulted in ${finalTotalCheck.toFixed(2)}% total. Adjusting primary gas ${primaryGas}.`);
                   const diff = Math.round((100 - finalTotalCheck) * 10) / 10; // Calculate adjustment
                   if (finalComp[primaryGas] !== undefined) {
                        finalComp[primaryGas] = Math.max(0, finalComp[primaryGas] + diff); // Adjust primary gas
                        // Re-round primary gas after adjustment
                        finalComp[primaryGas] = finalComp[primaryGas] >= 1 ? Math.round(finalComp[primaryGas]) : Math.round(finalComp[primaryGas] * 10) / 10; //
                   } else if (keys.length > 0 && finalComp[keys[0]] !== undefined) {
                       // Fallback: adjust the most abundant gas if primary somehow missing
                        finalComp[keys[0]] = Math.max(0, finalComp[keys[0]] + diff);
                        finalComp[keys[0]] = finalComp[keys[0]] >= 1 ? Math.round(finalComp[keys[0]]) : Math.round(finalComp[keys[0]] * 10) / 10;
                        logger.warn(`[Planet:${this.name}] Primary gas missing, adjusted ${keys[0]} instead.`);
                   }
              }

         } else if (density !== 'None') {
              // Should not happen if density isn't None, but handle defensively
             logger.warn(`[Planet:${this.name}] Atmosphere composition calculation failed for density ${density}. Defaulting to Nitrogen.`);
             finalComp['Nitrogen'] = 100; //
         }

         logger.debug(`[Planet:${this.name}] Final Composition: ${JSON.stringify(finalComp)}`);
         return finalComp; //
     }


    private calculateSurfaceTemp(parentStarType: string): number {
        logger.debug(`[Planet:${this.name}] Calculating surface temperature...`);
        const starInfo = SPECTRAL_TYPES[parentStarType];
        if (!starInfo) {
            logger.warn(`[Planet:${this.name}] Unknown star type '${parentStarType}' for temp calc. Defaulting to G type.`);
        }
        const starTemp = starInfo?.temp ?? SPECTRAL_TYPES['G'].temp; // Use ?? fallback
        // Simplified luminosity relative to Sol (G type = 5500K)
        const starLuminosityFactor = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4; // Stefan-Boltzmann Law (L ~ T^4)
        // Inverse square law for distance (relative to some baseline distance, e.g., 1 AU ~ 50000 units?)
        const distFactor = (50000 / Math.max(1000, this.orbitDistance)) ** 2; // Avoid division by zero if orbit is tiny
        logger.debug(`[Planet:${this.name}] Star Temp: ${starTemp}K, Lum Factor: ${starLuminosityFactor.toFixed(2)}, Dist Factor: ${distFactor.toFixed(3)} (Orbit: ${this.orbitDistance.toFixed(0)})`);

        // Base temperature from planet type, fallback if unknown
        let basePlanetTemp = PLANET_TYPES[this.type]?.baseTemp ?? 300; // Use ?? fallback
        // Effective temperature from star radiation alone
        let temp = basePlanetTemp * (starLuminosityFactor * distFactor) ** 0.25; // Equilibrium temp scales roughly with (L/d^2)^0.25
        logger.debug(`[Planet:${this.name}] Temp before greenhouse: ${temp.toFixed(1)}K`);

        // Greenhouse effect approximation based on atmosphere density and composition
        let greenhouseFactor = 1.0; // Base factor
        if (this.atmosphere.density === 'Earth-like') greenhouseFactor = 1.15;
        else if (this.atmosphere.density === 'Thick') greenhouseFactor = 1.6;

        const co2 = this.atmosphere.composition['Carbon Dioxide'] || 0; //
        const methane = this.atmosphere.composition['Methane'] || 0; //
        if (co2 > 50 || methane > 20) {
             greenhouseFactor *= 1.3; // Further increase for high % of greenhouse gases
             logger.debug(`[Planet:${this.name}] Applying strong greenhouse multiplier (CO2/Methane)`);
        }
        temp *= greenhouseFactor;
        logger.debug(`[Planet:${this.name}] Temp after greenhouse (${greenhouseFactor.toFixed(2)}x): ${temp.toFixed(1)}K`);

        // Final adjustments based on planet type (albedo etc. approximations)
        if (this.type === 'Frozen' || this.type === 'IceGiant') temp *= 0.8; // Higher albedo
        if (this.type === 'Molten' || this.type === 'Lunar') temp *= 1.05; // Lower albedo / less heat retention?

        const finalTemp = Math.max(2, Math.round(temp)); // Ensure temp is above absolute zero (2K)
        logger.debug(`[Planet:${this.name}] Final Surface Temp: ${finalTemp}K`);
        return finalTemp; //
    }

    private generateHydrosphere(): string {
        logger.debug(`[Planet:${this.name}] Generating hydrosphere (Temp: ${this.surfaceTemp}K, Pressure: ${this.atmosphere.pressure.toFixed(3)} bar)...`);
        let description: string;

        if (this.type === 'Oceanic') description = 'Global Saline Ocean'; //
        else if (this.type === 'Frozen') description = 'Global Ice Sheet, Subsurface Ocean Possible'; //
        else if (this.type === 'Molten' || this.type === 'Lunar') description = 'None'; //
        else if (this.type === 'GasGiant' || this.type === 'IceGiant') description = 'N/A (Gaseous/Fluid Interior)'; //
        else {
             // Logic for Rock/other types based on temp/pressure
            const tempK = this.surfaceTemp;
            const pressure = this.atmosphere.pressure;
            const waterTriplePointPressure = 0.006; // bars
            const approxBoilingPoint = 373.15 + (pressure - 1) * 35; // Very rough boiling point adjustment for pressure

            if (tempK < 273.15) { // Below freezing
                if (pressure > waterTriplePointPressure) {
                     description = this.systemPRNG.random() < 0.6
                        ? 'Polar Ice Caps, Surface Ice Deposits' //
                        : 'Scattered Subsurface Ice Pockets'; //
                 } else {
                      description = 'Trace Ice Sublimating'; // Too low pressure for stable surface ice
                 }
            } else if (tempK < approxBoilingPoint) { // Between freezing and boiling
                if (pressure > 0.01) { // Need some pressure for liquid water
                    const waterChance = this.systemPRNG.random(); //
                    if (waterChance < 0.15) description = 'Arid, Trace Liquid Water Possible'; //
                    else if (waterChance < 0.6) description = 'Lakes, Rivers, Small Seas'; //
                    else description = 'Significant Oceans and Seas'; //
                } else {
                     description = 'Atmospheric Water Vapor (Low Pressure)'; // Boils away quickly
                }
            } else { // Above boiling
                 if (pressure > 0.01) {
                      description = (pressure > 5 && this.systemPRNG.random() < 0.3)
                           ? 'Atmospheric Water Vapor, Potential Supercritical Fluid' // High pressure vapor
                           : 'Trace Water Vapor'; // Low pressure vapor
                 } else {
                      description = 'None (Too Hot, Low Pressure)';
                 }
            }
        }
        logger.debug(`[Planet:${this.name}] Hydrosphere determined: ${description}`);
        return description; //
    }

    private generateLithosphere(): string {
         logger.debug(`[Planet:${this.name}] Generating lithosphere...`);
         let description: string;
         switch (this.type) { //
             case 'Molten': description = 'Silicate Lava Flows, Rapidly Cooling Crust'; break;
             case 'Rock': description = this.systemPRNG.choice(['Silicate Rock (Granite/Basalt), Tectonically Active?', 'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?', 'Iron-Rich Crust, Evidence of Metallic Core'])!; break;
             case 'Oceanic': description = 'Submerged Silicate Crust, Probable Hydrothermal Vents'; break;
             case 'Lunar': description = 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles'; break;
             case 'GasGiant': description = 'No Solid Surface Defined'; break;
             case 'IceGiant': description = 'No Solid Surface Defined, Deep Icy/Fluid Mantle'; break;
             case 'Frozen': description = this.systemPRNG.choice(['Water Ice Dominant, Ammonia/Methane Ices Present', 'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism', 'Mixed Ice/Rock Surface, Sublimation Features'])!; break;
             default:
                  logger.warn(`[Planet:${this.name}] Unknown planet type '${this.type}' for lithosphere generation.`);
                  description = 'Unknown Composition'; break; //
         }
         logger.debug(`[Planet:${this.name}] Lithosphere determined: ${description}`);
         return description;
     }

    private determineMineralRichness(): MineralRichness {
        logger.debug(`[Planet:${this.name}] Determining mineral richness...`);
        // Seed a PRNG specifically for mineral determination
        const prng = this.systemPRNG.seedNew("minerals"); //
        let baseChance = 0.5; // Base probability of having *any* minerals

        switch (this.type) { // Adjust base chance based on planet type
            case 'Molten': baseChance = 0.6; break; //
            case 'Rock': baseChance = 0.8; break;
            case 'Lunar': baseChance = 0.7; break;
            case 'Frozen': baseChance = 0.4; break; // Less likely on icy bodies?
            case 'Oceanic': baseChance = 0.2; break; // Hard to mine ocean floor?
            case 'GasGiant': case 'IceGiant':
                 logger.debug(`[Planet:${this.name}] Mineral richness set to None for ${this.type}.`);
                 return MineralRichness.NONE; // No mining on gas giants
            default: baseChance = 0.5; // Default for unknown types
        }
        logger.debug(`[Planet:${this.name}] Base chance for minerals: ${baseChance.toFixed(2)}`);

        // Roll against base chance
        if (prng.random() > baseChance) {
             logger.debug(`[Planet:${this.name}] Mineral richness roll failed. Result: None.`);
             return MineralRichness.NONE; //
        }

        // If minerals exist, determine richness level
        const roll = prng.random(); // Roll for richness level
        let richness: MineralRichness;
        if (roll < 0.40) richness = MineralRichness.POOR; // 40% chance of Poor
        else if (roll < 0.75) richness = MineralRichness.AVERAGE; // 35% chance of Average
        else if (roll < 0.95) richness = MineralRichness.RICH; // 20% chance of Rich
        else richness = MineralRichness.EXCEPTIONAL; // 5% chance of Exceptional

        logger.debug(`[Planet:${this.name}] Mineral richness roll success (${roll.toFixed(2)}). Result: ${richness}`);
        return richness; //
    }

    private calculateBaseMinerals(): number {
         logger.debug(`[Planet:${this.name}] Calculating base mineral amount for richness: ${this.mineralRichness}`);
         let factor = 0;
         switch (this.mineralRichness) { //
             case MineralRichness.POOR: factor = 1; break;
             case MineralRichness.AVERAGE: factor = 2; break;
             case MineralRichness.RICH: factor = 5; break;
             case MineralRichness.EXCEPTIONAL: factor = 10; break;
             default:
                  logger.debug(`[Planet:${this.name}] Base minerals set to 0 due to richness 'None'.`);
                  return 0; // No base amount if no richness
         }
         // Base amount = factor * base_value * slight_randomness
         const baseAmount = factor * 1000 * this.systemPRNG.random(0.8, 1.2); //
         logger.debug(`[Planet:${this.name}] Base mineral amount calculated: ${baseAmount.toFixed(0)} (Factor: ${factor})`);
         return baseAmount; //
     }


    // --- Surface Generation ---

    /** Generates impact craters on the heightmap (used for Lunar/Airless Rock). */
    private addCratersToHeightmap(): void {
         if (!this.heightmap) {
             // Use logger now
             logger.warn(`[Planet:${this.name}] Attempted addCratersToHeightmap but heightmap is null.`); //
             return;
         }
         const mapSize = this.heightmap.length; if (mapSize <= 0) return; //

         logger.info(`[Planet:${this.name}] Adding impact craters to heightmap...`);
         const craterPRNG = this.systemPRNG.seedNew('craters'); // Seed PRNG for craters
         // Number of craters scales with map size
         const numCraters = craterPRNG.randomInt(Math.floor(mapSize / 15), Math.floor(mapSize / 5)); //
         logger.debug(`[Planet:${this.name}] Generating ${numCraters} craters.`);

         for (let i = 0; i < numCraters; i++) {
              // Crater properties
             const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10))); // Radius
             const cx = craterPRNG.randomInt(0, mapSize - 1); // Center X
             const cy = craterPRNG.randomInt(0, mapSize - 1); // Center Y
             const depthFactor = craterPRNG.random(0.5, 2.0); // Depth relative to radius
             const rimFactor = craterPRNG.random(0.1, 0.3); // Rim height relative to depth
             const maxDepth = r * depthFactor; // How deep the center goes
             const rimHeight = maxDepth * rimFactor; // How high the rim is raised
             // logger.debug(`[Crater ${i+1}] Center:[${cx},${cy}], Radius:${r}, Depth:${maxDepth.toFixed(1)}, Rim:${rimHeight.toFixed(1)}`); // Noisy

             // Calculate bounding box for efficiency
             const startY = Math.max(0, cy - r - 2); const endY = Math.min(mapSize - 1, cy + r + 2); //
             const startX = Math.max(0, cx - r - 2); const endX = Math.min(mapSize - 1, cx + r + 2); //

             // Modify heightmap within bounding box
             for (let y = startY; y <= endY; y++) {
                 for (let x = startX; x <= endX; x++) {
                     const dx = x - cx; //
                     const dy = y - cy; //
                     const distSq = dx * dx + dy * dy; // Use squared distance for initial check
                     const radiusSq = r * r;

                     if (distSq <= (r + 1) ** 2) { // Check if within potential influence radius
                          const dist = Math.sqrt(distSq); // Calculate actual distance
                         const currentH = this.heightmap[y][x]; //
                         let deltaH = 0; // Height change

                         // Depression calculation (cosine profile inside radius)
                         if (dist < r) {
                             const depressionProfile = (Math.cos(dist / r * Math.PI) + 1) / 2; // 1 at center, 0 at edge
                             deltaH -= maxDepth * depressionProfile; //
                         }

                         // Rim calculation (cosine profile around radius edge)
                         const rimPeakDist = r * 0.85; // Where the rim crest is
                         const rimWidth = r * 0.3; // How wide the rim is
                         if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) {
                             const rimProfile = (Math.cos((dist - rimPeakDist) / rimWidth * Math.PI) + 1) / 2; // 1 at peak, 0 at edges
                             deltaH += rimHeight * rimProfile; //
                         }

                         // Apply change and clamp height
                         let newH = currentH + deltaH; //
                         this.heightmap[y][x] = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(newH))); // Clamp to valid range [0, max_level-1]
                     }
                 }
             }
         }
         logger.info(`[Planet:${this.name}] Finished adding ${numCraters} craters.`);
    }

    /** Ensures surface data (heightmap, colors) is generated if needed. Throws error on failure. */
     ensureSurfaceReady(): void {
        logger.debug(`[Planet:${this.name}] ensureSurfaceReady called. Type: ${this.type}. Map loaded: ${!!this.heightmap}, Colors loaded: ${!!this.heightLevelColors}`);

        // --- Handle Gas Giants (no heightmap needed, only palette) ---
        if (this.type === 'GasGiant' || this.type === 'IceGiant') { //
            // Ensure RGB palette cache exists
            if (!this.rgbPaletteCache) { //
                logger.debug(`[Planet:${this.name}] Generating RGB palette cache for ${this.type}...`);
                const planetPalette = PLANET_TYPES[this.type]?.colors; //
                if (!planetPalette || planetPalette.length === 0) {
                    const errorMsg = `Planet visual data (color palette) missing or empty for ${this.type} ${this.name}.`;
                    logger.error(`[Planet:${this.name}] ${errorMsg}`); // Log before throwing
                    throw new Error(errorMsg); //
                }
                try {
                     this.rgbPaletteCache = planetPalette.map(hex => hexToRgb(hex)); // Convert hex to RGB objects
                     logger.debug(`[Planet:${this.name}] RGB palette cache created (${this.rgbPaletteCache.length} colors).`);
                } catch(e) {
                     const errorMsg = `Failed to parse color palette for ${this.name}: ${e instanceof Error ? e.message : String(e)}`;
                     logger.error(`[Planet:${this.name}] ${errorMsg}`);
                     throw new Error(errorMsg);
                }
            }
            // Ensure heightmap-related properties are null for gas giants
            this.heightmap = null;
            this.heightLevelColors = null;
            logger.debug(`[Planet:${this.name}] Surface ready for Gas Giant (palette only).`);
            return; // Nothing more needed for gas giants
        }

        // --- Handle Starbases (minimal data) --- (Should ideally be in Starbase class, but keep check here)
         if (this.type === 'Starbase') { // Should be handled by Starbase class, defensive check
              logger.debug(`[Planet:${this.name}] Ensuring surface ready for Starbase placeholder...`);
              if (!this.heightLevelColors) this.heightLevelColors = [CONFIG.STARBASE_COLOR]; // Single color
              if (!this.heightmap) this.heightmap = [[0]]; // Minimal 1x1 map
              logger.debug(`[Planet:${this.name}] Surface ready for Starbase.`);
              return; //
         }


         // --- Handle Solid Planets (Heightmap & Colors) ---

         // 1. Generate Heightmap if missing
         if (!this.heightmap) { //
             logger.info(`[Planet:${this.name}] Generating surface heightmap (Seed: ${this.mapSeed})...`); //
             const mapSizeTarget = CONFIG.PLANET_MAP_BASE_SIZE; //
             try {
                 const generator = new HeightmapGenerator(mapSizeTarget, CONFIG.PLANET_SURFACE_ROUGHNESS, this.mapSeed); //
                 const generatedMap = generator.generate(); // This creates and normalizes the map

                 // Basic validation of the generated map
                 if (!generatedMap || generatedMap.length < 1 || generatedMap[0].length !== generatedMap.length) { //
                     throw new Error("HeightmapGenerator returned invalid map dimensions."); //
                 }
                 this.heightmap = generatedMap; //
                 logger.info(`[Planet:${this.name}] Generated ${this.heightmap.length}x${this.heightmap.length} heightmap.`); //

                 // Add craters after base map generation for specific types
                 if (this.type === 'Lunar' || (this.type === 'Rock' && this.atmosphere.density === 'None')) {
                      this.addCratersToHeightmap(); // Logs internally
                 }

             } catch (error) {
                 this.heightmap = null; // Ensure map is null on failure
                 const errorMsg = `Heightmap generation failed for ${this.name}: ${error instanceof Error ? error.message : String(error)}`;
                 logger.error(`[Planet:${this.name}] ${errorMsg}`); // Log before throwing
                 throw new Error(errorMsg); //
             }
         } else {
             logger.debug(`[Planet:${this.name}] Heightmap already exists.`);
         }

         // 2. Generate Height Level Colors if missing
         if (!this.heightLevelColors) { //
             logger.info(`[Planet:${this.name}] Generating height level colors...`);
             // Ensure base palette is cached first
             if (!this.rgbPaletteCache) {
                 const planetPaletteHex = PLANET_TYPES[this.type]?.colors; //
                 if (!planetPaletteHex || planetPaletteHex.length === 0) {
                     const errorMsg = `Planet visual data (color palette) missing or empty for ${this.name} (${this.type}). Cannot generate height colors.`;
                     logger.error(`[Planet:${this.name}] ${errorMsg}`); // Log before throwing
                     throw new Error(errorMsg); //
                 }
                 try {
                     this.rgbPaletteCache = planetPaletteHex.map(hex => hexToRgb(hex)); //
                     logger.debug(`[Planet:${this.name}] RGB palette cache created (${this.rgbPaletteCache.length} colors) for height color generation.`);
                 } catch (e) {
                     const errorMsg = `Failed to parse color palette for ${this.name} during height color generation: ${e instanceof Error ? e.message : String(e)}`;
                     logger.error(`[Planet:${this.name}] ${errorMsg}`);
                     throw new Error(errorMsg);
                 }
             }

             const rgbPalette = this.rgbPaletteCache; // Use the cached RGB palette
             const numPaletteColours = rgbPalette.length;
             if (numPaletteColours < 1) {
                  const errorMsg = `Planet RGB palette cache is empty for ${this.name}. Cannot generate height colors.`;
                  logger.error(`[Planet:${this.name}] ${errorMsg}`); // Log before throwing
                 throw new Error(errorMsg); //
             }

             // Generate array of hex colors, one for each possible height level
             this.heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS); //
             logger.debug(`[Planet:${this.name}] Interpolating ${numPaletteColours} palette colors across ${CONFIG.PLANET_HEIGHT_LEVELS} height levels...`);
             for (let h = 0; h < CONFIG.PLANET_HEIGHT_LEVELS; h++) {
                 // Map height level (0 to max-1) to palette index (0 to numPaletteColours-1)
                 const colourIndexFloat = (h / (CONFIG.PLANET_HEIGHT_LEVELS - 1)) * (numPaletteColours - 1); //
                 const index1 = Math.max(0, Math.min(numPaletteColours - 1, Math.floor(colourIndexFloat))); // Lower bound index
                 const index2 = Math.min(numPaletteColours - 1, index1 + 1); // Upper bound index
                 const factor = colourIndexFloat - index1; // Interpolation factor (0 to 1)

                 let terrainRgb: RgbColour;
                 if (index1 === index2 || factor === 0) {
                      terrainRgb = rgbPalette[index1]; // Exactly on a palette color
                 } else if (index1 < numPaletteColours && index2 < numPaletteColours) {
                     terrainRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor); // Interpolate between two colors
                 } else {
                      logger.warn(`[Planet:${this.name}] Height color generation encountered invalid palette indices (${index1}, ${index2}) at height ${h}. Using fallback.`);
                     terrainRgb = rgbPalette[index1]; // Fallback to lower bound color
                 }
                 this.heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b); // Convert final RGB to hex string
             }
             logger.info(`[Planet:${this.name}] Height level colors generated successfully.`);
         } else {
             logger.debug(`[Planet:${this.name}] Height level colors already exist.`);
         }
         logger.debug(`[Planet:${this.name}] Surface ready for Solid Planet.`);
    }


    /** Performs a scan of the planet, populating scan-related properties. */
    scan(): void {
        if (this.scanned) {
             logger.info(`[Planet:${this.name}] Scan attempted, but planet already scanned.`);
             return;
        }
        logger.info(`[Planet:${this.name}] Scanning planet...`); //
        this.scanned = true; // Mark as scanned

        // Determine primary resource based on type and richness
        if (this.mineralRichness !== MineralRichness.NONE) { //
            const resourcePRNG = this.systemPRNG.seedNew('resource'); // Seed PRNG for resource type
            let potentialResources: string[] = [];

            switch (this.type) { //
                case 'Rock': case 'Lunar': potentialResources = ['Common Metals', 'Silicates', 'Rare Elements', 'Precious Metals']; break;
                case 'Molten': potentialResources = ['Heavy Metals', 'Exotic Isotopes', 'Silicates']; break;
                case 'Frozen': potentialResources = ['Water Ice', 'Methane Ice', 'Ammonia Ice', 'Frozen Gases']; break;
                case 'Oceanic': potentialResources = ['Water', 'Dissolved Minerals', 'Exotic Lifeforms?']; break; // Life requires separate check maybe?
                default: potentialResources = ['Unknown Raw Materials']; break; // Fallback
            }

            if (potentialResources.length > 0) {
                 this.primaryResource = resourcePRNG.choice(potentialResources)!; //
                 logger.debug(`[Planet:${this.name}] Potential resources for ${this.type}: ${potentialResources.join(', ')}. Chosen: ${this.primaryResource}`);
            } else {
                 this.primaryResource = 'Undetermined'; // Should not happen with fallback
                 logger.warn(`[Planet:${this.name}] No potential resources defined for type ${this.type}.`);
            }

            // Chance for very rare resource if richness is exceptional
            if (this.mineralRichness === MineralRichness.EXCEPTIONAL && resourcePRNG.random() < 0.5) { //
                const rareResources = ['Exotic Matter', 'Artifact Shards', 'Precious Gems', 'Anti-Matter Traces'];
                const oldResource = this.primaryResource;
                this.primaryResource = resourcePRNG.choice(rareResources)!;
                logger.info(`[Planet:${this.name}] Exceptional richness yielded rare resource: ${this.primaryResource} (overwriting ${oldResource})`);
            }
        } else { // No minerals detected
            this.primaryResource = 'None Detected'; //
            logger.debug(`[Planet:${this.name}] No minerals detected, primary resource set to None.`);
        }
        logger.info(`[Planet:${this.name}] Scan complete. Resource: ${this.primaryResource}, Richness: ${this.mineralRichness}`); //
    }

    /** Returns multi-line scan information for the planet. Assumes scan() was called if detailed info needed. */
    getScanInfo(): string[] {
        logger.debug(`[Planet:${this.name}] getScanInfo called (Scanned: ${this.scanned})`);
        let infoLines: string[] = [];

        // Common Header
        infoLines.push(`--- SCAN REPORT: ${this.name} ---`);
        infoLines.push(`Type: ${this.type} Planet`);

        // --- Gas Giant Specific Info ---
        if (this.type === 'GasGiant' || this.type === 'IceGiant') { //
            const compositionString = Object.entries(this.atmosphere.composition)
                .filter(([, p]) => p > 0) // Filter out 0% entries
                .sort(([, a], [, b]) => b - a) // Sort descending by percentage
                .map(([gas, percent]) => `${gas}: ${percent}%`) // Format string
                .join(', ') || "Trace Gases"; // Fallback
            infoLines.push(`Diameter: ${this.diameter} km | Gravity: ${this.gravity.toFixed(2)} G (at 1 bar level)`); //
            infoLines.push(`Effective Temp: ${this.surfaceTemp} K (cloud tops)`);
            infoLines.push(`Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar at cloud tops)`);
            infoLines.push(`Composition: ${compositionString}`);
            infoLines.push(`Hydrosphere: ${this.hydrosphere}`); // Usually N/A
            infoLines.push(`Lithosphere: ${this.lithosphere}`); // Usually N/A
            infoLines.push(`Mineral Scan: ${this.mineralRichness}`); // Always None
            infoLines.push(`Refueling: Possible via atmospheric scoop.`); // Specific gameplay note
        }
        // --- Solid Planet Info ---
        else {
            infoLines.push(`Diameter: ${this.diameter} km | Gravity: ${this.gravity.toFixed(2)} G`); //
            infoLines.push(`Surface Temp (Avg): ${this.surfaceTemp} K`); //
            infoLines.push(`Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar)`); //

            // Format atmosphere composition nicely
            let compStr = "None";
            const comp = this.atmosphere.composition; //
            if (comp && Object.keys(comp).length > 0 && comp['None'] !== 100) { // Check if not just 'None: 100'
                 compStr = Object.entries(comp)
                     .filter(([, percent]) => percent > 0) // Filter 0%
                     .sort(([, a], [, b]) => b - a) // Sort descending
                     .map(([gas, percent]) => `${gas}: ${percent}%`) // Format
                     .join(', ');
            }
            infoLines.push(`Composition: ${compStr}`); //

            infoLines.push(`Hydrosphere: ${this.hydrosphere}`); //
            infoLines.push(`Lithosphere: ${this.lithosphere}`); //

            // Display scan results based on scanned status
            if (this.scanned) { //
                 infoLines.push(`Mineral Scan: Richness ${this.mineralRichness}. Primary Resource: ${this.primaryResource || 'N/A'}.`); //
            } else {
                 // Show potential richness before scan
                 infoLines.push(`Mineral Scan: Requires planetary scan. Richness potential: ${this.mineralRichness}.`); //
            }
        }
        return infoLines; //
    }

} // End Planet class