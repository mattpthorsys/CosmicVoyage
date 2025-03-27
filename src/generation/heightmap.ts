// src/generation/heightmap.ts

import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';

/**
 * Generates a heightmap using the Diamond-Square (Midpoint Displacement) algorithm.
 * Ensures the map size is a power of 2 plus 1.
 */
export class HeightmapGenerator {
    readonly size: number; // Actual size used (power of 2 + 1)
    private readonly max: number; // Maximum index (size - 1)
    private map: number[][]; // The heightmap grid
    private readonly roughness: number;
    private prng: PRNG;

    constructor(targetSize: number, roughness: number, seed: string) {
        // Calculate the actual size needed (power of 2 + 1 >= targetSize)
        let power = 0;
        while ((1 << power) + 1 < targetSize) {
            power++;
        }
        this.size = (1 << power) + 1;
        if (this.size < 3) this.size = 3; // Minimum size

        console.log(`Heightmap using size ${this.size}x${this.size} (requested ${targetSize})`);

        this.max = this.size - 1;
        this.map = this.createGrid(this.size);
        this.roughness = roughness;
        this.prng = new PRNG(seed + "_heightmap"); // Seed a local PRNG
    }

    /** Creates an empty 2D array (grid) of the specified size. */
    private createGrid(size: number): number[][] {
        const grid: number[][] = new Array(size);
        for (let i = 0; i < size; i++) {
            grid[i] = new Array(size).fill(0);
        }
        return grid;
    }

    /** Gets the height value at (x, y), wrapping around the edges. */
    private get(x: number, y: number): number {
        // Ensure coordinates are integers and wrap around using modulo
        x = (Math.round(x) % this.size + this.size) % this.size;
        y = (Math.round(y) % this.size + this.size) % this.size;
        return this.map[y][x];
    }

    /** Sets the height value at (x, y) if within bounds. */
    private set(x: number, y: number, val: number): void {
        x = Math.round(x);
        y = Math.round(y);
        if (x >= 0 && x <= this.max && y >= 0 && y <= this.max) {
            this.map[y][x] = val;
        }
    }

    /** Generates the heightmap using the Diamond-Square algorithm. */
    generate(initialValueRange: number = 128): number[][] {
        // Seed the corners
        this.set(0, 0, this.prng.random(1, initialValueRange));
        this.set(this.max, 0, this.prng.random(1, initialValueRange));
        this.set(0, this.max, this.prng.random(1, initialValueRange));
        this.set(this.max, this.max, this.prng.random(1, initialValueRange));

        // Start the recursive division process
        this.divide(this.max, initialValueRange);

        // Normalize the heightmap values to the configured range (e.g., 0-255)
        this.normalize();

        return this.map;
    }

    /** Recursive function for the Diamond-Square algorithm. */
    private divide(step: number, range: number): void {
        const half = step / 2;
        if (half < 1) return; // Base case

        // Diamond step
        for (let y = half; y < this.max; y += step) {
            for (let x = half; x < this.max; x += step) {
                this.diamond(x, y, half, this.prng.random(-range, range));
            }
        }

        // Square step
        for (let y = 0; y <= this.max; y += half) {
            for (let x = (y + half) % step; x <= this.max; x += step) {
                this.square(x, y, half, this.prng.random(-range, range));
            }
        }

        // Reduce the random range and recurse
        const nextRange = Math.max(1, range * this.roughness);
        this.divide(half, nextRange);
    }

    /** Performs the Diamond step of the algorithm. */
    private diamond(x: number, y: number, size: number, offset: number): void {
        const avg = this.average([
            this.get(x - size, y - size), // Top-left
            this.get(x + size, y - size), // Top-right
            this.get(x - size, y + size), // Bottom-left
            this.get(x + size, y + size)  // Bottom-right
        ]);
        this.set(x, y, avg + offset);
    }

    /** Performs the Square step of the algorithm. */
    private square(x: number, y: number, size: number, offset: number): void {
        const avg = this.average([
            this.get(x, y - size), // Top
            this.get(x + size, y), // Right
            this.get(x, y + size), // Bottom
            this.get(x - size, y)  // Left
        ]);
        this.set(x, y, avg + offset);
    }

    /** Calculates the average of valid numbers in an array. */
    private average(values: number[]): number {
        const valid = values.filter(v => typeof v === 'number' && isFinite(v));
        if (valid.length === 0) return 0;
        const total = valid.reduce((sum, val) => sum + val, 0);
        return total / valid.length;
    }

    /** Normalizes the heightmap values to fit within PLANET_HEIGHT_LEVELS. */
    private normalize(): void {
        let min = Infinity, max = -Infinity;

        // Find min and max height values in the map
        for (let y = 0; y <= this.max; y++) {
            for (let x = 0; x <= this.max; x++) {
                const val = this.map[y][x];
                if (val < min) min = val;
                if (val > max) max = val;
            }
        }

        const range = max - min;

        // If the map is flat, set all values to the middle level
        if (range === 0) {
            const value = Math.round((CONFIG.PLANET_HEIGHT_LEVELS - 1) / 2);
            for (let y = 0; y <= this.max; y++) {
                for (let x = 0; x <= this.max; x++) this.map[y][x] = value;
            }
            return; // Exit early
        }

        // Normalize each value to the range [0, PLANET_HEIGHT_LEVELS - 1]
        const targetMax = CONFIG.PLANET_HEIGHT_LEVELS - 1;
        for (let y = 0; y <= this.max; y++) {
            for (let x = 0; x <= this.max; x++) {
                this.map[y][x] = Math.round(((this.map[y][x] - min) / range) * targetMax);
            }
        }
    }
}