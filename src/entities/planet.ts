// src/entities/planet.ts (Store Density)

import { MineralRichness, ELEMENTS, PLANET_TYPES } from '../constants';
import { PRNG } from '../utils/prng';
import { RgbColour } from '../rendering/colour';
import { logger } from '../utils/logger';
// Import the specific interface from the generator file
import { generatePlanetCharacteristics, PlanetCharacteristics } from './planet/planet_characteristics_generator';
// Import the generator and data interface
import { SurfaceGenerator, SurfaceData } from './planet/surface_generator';
// Re-export needed types if they aren't in a shared file
export type AtmosphereComposition = Record<string, number>;
//
export interface Atmosphere { //
    density: string; //
    pressure: number; //
    composition: AtmosphereComposition; //
}

/** Represents a planet, holding data generated by other modules. */
export class Planet { //
    // Core Identification & Orbit
    public readonly name: string; //
    public readonly type: string; //
    public readonly orbitDistance: number; //
    public orbitAngle: number; // Mutable
    public systemX: number; // Mutable
    public systemY: number; // Mutable

    // Physical Characteristics (Generated)
    public readonly diameter: number; //
    public readonly density: number; // *** NEW: Store density ***
    public readonly gravity: number; // Now calculated by generator
    public readonly surfaceTemp: number; //
    public readonly atmosphere: Atmosphere; //
    public readonly hydrosphere: string; //
    public readonly lithosphere: string; //

    // Resources & Gameplay (Generated + State)
    public readonly mineralRichness: MineralRichness; // Kept for summary/potential use
    public readonly baseMinerals: number; // Kept for summary/potential use
    public readonly elementAbundance: Record<string, number>; // Overall planet abundance
    public scanned: boolean = false; //
    public primaryResource: string | null = null; // Determined by scan()
    public minedLocations: Set<string> = new Set(); // Track depleted locations (key: "x,y")

    // Generation & State
    public readonly systemPRNG: PRNG; //
    public readonly mapSeed: string; //

    // Surface Data (Lazy Loaded/Cached)
    private _surfaceData: SurfaceData | null = null; // Holds heightmap, colors, AND element map
    private _surfaceGenerator: SurfaceGenerator | null = null; //

    // Moons (Placeholder)
    public moons: Planet[] = []; //

    constructor( //
        name: string,
        type: string,
        orbitDistance: number,
        angle: number,
        systemPRNG: PRNG, // PRNG seeded for the parent system
        parentStarType: string
    ) {
        this.name = name; //
        this.type = type; //
        this.orbitDistance = orbitDistance; //
        this.orbitAngle = angle; //

        // Seed PRNG specifically for this planet
        this.systemPRNG = systemPRNG.seedNew("planet_" + name); //
        logger.debug(`[Planet:${this.name}] Initialized PRNG with seed: ${this.systemPRNG.getInitialSeed()}`); //

        // --- Generate Core Characteristics ---
        const characteristics: PlanetCharacteristics = generatePlanetCharacteristics( //
            this.type,
            this.orbitDistance,
            this.systemPRNG, // Pass the planet-specific PRNG
            parentStarType
        );
        this.diameter = characteristics.diameter; //
        this.density = characteristics.density; // *** Store density ***
        this.gravity = characteristics.gravity; // Store calculated gravity
        this.atmosphere = characteristics.atmosphere; //
        this.surfaceTemp = characteristics.surfaceTemp; //
        this.hydrosphere = characteristics.hydrosphere; //
        this.lithosphere = characteristics.lithosphere; //
        this.mineralRichness = characteristics.mineralRichness; //
        this.baseMinerals = characteristics.baseMinerals; //
        this.elementAbundance = characteristics.elementAbundance; // Assign the overall abundance map

        // Initial position based on orbit
        this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance; //
        this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance; //

        // Map seed for surface generation
        this.mapSeed = this.systemPRNG.getInitialSeed() + "_map"; //

        // Log summary
        const topElements = Object.entries(this.elementAbundance)
                                  .filter(([, abundance]) => abundance > 0)
                                  .sort(([, a], [, b]) => b - a)
                                  .slice(0, 3) // Get top 3
                                  .map(([key]) => ELEMENTS[key]?.name || key) // Use proper name if available
                                  .join(', ');

        logger.info(`[Planet:${this.name}] Constructed. Type=${this.type}, Orbit=${this.orbitDistance.toFixed(0)}, Temp=${this.surfaceTemp}K, Gravity=${this.gravity.toFixed(2)}g, Density=${this.density.toFixed(2)}g/cm³, Minerals=${this.mineralRichness}. Top Elements: [${topElements || 'None'}]`); // Updated log
        //

        // Do NOT generate surface data in constructor for lazy loading
    }

    // --- Getters for Lazy-Loaded Surface Data ---
    get heightmap(): number[][] | null { //
        if (!this._surfaceData && this.type !== 'GasGiant' && this.type !== 'IceGiant') { //
            this.ensureSurfaceReady(); // Generate if needed
        }
        return this._surfaceData?.heightmap ?? null; //
    }

    get heightLevelColors(): string[] | null { //
         if (!this._surfaceData && this.type !== 'GasGiant' && this.type !== 'IceGiant') { //
            this.ensureSurfaceReady(); // Generate if needed
        }
        return this._surfaceData?.heightLevelColors ?? null; //
    }

     get rgbPaletteCache(): RgbColour[] | null { //
         if (!this._surfaceData) { // Generate even for solid planets as height colors depend on it
            this.ensureSurfaceReady(); // Generate if needed
        }
        return this._surfaceData?.rgbPaletteCache ?? null; //
     }

     // Getter for Surface Element Map
     get surfaceElementMap(): string[][] | null { //
         if (!this._surfaceData && this.type !== 'GasGiant' && this.type !== 'IceGiant') { //
             this.ensureSurfaceReady(); // Generate if needed
         }
         return this._surfaceData?.surfaceElementMap ?? null; // Access from _surfaceData
     }

    /** Ensures surface data (including element map) is generated and cached if needed. Throws on failure. */
    ensureSurfaceReady(): void { //
        if (this._surfaceData) { //
            logger.debug(`[Planet:${this.name}] Surface data already generated.`); //
            return; // Already generated
        }

        logger.info(`[Planet:${this.name}] ensureSurfaceReady: Generating surface data...`); //
        if (!this._surfaceGenerator) { //
            // Pass necessary generated characteristics to the SurfaceGenerator
             this._surfaceGenerator = new SurfaceGenerator(this.type, this.mapSeed, this.systemPRNG, this.atmosphere); //
        }

        try { //
             // Pass the planet's overall abundance map to the generator
            this._surfaceData = this._surfaceGenerator.generateSurfaceData(this.elementAbundance); //
            if (!this._surfaceData) { // Check if generator returned null
                throw new Error("Surface generator returned null data."); //
            }

            // Robust check: Ensure required data exists and is non-empty if expected
            const isSolid = this.type !== 'GasGiant' && this.type !== 'IceGiant'; //
            if (isSolid &&
                (!this._surfaceData.heightmap || this._surfaceData.heightmap.length === 0 || // Check map exists and has rows
                 !this._surfaceData.heightLevelColors || this._surfaceData.heightLevelColors.length === 0 || // Check colors exist and have entries
                 !this._surfaceData.surfaceElementMap || this._surfaceData.surfaceElementMap.length === 0) // Check element map exists and has rows
            ) {
                 const missing = [];
                 if (!this._surfaceData.heightmap || this._surfaceData.heightmap.length === 0) missing.push("heightmap");
                 if (!this._surfaceData.heightLevelColors || this._surfaceData.heightLevelColors.length === 0) missing.push("heightLevelColors");
                 if (!this._surfaceData.surfaceElementMap || this._surfaceData.surfaceElementMap.length === 0) missing.push("surfaceElementMap");
                 throw new Error(`Surface generator returned incomplete data for solid planet (missing/empty: ${missing.join(', ')}).`); // Updated error message
            }
             // Check gas giant data (only palette needed)
            if (!isSolid && (!this._surfaceData.rgbPaletteCache || this._surfaceData.rgbPaletteCache.length === 0)) { // Check palette exists and has entries
                 throw new Error("Surface generator returned incomplete data for gas/ice giant (missing/empty palette)."); //
            }

            logger.info(`[Planet:${this.name}] Surface data generated successfully.`); //
        } catch (error) { //
            logger.error(`[Planet:${this.name}] Surface data generation failed: ${error}`); //
            this._surfaceData = null; // Ensure it's null on failure
            throw error; // Re-throw after logging
        }
    }

    /** Performs a scan, determining the primary resource based on abundance. */
    scan(): void { //
         if (this.scanned) { //
            logger.info(`[Planet:${this.name}] Scan attempted, but already scanned.`); //
            return; //
        }
        logger.info(`[Planet:${this.name}] Scanning planet...`); //
        this.scanned = true; //

        let highestAbundance = -1; //
        let potentialResource = 'None Detected'; //

        // Prioritize more valuable non-common elements
        const valuableElements = Object.entries(this.elementAbundance)
            .filter(([key, abundance]) => abundance > 0 && !['SILICON', 'WATER_ICE', 'CARBON', 'IRON', 'ALUMINIUM', 'MAGNESIUM', 'SULFUR', 'PHOSPHORUS', 'POTASSIUM'].includes(key))
            .sort(([, a], [, b]) => b - a); // Sort descending by abundance

        if (valuableElements.length > 0) {
             const [key, abundance] = valuableElements[0];
             this.primaryResource = ELEMENTS[key]?.name || key;
             highestAbundance = abundance;
             potentialResource = this.primaryResource;
        } else {
             // If no valuable elements, find the most abundant common one
             const anyElements = Object.entries(this.elementAbundance)
                                      .filter(([, abundance]) => abundance > 0)
                                      .sort(([, a], [, b]) => b - a);
             if (anyElements.length > 0) {
                 const [key, abundance] = anyElements[0];
                 this.primaryResource = ELEMENTS[key]?.name || key;
                 highestAbundance = abundance;
                 potentialResource = this.primaryResource;
             } else {
                 this.primaryResource = 'None Detected';
             }
        }

         // Bonus check for exceptional richness yielding a rare resource override
         if (this.mineralRichness === MineralRichness.EXCEPTIONAL && this.systemPRNG.random() < 0.2) {
                const rareResources = ['GOLD', 'PLATINUM', 'PALLADIUM', 'RHODIUM', 'URANIUM', 'NEODYMIUM', 'DYSPROSIUM', 'INDIUM'];
                // Choose from rare resources that *actually exist* on the planet
                 const possibleRares = rareResources.filter(r => this.elementAbundance[r] > 0);
                 if (possibleRares.length > 0) {
                     const chosenRareKey = this.systemPRNG.choice(possibleRares)!;
                     const oldResource = this.primaryResource;
                     this.primaryResource = ELEMENTS[chosenRareKey]?.name || chosenRareKey;
                     logger.info(`[Planet:${this.name}] Exceptional richness yielded rare resource: ${this.primaryResource} (overwriting ${oldResource})`);
                     potentialResource = this.primaryResource; // Update the potential resource as well
                 }
        }

        logger.info(`[Planet:${this.name}] Scan complete. Primary Resource: ${potentialResource} (Abundance Value: ${highestAbundance.toFixed(0)}), Richness Category: ${this.mineralRichness}`); //
    }

    /** Returns multi-line scan information for the planet. */
    getScanInfo(): string[] { //
         logger.debug(`[Planet:${this.name}] getScanInfo called (Scanned: ${this.scanned})`); //
        const infoLines: string[] = [ //
             `--- SCAN REPORT: ${this.name} ---`, //
             `Type: ${this.type} Planet`, //
        ];
        if (this.type === 'GasGiant' || this.type === 'IceGiant') { //
            // Gas/Ice Giant specific info
             const compositionString = Object.entries(this.atmosphere.composition) //
                 .filter(([, p]) => p > 0).sort(([, a], [, b]) => b - a) //
                 .map(([gas, percent]) => `${gas}: ${percent}%`).join(', ') || "Trace Gases"; //
            infoLines.push(`Diameter: ${this.diameter.toLocaleString()} km | Density: ${this.density.toFixed(2)} g/cm³ | Gravity: ${this.gravity.toFixed(2)} G (at 1 bar level)`); // Added Density
            infoLines.push(`Effective Temp: ${this.surfaceTemp} K (cloud tops)`); //
            infoLines.push(`Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar at cloud tops)`); //
            infoLines.push(`Composition: ${compositionString}`); //
            infoLines.push(`Hydrosphere: ${this.hydrosphere}`); //
            infoLines.push(`Lithosphere: ${this.lithosphere}`); //
            const topElements = Object.entries(this.elementAbundance)
                .filter(([, abundance]) => abundance > 0)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([key]) => ELEMENTS[key]?.name || key)
                .join(', ');
            infoLines.push(`Notable Resources: ${topElements || 'Trace Amounts'}`); //
            infoLines.push(`Refueling: Possible via atmospheric scoop.`); //
        } else {
             // Solid planet specific info
            infoLines.push(`Diameter: ${this.diameter.toLocaleString()} km | Density: ${this.density.toFixed(2)} g/cm³ | Gravity: ${this.gravity.toFixed(2)} G`); // Added Density
            infoLines.push(`Surface Temp (Avg): ${this.surfaceTemp} K`); //
            infoLines.push(`Atmosphere: ${this.atmosphere.density} (${this.atmosphere.pressure.toFixed(2)} bar)`); //

            let compStr = "None"; //
            const comp = this.atmosphere.composition; //
            if (comp && Object.keys(comp).length > 0 && comp['None'] !== 100) { //
                 compStr = Object.entries(comp) //
                     .filter(([, percent]) => percent > 0).sort(([, a], [, b]) => b - a) //
                     .map(([gas, percent]) => `${gas}: ${percent}%`).join(', '); //
            }
            infoLines.push(`Composition: ${compStr}`); //
            infoLines.push(`Hydrosphere: ${this.hydrosphere}`); //
            infoLines.push(`Lithosphere: ${this.lithosphere}`); //

            if (this.scanned) { //
                 const topElements = Object.entries(this.elementAbundance)
                    .filter(([, abundance]) => abundance > 0)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5) // Show top 5 perhaps
                    .map(([key, abundance]) => `${ELEMENTS[key]?.name || key} (${abundance})`) // Show name and abundance value
                    .join(', ');
                 infoLines.push(`Mineral Scan: ${this.mineralRichness}. Primary: ${this.primaryResource || 'N/A'}.`); //
                 infoLines.push(` -> Top Deposits: ${topElements || 'None Significant'}`); // Display the top elements string
            } else { //
                 infoLines.push(`Mineral Scan: Requires planetary scan. Richness potential: ${this.mineralRichness}.`); //
            }
        }
        return infoLines; //
    }

    /** Checks if a specific surface coordinate has been mined. */
    isMined(x: number, y: number): boolean {
        return this.minedLocations.has(`${x},${y}`);
    }

    /** Marks a specific surface coordinate as mined. */
    markMined(x: number, y: number): void {
        const key = `${x},${y}`;
        if (!this.minedLocations.has(key)) {
             this.minedLocations.add(key);
             logger.debug(`[Planet:${this.name}] Marked location [${x},${y}] as mined.`);
        }
    }

} // End Planet class //