import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';
import { PRNG } from '../../../utils/prng';
import { DepotService } from '../../../core/depot_service';
import { DepotServiceConsole } from '../../../core/depot_service_console';
import type { DepotServiceKind } from '../../../core/depot_types';
import { StarbaseCommerceService } from '../../../core/starbase_commerce';
import { CargoSystem } from '../../../systems/cargo_systems';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';
import type { InterfaceModeController } from '../../../core/modes/game_mode_controllers';
import type { TextModalTableModel } from '../../../core/text_ui';

interface DepotHarness {
  interfaceMode: InterfaceModeController<never, never, never>;
  depotConsole: DepotServiceConsole;
  openDepotServiceConsole(kind: DepotServiceKind): void;
  handleDepotServiceInput(): boolean;
  createDepotServiceModel(): TextModalTableModel;
  shouldSuppressHudForeground(): boolean;
  isGameClockPaused(): boolean;
  _processInput(): void;
  _update(seconds: number): void;
  _handleCommandBarAction(data: { action: string }): void;
  repairRover(): void;
  gameClockElapsedSeconds: number;
}

/** Exercises real modal/shortcut orchestration with a real depot and only the canvas/event boundary mocked. */
function depotHarness() {
  const keys = new Set<string>();
  const system = haulSystemFixture({ worldX: 0, worldY: 0, systemSlot: 0 });
  const station = system.starbase!;
  const player = new Player(0, 0, '@', 'depot-interface');
  const cargo = new CargoSystem();
  const commerce = new StarbaseCommerceService(player, cargo, 12345);
  const service = new DepotService(commerce, 'depot-interface', player, cargo);
  service.ensureStation(station, { worldX: 0, worldY: 0, systemSlot: 0 }, 100);
  const game = Object.assign(Object.create(Game.prototype) as DepotHarness, {
    player,
    cargoSystem: cargo,
    gameSeedPRNG: new PRNG('depot-interface'),
    _depotService: service,
    _starbaseCommerce: commerce,
    stateManager: { state: 'starbase', currentSystem: system, currentStarbase: station },
    renderer: { getGridCols: () => 80, getGridRows: () => 36 },
    inputManager: {
      justPressedActions: keys,
      wasActionJustPressed: (action: string) => keys.has(action),
      wasAnyKeyJustPressed: () => keys.size > 0,
      clearState: () => keys.clear(),
    },
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    captureCurrentPlanetMutations: vi.fn(),
    _publishStatusUpdate: vi.fn(),
    gameClockElapsedSeconds: 100,
    currentVisualDeltaSeconds: 0,
  });
  return { game, player, keys, station, commerce, service };
}

describe('depot service modal integration', () => {
  it('pauses simulation and suppresses travel HUD while still animating the terminal', () => {
    const { game } = depotHarness();
    game.openDepotServiceConsole('medical');
    expect(game.interfaceMode.is('depot-service')).toBe(true);
    expect(game.shouldSuppressHudForeground()).toBe(true);
    expect(game.isGameClockPaused()).toBe(true);
    game._update(10);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(game.depotConsole.reveal.isActive).toBe(false);
    expect(game.createDepotServiceModel().title).toBe('MEDICAL BAY');
  });

  it('returns to the station after Esc without letting that key launch or undock', () => {
    const { game, keys } = depotHarness();
    game.openDepotServiceConsole('repair');
    game.depotConsole.reveal.complete();
    keys.add('QUIT');
    expect(game.handleDepotServiceInput()).toBe(true);
    expect(game.interfaceMode.kind).toBe('none');
    expect(keys.size).toBe(0);
  });

  it('routes quick rover repair to the supply-aware terminal without immediate healing or charges', () => {
    const { game, player } = depotHarness();
    player.terrainVehicle.integrity = 60;
    const credits = player.resources.credits;
    game.repairRover();
    expect(game.interfaceMode.is('depot-service')).toBe(true);
    expect(game.depotConsole.selectedId).toBe('rover');
    expect(player.terrainVehicle.integrity).toBe(60);
    expect(player.resources.credits).toBe(credits);
  });

  it('clickable controls consume reveal skipping before toggling cargo', () => {
    const { game } = depotHarness();
    game.openDepotServiceConsole('repair');
    game._handleCommandBarAction({ action: 'CYCLE_TARGET' });
    expect(game.depotConsole.useCargo).toBe(false);
    expect(game.depotConsole.reveal.isActive).toBe(false);
    game._handleCommandBarAction({ action: 'CYCLE_TARGET' });
    expect(game.depotConsole.useCargo).toBe(true);
  });
});
