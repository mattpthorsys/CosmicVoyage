// src/rendering/colour.test.ts

import { describe, it, expect } from 'vitest';
import { hexToRgb, rgbToHex, interpolateColour, adjustBrightness, RgbColour } from './colour';

describe('Colour Utilities', () => {

    describe('hexToRgb', () => {
        it('should convert valid hex codes correctly', () => {
            expect(hexToRgb('#FFA500')).toEqual({ r: 255, g: 165, b: 0 });
            expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
            expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
            expect(hexToRgb('#FF00FF')).toEqual({ r: 255, g: 0, b: 255 });
            expect(hexToRgb('ffA500')).toEqual({ r: 255, g: 165, b: 0 }); // Without #
        });

        it('should return black for invalid hex codes', () => {
            expect(hexToRgb('invalid')).toEqual({ r: 0, g: 0, b: 0 });
            expect(hexToRgb('#123')).toEqual({ r: 0, g: 0, b: 0 }); // Short hex
            expect(hexToRgb('#GGHHII')).toEqual({ r: 0, g: 0, b: 0 }); // Invalid chars
            expect(hexToRgb(null)).toEqual({ r: 0, g: 0, b: 0 });
            expect(hexToRgb(undefined)).toEqual({ r: 0, g: 0, b: 0 });
            expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 });
        });
    });

    describe('rgbToHex', () => {
        it('should convert RGB values to hex correctly', () => {
            expect(rgbToHex(255, 165, 0)).toBe('#FFA500');
            expect(rgbToHex(0, 0, 0)).toBe('#000000');
            expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
            expect(rgbToHex(90, 30, 30)).toBe('#5A1E1E'); // Example from nebula colours
        });

        it('should clamp values outside the 0-255 range', () => {
            expect(rgbToHex(300, -10, 128)).toBe('#FF0080'); // Clamped r and g
            expect(rgbToHex(100.6, 50.2, 200.9)).toBe('#6532C9'); // Should round correctly
        });
    });

    describe('interpolateColour', () => {
        const black: RgbColour = { r: 0, g: 0, b: 0 };
        const white: RgbColour = { r: 255, g: 255, b: 255 };
        const red: RgbColour = { r: 255, g: 0, b: 0 };
        const blue: RgbColour = { r: 0, g: 0, b: 255 };

        it('should return the start colour at factor 0', () => {
            expect(interpolateColour(red, blue, 0)).toEqual(red);
        });

        it('should return the end colour at factor 1', () => {
            expect(interpolateColour(red, blue, 1)).toEqual(blue);
        });

        it('should return the midpoint colour at factor 0.5', () => {
            const midpoint = interpolateColour(black, white, 0.5);
            expect(midpoint.r).toBeCloseTo(127.5);
            expect(midpoint.g).toBeCloseTo(127.5);
            expect(midpoint.b).toBeCloseTo(127.5);

            const midRedBlue = interpolateColour(red, blue, 0.5);
            expect(midRedBlue.r).toBeCloseTo(127.5);
            expect(midRedBlue.g).toBe(0);
            expect(midRedBlue.b).toBeCloseTo(127.5);
        });

        it('should clamp the factor between 0 and 1', () => {
            expect(interpolateColour(black, white, -0.5)).toEqual(black); // Clamped to 0
            expect(interpolateColour(black, white, 1.5)).toEqual(white); // Clamped to 1
        });
    });

    describe('adjustBrightness', () => {
        const grey: RgbColour = { r: 128, g: 128, b: 128 };
        const darkRed: RgbColour = { r: 50, g: 0, b: 0 };

        it('should make the colour brighter with factor > 1', () => {
            const brighterGrey = adjustBrightness(grey, 1.5);
            expect(brighterGrey.r).toBeCloseTo(192);
            expect(brighterGrey.g).toBeCloseTo(192);
            expect(brighterGrey.b).toBeCloseTo(192);
        });

        it('should make the colour darker with factor < 1', () => {
            const darkerGrey = adjustBrightness(grey, 0.5);
            expect(darkerGrey.r).toBe(64);
            expect(darkerGrey.g).toBe(64);
            expect(darkerGrey.b).toBe(64);
        });

        it('should not change the colour with factor 1', () => {
            expect(adjustBrightness(grey, 1)).toEqual(grey);
        });

        it('should clamp results to 0-255', () => {
            const tooBright = adjustBrightness(grey, 3);
            expect(tooBright).toEqual({ r: 255, g: 255, b: 255 });

            const tooDark = adjustBrightness(darkRed, -1);
            expect(tooDark).toEqual({ r: 0, g: 0, b: 0 });

            const brightRed = adjustBrightness(darkRed, 10);
            expect(brightRed).toEqual({ r: 255, g: 0, b: 0 }); // r capped at 255
        });
    });

});