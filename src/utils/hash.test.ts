// src/utils/hash.test.ts

import { describe, it, expect } from 'vitest';
import { fastHash } from './hash';

describe('fastHash', () => {

    it('should produce a deterministic hash for the same inputs', () => {
        const x = 12345;
        const y = -67890;
        const seed = 987654321;

        const hash1 = fastHash(x, y, seed);
        const hash2 = fastHash(x, y, seed);

        expect(hash1).toEqual(hash2);
        // Check against a known value (fragile, but useful during dev)
        // This value might change if the hash algorithm changes!
        expect(hash1).toBe(1401575903);
    });

    it('should produce different hashes for different X coordinates', () => {
        const y = 100;
        const seed = 1;
        const hash1 = fastHash(50, y, seed);
        const hash2 = fastHash(51, y, seed);
        expect(hash1).not.toEqual(hash2);
    });

    it('should produce different hashes for different Y coordinates', () => {
        const x = 100;
        const seed = 1;
        const hash1 = fastHash(x, 50, seed);
        const hash2 = fastHash(x, 51, seed);
        expect(hash1).not.toEqual(hash2);
    });

    it('should produce different hashes for different seeds', () => {
        const x = 100;
        const y = 50;
        const hash1 = fastHash(x, y, 123);
        const hash2 = fastHash(x, y, 456);
        expect(hash1).not.toEqual(hash2);
    });

    it('should handle zero coordinates', () => {
        const seed = 1;
        const hashOrigin = fastHash(0, 0, seed);
        const hashX = fastHash(1, 0, seed);
        const hashY = fastHash(0, 1, seed);
        expect(hashOrigin).not.toEqual(hashX);
        expect(hashOrigin).not.toEqual(hashY);
        expect(hashX).not.toEqual(hashY);
        expect(hashOrigin).toBeDefined();
    });

     it('should handle negative coordinates', () => {
        const seed = 1;
        const hashPos = fastHash(10, 20, seed);
        const hashNegX = fastHash(-10, 20, seed);
        const hashNegY = fastHash(10, -20, seed);
        const hashNegXY = fastHash(-10, -20, seed);

        expect(hashPos).not.toEqual(hashNegX);
        expect(hashPos).not.toEqual(hashNegY);
        expect(hashPos).not.toEqual(hashNegXY);
        expect(hashNegX).not.toEqual(hashNegXY);
        expect(hashNegY).not.toEqual(hashNegXY);
    });

    it('should return an unsigned 32-bit integer', () => {
        const x = 123;
        const y = 456;
        const seed = 789;
        const hashVal = fastHash(x, y, seed);

        expect(hashVal).toBeGreaterThanOrEqual(0);
        expect(hashVal).toBeLessThanOrEqual(4294967295); // 2^32 - 1
        expect(Number.isInteger(hashVal)).toBe(true); // Should effectively be an integer
    });
});