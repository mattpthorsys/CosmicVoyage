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
});
