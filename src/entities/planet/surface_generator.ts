// src/entities/planet/surface_generator.ts (Added Sparsity Check)

import { HeightmapGenerator } from '../../generation/heightmap';
import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { PLANET_TYPES, ELEMENTS } from '../../constants'; // Added ELEMENTS
import { RgbColour, hexToRgb, rgbToHex, interpolateColour } from '../../rendering/colour';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet'; // Import type
import { PerlinNoise } from '../../generation/perlin'; // Import PerlinNoise

// Interface for the generated surface data package - ADD surfaceElementMap
export interface SurfaceData {
    heightmap: number[][] | null;
    heightLevelColors: string[] | null;
    rgbPaletteCache: RgbColour[] | null;
    surfaceElementMap: string[][] | null; // NEW: Stores dominant element key per coordinate
}

/** Generates surface data (heightmap, colours, palettes, element map) for a planet. */
export class SurfaceGenerator {
    private prng: PRNG;
    private planetType: string;
    private mapSeed: string;
    private atmosphere: Atmosphere; // Needed for crater check
    private elementNoiseGenerator: PerlinNoise; // NEW: Noise for element distribution

    constructor(planetType: string, mapSeed: string, prng: PRNG, atmosphere: Atmosphere) {
        this.planetType = planetType;
        this.mapSeed = mapSeed;
        this.prng = prng; // Use the planet-specific PRNG
        this.atmosphere = atmosphere;
        // NEW: Initialize Perlin noise specifically for element distribution
        this.elementNoiseGenerator = new PerlinNoise(this.mapSeed + "_elements");
        logger.debug(`[SurfaceGen] Initialized for Type: ${planetType}, Seed: ${mapSeed}. Element Noise Seeded.`);
    }

    /** Generates all necessary surface data based on planet type. */
    generateSurfaceData(planetAbundance: Record<string, number>): SurfaceData { // Accept planet's overall abundance
        logger.info(`[SurfaceGen:${this.planetType}] Generating surface data...`);
        let heightmap: number[][] | null = null;
        let heightLevelColors: string[] | null = null;
        let rgbPaletteCache: RgbColour[] | null = null;
        let surfaceElementMap: string[][] | null = null; // Initialize

        // --- Handle Gas Giants/Ice Giants (Palette Cache Only) ---
        if (this.planetType === 'GasGiant' || this.planetType === 'IceGiant') {
            rgbPaletteCache = this.generateRgbPaletteCache(); // Logs internally
            logger.info(`[SurfaceGen:${this.planetType}] Generated RGB palette cache.`);
            // No heightmap or element map for gas giants
        }
        // --- Handle Solid Planets (Heightmap, Colors, Element Map) ---
        else {
            heightmap = this.generateHeightmap(); // Logs internally
            if (heightmap) {
                // Add craters for specific types
                if (this.planetType === 'Lunar' || (this.planetType === 'Rock' && this.atmosphere.density === 'None')) {
                    heightmap = this.addCratersToHeightmap(heightmap); // Modifies map in place, logs internally
                }

                // Generate Element Map using overall planet abundance and heightmap
                surfaceElementMap = this.generateSurfaceElementMap(planetAbundance, heightmap); // NEW CALL, pass heightmap
                if (!surfaceElementMap) {
                     logger.error(`[SurfaceGen:${this.planetType}] Surface element map generation failed.`);
                }

                // Generate colours based on the final heightmap
                rgbPaletteCache = this.generateRgbPaletteCache(); // Need this for colour generation
                if(rgbPaletteCache) {
                    heightLevelColors = this.generateHeightLevelColors(rgbPaletteCache); // Logs internally
                    logger.info(`[SurfaceGen:${this.planetType}] Generated heightmap (${heightmap.length}x${heightmap.length}), element map, and height level colours.`);
                } else {
                     logger.error(`[SurfaceGen:${this.planetType}] Failed to generate RGB palette, cannot generate height level colours.`);
                     heightLevelColors = null;
                }
            } else {
                 logger.error(`[SurfaceGen:${this.planetType}] Heightmap generation failed. Cannot generate colours or element map.`);
                 heightLevelColors = null;
                 rgbPaletteCache = null;
                 surfaceElementMap = null; // Ensure null if heightmap failed
            }
        }

        return { heightmap, heightLevelColors, rgbPaletteCache, surfaceElementMap }; // Return element map
    }

    /** Generates the heightmap using HeightmapGenerator. */
    private generateHeightmap(): number[][] | null {
        logger.info(`[SurfaceGen:${this.planetType}] Generating heightmap (Seed: ${this.mapSeed})...`);
        const mapSizeTarget = CONFIG.PLANET_MAP_BASE_SIZE;
        try {
            const generator = new HeightmapGenerator(mapSizeTarget, CONFIG.PLANET_SURFACE_ROUGHNESS, this.mapSeed);
            const generatedMap = generator.generate();
            if (!generatedMap || generatedMap.length < 1 || generatedMap[0].length !== generatedMap.length) {
                throw new Error("HeightmapGenerator returned invalid map dimensions.");
            }
            logger.info(`[SurfaceGen:${this.planetType}] Generated ${generatedMap.length}x${generatedMap.length} heightmap.`);
            return generatedMap;
        } catch (error) {
            logger.error(`[SurfaceGen:${this.planetType}] Heightmap generation failed:`, error);
            return null;
        }
    }

     /** Adds impact craters to a given heightmap. Returns the modified map. */
    private addCratersToHeightmap(heightmap: number[][]): number[][] {
         if (!heightmap) return heightmap; // Should not happen if called correctly
        const mapSize = heightmap.length; //
        if (mapSize <= 0) return heightmap; //

        logger.info(`[SurfaceGen:${this.planetType}] Adding impact craters...`); //
        const craterPRNG = this.prng.seedNew('craters'); //
        const numCraters = craterPRNG.randomInt(Math.floor(mapSize / 15), Math.floor(mapSize / 5)); //
        logger.debug(`[SurfaceGen:${this.planetType}] Generating ${numCraters} craters.`); //
        for (let i = 0; i < numCraters; i++) { //
            const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10))); //
            const cx = craterPRNG.randomInt(0, mapSize - 1); //
            const cy = craterPRNG.randomInt(0, mapSize - 1); //
            const depthFactor = craterPRNG.random(0.5, 2.0); //
            const rimFactor = craterPRNG.random(0.1, 0.3); //
            const maxDepth = r * depthFactor; //
            const rimHeight = maxDepth * rimFactor; //
            const startY = Math.max(0, cy - r - 2); //
            const endY = Math.min(mapSize - 1, cy + r + 2); //
            const startX = Math.max(0, cx - r - 2); //
            const endX = Math.min(mapSize - 1, cx + r + 2); //
            for (let y = startY; y <= endY; y++) { //
                for (let x = startX; x <= endX; x++) { //
                    const dx = x - cx; //
                    const dy = y - cy; //
                    const distSq = dx * dx + dy * dy; //
                    if (distSq <= (r + 1) ** 2) { //
                        const dist = Math.sqrt(distSq); //
                        const currentH = heightmap[y][x]; //
                        let deltaH = 0; //
                        if (dist < r) deltaH -= maxDepth * ((Math.cos(dist / r * Math.PI) + 1) / 2); // Depression
                        const rimPeakDist = r * 0.85; //
                        const rimWidth = r * 0.3; //
                        if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) { //
                            deltaH += rimHeight * ((Math.cos((dist - rimPeakDist) / rimWidth * Math.PI) + 1) / 2); // Rim
                        }
                        heightmap[y][x] = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(currentH + deltaH))); //
                    }
                }
            }
        }
        logger.info(`[SurfaceGen:${this.planetType}] Finished adding ${numCraters} craters.`); //
        return heightmap; // Return the modified map
    }


    /** Generates or retrieves the RGB palette cache for the planet type. */
    private generateRgbPaletteCache(): RgbColour[] | null {
         logger.debug(`[SurfaceGen:${this.planetType}] Generating/retrieving RGB palette cache...`); //
         const planetPaletteHex = PLANET_TYPES[this.planetType]?.colours; //
         if (!planetPaletteHex || planetPaletteHex.length === 0) { //
             logger.error(`[SurfaceGen:${this.planetType}] Planet visual data (colour palette) missing or empty.`); //
             return null; //
         }
         try { //
             const cache = planetPaletteHex.map(hex => hexToRgb(hex)); //
             logger.debug(`[SurfaceGen:${this.planetType}] RGB palette cache ready (${cache.length} colours).`); //
             return cache; //
         } catch (e) { //
             logger.error(`[SurfaceGen:${this.planetType}] Failed to parse colour palette:`, e); //
             return null; //
         }
     }

    /** Generates the array of hex colour strings for each height level. */
    private generateHeightLevelColors(rgbPalette: RgbColour[]): string[] | null {
        if (!rgbPalette || rgbPalette.length < 1) { //
            logger.error(`[SurfaceGen:${this.planetType}] Cannot generate height colours: RGB palette cache is invalid or empty.`); //
            return null; //
        }

        logger.info(`[SurfaceGen:${this.planetType}] Generating height level colours...`); //
        const numPaletteColours = rgbPalette.length; //
        const heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS); //
        logger.debug(`[SurfaceGen:${this.planetType}] Interpolating ${numPaletteColours} palette colours across ${CONFIG.PLANET_HEIGHT_LEVELS} height levels...`); //
        for (let h = 0; h < CONFIG.PLANET_HEIGHT_LEVELS; h++) { //
            const colourIndexFloat = (h / (CONFIG.PLANET_HEIGHT_LEVELS - 1)) * (numPaletteColours - 1); //
            const index1 = Math.max(0, Math.min(numPaletteColours - 1, Math.floor(colourIndexFloat))); //
            const index2 = Math.min(numPaletteColours - 1, index1 + 1); //
            const factor = colourIndexFloat - index1; //

            let terrainRgb: RgbColour; //
            if (index1 === index2 || factor === 0) { //
                 terrainRgb = rgbPalette[index1]; //
            } else if (index1 < numPaletteColours && index2 < numPaletteColours) { //
                terrainRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor); //
            } else { //
                 logger.warn(`[SurfaceGen:${this.planetType}] Height colour generation encountered invalid palette indices (${index1}, ${index2}) at height ${h}. Using fallback.`); //
                 terrainRgb = rgbPalette[index1]; // Fallback
            }
            heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b); //
        }
        logger.info(`[SurfaceGen:${this.planetType}] Height level colours generated successfully.`); //
        return heightLevelColors; //
    }

    /**
     * NEW: Generates the surface element map with sparsity.
     * Uses overall planet abundance, heightmap, and noise to distribute elements.
     */
    private generateSurfaceElementMap(
        planetAbundance: Record<string, number>,
        heightmap: number[][] // Use heightmap to influence distribution
    ): string[][] | null {
        if (!heightmap) {
            logger.error("[SurfaceGen] Cannot generate element map without a valid heightmap.");
            return null;
        }
        const mapSize = heightmap.length;
        if (mapSize <= 0) {
            logger.error(`[SurfaceGen] Invalid mapSize (${mapSize}) for element map generation.`);
            return null;
        }

        logger.info(`[SurfaceGen:${this.planetType}] Generating ${mapSize}x${mapSize} surface element map...`);
        const surfaceMap: string[][] = Array.from({ length: mapSize }, () => new Array(mapSize).fill('')); // Initialize empty

        // --- Prepare weighted list based on overall planet abundance ---
        const weightedPlanetElements: { key: string; weight: number }[] = [];
        let totalPlanetWeight = 0;
        for (const key in planetAbundance) {
            const abundance = planetAbundance[key];
            if (abundance > 0) {
                const weight = abundance; // Example: Direct weight
                weightedPlanetElements.push({ key: key, weight: weight });
                totalPlanetWeight += weight;
            }
        }

        if (totalPlanetWeight <= 0) {
            logger.warn(`[SurfaceGen:${this.planetType}] No elements with abundance > 0 found for planet. Surface map will be empty.`);
            return surfaceMap; // Return empty map
        }

        // --- Generate map cell by cell ---
        const elementNoiseScale = 0.08; // Controls the size of element veins/patches
        const heightInfluenceFactor = 0.4; // How much height affects probability
        const baseSparsityThreshold = 0.9995; // *** NEW: Base chance (0-1) for a cell *not* to have a resource even if one is chosen ***
        const richnessFactor = 0.1; // *** NEW: How much local richness noise affects sparsity threshold ***

        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize; x++) {
                // 1. Get Perlin noise values
                const elementClusterNoise = this.elementNoiseGenerator.get(x * elementNoiseScale, y * elementNoiseScale); // Value -1 to 1
                const localRichnessNoise = this.elementNoiseGenerator.get(x * 0.2 + 100, y * 0.2 + 100); // Different scale for local richness/sparsity

                // 2. Get heightmap value
                const heightVal = heightmap[y][x] / (CONFIG.PLANET_HEIGHT_LEVELS - 1); // Normalize height

                // 3. Calculate adjusted weights for each element
                let localTotalWeight = 0;
                const localWeights: { key: string; adjustedWeight: number }[] = [];
                for (const element of weightedPlanetElements) {
                     let adjustedWeight = element.weight;
                     // --- Apply Noise/Height Modifiers (as before) ---
                     let noiseAffinity = 1.0 - Math.abs(elementClusterNoise);
                     if (element.key === 'GOLD' || element.key === 'PLATINUM') {
                        noiseAffinity = (elementClusterNoise > 0.6) ? 2.0 : 0.1;
                     } else if (element.key === 'IRON' || element.key === 'SILICON') {
                        noiseAffinity = 1.0;
                     }
                     adjustedWeight *= (0.5 + noiseAffinity);

                     if (['IRON', 'LEAD', 'GOLD', 'PLATINUM', 'TUNGSTEN', 'URANIUM', 'RHODIUM', 'PALLADIUM', 'NICKEL', 'COPPER', 'ZINC', 'TIN', 'COBALT'].includes(element.key)) {
                          adjustedWeight *= (1.0 - heightVal * heightInfluenceFactor);
                     } else if (['ALUMINIUM', 'SILICON', 'LITHIUM', 'BORON', 'MAGNESIUM'].includes(element.key)) {
                          adjustedWeight *= (0.8 + heightVal * heightInfluenceFactor);
                     } else if (['WATER_ICE'].includes(element.key)) {
                          adjustedWeight *= (0.5 + heightVal * heightInfluenceFactor * 1.5);
                     }
                     adjustedWeight = Math.max(0, adjustedWeight);
                     // --- End Modifiers ---

                     if (adjustedWeight > 0) {
                        localWeights.push({ key: element.key, adjustedWeight: adjustedWeight });
                        localTotalWeight += adjustedWeight;
                     }
                }

                // 4. Choose a potential element based on local weights
                let potentialElement = '';
                if (localTotalWeight > 0 && localWeights.length > 0) {
                    const cellChoicePRNG = this.prng.seedNew(`elem_${x}_${y}`);
                    let roll = cellChoicePRNG.random(0, localTotalWeight);
                    for (const localElement of localWeights) {
                        roll -= localElement.adjustedWeight;
                        if (roll <= 0) {
                            potentialElement = localElement.key;
                            break;
                        }
                    }
                    if (!potentialElement) potentialElement = localWeights[localWeights.length - 1].key;
                }

                // 5. *** NEW: Apply Sparsity Check ***
                let chosenElement = ''; // Default to no resource
                if (potentialElement) {
                    // Calculate threshold: Base threshold modified by local richness noise
                    // Higher richness noise means lower threshold (more likely to place resource)
                    const sparsityThreshold = baseSparsityThreshold * (1.0 - (localRichnessNoise + 1) / 2 * richnessFactor);
                    const sparsityRoll = this.prng.random(); // Use main PRNG for sparsity check? Or cellChoicePRNG? Let's use cellChoicePRNG.
                    // If roll *fails* (is higher than threshold), we *place* the resource
                    if (sparsityRoll > sparsityThreshold) {
                         chosenElement = potentialElement;
                    }
                    // else: sparsity roll succeeded (lower than threshold), cell remains empty ('')
                }
                // *** END Sparsity Check ***

                surfaceMap[y][x] = chosenElement; // Assign chosen element (or '')
            }
        }

        logger.info(`[SurfaceGen:${this.planetType}] Surface element map generated successfully.`);
        return surfaceMap;
    }

} // End SurfaceGenerator class