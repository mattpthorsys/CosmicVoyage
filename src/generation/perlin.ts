// src/generation/perlin.ts (Refactored to Class)

import { PRNG } from '../utils/prng';
import { logger } from '../utils/logger';
import { CONFIG } from '@/config';

// Define types for internal state (remain the same)
type GradientVector = { x: number; y: number };
type GradientCache = Record<string, GradientVector>;
type MemoryCache = Record<string, number>;

export class PerlinNoise {
    private gradients: GradientCache = {}; // Cache for gradient vectors (instance specific)
    private memory: MemoryCache = {};    // Cache for computed noise values (instance specific)
    private prng: PRNG;                  // Instance-specific PRNG

    /**
     * Creates a new PerlinNoise generator instance.
     * @param seed A string seed used to initialize the internal PRNG.
     */
    constructor(seed: string) {
        logger.info(`[PerlinNoise] Initializing instance with seed: "${seed}"`);
        // Seed the instance-specific PRNG
        this.prng = new PRNG(seed);
        // Clear caches (done implicitly by creating new empty objects above)
        this.gradients = {};
        this.memory = {};
        logger.info(`[PerlinNoise:${seed}] Instance created and PRNG seeded.`);
    }

    /** Generates a random 2D unit vector using the instance's PRNG. */
    private rand_vect(): GradientVector {
        // Use the instance's PRNG now
        const theta = this.prng.next() * 2 * Math.PI; // Use deterministic PRNG
        return { x: Math.cos(theta), y: Math.sin(theta) };
    }

    /** Calculates the dot product (instance method). */
    private dot_prod_grid(x: number, y: number, vx: number, vy: number): number {
        let g_vect: GradientVector;
        const d_vect = { x: x - vx, y: y - vy };
        const gridKey = `${vx},${vy}`;

        // Use instance cache
        if (this.gradients[gridKey]) {
            g_vect = this.gradients[gridKey];
        } else {
            // Generate using instance method
            g_vect = this.rand_vect();
            this.gradients[gridKey] = g_vect; // Store in instance cache
        }
        return d_vect.x * g_vect.x + d_vect.y * g_vect.y;
    }

    /** Smootherstep function (remains the same, could be static). */
    private smootherstep(x: number): number {
        return 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
    }

    /** Interpolation function (remains the same, could be static). */
    private interp(x: number, a: number, b: number): number {
        return a + this.smootherstep(x) * (b - a);
    }

    /** Gets the Perlin noise value for (x, y) using instance state. */
    public get(x: number, y: number): number {
        // Note: Cache precision now comes from CONFIG when key is created
        const precision = Math.max(0, Math.min(10, CONFIG.NEBULA_CACHE_PRECISION)); // Ideally get from config if needed here
        const memKey = `${x.toFixed(precision)},${y.toFixed(precision)}`;

        // Use instance memory cache
        if (Object.hasOwn(this.memory, memKey)) {
            return this.memory[memKey];
        }

        const xf = Math.floor(x);
        const yf = Math.floor(y);

        // Call instance methods
        const tl = this.dot_prod_grid(x, y, xf,     yf);
        const tr = this.dot_prod_grid(x, y, xf + 1, yf);
        const bl = this.dot_prod_grid(x, y, xf,     yf + 1);
        const br = this.dot_prod_grid(x, y, xf + 1, yf + 1);

        const xt = this.interp(x - xf, tl, tr);
        const xb = this.interp(x - xf, bl, br);

        const v = this.interp(y - yf, xt, xb);

        // Store in instance memory cache
        this.memory[memKey] = v;
        return v;
    }

     /** Clears the internal caches for this instance. */
     public clearCache(): void {
         logger.info(`[PerlinNoise:${this.prng.getInitialSeed()}] Clearing caches.`);
         this.gradients = {};
         this.memory = {};
     }
}

// Remove the old static object export and the immediate call to Perlin.seed()
// export const Perlin = { ... };
// Perlin.seed();