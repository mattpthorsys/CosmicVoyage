// src/core/game_state_manager.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameStateManager } from './game_state_manager';
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { CONFIG } from '../config';
import { GLYPHS } from '../constants';

// --- Mock Dependencies ---
vi.mock('./player');
vi.mock('../entities/solar_system');
vi.mock('../entities/planet');
vi.mock('../entities/starbase');
vi.mock('../utils/prng');
vi.mock('../utils/hash');
vi.mock('../utils/logger');

// --- Mock Helper Types ---
type MockPlayer = Player & {
  // Add specific mocks if needed, otherwise rely on partial implementation
};
type MockPrng = PRNG & {
  // Add specific mocks if needed
};
type MockSolarSystem = SolarSystem & {
  getObjectNear: vi.Mock; // Mock specific methods
};
type MockPlanet = Planet & {
  ensureSurfaceReady: vi.Mock;
};
type MockStarbase = Starbase & {
  ensureSurfaceReady: vi.Mock;
};

describe('GameStateManager', () => {
  let mockPlayer: MockPlayer;
  let mockGamePrng: MockPrng;
  let stateManager: GameStateManager;
  let mockSystemInstance: MockSolarSystem;
  let mockPlanetInstance: MockPlanet;
  let mockStarbaseInstance: MockStarbase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock Player
    mockPlayer = {
      worldX: 0, worldY: 0,
      systemX: 0, systemY: 0,
      surfaceX: 0, surfaceY: 0,
      char: CONFIG.PLAYER_CHAR,
      shipDirection: GLYPHS.SHIP_NORTH,
      distanceSqToSystemCoords: vi.fn().mockReturnValue(0),
      credits: 1000, // Example value
      fuel: 100,
      maxFuel: 200,
      cargoCapacity: 50,
      cargo: [],
      addCredits: vi.fn(),
      removeCredits: vi.fn(),
      refuel: vi.fn(),
      addCargo: vi.fn(),
      removeCargo: vi.fn(),
      // Mock other player methods if needed by transitions
      mineralUnits: 0, // Example value
      moveWorld: vi.fn(),
      moveSystem: vi.fn(),
      moveSurface: vi.fn(),
      addFuel: vi.fn(),
    } as MockPlayer;

    // Create mock PRNG
    mockGamePrng = {
      seed: 12345, // Example seed value
      seedNew: vi.fn().mockReturnThis(), // Return self for chaining
      random: vi.fn().mockReturnValue(0.5),
      choice: vi.fn().mockImplementation((arr) => arr[0]), // Default choice
      getInitialSeed: vi.fn().mockReturnValue('game-base-seed'),
      // Add other necessary methods from PRNG class
    } as unknown as MockPrng;

    // Mock SolarSystem constructor and instance methods
    mockSystemInstance = {
        name: 'MockedSystem',
        starType: 'G',
        edgeRadius: 100000, // Example value
        getObjectNear: vi.fn().mockReturnValue(null), // Default: nothing nearby
        planets: [],
        starbase: null,
        // Mock other SolarSystem properties/methods if needed
    } as unknown as MockSolarSystem;
    vi.mocked(SolarSystem).mockImplementation(() => mockSystemInstance);

     // Mock Planet instance
    mockPlanetInstance = {
        name: 'MockPlanet',
        type: 'Rock',
        systemX: 5000, systemY: 0,
        orbitDistance: 5000,
        heightmap: [[0]], // Need non-null for land logic
        heightLevelColors: ['#FFF'],
        ensureSurfaceReady: vi.fn(), // Mock this crucial method
    } as unknown as MockPlanet;

    // Mock Starbase instance
    mockStarbaseInstance = {
        name: 'MockStarbase',
        type: 'Starbase',
        systemX: 15000, systemY: 0,
        orbitDistance: 15000,
        ensureSurfaceReady: vi.fn(), // Mock this crucial method
    } as unknown as MockStarbase;


    // Create GameStateManager instance
    stateManager = new GameStateManager(mockPlayer, mockGamePrng);

    // Reset fastHash mock to default (star exists)
    vi.mocked(fastHash).mockReturnValue(0);
  });

  it('constructor should initialize state to hyperspace', () => {
    expect(stateManager.state).toBe('hyperspace');
    expect(stateManager.currentSystem).toBeNull();
    expect(stateManager.currentPlanet).toBeNull();
    expect(stateManager.currentStarbase).toBeNull();
  });

  describe('enterSystem', () => {
    it('should transition to system state if star is present', () => {
      vi.mocked(fastHash).mockReturnValue(0); // Star exists
      const result = stateManager.enterSystem();

      expect(result).toBe(true);
      expect(stateManager.state).toBe('system');
      expect(stateManager.currentSystem).toBe(mockSystemInstance); // Check if the mock was assigned
      expect(stateManager.currentPlanet).toBeNull();
      expect(stateManager.currentStarbase).toBeNull();
      // Check if player position was updated (relative to system edge)
      expect(mockPlayer.systemX).not.toBe(0);
      expect(mockPlayer.systemY).not.toBe(0);
      expect(mockPlayer.char).toBe(GLYPHS.SHIP_NORTH); // Player char changes
    });

    it('should not transition and return false if no star is present', () => {
      vi.mocked(fastHash).mockReturnValue(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE + 1); // No star
      const result = stateManager.enterSystem();

      expect(result).toBe(false);
      expect(stateManager.state).toBe('hyperspace'); // State unchanged
      expect(stateManager.currentSystem).toBeNull();
    });

    it('should handle errors during system creation and return false', () => {
        vi.mocked(fastHash).mockReturnValue(0); // Star exists
        vi.mocked(SolarSystem).mockImplementationOnce(() => { throw new Error("Test Creation Error"); });

        const result = stateManager.enterSystem();

        expect(result).toBe(false);
        expect(stateManager.state).toBe('hyperspace');
        expect(stateManager.currentSystem).toBeNull();
    });
  });

  describe('leaveSystem', () => {
    beforeEach(() => {
        // Set up initial state for leaving system tests
        (stateManager as any)._state = 'system';
        (stateManager as any)._currentSystem = mockSystemInstance;
    });

    it('should transition to hyperspace state if near edge', () => {
        const edgeDist = mockSystemInstance.edgeRadius * 0.9;
        mockPlayer.systemX = edgeDist; mockPlayer.systemY = 0;
        (mockPlayer.distanceSqToSystemCoords as vi.Mock).mockReturnValueOnce(edgeDist * edgeDist); // Near edge

        const result = stateManager.leaveSystem();

        expect(result).toBe(true);
        expect(stateManager.state).toBe('hyperspace');
        expect(stateManager.currentSystem).toBeNull();
        expect(stateManager.currentPlanet).toBeNull();
        expect(stateManager.currentStarbase).toBeNull();
        expect(mockPlayer.char).toBe(CONFIG.PLAYER_CHAR); // Player char changes back
    });

    it('should not transition and return false if not near edge', () => {
        mockPlayer.systemX = 0; mockPlayer.systemY = 0;
        (mockPlayer.distanceSqToSystemCoords as vi.Mock).mockReturnValueOnce(0); // At center

        const result = stateManager.leaveSystem();

        expect(result).toBe(false);
        expect(stateManager.state).toBe('system'); // State unchanged
        expect(stateManager.currentSystem).toBe(mockSystemInstance);
    });

    it('should return false if not in system state initially', () => {
        (stateManager as any)._state = 'hyperspace'; // Set wrong initial state
        (stateManager as any)._currentSystem = null;
        const result = stateManager.leaveSystem();
        expect(result).toBe(false);
        expect(stateManager.state).toBe('hyperspace');
    });
  });

  describe('landOnNearbyObject', () => {
      beforeEach(() => {
        // Set up initial state for landing tests
        (stateManager as any)._state = 'system';
        (stateManager as any)._currentSystem = mockSystemInstance;
      });

      it('should transition to planet state if near a planet', () => {
        mockSystemInstance.getObjectNear.mockReturnValue(mockPlanetInstance); // Mock finding planet

        const result = stateManager.landOnNearbyObject();

        expect(result).toBe(mockPlanetInstance);
        expect(stateManager.state).toBe('planet');
        expect(stateManager.currentPlanet).toBe(mockPlanetInstance);
        expect(stateManager.currentStarbase).toBeNull();
        expect(mockPlanetInstance.ensureSurfaceReady).toHaveBeenCalledOnce();
        expect(mockPlayer.char).toBe(CONFIG.PLAYER_CHAR);
        // Check player surface coords were set (e.g., to map center)
        expect(mockPlayer.surfaceX).toBe(Math.floor((mockPlanetInstance.heightmap?.length ?? 0) / 2));
      });

      it('should transition to starbase state if near a starbase', () => {
        mockSystemInstance.getObjectNear.mockReturnValue(mockStarbaseInstance); // Mock finding starbase

        const result = stateManager.landOnNearbyObject();

        expect(result).toBe(mockStarbaseInstance);
        expect(stateManager.state).toBe('starbase');
        expect(stateManager.currentStarbase).toBe(mockStarbaseInstance);
        expect(stateManager.currentPlanet).toBeNull();
        expect(mockStarbaseInstance.ensureSurfaceReady).toHaveBeenCalledOnce();
        expect(mockPlayer.char).toBe(CONFIG.PLAYER_CHAR);
        expect(mockPlayer.surfaceX).toBe(0); // Check specific starbase coords
        expect(mockPlayer.surfaceY).toBe(0);
      });

      it('should return null and not transition if no object is nearby', () => {
        mockSystemInstance.getObjectNear.mockReturnValue(null); // Nothing nearby

        const result = stateManager.landOnNearbyObject();

        expect(result).toBeNull();
        expect(stateManager.state).toBe('system'); // State unchanged
        expect(stateManager.currentPlanet).toBeNull();
        expect(stateManager.currentStarbase).toBeNull();
      });

      it('should return null and not transition if ensureSurfaceReady fails', () => {
        mockPlanetInstance.ensureSurfaceReady.mockImplementationOnce(() => { throw new Error("Surface gen failed"); });
        mockSystemInstance.getObjectNear.mockReturnValue(mockPlanetInstance);

        const result = stateManager.landOnNearbyObject();

        expect(result).toBeNull();
        expect(stateManager.state).toBe('system'); // State unchanged
      });

      it('should return null if not in system state', () => {
         (stateManager as any)._state = 'hyperspace';
         const result = stateManager.landOnNearbyObject();
         expect(result).toBeNull();
      });
  });

  describe('liftOff', () => {
     beforeEach(() => {
        // Need a current system for liftoff positioning
        (stateManager as any)._currentSystem = mockSystemInstance;
     });

     it('should transition from planet to system', () => {
        (stateManager as any)._state = 'planet';
        (stateManager as any)._currentPlanet = mockPlanetInstance;

        const result = stateManager.liftOff();

        expect(result).toBe(true);
        expect(stateManager.state).toBe('system');
        expect(stateManager.currentPlanet).toBeNull();
        expect(stateManager.currentStarbase).toBeNull();
        // Check player position is near planet's system coords
        expect(mockPlayer.systemX).toBeCloseTo(mockPlanetInstance.systemX + CONFIG.LANDING_DISTANCE * 0.1);
        expect(mockPlayer.char).toBe(GLYPHS.SHIP_NORTH);
     });

      it('should transition from starbase to system', () => {
        (stateManager as any)._state = 'starbase';
        (stateManager as any)._currentStarbase = mockStarbaseInstance;

        const result = stateManager.liftOff();

        expect(result).toBe(true);
        expect(stateManager.state).toBe('system');
        expect(stateManager.currentPlanet).toBeNull();
        expect(stateManager.currentStarbase).toBeNull();
        expect(mockPlayer.systemX).toBeCloseTo(mockStarbaseInstance.systemX + CONFIG.LANDING_DISTANCE * 0.1);
        expect(mockPlayer.char).toBe(GLYPHS.SHIP_NORTH);
     });

      it('should return false if not landed/docked', () => {
        (stateManager as any)._state = 'system';
        const result = stateManager.liftOff();
        expect(result).toBe(false);
        expect(stateManager.state).toBe('system');
      });

      it('should recover to hyperspace if liftoff occurs without a current system', () => {
        (stateManager as any)._state = 'planet';
        (stateManager as any)._currentPlanet = mockPlanetInstance;
        (stateManager as any)._currentSystem = null; // Simulate error state

        const result = stateManager.liftOff();

        expect(result).toBe(false); // Indicates abnormal transition/failure
        expect(stateManager.state).toBe('hyperspace'); // Recovered state
      });
  });

});