import { describe, expect, it } from 'vitest';
import { CargoSystem } from '../../../systems/cargo_systems';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';

function createSurfaceScanHarness(): any {
  const player = new Player();
  player.terrainVehicle.deployed = true;
  player.position.surfaceX = 10;
  player.position.surfaceY = 10;
  const planet = {
    name: 'Testfall',
    type: 'Rock',
    gravity: 0.91,
    atmosphere: { density: 'Thin', pressure: 0.4, composition: { Nitrogen: 80 } },
    heightmap: Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => 128)),
    surfaceElementMap: Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => 'IRON')),
    ensureSurfaceReady: () => undefined,
    isMined: () => false,
    getCurrentTemperature: () => 281,
  };
  return Object.assign(Object.create(Game.prototype), {
    player,
    cargoSystem: new CargoSystem(),
    stateManager: { state: 'planet', currentPlanet: planet },
    surfaceScanCursor: null,
    surfaceNotifications: [],
    statusMessage: '',
    forceFullRender: false,
  });
}

describe('surface scan cursor', () => {
  it('starts a cursor scan instead of scanning the whole planet', () => {
    const game = createSurfaceScanHarness();

    game.startSurfaceCursorScan();

    expect(game.surfaceScanCursor).toEqual({ dx: 0, dy: 0 });
    expect(game.surfaceNotifications[0]).toContain('Surface scanner active');
  });

  it('confirms a local terrain scan into surface notifications', () => {
    const game = createSurfaceScanHarness();
    game.surfaceScanCursor = { dx: 2, dy: -1 };

    game.confirmSurfaceCursorScan();

    expect(game.surfaceScanCursor).toBeNull();
    expect(game.surfaceNotifications.join('\n')).toContain('Iron');
    expect(game.surfaceNotifications.join('\n')).toContain('281 K');
  });
});
