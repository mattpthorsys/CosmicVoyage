// src/generation/perlin.ts (Enhanced Logging)

import { CONFIG } from '../config';
import { logger } from '../utils/logger'; // Import the logger

// Define types for internal state
type GradientVector = { x: number; y: number }; // Represents a 2D gradient vector
type GradientCache = Record<string, GradientVector>; // Maps grid keys "vx,vy" to vectors
type MemoryCache = Record<string, number>; // Maps input keys "x,y" to output noise values

// Perlin noise implementation using an object literal module pattern
export const Perlin = {
    gradients: {} as GradientCache, // Cache for gradient vectors at integer grid points
    memory: {} as MemoryCache, // Cache for computed noise values at specific coordinates
    isSeeded: false, // Flag to track if seeded

    /** Generates a random 2D unit vector using Math.random(). */
    rand_vect(): GradientVector {
        // If using a seeded PRNG library like seedrandom, this will use the seeded Math.random
        const theta = Math.random() * 2 * Math.PI; // Random angle
        return { x: Math.cos(theta), y: Math.sin(theta) }; // Convert angle to unit vector components
    },

    /** Calculates the dot product between the distance vector (from point to grid corner) and the grid gradient vector. */
    dot_prod_grid(x: number, y: number, vx: number, vy: number): number {
        let g_vect: GradientVector; // Gradient vector for the grid point (vx, vy)
        const d_vect = { x: x - vx, y: y - vy }; // Distance vector from grid point to input point (x, y)
        const gridKey = `${vx},${vy}`; // Key for gradient cache

        // Check if gradient vector for this grid point is already cached
        if (this.gradients[gridKey]) { //
            g_vect = this.gradients[gridKey]; // Use cached vector
        } else {
            // If not cached, generate a new random gradient vector and cache it
            g_vect = this.rand_vect();
            this.gradients[gridKey] = g_vect; //
            // logger.debug(`[Perlin.dot_prod_grid] Generated new gradient for [${vx}, ${vy}]: {x:${g_vect.x.toFixed(2)}, y:${g_vect.y.toFixed(2)}}`); // Can be noisy
        }

        // Calculate and return the dot product
        return d_vect.x * g_vect.x + d_vect.y * g_vect.y; //
    },

    /** The smootherstep function (quintic interpolation) for smooth transitions. */
    smootherstep(x: number): number {
        // Formula: 6x^5 - 15x^4 + 10x^3
        return 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3; //
    },

    /** Interpolates between 'a' and 'b' using the smootherstep function based on factor 'x'. */
    interp(x: number, a: number, b: number): number {
        return a + this.smootherstep(x) * (b - a); // Linear interpolation modulated by smootherstep(x)
    },

    /** Seeds the Perlin noise generator using the game seed and resets caches. */
    seed(): void {
        logger.info(`[Perlin] Seeding Perlin noise generator...`);
        this.gradients = {}; // Clear gradient cache
        this.memory = {}; // Clear computed value cache
        this.isSeeded = false; // Mark as not seeded until seeding attempt completes

        // Optionally seed Math.random if seedrandom library is loaded globally
        // Using 'any' as Math object doesn't inherently know about seedrandom
        // Use optional chaining (?.) to avoid errors if seedrandom is not present.
        try {
            // Use a specific seed suffix for Perlin to differentiate from other PRNG uses
            const perlinSeed = CONFIG.SEED + '_perlin';
            (Math as any).seedrandom?.(perlinSeed); // Attempt to seed global Math.random
            logger.info(`[Perlin] Global Math.random seeded with: "${perlinSeed}" (if seedrandom loaded).`);
            this.isSeeded = true; // Mark as seeded
        } catch (e) {
             logger.warn(`[Perlin] Could not seed global Math.random (seedrandom library might be missing or failed). Using default Math.random.`, e);
             // isSeeded remains false or could be set based on fallback strategy
             this.isSeeded = true; // Assume Math.random() still works even if unseeded
        }
        logger.info("[Perlin] Caches cleared. Generator ready.");
    },

    /** Gets the Perlin noise value for a given 2D coordinate (x, y). Uses caching. */
    get(x: number, y: number): number {
        if (!this.isSeeded) {
             logger.warn("[Perlin.get] Attempted to get noise value before seeding. Seeding now with default.");
             this.seed(); // Attempt to seed if not done already
        }
        // Use cache key based on configured precision to avoid redundant calculations for close points
        const precision = Math.max(0, Math.min(10, CONFIG.NEBULA_CACHE_PRECISION)); // Clamp precision
        const memKey = `${x.toFixed(precision)},${y.toFixed(precision)}`; // Create cache key

        // Check memory cache first
        if (this.memory.hasOwnProperty(memKey)) { //
             // logger.debug(`[Perlin.get] Cache hit for key: ${memKey}`); // Very noisy
             return this.memory[memKey]; // Return cached value
        }

        // Calculate integer grid coordinates surrounding the point
        const xf = Math.floor(x); // Integer part of x
        const yf = Math.floor(y); // Integer part of y

        // Calculate dot products between distance vectors and gradient vectors for the 4 corners
        const tl = this.dot_prod_grid(x, y, xf,     yf);     // Top-left corner
        const tr = this.dot_prod_grid(x, y, xf + 1, yf);     // Top-right corner
        const bl = this.dot_prod_grid(x, y, xf,     yf + 1); // Bottom-left corner
        const br = this.dot_prod_grid(x, y, xf + 1, yf + 1); // Bottom-right corner

        // Interpolate horizontally
        const xt = this.interp(x - xf, tl, tr); // Interpolate between top-left and top-right
        const xb = this.interp(x - xf, bl, br); // Interpolate between bottom-left and bottom-right

        // Interpolate vertically
        const v = this.interp(y - yf, xt, xb); // Interpolate between the results of horizontal interpolation

        // Store the computed value in the memory cache
        this.memory[memKey] = v; //
        // logger.debug(`[Perlin.get] Cache miss for key: ${memKey}. Calculated value: ${v.toFixed(3)}`); // Can be noisy
        return v; // Return the calculated noise value
    }
};

// Initialize Perlin noise on load (call seed)
Perlin.seed(); // Logs internally