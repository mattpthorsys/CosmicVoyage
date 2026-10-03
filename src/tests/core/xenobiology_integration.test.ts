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
    stateManager: { state: 'planet', currentSystem: null, currentPlanet: null },
    inputManager: { justPressedActions: keys, wasAnyKeyJustPressed: () => keys.size > 0 },
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
