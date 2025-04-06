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
    let mockPlanetPrngInstance: any; // The mocked PRNG instance *used by* the Planet

    // --- Helper to create PRNG mock instance ---
    // Moved outside beforeEach for clarity, but still uses vi.fn()
    const createMockPrngInstance = (seedSuffix: string) => {
        // Store the mock function instance so we can spy on it later if needed
        const mockNextFn = vi.fn().mockReturnValue(0.5); // Default underlying 0-1 value
        return {
            // Make 'random' mimic the original scaling logic using the mocked 'next'
            random: vi.fn().mockImplementation((min = 0, max = 1) => {
                return mockNextFn() * (max - min) + min;
            }),
            // Keep other mocks, ensuring they also use mockNextFn where appropriate
            // Or use simpler mocks if the exact sequence isn't crucial for other methods
            randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + mockNextFn() * (max - min + 1))),
            choice: vi.fn().mockImplementation((arr) => arr[Math.floor(mockNextFn() * arr.length)]),
            getInitialSeed: () => `mock-${seedSuffix}`,
            seedNew: vi.fn().mockImplementation((...additionalSeeds: (string | number)[]) => {
                const internalStateA = 0;
                const combinedSeedString = internalStateA + ":" + additionalSeeds.join(':');
                return createMockPrngInstance(combinedSeedString as string);
            }),
            seed: 0, a: 0,
            next: mockNextFn, // Expose the underlying mock if needed
        };
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
        vi.spyOn(mockSystemPrng, 'seedNew').mockImplementation((seed) => {
             if (seed === `planet_${planetName}`) { // Match the seed used inside Planet constructor
                 return mockPlanetPrngInstance;
             }
             // Fallback for other seedNew calls (e.g., resource/mineral seeds)
             // Ensure the fallback also returns a consistent structure
             return createMockPrngInstance(String(seed)); // Ensure string conversion for fallback
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