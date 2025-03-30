// src/generation/heightmap.ts (Enhanced Logging)

import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { logger } from '../utils/logger'; // Import the logger

/**
 * Generates a heightmap using the Diamond-Square (Midpoint Displacement) algorithm.
 * Ensures the map size is a power of 2 plus 1.
 */
export class HeightmapGenerator {
    readonly size: number; // Actual size used (power of 2 + 1)
    private readonly max: number; // Maximum index (size - 1)
    private map: number[][]; // The heightmap grid
    private readonly roughness: number; // Controls the roughness of the terrain
    private prng: PRNG; // Local PRNG for this generator instance

    constructor(targetSize: number, roughness: number, seed: string) {
        logger.debug(`[HeightmapGen] Initializing for target size ${targetSize}, roughness ${roughness}, seed "${seed}"...`);
        // Calculate the actual size needed (must be power of 2 + 1 >= targetSize)
        let power = 0;
        while ((1 << power) + 1 < targetSize) { // Find the smallest power of 2
            power++; //
        }
        this.size = (1 << power) + 1; // Calculate size = 2^power + 1
        if (this.size < 3) this.size = 3; // Minimum valid size is 3x3 for the algorithm

        // Use logger instead of console.log
        logger.info(`[HeightmapGen] Using size ${this.size}x${this.size} (Target was ${targetSize}).`); //
        this.max = this.size - 1; // Max index

        // Initialize the map grid
        this.map = this.createGrid(this.size); // Logs internally if needed
        this.roughness = Math.max(0, Math.min(1, roughness)); // Clamp roughness between 0 and 1
        // Seed a local PRNG specific to this heightmap instance
        this.prng = new PRNG(seed + "_heightmap"); //
        logger.debug(`[HeightmapGen] Local PRNG seeded with: ${this.prng.getInitialSeed()}`);
    }

    /** Creates an empty 2D array (grid) of the specified size. */
    private createGrid(size: number): number[][] {
        logger.debug(`[HeightmapGen] Creating internal grid of size ${size}x${size}.`);
        if (size <= 0) {
             logger.error(`[HeightmapGen] Attempted to create grid with invalid size: ${size}`);
             return [];
        }
        const grid: number[][] = new Array(size); //
        for (let i = 0; i < size; i++) {
            grid[i] = new Array(size).fill(0); // Initialize with 0
        }
        return grid; //
    }

    /** Gets the height value at (x, y), wrapping around the edges (toroidal). */
    private get(x: number, y: number): number {
        // Ensure coordinates are integers and wrap around using modulo
        // Adding this.size before modulo handles negative results correctly
        const wrappedX = (Math.round(x) % this.size + this.size) % this.size; //
        const wrappedY = (Math.round(y) % this.size + this.size) % this.size; //
        // logger.debug(`[HeightmapGen.get] Coords (${x},${y}) -> Wrapped (${wrappedX},${wrappedY})`); // Very Noisy
        try {
             return this.map[wrappedY][wrappedX]; //
        } catch (e) {
             logger.error(`[HeightmapGen.get] Error accessing map at wrapped coords [${wrappedX}, ${wrappedY}] (original: [${x}, ${y}]). Size: ${this.size}`, e);
             return 0; // Return default value on error
        }
    }

    /** Sets the height value at (x, y) if within map bounds. */
    private set(x: number, y: number, val: number): void {
        const intX = Math.round(x); //
        const intY = Math.round(y); //
        // Check bounds (no wrapping for set)
        if (intX >= 0 && intX <= this.max && intY >= 0 && intY <= this.max) { //
             // logger.debug(`[HeightmapGen.set] Setting [${intX}, ${intY}] = ${val.toFixed(2)}`); // Very Noisy
             try {
                this.map[intY][intX] = val; //
             } catch (e) {
                 logger.error(`[HeightmapGen.set] Error setting map at valid coords [${intX}, ${intY}]. Size: ${this.size}`, e);
             }
        } else {
             logger.warn(`[HeightmapGen.set] Attempted to set value out of bounds: [${intX}, ${intY}] (Max index: ${this.max})`);
        }
    }

    /** Generates the heightmap using the Diamond-Square algorithm. */
    generate(initialValueRange: number = 128): number[][] {
        logger.info(`[HeightmapGen] Starting Diamond-Square generation... (Initial Range: +/- ${initialValueRange})`);
        // Seed the corners with initial random values
        this.set(0, 0, this.prng.random(1, initialValueRange)); //
        this.set(this.max, 0, this.prng.random(1, initialValueRange)); //
        this.set(0, this.max, this.prng.random(1, initialValueRange)); //
        this.set(this.max, this.max, this.prng.random(1, initialValueRange)); //
        logger.debug(`[HeightmapGen] Corners seeded.`);

        // Start the recursive division process from the full map size
        this.divide(this.max, initialValueRange); // Logs recursive steps

        // Normalize the heightmap values to the configured range (e.g., 0 to CONFIG.PLANET_HEIGHT_LEVELS - 1)
        this.normalize(); // Logs normalization process

        logger.info(`[HeightmapGen] Diamond-Square generation complete.`);
        return this.map; // Return the generated map
    }

    /** Recursive function for the Diamond-Square algorithm. */
    private divide(step: number, range: number): void {
        const half = step / 2; // Calculate half the current step size
        logger.debug(`[HeightmapGen.divide] Step: ${step}, Half: ${half}, Range: +/- ${range.toFixed(2)}`);
        if (half < 1) { // Base case: Stop when step size is too small
             logger.debug(`[HeightmapGen.divide] Base case reached (half < 1).`);
             return;
        }

        // Diamond step: Calculate center points of squares
        logger.debug(`[HeightmapGen.divide] Diamond Step starting...`);
        for (let y = half; y < this.max; y += step) {
            for (let x = half; x < this.max; x += step) {
                this.diamond(x, y, half, this.prng.random(-range, range)); // Calculate diamond point
            }
        }
        logger.debug(`[HeightmapGen.divide] Diamond Step complete.`);

        // Square step: Calculate center points of diamonds (edges)
        logger.debug(`[HeightmapGen.divide] Square Step starting...`);
        for (let y = 0; y <= this.max; y += half) { // Iterate through all potential square center rows
            // Stagger the starting X coordinate based on the row to hit diamond centers
            for (let x = (y + half) % step; x <= this.max; x += step) {
                this.square(x, y, half, this.prng.random(-range, range)); // Calculate square point
            }
        }
        logger.debug(`[HeightmapGen.divide] Square Step complete.`);

        // Reduce the random range for the next level of detail, scaled by roughness
        // Ensure range doesn't drop below 1 to maintain some variation
        const nextRange = Math.max(1, range * this.roughness); //
        // Recurse with smaller step size and reduced range
        this.divide(half, nextRange); //
    }

    /** Performs the Diamond step: Calculates midpoint value based on four corner values. */
    private diamond(x: number, y: number, size: number, offset: number): void {
        // logger.debug(` -> Diamond at [${x},${y}], size ${size}, offset ${offset.toFixed(2)}`); // Noisy
        const avg = this.average([
            this.get(x - size, y - size), // Top-left corner
            this.get(x + size, y - size), // Top-right corner
            this.get(x - size, y + size), // Bottom-left corner
            this.get(x + size, y + size)  // Bottom-right corner
        ]);
        this.set(x, y, avg + offset); // Set midpoint value = average + random offset
    }

    /** Performs the Square step: Calculates midpoint value based on four adjacent diamond values. */
    private square(x: number, y: number, size: number, offset: number): void {
        // logger.debug(` -> Square at [${x},${y}], size ${size}, offset ${offset.toFixed(2)}`); // Noisy
        const avg = this.average([
            this.get(x, y - size), // Top neighbor
            this.get(x + size, y), // Right neighbor
            this.get(x, y + size), // Bottom neighbor
            this.get(x - size, y)  // Left neighbor
        ]);
        this.set(x, y, avg + offset); // Set midpoint value = average + random offset
    }

    /** Calculates the average of valid numbers in an array, ignoring non-finite values. */
    private average(values: number[]): number {
        // Filter out any non-numeric or non-finite values (like NaN, Infinity)
        const valid = values.filter(v => typeof v === 'number' && isFinite(v)); //
        if (valid.length === 0) {
             // logger.debug(`[HeightmapGen.average] No valid values found in [${values.join(', ')}]. Returning 0.`); // Potentially noisy if map edges involved
             return 0; // Return 0 if no valid neighbors found
        }
        const total = valid.reduce((sum, val) => sum + val, 0); // Sum valid values
        const avg = total / valid.length; // Calculate average
        // logger.debug(`[HeightmapGen.average] Input: [${values.join(', ')}], Valid: [${valid.join(', ')}], Avg: ${avg.toFixed(2)}`); // Noisy
        return avg; //
    }

    /** Normalizes the heightmap values to fit within the configured range [0, PLANET_HEIGHT_LEVELS - 1]. */
    private normalize(): void {
        logger.info(`[HeightmapGen] Normalizing heightmap values to range [0, ${CONFIG.PLANET_HEIGHT_LEVELS - 1}]...`);
        let min = Infinity, max = -Infinity; // Initialize min/max

        // Find the actual min and max height values currently in the map
        for (let y = 0; y <= this.max; y++) {
            for (let x = 0; x <= this.max; x++) {
                const val = this.map[y][x]; //
                if (val < min) min = val; // Update min
                if (val > max) max = val; // Update max
            }
        }
        logger.debug(`[HeightmapGen.normalize] Found Min: ${min.toFixed(2)}, Max: ${max.toFixed(2)}`);

        const range = max - min; // Calculate the actual range of values
        const targetMax = CONFIG.PLANET_HEIGHT_LEVELS - 1; // Target maximum value (e.g., 255)

        // If the map is flat (range is 0), set all values to the middle level
        if (range === 0 || !Number.isFinite(range)) { // Also check if range is NaN/Infinity
             logger.warn(`[HeightmapGen.normalize] Map range is zero or invalid (${range}). Setting all values to midpoint.`);
             const value = Math.round(targetMax / 2); // Set to middle height level
             for (let y = 0; y <= this.max; y++) {
                for (let x = 0; x <= this.max; x++) this.map[y][x] = value; //
             }
             return; // Exit early
        }

        // Normalize each value: map [min, max] to [0, targetMax]
        logger.debug(`[HeightmapGen.normalize] Normalizing values using range ${range.toFixed(2)}...`);
        for (let y = 0; y <= this.max; y++) {
            for (let x = 0; x <= this.max; x++) {
                // Formula: normalized = ((value - min) / range) * targetMax
                this.map[y][x] = Math.round(((this.map[y][x] - min) / range) * targetMax); //
            }
        }
        logger.info(`[HeightmapGen] Normalization complete.`);
    }

} // End HeightmapGenerator class