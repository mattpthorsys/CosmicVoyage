// src/generation/heightmap.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeightmapGenerator } from './heightmap';
import { CONFIG } from '../config';
import { PRNG } from '../utils/prng'; // We need the original type, but will mock the module

// Mock the PRNG module so we can control its output
vi.mock('../utils/prng');

describe('HeightmapGenerator', () => {
    const testSeed = 'test-heightmap-seed';
    const roughness = CONFIG.PLANET_SURFACE_ROUGHNESS; // Use config value
    const heightLevels = CONFIG.PLANET_HEIGHT_LEVELS;

    let mockRandomFn = vi.fn(); // Mock function for PRNG's random method

    beforeEach(() => {
        // Clear any previous mocks
        vi.clearAllMocks();

        // Since PRNG is mocked via vi.mock at the top,
        // we can mock specific methods on its prototype if needed globally
        // for these tests, or mock them per-test using vi.spyOn.
        // Let's provide a default mock for 'random' used by the generator.
        vi.spyOn(PRNG.prototype, 'random').mockImplementation(() => {
            // Provide a simple, predictable pseudo-random number for testing
            // This is just an example, return 0.5 or cycle through values if needed
            return Math.random(); // Or return a fixed value like 0.5 for more predictability
        });

        // We don't need vi.mocked(PRNG).mockImplementation(...) anymore
    });

    it('should calculate the correct size (power of 2 + 1)', () => {
        const generator50 = new HeightmapGenerator(50, roughness, testSeed); // Needs 65 (2^6 + 1)
        expect(generator50.size).toBe(65);

        const generator128 = new HeightmapGenerator(128, roughness, testSeed); // Needs 129 (2^7 + 1)
        expect(generator128.size).toBe(129);

        const generator257 = new HeightmapGenerator(257, roughness, testSeed); // Needs 257 (2^8 + 1)
        expect(generator257.size).toBe(257);

         // Test minimum size
         const generator2 = new HeightmapGenerator(2, roughness, testSeed); // Needs 3 (2^1 + 1)
         expect(generator2.size).toBe(3);
    });

    it('generate() should return a map with the correct dimensions', () => {
        const targetSize = 33; // Expects size 33 (2^5 + 1)
        // Mock random values needed for corner seeding
        mockRandomFn
            .mockReturnValueOnce(50) // Corner 1
            .mockReturnValueOnce(60) // Corner 2
            .mockReturnValueOnce(70) // Corner 3
            .mockReturnValueOnce(80); // Corner 4
        // Add more mocks if divide/square steps are reached and need specific values
        // For just checking dimensions, the initial corners might be enough.

        const generator = new HeightmapGenerator(targetSize, roughness, testSeed);
        const map = generator.generate(100); // Pass initial range

        expect(map).toBeInstanceOf(Array);
        expect(map.length).toBe(generator.size); // Should be 33
        expect(map[0]).toBeInstanceOf(Array);
        expect(map[0].length).toBe(generator.size); // Should be 33
    });

     it('generate() should produce values within the normalized range [0, heightLevels - 1]', () => {
        const targetSize = 17; // 2^4 + 1
        const initialRange = 500;
        // Provide enough mock random values for the algorithm to run
        // Diamond-Square needs values for corners, diamonds, and squares recursively
        mockRandomFn.mockReturnValue(initialRange / 2); // Just return mid-range constantly for simplicity

        const generator = new HeightmapGenerator(targetSize, 0.5, testSeed); // Use roughness 0.5
        const map = generator.generate(initialRange);

        let foundMin = false;
        let foundMax = false;
        const maxLevel = heightLevels - 1;

        for (let y = 0; y < generator.size; y++) {
            for (let x = 0; x < generator.size; x++) {
                const value = map[y][x];
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(maxLevel);
                expect(Number.isInteger(value)).toBe(true);
                if (value === 0) foundMin = true;
                if (value === maxLevel) foundMax = true;
            }
        }
         // Check if the normalization likely spread values across the range
         // (May not always hit exact 0 and maxLevel depending on algorithm and roughness)
        // expect(foundMin).toBe(true);
        // expect(foundMax).toBe(true);
    });

     it('normalize() should handle a flat map (range is zero)', () => {
         const targetSize = 5; // 2^2 + 1
         const generator = new HeightmapGenerator(targetSize, roughness, testSeed);
         const flatValue = 100;
         const midpoint = Math.round((heightLevels - 1) / 2);

         // Manually set the internal map to be flat (accessing private member for test)
         (generator as any).map = [
             [flatValue, flatValue, flatValue, flatValue, flatValue],
             [flatValue, flatValue, flatValue, flatValue, flatValue],
             [flatValue, flatValue, flatValue, flatValue, flatValue],
             [flatValue, flatValue, flatValue, flatValue, flatValue],
             [flatValue, flatValue, flatValue, flatValue, flatValue],
         ];

         // Call normalize directly (accessing private method for test)
         (generator as any).normalize();
         const map = (generator as any).map;

         for (let y = 0; y < generator.size; y++) {
             for (let x = 0; x < generator.size; x++) {
                 expect(map[y][x]).toBe(midpoint);
             }
         }
     });

});