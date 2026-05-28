import { describe, expect, it, vi } from 'vitest';
import { eventManager, GameEvents } from '../../../core/event_manager';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';
import { Planet } from '../../../entities/planet';

function createTravelHarness(state: 'hyperspace' | 'system', pressed: string): any {
  return Object.assign(Object.create(Game.prototype), {
    player: new Player(),
    stateManager: {
      state,
      currentSystem: null,
      currentPlanet: null,
      peekAtSystem: () => null,
    },
    inputManager: {
      isActionActive: (action: string) => action === 'MOVE_RIGHT',
      wasActionJustPressed: (action: string) => action === pressed,
    },
    systemDataGenerator: {
      getSystemMapProperties: () => ({ exists: false }),
      getDeepSpacePhenomenonProperties: () => null,
    },
    gameSeedPRNG: { seed: 1 },
    travelCommandMoving: true,
    travelCommandSelection: 0,
    terminalOverlay: { clear: vi.fn(), addMessageLines: vi.fn(), addMessage: vi.fn() },
    getCurrentHyperspaceSurvey: () => ({ nearestSystemContact: null, medium: { label: 'quiet', sensorRangeMultiplier: 1 } }),
    toNavigationContact: () => null,
    getSelectedTarget: () => null,
    getCommandStripTargetName: () => undefined,
    statusMessage: '',
    forceFullRender: false,
  });
}

function createPlanetTarget(name = 'Remote I'): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.assign(planet, {
    name,
    type: 'Rock',
    systemX: 0,
    systemY: 0,
    moons: [],
    scanned: false,
    scan: vi.fn(function scan(this: Planet) {
      this.scanned = true;
    }),
    getScanInfo: vi.fn(() => ['<h>Remote I</h>', 'Rocky world scan.']),
  });
  return planet;
}

describe('travel command menu', () => {
  it('pauses hyperspace movement with Enter and lets arrows select commands', () => {
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);
    try {
      const moving = createTravelHarness('hyperspace', 'MOVE_RIGHT');
      expect(moving._handleTravelCommandInput()).toBe(false);
      moving._handleMovementInput();
      expect(publish).toHaveBeenCalledWith(GameEvents.MOVE_REQUESTED, expect.objectContaining({ context: 'hyperspace', dx: 1 }));

      const paused = createTravelHarness('hyperspace', 'ENTER_SYSTEM');
      expect(paused._handleTravelCommandInput()).toBe(true);
      expect(paused.travelCommandMoving).toBe(false);

      paused.inputManager.wasActionJustPressed = (action: string) => action === 'MOVE_RIGHT';
      expect(paused._handleTravelCommandInput()).toBe(true);
      expect(paused.travelCommandSelection).toBe(1);
    } finally {
      publish.mockRestore();
    }
  });

  it('uses Tab as the recommended travel command hotkey', () => {
    const game = createTravelHarness('hyperspace', 'CYCLE_TARGET');
    game.getCurrentAvailableActions = () => [{ id: 'enter-system', label: 'Enter System', action: 'ENTER_SYSTEM', key: 'Enter', enabled: true }];
    game.executeCommandBarAction = vi.fn();

    expect(game._handleTravelCommandInput()).toBe(true);

    expect(game.executeCommandBarAction).toHaveBeenCalledWith('ENTER_SYSTEM');
  });

  it('selects the green travel command in displayed order', () => {
    const game = createTravelHarness('hyperspace', 'ENTER_SYSTEM');
    game.getCurrentAvailableActions = () => [{ id: 'enter-system', label: 'Enter System', action: 'ENTER_SYSTEM', key: 'Enter', enabled: true }];
    game.executeCommandBarAction = vi.fn();

    expect(game._handleTravelCommandInput()).toBe(true);
    expect(game.travelCommandMoving).toBe(false);
    expect(game.getSelectedTravelCommandId()).toBe('enter-system');

    game.inputManager.wasActionJustPressed = (action: string) => action === 'PRIMARY_ACTION';
    expect(game._handleTravelCommandInput()).toBe(true);
    expect(game.executeCommandBarAction).toHaveBeenCalledWith('ENTER_SYSTEM');
  });

  it('does not highlight a travel command while movement is engaged', () => {
    const game = createTravelHarness('hyperspace', 'NONE');
    game.getCurrentAvailableActions = () => [{ id: 'enter-system', label: 'Enter System', action: 'ENTER_SYSTEM', key: 'Enter', enabled: true }];

    const moving = game.createHyperspaceCommandBar(game.getCurrentAvailableActions());
    expect(moving.selectedButtonId).toBeUndefined();

    game.travelCommandMoving = false;
    game.travelCommandSelection = 0;
    const selecting = game.createHyperspaceCommandBar(game.getCurrentAvailableActions());
    expect(selecting.selectedButtonId).toBe('enter-system');
  });

  it('does not highlight a surface command while the rover is moving', () => {
    const game = Object.assign(createTravelHarness('system', 'NONE'), {
      stateManager: { state: 'planet', currentPlanet: { name: 'Dust' } },
      cargoSystem: { getTotalUnits: () => 0 },
      roverMenuSelection: 0,
      isAtParkedShip: () => false,
    });
    game.player.terrainVehicle.deployed = true;
    game.player.terrainVehicle.moving = true;

    const moving = game.createSurfaceCommandBar();
    expect(moving.selectedButtonId).toBeUndefined();

    game.player.terrainVehicle.moving = false;
    const selecting = game.createSurfaceCommandBar();
    expect(selecting.selectedButtonId).toBe('map');
  });

  it('opens the target menu from the planetary command bar action', () => {
    const game = createTravelHarness('system', 'NONE');
    game.openTargetMenu = vi.fn();

    game.executeCommandBarAction('TARGET_MENU');

    expect(game.openTargetMenu).toHaveBeenCalledOnce();
  });

  it('scans a selected planet even when it is outside close scan range', () => {
    const game = createTravelHarness('system', 'NONE');
    const planet = createPlanetTarget();
    game.getSelectedTarget = () => planet;
    game.getScannableNavigationTarget = () => planet;
    game.isTargetWithinScanRange = () => false;
    game.activeMissions = {};
    game.completedMissionIds = new Set();
    game.completeMissionsForScan = vi.fn();

    expect(game.scanSelectedSystemTargetIfAvailable()).toBe(true);

    expect(planet.scan).toHaveBeenCalledOnce();
    expect(game.terminalOverlay.addMessageLines).toHaveBeenCalledWith(['<h>Remote I</h>', 'Rocky world scan.']);
  });

  it('uses the observe reticle to scan the body under the cursor', () => {
    const game = createTravelHarness('system', 'NONE');
    const planet = createPlanetTarget('Center I');
    game.renderer = { getGridCols: () => 81, getGridRows: () => 41 };
    game.zoomLevels = [1];
    game.currentZoomLevelIndex = 0;
    game.player.position.systemX = 0;
    game.player.position.systemY = 0;
    planet.systemX = 0;
    planet.systemY = 0;
    game.getNavigationTargets = () => [planet];
    game.getScannableNavigationTarget = () => planet;
    game.selectNavigationTarget = vi.fn();
    game._dumpScanToTerminal = vi.fn();
    game.travelObserveCursor = { mode: 'system', dx: 0, dy: 0 };

    game.confirmTravelObserveCursor();

    expect(game.selectNavigationTarget).toHaveBeenCalledWith(planet, false);
    expect(game._dumpScanToTerminal).toHaveBeenCalledWith(planet);
    expect(game.travelObserveCursor).toBeNull();
  });

  it('makes interstellar observe reports less certain for distant small contacts', () => {
    const brightTarget = { name: 'Brightfall', starType: 'G2V', starbase: null };
    const faintTarget = { name: 'Dimfall', starType: 'T8V', starbase: null };
    const game = createTravelHarness('hyperspace', 'NONE');
    game.completeMissionsForScan = vi.fn();

    game.stateManager.peekAtSystem = () => brightTarget;
    game.systemDataGenerator.getSystemMapProperties = () => ({ exists: true, starType: 'G2V', objectKind: 'stellar' });
    game.scanHyperspaceObserveCursor({ mode: 'hyperspace', dx: 1, dy: 0 });
    const brightLines = game.terminalOverlay.addMessageLines.mock.calls.at(-1)?.[0].join('\n') ?? '';

    game.stateManager.peekAtSystem = () => faintTarget;
    game.systemDataGenerator.getSystemMapProperties = () => ({ exists: true, starType: 'T8V', objectKind: 'brown-dwarf' });
    game.scanHyperspaceObserveCursor({ mode: 'hyperspace', dx: 24, dy: 0 });
    const faintLines = game.terminalOverlay.addMessageLines.mock.calls.at(-1)?.[0].join('\n') ?? '';

    expect(brightLines).toContain('Brightfall');
    expect(brightLines).toContain('CONFIDENCE: <hl>9');
    expect(faintLines).not.toContain('Dimfall');
    expect(faintLines).toMatch(/poorly constrained|near background|barely above background/);
  });
});
