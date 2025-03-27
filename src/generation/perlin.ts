// src/generation/perlin.ts

import { CONFIG } from '../config';

// Define types for internal state
type GradientVector = { x: number; y: number };
type GradientCache = Record<string, GradientVector>; // Map grid keys "vx,vy" to vectors
type MemoryCache = Record<string, number>; // Map input keys "x,y" to output values

export const Perlin = {
    gradients: {} as GradientCache,
    memory: {} as MemoryCache,

    /** Generates a random 2D unit vector. */
    rand_vect(): GradientVector {
        const theta = Math.random() * 2 * Math.PI;
        return { x: Math.cos(theta), y: Math.sin(theta) };
    },

    /** Calculates the dot product between the distance vector and the grid gradient vector. */
    dot_prod_grid(x: number, y: number, vx: number, vy: number): number {
        let g_vect: GradientVector;
        const d_vect = { x: x - vx, y: y - vy };
        const gridKey = `${vx},${vy}`;

        if (this.gradients[gridKey]) {
            g_vect = this.gradients[gridKey];
        } else {
            g_vect = this.rand_vect();
            this.gradients[gridKey] = g_vect;
        }
        return d_vect.x * g_vect.x + d_vect.y * g_vect.y;
    },

    /** The smootherstep function (quintic interpolation). */
    smootherstep(x: number): number {
        return 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
    },

    /** Interpolates between a and b using the smootherstep function. */
    interp(x: number, a: number, b: number): number {
        return a + this.smootherstep(x) * (b - a);
    },

    /** Seeds the Perlin noise generator and resets caches. */
    seed(): void {
        this.gradients = {};
        this.memory = {};
        // Optionally seed Math.random if seedrandom library is loaded globally
        // Using 'any' as Math object doesn't inherently know about seedrandom
        // Use optional chaining (?.) to avoid errors if seedrandom is not present.
        (Math as any).seedrandom?.(CONFIG.SEED + '_perlin');
        console.log("Perlin noise seeded.");
    },

    /** Gets the Perlin noise value for a given 2D coordinate (x, y). Uses caching. */
    get(x: number, y: number): number {
        // Use cache key based on configured precision
        const memKey = `${x.toFixed(CONFIG.NEBULA_CACHE_PRECISION)},${y.toFixed(CONFIG.NEBULA_CACHE_PRECISION)}`;
        if (this.memory.hasOwnProperty(memKey)) {
            return this.memory[memKey];
        }

        const xf = Math.floor(x);
        const yf = Math.floor(y);

        // Interpolation corners
        const tl = this.dot_prod_grid(x, y, xf, yf);
        const tr = this.dot_prod_grid(x, y, xf + 1, yf);
        const bl = this.dot_prod_grid(x, y, xf, yf + 1);
        const br = this.dot_prod_grid(x, y, xf + 1, yf + 1);

        // Interpolate
        const xt = this.interp(x - xf, tl, tr);
        const xb = this.interp(x - xf, bl, br);
        const v = this.interp(y - yf, xt, xb);

        // Store in cache
        this.memory[memKey] = v;
        return v;
    }
};

// Initialize Perlin noise on load
Perlin.seed();