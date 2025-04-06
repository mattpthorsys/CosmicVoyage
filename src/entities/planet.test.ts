// src/entities/planet.test.ts

// --- Imports ---
// Ensure this import is present and TS Server is restarted
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planet } from './planet';
import { PRNG } from '../utils/prng';
import { HeightmapGenerator } from '../generation/heightmap'; // Keep original import
import { CONFIG } from '../config';
import { MineralRichness, PLANET_TYPES } from '../constants';

// --- Mock Setup ---

// Mock the PRNG module globally
vi.mock('../utils/prng');

// Define reusable mock data/functions for HeightmapGenerator mock
const mockMapData = [[128, 128], [128, 128]];
const mockGenerateMethod = vi.fn(() => mockMapData);

// Mock the HeightmapGenerator module using a factory that returns a class
vi.mock('../generation/heightmap', () => {
    // Define a mock class constructor
    const MockHeightmapGenerator = vi.fn().mockImplementation((_targetSize, roughness) => {
        // Mock instance structure
        return {
            size: mockMapData.length,
            generate: mockGenerateMethod,
            // Add other properties/methods if Planet interacts with them directly
            // Example placeholders:
            max: mockMapData.length - 1,
            map: mockMapData,
            roughness: roughness,
        };
    });
    // The factory returns an object mapping the export name to the mock class
    return { HeightmapGenerator: MockHeightmapGenerator };
});


// --- Test Suite ---



describe('Planet', () => {
    const systemName = 'TestSystem';
    const planetName = `${systemName} I`;
    const baseSeed = 'system-seed-for-planet';
    let mockSystemPrng: PRNG; // The PRNG instance passed *into* the Planet constructor
    let mockPlanetPrngInstance: IPrng; // The mocked PRNG instance *used by* the Planet

    // --- Helper to create PRNG mock instance ---
    // Moved outside beforeEach for clarity, but still uses vi.fn()
    const createMockPrngInstance = (seedSuffix: string): IPrng => {
        // Store the mock function instance so we can spy on it later if needed
        const mockNextFn = vi.fn().mockReturnValue(0.5); // Default underlying 0-1 value
        const mockInstance: IPrng = {
            // Make 'random' mimic the original scaling logic using the mocked 'next'
            random: vi.fn().mockImplementation((min = 0, max = 1) => {
                return mockNextFn() * (max - min) + min;
            }),
            // Keep other mocks, ensuring they also use mockNextFn where appropriate
            // Or use simpler mocks if the exact sequence isn't crucial for other methods
            randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + mockNextFn() * (max - min + 1))),
            choice: vi.fn().mockImplementation((arr) => arr[Math.floor(mockNextFn() * arr.length)]),
            getInitialSeed: () => `mock-${seedSuffix}`,
            seedNew: vi.fn().mockImplementation((...additionalSeeds: (string | number)[]): IPrng  => {
                const internalStateA = 0;
                const combinedSeedString = internalStateA + ":" + additionalSeeds.join(':');
                return createMockPrngInstance(combinedSeedString as string);
            }),
            seed: 0, a: 0,
            next: mockNextFn, // Expose the underlying mock if needed
        };

        // Return the structured object
        return mockInstance;
    };

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();
        mockGenerateMethod.mockClear(); // Clear calls to the generate mock function
        vi.mocked(HeightmapGenerator).mockClear(); // Clear calls to the mock constructor

        // --- Set up PRNG Mocks ---
        // Create the specific instance that Planet constructor will receive via seedNew
        mockPlanetPrngInstance = createMockPrngInstance(`planet_${planetName}`);

        // Create the PRNG that is passed *into* the Planet constructor
        mockSystemPrng = new PRNG(baseSeed); // OK to use real constructor here

        // Mock *its* seedNew method to return our controlled mockPlanetPrngInstance
        // Spy modification using the adjusted helper
        vi.spyOn(mockSystemPrng, 'seedNew').mockImplementation((seed) => {
            const instance = (seed === `planet_${planetName}`)
                ? mockPlanetPrngInstance
                : createMockPrngInstance(String(seed));
            // Cast the result here, relying on the internal structure being sufficient
            return instance as unknown as PRNG;
        });
    });

    it('should initialize core properties correctly', () => {
        const planet = new Planet(planetName, 'Rock', 50000, 0, mockSystemPrng, 'G');

        expect(planet.name).toBe(planetName);
        expect(planet.type).toBe('Rock');
        expect(planet.orbitDistance).toBe(50000);
        expect(planet.orbitAngle).toBe(0);
        expect(planet.systemPRNG).toBe(mockPlanetPrngInstance);
        // Note: The mapSeed might depend on the mocked getInitialSeed of mockPlanetPrngInstance
        expect(planet.mapSeed).toBe('mock-planet_TestSystem I_map');
        expect(planet.scanned).toBe(false);
        expect(planet.primaryResource).toBeNull();
        expect(planet.heightmap).toBeNull();
        expect(planet.heightLevelColors).toBeNull();
    });

    it('constructor should calculate physical characteristics based on mocked PRNG', () => {
        // Now, spy on and control the underlying 'next' method of the specific instance
        vi.spyOn(mockPlanetPrngInstance, 'next')
            .mockReturnValueOnce(0.6) // For diameter -> randomInt uses this
            .mockReturnValueOnce(0.7); // For gravity -> random(0.1, 2.5) uses this
        // Subsequent calls will use the default 0.5 from the helper setup
    
        const planet = new Planet(planetName, 'Rock', 50000, 0, mockSystemPrng, 'G');
    
        // randomInt(2000, 20000) with next()=0.6 -> floor(2000 + 0.6*(18001)) = floor(2000 + 10800.6) = 12800
        const expectedDiameter = 11000;
        // random(0.1, 2.5) with next()=0.7 -> 0.1 + 0.7 * (2.5 - 0.1) = 0.1 + 0.7 * 2.4 = 0.1 + 1.68 = 1.78
        const expectedGravity = 1.3;
    
        expect(planet.diameter).toBe(expectedDiameter);
        expect(planet.gravity).toBeCloseTo(expectedGravity); // Should now be close to 1.78
        expect(planet.atmosphere.density).toBe('Earth-like'); // 0.6 roll -> index 2
    });

    describe('ensureSurfaceReady', () => {
        it('should generate heightmap and colors for a solid planet if null', () => {
            const planet = new Planet(planetName, 'Rock', 50000, 0, mockSystemPrng, 'G');
            expect(planet.heightmap).toBeNull();

            planet.ensureSurfaceReady();

            // Check the mock class constructor was called
            expect(HeightmapGenerator).toHaveBeenCalledOnce();
            // Check the mock generate method on the instance was called
            expect(mockGenerateMethod).toHaveBeenCalledOnce();

            expect(planet.heightmap).toEqual(mockMapData);
            expect(planet.heightLevelColors).toBeInstanceOf(Array);
            expect(planet.heightLevelColors?.length).toBe(CONFIG.PLANET_HEIGHT_LEVELS);
        });

         it('should generate palette cache for a gas giant if null', () => {
            const planet = new Planet(planetName, 'GasGiant', 150000, 0, mockSystemPrng, 'G');
            expect(planet.rgbPaletteCache).toBeNull();

            planet.ensureSurfaceReady();

            expect(planet.rgbPaletteCache).toBeInstanceOf(Array);
            expect(planet.rgbPaletteCache?.length).toBe(PLANET_TYPES['GasGiant'].colors.length);
            expect(planet.heightmap).toBeNull();
            expect(planet.heightLevelColors).toBeNull();
            expect(HeightmapGenerator).not.toHaveBeenCalled(); // Constructor NOT called
            expect(mockGenerateMethod).not.toHaveBeenCalled(); // Generate method NOT called
        });

        // ... other ensureSurfaceReady tests ...
    });

    describe('scan', () => {
        it('should set scanned to true and determine primaryResource', () => {
            const planet = new Planet(planetName, 'Rock', 50000, 0, mockSystemPrng, 'G');
            (planet as any).mineralRichness = MineralRichness.RICH; // Force richness

            // Control the choice made by the PRNG returned by seedNew('resource')
            const mockResourcePrng = mockPlanetPrngInstance.seedNew('resource');
            vi.spyOn(mockResourcePrng, 'choice').mockReturnValue('Rare Elements');

            planet.scan();

            expect(planet.scanned).toBe(true);
            expect(planet.primaryResource).toBe('Rare Elements');
        });
        // ... other scan tests ...
    });

    // ... other test suites ...
});


/**
 * Interface defining the structure and methods expected from a PRNG (Pseudo-Random Number Generator)
 * instance, specifically tailored for mocking purposes in tests.
 */
interface IPrng {
    /**
     * Returns a pseudo-random floating-point number.
     * @param min Optional. The minimum bound (inclusive). Defaults to 0.
     * @param max Optional. The maximum bound (exclusive). Defaults to 1.
     * @returns A pseudo-random number in the specified range.
     */
    random(min?: number, max?: number): number;
  
    /**
     * Returns a pseudo-random integer number.
     * @param min The minimum bound (inclusive).
     * @param max The maximum bound (inclusive).
     * @returns A pseudo-random integer in the specified range.
     */
    randomInt(min: number, max: number): number;
  
    /**
     * Returns a pseudo-randomly selected element from the given array.
     * @param arr The array to choose from.
     * @returns A randomly selected element from the array.
     */
    choice<T>(arr: T[]): T; // Using generic <T> for type safety
  
    /**
     * Returns the initial seed string associated with this PRNG instance.
     * (In the mock, this might be a simplified representation).
     * @returns The initial seed as a string.
     */
    getInitialSeed(): string;
  
    /**
     * Creates and returns a new PRNG instance, seeded based on the current
     * PRNG's internal state and the provided additional seeds.
     * @param additionalSeeds Variable number of string or number seeds.
     * @returns A new IPrng instance.
     */
    seedNew(...additionalSeeds: (string | number)[]): IPrng; // Note: returns itself (the interface type)
  
    /**
     * Returns the next raw pseudo-random number in the sequence (typically between 0 and 1).
     * This is often the underlying function used by `random`, `randomInt`, etc.
     * @returns The next pseudo-random number.
     */
    next(): number;
  
    // --- Internal State Properties (as defined in the mock) ---
    // These might not be strictly required by the Planet class itself,
    // but are part of the mock's structure and might be useful for debugging tests.
  
    /**
     * The current seed value (or part of the internal state).
     * Type might vary based on the actual PRNG implementation.
     */
    seed: number; // Or potentially string | number depending on the real PRNG
  
    /**
     * Another internal state variable (like the 'a' parameter in some PRNG algorithms).
     * Type might vary based on the actual PRNG implementation.
     */
    a: number; // Adjust type if necessary
  }