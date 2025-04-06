// src/core/game.test.ts

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'; // Added Mock type
import { Game } from './game';
import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { fastHash } from '../utils/hash';

// --- Mock Dependencies ---
vi.mock('../rendering/renderer');
vi.mock('./player');
vi.mock('../entities/solar_system');
vi.mock('../entities/planet');
vi.mock('../entities/starbase');
vi.mock('../utils/prng');
vi.mock('../utils/logger');
vi.mock('../utils/hash', () => ({
    fastHash: vi.fn().mockReturnValue(0)
}));

// --- Type Definitions for Mock Helpers (optional but good practice) ---
type MockRenderer = Partial<Record<keyof RendererFacade, Mock | any>>;
type MockPlayer = Partial<Record<keyof Player, Mock | any>>;
type MockSolarSystem = Partial<Record<keyof SolarSystem, Mock | any>> & { getObjectNear: Mock }; // Ensure getObjectNear exists
type MockPlanet = Partial<Record<keyof Planet, Mock | any>> & { _mockType: 'Planet' };
type MockStarbase = Partial<Record<keyof Starbase, Mock | any>> & { _mockType: 'Starbase' };
type MockPrng = Partial<Record<keyof PRNG, Mock | any>>;

// --- Helper to Create Mock Instances (More Complete) ---
const createMockRenderer = (): MockRenderer => ({
    // Properties (use defaults or null/undefined)
    fitToScreen: vi.fn(),
    updateStatus: vi.fn(),
    clear: vi.fn(),
    renderDiff: vi.fn(),
    drawString: vi.fn(),
    drawHyperspace: vi.fn(),
    drawSolarSystem: vi.fn(),
    drawPlanetSurface: vi.fn(),
    // Private methods don't need explicit mocks unless accessed via `as any`
});

const createMockPlayer = (): MockPlayer => {
    // 1. Instantiate real Player (uses defaults)
    const realPlayer = new Player();

    // 2. Overwrite public methods with mocks
    realPlayer.moveWorld = vi.fn();
    realPlayer.moveSystem = vi.fn();
    realPlayer.moveSurface = vi.fn();
    realPlayer.distanceSqToSystemCoords = vi.fn().mockReturnValue(Infinity);
    realPlayer.addFuel = vi.fn();
    realPlayer.addCargo = vi.fn();

    // 3. Return modified instance
    return realPlayer as MockPlayer;
};

const createMockSystem = (name = 'MockSystem', _type = 'G'): MockSolarSystem => {
    // 1. Create mock PRNG needed for real constructor
    const mockSystemPrng = createMockPrng(`system_${name}_seed`) as PRNG;

    // 2. Instantiate real SolarSystem
    // Note: Constructor generates planets/starbase based on PRNG.
    // We overwrite methods we need to control.
    const realSystem = new SolarSystem(0, 0, mockSystemPrng);

    // 3. Overwrite public methods with mocks
    realSystem.updateOrbits = vi.fn();
    realSystem.getObjectNear = vi.fn().mockReturnValue(null); // Default mock
    realSystem.isAtEdge = vi.fn().mockReturnValue(false);
    // If private methods were made public, mock them here if needed.

    // 4. Return modified instance
    return realSystem as unknown as MockSolarSystem;
};

const createMockStarbase = (name = 'MockStarbase'): MockStarbase => {
    // 1. Create mock PRNG needed for real constructor
    const mockStarbasePrng = createMockPrng(`starbase_${name}_seed`) as PRNG;

    // 2. Instantiate real Starbase
    // Note: Constructor calls ensureSurfaceReady internally
    const realStarbase = new Starbase(name, mockStarbasePrng, 'ContainingSystem');

    // 3. Overwrite methods with mocks (ensureSurfaceReady was called by constructor, overwrite it again if needed)
    realStarbase.ensureSurfaceReady = vi.fn(); // Overwrite with a fresh mock if constructor side effects matter
    realStarbase.getScanInfo = vi.fn().mockReturnValue(['Mock Starbase Info']);

    // 4. Add helper property
    (realStarbase as any)._mockType = 'Starbase';

    // 5. Return modified instance
    return realStarbase as MockStarbase;
};

const createMockPrng = (seed = 'test-seed'): MockPrng => {
    const realPrng = new PRNG(seed);
    const originalSeed = realPrng.getInitialSeed();

    realPrng.getInitialSeed = vi.fn().mockReturnValue(originalSeed);
    realPrng.seedNew = vi.fn().mockImplementation((...additionalSeeds): MockPrng => {
        // Construct the derived seed string similar to the original PRNG logic
        const combinedSeed = `${originalSeed}_${additionalSeeds.join(':')}`;
        // Return a *new*, fully mocked PRNG instance for the derived seed.
        return createMockPrng(combinedSeed);
    });
    // Mock other random methods to return predictable values (e.g., 0.5).
    realPrng.random = vi.fn().mockReturnValue(0.5);
    realPrng.randomInt = vi.fn().mockImplementation((min, max) => Math.floor(min + 0.5 * (max - min + 1)));
    realPrng.choice = vi.fn().mockImplementation((arr) => arr ? arr[Math.floor(0.5 * arr.length)] : undefined);
    realPrng.next = vi.fn().mockReturnValue(0.5);

    return realPrng as MockPrng;
};

const createMockPlanet = (name = 'MockPlanet', type = 'Rock'): MockPlanet => {
    // 1. Create a mock PRNG instance needed for the real Planet constructor
    const mockPlanetPrng = createMockPrng(`planet_${name}_seed`) as PRNG;

    // 2. Instantiate the *real* Planet
    const realPlanet = new Planet(name, type, 10000, 0, mockPlanetPrng, 'G');

    // 3. Overwrite methods with vi.fn() mocks ON THE INSTANCE
    realPlanet.ensureSurfaceReady = vi.fn();
    realPlanet.scan = vi.fn();
    realPlanet.getScanInfo = vi.fn().mockReturnValue(['Mock Scan Info']);
    // Add mocks for any other public Planet methods Game might call here...

    // 4. Add _mockType helper property
    (realPlanet as any)._mockType = 'Planet';

    // 5. Return the modified real instance, cast to the intersection type
    return realPlanet as unknown as MockPlanet; // Using stronger assertion
};

// --- Test Suite ---

describe('Game', () => {
    let mockRendererInstance: ReturnType<typeof createMockRenderer>;
    let mockPlayerInstance: ReturnType<typeof createMockPlayer>;
    let mockPrngInstance: ReturnType<typeof createMockPrng>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRendererInstance = createMockRenderer();
        mockPlayerInstance = createMockPlayer();
        mockPrngInstance = createMockPrng('game-seed');

        // Use type assertion to satisfy TypeScript, as our mocks are intentionally partial/simplified
        vi.mocked(RendererFacade).mockImplementation(() => mockRendererInstance as RendererFacade);
        vi.mocked(Player).mockImplementation(() => mockPlayerInstance as Player);
        vi.mocked(PRNG).mockImplementation((seed) => {
             const instance = seed ? createMockPrng(String(seed)) : mockPrngInstance;
             return instance as PRNG; // Use type assertion
        });
        vi.mocked(SolarSystem).mockImplementation(() => createMockSystem() as unknown as SolarSystem); // Use type assertion

        // Mock loggers and DOM
        vi.mocked(logger.info).mockImplementation(() => {});
        vi.mocked(logger.warn).mockImplementation(() => {});
        vi.mocked(logger.error).mockImplementation(() => {});
        vi.mocked(logger.debug).mockImplementation(() => {});
        vi.mocked(logger.downloadLogFile).mockImplementation(() => {});
        vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 123);
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
        vi.spyOn(performance, 'now').mockReturnValue(Date.now());
        vi.mocked(fastHash).mockReturnValue(0);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('constructor should initialize dependencies and set initial state', () => {
        const game = new Game('fakeCanvas', 'fakeStatus', 'constructor-seed');
        expect(PRNG).toHaveBeenCalledWith('constructor-seed');
        expect(RendererFacade).toHaveBeenCalledWith('fakeCanvas', 'fakeStatus');
        expect(Player).toHaveBeenCalledOnce();
        expect(mockRendererInstance.fitToScreen).toHaveBeenCalled();
        expect((game as any).state).toBe('hyperspace');
    });

    it('startGame should set isRunning and request animation frame', () => {
        const game = new Game('c', 's');
        const updateSpy = vi.spyOn(game as any, '_update').mockImplementation(()=>{});
        const updateStatusSpy = vi.spyOn(game as any, '_updateStatusBar');
        game.startGame();
        expect((game as any).isRunning).toBe(true);
        expect(window.requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
        expect(updateSpy).toHaveBeenCalledOnce();
        expect(updateStatusSpy).toHaveBeenCalledOnce();
        updateSpy.mockRestore();
        updateStatusSpy.mockRestore();
    });

     it('stopGame should clear isRunning and cancel animation frame', () => {
        const game = new Game('c', 's');
        game.startGame();
        const initialFrameId = (game as any).animationFrameId;
        game.stopGame();
        expect((game as any).isRunning).toBe(false);
        expect(window.cancelAnimationFrame).toHaveBeenCalledWith(initialFrameId);
        expect((game as any).animationFrameId).toBeNull();
        expect(mockRendererInstance.updateStatus).toHaveBeenCalledWith("Game stopped. Refresh to restart.");
    });

    // --- State Transition Tests ---
    describe('State Transitions & Actions', () => {
        let game: Game;
        let mockSystem: MockSolarSystem; // Use the mock type

        beforeEach(() => {
             game = new Game('c', 's', 'state-test-seed');
             // Create the mock system instance using the helper
             mockSystem = createMockSystem();
             // Configure the mocked SolarSystem constructor to return this specific instance
             vi.mocked(SolarSystem).mockImplementation(() => mockSystem as unknown as SolarSystem);
             // Set default hash mock
             vi.mocked(fastHash).mockReturnValue(0);
        });

        it('should transition from hyperspace to system on ENTER_SYSTEM near star', () => {
            expect((game as any).state).toBe('hyperspace');
            mockPlayerInstance.worldX = 10; mockPlayerInstance.worldY = 10;
            (game as any).actionQueue.push('ENTER_SYSTEM');
            (game as any)._handleInput();
            expect(SolarSystem).toHaveBeenCalledWith(10, 10, expect.any(Object));
             // Now that the system is created by the action, assign the *returned* mock instance for further checks if needed
            // However, the assertion below checks the state managed by the game instance directly.
             expect((game as any).currentSystem).toBeDefined(); // Check if it was assigned internally
             expect((game as any).currentSystem?.name).toBe('MockSystem'); // Check name if needed
            expect((game as any).state).toBe('system');
            expect(mockPlayerInstance.char).not.toBe(CONFIG.PLAYER_CHAR);
        });

         it('should NOT transition from hyperspace if no star present', () => {
            expect((game as any).state).toBe('hyperspace');
            vi.mocked(fastHash).mockReturnValue(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE + 1);
            mockPlayerInstance.worldX = 5; mockPlayerInstance.worldY = 5;
            (game as any).actionQueue.push('ENTER_SYSTEM');
            (game as any)._handleInput();
            expect((game as any).state).toBe('hyperspace');
            expect((game as any).currentSystem).toBeNull();
            expect((game as any).statusMessage).toContain("No star system detected");
        });

         it('should transition from system to hyperspace on LEAVE_SYSTEM near edge', () => {
            (game as any).state = 'system';
            (game as any).currentSystem = mockSystem; // Assign the mock system
            const edgeDist = mockSystem.edgeRadius * 0.9;
            mockPlayerInstance.systemX = edgeDist; mockPlayerInstance.systemY = 0;
            mockPlayerInstance.distanceSqToSystemCoords.mockReturnValue(edgeDist * edgeDist);
            (game as any).actionQueue.push('LEAVE_SYSTEM');
            (game as any)._handleInput();
            expect((game as any).state).toBe('hyperspace');
            expect((game as any).currentSystem).toBeNull();
            expect(mockPlayerInstance.char).toBe(CONFIG.PLAYER_CHAR);
        });

         it('should NOT transition from system if not near edge', () => {
            (game as any).state = 'system';
            (game as any).currentSystem = mockSystem; // Assign the mock system
            mockPlayerInstance.systemX = 0; mockPlayerInstance.systemY = 0;
            mockPlayerInstance.distanceSqToSystemCoords.mockReturnValue(0);
            const edgeThresholdSq = (mockSystem.edgeRadius * 0.8) ** 2;
            expect(mockPlayerInstance.distanceSqToSystemCoords(0,0)).toBeLessThan(edgeThresholdSq);
            (game as any).actionQueue.push('LEAVE_SYSTEM');
            (game as any)._handleInput();
            expect((game as any).state).toBe('system');
            expect((game as any).statusMessage).toContain("Must travel further");
        });

         it('should transition from system to planet on LAND near planet', () => {
            const mockPlanet = createMockPlanet('TestRock');
            (game as any).state = 'system';
            (game as any).currentSystem = mockSystem; // Assign the mock system

            // Configure getObjectNear on the mockSystem instance
            mockSystem.getObjectNear.mockReturnValue(mockPlanet);

            (game as any).actionQueue.push('LAND');
            (game as any)._handleInput();

            expect((game as any).state).toBe('system');
            expect((game as any).currentPlanet).toEqual(mockPlanet); // Use toEqual for object comparison
            expect((game as any).currentStarbase).toBeNull();
            expect(mockPlanet.ensureSurfaceReady).toHaveBeenCalledOnce();
            expect(mockPlayerInstance.char).toBe(CONFIG.PLAYER_CHAR);
        });

          it('should transition from system to starbase on LAND near starbase', () => {
             const mockStarbase = createMockStarbase('TestBase');
             (game as any).state = 'system';
             (game as any).currentSystem = mockSystem; // Assign the mock system

             // Configure getObjectNear on the mockSystem instance
             mockSystem.getObjectNear.mockReturnValue(mockStarbase);

             (game as any).actionQueue.push('LAND');
             (game as any)._handleInput();

             expect((game as any).state).toBe('system');
             expect((game as any).currentStarbase).toEqual(mockStarbase); // Use toEqual
             expect((game as any).currentPlanet).toBeNull();
             expect(mockStarbase.ensureSurfaceReady).toHaveBeenCalledOnce();
             expect(mockPlayerInstance.char).toBe(CONFIG.PLAYER_CHAR);
         });

         it('should transition from planet to system on LIFTOFF', () => {
            const mockPlanet = createMockPlanet('TestRock');
            (game as any).state = 'planet';
            (game as any).currentPlanet = mockPlanet;
            (game as any).currentSystem = mockSystem;
            (game as any).actionQueue.push('LIFTOFF');
            (game as any)._handleInput();
            expect((game as any).state).toBe('system');
            expect((game as any).currentPlanet).toBeNull();
            expect(mockPlayerInstance.systemX).toBeCloseTo(mockPlanet.systemX + CONFIG.LANDING_DISTANCE * 0.1);
            expect(mockPlayerInstance.systemY).toBeCloseTo(mockPlanet.systemY);
            expect(mockPlayerInstance.char).not.toBe(CONFIG.PLAYER_CHAR);
        });

        it('should transition from starbase to system on LIFTOFF', () => {
            const mockStarbase = createMockStarbase('TestBase');
            (game as any).state = 'starbase';
            (game as any).currentStarbase = mockStarbase;
            (game as any).currentSystem = mockSystem;
            (game as any).actionQueue.push('LIFTOFF');
            (game as any)._handleInput();
            expect((game as any).state).toBe('system');
            expect((game as any).currentStarbase).toBeNull();
            expect(mockPlayerInstance.systemX).toBeCloseTo(mockStarbase.systemX + CONFIG.LANDING_DISTANCE * 0.1);
            expect(mockPlayerInstance.systemY).toBeCloseTo(mockStarbase.systemY);
            expect(mockPlayerInstance.char).not.toBe(CONFIG.PLAYER_CHAR);
        });
    });
    // ... rest of tests ...
});