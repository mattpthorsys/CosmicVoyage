import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../core/game';
import { Player } from '../../core/player';
import { MissionJournal } from '../../core/mission_journal';
import { MissionProgressService } from '../../core/mission_progress';
import { InterfaceModeController } from '../../core/modes/game_mode_controllers';
import { OrbitModeController } from '../../core/modes/orbit_mode_controller';
import { ScanService } from '../../core/scan_service';
import type { StarbaseMission } from '../../core/mission_board';
import type { TextTableRow } from '../../core/text_ui';
import type { Starbase } from '../../entities/starbase';
import type { SolarSystem } from '../../entities/solar_system';
import { Planet } from '../../entities/planet';
import { PRNG } from '../../utils/prng';
import { AU_IN_METERS } from '../../constants/physics';
import type { CommandBarModel } from '../../core/command_bar';

interface JournalGameHarness {
  openMissionJournal(): void;
  closeMissionJournal(): void;
  handleMissionJournalInput(): boolean;
  activateShipMenuSelection(row: TextTableRow): void;
  activateMissionSelection(starbase: Starbase, row: TextTableRow): void;
  selectMissionLandingSite(mission: StarbaseMission): void;
  createCommandBarModel(actions: []): CommandBarModel;
  _handleCommandBarAction(data: { action: string }): void;
  _processInput(): void;
  _update(delta: number): void;
  isGameClockPaused(): boolean;
  shouldSuppressHudForeground(): boolean;
  gameClockElapsedSeconds: number;
}

/** Connects production modal routing to a real orbital family without a canvas or surface worker. */
function harness() {
  const player = new Player();
  const parent = new Planet('Terra', 'Rock', AU_IN_METERS, 0, new PRNG('Terra'), 'G');
  const moon = new Planet('Luna', 'Rock', AU_IN_METERS / 100, 0, new PRNG('Luna'), 'G');
  parent.moons.push(moon);
  vi.spyOn(parent, 'isSurfaceReady').mockReturnValue(true);
  vi.spyOn(moon, 'isSurfaceReady').mockReturnValue(true);
  const system = {
    name: 'Sol',
    starX: 12,
    starY: -9,
    systemSlot: 0,
    planets: [parent],
    stars: [],
  } as unknown as SolarSystem;
  const state = {
    state: 'orbit',
    currentSystem: system,
    currentPlanet: parent,
    currentOrbitReferencePlanet: parent,
  };
  const owner = new InterfaceModeController<
    never,
    never,
    { itemKey: string; amount: number; selectedIndex: number }
  >();
  const journal = new MissionJournal();
  const orbit = new OrbitModeController();
  const progress = new MissionProgressService();
  const actions = new Set<string>();
  const input = {
    justPressedActions: actions,
    wasActionJustPressed: (action: string) => actions.has(action),
    wasAnyKeyJustPressed: () => actions.size > 0,
    isActionActive: (action: string) => actions.has(action),
    clearState: vi.fn(() => actions.clear()),
  };
  const effects = { land: vi.fn(), capture: vi.fn(), publish: vi.fn(), prefetch: vi.fn() };
  const game = Object.assign(Object.create(Game.prototype) as JournalGameHarness, {
    player,
    stateManager: { ...state, landFromOrbit: effects.land },
    inputManager: input,
    _interfaceMode: owner,
    _missionJournal: journal,
    _missionProgress: progress,
    _orbitModeState: orbit,
    _scanService: new ScanService(),
    renderer: { getGridCols: () => 100, getGridRows: () => 35 },
    popupState: 'inactive',
    gameClockElapsedSeconds: 123,
    forceFullRender: false,
    getBiosphere: () => null,
    captureCurrentPlanetMutations: effects.capture,
    _publishStatusUpdate: effects.publish,
    enqueueSurfacePrefetch: effects.prefetch,
    completeMissionsForDiscovery: vi.fn(),
  });
  const mission: StarbaseMission = {
    id: 'reference',
    title: 'Live reference',
    type: 'xenobiology',
    issuer: 'Survey Office',
    summary: 'Live grazer.',
    detail: 'Return the specimen in stasis.',
    rewardCredits: 900,
    risk: 'Low',
    originStarbaseId: 'port',
    originStarbaseName: 'Sol Port',
    systemName: 'Sol',
    systemAddress: { worldX: 12, worldY: -9, systemSlot: 0 },
    objectives: [
      {
        id: 'live',
        kind: 'specimen',
        targetName: 'Grazer',
        targetLabel: 'Live grazer from Luna',
        speciesId: 'grazer',
        siteId: 'habitat',
        requiredKind: 'live',
        minimumQuality: 0.75,
        location: {
          bodyName: 'Luna',
          bodyPath: 'planet:0/moon:0',
          surface: { x: 123, y: 456, siteId: 'habitat', label: 'Sheltered habitat' },
        },
      },
    ],
  };
  progress.accept(mission);
  return { game, owner, journal, orbit, actions, input, effects, mission, moon, parent };
}

describe('mission journal Game integration', () => {
  it('opens and returns through ship and station menu entries, preserving the parent interface', () => {
    const { game, owner, journal, actions } = harness();
    owner.open('ship-menu');
    game.activateShipMenuSelection({ id: 'missions', cells: [] });
    expect(owner.kind).toBe('mission-journal');
    expect(journal.returnTo).toBe('ship-menu');
    journal.reveal.complete();
    actions.add('QUIT');
    game.handleMissionJournalInput();
    expect(owner.kind).toBe('ship-menu');
    owner.close();
    game.activateMissionSelection({ id: 'port', name: 'Sol Port' } as Starbase, {
      id: 'mission-journal',
      cells: [],
    });
    expect(owner.kind).toBe('mission-journal');
    expect(journal.returnTo).toBe('none');
    game.closeMissionJournal();
    expect(owner.kind).toBe('none');
  });

  it('pauses simulation and suppresses foreground HUDs while the terminal reveal keeps advancing', () => {
    const { game, journal, effects } = harness();
    game.openMissionJournal();
    expect(game.isGameClockPaused()).toBe(true);
    expect(game.shouldSuppressHudForeground()).toBe(true);
    game._update(0.1);
    expect(journal.reveal.progress).toBeGreaterThan(0);
    expect(game.gameClockElapsedSeconds).toBe(123);
    expect(effects.land).not.toHaveBeenCalled();
    expect(effects.prefetch).not.toHaveBeenCalled();
  });

  it('owns Enter exclusively, selects the exact moon habitat and requires a later landing confirmation', () => {
    const { game, owner, journal, orbit, actions, input, effects, moon, parent } = harness();
    game.openMissionJournal();
    journal.reveal.complete();
    actions.add('ENTER_SYSTEM');
    game._processInput();
    expect(owner.kind).toBe('none');
    expect(orbit.getSelectedBody(parent)).toBe(moon);
    expect(orbit.selectedBodyIndex).toBe(1);
    expect(orbit.landingX).toBe(123);
    expect(orbit.landingY).toBe(456);
    expect(orbit.mode).toBe('landing');
    expect(effects.land).not.toHaveBeenCalled();
    expect(input.clearState).toHaveBeenCalledOnce();
  });

  it('keeps the journal open for invalid destinations and offers contextual mouse controls', () => {
    const { game, owner, journal, mission } = harness();
    game.openMissionJournal();
    journal.reveal.complete();
    const controls = game.createCommandBarModel([]);
    expect(controls.buttons.some((button) => button.action === 'ENTER_SYSTEM')).toBe(true);
    game.selectMissionLandingSite({
      ...mission,
      systemAddress: { ...mission.systemAddress!, systemSlot: 1 },
    });
    expect(owner.kind).toBe('mission-journal');
    expect(journal.notice).toContain('Enter orbit at the destination');
    game._handleCommandBarAction({ action: 'QUIT' });
    expect(owner.kind).toBe('none');
  });

  it('does not replace a destructive confirmation or another instrument with the journal', () => {
    const { game, owner } = harness();
    owner.open('galaxy-map');
    game.openMissionJournal();
    expect(owner.kind).toBe('galaxy-map');
    owner.openJettisonConfirmation({ itemKey: 'IRON', amount: 1, selectedIndex: 0 });
    game.openMissionJournal();
    expect(owner.kind).toBe('jettison-confirmation');
  });
});
