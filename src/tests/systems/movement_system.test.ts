import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { Player } from '../../core/player';
import { getOperationalCapabilities } from '../../core/operational_capabilities';
import { MovementSystem } from '../../systems/movement_system';

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
