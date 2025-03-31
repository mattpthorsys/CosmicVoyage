// src/core/game.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game, GameState } from './game'; // Import Game and GameState type
import { Renderer } from '../rendering/renderer';
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { GLYPHS } from '../constants'; // Import GLYPHS if needed by mocks
import { fastHash } from '../utils/hash'; // <<< Import fastHash

// --- Mock Dependencies ---
// Mock entire modules. Vitest hoists these.
vi.mock('../rendering/renderer');
vi.mock('./player');
vi.mock('../entities/solar_system');
vi.mock('../entities/planet');
vi.mock('../entities/starbase');
vi.mock('../utils/prng');
vi.mock('../utils/logger'); // Mock logger to suppress output during tests if needed

// Mock fastHash at the top level
vi.mock('../utils/hash', () => ({
    fastHash: vi.fn().mockReturnValue(0) // Default mock: star exists
}));


// --- Helper to Create Mock Instances (with _mockType) ---
const createMockRenderer = () => ({
    fitToScreen: vi.fn(),
    updateStatus: vi.fn(),
    clear: vi.fn(),
    renderDiff: vi.fn(),
    drawHyperspace: vi.fn(),
    drawSolarSystem: vi.fn(),
    drawPlanetSurface: vi.fn(),
    // Add other methods if Game interacts with them directly
});

const createMockPlayer = () => ({
    worldX: 0,
    worldY: 0,
    systemX: 0,
    systemY: 0,
    surfaceX: 0,
    surfaceY: 0,
    char: '@',
    shipDirection: '^',
    fuel: 500,
    maxFuel: 500,
    mineralUnits: 0,
    cargoCapacity: 100,
    credits: 1000,
    moveWorld: vi.fn(),
    moveSystem: vi.fn(),
    moveSurface: vi.fn(),
    distanceSqToSystemCoords: vi.fn().mockReturnValue(Infinity), // Default far away
    addFuel: vi.fn(),
    addCargo: vi.fn(),
});

const createMockSystem = (name = 'MockSystem', type = 'G') => ({
    name: name,
    starType: type,
    starX: 0,
    starY: 0,
    planets: [],
    starbase: null,
    edgeRadius: 100000,
    systemPRNG: createMockPrng(), // Nested mock
    updateOrbits: vi.fn(),
    getObjectNear: vi.fn().mockReturnValue(null), // Default nothing nearby
    // isAtEdge removed as we check distance directly
});

const createMockPlanet = (name = 'MockPlanet', type = 'Rock') => ({
    name: name,
    type: type,
    systemX: 10000,
    systemY: 0,
    orbitDistance: 10000,
    mineralRichness: 'Average', // Example property
    scanned: false,
    primaryResource: null,
    heightmap: [[0]], // Example minimal map
    ensureSurfaceReady: vi.fn(),
    scan: vi.fn(),
    getScanInfo: vi.fn().mockReturnValue(['Scan info...']),
    _mockType: 'Planet', // <<< Identifier
});

const createMockStarbase = (name = 'MockStarbase') => ({
     name: name,
     type: 'Starbase',
     systemX: 50000,
     systemY: 0,
     orbitDistance: 50000,
     ensureSurfaceReady: vi.fn(),
     getScanInfo: vi.fn().mockReturnValue(['Starbase info...']),
     _mockType: 'Starbase', // <<< Identifier
});

const createMockPrng = (seed = 'test-seed') => ({
    seed: 12345, // Example internal state if needed
    getInitialSeed: vi.fn().mockReturnValue(seed),
    seedNew: vi.fn().mockImplementation((newSeedSuffix) => createMockPrng(`${seed}_${newSeedSuffix}`)), // Chain mock PRNGs
    random: vi.fn().mockReturnValue(0.5),
    randomInt: vi.fn().mockImplementation((min, max) => Math.floor(min + 0.5 * (max - min + 1))),
    choice: vi.fn().mockImplementation((arr) => arr[Math.floor(0.5 * arr.length)]), // Use mocked random
});

// --- Test Suite ---

describe('Game', () => {
    // Hold mock instances used across tests in this suite
    let mockRendererInstance: ReturnType<typeof createMockRenderer>;
    let mockPlayerInstance: ReturnType<typeof createMockPlayer>;
    let mockPrngInstance: ReturnType<typeof createMockPrng>;
    // Mock SolarSystem etc. as needed per test or in beforeEach

    beforeEach(() => {
        // Reset mocks and create fresh instances before each test
        vi.clearAllMocks(); // Clear call counts etc.

        // Create mock instances using helper functions
        mockRendererInstance = createMockRenderer();
        mockPlayerInstance = createMockPlayer();
        mockPrngInstance = createMockPrng('game-seed');

        // Configure the mocked constructors to return our instances
        vi.mocked(Renderer).mockImplementation(() => mockRendererInstance);
        vi.mocked(Player).mockImplementation(() => mockPlayerInstance);
        vi.mocked(PRNG).mockImplementation((seed) => {
            // If constructor receives a specific seed, return a PRNG mock initialized with it
            if (seed) return createMockPrng(String(seed));
            // Otherwise, return the default mockPrngInstance
            return mockPrngInstance;
        });

         // Mock logger methods (optional, if you want to suppress logs during tests)
         vi.mocked(logger.info).mockImplementation(() => {});
         vi.mocked(logger.warn).mockImplementation(() => {});
         vi.mocked(logger.error).mockImplementation(() => {});
         vi.mocked(logger.debug).mockImplementation(() => {});
         vi.mocked(logger.downloadLogFile).mockImplementation(() => {});


         // Mock DOM globals used by Game constructor/methods
         vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
         vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
         vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 123); // Return a dummy ID
         vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
         vi.spyOn(performance, 'now').mockReturnValue(Date.now()); // Use Date.now or a fixed number

         // Reset fastHash mock to default (star exists) before each test
        vi.mocked(fastHash).mockReturnValue(0);

    });

    afterEach(() => {
        // Restore any global mocks if needed (like window methods)
        vi.restoreAllMocks();
    });

    it('constructor should initialize dependencies and set initial state', () => {
        const game = new Game('fakeCanvas', 'fakeStatus', 'constructor-seed');
        expect(PRNG).toHaveBeenCalledWith('constructor-seed');
        expect(Renderer).toHaveBeenCalledWith('fakeCanvas', 'fakeStatus');
        expect(Player).toHaveBeenCalledOnce();
        expect(mockRendererInstance.fitToScreen).toHaveBeenCalled();
        expect((game as any).state).toBe('hyperspace'); // Check initial state directly
    });

    it('startGame should set isRunning and request animation frame', () => {
        const game = new Game('c', 's');
        // Spy on private methods (use `as any` or refactor for testability)
        const updateSpy = vi.spyOn(game as any, '_update').mockImplementation(()=>{}); // Mock implementation to prevent side effects
        const updateStatusSpy = vi.spyOn(game as any, '_updateStatusBar');


        game.startGame();

        expect((game as any).isRunning).toBe(true);
        expect(window.requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
        expect(updateSpy).toHaveBeenCalledOnce(); // Initial update call
        expect(updateStatusSpy).toHaveBeenCalledOnce(); // Initial status bar update

        // Clean up spies
        updateSpy.mockRestore();
        updateStatusSpy.mockRestore();
    });

     it('stopGame should clear isRunning and cancel animation frame', () => {
        const game = new Game('c', 's');
        game.startGame(); // Start the game first
        const initialFrameId = (game as any).animationFrameId;
        expect(initialFrameId).not.toBeNull();

        game.stopGame();

        expect((game as any).isRunning).toBe(false);
        expect(window.cancelAnimationFrame).toHaveBeenCalledWith(initialFrameId);
        expect((game as any).animationFrameId).toBeNull();
        expect(mockRendererInstance.updateStatus).toHaveBeenCalledWith("Game stopped. Refresh to restart.");
    });


    // --- State Transition Tests ---

    describe('State Transitions & Actions', () => {
        let game: Game;
        let mockSystem: ReturnType<typeof createMockSystem>;

        beforeEach(() => {
             // Create game instance for state tests
             game = new Game('c', 's', 'state-test-seed');
             // Create a mock solar system instance for system state tests
             mockSystem = createMockSystem();
             // Configure SolarSystem mock constructor to return this instance when needed
             vi.mocked(SolarSystem).mockImplementation(() => mockSystem);
             // Ensure default fastHash mock (star exists) is active for this block's setup
             vi.mocked(fastHash).mockReturnValue(0);
        });

        it('should transition from hyperspace to system on ENTER_SYSTEM near star', () => {
            expect((game as any).state).toBe('hyperspace'); // Verify initial state
            mockPlayerInstance.worldX = 10;
            mockPlayerInstance.worldY = 10;
            // fastHash mock defaults to 0 (star exists)

            (game as any).actionQueue.push('ENTER_SYSTEM');
            (game as any)._handleInput();

            expect((game as any).state).toBe('system');
            expect((game as any).currentSystem).toBe(mockSystem);
            expect(mockPlayerInstance.char).not.toBe(CONFIG.PLAYER_CHAR);
        });

         it('should NOT transition from hyperspace if no star present', () => {
            expect((game as any).state).toBe('hyperspace'); // Verify initial state
            // Mock fastHash to indicate NO star *specifically for this test*
             vi.mocked(fastHash).mockReturnValue(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE + 1);

             mockPlayerInstance.worldX = 5;
             mockPlayerInstance.worldY = 5;

             (game as any).actionQueue.push('ENTER_SYSTEM');
             (game as any)._handleInput();

             expect((game as any).state).toBe('hyperspace'); // Should remain in hyperspace
             expect((game as any).currentSystem).toBeNull();
             // Check internal status message property instead of renderer mock
             expect((game as any).statusMessage).toContain("No star system detected");
        });

         it('should transition from system to hyperspace on LEAVE_SYSTEM near edge', () => {
            (game as any).state = 'system'; // Set state before action
            (game as any).currentSystem = mockSystem;
             // Simulate being at edge by setting player position far out
             const edgeDist = (game as any).currentSystem.edgeRadius * 0.9; // Closer to edge needed for check
             (game as any).player.systemX = edgeDist;
             (game as any).player.systemY = 0;
             // Mock distance check for this specific scenario
             (game as any).player.distanceSqToSystemCoords.mockReturnValue(edgeDist * edgeDist);

             (game as any).actionQueue.push('LEAVE_SYSTEM');
             (game as any)._handleInput();

             expect((game as any).state).toBe('hyperspace');
             expect((game as any).currentSystem).toBeNull();
             expect(mockPlayerInstance.char).toBe(CONFIG.PLAYER_CHAR);
        });

         it('should NOT transition from system if not near edge', () => {
            (game as any).state = 'system'; // Set state before action
            (game as any).currentSystem = mockSystem;
            (game as any).player.systemX = 0; // Position at center
            (game as any).player.systemY = 0;
             // Explicitly mock distanceSqToSystemCoords to return 0 for player at origin
             (game as any).player.distanceSqToSystemCoords.mockReturnValue(0);

             // Ensure distance check in _leaveSystemAction will fail
             // Calculate threshold inside test for clarity
             const edgeThresholdSq = (mockSystem.edgeRadius * 0.8) ** 2;
             expect((game as any).player.distanceSqToSystemCoords(0,0)).toBeLessThan(edgeThresholdSq);

            (game as any).actionQueue.push('LEAVE_SYSTEM');
            (game as any)._handleInput();

            expect((game as any).state).toBe('system'); // <<< Should REMAIN system
            // Check internal status message property
            expect((game as any).statusMessage).toContain("Must travel further");
        });

         it('should transition from system to planet on LAND near planet', () => {
            const mockPlanet = createMockPlanet('TestRock');
            (game as any).state = 'system';
            (game as any).currentSystem = mockSystem; // Explicitly set currentSystem on the game instance

            // Configure the mock *on the instance*
            vi.mocked(mockSystem.getObjectNear).mockReturnValue(mockPlanet);

            // --- Add Verification Step ---
            // Verify that calling getObjectNear with player coords *does* return the planet
            const playerCoords = { x: mockPlayerInstance.systemX, y: mockPlayerInstance.systemY };
            expect(mockSystem.getObjectNear(playerCoords.x, playerCoords.y)).toBe(mockPlanet);
            // -----------------------------

            (game as any).actionQueue.push('LAND');
            (game as any)._handleInput();

            // If this fails, double-check the game.ts _landAction modification was applied
            expect((game as any).state).toBe('planet');
            expect((game as any).currentPlanet).toBe(mockPlanet);
            expect((game as any).currentStarbase).toBeNull();
            expect(mockPlanet.ensureSurfaceReady).toHaveBeenCalledOnce();
            expect(mockPlayerInstance.char).toBe(CONFIG.PLAYER_CHAR);
        });

          it('should transition from system to starbase on LAND near starbase', () => {
             const mockStarbase = createMockStarbase('TestBase');
             (game as any).state = 'system';
             (game as any).currentSystem = mockSystem; // Explicitly set currentSystem

             // Configure the mock *on the instance*
             vi.mocked(mockSystem.getObjectNear).mockReturnValue(mockStarbase);

             // --- Add Verification Step ---
             const playerCoords = { x: mockPlayerInstance.systemX, y: mockPlayerInstance.systemY };
             expect(mockSystem.getObjectNear(playerCoords.x, playerCoords.y)).toBe(mockStarbase);
             // -----------------------------

             (game as any).actionQueue.push('LAND');
             (game as any)._handleInput();

             // If this fails, double-check the game.ts _landAction modification was applied
             expect((game as any).state).toBe('starbase');
             expect((game as any).currentStarbase).toBe(mockStarbase);
             expect((game as any).currentPlanet).toBeNull();
             expect(mockStarbase.ensureSurfaceReady).toHaveBeenCalledOnce();
             expect(mockPlayerInstance.char).toBe(CONFIG.PLAYER_CHAR);
         });

         it('should transition from planet to system on LIFTOFF', () => {
            const mockPlanet = createMockPlanet('TestRock');
            (game as any).state = 'planet'; // Set state before action
            (game as any).currentPlanet = mockPlanet;
            (game as any).currentSystem = mockSystem; // Need system context for liftoff positioning

            (game as any).actionQueue.push('LIFTOFF');
            (game as any)._handleInput();

            expect((game as any).state).toBe('system');
            expect((game as any).currentPlanet).toBeNull();
            expect(mockPlayerInstance.systemX).toBeCloseTo(mockPlanet.systemX + CONFIG.LANDING_DISTANCE * 0.1);
            expect(mockPlayerInstance.systemY).toBeCloseTo(mockPlanet.systemY);
            expect(mockPlayerInstance.char).not.toBe(CONFIG.PLAYER_CHAR); // Ship char
        });

        it('should transition from starbase to system on LIFTOFF', () => {
            const mockStarbase = createMockStarbase('TestBase');
            (game as any).state = 'starbase'; // Set state before action
            (game as any).currentStarbase = mockStarbase;
            (game as any).currentSystem = mockSystem; // Need system context

             (game as any).actionQueue.push('LIFTOFF');
             (game as any)._handleInput();

             expect((game as any).state).toBe('system');
             expect((game as any).currentStarbase).toBeNull();
             expect(mockPlayerInstance.systemX).toBeCloseTo(mockStarbase.systemX + CONFIG.LANDING_DISTANCE * 0.1);
             expect(mockPlayerInstance.systemY).toBeCloseTo(mockStarbase.systemY);
             expect(mockPlayerInstance.char).not.toBe(CONFIG.PLAYER_CHAR); // Ship char
        });
    });

    // --- Input Handling Tests ---
    // TODO: Add tests for state-specific input handlers (_handleInputHyperspace etc.)
    // These would verify calls to player.moveWorld, player.moveSystem etc.

    // --- Update Logic Tests ---
    // TODO: Add tests for state-specific update logic (_updateHyperspace etc.)
    // These would check status messages and potentially calls to system.updateOrbits

    // --- Render Delegation Tests ---
    // TODO: Add tests for _render method
    // These would check if the correct renderer method (drawHyperspace, drawSolarSystem...) is called based on state

});