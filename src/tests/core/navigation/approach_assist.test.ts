import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../config';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';

function createApproachHarness(zoomIndex: number): any {
  const player = new Player();
  player.position.systemX = 0;
  player.position.systemY = 0;
  const target = {
    name: 'Target A',
    systemX: 1e12,
    systemY: 0,
  };
  return Object.assign(Object.create(Game.prototype), {
    player,
    stateManager: { state: 'system' },
    currentZoomLevelIndex: zoomIndex,
    zoomLevels: [0.25, 0.5, 1, 2, 4, 8],
    approachTargetSignature: 'star:Target A',
    forceFullRender: false,
    statusMessage: '',
    getSelectedTarget: () => target,
  });
}

describe('approach assist', () => {
  it('moves at the same system speed as cursor travel for the current zoom', () => {
    const game = createApproachHarness(3);

    game.updateApproachAssist(0.016);

    expect(game.player.position.systemX).toBe(CONFIG.SYSTEM_MOVE_INCREMENT);
    expect(game.player.position.systemY).toBe(0);
  });

  it('uses the same zoom speed multiplier as cursor travel', () => {
    const game = createApproachHarness(4);

    game.updateApproachAssist(0.016);

    expect(game.player.position.systemX).toBe(CONFIG.SYSTEM_MOVE_INCREMENT * 0.5);
  });
});
