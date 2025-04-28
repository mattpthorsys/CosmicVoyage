// src/entities/starbase.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Starbase } from './starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';

// Mock the PRNG module globally
vi.mock('../utils/prng');

describe('Starbase', () => {
  const systemName = 'TestSystem';
  const baseSeed = 'system-seed-for-starbase';
  let mockSystemPrng: PRNG;
  let mockStarbasePrngInstance: any;
  let mockNextFn: vi.Mock; // Declare mockNextFn in higher scope

  beforeEach(() => {
    vi.clearAllMocks();

    // --- Create controlled mock instance FOR the starbase's internal PRNG ---
    mockNextFn = vi.fn(); // Initialize the mock function for 'next'
    mockStarbasePrngInstance = {
      // Define 'random' using scaling logic AND ENSURE IT USES mockNextFn
      random: vi.fn().mockImplementation((min = 0, max = 1) => {
        // Make sure this implementation uses the mockNextFn defined above
        return mockNextFn() * (max - min) + min;
      }),
      randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + mockNextFn() * (max - min + 1))),
      choice: vi.fn().mockImplementation((arr) => arr[Math.floor(mockNextFn() * arr.length)]),
      getInitialSeed: () => `mock-starbase-seed`,
      seedNew: vi.fn(),
      seed: 0,
      a: 0,
      next: mockNextFn, // Assign the mock function to the 'next' property
      initialSeedString: `mock-starbase-seed`,
      hashString: () => 0,
    };

    // --- Create the PRNG passed into the constructor ---
    mockSystemPrng = new PRNG(baseSeed);
    // Mock *its* seedNew method to return our controlled instance
    vi.spyOn(mockSystemPrng, 'seedNew').mockReturnValue(mockStarbasePrngInstance);
  });

  it('should initialize with correct properties', () => {
    // --- Mock Setup ---
    // Spy on the 'random' method of the specific PRNG instance that Starbase uses
    const randomSpy = vi
      .spyOn(mockStarbasePrngInstance, 'random')
      // Provide return values for the calls made in the Starbase constructor
      .mockReturnValueOnce(1.0)         // For orbitDistance factor -> results in 1.0
      .mockReturnValueOnce(Math.PI / 4);

    // --- Instantiate ---
    const starbase = new Starbase(baseSeed, mockSystemPrng, systemName);

    // --- Assertions ---
    expect(starbase.name).toBe(`${systemName} Starbase Delta`);
    expect(starbase.type).toBe('Starbase');

    const expectedDist = CONFIG.STARBASE_ORBIT_DISTANCE * 1.0; // 75000
    const expectedAngle = Math.PI / 4;

    // The core assertions:
    expect(starbase.orbitDistance).toBeCloseTo(expectedDist);
    expect(starbase.orbitAngle).toBeCloseTo(expectedAngle); // Should now pass with expectedAngle = PI/4

    // Other assertions
    expect(starbase.systemX).toBeCloseTo(Math.cos(expectedAngle) * expectedDist);
    expect(starbase.systemY).toBeCloseTo(Math.sin(expectedAngle) * expectedDist);

    // Verify mocks were called as expected
    expect(randomSpy).toHaveBeenCalledTimes(2);
    expect(randomSpy).toHaveBeenNthCalledWith(1, 0.9, 1.1);      // Call for distance factor
    expect(randomSpy).toHaveBeenNthCalledWith(2, 0, Math.PI * 2); // Call for angle

    // --- Cleanup ---
    randomSpy.mockRestore();
  });

  it('ensureSurfaceReady should create placeholder map and colours', () => {
    // No specific PRNG mocking needed for this test
    const starbase = new Starbase(baseSeed, mockSystemPrng, systemName);
    // Constructor calls ensureSurfaceReady, so check initial state
    expect(starbase.heightmap).toEqual([[0]]);
    expect(starbase.heightLevelColors).toEqual([CONFIG.STARBASE_COLOUR]);

    // Call again to ensure it's idempotent
    starbase.heightmap = null; // Reset manually
    starbase.ensureSurfaceReady();
    expect(starbase.heightmap).toEqual([[0]]); // Should be recreated
  });

  it('getScanInfo should return correct info array', () => {
    const starbase = new Starbase(baseSeed, mockSystemPrng, systemName);
    const scanInfo = starbase.getScanInfo();
    expect(scanInfo).toBeInstanceOf(Array);
    expect(scanInfo[0]).toContain(starbase.name);
    expect(scanInfo).toContain('Type: Orbital Starbase');
    expect(scanInfo).toContain('Mineral Scan: N/A');
  });
});
