import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../core/game';
import { Player } from '../../core/player';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import * as biologyGeneration from '../../entities/biology/biosphere_generator';
import type { BiosphereDefinition, EncounterField } from '../../entities/biology/biology_types';
import { biologyFixture, microbialBiosphereFixture } from '../fixtures/biology';
import { createEncounter, createCollectionContainer } from '../../systems/surface_encounter_system';
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
import { ethologyFixture } from '../fixtures/ethology';
import { createBehaviourContracts } from '../../core/behaviour_research';
import type { MissionJournalEntry } from '../../core/mission_journal';

interface BiologyGameHarness {
  player: Player;
  xenobiology: XenobiologyService;
  encounterController: SurfaceEncounterController;
  gameClockElapsedSeconds: number;
  handleEncounterInput(): boolean;
  _handleShipMenuInput(): boolean;
  shipMenuOpen: boolean;
  getBiosphere(): BiosphereDefinition | null;
  isGameClockPaused(): boolean;
  _update(delta: number): void;
  transferRoverCargoToShip(): number;
  submitBiologicalResearch(id: string, starbase: Starbase): void;
  getRoverCargoRows(): TextTableRow[];
  dropSelectedRoverCargo(row: TextTableRow): void;
  openRoverCargo(): void;
  _handleRoverCargoInput(): boolean;
  getMissionJournalEntries(): MissionJournalEntry[];
  statusMessage: string;
  forceFullRender: boolean;
  createRoverCargoModel(): TextModalTableModel;
  surfaceMode: { roverCargoSelection: number };
  starbaseMode: StarbaseController;
  missionProgress: MissionProgressService;
  quantitySelector: { context: { type: string; itemKey?: string }; max: number } | null;
  getStarbaseRows(starbase: Starbase, sectionId: StarbaseSectionId): TextTableRow[];
  activateStarbaseSelection(starbase: Starbase, row: TextTableRow): void;
  activateMissionSelection(starbase: Starbase, row: TextTableRow): void;
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
    inputManager: {
      justPressedActions: keys,
      wasActionJustPressed: (action: string) => keys.has(action),
      wasAnyKeyJustPressed: () => keys.size > 0,
    },
    renderer: { getGridCols: () => 30, getGridRows: () => 50 },
    statusMessage: '',
    forceFullRender: false,
  });
  return { game, keys, field, player, service };
}

/** Targets the actual test habitat, so UI readiness and station payment require real collected cargo. */
function propaguleRequest(field: EncounterField): StarbaseMission {
  return {
    id: 'field-port:propagules',
    title: 'Viable mat propagules',
    type: 'xenobiology',
    issuer: 'Survey Office',
    summary: 'One viable mat batch from the specified habitat.',
    detail: 'Harvest dormant buds and return the sealed batch.',
    rewardCredits: 750,
    risk: 'Low',
    originStarbaseId: 'field-port',
    originStarbaseName: 'Field Port',
    systemName: 'Fixture',
    objectives: [
      {
        id: 'buds',
        kind: 'specimen',
        targetName: field.species[0].name,
        targetLabel: 'Viable mat propagules',
        speciesId: field.species[0].id,
        siteId: field.site.id,
        requiredKind: 'propagule',
        minimumQuality: 0.8,
        location: {
          bodyPath: 'planet:0',
          bodyName: 'Fixture Colony',
          surface: { x: field.site.x, y: field.site.y, siteId: field.site.id, label: field.site.label },
        },
      },
    ],
  };
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
  it('continues to accept active biology-version-three fields after microbial generation advances to version four', () => {
    const { player } = harness();
    const biosphere = generateBiosphere(biologyFixture({ bodyId: '0,0,0/planet:0/bio3' }))!;
    const field = createEncounter(biosphere, {
      id: `${biosphere.id}/site:1,1`,
      x: 1,
      y: 1,
      label: 'Retained field',
    });
    const service = new XenobiologyService();
    service.snapshot.fields[field.site.id] = field;
    service.snapshot.activeSiteId = field.site.id;
    expect(parseGameSave(saveFixture(player, service)).xenobiology!.activeSiteId).toBe(field.site.id);
  });
  it('collects a representative microbial cassette through nearby Cargo and round-trips its finite source history', () => {
    const { game, field, player, service } = harness();
    const microbes = microbialBiosphereFixture({ bodyId: field.bodyId });
    field.species = [...microbes.species];
    field.individuals[0].speciesId = field.species[0].id;
    const before = service.createSnapshot();
    const row = game.getRoverCargoRows().find((entry) => entry.id.startsWith('collect-organism:'))!;
    expect(row.cells[0]).toBe('Preserve microbial sample');
    expect(row.detail).toContain('5 g representative material');
    game.openRoverCargo();
    expect(service.createSnapshot()).toEqual(before);
    game.dropSelectedRoverCargo(row);
    expect(player.terrainVehicle.cargoHold.specimens![0]).toMatchObject({
      kind: 'live',
      volumeM3: 0.1,
      materialMassKg: 0.005,
    });
    const restored = parseGameSave(saveFixture(player, service));
    expect(restored.player.terrainVehicle.cargoHold.specimens![0].materialMassKg).toBe(0.005);
    expect(restored.xenobiology!.fields[field.site.id].individuals[0].state).toBe('collected');
    expect(restored.xenobiology!.fields[field.site.id].species[0].reproduction).toBeUndefined();
  });
  it('makes Cargo opening, blocked Enter, collection readiness and actual station payment unambiguous', () => {
    const { game, keys, field, player, service } = harness();
    const mission = propaguleRequest(field);
    game.missionProgress.accept(mission);
    service.observe(field.species[0], 3);
    game.openRoverCargo();
    expect(player.terrainVehicle.cargoHold.specimens).toEqual([]);
    expect(game.statusMessage).toContain('opening this menu collects nothing');

    field.individuals[0].sampled = true;
    const before = service.createSnapshot();
    game.forceFullRender = false;
    keys.add('ENTER_SYSTEM');
    game._handleRoverCargoInput();
    expect(game.statusMessage).toContain('Tissue was already taken');
    expect(game.forceFullRender).toBe(true);
    expect(
      game
        .createRoverCargoModel()
        .dashboard!.some((line) => line.segments.some((span) => span.tone === 'amber'))
    ).toBe(true);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(service.createSnapshot()).toEqual(before);
    expect(game.getMissionJournalEntries()[0].objectiveShortfalls?.buds).toContain(
      'No viable propagule batch'
    );

    // A separate untouched source would be needed in play; reset only this test fixture's condition.
    field.individuals[0].sampled = false;
    game._handleRoverCargoInput();
    expect(game.gameClockElapsedSeconds).toBe(105);
    expect(game.statusMessage).toContain('CONTRACT CLAIMABLE');
    expect(game.statusMessage).toContain('Field Port');
    expect(game.getMissionJournalEntries()[0]).toMatchObject({ status: 'READY', objectiveShortfalls: {} });
    const rows = game.getRoverCargoRows();
    expect(rows[0]).toMatchObject({ disabled: true, tone: 'cyan' });
    expect(rows[0].cells[3]).toBe('ABOARD / rover hold');
    expect(rows.find((row) => row.id.startsWith('specimen:'))?.cells[0]).toBe('Viable propagule batch');
    game._handleRoverCargoInput();
    expect(game.statusMessage).toContain('Viable batch already aboard');
    expect(game.gameClockElapsedSeconds).toBe(105);
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    game.openRoverCargo();
    expect(game.statusMessage).toContain('1 viable batch aboard');
    expect(game.statusMessage).toContain('CONTRACT CLAIMABLE');

    const station = { id: 'field-port', name: 'Field Port', kind: 'starbase' } as Starbase;
    Object.assign(game, {
      stateManager: { currentSystem: { name: 'Fixture' } },
      getCurrentStarbaseMissions: () => [mission],
    });
    const boardRow = game.getStarbaseRows(station, 'missions').find((row) => row.id === mission.id)!;
    expect(boardRow.cells[3]).toBe('CLAIMABLE');
    expect(boardRow.cellTones?.[3]).toBe('amber');
    expect(boardRow.detail).toContain('STATUS: CLAIMABLE');
    const researchRow = game
      .getStarbaseRows(station, 'research')
      .find((row) => row.id === `contract:${mission.id}`)!;
    expect(researchRow.cells[3]).toBe('CLAIMABLE');
    expect(researchRow.cellTones?.[3]).toBe('amber');
    const credits = player.resources.credits;
    const expectedResearch = service.quote(
      field.species[0],
      player.terrainVehicle.cargoHold.specimens![0]
    ).credits;
    game.activateMissionSelection(station, { id: mission.id, cells: [mission.title] });
    expect(player.resources.credits).toBe(credits + 750 + expectedResearch);
    expect(player.terrainVehicle.cargoHold.specimens).toEqual([]);
    expect(game.missionProgress.getStatus(mission)).toBe('COMPLETE');
    const paidRow = game.getStarbaseRows(station, 'missions').find((row) => row.id === mission.id)!;
    expect(paidRow.cells[3]).toBe('COMPLETE');
    expect(paidRow.cellTones?.[3]).not.toBe('amber');
    game.activateMissionSelection(station, { id: mission.id, cells: [mission.title] });
    expect(player.resources.credits).toBe(credits + 750 + expectedResearch);
  });

  it.each(['volume', 'slots'] as const)(
    'previews blocked %s before a harvest without depleting its source',
    (constraint) => {
      const { game, field, player, service } = harness();
      service.observe(field.species[0], 3);
      if (constraint === 'volume') player.terrainVehicle.cargoHold.capacity = 0.05;
      else {
        const container = createCollectionContainer(field, field.individuals[0], 'live');
        player.terrainVehicle.cargoHold.specimens = [1, 2].map((index) => ({
          ...container,
          id: `occupied:${index}`,
          sourceId: `occupied:${index}`,
        }));
      }
      const before = service.createSnapshot();
      const hold = structuredClone(player.terrainVehicle.cargoHold);
      const pickup = game.getRoverCargoRows()[0];
      expect(pickup.disabled).toBe(true);
      expect(pickup.cells[3]).toContain(constraint === 'volume' ? 'cargo volume' : 'stasis slots occupied');
      game.dropSelectedRoverCargo(pickup);
      expect(game.statusMessage).toContain('No collection:');
      expect(player.terrainVehicle.cargoHold).toEqual(hold);
      expect(service.createSnapshot()).toEqual(before);
      expect(game.gameClockElapsedSeconds).toBe(100);
    }
  );

  it('explains an incomplete propagule contract on the mission board without charging or consuming cargo', () => {
    const { game, field, player } = harness();
    const mission = propaguleRequest(field);
    game.missionProgress.accept(mission);
    const station = { id: 'field-port', name: 'Field Port', kind: 'starbase' } as Starbase;
    Object.assign(game, {
      stateManager: { currentSystem: { name: 'Fixture' } },
      getCurrentStarbaseMissions: () => [mission],
    });
    const before = game.missionProgress.createSnapshot();
    const credits = player.resources.credits;
    game.activateMissionSelection(station, { id: mission.id, cells: [mission.title] });
    expect(game.starbaseMode.alert).toContain('No viable propagule batch');
    expect(game.starbaseMode.alert).toContain('press Enter');
    expect(game.forceFullRender).toBe(true);
    expect(player.resources.credits).toBe(credits);
    expect(player.terrainVehicle.cargoHold.specimens).toEqual([]);
    expect(game.missionProgress.createSnapshot()).toEqual(before);
  });

  it('keeps long cargo feedback scrollable above fixed controls on a short, narrow viewport', () => {
    const { game, keys, field, service } = harness();
    Object.assign(game, { renderer: { getGridCols: () => 30, getGridRows: () => 24 } });
    game.missionProgress.accept(propaguleRequest(field));
    service.observe(field.species[0], 3);
    game.openRoverCargo();
    keys.add('ENTER_SYSTEM');
    game._handleRoverCargoInput();
    keys.clear();
    const model = game.createRoverCargoModel();
    expect(model.dashboard).toBeDefined();
    expect(model.visibleRowCount + model.footer!.length + 10).toBeLessThanOrEqual(24);
    expect(
      model.dashboard!.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= 18)
    ).toBe(true);
    expect(model.footer!.join(' ')).toContain('PgUp/PgDn read');
    expect(model.footer!.join(' ')).not.toContain('CONTRACT CLAIMABLE');
    keys.add('PAGE_DOWN');
    game._handleRoverCargoInput();
    expect(game.createRoverCargoModel().viewOffset).toBeGreaterThan(model.viewOffset);
    expect(game.gameClockElapsedSeconds).toBe(105);
  });

  it('offers verified adjacent propagules through Cargo, preserves the parent and refuses a stale pickup', () => {
    const { game, keys, field, player, service } = harness();
    expect(game.getRoverCargoRows().some((row) => row.id.startsWith('harvest-propagules:'))).toBe(false);
    keys.add('APPROACH_TARGET');
    game.handleEncounterInput();
    keys.clear();
    const pickup = game.getRoverCargoRows().find((row) => row.id.startsWith('harvest-propagules:'))!;
    expect(pickup.disabled).toBe(false);
    game.dropSelectedRoverCargo(pickup);
    expect(game.gameClockElapsedSeconds).toBe(115);
    expect(field.individuals[0]).toMatchObject({
      state: 'active',
      sampled: false,
      propagulesHarvested: true,
    });
    expect(player.terrainVehicle.cargoHold.specimens![0]).toMatchObject({ kind: 'propagule', volumeM3: 0.1 });
    expect(service.evidence(field.species[0].id)?.level).toBe(3);
    expect(game.getRoverCargoRows().find((row) => row.id === pickup.id)?.disabled).toBe(true);
    game.dropSelectedRoverCargo(pickup);
    expect(game.gameClockElapsedSeconds).toBe(115);
    expect(player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    expect(() => parseGameSave(saveFixture(player, service))).not.toThrow();
    const model = game.createRoverCargoModel();
    expect(model.dashboard).toBeDefined();
    expect(
      model.dashboard!.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= 18)
    ).toBe(true);
  });

  it('makes no viable-batch pickup offer with incompatible preservation or a harmed source', () => {
    const { game, field, service } = harness();
    service.observe(field.species[0], 3);
    field.individuals[0].injury = 0.1;
    expect(game.getRoverCargoRows().find((row) => row.id.startsWith('harvest-propagules:'))?.disabled).toBe(
      true
    );
    field.individuals[0].injury = 0;
    field.species[0] = { ...field.species[0], temperatureK: 330 };
    expect(game.getRoverCargoRows().find((row) => row.id.startsWith('harvest-propagules:'))?.disabled).toBe(
      true
    );
    expect(game.gameClockElapsedSeconds).toBe(100);
  });
  it('credits a prior witnessed episode when a field survey is accepted later', () => {
    const { game, keys, service } = harness();
    const f = ethologyFixture();
    service.snapshot.fields = { [f.field.site.id]: f.field };
    service.snapshot.activeSiteId = f.field.site.id;
    service.observe(f.consumer, 2);
    keys.add('BIOLOGY_WAIT');
    game.handleEncounterInput();
    expect(service.hasBehaviour(f.consumer.id, f.field.site.id, 'feeding')).toBe(true);
    const station = { id: 'field-port', name: 'Field Port', kind: 'starbase' } as Starbase;
    const mission = createBehaviourContracts(
      station,
      'Fixture',
      [f.biosphere],
      service.snapshot.fields,
      service
    )[0];
    Object.assign(game, {
      stateManager: { currentSystem: { name: 'Fixture' } },
      getCurrentStarbaseMissions: () => [mission],
    });
    game.activateMissionSelection(station, { id: mission.id, cells: [mission.title] });
    expect(game.missionProgress.getStatus(mission)).toBe('READY');
  });
  it('records real passive activity through Watch, updates the mission and freezes episodes while reading', () => {
    const { game, keys, service, player } = harness();
    const f = ethologyFixture();
    service.snapshot.fields = { [f.field.site.id]: f.field };
    service.snapshot.activeSiteId = f.field.site.id;
    service.observe(f.consumer, 2);
    game.encounterController.targetId = f.actor.id;
    const mission = createBehaviourContracts(
      { id: 'field-port', name: 'Field Port', kind: 'starbase' },
      'Fixture',
      [f.biosphere],
      service.snapshot.fields,
      service
    )[0];
    game.missionProgress.accept(mission);
    const credits = player.resources.credits,
      time = game.gameClockElapsedSeconds;
    keys.add('BIOLOGY_WAIT');
    game.handleEncounterInput();
    expect(service.hasBehaviour(f.consumer.id, f.field.site.id, 'feeding')).toBe(true);
    expect(game.missionProgress.getStatus(mission)).toBe('READY');
    expect(game.gameClockElapsedSeconds).toBe(time + 10);
    expect(player.resources.credits).toBe(credits);
    expect(player.terrainVehicle.cargoHold.specimens).toEqual([]);
    const before = service.createSnapshot();
    keys.clear();
    keys.add('ORBIT_DOSSIER');
    game.handleEncounterInput();
    expect(game.encounterController.interaction.kind).toBe('dossier');
    keys.clear();
    for (let frame = 0; frame < 5; frame++) game.handleEncounterInput();
    expect(service.createSnapshot()).toEqual(before);
    expect(game.gameClockElapsedSeconds).toBe(time + 10);
    const saved = parseGameSave({
      ...saveFixture(player, service),
      ...game.missionProgress.createSnapshot(),
    });
    expect(saved.missionObjectiveProgress[mission.id]).toEqual([mission.objectives[0].id]);
  });
  it('opens Operations from a field and returns to the same actors, target and local time', () => {
    const { game, keys, field, player } = harness();
    Object.assign(game, {
      popupState: 'inactive',
      getShipMenuRows: () => [{ id: 'cargo', cells: ['Cargo', 'Empty'] }],
      getShipMenuVisibleRows: () => 8,
    });
    const target = game.encounterController.target(field)?.id;
    const before = structuredClone(field);
    keys.add('SHIP_MENU');
    game.handleEncounterInput();
    expect(game.shipMenuOpen).toBe(true);
    expect(game.encounterController.targetId).toBe(target);
    expect(field).toEqual(before);
    expect(player.terrainVehicle.moving).toBe(false);
    keys.clear();
    keys.add('QUIT');
    Object.assign(game, {
      inputManager: {
        justPressedActions: keys,
        wasActionJustPressed: (action: string) => keys.has(action),
        wasAnyKeyJustPressed: () => keys.size > 0,
      },
    });
    expect(game._handleShipMenuInput()).toBe(true);
    expect(game.shipMenuOpen).toBe(false);
    expect(field).toEqual(before);
    expect(game.encounterController.targetId).toBe(target);
    keys.clear();
    keys.add('ROVER_CARGO');
    game.handleEncounterInput();
    expect(game.shipMenuOpen).toBe(false);
    expect(game.createRoverCargoModel().title).toBe('Terrain Vehicle Cargo');
  });
  it('keeps a visited habitat accessible if new biology generation finds no new biosphere', () => {
    const { game, field } = harness();
    const planet = { name: 'Retained field', mapSeed: 'retained', moons: [], isSurfaceReady: () => true };
    Object.assign(game, {
      stateManager: {
        state: 'planet',
        currentPlanet: planet,
        currentSystem: { name: 'Fixture', starX: 0, starY: 0, systemSlot: 0, planets: [planet] },
      },
    });
    const prepare = vi.spyOn(biologyGeneration, 'prepareBiosphere').mockReturnValue(null);
    try {
      const biosphere = game.getBiosphere();
      expect(biosphere?.sites).toEqual([field.site]);
      expect(biosphere?.species).toEqual(field.species);
      expect(biosphere?.id).toBe(field.bodyId);
    } finally {
      prepare.mockRestore();
    }
  });

  it('prefers the persistent visited site over a new-generation site at the same coordinates', () => {
    const { game, field } = harness();
    const planet = { name: 'Retained field', mapSeed: 'retained', moons: [], isSurfaceReady: () => true };
    Object.assign(game, {
      stateManager: {
        state: 'planet',
        currentPlanet: planet,
        currentSystem: { name: 'Fixture', starX: 0, starY: 0, systemSlot: 0, planets: [planet] },
      },
    });
    const generated = generateBiosphere(biologyFixture({ bodyId: '0,0,0/planet:0/bio3' }))!;
    const prepare = vi.spyOn(biologyGeneration, 'prepareBiosphere').mockReturnValue({
      ...generated,
      sites: [{ ...field.site, id: `${generated.id}/site:1,1` }],
    });
    try {
      expect(game.getBiosphere()?.sites).toEqual([field.site]);
      expect(game.getBiosphere()?.id).toBe(field.bodyId);
      expect(game.getBiosphere()?.species).toEqual(field.species);
    } finally {
      prepare.mockRestore();
    }
  });

  it('round-trips typed preservation and refuses imported containers with weakened source requirements', () => {
    const { game, field, player, service } = harness();
    field.species[0] = {
      ...field.species[0],
      temperatureK: 300,
      pressureBar: 10,
      preservation: { solvent: 'water', retainsSubstrate: true },
    };
    player.ship.stasisClass = 3;
    game.dropSelectedRoverCargo(
      game.getRoverCargoRows().find((row) => row.id.startsWith('collect-organism:'))!
    );
    const saved = parseGameSave(saveFixture(player, service));
    expect(saved.player.terrainVehicle.cargoHold.specimens).toHaveLength(1);
    expect(saved.player.ship.stasisClass).toBe(3);
    const container = saved.player.terrainVehicle.cargoHold.specimens![0];
    expect(container.species.preservation).toEqual({ solvent: 'water', retainsSubstrate: true });
    container.species = { ...container.species, preservation: { solvent: 'water', retainsSubstrate: false } };
    expect(() => parseGameSave(saved)).toThrow('preservation does not match');
  });

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
    expect(row.cells[3]).toBe('CLAIMABLE');
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
    expect(
      game
        .createRoverCargoModel()
        .dashboard?.flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('Temperature outside preservation envelope');
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
