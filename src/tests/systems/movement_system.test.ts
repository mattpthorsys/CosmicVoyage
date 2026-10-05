import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { Player } from '../../core/player';
import { getOperationalCapabilities } from '../../core/operational_capabilities';
import { MovementSystem } from '../../systems/movement_system';
import { getTowLocalStepFactor } from '../../core/tow_performance';
import { eventManager, GameEvents } from '../../core/event_manager';

afterEach(() => vi.restoreAllMocks());

describe('untowed movement baseline', () => {
  it('preserves discrete hyperspace position and diagonal fuel accounting', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const player = new Player(3, 4, '@', 'untowed-haul-baseline');
    const movement = new MovementSystem(player);
    const initialFuel = player.resources.fuel;
    const crewFactor = getOperationalCapabilities(player.crew, player.ship).hyperspaceFuelMultiplier;
    try {
      movement.handleMoveRequest({
        dx: -1,
        dy: 1,
        isFineControl: false,
        isBoost: false,
        context: 'hyperspace',
      });
      expect(player.position.worldX).toBe(2);
      expect(player.position.worldY).toBe(5);
      expect(initialFuel - player.resources.fuel).toBeCloseTo(
        CONFIG.HYPERSPACE_MOVE_FUEL_COST * Math.SQRT2 * 1.4 * crewFactor
      );
    } finally {
      movement.destroy();
    }
  });

  it('keeps system zoom/fine control independent of engine class and cargo volume', () => {
    const player = new Player(0, 0, '@', 'untowed-haul-baseline');
    const movement = new MovementSystem(player);
    player.ship.engineClass = 3;
    player.cargoHold.items.IRON = 90;
    const initialFuel = player.resources.fuel;
    try {
      movement.handleMoveRequest({
        dx: 1,
        dy: -1,
        isFineControl: true,
        isBoost: false,
        context: 'system',
        speedMultiplier: 0.5,
      });
      const expectedStep = CONFIG.SYSTEM_MOVE_INCREMENT * CONFIG.FINE_CONTROL_FACTOR * 0.5;
      expect(player.position.systemX).toBe(expectedStep);
      expect(player.position.systemY).toBe(-expectedStep);
      expect(player.resources.fuel).toBe(initialFuel);
    } finally {
      movement.destroy();
    }
  });
});

describe('attached towing movement', () => {
  it('applies the tow factor after zoom/fine scaling and restores ordinary handling after recovery', () => {
    const player = new Player();
    player.position.systemX = 0;
    player.position.systemY = 0;
    player.ship.engineClass = 2;
    let mass = 80000;
    const movement = new MovementSystem(player, () => mass);
    const initialFuel = player.resources.fuel;
    try {
      const request = {
        dx: 1,
        dy: -1,
        isFineControl: true,
        isBoost: false,
        context: 'system' as const,
        speedMultiplier: 0.5,
      };
      movement.handleMoveRequest(request);
      const step =
        CONFIG.SYSTEM_MOVE_INCREMENT * CONFIG.FINE_CONTROL_FACTOR * 0.5 * getTowLocalStepFactor(mass, 2);
      expect(player.position.systemX).toBe(step);
      expect(player.position.systemY).toBe(-step);
      expect(player.resources.fuel).toBe(initialFuel);
      mass = 0;
      movement.handleMoveRequest(request);
      expect(player.position.systemX - step).toBeCloseTo(
        CONFIG.SYSTEM_MOVE_INCREMENT * CONFIG.FINE_CONTROL_FACTOR * 0.5
      );
    } finally {
      movement.destroy();
    }
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'blocks raw hyperspace movement including fine=%s and boost=%s without consuming fuel',
    (fine, boost) => {
      const player = new Player();
      const movement = new MovementSystem(player, () => 1200);
      const before = structuredClone(player.position);
      const fuel = player.resources.fuel;
      const failure = vi.fn();
      const unsubscribe = eventManager.subscribe(GameEvents.ACTION_FAILED, failure);
      try {
        eventManager.publish(GameEvents.MOVE_REQUESTED, {
          dx: 1,
          dy: -1,
          isFineControl: fine,
          isBoost: boost,
          context: 'hyperspace',
        });
        expect(player.position).toEqual(before);
        expect(player.resources.fuel).toBe(fuel);
        expect(failure).toHaveBeenCalledWith(
          expect.objectContaining({ reason: expect.stringContaining('haul voyage') })
        );
      } finally {
        unsubscribe();
        movement.destroy();
      }
    }
  );

  it('rejects spoofed movement contexts rather than permitting a hyperspace bypass', () => {
    const player = new Player();
    const movement = new MovementSystem(
      player,
      () => 1200,
      () => 'hyperspace'
    );
    const before = structuredClone(player.position);
    try {
      movement.handleMoveRequest({ dx: 1, dy: 0, isFineControl: false, isBoost: false, context: 'system' });
      expect(player.position).toEqual(before);
    } finally {
      movement.destroy();
    }
  });
});
