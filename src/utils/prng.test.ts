// src/utils/prng.test.ts

import { describe, it, expect } from 'vitest';
import { PRNG } from './prng'; // Adjust path if your test file is elsewhere

describe('PRNG (Mulberry32)', () => {

    it('should initialize with a string seed', () => {
        const seed = 'test-seed';
        const prng = new PRNG(seed);
        expect(prng).toBeDefined();
        expect(prng.getInitialSeed()).toBe(seed);
    });

    it('should produce deterministic sequences for the same seed', () => {
        const seed = 'deterministic-test';
        const prng1 = new PRNG(seed);
        const prng2 = new PRNG(seed);

        // Generate sequences of various random types
        const sequence1 = [
            prng1.next(), prng1.next(),
            prng1.random(10, 20),
            prng1.randomInt(1, 100),
            prng1.choice(['a', 'b', 'c'])
        ];
        const sequence2 = [
            prng2.next(), prng2.next(),
            prng2.random(10, 20),
            prng2.randomInt(1, 100),
            prng2.choice(['a', 'b', 'c'])
        ];

        expect(sequence1).toEqual(sequence2);
        // Verify internal state 'a' is also the same after sequence generation
        expect((prng1 as any).a).toEqual((prng2 as any).a);
    });

    it('should produce different sequences for different seeds', () => {
        const prng1 = new PRNG('seed-A');
        const prng2 = new PRNG('seed-B');

        expect(prng1.next()).not.toEqual(prng2.next());
        expect(prng1.randomInt(0, 1000)).not.toEqual(prng2.randomInt(0, 1000));
    });

    it('next() should return values between 0 (inclusive) and 1 (exclusive)', () => {
        const prng = new PRNG('range-test');
        for (let i = 0; i < 100; i++) {
            const val = prng.next();
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThan(1);
        }
    });

    it('random() should return values within the specified range', () => {
        const prng = new PRNG('random-range');
        const min = 5.5;
        const max = 15.5;
        for (let i = 0; i < 100; i++) {
            const val = prng.random(min, max);
            expect(val).toBeGreaterThanOrEqual(min);
            expect(val).toBeLessThan(max);
        }
        // Test default range [0, 1)
        const defaultVal = prng.random();
        expect(defaultVal).toBeGreaterThanOrEqual(0);
        expect(defaultVal).toBeLessThan(1);
    });

    it('randomInt() should return integers within the specified inclusive range', () => {
        const prng = new PRNG('randomInt-range');
        const min = -10;
        const max = 10;
        const results = new Set<number>();
        for (let i = 0; i < 500; i++) { // More iterations to increase chance of hitting bounds
            const val = prng.randomInt(min, max);
            expect(Number.isInteger(val)).toBe(true);
            expect(val).toBeGreaterThanOrEqual(min);
            expect(val).toBeLessThanOrEqual(max);
            results.add(val);
        }
        // Check if bounds were likely hit (probabilistic)
        expect(results.has(min)).toBe(true);
        expect(results.has(max)).toBe(true);
    });

     it('choice() should return an element from the array', () => {
        const prng = new PRNG('choice-test');
        const arr = ['apple', 'banana', 'cherry', 'date'];
        for (let i = 0; i < 50; i++) {
            const choice = prng.choice(arr);
            expect(arr).toContain(choice);
        }
    });

    it('choice() should return undefined for empty or null array', () => {
        const prng = new PRNG('choice-empty');
        expect(prng.choice([])).toBeUndefined();
        expect(prng.choice(null as any)).toBeUndefined(); // Test with null
        expect(prng.choice(undefined as any)).toBeUndefined(); // Test with undefined
    });

     it('seedNew() should create independent PRNG instances', () => {
        const basePrng = new PRNG('base-seed');
        const val1_base = basePrng.next();

        const prngA = basePrng.seedNew('A');
        const val1_A = prngA.next();
        const val2_A = prngA.next();

        // Generating from prngA should not affect basePrng's next value
        const val2_base = basePrng.next();
        expect(val2_base).not.toEqual(val1_A);
        expect(val2_base).not.toEqual(val2_A);

        const prngB = basePrng.seedNew('B'); // Different seed from prngA
        const val1_B = prngB.next();
        expect(val1_B).not.toEqual(val1_A);

        // Ensure basePrng state wasn't corrupted by seedNew calls
         const val3_base = basePrng.next();
         expect(val3_base).not.toEqual(val1_base);
         expect(val3_base).not.toEqual(val2_base);
    });
});