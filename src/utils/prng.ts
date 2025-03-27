// src/utils/prng.ts

/**
 * A seeded Pseudo-Random Number Generator using the Mulberry32 algorithm.
 */
export class PRNG {
    private initialSeedString: string;
    public seed: number; // Internal state (integer)
    private a: number; // Internal state (integer)

    constructor(seed: string) {
        this.initialSeedString = seed.toString();
        this.seed = this.hashString(this.initialSeedString);
        this.a = this.seed;
        // Cycle a few times initially to improve distribution
        for (let i = 0; i < 10; i++) this.next();
    }

    /** Simple string hashing function to initialize the seed. */
    private hashString(str: string): number {
        let h = 9;
        for (let i = 0; i < str.length;) {
            h = Math.imul(h ^ str.charCodeAt(i++), 9 ** 9);
        }
        return (h ^ h >>> 9) >>> 0; // Ensure unsigned 32-bit integer
    }

    /** Generates the next pseudo-random number as a float between 0 (inclusive) and 1 (exclusive). */
    next(): number {
        // Mulberry32 algorithm
        let t = this.a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        this.a = t; // Update state for next call
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    /** Returns a pseudo-random float between min (inclusive) and max (exclusive). */
    random(min: number = 0, max: number = 1): number {
        return this.next() * (max - min) + min;
    }

    /** Returns a pseudo-random integer between min (inclusive) and max (inclusive). */
    randomInt(min: number, max: number): number {
        // Ensure integer inputs
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /** Selects a pseudo-random element from an array. */
    choice<T>(arr: T[]): T | undefined {
        if (!arr || arr.length === 0) {
            return undefined;
        }
        return arr[this.randomInt(0, arr.length - 1)];
    }

    /** Creates a new PRNG instance seeded from the current state and additional seeds. */
    seedNew(...additionalSeeds: (string | number)[]): PRNG {
        // Combine current internal state 'a' with additional seeds
        const combinedSeed = this.a + ":" + additionalSeeds.join(':');
        return new PRNG(combinedSeed);
    }

    /** Gets the initial seed string used to create this PRNG instance. */
    getInitialSeed(): string {
        return this.initialSeedString;
    }
}