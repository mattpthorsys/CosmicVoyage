// src/rendering/colour.ts (Australian English spelling)

/** Simple interface for an RGB colour object. */
export interface RgbColour {
    r: number;
    g: number;
    b: number;
}

/** Default black colour object. */
const defaultRgb: Readonly<RgbColour> = { r: 0, g: 0, b: 0 };

/**
 * Converts a HEX colour string (#RRGGBB) to an RGB object.
 * Returns black ({ r: 0, g: 0, b: 0 }) if the input is invalid or null/undefined.
 * @param hex The hex colour string (e.g., "#FFA500").
 * @returns An RgbColour object.
 */
export function hexToRgb(hex: string | null | undefined): RgbColour {
    if (!hex) {
        return { ...defaultRgb }; // Return a mutable copy
    }
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { ...defaultRgb }; // Return a mutable copy on failure
}

/**
 * Converts RGB components to a HEX colour string (#RRGGBB).
 * Clamps values to the valid 0-255 range.
 * @param r Red component (0-255).
 * @param g Green component (0-255).
 * @param b Blue component (0-255).
 * @returns The hex colour string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
    // Clamp and round values
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    // Convert to hex
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

/**
 * Linearly interpolates between two RGB colours.
 * @param colour1 Starting RgbColour object.
 * @param colour2 Ending RgbColour object.
 * @param factor Interpolation factor (0.0 to 1.0). Clamped to range.
 * @returns The interpolated RgbColour object.
 */
export function interpolateColour(colour1: RgbColour, colour2: RgbColour, factor: number): RgbColour {
    factor = Math.max(0, Math.min(1, factor)); // Clamp factor
    const r = colour1.r + (colour2.r - colour1.r) * factor;
    const g = colour1.g + (colour2.g - colour1.g) * factor;
    const b = colour1.b + (colour2.b - colour1.b) * factor;
    return { r, g, b };
}

/**
 * Adjusts the brightness of an RGB colour by multiplying its components.
 * Clamps values to the valid 0-255 range.
 * @param colour The RgbColour object to adjust.
 * @param factor Brightness multiplier (e.g., 0.5 for darker, 1.5 for brighter).
 * @returns The adjusted RgbColour object.
 */
export function adjustBrightness(colour: RgbColour, factor: number): RgbColour {
    const r = Math.max(0, Math.min(255, colour.r * factor));
    const g = Math.max(0, Math.min(255, colour.g * factor));
    const b = Math.max(0, Math.min(255, colour.b * factor));
    return { r, g, b };
}