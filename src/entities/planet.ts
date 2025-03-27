// src/entities/planet.ts

import { CONFIG } from '../config';
import {
    GLYPHS, PLANET_TYPES, SPECTRAL_TYPES, ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, MineralRichness
} from '../constants';
import { PRNG } from '../utils/prng';
import { HeightmapGenerator } from '../generation/heightmap';
import { RgbColour, hexToRgb, interpolateColour, rgbToHex } from '../rendering/colour'; // Note 'colour' spelling
import { Perlin } from '../generation/perlin'; // Needed for gas giant rendering

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
    readonly orbitAngle: number;
    readonly systemX: number;
    readonly systemY: number;
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
        this.orbitAngle = angle;
        this.systemPRNG = systemPRNG.seedNew("planet_" + name); // Seed specifically for this planet

        this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance;
        this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance;

        // --- Generate Physical Characteristics ---
        this.diameter = Math.max(1000, this.systemPRNG.randomInt(2000, 20000)); // km
        this.gravity = Math.max(0.01, this.systemPRNG.random(0.1, 2.5)); // G

        this.atmosphere = this.generateAtmosphere(parentStarType);
        this.surfaceTemp = this.calculateSurfaceTemp(parentStarType);
        this.hydrosphere = this.generateHydrosphere();
        this.lithosphere = this.generateLithosphere();
        this.mineralRichness = this.determineMineralRichness();
        this.baseMinerals = this.calculateBaseMinerals();

        this.mapSeed = this.systemPRNG.getInitialSeed() + "_map"; // Specific seed for map gen

        // Moons could be generated here if needed
    }

    private generateAtmosphere(parentStarType: string): Atmosphere {
        const densityRoll = this.systemPRNG.random();
        let densityIndex = 0;
        if (densityRoll < 0.2) densityIndex = 0;       // None (20%)
        else if (densityRoll < 0.5) densityIndex = 1; // Thin (30%)
        else if (densityRoll < 0.85) densityIndex = 2; // Earth-like (35%)
        else densityIndex = 3;                         // Thick (15%)

        // Adjust density based on type/gravity
        if (this.type === 'GasGiant' || this.type === 'IceGiant') densityIndex = 3; // Always Thick
        else if (this.type === 'Lunar' || this.type === 'Molten') densityIndex = this.systemPRNG.choice([0, 0, 1]); // Likely None/Thin
        else if (this.gravity < 0.3 && densityIndex > 1) densityIndex = 1; // Low gravity struggles to hold thick atmosphere

        const density = ATMOSPHERE_DENSITIES[densityIndex];
        const pressure = densityIndex === 0 ? 0 : Math.max(0.01, this.systemPRNG.random(0.01, 5) * (densityIndex)); // Pressure scales with density index

        const composition = this.generateAtmosphereComposition(density, parentStarType);

        return { density, pressure, composition };
    }

    private generateAtmosphereComposition(density: string, parentStarType: string): AtmosphereComposition {
        if (density === 'None') return { None: 100 };

        const comp: AtmosphereComposition = {};
        let remaining = 100.0;
        const numGases = this.systemPRNG.randomInt(2, 6);

        // Determine primary gas based on type and estimated temp (rough guess before temp is final)
        const starTempApprox = SPECTRAL_TYPES[parentStarType]?.temp || SPECTRAL_TYPES['G'].temp;
        const approxTemp = PLANET_TYPES[this.type]?.baseTemp * (starTempApprox / SPECTRAL_TYPES['G'].temp) + this.systemPRNG.random(-50, 50);

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

            // Last gas takes remaining, otherwise random portion
            const percent = (i === numGases - 1 || availableGases.length === 0)
                ? remaining
                : this.systemPRNG.random(0.1, remaining / 1.5);

            if (percent > 0.05) { // Only include if > 0.05%
                comp[gas] = percent;
                remaining -= percent;
            }
        }

        // Normalize percentages to sum exactly 100, handling rounding
        let total = Object.values(comp).reduce((s, p) => s + p, 0);
        const finalComp: AtmosphereComposition = {};
        if (total > 0) {
            const scaleFactor = 100 / total;
            let runningTotal = 0;
            const keys = Object.keys(comp);
            for (let i = 0; i < keys.length; i++) {
                const gas = keys[i];
                let roundedPercent: number;
                if (i === keys.length - 1) {
                    // Last element takes the remainder to ensure sum is 100
                    roundedPercent = Math.max(0, 100 - runningTotal);
                    // Optional: round final value to one decimal place
                    roundedPercent = Math.round(roundedPercent * 10) / 10;
                } else {
                    const scaledValue = comp[gas] * scaleFactor;
                    // Round small percentages to 1 decimal place, larger ones to integer
                    roundedPercent = scaledValue >= 1 ? Math.round(scaledValue) : Math.round(scaledValue * 10) / 10;
                }

                if (roundedPercent > 0) {
                    finalComp[gas] = roundedPercent;
                    runningTotal += roundedPercent; // Use the actual added value for running total
                }
            }
            // Final check in case of floating point weirdness - adjust primary gas
             let finalTotalCheck = Object.values(finalComp).reduce((s, p) => s + p, 0);
             if (Math.abs(finalTotalCheck - 100) > 0.01 && finalComp[primaryGas] !== undefined) {
                  const diff = Math.round((100 - finalTotalCheck) * 10) / 10;
                  finalComp[primaryGas] = Math.max(0, finalComp[primaryGas] + diff);
                  // Re-round primary gas after adjustment
                  finalComp[primaryGas] = finalComp[primaryGas] >= 1 ? Math.round(finalComp[primaryGas]) : Math.round(finalComp[primaryGas] * 10) / 10;
             }

        } else if (density !== 'None') {
            // Should not happen if density > None, but fallback
            finalComp['Nitrogen'] = 100;
        }

        return finalComp;
    }


    private calculateSurfaceTemp(parentStarType: string): number {
        const starTemp = SPECTRAL_TYPES[parentStarType]?.temp || SPECTRAL_TYPES['G'].temp;
        // Star luminosity relative to Sol (L ~ T^4)
        const starLuminosityFactor = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4;
        // Distance factor (Intensity ~ 1/d^2), relative to Earth's distance (approx)
        // Using 50000 as a reference distance scaling unit from original code
        const distFactor = (50000 / Math.max(1000, this.orbitDistance)) ** 2; // Inverse square law

        let basePlanetTemp = PLANET_TYPES[this.type]?.baseTemp || 300; // Intrinsic temp / Albedo placeholder

        // Effective temperature from stellar radiation: Teff ~ (L/d^2)^0.25
        let temp = basePlanetTemp * (starLuminosityFactor * distFactor) ** 0.25;

        // Greenhouse effect approximation
        let greenhouseFactor = 1.0;
        if (this.atmosphere.density === 'Earth-like') greenhouseFactor = 1.15;
        if (this.atmosphere.density === 'Thick') greenhouseFactor = 1.6;

        // Boost greenhouse for high CO2/Methane
        const co2 = this.atmosphere.composition['Carbon Dioxide'] || 0;
        const methane = this.atmosphere.composition['Methane'] || 0;
        if (co2 > 50 || methane > 20) greenhouseFactor *= 1.3;

        temp *= greenhouseFactor;

        // Ad-hoc adjustments based on type (consider removing/refining these)
        if (this.type === 'Frozen' || this.type === 'IceGiant') temp *= 0.8;
        if (this.type === 'Molten' || this.type === 'Lunar') temp *= 1.05; // Higher absorption?

        return Math.max(2, Math.round(temp)); // Ensure temp is above absolute zero
    }

    private generateHydrosphere(): string {
        if (this.type === 'Oceanic') return 'Global Saline Ocean';
        if (this.type === 'Frozen') return 'Global Ice Sheet, Subsurface Ocean Possible';
        if (this.type === 'Molten' || this.type === 'Lunar') return 'None';
        if (this.type === 'GasGiant' || this.type === 'IceGiant') return 'N/A (Gaseous/Fluid Interior)';

        const tempK = this.surfaceTemp;
        const pressure = this.atmosphere.pressure;

        // Check for ice possibility (below freezing point of water at low pressure)
        if (tempK < 273.15 && pressure > 0.006) { // Triple point pressure approx
            return this.systemPRNG.random() < 0.6
                ? 'Polar Ice Caps, Surface Ice Deposits'
                : 'Scattered Subsurface Ice Pockets';
        }

        // Check for liquid water possibility (between freezing and boiling)
        // Approximate boiling point dependency on pressure (Clausius-Clapeyron, simplified)
        // Boiling point increases roughly 30-40 K per bar near 1 bar. Let's use 35.
        const boilingPointApprox = 373.15 + (pressure - 1) * 35;
        if (tempK > 273.15 && tempK < boilingPointApprox && pressure > 0.01) { // Need some pressure
            const waterChance = this.systemPRNG.random();
            if (waterChance < 0.15) return 'Arid, Trace Liquid Water Possible';
            if (waterChance < 0.6) return 'Lakes, Rivers, Small Seas';
            return 'Significant Oceans and Seas';
        }

        // Check for vapor / supercritical fluid
        if (tempK > boilingPointApprox && pressure > 0.01) {
            return (pressure > 5 && this.systemPRNG.random() < 0.3) // High pressure might keep some dense vapor/fluid
                ? 'Atmospheric Water Vapor, Potential Supercritical Fluid'
                : 'Trace Water Vapor';
        }

        // Default if none of the above
        return 'None or Trace Ice Sublimating';
    }


    private generateLithosphere(): string {
        switch (this.type) {
            case 'Molten': return 'Silicate Lava Flows, Rapidly Cooling Crust';
            case 'Rock': return this.systemPRNG.choice([
                'Silicate Rock (Granite/Basalt), Tectonically Active?',
                'Carbonaceous Rock, Sedimentary Layers, Fossil Potential?',
                'Iron-Rich Crust, Evidence of Metallic Core'
            ])!;
            case 'Oceanic': return 'Submerged Silicate Crust, Probable Hydrothermal Vents';
            case 'Lunar': return 'Impact-Pulverized Regolith, Basaltic Maria, Scarce Volatiles';
            case 'GasGiant': return 'No Solid Surface Defined';
            case 'IceGiant': return 'No Solid Surface Defined, Deep Icy/Fluid Mantle';
            case 'Frozen': return this.systemPRNG.choice([
                'Water Ice Dominant, Ammonia/Methane Ices Present',
                'Nitrogen/CO2 Ice Glaciers, Possible Cryovolcanism',
                'Mixed Ice/Rock Surface, Sublimation Features'
            ])!;
            default: return 'Unknown Composition';
        }
    }

    private determineMineralRichness(): MineralRichness {
        const prng = this.systemPRNG.seedNew("minerals");
        let baseChance = 0.5; // Base probability of having *any* minerals

        switch (this.type) {
            case 'Molten': baseChance = 0.6; break;
            case 'Rock': baseChance = 0.8; break; // Highest chance
            case 'Lunar': baseChance = 0.7; break;
            case 'Frozen': baseChance = 0.4; break;
            case 'Oceanic': baseChance = 0.2; break; // Hard to mine
            case 'GasGiant':
            case 'IceGiant': return MineralRichness.NONE; // Cannot mine gas giants
            default: baseChance = 0.5;
        }

        if (prng.random() > baseChance) {
            return MineralRichness.NONE;
        }

        // If minerals are present, determine richness level
        const roll = prng.random();
        if (roll < 0.40) return MineralRichness.POOR;      // 40% chance
        if (roll < 0.75) return MineralRichness.AVERAGE;   // 35% chance
        if (roll < 0.95) return MineralRichness.RICH;      // 20% chance
        return MineralRichness.EXCEPTIONAL;                // 5% chance
    }

    private calculateBaseMinerals(): number {
        let factor = 0;
        switch (this.mineralRichness) {
            case MineralRichness.POOR: factor = 1; break;
            case MineralRichness.AVERAGE: factor = 2; break;
            case MineralRichness.RICH: factor = 5; break;
            case MineralRichness.EXCEPTIONAL: factor = 10; break;
            default: return 0;
        }
        // Base amount scales with richness, with some randomness
        return factor * 1000 * this.systemPRNG.random(0.8, 1.2);
    }


    /** Adds simulated impact craters to the heightmap (call after generation). */
    private addCratersToHeightmap(): void {
        if (!this.heightmap) {
            console.warn(`Attempted to add craters to ${this.name} but heightmap is null.`);
            return;
        }
        const mapSize = this.heightmap.length;
        if (mapSize <= 0) return;

        const craterPRNG = this.systemPRNG.seedNew('craters');
        // Scale number of craters roughly with surface area (size^2)
        const numCraters = craterPRNG.randomInt(Math.floor(mapSize / 15), Math.floor(mapSize / 5));
        console.log(`Adding ${numCraters} craters to ${this.name}`);

        for (let i = 0; i < numCraters; i++) {
            // Radius scales with map size, allowing larger craters on larger maps
            const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10)));
            const cx = craterPRNG.randomInt(0, mapSize - 1);
            const cy = craterPRNG.randomInt(0, mapSize - 1);

            // Crater depth and rim height relative to radius
            const depthFactor = craterPRNG.random(0.5, 2.0);
            const rimFactor = craterPRNG.random(0.1, 0.3); // Rim height as fraction of depth
            const maxDepth = r * depthFactor;
            const rimHeight = maxDepth * rimFactor;

            // Bounding box for efficiency
            const startY = Math.max(0, cy - r - 2); // Add buffer for rim
            const endY = Math.min(mapSize - 1, cy + r + 2);
            const startX = Math.max(0, cx - r - 2);
            const endX = Math.min(mapSize - 1, cx + r + 2);

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const dx = x - cx;
                    const dy = y - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Only affect points within the crater's influence radius
                    if (dist <= r + 1) { // Allow influence slightly beyond radius for smooth rim
                        const currentH = this.heightmap[y][x];
                        let deltaH = 0;

                        // Depression (inside the radius r)
                        if (dist < r) {
                            // Cosine profile for smooth depression
                            const depressionProfile = (Math.cos(dist / r * Math.PI) + 1) / 2; // 1 at center, 0 at edge
                            deltaH -= maxDepth * depressionProfile;
                        }

                        // Rim (around the edge)
                        const rimPeakDist = r * 0.85; // Where the rim crest is located
                        const rimWidth = r * 0.3; // How wide the rim is
                        if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) {
                            // Cosine profile for smooth rim centered around rimPeakDist
                            const rimProfile = (Math.cos((dist - rimPeakDist) / rimWidth * Math.PI) + 1) / 2;
                            deltaH += rimHeight * rimProfile;
                        }

                        // Apply change and clamp to valid height range
                        let newH = currentH + deltaH;
                        this.heightmap[y][x] = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(newH)));
                    }
                }
            }
        }
    }

    /** Ensures surface data (heightmap, colours) is generated if needed. Throws error on failure. */
    ensureSurfaceReady(): void {
        // Handle Gas Giants - they don't have a solid surface heightmap
        if (this.type === 'GasGiant' || this.type === 'IceGiant') {
            if (!this.rgbPaletteCache) {
                const planetPalette = PLANET_TYPES[this.type]?.colors;
                if (!planetPalette) throw new Error(`Planet visual data missing for ${this.type} ${this.name}.`);
                this.rgbPaletteCache = planetPalette.map(hex => hexToRgb(hex));
            }
            this.heightmap = null; // Explicitly null
            this.heightLevelColors = null; // Explicitly null
            // console.log(`Skipping heightmap for Gas/Ice Giant: ${this.name}`);
            return; // Ready for gas giant rendering
        }

         // Handle Starbases (already handled in Starbase class, but check defensively)
        if (this.type === 'Starbase') {
             if (!this.heightLevelColors) this.heightLevelColors = [CONFIG.STARBASE_COLOR];
             if (!this.heightmap) this.heightmap = [[0]];
             // console.log(`Using dummy surface data for Starbase: ${this.name}`);
             return; // Ready for starbase rendering
        }


        // Generate Heightmap if it doesn't exist
        if (!this.heightmap) {
            console.log(`Generating surface map for ${this.name} using seed ${this.mapSeed}`);
            // Use target size from config, generator adjusts to power of 2 + 1
            const mapSizeTarget = CONFIG.PLANET_MAP_BASE_SIZE;
            try {
                const generator = new HeightmapGenerator(mapSizeTarget, CONFIG.PLANET_SURFACE_ROUGHNESS, this.mapSeed);
                const generatedMap = generator.generate();

                // Basic validation
                if (!generatedMap || generatedMap.length < 1 || generatedMap[0].length !== generatedMap.length) {
                    throw new Error("Heightmap generation resulted in invalid map dimensions.");
                }
                this.heightmap = generatedMap;
                console.log(`Generated ${this.heightmap.length}x${this.heightmap.length} heightmap for ${this.name}`);

                // Add craters after base generation for certain types
                if (this.type === 'Lunar' || (this.type === 'Rock' && this.atmosphere.density === 'None')) {
                    this.addCratersToHeightmap();
                }
            } catch (error) {
                this.heightmap = null; // Ensure map is null on failure
                throw new Error(`Heightmap generation failed for ${this.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Precompute Height Level Colours if they don't exist
        if (!this.heightLevelColors) {
            // console.log(`Precomputing height colours for ${this.name}`);
            const planetPalette = PLANET_TYPES[this.type]?.colors;
            if (!planetPalette || planetPalette.length === 0) {
                throw new Error(`Planet visual data missing or empty for colour precomputation on ${this.name} (${this.type}).`);
            }

            // Cache the RGB versions of the palette
            if (!this.rgbPaletteCache) {
                this.rgbPaletteCache = planetPalette.map(hex => hexToRgb(hex));
            }
            const rgbPalette = this.rgbPaletteCache;
            const numPaletteColours = rgbPalette.length;
            if (numPaletteColours < 1) throw new Error(`Planet RGB palette is empty for ${this.name}.`);

            this.heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS);
            for (let h = 0; h < CONFIG.PLANET_HEIGHT_LEVELS; h++) {
                // Map height level (0 to max) to palette index (0 to numColours-1)
                const colourIndexFloat = (h / (CONFIG.PLANET_HEIGHT_LEVELS - 1)) * (numPaletteColours - 1);
                const index1 = Math.max(0, Math.min(numPaletteColours - 1, Math.floor(colourIndexFloat))); // Ensure valid index
                const index2 = Math.min(numPaletteColours - 1, index1 + 1); // Ensure valid index
                const factor = colourIndexFloat - index1; // Interpolation factor

                let terrainRgb: RgbColour;
                if (index1 === index2) { // Handle edge case: exactly at a palette colour
                     terrainRgb = rgbPalette[index1];
                } else if(index1 < numPaletteColours && index2 < numPaletteColours) { // Interpolate between two colours
                    terrainRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor);
                } else {
                     terrainRgb = rgbPalette[index1]; // Fallback if something is wrong
                }

                this.heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b);
            }
            // console.log(`Finished precomputing ${this.heightLevelColors.length} height colours for ${this.name}`);
        }
    }

    /** Returns multi-line scan information for the planet. */
    getScanInfo(): string[] {
        if (this.type === 'GasGiant' || this.type === 'IceGiant') {
            const compositionString = Object.entries(this.atmosphere.composition)
                .filter(([, p]) => p > 0) // Filter out 0% entries
                .sort(([, a], [, b]) => b - a) // Sort descending by percentage
                .map(([gas, percent]) => `${gas}:${percent}%`)
                .join(', ') || "Trace Gases";

            return [
                `--- SCAN REPORT: ${this.name} ---`,
                `Type: ${this.type}`,
                `Diameter: ${this.diameter} km | Gravity: ${this.gravity.toFixed(2)} G (at 1 bar level)`,
                `Effective Temp: ${this.surfaceTemp} K (cloud tops)`,
                `Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar at cloud tops)`,
                `Composition: ${compositionString}`,
                `Hydrosphere: ${this.hydrosphere}`,
                `Lithosphere: ${this.lithosphere}`,
                `Mineral Scan: ${this.mineralRichness}`,
                `Refueling: Possible via atmospheric scoop.`
            ];
        }

        // Info for solid planets
        let info = `--- SCAN REPORT: ${this.name} ---\n`;
        info += `Type: ${this.type} Planet\n`;
        info += `Diameter: ${this.diameter} km | Gravity: ${this.gravity.toFixed(2)} G\n`;
        info += `Surface Temp (Avg): ${this.surfaceTemp} K\n`;
        info += `Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar)\n`;
        info += `Composition: `;

        const comp = this.atmosphere.composition;
        if (comp && Object.keys(comp).length > 0 && comp['None'] !== 100) {
            const sortedGases = Object.entries(comp)
                .filter(([, percent]) => percent > 0)
                .sort(([, a], [, b]) => b - a);
            info += sortedGases.map(([gas, percent]) => `${gas}:${percent}%`).join(', ');
        } else {
            info += "None";
        }

        info += `\nHydrosphere: ${this.hydrosphere}\n`;
        info += `Lithosphere: ${this.lithosphere}\n`;
        info += `Mineral Scan: Richness detected as ${this.mineralRichness}.`;
        // Could add base mineral estimate if desired: `(Est. Yield Factor: ${this.baseMinerals})`

        return info.split('\n'); // Split into lines for easier display
    }

    // Scan-related properties
    scanned: boolean = false;
    primaryResource: string | null = null; // e.g., 'Iron', 'Water', 'Silicates'
    // richness property already exists as mineralRichness: MineralRichness;

    // ... (existing constructor and methods) ...
    
    /** Performs a scan of the planet, populating scan-related properties. */
    scan(): void {
        if (this.scanned) return;

        console.log(`Scanning ${this.name}...`);
        this.scanned = true;

        // Determine primary resource based on type and richness (example logic)
        if (this.mineralRichness !== MineralRichness.NONE) {
            const resourcePRNG = this.systemPRNG.seedNew('resource');
            switch (this.type) {
                case 'Rock':
                case 'Lunar':
                    this.primaryResource = resourcePRNG.choice(['Common Metals', 'Silicates', 'Rare Elements', 'Precious Metals'])!;
                    break;
                case 'Molten':
                    this.primaryResource = resourcePRNG.choice(['Heavy Metals', 'Exotic Isotopes', 'Silicates'])!;
                    break;
                case 'Frozen':
                    this.primaryResource = resourcePRNG.choice(['Water Ice', 'Methane Ice', 'Ammonia Ice', 'Frozen Gases'])!;
                    break;
                    case 'Oceanic':
                        this.primaryResource = resourcePRNG.choice(['Water', 'Dissolved Minerals', 'Exotic Lifeforms?'])!; // Less mining focus maybe
                        break;
                default:
                    this.primaryResource = 'Unknown';
                    break;
            }
            // Adjust resource likelihood based on richness? (e.g., Exceptional more likely Rare/Precious)
                if (this.mineralRichness === MineralRichness.EXCEPTIONAL && resourcePRNG.random() < 0.5) {
                    this.primaryResource = resourcePRNG.choice(['Exotic Matter', 'Artifact Shards', 'Precious Gems'])!;
                }

        } else {
            this.primaryResource = 'None Detected';
        }

        // Scan logic could be expanded (takes time, uses fuel, etc.)
        console.log(`Scan complete. Primary Resource: ${this.primaryResource}, Richness: ${this.mineralRichness}`);
    }

    /** Returns multi-line scan information for the planet. (Ensure this uses the new properties) */
    getScanInfo(): string[] {
        // ...(previous getScanInfo code)...

        // Modify the last line to use the scanned properties if available:
        if (this.scanned) {
                info += `\nMineral Scan: Richness ${this.mineralRichness}. Primary Resource: ${this.primaryResource || 'N/A'}.`;
        } else {
                info += `\nMineral Scan: Requires planetary scan. Richness potential: ${this.mineralRichness}.`;
        }


        return info.split('\n'); // Split into lines for easier display
    }
}