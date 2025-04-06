// src/core/action_processor.test.ts

/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionProcessor } from './action_processor';
import { GameStateManager, GameState } from './game_state_manager';
import { Player } from './player';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { MineralRichness } from '../constants';
import { CONFIG } from '../config';

// Mock dependencies
vi.mock('./player');
vi.mock('./game_state_manager');
vi.mock('../entities/planet'); // Needed for instanceof check if not using _mockType
vi.mock('../entities/starbase');
vi.mock('../utils/logger');

// --- Mock Helper Types ---
type MockPlayer = Player & {
  // Add specific mocks as needed
  moveWorld: vi.Mock;
  moveSystem: vi.Mock;
  moveSurface: vi.Mock;
  addCargo: vi.Mock;
  addFuel: vi.Mock; // Assuming refuel action needs it
};
type MockGameStateManager = GameStateManager & {
  // Add specific mocks as needed
  enterSystem: vi.Mock;
  leaveSystem: vi.Mock;
  landOnNearbyObject: vi.Mock;
  liftOff: vi.Mock;
  // Need to mock getters as well
  state: GameState;
  currentPlanet: Planet | null;
  currentStarbase: Starbase | null;
};
type MockPlanet = Planet & {
  scan: vi.Mock;
  systemPRNG: { random: vi.Mock },
  mineralRichness: MineralRichness,
  type: string;
};
type MockStarbase = Starbase & {
  // No specific actions processed directly by Starbase in ActionProcessor yet
};

describe('ActionProcessor', () => {
  let mockPlayer: MockPlayer;
  let mockStateManager: MockGameStateManager;
  let actionProcessor: ActionProcessor;
  let mockPlanet: MockPlanet;
  let mockStarbase: MockStarbase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Mocks
    mockPlayer = {
      moveWorld: vi.fn(),
      moveSystem: vi.fn(),
      moveSurface: vi.fn(),
      addCargo: vi.fn().mockReturnValue(true), // Default success
      addFuel: vi.fn(),
      credits: 1000, // Example value
      fuel: 400,
      maxFuel: 500,
      mineralUnits: 0,
      cargoCapacity: 100,
      // Mock other player properties accessed by actions if needed
    } as unknown as MockPlayer;

    mockPlanet = {
      name: 'Test Planet',
      type: 'Rock',
      scanned: false,
      mineralRichness: MineralRichness.AVERAGE,
      heightmap: [[0]], // Minimal map for moveSurface check
      systemPRNG: { random: vi.fn().mockReturnValue(1.0) }, // For mining randomness
      scan: vi.fn(() => {
        // Simulate scan results
        mockPlanet.scanned = true;
        mockPlanet.primaryResource = 'Testium';
      }),
      ensureSurfaceReady: vi.fn(),
    } as unknown as MockPlanet;

    mockStarbase = {
      name: 'Test Starbase',
      type: 'Starbase', // Ensure type is set for logic if needed
      ensureSurfaceReady: vi.fn(),
    } as unknown as MockStarbase;

    mockStateManager = {
      // Default state
      state: 'hyperspace',
      currentSystem: null,
      currentPlanet: null,
      currentStarbase: null,
      // Mock methods
      enterSystem: vi.fn().mockReturnValue(true), // Default success
      leaveSystem: vi.fn().mockReturnValue(true),
      landOnNearbyObject: vi.fn().mockReturnValue(null), // Default no object found
      liftOff: vi.fn().mockReturnValue(true),
      // Explicitly cast getters if needed, but direct property assignment is simpler here
    } as unknown as MockGameStateManager;

    // Instantiate ActionProcessor with mocks
    actionProcessor = new ActionProcessor(mockPlayer, mockStateManager);
  });

  // --- Test Cases ---

  describe('Hyperspace Actions', () => {
    beforeEach(() => {
      mockStateManager.state = 'hyperspace'; // Set state for tests
    });

    it('should call player.moveWorld for MOVE actions', () => {
      actionProcessor.processAction('MOVE_UP');
      expect(mockPlayer.moveWorld).toHaveBeenCalledWith(0, -1);
      actionProcessor.processAction('MOVE_LEFT');
      expect(mockPlayer.moveWorld).toHaveBeenCalledWith(-1, 0);
    });

    it('should call stateManager.enterSystem for ENTER_SYSTEM action', () => {
      const status = actionProcessor.processAction('ENTER_SYSTEM');
      expect(mockStateManager.enterSystem).toHaveBeenCalledOnce();
      expect(status).toMatch(/Entering system|No star system detected/); // Check status msg
    });
  });

  describe('System Actions', () => {
    beforeEach(() => {
      mockStateManager.state = 'system'; // Set state
    });

    it('should call player.moveSystem for MOVE actions (no fine control)', () => {
      actionProcessor.processAction('MOVE_DOWN');
      expect(mockPlayer.moveSystem).toHaveBeenCalledWith(0, 1, false);
      actionProcessor.processAction('MOVE_RIGHT');
      expect(mockPlayer.moveSystem).toHaveBeenCalledWith(1, 0, false);
    });

    it('should call player.moveSystem for FINE_MOVE actions (with fine control)', () => {
      actionProcessor.processAction('FINE_MOVE_UP');
      expect(mockPlayer.moveSystem).toHaveBeenCalledWith(0, -1, true);
      actionProcessor.processAction('FINE_MOVE_LEFT');
      expect(mockPlayer.moveSystem).toHaveBeenCalledWith(-1, 0, true);
    });

    it('should call stateManager.leaveSystem for LEAVE_SYSTEM action', () => {
      const status = actionProcessor.processAction('LEAVE_SYSTEM');
      expect(mockStateManager.leaveSystem).toHaveBeenCalledOnce();
      expect(status).toMatch(/Entered hyperspace|Must travel further/);
    });

    it('should call stateManager.landOnNearbyObject for LAND action', () => {
      const status = actionProcessor.processAction('LAND');
      expect(mockStateManager.landOnNearbyObject).toHaveBeenCalledOnce();
      expect(status).toMatch(/Approaching|Nothing nearby/);
    });
  });

  describe('Planet Actions', () => {
    beforeEach(() => {
        mockStateManager.state = 'planet'; // Set state
        mockStateManager.currentPlanet = mockPlanet; // Set context
    });

    it('should call player.moveSurface for MOVE actions', () => {
        actionProcessor.processAction('MOVE_UP');
        expect(mockPlanet.ensureSurfaceReady).toHaveBeenCalled(); // Ensure map ready
        expect(mockPlayer.moveSurface).toHaveBeenCalledWith(0, -1, expect.any(Number));
    });

     it('should call stateManager.liftOff for LIFTOFF action', () => {
        const status = actionProcessor.processAction('LIFTOFF');
        expect(mockStateManager.liftOff).toHaveBeenCalledOnce();
        expect(status).toMatch(/Liftoff/);
     });

     it('should call planet.scan for SCAN action if not already scanned', () => {
        mockPlanet.scanned = false;
        const status = actionProcessor.processAction('SCAN');
        expect(mockPlanet.scan).toHaveBeenCalledOnce();
        expect(status).toContain('scan complete');
     });

      it('should return status if planet already scanned on SCAN action', () => {
        mockPlanet.scanned = true;
        const status = actionProcessor.processAction('SCAN');
        expect(mockPlanet.scan).not.toHaveBeenCalled();
        expect(status).toContain('already been scanned');
     });

      it('should call player.addCargo for MINE action if minerals present', () => {
        mockPlanet.mineralRichness = MineralRichness.RICH; // Ensure minable
        const status = actionProcessor.processAction('MINE');
        expect(mockPlayer.addCargo).toHaveBeenCalledOnce();
        expect(mockPlayer.addCargo).toHaveBeenCalledWith(expect.any(Number)); // Check amount > 0
        expect(status).toMatch(/Mined|Mining failed/); // Status reflects success/fail/full
      });

      it('should return status and not call addCargo if no minerals on MINE action', () => {
        mockPlanet.mineralRichness = MineralRichness.NONE;
        const status = actionProcessor.processAction('MINE');
        expect(mockPlayer.addCargo).not.toHaveBeenCalled();
        expect(status).toContain('no significant mineral deposits');
      });

      it('should return status if trying to mine a Gas Giant', () => {
         mockPlanet.type = 'GasGiant';
         mockPlanet.mineralRichness = MineralRichness.RICH;
         const status = actionProcessor.processAction('MINE');
         expect(mockPlayer.addCargo).not.toHaveBeenCalled();
         expect(status).toContain('Cannot mine GasGiant');
      });
  });

  describe('Starbase Actions', () => {
     beforeEach(() => {
        mockStateManager.state = 'starbase'; // Set state
        mockStateManager.currentStarbase = mockStarbase; // Set context
    });

     it('should call stateManager.liftOff for LIFTOFF action', () => {
        const status = actionProcessor.processAction('LIFTOFF');
        expect(mockStateManager.liftOff).toHaveBeenCalledOnce();
        expect(status).toMatch(/Departing|Liftoff failed/);
     });

     it('should perform trade logic for TRADE action (sell all)', () => {
        mockPlayer.mineralUnits = 50;
        const status = actionProcessor.processAction('TRADE');
        expect(mockPlayer.mineralUnits).toBe(0);
        expect(mockPlayer.credits).toBe(1000 + 50 * CONFIG.MINERAL_SELL_PRICE);
        expect(status).toContain('Sold 50 units');
     });

     it('should return status if no minerals to sell on TRADE action', () => {
        mockPlayer.mineralUnits = 0;
        const status = actionProcessor.processAction('TRADE');
        expect(status).toContain('Cargo hold is empty');
        expect(mockPlayer.credits).toBe(1000); // Credits unchanged
     });

     it('should call player.addFuel and deduct credits for REFUEL action', () => {
        mockPlayer.fuel = 100;
        mockPlayer.maxFuel = 500;
        mockPlayer.credits = 100; // Enough for some fuel
        const fuelNeeded = 400;
        const fuelPerCredit = CONFIG.FUEL_PER_CREDIT;
        const maxAffordable = 100 * fuelPerCredit; // 1000
        const fuelToBuy = Math.min(fuelNeeded, maxAffordable); // 400
        const cost = Math.ceil(fuelToBuy / fuelPerCredit); // ceil(400/10) = 40

        const status = actionProcessor.processAction('REFUEL');

        expect(mockPlayer.addFuel).toHaveBeenCalledWith(fuelToBuy); // Buy 400
        expect(mockPlayer.credits).toBe(1000 - cost); // 1000 - 40 = 960
        expect(status).toContain(`Purchased ${fuelToBuy} fuel`);
     });

     it('should return status if fuel tank is full on REFUEL action', () => {
        mockPlayer.fuel = 500;
        mockPlayer.maxFuel = 500;
        const status = actionProcessor.processAction('REFUEL');
        expect(mockPlayer.addFuel).not.toHaveBeenCalled();
        expect(status).toContain('Fuel tank is already full');
     });

     it('should return status if not enough credits on REFUEL action', () => {
        mockPlayer.fuel = 100;
        mockPlayer.maxFuel = 500;
        mockPlayer.credits = 1; // Not enough credits
        const status = actionProcessor.processAction('REFUEL');
        expect(mockPlayer.addFuel).not.toHaveBeenCalled();
        expect(status).toContain('Not enough credits');
     });
  });
});