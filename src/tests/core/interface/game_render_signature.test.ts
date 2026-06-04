import { describe, expect, it } from 'vitest';
import { Game } from '../../../core/game';

function createRenderGateHarness(): any {
  return Object.assign(Object.create(Game.prototype), {
    forceFullRender: false,
    popupState: 'inactive',
    starbaseAlert: '',
    lastMainRenderSignature: '',
    stateManager: { state: 'hyperspace' },
    player: {
      position: {
        worldX: 12,
        worldY: -7,
      },
      render: {
        char: '@',
      },
    },
  });
}

describe('Game main render signatures', () => {
  it('uses stable hyperspace signatures while the player is stationary', () => {
    const game = createRenderGateHarness();

    const first = game.getMainRenderSignature();
    const second = game.getMainRenderSignature();

    expect(first).toBe('hyperspace|12|-7|@');
    expect(second).toBe(first);
  });

  it('changes hyperspace signatures when the player moves', () => {
    const game = createRenderGateHarness();
    const first = game.getMainRenderSignature();

    game.player.position.worldX += 1;

    expect(game.getMainRenderSignature()).not.toBe(first);
  });

  it('can skip unchanged hyperspace main renders without suppressing direct overlays', () => {
    const game = createRenderGateHarness();
    const signature = game.getMainRenderSignature();
    game.lastMainRenderSignature = signature;

    expect(game.canSkipMainRender('hyperspace', false, signature)).toBe(true);
    expect(game.canSkipMainRender('hyperspace', true, signature)).toBe(false);
  });

  it('advances orbital globe phase by simulated time over body rotation period', () => {
    const game = createRenderGateHarness();
    game.orbitElapsedSeconds = 40;
    const body = { rotationPeriodHours: 24 };
    const simulatedSecondsPerRealSecond = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);

    expect(game.getOrbitGlobeRotationPhase(body)).toBeCloseTo((40 * simulatedSecondsPerRealSecond) / (24 * 60 * 60));
  });

  it('suppresses HUD foreground while modal navigation menus are open', () => {
    const game = createRenderGateHarness();
    game.shipMenuOpen = false;
    game.targetMenuOpen = false;
    expect(game.shouldSuppressHudForeground()).toBe(false);

    game.targetMenuOpen = true;
    expect(game.shouldSuppressHudForeground()).toBe(true);

    game.targetMenuOpen = false;
    game.shipMenuOpen = true;
    expect(game.shouldSuppressHudForeground()).toBe(true);
  });
});
