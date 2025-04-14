// src/entities/planet/surface_colour_generator.ts
import { PLANET_TYPES } from '../../constants';
import { CONFIG } from '../../config';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour } from '../../rendering/colour';
import { logger } from '../../utils/logger';

/**
 * Generates or retrieves the RGB palette cache for a given planet type.
 * @param planetType - The type string of the planet.
 * @returns An array of RgbColour objects, or null on error.
 */
export function generateRgbPaletteCache(planetType: string): RgbColour[] | null {
    logger.debug(`[SurfColourGen:${planetType}] Generating/retrieving RGB palette cache...`);
    const planetPaletteHex = PLANET_TYPES[planetType]?.colours;
    if (!planetPaletteHex || planetPaletteHex.length === 0) {
        logger.error(`[SurfColourGen:${planetType}] Planet visual data (colour palette) missing or empty.`);
        return null;
    }
    try {
        const cache = planetPaletteHex.map(hex => hexToRgb(hex));
        logger.debug(`[SurfColourGen:${planetType}] RGB palette cache ready (${cache.length} colours).`);
        return cache;
    } catch (e) {
        logger.error(`[SurfColourGen:${planetType}] Failed to parse colour palette: ${e}`);
        return null;
    }
}

/**
 * Generates the array of hex colour strings for each height level based on a palette.
 * @param planetType - The type string of the planet (for logging).
 * @param rgbPalette - The array of RgbColour objects for the palette.
 * @returns An array of hex colour strings, or null on error.
 */
export function generateHeightLevelColors(planetType: string, rgbPalette: RgbColour[]): string[] | null {
    if (!rgbPalette || rgbPalette.length < 1) {
        logger.error(`[SurfColourGen:${planetType}] Cannot generate height colours: RGB palette cache is invalid or empty.`);
        return null;
    }

    logger.info(`[SurfColourGen:${planetType}] Generating height level colours...`);
    const numPaletteColours = rgbPalette.length;
    const heightLevelColors = new Array<string>(CONFIG.PLANET_HEIGHT_LEVELS);
    logger.debug(`[SurfColourGen:${planetType}] Interpolating ${numPaletteColours} palette colours across ${CONFIG.PLANET_HEIGHT_LEVELS} height levels...`);

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
             logger.warn(`[SurfColourGen:${planetType}] Height colour generation encountered invalid palette indices (${index1}, ${index2}) at height ${h}. Using fallback.`);
             terrainRgb = rgbPalette[index1]; // Fallback
        }
        heightLevelColors[h] = rgbToHex(terrainRgb.r, terrainRgb.g, terrainRgb.b);
    }
    logger.info(`[SurfColourGen:${planetType}] Height level colours generated successfully.`);
    return heightLevelColors;
}