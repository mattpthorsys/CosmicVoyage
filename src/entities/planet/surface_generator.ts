// src/generation/surface_generator.ts

import { HeightmapGenerator } from '../../generation/heightmap';
import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { PLANET_TYPES } from '../../constants';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour } from '../../rendering/colour';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet'; // Import type

// Interface for the generated surface data package
export interface SurfaceData {
    heightmap: number[][] | null;
    heightLevelColors: string[] | null;
    rgbPaletteCache: RgbColour[] | null;
}

/** Generates surface data (heightmap, colors, palettes) for a planet. */
export class SurfaceGenerator {
    private prng: PRNG;
    private planetType: string;
    private mapSeed: string;
    private atmosphere: Atmosphere; // Needed for crater check

    constructor(planetType: string, mapSeed: string, prng: PRNG, atmosphere: Atmosphere) {
        this.planetType = planetType;
        this.mapSeed = mapSeed;
        this.prng = prng; // Use the planet-specific PRNG
        this.atmosphere = atmosphere;
        logger.debug(`[SurfaceGen] Initialized for Type: ${planetType}, Seed: ${mapSeed}`);
    }

    /** Generates all necessary surface data based on planet type. */
    generateSurfaceData(): SurfaceData {
        logger.info(`[SurfaceGen:${this.planetType}] Generating surface data...`);
        let heightmap: number[][] | null = null;
        let heightLevelColors: string[] | null = null;
        let rgbPaletteCache: RgbColour[] | null = null;

        // --- Handle Gas Giants/Ice Giants (Palette Cache Only) ---
        if (this.planetType === 'GasGiant' || this.planetType === 'IceGiant') {
            rgbPaletteCache = this.generateRgbPaletteCache(); // Logs internally
            logger.info(`[SurfaceGen:${this.planetType}] Generated RGB palette cache.`);
        }
        // --- Handle Solid Planets (Heightmap & Colors) ---
        else {
            heightmap = this.generateHeightmap(); // Logs internally
            if (heightmap) {
                // Add craters for specific types
                if (this.planetType === 'Lunar' || (this.planetType === 'Rock' && this.atmosphere.density === 'None')) {
                    heightmap = this.addCratersToHeightmap(heightmap); // Modifies map in place, logs internally
                }
                // Generate colors based on the final heightmap
                rgbPaletteCache = this.generateRgbPaletteCache(); // Need this for color generation
                if(rgbPaletteCache) {
                    heightLevelColors = this.generateHeightLevelColors(rgbPaletteCache); // Logs internally
                    logger.info(`[SurfaceGen:${this.planetType}] Generated heightmap (${heightmap.length}x${heightmap.length}) and height level colors.`);
                } else {
                     logger.error(`[SurfaceGen:${this.planetType}] Failed to generate RGB palette, cannot generate height level colors.`);
                     // Heightmap was generated, but colors failed. Decide how to handle - return partial?
                     // For now, nullify colors if palette fails.
                     heightLevelColors = null;
                }
            } else {
                 logger.error(`[SurfaceGen:${this.planetType}] Heightmap generation failed. Cannot generate colors.`);
                 // Ensure colors are null if map failed
                 heightLevelColors = null;
                 rgbPaletteCache = null;
            }
        }

        return { heightmap, heightLevelColors, rgbPaletteCache };
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
        const mapSize = heightmap.length; if (mapSize <= 0) return heightmap;

        logger.info(`[SurfaceGen:${this.planetType}] Adding impact craters...`);
        const craterPRNG = this.prng.seedNew('craters');
        const numCraters = craterPRNG.randomInt(Math.floor(mapSize / 15), Math.floor(mapSize / 5));
        logger.debug(`[SurfaceGen:${this.planetType}] Generating ${numCraters} craters.`);

        for (let i = 0; i < numCraters; i++) {
            const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10)));
            const cx = craterPRNG.randomInt(0, mapSize - 1);
            const cy = craterPRNG.randomInt(0, mapSize - 1);
            const depthFactor = craterPRNG.random(0.5, 2.0);
            const rimFactor = craterPRNG.random(0.1, 0.3);
            const maxDepth = r * depthFactor;
            const rimHeight = maxDepth * rimFactor;

            const startY = Math.max(0, cy - r - 2);
            const endY = Math.min(mapSize - 1, cy + r + 2);
            const startX = Math.max(0, cx - r - 2);
            const endX = Math.min(mapSize - 1, cx + r + 2);

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const dx = x - cx;
                    const dy = y - cy;
                    const distSq = dx * dx + dy * dy;
                    const radiusSq = r * r;
                    if (distSq <= (r + 1) ** 2) {
                        const dist = Math.sqrt(distSq);
                        const currentH = heightmap[y][x];
                        let deltaH = 0;
                        if (dist < r) deltaH -= maxDepth * ((Math.cos(dist / r * Math.PI) + 1) / 2); // Depression
                        const rimPeakDist = r * 0.85;
                        const rimWidth = r * 0.3;
                        if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) {
                            deltaH += rimHeight * ((Math.cos((dist - rimPeakDist) / rimWidth * Math.PI) + 1) / 2); // Rim
                        }
                        heightmap[y][x] = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(currentH + deltaH)));
                    }
                }
            }
        }
        logger.info(`[SurfaceGen:${this.planetType}] Finished adding ${numCraters} craters.`);
        return heightmap; // Return the modified map
    }


    /** Generates or retrieves the RGB palette cache for the planet type. */
    private generateRgbPaletteCache(): RgbColour[] | null {
         logger.debug(`[SurfaceGen:${this.planetType}] Generating/retrieving RGB palette cache...`);
         const planetPaletteHex = PLANET_TYPES[this.planetType]?.colors;
         if (!planetPaletteHex || planetPaletteHex.length === 0) {
             logger.error(`[SurfaceGen:${this.planetType}] Planet visual data (color palette) missing or empty.`);
             return null;
         }
         try {
             const cache = planetPaletteHex.map(hex => hexToRgb(hex));
             logger.debug(`[SurfaceGen:${this.planetType}] RGB palette cache ready (${cache.length} colors).`);
             return cache;
         } catch (e) {
             logger.error(`[SurfaceGen:${this.planetType}] Failed to parse color palette:`, e);
             return null;
         }
     }

    /** Generates the array of hex color strings for each height level. */
    private generateHeightLevelColors(rgbPalette: RgbColour[]): string[] | null {
        if (!rgbPalette || rgbPalette.length < 1) {
            logger.error(`[SurfaceGen:${this.planetType}] Cannot generate height colors: RGB palette cache is invalid or empty.`);
            return null;
        }

        logger.info(`[SurfaceGen:${this.planetType}] Generating height level colors...`);
        const numPaletteColours = rgbPalette.length;
        const heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS);
        logger.debug(`[SurfaceGen:${this.planetType}] Interpolating ${numPaletteColours} palette colors across ${CONFIG.PLANET_HEIGHT_LEVELS} height levels...`);

        for (let h = 0; h < CONFIG.PLANET_HEIGHT_LEVELS; h++) {
            const colourIndexFloat = (h / (CONFIG.PLANET_HEIGHT_LEVELS - 1)) * (numPaletteColours - 1);
            const index1 = Math.max(0, Math.min(numPaletteColours - 1, Math.floor(colourIndexFloat)));
            const index2 = Math.min(numPaletteColours - 1, index1 + 1);
            const factor = colourIndexFloat - index1;

            let terrainRgb: RgbColour;
            if (index1 === index2 || factor === 0) {
                 terrainRgb = rgbPalette[index1];
            } else if (index1 < numPaletteColours && index2 < numPaletteColours) {
                terrainRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor);
            } else {
                 logger.warn(`[SurfaceGen:${this.planetType}] Height color generation encountered invalid palette indices (${index1}, ${index2}) at height ${h}. Using fallback.`);
                 terrainRgb = rgbPalette[index1]; // Fallback
            }
            heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b);
        }
        logger.info(`[SurfaceGen:${this.planetType}] Height level colors generated successfully.`);
        return heightLevelColors;
    }
}