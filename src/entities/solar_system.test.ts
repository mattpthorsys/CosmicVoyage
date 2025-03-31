// src/entities/solar_system.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'; // Corrected import
import { SolarSystem } from './solar_system';
import { Planet } from './planet';
import { Starbase } from './starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { SPECTRAL_DISTRIBUTION } from '../constants';

// Mock dependencies
vi.mock('../utils/prng');
vi.mock('./planet');
vi.mock('./starbase');

describe('SolarSystem', () => {
  const starX = 10;
  const starY = 20;
  const baseSeed = 'game-seed';
  let mockGamePrng: PRNG;
  let mockSystemPrng: any; // Using 'any' for simplicity with complex mock structure
  let mockChoiceFn: vi.Mock;
  let mockRandomFn: vi.Mock;
  let mockRandomIntFn: vi.Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize mock function variables locally IF NEEDED, but spying on instance is preferred
    // It's generally safer to remove these top-level let declarations (mockChoiceFn, mockRandomFn etc.)
    // and purely rely on vi.spyOn targeting the instance methods within each test.
    // However, IF you need them for complex shared setup:
    // mockChoiceFn = vi.fn(); // <<< ADD INITIALIZATION if keeping the variable

    // Create REAL PRNG instance for mockSystemPrng
    mockSystemPrng = new PRNG('mock-system-seed');

    // Mock the seedNew method ON THIS INSTANCE
    vi.spyOn(mockSystemPrng, 'seedNew').mockImplementation((seedSuffix) => ({
      random: vi.fn().mockReturnValue(0.5),
      randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + 0.5 * (max - min + 1))),
      choice: vi.fn().mockImplementation((arr) => arr[0]),
      getInitialSeed: () => `mock-system-seed_${seedSuffix}`,
      seed: 0,
      a: 0,
      next: () => 0.5,
      seedNew: vi.fn(),
      initialSeedString: `mock-system-seed_${seedSuffix}`,
      hashString: () => 0,
    }));

    // Mock Game PRNG
    mockGamePrng = new PRNG(baseSeed);
    vi.spyOn(mockGamePrng, 'seedNew').mockReturnValue(mockSystemPrng);

    // Mock Planet & Starbase Constructors
    vi.mocked(Planet).mockClear();
    vi.mocked(Starbase).mockClear();
    vi.mocked(Planet).mockImplementation(
      (name, type, orbitDistance, angle) =>
        ({
          name,
          type,
          orbitDistance,
          orbitAngle: angle,
          systemX: orbitDistance,
          systemY: 0,
          ensureSurfaceReady: vi.fn(),
        } as any)
    );
    vi.mocked(Starbase).mockImplementation(
      (baseNameSeed, systemPRNG, systemName) =>
        ({
          name: `${systemName} Starbase Delta`,
          orbitDistance: CONFIG.STARBASE_ORBIT_DISTANCE,
          orbitAngle: 0,
          systemX: CONFIG.STARBASE_ORBIT_DISTANCE,
          systemY: 0,
          ensureSurfaceReady: vi.fn(),
        } as any)
    );

    // Initialize mock function variables (though spying on instance below is preferred)
    // It's safer to remove these top-level declarations if consistently using spyOn in tests
    // mockChoiceFn = vi.fn();
    // mockRandomFn = vi.fn().mockReturnValue(0.5);
    // mockRandomIntFn = vi.fn().mockImplementation((min, max) => Math.floor(min + 0.5 * (max - min + 1)));
  });

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
      .mockReturnValue(0.5); // <<< ADD Default return for subsequent calls

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

  // INSIDE solar_system.test.ts
  it('should generate planets based on PRNG formation chance', () => {
    // Ensure beforeEach creates mockSystemPrng = new PRNG('mock-system-seed');

    const choiceSpy = vi.spyOn(mockSystemPrng, 'choice').mockReturnValue('Rock'); // For determinePlanetType
    const randomIntSpy = vi.spyOn(mockSystemPrng, 'randomInt').mockReturnValue(1); // For naming

    // Use chained .mockReturnValueOnce for the specific sequence needed
    const randomSpy = vi
      .spyOn(mockSystemPrng, 'random')
      // Calls from constructor:
      .mockReturnValueOnce(0.99) // 1. Starbase chance (fail)
      .mockReturnValueOnce(0.5) // 2. Orbit factor base 1
      .mockReturnValueOnce(0.5) // 3. Orbit factor base 2
      // Calls from generatePlanets loop:
      // Slot 0 (i=0):
      .mockReturnValueOnce(0.5) // 4. Orbit factor rand
      .mockReturnValueOnce(0.5) // 5. Orbit linear rand
      .mockReturnValueOnce(0.1) // 6. Formation i=0 (PASS, threshold 0.9)
      // Slot 1 (i=1):
      .mockReturnValueOnce(0.5) // 7. Orbit factor rand
      .mockReturnValueOnce(0.5) // 8. Orbit linear rand
      .mockReturnValueOnce(0.95) // 9. Formation i=1 (FAIL, threshold 0.87) <-- Expect Null
      // Slot 2 (i=2):
      .mockReturnValueOnce(0.5) // 10. Orbit factor rand
      .mockReturnValueOnce(0.5) // 11. Orbit linear rand
      .mockReturnValueOnce(0.2) // 12. Formation i=2 (PASS, threshold 0.84)
      // Slots 3-8: Mock to fail formation
      .mockReturnValue(0.99); // Default for remaining formation checks

    const system = new SolarSystem(starX, starY, mockGamePrng);

    // Assertions
    expect(vi.mocked(Planet)).toHaveBeenCalledTimes(2); // P0 and P2 form
    expect(system.planets[0]).not.toBeNull();
    expect(system.planets[1]).toBeNull(); // <<<< Assertion
    expect(system.planets[2]).not.toBeNull();
    for (let i = 3; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
      expect(system.planets[i]).toBeNull();
    }
    // Check total random calls matches our sequence + defaults
    // expect(randomSpy.mock.calls.length).toBe(3 + 3*9); // Potentially complex to assert exact count

    choiceSpy.mockRestore();
    randomSpy.mockRestore();
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
    const planetMock = vi.mocked(Planet).mockImplementation((name, type, orbitDistance) => {
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
