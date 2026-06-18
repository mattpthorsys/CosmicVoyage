import { describe, expect, it } from 'vitest';
import { Player } from '../../core/player';
import {
  createPlayerViewSnapshot,
  createSceneViewModel,
} from '../../rendering/scene_view_model';

describe('scene view models', () => {
  it('captures immutable player render state for a frame', () => {
    const player = new Player();
    player.position.systemX = 120;
    player.position.systemY = -30;
    player.resources.fuel = 45;

    const snapshot = createPlayerViewSnapshot(player);
    const scene = createSceneViewModel({ kind: 'hyperspace', player: snapshot });

    player.position.systemX = 999;
    player.resources.fuel = 0;

    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(snapshot.position)).toBe(true);
    expect(snapshot.position.systemX).toBe(120);
    expect(snapshot.resources.fuel).toBe(45);
    expect(snapshot.distanceSqToSystemCoords(120, -20)).toBe(100);
  });
});
