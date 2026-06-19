import { describe, expect, it, vi } from 'vitest';
import { eventManager, GameEvents } from '../../../core/event_manager';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';

/** Creates surface travel harness. */
function createSurfaceTravelHarness(justPressed: boolean): any {
  const player = new Player();
  player.terrainVehicle.deployed = true;
  player.terrainVehicle.moving = true;
  const planet = {
    ensureSurfaceReady: () => undefined,
    heightmap: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 64)),
  };
  return Object.assign(Object.create(Game.prototype), {
    player,
    stateManager: { state: 'planet', currentPlanet: planet },
    inputManager: {
      isActionActive: (action: string) => action === 'MOVE_RIGHT',
      wasActionJustPressed: (action: string) => justPressed && action === 'MOVE_RIGHT',
    },
    approachTargetSignature: null,
    surfaceMapExpanded: false,
    surfaceLegendOpen: false,
    statusMessage: '',
    forceFullRender: false,
    _publishStatusUpdate: () => undefined,
  });
}

describe('surface travel input', () => {
  it('only moves the surface vehicle on a fresh arrow key press', () => {
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);
    try {
      createSurfaceTravelHarness(false)._handleMovementInput();
      expect(publish).not.toHaveBeenCalledWith(GameEvents.MOVE_REQUESTED, expect.anything());

      createSurfaceTravelHarness(true)._handleMovementInput();
      expect(publish).toHaveBeenCalledWith(
        GameEvents.MOVE_REQUESTED,
        expect.objectContaining({ dx: 1, dy: 0, context: 'planet' })
      );
    } finally {
      publish.mockRestore();
    }
  });

  it('blocks terrain movement while the expanded surface map is open', () => {
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);
    try {
      const game = createSurfaceTravelHarness(true);
      game.surfaceMapExpanded = true;

      game._handleMovementInput();

      expect(publish).not.toHaveBeenCalledWith(GameEvents.MOVE_REQUESTED, expect.anything());
    } finally {
      publish.mockRestore();
    }
  });
});
