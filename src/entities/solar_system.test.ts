// src/entities/solar_system.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'; // Corrected import
import { SolarSystem } from './solar_system';
import { Planet } from './planet';
import { Starbase } from './starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';

// Mock dependencies
vi.mock('../utils/prng');
vi.mock('./planet');
vi.mock('./starbase');

describe('SolarSystem', () => {
  const starX = 10;
  const starY = 20;
  const baseSeed = 'game-seed';
  let mockGamePrng: PRNG;
  let mockSystemPrng: any; // Use 'any' for the fully mocked object

  beforeEach(() => {
    vi.clearAllMocks();

    // --- Create a fully mocked PRNG object for the system ---
    // This object will be returned when gameSeedPRNG.seedNew is called
    mockSystemPrng = {
      random: vi.fn().mockReturnValue(0.5), // Default random value
      randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + 0.5 * (max - min + 1))), // Default int
      choice: vi.fn().mockImplementation((arr) => arr[0]), // Default choice
      getInitialSeed: vi.fn().mockReturnValue('mock-system-seed-from-factory'), // Mocked seed string
      // Mock seedNew to return another similar mock if needed by sub-generators
      seedNew: vi.fn().mockImplementation((suffix) => ({
          random: vi.fn().mockReturnValue(0.5),
          randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + 0.5 * (max - min + 1))),
          choice: vi.fn().mockImplementation((arr) => arr[0]),
          getInitialSeed: () => `mock-sub-seed_${suffix}`,
          // Include other necessary PRNG properties if used by sub-components
          seed: 0, a: 0, next: () => 0.5, seedNew: vi.fn(),
      })),
      // Include other necessary PRNG properties if directly accessed by SolarSystem
      seed: 0, // Placeholder
      a: 0,    // Placeholder
      next: vi.fn().mockReturnValue(0.5), // Placeholder
      initialSeedString: 'mock-system-seed-from-factory', // Match getInitialSeed
      hashString: vi.fn().mockReturnValue(12345), // Placeholder
    };

    // --- Mock Game PRNG ---
    // Create a real PRNG for the game level (or mock it if preferred)
    mockGamePrng = new PRNG(baseSeed);
    // Mock its seedNew method to *always* return our fully controlled mockSystemPrng
    vi.spyOn(mockGamePrng, 'seedNew').mockReturnValue(mockSystemPrng);

    // --- Mock Planet & Starbase Constructors ---
    vi.mocked(Planet).mockClear();
    vi.mocked(Starbase).mockClear();
    vi.mocked(Planet).mockImplementation(
      (name, type, orbitDistance, angle) =>
        ({
          name,
          type,
          orbitDistance,
          orbitAngle: angle,
          systemX: orbitDistance, // Simplified position for testing
          systemY: 0,
          ensureSurfaceReady: vi.fn(), // Mock methods if called
          // Add other properties if SolarSystem interacts with them directly
        } as any)
    );
    vi.mocked(Starbase).mockImplementation(
      (systemName) =>
        ({
          name: `${systemName} Starbase Delta`,
          orbitDistance: CONFIG.STARBASE_ORBIT_DISTANCE,
          orbitAngle: 0, // Simplified
          systemX: CONFIG.STARBASE_ORBIT_DISTANCE,
          systemY: 0,
          ensureSurfaceReady: vi.fn(),
        } as any)
    );
  });

  // --- Tests follow ---
  // ... (other tests like 'should initialize', 'should conditionally create starbase') ...

  // Test case 'should generate planets based on PRNG formation chance' goes here
  // Test case 'should calculate edgeRadius based on the furthest object' goes here
  // ... (other tests) ...

  it('should initialize with correct properties based on seed and coords', () => {
    const choiceSpy = vi
      .spyOn(mockSystemPrng, 'choice')
      .mockReturnValueOnce('K') // For starType
      .mockReturnValueOnce('Gliese'); // For systemName prefix

    const randomIntSpy = vi.spyOn(mockSystemPrng, 'randomInt').mockImplementation((min, max) => {
      if (min === 1 && max === 999) return 123; // For name number
      if (min === 0 && max === 25) return 2; // For name suffix ('C')
      return Math.floor((min as number) + 0.5 * ((max as number) - (min as number) + 1));
    });

    // Spy on random, providing values for constructor AND a default for later calls
    const randomSpy = vi
      .spyOn(mockSystemPrng, 'random')
      .mockReturnValueOnce(0.99) // 1. Starbase chance (fail)
      .mockReturnValueOnce(0.5) // 2. Orbit factor base 1 -> 12500
      .mockReturnValueOnce(0.5) // 3. Orbit factor base 2 -> 1.65
      .mockReturnValue(0.5); 

    const system = new SolarSystem(starX, starY, mockGamePrng);

    // Assertions
    expect(system.starX).toBe(starX);
    expect(system.starY).toBe(starY);
    // ... other assertions ...
    expect(system.name).toBe('Gliese-123C');
    expect(system.planets.length).toBe(CONFIG.MAX_PLANETS_PER_SYSTEM);

    // Verify constructor path calls
    expect(choiceSpy).toHaveBeenCalledTimes(2);
    expect(randomIntSpy).toHaveBeenCalledTimes(2);
    // Check random was called enough times (at least 6 for constructor + first loop iteration start)
    expect(randomSpy.mock.calls.length).toBeGreaterThanOrEqual(6);

    // Clean up spies
    choiceSpy.mockRestore();
    randomIntSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('should conditionally create a starbase based on PRNG', () => {
    // --- Test Case 1 ---
    const choiceSpy1 = vi.spyOn(mockSystemPrng, 'choice').mockReturnValue('G'); // Use spyOn
    const randomSpy1 = vi.spyOn(mockSystemPrng, 'random').mockReturnValueOnce(CONFIG.STARBASE_PROBABILITY - 0.01);
    // ... create system, assert ...
    choiceSpy1.mockRestore();
    randomSpy1.mockRestore();

    // --- Test Case 2 ---
    vi.clearAllMocks();
    const choiceSpy2 = vi.spyOn(mockSystemPrng, 'choice').mockReturnValue('M'); // Use spyOn
    const randomSpy2 = vi.spyOn(mockSystemPrng, 'random').mockReturnValueOnce(CONFIG.STARBASE_PROBABILITY + 0.01);
    // ... create system, assert ...
    choiceSpy2.mockRestore();
    randomSpy2.mockRestore();
  });

  it('should calculate edgeRadius based on the furthest object', () => {
    const randomSpy = vi.spyOn(mockSystemPrng, 'random').mockReturnValueOnce(0.9); // Starbase check
    const choiceSpy = vi.spyOn(mockSystemPrng, 'choice').mockReturnValue('G'); // Use spyOn for name/type
    // ... rest of test setup ...
    // ... create SolarSystem ...
    // ... assertions ...
    randomSpy.mockRestore();
    choiceSpy.mockRestore(); // Restore this spy too
  });

  it('should generate planets based on PRNG formation chance', () => {
    // --- Mock Setup ---
    // Define the exact sequence of random values needed for this test.
    // This sequence aligns with the calls made in the constructor and generatePlanets loop.
    const randomReturnValues = [
      /* 1*/ 0.99, // Constructor: Starbase chance (fail)
      /* 2*/ 0.5,  // Constructor: Orbit factor base 1
      /* 3*/ 0.5,  // Constructor: Orbit factor base 2
      // --- Loop i=0: threshold 0.9 -> PASS ---
      /* 4*/ 0.5,  // Orbit factor rand
      /* 5*/ 0.5,  // Orbit linear rand
      /* 6*/ 0.1,  // Formation chance (PASS -> 0.1 < 0.9) --> Planet(0) constructed
      // --- Loop i=1: threshold 0.87 -> FAIL ---
      /* 7*/ 0.5,  // Orbit factor rand
      /* 8*/ 0.5,  // Orbit linear rand
      /* 9*/ 0.95, // Formation chance (FAIL -> 0.95 is not < 0.87) --> Planet(1) NOT constructed
      // --- Loop i=2: threshold 0.84 -> PASS ---
      /*10*/ 0.5,  // Orbit factor rand
      /*11*/ 0.5,  // Orbit linear rand
      /*12*/ 0.2,  // Formation chance (PASS -> 0.2 < 0.84) --> Planet(2) constructed
      // --- Loops i=3 to i=8: FAIL ---
      //     Formation checks are calls #15, 18, 21, 24, 27, 30
      /*13*/ 0.5, /*14*/ 0.5, /*15*/ 0.99, // i=3: FAIL (0.99 > 0.81)
      /*16*/ 0.5, /*17*/ 0.5, /*18*/ 0.99, // i=4: FAIL (0.99 > 0.78)
      /*19*/ 0.5, /*20*/ 0.5, /*21*/ 0.99, // i=5: FAIL (0.99 > 0.75)
      /*22*/ 0.5, /*23*/ 0.5, /*24*/ 0.99, // i=6: FAIL (0.99 > 0.72)
      /*25*/ 0.5, /*26*/ 0.5, /*27*/ 0.99, // i=7: FAIL (0.99 > 0.69)
      /*28*/ 0.5, /*29*/ 0.5, /*30*/ 0.99, // i=8: FAIL (0.99 > 0.66)
    ];

    let randomCallCount = 0;
    // Spy on the 'random' method of the MOCKED system PRNG object
    const randomSpy = vi
      .spyOn(mockSystemPrng, 'random') // Target the mocked object's random method
      .mockImplementation(() => {
        const call = ++randomCallCount;
        // Use the defined sequence, fallback to 0.99 (fail) if called more times
        const returnValue = (call <= randomReturnValues.length)
           ? randomReturnValues[call - 1]
           : 0.99; // Default to fail if sequence is exceeded
        // console.log(`[TEST DEBUG] random() call #${call} returning: ${returnValue}`); // Optional debug
        return returnValue;
      });

    // Mock 'choice' calls on the MOCKED system PRNG for constructor name generation
    const choiceSpy = vi
      .spyOn(mockSystemPrng, 'choice') // Target the mocked object
      .mockReturnValueOnce('G')       // 1. For starType
      .mockReturnValueOnce('Gliese'); // 2. For name prefix
      // .mockImplementation((arr) => arr[0]); // Default fallback if needed elsewhere

    // Mock 'randomInt' calls on the MOCKED system PRNG for constructor name generation
    const randomIntSpy = vi
      .spyOn(mockSystemPrng, 'randomInt') // Target the mocked object
      .mockReturnValueOnce(1)       // 1. Name number
      .mockReturnValueOnce(0);      // 2. Name suffix index ('A')
      // .mockImplementation((min, max) => min); // Default fallback if needed elsewhere

    // --- Instantiate ---
    // SolarSystem constructor will call gameSeedPRNG.seedNew(), which returns our mockSystemPrng
    const system = new SolarSystem(starX, starY, mockGamePrng);

    // --- Assertions ---
    expect(system.starType).toBe('G');
    expect(system.name).toBe('Gliese-1A');

    // --- DEBUGGING Log ---
    // console.log('[TEST DEBUG] Final system.planets:', system.planets.map(p => p?.name ?? null));
    // Expected: [ 'Gliese-1A I', null, 'Gliese-1A III', null, null, null, null, null, null ]

    // Verify planets generated correctly based on the mocked random values
    expect(vi.mocked(Planet)).toHaveBeenCalledTimes(3); // P0 (i=0) and P2 (i=2) should form

    // Check specific planet slots
    expect(system.planets[0]).not.toBeNull();
    expect(system.planets[0]?.name).toBe('Gliese-1A I');

    expect(system.planets[1]?.name).toBe('Gliese-1A II'); // Should NOT form (call #9 returns 0.95 > 0.87)

    expect(system.planets[2]).not.toBeNull();
    expect(system.planets[2]?.name).toBe('Gliese-1A III');

    // Check remaining planets (should not form)
    for (let i = 3; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
        expect(system.planets[i]).toBeNull();
    }

    // Verify the number of random calls matches the sequence length used
     expect(randomCallCount).toBeGreaterThanOrEqual(30); // Ensure all expected calls happened

    // --- Cleanup ---
    // Restore *all* spies created in this test
    randomSpy.mockRestore();
    choiceSpy.mockRestore();
    randomIntSpy.mockRestore();
  });
  
  it('should calculate edgeRadius based on the furthest object', () => {
    // Ensure beforeEach creates mockSystemPrng = new PRNG('mock-system-seed');

    // Mock random call for starbase chance check
    const randomSpy = vi.spyOn(mockSystemPrng, 'random').mockReturnValueOnce(0.9); // Don't create starbase
    // Mock choice call needed for determinePlanetType inside generatePlanets loop
    const choiceSpy = vi.spyOn(mockSystemPrng, 'choice').mockReturnValue('G');

    // Mock Planet constructor implementation FOR THIS TEST to control orbitDistance
    const mockOrbits = [10000, 50000, null, 120000, null, null, null, null, null]; // Furthest is 120k
    let planetCallCount = 0;
    // Override the default mock implementation for Planet within this test's scope temporarily
    const planetMock = vi.mocked(Planet).mockImplementation((name, type) => {
      const currentOrbit = mockOrbits[planetCallCount] ?? 0; // Use defined orbit or 0
      planetCallCount++;
      // Return a shape consistent with what SolarSystem uses (orbitDistance)
      return {
        name,
        type,
        orbitDistance: currentOrbit, // Return the controlled orbit
        // Add other properties/methods if SolarSystem directly accesses them
        ensureSurfaceReady: vi.fn(), // Need this method as Planet has it
      } as any; // Use 'as any' to simplify mock shape if needed
    });

    // Control formation chance to match the mockOrbits array
    // We need to make sure the spy on 'random' is reset and correctly set up here
    randomSpy.mockRestore(); // Restore previous spy on random first
    let formationIndex = 0; // Reset index if declared outside
    const formationSpy = vi.spyOn(mockSystemPrng, 'random').mockImplementation(() => {
      // Calls within constructor first: starbase check (handled by first mockRestore), orbit factors
      if (formationSpy.mock.calls.length === 1) return 0.5; // orbit factor 1
      if (formationSpy.mock.calls.length === 2) return 0.5; // orbit factor 2

      // Now handle formation checks based on mockOrbits
      if (formationIndex < mockOrbits.length) {
        // Skip calls for orbit factor rand/linear rand (assume 0.5)
        if ((formationSpy.mock.calls.length - 3) % 3 === 0) {
          // If it's a formation chance call
          const shouldForm = mockOrbits[formationIndex] !== null;
          formationIndex++;
          return shouldForm ? 0.1 : 0.99; // Pass or fail formation check
        }
      }
      return 0.5; // Default for orbit factor/linear calls
    });

    // Mock randomInt for naming
    const randomIntSpy = vi.spyOn(mockSystemPrng, 'randomInt').mockReturnValue(1);

    // Create the system
    const system = new SolarSystem(starX, starY, mockGamePrng);

    // Assertions
    const maxOrbit = 120000; // Based on mockOrbits
    const expectedRadius = Math.max(50000, maxOrbit * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR);
    expect(system.edgeRadius).toBeCloseTo(expectedRadius);

    // Clean up mocks/spies specific to this test
    planetMock.mockRestore(); // Restore original Planet mock if needed elsewhere
    choiceSpy.mockRestore();
    formationSpy.mockRestore();
    randomIntSpy.mockRestore();
  });

  // ... Add tests for other methods ...
});
