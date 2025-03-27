// src/entities/planet.ts

import { CONFIG } from '../config';
// Removed unused GLYPHS import
import { PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, MineralRichness } from '../constants';
import { PRNG } from '../utils/prng';
import { HeightmapGenerator } from '../generation/heightmap';
import { RgbColour, hexToRgb, interpolateColour, rgbToHex } from '../rendering/colour';
// Removed unused Perlin import

// --- Interfaces and Types ---
export type AtmosphereComposition = Record<string, number>; // Gas name -> Percentage

export interface Atmosphere {
    density: string; // e.g., 'None', 'Thin', 'Thick'
    pressure: number; // Surface pressure in bars (approx)
    composition: AtmosphereComposition;
}

export class Planet {
    readonly name: string;
    readonly type: string; // e.g., 'Rock', 'GasGiant'
    readonly orbitDistance: number;
    orbitAngle: number; // Made mutable for orbit updates
    systemX: number; // Made mutable for orbit updates
    systemY: number; // Made mutable for orbit updates
    readonly diameter: number;
    readonly gravity: number; // In G's
    readonly surfaceTemp: number; // Average surface temp in Kelvin
    readonly atmosphere: Atmosphere;
    readonly hydrosphere: string; // Description (e.g., 'Global Ocean', 'None')
    readonly lithosphere: string; // Description (e.g., 'Silicate Rock')
    readonly mineralRichness: MineralRichness;
    readonly baseMinerals: number; // Theoretical max mineable amount (scaling factor)

    readonly systemPRNG: PRNG; // PRNG seeded for this planet
    readonly mapSeed: string; // Seed specifically for heightmap generation

    // Scan-related properties
    scanned: boolean = false;
    primaryResource: string | null = null; // e.g., 'Iron', 'Water', 'Silicates'
    // mineralRichness property defined above covers richness level

    // Mutable state / caches - populated by ensureSurfaceReady() or rendering
    heightmap: number[][] | null = null;
    rgbPaletteCache: RgbColour[] | null = null; // Cache for planet type base colours
    heightLevelColors: string[] | null = null; // Cache for colours at each height level
    moons: Planet[] = []; // Moons are treated as smaller planets for now

    constructor(
        name: string,
        type: string,
        orbitDistance: number,
        angle: number,
        systemPRNG: PRNG,
        parentStarType: string // e.g., 'G', 'M'
    ) {
        this.name = name;
        this.type = type;
        this.orbitDistance = orbitDistance;
        this.orbitAngle = angle; // Initial angle
        this.systemPRNG = systemPRNG.seedNew("planet_" + name); // Seed specifically for this planet

        // Initial position calculation
        this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance;
        this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance;

        // --- Generate Physical Characteristics ---
        this.diameter = Math.max(1000, this.systemPRNG.randomInt(2000, 20000)); // km
        this.gravity = Math.max(0.01, this.systemPRNG.random(0.1, 2.5)); // G

        this.atmosphere = this.generateAtmosphere(parentStarType); // Generate atmosphere first
        this.surfaceTemp = this.calculateSurfaceTemp(parentStarType); // Temp depends on atmosphere
        this.hydrosphere = this.generateHydrosphere();
        this.lithosphere = this.generateLithosphere();
        this.mineralRichness = this.determineMineralRichness();
        this.baseMinerals = this.calculateBaseMinerals();

        this.mapSeed = this.systemPRNG.getInitialSeed() + "_map"; // Specific seed for map gen

        // Moons could be generated here if needed
    }

    // --- Generation Methods --- (generateAtmosphere, generateAtmosphereComposition remain unchanged) ---
    private generateAtmosphere(parentStarType: string): Atmosphere {
         const densityRoll = this.systemPRNG.random();
         let densityIndex = 0;
         if (densityRoll < 0.2) densityIndex = 0;       // None (20%)
         else if (densityRoll < 0.5) densityIndex = 1; // Thin (30%)
         else if (densityRoll < 0.85) densityIndex = 2; // Earth-like (35%)
         else densityIndex = 3;                         // Thick (15%)

         // Adjust density based on type/gravity
         if (this.type === 'GasGiant' || this.type === 'IceGiant') densityIndex = 3; // Always Thick
         else if (this.type === 'Lunar' || this.type === 'Molten') densityIndex = this.systemPRNG.choice([0, 0, 1])!; // Likely None/Thin
         else if (this.gravity < 0.3 && densityIndex > 1) densityIndex = 1; // Low gravity struggles to hold thick atmosphere

         const density = ATMOSPHERE_DENSITIES[densityIndex];
         const pressure = densityIndex === 0 ? 0 : Math.max(0.01, this.systemPRNG.random(0.01, 5) * (densityIndex)); // Pressure scales with density index

         // Pass density to composition generator
         const composition = this.generateAtmosphereComposition(density, parentStarType);

         return { density, pressure, composition };
     }

     private generateAtmosphereComposition(density: string, parentStarType: string): AtmosphereComposition {
         if (density === 'None') return { None: 100 };

         const comp: AtmosphereComposition = {};
         let remaining = 100.0;
         const numGases = this.systemPRNG.randomInt(2, 6);

         // Determine primary gas based on type and estimated temp (rough guess before temp is final)
         // Nullish Coalescing for safety
         const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp;
         const approxTemp = (PLANET_TYPES[this.type]?.baseTemp ?? 300) * (starTempApprox / SPECTRAL_TYPES['G'].temp) + this.systemPRNG.random(-50, 50);

         let primaryGas = 'Nitrogen';
         if (this.type === 'GasGiant' || this.type === 'IceGiant') {
             primaryGas = this.systemPRNG.choice(['Hydrogen', 'Helium'])!;
         } else if (approxTemp < 150) {
             primaryGas = this.systemPRNG.choice(['Nitrogen', 'Nitrogen', 'Methane', 'Carbon Dioxide', 'Argon'])!;
         } else if (approxTemp > 500) {
             primaryGas = this.systemPRNG.choice(['Carbon Dioxide', 'Carbon Dioxide', 'Nitrogen', 'Sulfur Dioxide', 'Water Vapor'])!;
         } else { // Habitable-ish range
             primaryGas = this.systemPRNG.choice(['Nitrogen', 'Nitrogen', 'Nitrogen', 'Carbon Dioxide', 'Argon', 'Water Vapor'])!;
         }

         // Assign primary gas percentage
         const primaryPercent = this.systemPRNG.random(50, 95);
         comp[primaryGas] = primaryPercent;
         remaining -= primaryPercent;

         // Add secondary gases
         const usedGases = new Set<string>([primaryGas]);
         let availableGases = ATMOSPHERE_GASES.filter(g => !usedGases.has(g));

         for (let i = 1; i < numGases && remaining > 0.1 && availableGases.length > 0; i++) {
             const gasIndex = this.systemPRNG.randomInt(0, availableGases.length - 1);
             const gas = availableGases.splice(gasIndex, 1)[0];
             usedGases.add(gas);

             const percent = (i === numGases - 1 || availableGases.length === 0)
                 ? remaining
                 : this.systemPRNG.random(0.1, remaining / 1.5);

             if (percent > 0.05) {
                 comp[gas] = percent;
                 remaining -= percent;
             }
         }

         // Normalize percentages
         let total = Object.values(comp).reduce((s, p) => s + p, 0);
         const finalComp: AtmosphereComposition = {};
         if (total > 0) {
             const scaleFactor = 100 / total;
             let runningTotal = 0;
             const keys = Object.keys(comp);
             for (let i = 0; i < keys.length; i++) {
                 const gas = keys[i];
                 let roundedPercent: number;
                 const isLast = (i === keys.length - 1);

                 if (isLast) {
                     roundedPercent = Math.max(0, 100 - runningTotal);
                 } else {
                     const scaledValue = comp[gas] * scaleFactor;
                     roundedPercent = scaledValue >= 1 ? Math.round(scaledValue) : Math.round(scaledValue * 10) / 10;
                 }
                  // Ensure last value is also rounded appropriately
                 if(isLast) roundedPercent = roundedPercent >= 1 ? Math.round(roundedPercent) : Math.round(roundedPercent * 10) / 10;


                 if (roundedPercent > 0) {
                     finalComp[gas] = roundedPercent;
                      // Use the final rounded percent for the running total
                     runningTotal += roundedPercent;
                 }
             }
             // Final check for 100% total
              let finalTotalCheck = Object.values(finalComp).reduce((s, p) => s + p, 0);
              if (Math.abs(finalTotalCheck - 100) > 0.01 && finalComp[primaryGas] !== undefined) {
                   const diff = Math.round((100 - finalTotalCheck) * 10) / 10;
                   finalComp[primaryGas] = Math.max(0, finalComp[primaryGas] + diff);
                   finalComp[primaryGas] = finalComp[primaryGas] >= 1 ? Math.round(finalComp[primaryGas]) : Math.round(finalComp[primaryGas] * 10) / 10;
              }

         } else if (density !== 'None') {
             finalComp['Nitrogen'] = 100;
         }

         return finalComp;
     }

    private calculateSurfaceTemp(parentStarType: string): number {
        const starTemp = SPECTRAL_TYPES[parentStarType]?.temp ?? SPECTRAL_TYPES['G'].temp; // Use ?? fallback
        const starLuminosityFactor = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4;
        const distFactor = (50000 / Math.max(1000, this.orbitDistance)) ** 2;

        // Use ?? fallback for base temp
        let basePlanetTemp = PLANET_TYPES[this.type]?.baseTemp ?? 300;

        let temp = basePlanetTemp * (starLuminosityFactor * distFactor) ** 0.25;

        // Greenhouse effect approximation
        let greenhouseFactor = 1.0;
        if (this.atmosphere.density === 'Earth-like') greenhouseFactor = 1.15;
        if (this.atmosphere.density === 'Thick') greenhouseFactor = 1.6;
        const co2 = this.atmosphere.composition['Carbon Dioxide'] || 0;
        const methane = this.atmosphere.composition['Methane'] || 0;
        if (co2 > 50 || methane > 20) greenhouseFactor *= 1.3;

        temp *= greenhouseFactor;

        // Type adjustments
        if (this.type === 'Frozen' || this.type === 'IceGiant') temp *= 0.8;
        if (this.type === 'Molten' || this.type === 'Lunar') temp *= 1.05;

        return Math.max(2, Math.round(temp));
    }

    // --- (generateHydrosphere, generateLithosphere, determineMineralRichness, calculateBaseMinerals remain unchanged) ---
    private generateHydrosphere(): string { /* ... same logic ... */
        if (this.type === 'Oceanic') return 'Global Saline Ocean';
        if (this.type === 'Frozen') return 'Global Ice Sheet, Subsurface Ocean Possible';
        if (this.type === 'Molten' || this.type === 'Lunar') return 'None';
        if (this.type === 'GasGiant' || this.type === 'IceGiant') return 'N/A (Gaseous/Fluid Interior)';

        const tempK = this.surfaceTemp;
        const pressure = this.atmosphere.pressure;

        if (tempK < 273.15 && pressure > 0.006) { // Triple point pressure approx
            return this.systemPRNG.random() < 0.6
                ? 'Polar Ice Caps, Surface Ice Deposits'
                : 'Scattered Subsurface Ice Pockets';
        }
        const boilingPointApprox = 373.15 + (pressure - 1) * 35;
        if (tempK > 273.15 && tempK < boilingPointApprox && pressure > 0.01) { // Need some pressure
            const waterChance = this.systemPRNG.random();
            if (waterChance < 0.15) return 'Arid, Trace Liquid Water Possible';
            if (waterChance < 0.6) return 'Lakes, Rivers, Small Seas';
            return 'Significant Oceans and Seas';
        }
        if (tempK > boilingPointApprox && pressure > 0.01) {
            return (pressure > 5 && this.systemPRNG.random() < 0.3)
                ? 'Atmospheric Water Vapor, Potential Supercritical Fluid'
                : 'Trace Water Vapor';
        }
        return 'None or Trace Ice Sublimating';
    }
    private generateLithosphere(): string { /* ... same logic ... */
        switch (this.type) {
            case 'Molten': return 'Silicate Lava Flows, Rapidly Cooling Crust';
            case 'Rock': return this.systemPRNG.choice(['Silicate Rock (Granite/Basalt), Tectonically Active?', 'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?', 'Iron-Rich Crust, Evidence of Metallic Core'])!;
            case 'Oceanic': return 'Submerged Silicate Crust, Probable Hydrothermal Vents';
            case 'Lunar': return 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles';
            case 'GasGiant': return 'No Solid Surface Defined';
            case 'IceGiant': return 'No Solid Surface Defined, Deep Icy/Fluid Mantle';
            case 'Frozen': return this.systemPRNG.choice(['Water Ice Dominant, Ammonia/Methane Ices Present', 'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism', 'Mixed Ice/Rock Surface, Sublimation Features'])!;
            default: return 'Unknown Composition';
        }
    }
    private determineMineralRichness(): MineralRichness { /* ... same logic ... */
        const prng = this.systemPRNG.seedNew("minerals");
        let baseChance = 0.5;
        switch (this.type) {
            case 'Molten': baseChance = 0.6; break;
            case 'Rock': baseChance = 0.8; break;
            case 'Lunar': baseChance = 0.7; break;
            case 'Frozen': baseChance = 0.4; break;
            case 'Oceanic': baseChance = 0.2; break;
            case 'GasGiant': case 'IceGiant': return MineralRichness.NONE;
            default: baseChance = 0.5;
        }
        if (prng.random() > baseChance) return MineralRichness.NONE;
        const roll = prng.random();
        if (roll < 0.40) return MineralRichness.POOR;
        if (roll < 0.75) return MineralRichness.AVERAGE;
        if (roll < 0.95) return MineralRichness.RICH;
        return MineralRichness.EXCEPTIONAL;
    }
    private calculateBaseMinerals(): number { /* ... same logic ... */
        let factor = 0;
        switch (this.mineralRichness) {
            case MineralRichness.POOR: factor = 1; break;
            case MineralRichness.AVERAGE: factor = 2; break;
            case MineralRichness.RICH: factor = 5; break;
            case MineralRichness.EXCEPTIONAL: factor = 10; break;
            default: return 0;
        }
        return factor * 1000 * this.systemPRNG.random(0.8, 1.2);
    }

    // --- (addCratersToHeightmap remains unchanged) ---
    private addCratersToHeightmap(): void { /* ... same logic ... */
         if (!this.heightmap) { console.warn(`Attempted craters on ${this.name} but heightmap null.`); return; }
         const mapSize = this.heightmap.length; if (mapSize <= 0) return;
         const craterPRNG = this.systemPRNG.seedNew('craters');
         const numCraters = craterPRNG.randomInt(Math.floor(mapSize / 15), Math.floor(mapSize / 5));
         console.log(`Adding ${numCraters} craters to ${this.name}`);
         for (let i = 0; i < numCraters; i++) {
             const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10)));
             const cx = craterPRNG.randomInt(0, mapSize - 1); const cy = craterPRNG.randomInt(0, mapSize - 1);
             const depthFactor = craterPRNG.random(0.5, 2.0); const rimFactor = craterPRNG.random(0.1, 0.3);
             const maxDepth = r * depthFactor; const rimHeight = maxDepth * rimFactor;
             const startY = Math.max(0, cy - r - 2); const endY = Math.min(mapSize - 1, cy + r + 2);
             const startX = Math.max(0, cx - r - 2); const endX = Math.min(mapSize - 1, cx + r + 2);
             for (let y = startY; y <= endY; y++) {
                 for (let x = startX; x <= endX; x++) {
                     const dx = x - cx; const dy = y - cy; const dist = Math.sqrt(dx * dx + dy * dy);
                     if (dist <= r + 1) {
                         const currentH = this.heightmap[y][x]; let deltaH = 0;
                         if (dist < r) { const depressionProfile = (Math.cos(dist / r * Math.PI) + 1) / 2; deltaH -= maxDepth * depressionProfile; }
                         const rimPeakDist = r * 0.85; const rimWidth = r * 0.3;
                         if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) { const rimProfile = (Math.cos((dist - rimPeakDist) / rimWidth * Math.PI) + 1) / 2; deltaH += rimHeight * rimProfile; }
                         let newH = currentH + deltaH;
                         this.heightmap[y][x] = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(newH)));
                     }
                 }
             }
         }
    }
    // --- (ensureSurfaceReady remains unchanged) ---
     ensureSurfaceReady(): void { /* ... same logic ... */
        if (this.type === 'GasGiant' || this.type === 'IceGiant') {
            if (!this.rgbPaletteCache) {
                const planetPalette = PLANET_TYPES[this.type]?.colors;
                if (!planetPalette) throw new Error(`Planet visual data missing for ${this.type} ${this.name}.`);
                this.rgbPaletteCache = planetPalette.map(hex => hexToRgb(hex));
            }
            this.heightmap = null; this.heightLevelColors = null; return;
        }
         if (this.type === 'Starbase') { // Should be handled by Starbase class, defensive check
              if (!this.heightLevelColors) this.heightLevelColors = [CONFIG.STARBASE_COLOR];
              if (!this.heightmap) this.heightmap = [[0]]; return;
         }
         if (!this.heightmap) {
             console.log(`Generating surface map for ${this.name} using seed ${this.mapSeed}`);
             const mapSizeTarget = CONFIG.PLANET_MAP_BASE_SIZE;
             try {
                 const generator = new HeightmapGenerator(mapSizeTarget, CONFIG.PLANET_SURFACE_ROUGHNESS, this.mapSeed);
                 const generatedMap = generator.generate();
                 if (!generatedMap || generatedMap.length < 1 || generatedMap[0].length !== generatedMap.length) { throw new Error("Invalid map dimensions."); }
                 this.heightmap = generatedMap;
                 console.log(`Generated ${this.heightmap.length}x${this.heightmap.length} heightmap for ${this.name}`);
                 if (this.type === 'Lunar' || (this.type === 'Rock' && this.atmosphere.density === 'None')) { this.addCratersToHeightmap(); }
             } catch (error) { this.heightmap = null; throw new Error(`Heightmap generation failed: ${error instanceof Error ? error.message : String(error)}`); }
         }
         if (!this.heightLevelColors) {
             const planetPalette = PLANET_TYPES[this.type]?.colors;
             if (!planetPalette || planetPalette.length === 0) { throw new Error(`Planet visual data missing/empty for ${this.name} (${this.type}).`); }
             if (!this.rgbPaletteCache) { this.rgbPaletteCache = planetPalette.map(hex => hexToRgb(hex)); }
             const rgbPalette = this.rgbPaletteCache; const numPaletteColours = rgbPalette.length;
             if (numPaletteColours < 1) throw new Error(`Planet RGB palette empty for ${this.name}.`);
             this.heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS);
             for (let h = 0; h < CONFIG.PLANET_HEIGHT_LEVELS; h++) {
                 const colourIndexFloat = (h / (CONFIG.PLANET_HEIGHT_LEVELS - 1)) * (numPaletteColours - 1);
                 const index1 = Math.max(0, Math.min(numPaletteColours - 1, Math.floor(colourIndexFloat)));
                 const index2 = Math.min(numPaletteColours - 1, index1 + 1); const factor = colourIndexFloat - index1;
                 let terrainRgb: RgbColour;
                 if (index1 === index2) { terrainRgb = rgbPalette[index1]; }
                 else if (index1 < numPaletteColours && index2 < numPaletteColours) { terrainRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor); }
                 else { terrainRgb = rgbPalette[index1]; } // Fallback
                 this.heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b);
             }
         }
    }

    // --- Added scan() method ---
    /** Performs a scan of the planet, populating scan-related properties. */
    scan(): void {
        if (this.scanned) return;
        console.log(`Scanning ${this.name}...`);
        this.scanned = true;
        if (this.mineralRichness !== MineralRichness.NONE) {
            const resourcePRNG = this.systemPRNG.seedNew('resource');
            switch (this.type) {
                case 'Rock': case 'Lunar': this.primaryResource = resourcePRNG.choice(['Common Metals', 'Silicates', 'Rare Elements', 'Precious Metals'])!; break;
                case 'Molten': this.primaryResource = resourcePRNG.choice(['Heavy Metals', 'Exotic Isotopes', 'Silicates'])!; break;
                case 'Frozen': this.primaryResource = resourcePRNG.choice(['Water Ice', 'Methane Ice', 'Ammonia Ice', 'Frozen Gases'])!; break;
                case 'Oceanic': this.primaryResource = resourcePRNG.choice(['Water', 'Dissolved Minerals', 'Exotic Lifeforms?'])!; break;
                default: this.primaryResource = 'Unknown'; break;
            }
            if (this.mineralRichness === MineralRichness.EXCEPTIONAL && resourcePRNG.random() < 0.5) {
                this.primaryResource = resourcePRNG.choice(['Exotic Matter', 'Artifact Shards', 'Precious Gems'])!;
            }
        } else { this.primaryResource = 'None Detected'; }
        console.log(`Scan complete. Resource: ${this.primaryResource}, Richness: ${this.mineralRichness}`);
    }

    // --- Updated getScanInfo() method --- (Ensure ONLY ONE implementation exists)
    /** Returns multi-line scan information for the planet. */
    getScanInfo(): string[] {
        if (this.type === 'GasGiant' || this.type === 'IceGiant') {
            const compositionString = Object.entries(this.atmosphere.composition).filter(([, p]) => p > 0).sort(([, a], [, b]) => b - a).map(([gas, percent]) => `${gas}:${percent}%`).join(', ') || "Trace Gases";
            return [
                `--- SCAN REPORT: ${this.name} ---`, `Type: ${this.type}`, `Diameter: ${this.diameter} km | Gravity: ${this.gravity.toFixed(2)} G (at 1 bar level)`,
                `Effective Temp: ${this.surfaceTemp} K (cloud tops)`, `Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar at cloud tops)`,
                `Composition: ${compositionString}`, `Hydrosphere: ${this.hydrosphere}`, `Lithosphere: ${this.lithosphere}`,
                `Mineral Scan: ${this.mineralRichness}`, `Refueling: Possible via atmospheric scoop.`
            ];
        }
        // Info for solid planets
        let info = `--- SCAN REPORT: ${this.name} ---\n`; // Declare info
        info += `Type: ${this.type} Planet\n`; info += `Diameter: ${this.diameter} km | Gravity: ${this.gravity.toFixed(2)} G\n`;
        info += `Surface Temp (Avg): ${this.surfaceTemp} K\n`; info += `Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar)\n`;
        info += `Composition: `;
        const comp = this.atmosphere.composition;
        if (comp && Object.keys(comp).length > 0 && comp['None'] !== 100) {
            const sortedGases = Object.entries(comp).filter(([, percent]) => percent > 0).sort(([, a], [, b]) => b - a);
            info += sortedGases.map(([gas, percent]) => `${gas}:${percent}%`).join(', ');
        } else { info += "None"; }
        info += `\nHydrosphere: ${this.hydrosphere}\n`; info += `Lithosphere: ${this.lithosphere}\n`;
        // Display scan results correctly
        if (this.scanned) { info += `Mineral Scan: Richness ${this.mineralRichness}. Primary Resource: ${this.primaryResource || 'N/A'}.`; }
        else { info += `Mineral Scan: Requires planetary scan. Richness potential: ${this.mineralRichness}.`; }
        return info.split('\n');
    }
    // --- ENSURE NO DUPLICATE getScanInfo() IS PRESENT ---
}