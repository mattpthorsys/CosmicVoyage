import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../core/game';
import { Player } from '../../core/player';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import { XenobiologyService } from '../../core/xenobiology_service';
import { CargoSystem } from '../../systems/cargo_systems';
import { SurfaceEncounterController } from '../../core/modes/surface_encounter_controller';
import type { Starbase } from '../../entities/starbase';
import { eventManager } from '../../core/event_manager';
import { parseGameSave, SAVE_GAME_VERSION, type GameSave } from '../../core/save_game';
import { CONFIG } from '../../config';
import type { TextModalTableModel, TextTableRow } from '../../core/text_ui';
import { PRNG } from '../../utils/prng';
import type { StarbaseSectionId } from '../../core/starbase_ui';
import type { StarbaseController } from '../../core/starbase_controller';
import type { StarbaseMission } from '../../core/mission_board';
import type { MissionProgressService } from '../../core/mission_progress';

interface BiologyGameHarness {
  player: Player;
  xenobiology: XenobiologyService;
  encounterController: SurfaceEncounterController;
  gameClockElapsedSeconds: number;
  handleEncounterInput(): boolean;
  isGameClockPaused(): boolean;
  _update(delta: number): void;
  transferRoverCargoToShip(): number;
  submitBiologicalResearch(id: string, starbase: Starbase): void;
  getRoverCargoRows(): TextTableRow[];
  dropSelectedRoverCargo(row: TextTableRow): void;
  createRoverCargoModel(): TextModalTableModel;
  surfaceMode: { roverCargoSelection: number };
  starbaseMode: StarbaseController;
  missionProgress: MissionProgressService;
  quantitySelector: { context: { type: string; itemKey?: string }; max: number } | null;
  getStarbaseRows(starbase: Starbase, sectionId: StarbaseSectionId): TextTableRow[];
  activateStarbaseSelection(starbase: Starbase, row: TextTableRow): void;
}

/** Connects production Game orchestration to a bounded test field without a canvas or generated universe. */
function harness() {
  const player = new Player(),
    biosphere = generateBiosphere(biologyFixture({ bodyId: '0,0,0/planet:0/bio1' }))!;
  player.terrainVehicle.deployed = true;
  const field = createEncounter(biosphere, {
    id: `${biosphere.id}/site:1,1`,
    label: 'Habitat 1',
    x: 1,
    y: 1,
  });
  field.individuals = [field.individuals[0]];
  field.species[0] = { ...field.species[0], massKg: 20, sizeM: 1 };
  field.individuals[0].x = 15;
  field.individuals[0].y = 21;
  const service = new XenobiologyService();
  service.snapshot.fields[field.site.id] = field;
  service.snapshot.activeSiteId = field.site.id;
  const keys = new Set<string>();
  const game = Object.assign(Object.create(Game.prototype) as BiologyGameHarness, {
    player,
    _xenobiology: service,
    cargoSystem: new CargoSystem(),
    gameClockElapsedSeconds: 100,
    stateManager: {
      state: 'planet',
      currentSystem: null,
      currentPlanet: null,
      currentStarbase: null as Starbase | null,
    },
    gameSeedPRNG: new PRNG('biology-fixture'),
    inputManager: { justPressedActions: keys, wasAnyKeyJustPressed: () => keys.size > 0 },
    renderer: { getGridCols: () => 30 },
    statusMessage: '',
    forceFullRender: false,
  });
  return { game, keys, field, player, service };
}

/** Serializes all biology-bearing components through the actual versioned save boundary. */
function saveFixture(player: Player, service: XenobiologyService): GameSave {
  return {
    version: SAVE_GAME_VERSION,
    generationVersion: CONFIG.GALAXY_MODEL_VERSION,
    savedAt: '2026-10-03T00:00:00Z',
    seed: 'biology-fixture',
    gameClockElapsedSeconds: 100,
    player: structuredClone({
      position: player.position,
      resources: player.resources,
      render: player.render,
      terrainVehicle: player.terrainVehicle,
      cargoHold: player.cargoHold,
      ship: player.ship,
      crew: player.crew,
    }),
    location: {
      kind: 'planet',
      worldX: 0,
      worldY: 0,
      systemSlot: 0,
      bodyPath: 'planet:0',
      orbitReferencePath: 'planet:0',
    },
    systemOrbit: null,
    planetMutations: [],
    acceptedMissionIds: [],
    readyMissionIds: [],
    completedMissionIds: [],
    activeMissions: {},
    missionObjectiveProgress: {},
    economy: {},
    catalogueDiscoveries: {},
    tutorialHintsShown: [],
    xenobiology: service.createSnapshot(),
  };
}

describe('xenobiology Game integration', () => {
  it('delivers an accepted zero-price live reference through Research and persists the contract', () => {
    const { game, field, player, service } = harness();
    field.species[0] = { ...field.species[0], baselineSamples: 12 };
    const station = { id: 'biology-port', name: 'Biology Port', kind: 'starbase' } as Starbase;
    const mission: StarbaseMission = {
      id: 'live-reference-test',
      title: 'Live reference',
      type: 'xenobiology',
      issuer: 'Survey Office',
      summary: 'Live regional reference',
      detail: 'One live container at >=75% quality.',
      rewardCredits: 900,
      risk: 'Low',
      originStarbaseId: station.id,
      originStarbaseName: station.name,
      systemName: 'Fixture',
      objectives: [
        {
          id: 'deliver',
          kind: 'specimen',
          targetName: field.species[0].name,
          targetLabel: 'Live regional reference',
          speciesId: field.species[0].id,
          siteId: field.site.id,
          requiredKind: 'live',
          minimumQuality: 0.75,
        },
      ],
    };
    game.missionProgress.accept(mission);
    game.dropSelectedRoverCargo(
      game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!
    );
    const saved = parseGameSave({
      ...saveFixture(player, service),
      ...game.missionProgress.createSnapshot(),
    });
    expect(saved.activeMissions[mission.id].objectives[0].kind).toBe('specimen');
    expect(saved.version).toBe(SAVE_GAME_VERSION);
    expect(parseGameSave({ ...saved, version: 11 }).xenobiology).toEqual(saved.xenobiology);
    player.terrainVehicle.deployed = false;
    const row = game
      .getStarbaseRows(station, 'research')
      .find((entry) => entry.id === `contract:${mission.id}`)!;
    expect(row.cells[3]).toBe('READY');
    const credits = player.resources.credits;
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);
    try {
      game.starbaseMode.openSection('research');
      game.activateStarbaseSelection(station, row);
      expect(player.resources.credits).toBe(credits + 900);
      expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(0);
      expect(game.missionProgress.getStatus(mission)).toBe('COMPLETE');
      expect(service.snapshot.demand[field.species[0].id].samples).toBe(1);
      game.activateStarbaseSelection(station, row);
      expect(player.resources.credits).toBe(credits + 900);
    } finally {
      publish.mockRestore();
    }
  });
  it('lists both ship and rover specimens in Sell even when their scientific value is zero', () => {
    const { game, keys, field, player, service } = harness();
    field.species[0] = { ...field.species[0], baselineSamples: 6 };
    const station = { id: 'biology-port', name: 'Biology Port', kind: 'starbase' } as Starbase;
    keys.add('SCAN_SYSTEM_OBJECT');
    game.handleEncounterInput();
    game.dropSelectedRoverCargo(
      game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!
    );
    player.cargoHold.specimens!.push(player.terrainVehicle.cargoHold.specimens!.shift()!);
    player.terrainVehicle.deployed = false;
    const rows = game.getStarbaseRows(station, 'sell');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.cells[2])).toEqual(['0', '0']);
    expect(rows[0].detail).toContain('ship hold');
    expect(rows[1].detail).toContain('stowed rover');
    const before = service.createSnapshot(),
      credits = player.resources.credits;
    game.starbaseMode.openSection('sell');
    game.activateStarbaseSelection(station, rows[0]);
    expect(game.quantitySelector).toBeNull();
    expect(player.resources.credits).toBe(credits);
    expect(player.cargoHold.specimens).toHaveLength(1);
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    expect(game.starbaseMode.alert).toContain('No additional scientific demand');
    expect(service.createSnapshot()).toEqual(before);
  });
  it('settles Sell specimens through the same ledger as Research, atomically and only once', () => {
    const { game, field, player, service } = harness();
    field.species[0] = { ...field.species[0], recognised: false, baselineSamples: 0 };
    const station = { id: 'biology-port', name: 'Biology Port', kind: 'starbase' } as Starbase;
    game.dropSelectedRoverCargo(
      game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!
    );
    player.terrainVehicle.deployed = false;
    const row = game.getStarbaseRows(station, 'sell')[0];
    const research = game.getStarbaseRows(station, 'research').find((candidate) => candidate.id === row.id)!;
    expect(research.cells[2]).toBe(`${row.cells[2]} Cr`);
    expect(Number(row.cells[2])).toBeGreaterThan(0);
    game.starbaseMode.openSection('sell');
    const before = player.resources.credits;
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);
    try {
      game.activateStarbaseSelection(station, row);
      expect(game.quantitySelector).toBeNull();
      expect(player.resources.credits).toBe(before + Number(row.cells[2]));
      expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(0);
      expect(service.snapshot.demand[field.species[0].id].samples).toBe(1);
      game.activateStarbaseSelection(station, row);
      game.starbaseMode.openSection('research');
      game.activateStarbaseSelection(station, research);
      expect(player.resources.credits).toBe(before + Number(row.cells[2]));
      expect(game.getStarbaseRows(station, 'sell')).toHaveLength(0);
    } finally {
      publish.mockRestore();
    }
  });
  it('leaves specimens aboard at automated depots and preserves commodity quantity sales', () => {
    const { game, field, player } = harness();
    field.species[0] = { ...field.species[0], recognised: false, baselineSamples: 0 };
    game.dropSelectedRoverCargo(
      game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!
    );
    player.terrainVehicle.deployed = false;
    player.cargoHold.items.IRON = 2;
    const station = { id: 'biology-port', name: 'Biology Port', kind: 'automated-depot' } as Starbase;
    game.stateManager.currentStarbase = station;
    const rows = game.getStarbaseRows(station, 'sell');
    expect(rows[0].id).toBe('IRON');
    expect(rows[1].cells[2]).toBe('0');
    expect(rows[1].disabled).toBe(true);
    game.starbaseMode.openSection('sell');
    const before = player.resources.credits;
    game.activateStarbaseSelection(station, rows[1]);
    expect(player.resources.credits).toBe(before);
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    expect(game.starbaseMode.alert).toContain('No scientific receiving staff');
    game.activateStarbaseSelection(station, rows[0]);
    expect(game.quantitySelector?.context).toEqual({ type: 'sell', itemKey: 'IRON' });
    expect(game.quantitySelector?.max).toBe(2);
  });
  it('collects an adjacent organism through Cargo using included basic stasis', () => {
    const { game, field, player, service } = harness();
    const pickup = game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!;
    expect(player.ship.stasisClass).toBe(1);
    expect(pickup.cells[0]).toBe('Collect selected organism');
    game.dropSelectedRoverCargo(pickup);
    expect(player.terrainVehicle.cargoHold.specimens![0].kind).toBe('live');
    expect(field.individuals[0].state).toBe('collected');
    expect(game.gameClockElapsedSeconds).toBe(105);
    expect(service.evidence(field.species[0].id)?.collected).toBe(true);
    game.dropSelectedRoverCargo(pickup);
    expect(game.gameClockElapsedSeconds).toBe(105);
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    expect(() => parseGameSave(saveFixture(player, service))).not.toThrow();
  });
  it('keeps the selected cargo record and complete controls visible on narrow screens', () => {
    const { game, player } = harness();
    player.terrainVehicle.cargoHold.items = { IRON: 1, GOLD: 1 };
    game.surfaceMode.roverCargoSelection = 2;
    const model = game.createRoverCargoModel();
    expect(model.dashboard).toBeDefined();
    const visible = model.dashboard!.slice(model.viewOffset);
    expect(visible[0].segments.map((span) => span.text).join('')).toMatch(/^> /);
    expect(model.footer?.every((line) => line.length <= 20)).toBe(true);
    expect(model.footer?.join(' ')).toContain('Enter use');
  });
  it('refuses an incompatible Cargo pickup without consuming the organism or action time', () => {
    const { game, field, player } = harness();
    field.species[0] = { ...field.species[0], temperatureK: 330 };
    const pickup = game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!;
    game.dropSelectedRoverCargo(pickup);
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(0);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(field.individuals[0].state).toBe('active');
    expect(game.createRoverCargoModel().footer?.join(' ')).toContain(
      'Temperature outside preservation envelope'
    );
  });
  it('freezes accelerated orbital time and actors between explicit field commands', () => {
    const { game, field } = harness();
    expect(game.isGameClockPaused()).toBe(true);
    game._update(60);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(field.elapsedSeconds).toBe(0);
  });
  it('charges successful movement once and charges nothing for blocked movement', () => {
    const { game, field, player, keys } = harness();
    const fuel = player.terrainVehicle.fuel;
    keys.add('MOVE_LEFT');
    game.handleEncounterInput();
    expect(field.roverX).toBe(16);
    expect(player.terrainVehicle.fuel).toBe(fuel);
    keys.clear();
    keys.add('MOVE_UP');
    game.handleEncounterInput();
    expect(field.roverY).toBe(20);
    expect(game.gameClockElapsedSeconds).toBe(105);
    expect(player.terrainVehicle.fuel).toBeCloseTo(fuel - 0.02);
  });
  it('persists evidence, collection and individual depletion through a real save round trip', () => {
    const { game, field, player, keys, service } = harness();
    keys.add('SCAN');
    game.handleEncounterInput();
    expect(service.evidence(field.species[0].id)?.level).toBe(2);
    keys.clear();
    keys.add('ENTER_SYSTEM');
    game.handleEncounterInput();
    keys.clear();
    keys.add('MOVE_DOWN');
    game.handleEncounterInput();
    game.handleEncounterInput();
    game.handleEncounterInput();
    keys.clear();
    keys.add('ENTER_SYSTEM');
    game.handleEncounterInput();
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    const save = parseGameSave(JSON.stringify(saveFixture(player, service)));
    expect(save.xenobiology.fields[field.site.id].individuals[0].sampled).toBe(true);
    expect(save.player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    expect(() => parseGameSave({ ...save, location: { ...save.location, kind: 'hyperspace' } })).toThrow();
    save.player.cargoHold.specimens = [...save.player.terrainVehicle.cargoHold.specimens!];
    expect(() => parseGameSave(save)).toThrow('Duplicate');
  });
  it('retains entire containers in the rover when the ship hold has insufficient capacity', () => {
    const { game, field, player, service } = harness();
    service.observe(field.species[0], 3);
    const container = {
      id: 'container',
      sourceId: field.individuals[0].id,
      siteId: field.site.id,
      species: field.species[0],
      kind: 'tissue' as const,
      quality: 1,
      volumeM3: 0.1,
    };
    player.terrainVehicle.cargoHold.specimens = [container];
    player.cargoHold.items.IRON = player.cargoHold.capacity;
    expect(game.transferRoverCargoToShip()).toBe(0);
    expect(player.terrainVehicle.cargoHold.specimens).toEqual([container]);
    player.cargoHold.items = {};
    expect(game.transferRoverCargoToShip()).toBe(0.1);
    expect(player.cargoHold.specimens![0].id).toBe(container.id);
    expect(player.terrainVehicle.cargoHold.specimens).toEqual([]);
  });
  it('pays research once across stations and refuses automated depots', () => {
    const { game, field, player, service } = harness();
    service.observe(field.species[0], 3);
    const before = player.resources.credits;
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);
    try {
      game.submitBiologicalResearch(`data:${field.species[0].id}`, { kind: 'automated-depot' } as Starbase);
      expect(player.resources.credits).toBe(before);
      game.submitBiologicalResearch(`data:${field.species[0].id}`, { kind: 'starbase' } as Starbase);
      const after = player.resources.credits;
      expect(after).toBeGreaterThan(before);
      game.submitBiologicalResearch(`data:${field.species[0].id}`, { kind: 'starbase' } as Starbase);
      expect(player.resources.credits).toBe(after);
    } finally {
      publish.mockRestore();
    }
  });
});
