// src/generation/perlin.test.ts

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Perlin } from './perlin';
import { CONFIG } from '../config'; // Needed for seed

describe('Perlin Noise', () => {

    // Seed once before all tests in this suite
    // Note: This uses the CONFIG.SEED, ensuring consistency if Math.random is seeded
    beforeAll(() => {
        Perlin.seed(); // Seed using the configured seed
    });

    it('get() should return deterministic values for the same coordinates after seeding', () => {
        const x = 1.23 * CONFIG.NEBULA_SCALE;
        const y = 4.56 * CONFIG.NEBULA_SCALE;
        const val1 = Perlin.get(x, y);
        const val2 = Perlin.get(x, y); // Call again with same coords
        expect(val1).toBeDefined();
        expect(typeof val1).toBe('number');
        expect(val1).toEqual(val2); // Should be the same due to caching or determinism
    });

    it('get() should return different values for different coordinates', () => {
        // Use coordinates that will result in different cache keys after scaling and rounding
        const scale = CONFIG.NEBULA_SCALE;
        const val1 = Perlin.get(1 * scale, 1 * scale); // Key: "0.1,0.1"
        const val2 = Perlin.get(1 * scale, 12 * scale); // y = 0.6 -> Key: "0.1,0.6"
        const val3 = Perlin.get(12 * scale, 1 * scale); // x = 0.6 -> Key: "0.6,0.1"

        // Assertions should now pass assuming the Perlin implementation is correct
        expect(val1).not.toEqual(val2);
        expect(val1).not.toEqual(val3);
        expect(val2).not.toEqual(val3);
    });

     it('get() should utilize the memory cache', () => {
        const x = 10.1 * CONFIG.NEBULA_SCALE;
        const y = 20.2 * CONFIG.NEBULA_SCALE;
        const precision = Math.max(0, Math.min(10, CONFIG.NEBULA_CACHE_PRECISION));
        const cacheKey = `${x.toFixed(precision)},${y.toFixed(precision)}`;

        Perlin.memory = {}; // Clear cache for this test

        // Spy on the internal calculation function (dot_prod_grid is called by get)
        const dotProdSpy = vi.spyOn(Perlin, 'dot_prod_grid');

        // First call - should calculate and call dot_prod_grid
        const val1 = Perlin.get(x, y);
        expect(dotProdSpy).toHaveBeenCalled();
        expect(Perlin.memory).toHaveProperty(cacheKey); // Check if value was cached
        expect(Perlin.memory[cacheKey]).toBe(val1);

        dotProdSpy.mockClear(); // Clear previous calls

        // Second call - should hit cache and NOT call dot_prod_grid
        const val2 = Perlin.get(x, y);
        expect(dotProdSpy).not.toHaveBeenCalled();
        expect(val2).toBe(val1); // Should return the cached value

        // Restore original function
        dotProdSpy.mockRestore();
    });

     it('smootherstep() should return correct values at boundaries and midpoint', () => {
        expect(Perlin.smootherstep(0)).toBe(0);
        expect(Perlin.smootherstep(1)).toBe(1);
        expect(Perlin.smootherstep(0.5)).toBe(0.5); // Quintic interpolation property
    });

    it('interp() should return correct values at boundaries and midpoint', () => {
        const a = 10;
        const b = 20;
        expect(Perlin.interp(0, a, b)).toBe(a); // Factor 0 -> returns a
        expect(Perlin.interp(1, a, b)).toBe(b); // Factor 1 -> returns b
        // With smootherstep, factor 0.5 also results in midpoint
        expect(Perlin.interp(0.5, a, b)).toBe(a + 0.5 * (b - a)); // 15
    });

     it('seed() should clear caches', () => {
         const x = 5.5 * CONFIG.NEBULA_SCALE;
         const y = 6.6 * CONFIG.NEBULA_SCALE;
         Perlin.get(x, y); // Populate cache
         expect(Object.keys(Perlin.gradients).length).toBeGreaterThan(0);
         expect(Object.keys(Perlin.memory).length).toBeGreaterThan(0);

         Perlin.seed(); // Re-seed

         expect(Object.keys(Perlin.gradients).length).toBe(0);
         expect(Object.keys(Perlin.memory).length).toBe(0);
     });

});