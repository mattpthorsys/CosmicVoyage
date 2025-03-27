// src/utils/hash.ts

/**
 * A fast, non-cryptographic hash function for 2D coordinates and a seed.
 * Useful for deterministic procedural generation checks without creating full PRNG objects.
 * Based on variations of MurmurHash/xxHash concepts for integer inputs.
 * @param x Integer coordinate
 * @param y Integer coordinate
 * @param seedInt Integer seed value
 * @returns An unsigned 32-bit integer hash value.
 */
export function fastHash(x: number, y: number, seedInt: number): number {
    let h = seedInt >>> 0; // Ensure seed is treated as unsigned 32-bit

    // Ensure coordinates are integers
    x = x | 0;
    y = y | 0;

    // Mixing process (constants are arbitrary primes/magic numbers)
    h = Math.imul(h ^ x, 0xcc9e2d51); // Mix x
    h = (h << 15) | (h >>> 17);       // Rotate
    h = Math.imul(h, 0x1b873593);    // Multiply

    h = Math.imul(h ^ y, 0xcc9e2d51); // Mix y
    h = (h << 15) | (h >>> 17);       // Rotate
    h = Math.imul(h, 0x1b873593);    // Multiply

    // Final avalanche
    h = h ^ (h >>> 16);
    return h >>> 0; // Ensure final result is unsigned 32-bit
}