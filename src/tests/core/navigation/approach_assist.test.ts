import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../../config';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';
import { Starbase } from '../../../entities/starbase';
import { GLYPHS } from '../../../constants';
import { Planet } from '../../../entities/planet';

/** Creates approach harness. */
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

  it('keeps starbase approach well inside orbital action distance', () => {
    const player = new Player();
    const target = Object.assign(Object.create(Starbase.prototype), {
      name: 'Dock A',
      systemX: CONFIG.LANDING_DISTANCE,
      systemY: 0,
    }) as Starbase;
    const game = Object.assign(Object.create(Game.prototype), {
      player,
      stateManager: { state: 'system' },
      currentZoomLevelIndex: 3,
      zoomLevels: [0.25, 0.5, 1, 2, 4, 8],
      approachTargetSignature: 'starbase:Dock A',
      forceFullRender: false,
      statusMessage: '',
      getSelectedTarget: () => target,
    });

    game.updateApproachAssist(0.016);

    expect(game.player.position.systemX).toBe(CONFIG.SYSTEM_MOVE_INCREMENT);
    expect(game.approachTargetSignature).toBe('starbase:Dock A');
    expect(game.statusMessage).toBe('');
  });

  it('stops starbase approach once it reaches the inner orbit area', () => {
    const player = new Player();
    const target = Object.assign(Object.create(Starbase.prototype), {
      name: 'Dock A',
      systemX: CONFIG.LANDING_DISTANCE * 0.62,
      systemY: 0,
    }) as Starbase;
    const game = Object.assign(Object.create(Game.prototype), {
      player,
      stateManager: { state: 'system' },
      currentZoomLevelIndex: 3,
      zoomLevels: [0.25, 0.5, 1, 2, 4, 8],
      approachTargetSignature: 'starbase:Dock A',
      forceFullRender: false,
      statusMessage: '',
      getSelectedTarget: () => target,
    });

    game.updateApproachAssist(0.016);

    expect(game.player.position.systemX).toBe(0);
    expect(game.approachTargetSignature).toBeNull();
    expect(game.statusMessage).toBe('Approach complete: Dock A.');
  });

  it('points the ship toward the target when approach assist starts', () => {
    const game = createApproachHarness(3);
    const target = {
      name: 'Target North',
      systemX: 0,
      systemY: -1e12,
    };
    game.getSelectedTarget = () => target;
    game.approachTargetSignature = null;

    game._startApproachAssist();

    expect(game.player.render.directionGlyph).toBe(GLYPHS.SHIP_NORTH);
    expect(game.player.render.char).toBe(GLYPHS.SHIP_NORTH);
  });

  it('prefetches the approached planet and first two moons', () => {
    const game = createApproachHarness(3);
    const parent = Object.assign(Object.create(Planet.prototype), {
      name: 'Parent',
      systemX: 1e12,
      systemY: 0,
      moons: [
        Object.assign(Object.create(Planet.prototype), { name: 'Moon I' }),
        Object.assign(Object.create(Planet.prototype), { name: 'Moon II' }),
        Object.assign(Object.create(Planet.prototype), { name: 'Moon III' }),
      ],
    }) as Planet;
    game.getSelectedTarget = () => parent;
    game.stateManager.currentSystem = { getOrbitParentFor: () => parent };
    game.enqueueSurfacePrefetch = vi.fn();

    game._startApproachAssist();

    expect(game.enqueueSurfacePrefetch).toHaveBeenCalledWith([parent, parent.moons[0], parent.moons[1]]);
  });
});
