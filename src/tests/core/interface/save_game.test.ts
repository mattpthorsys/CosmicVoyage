import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';
import { DepotService } from '../../../core/depot_service';
import { StarbaseCommerceService } from '../../../core/starbase_commerce';
import { CargoSystem } from '../../../systems/cargo_systems';
import { Starbase } from '../../../entities/starbase';
import { PRNG } from '../../../utils/prng';
import {
  GameSave,
  MANUAL_SAVE_KEY,
  parseGameSave,
  SaveGameStorage,
  SESSION_SAVE_KEY,
  SAVE_GAME_VERSION,
} from '../../../core/save_game';
import { MissionProgressService } from '../../../core/mission_progress';
import type { StarbaseMission } from '../../../core/mission_board';
import { ScanService } from '../../../core/scan_service';
import { createDiscoveryRecord } from '../../../core/discovery';
import { CONFIG } from '../../../config';
import { createXenobiologySnapshot } from '../../../entities/biology/biology_types';
import { BIOLOGY_VERSION } from '../../../entities/biology/biology_types';
import { generateBiosphere } from '../../../entities/biology/biosphere_generator';
import { biologyFixture } from '../../fixtures/biology';
import { createEncounter } from '../../../systems/surface_encounter_system';
import { ethologyFixture } from '../../fixtures/ethology';
import { XenobiologyService } from '../../../core/xenobiology_service';
import { SurfaceEncounterSystem } from '../../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../../core/components';
import { createObservatorySnapshot } from '../../../core/observatory_types';
import { observatoryContactFixture, observatoryObservationFixture } from '../../fixtures/observatory';
import { createBehaviourContracts } from '../../../core/behaviour_research';
import { createPropaguleContract } from '../../../core/propagule_research';
import { createHeavyHaulSnapshot } from '../../../core/heavy_haul_types';
import { HeavyHaulService } from '../../../core/heavy_haul_service';
import { getHeavyHaulObjective } from '../../../core/mission_board';
import {
  heavyHaulContextFixture,
  heavyHaulMissionFixture,
  heavyHaulReceiptFixture,
  haulRendezvousFixture,
} from '../../fixtures/heavy_haul_contracts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  /** Returns number of stored values. */
  get length(): number {
    return this.values.size;
  }

  /** Clears all values. */
  clear(): void {
    this.values.clear();
  }

  /** Returns one value. */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  /** Returns one key by index. */
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  /** Removes one value. */
  removeItem(key: string): void {
    this.values.delete(key);
  }

  /** Stores one value. */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** Creates a minimal valid save payload. */
function createSave(): GameSave {
  return {
    version: SAVE_GAME_VERSION,
    depots: {},
    xenobiology: createXenobiologySnapshot(),
    generationVersion: CONFIG.GALAXY_MODEL_VERSION,
    savedAt: '2026-06-20T00:00:00.000Z',
    seed: 'save-test',
    gameClockElapsedSeconds: 42,
    bulkAdvanceSeconds: 0,
    heavyHaul: createHeavyHaulSnapshot(),
    infrastructure: [],
    player: {
      position: {
        worldX: 3,
        worldY: -2,
        lastWorldMoveDx: 1,
        lastWorldMoveDy: 0,
        systemX: 10,
        systemY: 20,
        surfaceX: 4,
        surfaceY: 5,
      },
      render: { char: '@', fgColor: '#00A0A0', bgColor: null, directionGlyph: '>' },
      resources: { credits: 1200, fuel: 450, maxFuel: 500 },
      cargoHold: { capacity: 100, items: { IRON: 2 }, specimens: [] },
      terrainVehicle: {
        integrity: 100,
        deployed: false,
        moving: false,
        available: true,
        onFoot: false,
        shipSurfaceX: 4,
        shipSurfaceY: 5,
        fuel: 120,
        maxFuel: 120,
        cargoHold: { capacity: 50, items: {}, specimens: [] },
      },
      crew: [],
      ship: {
        stasisClass: 0,
        towCouplerClass: 0,
        hypersleepClass: 0,
        superstructure: {
          name: 'Test',
          engineMounts: 1,
          shieldMounts: 1,
          laserMounts: 1,
          missileBayMounts: 1,
          specialPurposeBays: 1,
          landingBays: 1,
          probeBays: 1,
          cargoBays: 1,
        },
        engineClass: 1,
        shieldClass: 0,
        laserClass: 0,
        missileCount: 0,
        missileCapacity: 0,
        cargoPodsInstalled: 1,
        cargoPodCapacity: 100,
        probeBaysOccupied: 0,
        specialBaysOccupied: 1,
        surveyEquipmentClass: 1,
        damage: { hullIntegrity: 100, maxHullIntegrity: 100, subsystemDamage: {} },
      },
    },
    location: {
      kind: 'hyperspace',
      worldX: 3,
      worldY: -2,
      systemSlot: 0,
    },
    systemOrbit: null,
    systemOrbitHistory: [],
    planetMutations: [],
    acceptedMissionIds: [],
    readyMissionIds: [],
    completedMissionIds: [],
    activeMissions: {},
    missionObjectiveProgress: {},
    economy: {},
    catalogueDiscoveries: {},
    tutorialHintsShown: ['hyperspace'],
  };
}

/** Returns the pre-v5 location representation for migration tests. */
function createLegacyLocation() {
  return {
    state: 'hyperspace' as const,
    worldX: 3,
    worldY: -2,
    bodyPath: null,
    orbitReferencePath: null,
    atStarbase: false,
  };
}

describe('versioned robotic depot state', () => {
  it('migrates v21 operational records without inventing historical extraction', () => {
    const save = createSave();
    const player = new Player();
    const cargo = new CargoSystem();
    const commerce = new StarbaseCommerceService(player, cargo, 123);
    const service = new DepotService(commerce, save.seed, player, cargo);
    const station = new Starbase('v21-depot', new PRNG(save.seed), 'Remote', 'automated-depot');
    service.ensureStation(station, { worldX: 1, worldY: 2, systemSlot: 0 }, 0);
    const depots = service.createSnapshot();
    const { extraction: _extraction, ...legacyRecord } = depots[station.id];
    const old = {
      ...save,
      version: 21,
      economy: commerce.createSnapshot(),
      depots: { [station.id]: legacyRecord },
    };
    const migrated = parseGameSave(old);
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.depots[station.id].extraction).toBeNull();
    expect(migrated.economy).toEqual(old.economy);
  });

  it('migrates schema 20 without inventing inventories or changing contractor allowances', () => {
    const current = createSave();
    const { depots: _depots, ...previous } = current;
    const old = { ...previous, version: 20 };
    const migrated = parseGameSave(old);
    expect(migrated.depots).toEqual({});
    expect(migrated.economy).toEqual(current.economy);
    expect(migrated.infrastructure).toEqual(current.infrastructure);
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
  });

  it('validates and round-trips a healed patient together with canonical supply depletion', () => {
    const save = createSave();
    const player = new Player(3, -2, '@', save.seed);
    player.resources.credits = 10_000;
    player.crew[0].hitPoints -= 10;
    const commerce = new StarbaseCommerceService(player, new CargoSystem(), 12345);
    const service = new DepotService(commerce, save.seed, player, new CargoSystem());
    const station = new Starbase('save-depot', new PRNG(save.seed), 'Remote', 'automated-depot');
    service.ensureStation(station, { worldX: 3, worldY: -2, systemSlot: 0 }, 42);
    const checkpoints: GameSave[] = [];
    const result = service.purchase(service.quote(station.id, 'medical', 'all'), (next) => {
      checkpoints.push(
        parseGameSave(
          JSON.stringify({
            ...save,
            player: { ...save.player, ...next.player },
            economy: next.economy,
            depots: next.depots,
          })
        )
      );
    });
    expect(result.ok).toBe(true);
    expect(checkpoints).toHaveLength(1);
    const saved = checkpoints[0];
    expect(saved.player.crew[0].hitPoints).toBe(saved.player.crew[0].maxHitPoints);
    expect(saved.economy).toEqual(commerce.createSnapshot());
    expect(saved.depots[station.id].revision).toBe(1);
    saved.depots[station.id].lastUpdatedSeconds = 43;
    expect(() => parseGameSave(saved)).toThrow();
  });

  it('rejects duplicate crew identities and invalid clinical health bounds', () => {
    const save = createSave();
    const player = new Player(3, -2, '@', save.seed);
    save.player.crew = structuredClone(player.crew);
    save.player.crew[1].id = save.player.crew[0].id;
    expect(() => parseGameSave(save)).toThrow();
    save.player.crew = structuredClone(player.crew);
    save.player.crew[0].hitPoints = save.player.crew[0].maxHitPoints + 1;
    expect(() => parseGameSave(save)).toThrow();
  });
});

/** Builds each reachable domain stage with the matching complete save checkpoint. */
function createHaulSave(stage: 'waiting' | 'attached' | 'arrived' | 'deployed') {
  const save = createSave();
  const missions = new MissionProgressService();
  const service = new HeavyHaulService(missions);
  const mission = heavyHaulMissionFixture();
  const objective = getHeavyHaulObjective(mission)!;
  const context = heavyHaulContextFixture();
  save.player.ship = structuredClone(context.ship);
  save.player.crew = structuredClone([...context.crew]);
  Object.assign(save.player.position, {
    worldX: objective.pickup.systemAddress.worldX,
    worldY: objective.pickup.systemAddress.worldY,
  });
  save.location = { kind: 'system', ...objective.pickup.systemAddress };
  if (!service.accept(mission, context).ok) throw new Error('Invalid haul acceptance fixture.');
  if (stage !== 'waiting' && !service.couple(haulRendezvousFixture(objective.pickup), context).ok)
    throw new Error('Invalid coupling fixture.');
  if (stage === 'arrived' || stage === 'deployed') {
    const receipt = heavyHaulReceiptFixture(mission, context);
    if (!service.recordArrival(receipt, context).ok) throw new Error('Invalid arrival fixture.');
    save.gameClockElapsedSeconds = receipt.arrivalSeconds;
    save.bulkAdvanceSeconds = receipt.durationSeconds;
    save.location = { kind: 'system', ...objective.destination.systemAddress };
    Object.assign(save.player.position, {
      worldX: objective.destination.systemAddress.worldX,
      worldY: objective.destination.systemAddress.worldY,
    });
    if (stage === 'deployed') {
      const deployment = service.commitDeployment({
        ...haulRendezvousFixture(objective.destination),
        gameClockSeconds: save.gameClockElapsedSeconds,
        bulkAdvanceSeconds: save.bulkAdvanceSeconds,
        orbit: objective.destination.orbit,
      });
      if (!deployment.ok) throw new Error(deployment.message);
      save.infrastructure = [deployment.installation];
      save.player.resources.credits += deployment.credits;
    }
  }
  Object.assign(save, missions.createSnapshot());
  save.heavyHaul = service.createSnapshot();
  return { save, mission, service, missions };
}

describe('heavy-haul save foundations', () => {
  it('migrates actual version-17 records without granting free crew berths or altering normal resources', () => {
    const current = createSave();
    current.player.ship.stasisClass = 1;
    const { heavyHaul: _haul, infrastructure: _assets, bulkAdvanceSeconds: _bulk, ...legacy } = current;
    const { towCouplerClass: _coupler, hypersleepClass: _sleep, ...oldShip } = legacy.player.ship;
    const old = { ...legacy, version: 17, player: { ...legacy.player, ship: oldShip } };
    const before = structuredClone(old);
    const migrated = parseGameSave(old);
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.heavyHaul).toEqual(createHeavyHaulSnapshot());
    expect(migrated.infrastructure).toEqual([]);
    expect(migrated.bulkAdvanceSeconds).toBe(0);
    expect(migrated.player.ship).toMatchObject({ stasisClass: 1, towCouplerClass: 0, hypersleepClass: 0 });
    expect(migrated.player.resources).toEqual(old.player.resources);
    expect(old).toEqual(before);
  });

  it.each(['session', 'manual'])('loads and retires prior-version %s storage keys', (kind) => {
    const session = new MemoryStorage();
    const manual = new MemoryStorage();
    const store = kind === 'session' ? session : manual;
    const key = `cosmic-voyage.${kind}.v17`;
    store.setItem(key, JSON.stringify({ ...createSave(), version: 17 }));
    const storage = new SaveGameStorage(session, manual);
    const restored = kind === 'session' ? storage.loadSession() : storage.loadManual();
    expect(restored?.version).toBe(SAVE_GAME_VERSION);
    expect(store.getItem(key)).toBeNull();
    expect(store.getItem(kind === 'session' ? SESSION_SAVE_KEY : MANUAL_SAVE_KEY)).not.toBeNull();
    store.setItem(key, JSON.stringify({ ...createSave(), version: 17 }));
    storage.clearSession();
    storage.clearManual();
    expect(session.length + manual.length).toBe(0);
  });

  it.each(['waiting', 'attached', 'arrived', 'deployed'] as const)(
    'round-trips the %s stage without duplicating packages, payments or support fuel',
    (stage) => {
      const { save } = createHaulSave(stage);
      expect(parseGameSave(JSON.stringify(save))).toEqual(save);
    }
  );

  it('rejects absent tow state, forged support, orphan receipts, and impossible times', () => {
    const { save } = createHaulSave('arrived');
    const missing = structuredClone(save);
    missing.heavyHaul.activeTow = null;
    expect(() => parseGameSave(missing)).toThrow('no tow record');
    const fuel = structuredClone(save);
    fuel.heavyHaul.activeTow!.remainingSupportFuelUnits += 1;
    expect(() => parseGameSave(fuel)).toThrow('support ledger');
    const orphan = structuredClone(save);
    const operationId = orphan.heavyHaul.activeTow!.journeyOperationId!;
    const orphanOperationId = 'missing-contract:transit';
    const receipt = orphan.heavyHaul.journeyReceipts[operationId];
    delete orphan.heavyHaul.journeyReceipts[operationId];
    orphan.heavyHaul.journeyReceipts[orphanOperationId] = {
      ...receipt,
      operationId: orphanOperationId,
      missionId: 'missing-contract',
    };
    expect(() => parseGameSave(orphan)).toThrow('orphan');
    const time = structuredClone(save);
    time.bulkAdvanceSeconds = time.gameClockElapsedSeconds + 1;
    expect(() => parseGameSave(time)).toThrow('bulk time watermark');
  });

  it('rejects invalid equipment, overbooked bays, and planetary operations with an attached package', () => {
    const save = createSave();
    save.player.ship.hypersleepClass = 3;
    expect(() => parseGameSave(save)).toThrow('hypersleep class');
    save.player.ship.hypersleepClass = 1;
    expect(() => parseGameSave(save)).toThrow('bay accounting');
    save.player.ship.hypersleepClass = 0;
    save.player.ship.towCouplerClass = -1;
    expect(() => parseGameSave(save)).toThrow('tow coupler');
    const attached = createHaulSave('attached').save;
    attached.location = {
      kind: 'orbit',
      worldX: 0,
      worldY: 0,
      systemSlot: 0,
      bodyPath: 'planet:0',
      orbitReferencePath: 'planet:0',
    };
    expect(() => parseGameSave(attached)).toThrow('Attached tow');
  });

  it('rejects duplicate installations, unpaid sources, predated epochs, and invalid hosts', () => {
    const { save } = createHaulSave('deployed');
    const duplicate = structuredClone(save);
    duplicate.infrastructure.push(structuredClone(duplicate.infrastructure[0]));
    expect(() => parseGameSave(duplicate)).toThrow('duplicate installation');
    const unpaid = structuredClone(save);
    unpaid.completedMissionIds = [];
    expect(() => parseGameSave(unpaid)).toThrow();
    const epoch = structuredClone(save);
    Object.assign(epoch.infrastructure[0], { commissionedAtSeconds: epoch.gameClockElapsedSeconds + 1 });
    expect(() => parseGameSave(epoch)).toThrow('installation epoch');
    const host = structuredClone(save);
    Object.assign(host.infrastructure[0].orbit.host, { starId: 'D' });
    expect(() => parseGameSave(host)).toThrow('stellar host');
  });

  it('requires explicit ledgers in the current schema rather than silently discarding damaged state', () => {
    const { heavyHaul: _haul, ...incomplete } = createSave();
    expect(() => parseGameSave(incomplete)).toThrow('heavy-haul state');
  });

  it('migrates version-18 arrival records without resetting receipts, equipment, fuel or orbital epochs', () => {
    const arrived = createHaulSave('arrived').save;
    arrived.systemOrbit = {
      lastAppliedBulkSeconds: arrived.bulkAdvanceSeconds,
      stars: [{ id: 'A', orbitAngle: null, systemX: 0, systemY: 0 }],
      starbase: null,
    };
    const { systemOrbitHistory: _history, ...v18 } = structuredClone(arrived);
    const legacy = { ...v18, version: 18 };
    const migrated = parseGameSave(legacy);
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.heavyHaul).toEqual(arrived.heavyHaul);
    expect(migrated.bulkAdvanceSeconds).toBe(arrived.bulkAdvanceSeconds);
    expect(migrated.player).toEqual(arrived.player);
    expect(migrated.activeMissions).toEqual(arrived.activeMissions);
    expect(migrated.systemOrbitHistory).toEqual([
      {
        worldX: arrived.location.worldX,
        worldY: arrived.location.worldY,
        systemSlot: arrived.location.systemSlot,
        orbit: arrived.systemOrbit,
      },
    ]);
  });

  it.each(['session', 'manual'])('migrates version-18 %s keys and clears them explicitly', (kind) => {
    const session = new MemoryStorage();
    const manual = new MemoryStorage();
    const store = kind === 'session' ? session : manual;
    const legacyKey = `cosmic-voyage.${kind}.v18`;
    const { systemOrbitHistory: _history, ...old } = createHaulSave('arrived').save;
    store.setItem(legacyKey, JSON.stringify({ ...old, version: 18 }));
    const storage = new SaveGameStorage(session, manual);
    const migrated = kind === 'session' ? storage.loadSession() : storage.loadManual();
    expect(migrated?.heavyHaul.activeTow?.stage).toBe('arrived');
    expect(migrated?.version).toBe(SAVE_GAME_VERSION);
    expect(store.getItem(legacyKey)).toBeNull();
    store.setItem(legacyKey, JSON.stringify({ ...old, version: 18 }));
    if (kind === 'session') storage.clearSession();
    else storage.clearManual();
    expect(store.getItem(legacyKey)).toBeNull();
  });

  it('rejects duplicated/future orbital history and attached hyperspace locations', () => {
    const current = createSave();
    const history = {
      worldX: 0,
      worldY: 0,
      systemSlot: 0,
      orbit: { stars: [], starbase: null, lastAppliedBulkSeconds: 0 },
    };
    expect(() => parseGameSave({ ...current, systemOrbitHistory: [history, history] })).toThrow(
      'duplicate system'
    );
    expect(() =>
      parseGameSave({
        ...current,
        systemOrbitHistory: [{ ...history, orbit: { ...history.orbit, lastAppliedBulkSeconds: 1 } }],
      })
    ).toThrow('watermark');
    const attached = createHaulSave('attached').save;
    attached.location = { ...attached.location, kind: 'hyperspace' };
    expect(() => parseGameSave(attached)).toThrow('planetary operations');
  });

  it('rejects system/address mismatches, missing commissioned assets, and unaccounted journey time', () => {
    const arrived = createHaulSave('arrived').save;
    const wrongAddress = structuredClone(arrived);
    wrongAddress.location.worldX += 1;
    expect(() => parseGameSave(wrongAddress)).toThrow('system address');
    const noTime = structuredClone(arrived);
    noTime.bulkAdvanceSeconds = 0;
    expect(() => parseGameSave(noTime)).toThrow('exceed bulk time');
    const deployed = createHaulSave('deployed').save;
    deployed.infrastructure = [];
    expect(() => parseGameSave(deployed)).toThrow('no commissioned installation');
  });
});

describe('save game persistence', () => {
  it('round-trips observatory evidence and a destination while accepting voyages without the new optional instrument state', () => {
    const save = createSave();
    expect(() => parseGameSave(JSON.stringify(save))).not.toThrow();
    const contact = observatoryContactFixture();
    save.player.ship.observatoryClass = 2;
    save.player.ship.superstructure.specialPurposeBays = 2;
    save.player.ship.specialBaysOccupied = 2;
    save.observatory = createObservatorySnapshot();
    save.observatory.observations[contact.id] = observatoryObservationFixture(contact);
    save.observatory.destination = {
      worldX: contact.worldX,
      worldY: contact.worldY,
      systemSlot: 0,
      name: contact.name,
      kind: contact.kind,
    };
    expect(parseGameSave(JSON.stringify(save)).observatory).toEqual(save.observatory);
    save.observatory.destination.systemSlot = 1;
    expect(() => parseGameSave(JSON.stringify(save))).toThrow('unreachable');
    save.observatory.destination.systemSlot = 0;
    save.player.ship.observatoryClass = 9;
    expect(() => parseGameSave(JSON.stringify(save))).toThrow('observatory class');
  });

  it('round-trips viable batches, source depletion, reproductive demand and typed accepted requests', () => {
    const save = createSave();
    const f = ethologyFixture();
    f.field.individuals = [f.field.individuals[0]];
    const source = f.field.individuals[0];
    f.field.roverX = source.x + 1;
    f.field.roverY = source.y;
    const research = new XenobiologyService();
    research.snapshot.fields[f.field.site.id] = f.field;
    research.observe(f.field.species[0], 3);
    const biosphere = {
      id: f.field.bodyId,
      bodyName: 'Fixture',
      origin: 'introduced' as const,
      species: f.field.species,
      sites: [f.field.site],
    };
    const mission = createPropaguleContract(
      { id: 'buds-port', name: 'Buds Port', kind: 'starbase' },
      'Fixture',
      [biosphere],
      research.snapshot.fields,
      [],
      research
    )[0];
    const progress = new MissionProgressService();
    progress.accept(mission);
    const cargo = createDefaultCargo(10);
    const result = new SurfaceEncounterSystem().act(
      f.field,
      { kind: 'harvest', targetId: source.id },
      cargo,
      1
    );
    expect(result.elapsedSeconds).toBe(5);
    // Prior accepted reproductive references survive alongside a new, unsold batch.
    research.submit(f.field.species[0], { ...cargo.specimens![0], sourceId: 'prior-source' });
    save.player.terrainVehicle.cargoHold = cargo;
    save.player.ship.stasisClass = 1;
    save.xenobiology = research.createSnapshot();
    Object.assign(save, progress.createSnapshot());
    const restored = parseGameSave(JSON.stringify(save));
    expect(restored.xenobiology).toEqual(save.xenobiology);
    expect(restored.activeMissions[mission.id]).toEqual(mission);
    expect(restored.player.terrainVehicle.cargoHold.specimens![0].kind).toBe('propagule');
    const falseHistory = structuredClone(restored);
    falseHistory.xenobiology.fields[f.field.site.id].individuals[0].propagulesHarvested = false;
    expect(() => parseGameSave(falseHistory)).toThrow('lifecycle');
    const negativeDemand = structuredClone(restored);
    negativeDemand.xenobiology.demand[f.field.species[0].id].propaguleSamples = -1;
    expect(() => parseGameSave(negativeDemand)).toThrow('biology number');
  });

  it('migrates version-16 storage and mat capability without changing identities, history or submitted rewards', () => {
    const save = createSave();
    const biosphere = generateBiosphere(biologyFixture())!;
    const field = createEncounter(biosphere, {
      id: `${biosphere.id}/site:1,1`,
      label: 'Visited habitat',
      x: 1,
      y: 1,
    });
    field.species = field.species.map((species) => ({ ...species, reproduction: undefined }));
    field.individuals[0].sampled = true;
    save.xenobiology.fields[field.site.id] = field;
    const legacy = { ...save, version: 16 };
    const before = structuredClone(legacy);
    const migrated = parseGameSave(JSON.stringify(legacy));
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.xenobiology.fields[field.site.id].species[0].reproduction).toEqual({
      kind: 'dormant-buds',
      baselineSamples: 2,
    });
    expect(migrated.xenobiology.fields[field.site.id].individuals).toEqual(field.individuals);
    expect(migrated.xenobiology.demand).toEqual(save.xenobiology.demand);
    expect(legacy).toEqual(before);
    const session = new MemoryStorage(),
      manual = new MemoryStorage();
    session.setItem('cosmic-voyage.session.v16', JSON.stringify(legacy));
    manual.setItem('cosmic-voyage.manual.v16', JSON.stringify(legacy));
    const storage = new SaveGameStorage(session, manual);
    expect(storage.loadSession()).toEqual(migrated);
    expect(storage.loadManual()).toEqual(migrated);
    expect(session.getItem('cosmic-voyage.session.v16')).toBeNull();
    expect(manual.getItem('cosmic-voyage.manual.v16')).toBeNull();
    storage.clearSession();
    storage.clearManual();
    expect(session.length + manual.length).toBe(0);
  });
  it('round-trips field-study packets but rejects unsupported requirements and progress without a real episode', () => {
    const f = ethologyFixture();
    const research = new XenobiologyService();
    research.snapshot.fields[f.field.site.id] = f.field;
    research.observe(f.consumer, 2);
    const mission = createBehaviourContracts(
      { id: 'ethology-port', name: 'Ethology Port', kind: 'starbase' },
      'Fixture',
      [f.biosphere],
      research.snapshot.fields,
      research
    )[0];
    const progress = new MissionProgressService();
    progress.accept(mission);
    const result = new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, createDefaultCargo(50), 1);
    const witness = result.behaviourWitnesses!.find((entry) => entry.observation.kind === 'feeding')!;
    research.recordBehaviour(witness);
    progress.recordBehaviourEvidence(f.consumer.id, f.field.site.id, 'feeding');
    const save = { ...createSave(), ...progress.createSnapshot(), xenobiology: research.createSnapshot() };
    expect(parseGameSave(JSON.stringify(save)).activeMissions[mission.id]).toEqual(mission);
    const unsupported = structuredClone(save);
    const requirement = unsupported.activeMissions[mission.id].objectives[0];
    if (requirement.kind !== 'biology-behaviour') throw new Error('Expected a field-study objective.');
    requirement.requiredBehaviour = 'defensive-display';
    expect(() => parseGameSave(unsupported)).toThrow('Invalid non-destructive field-study requirement');
    const fabricated = structuredClone(save);
    fabricated.xenobiology.evidence[f.consumer.id].behaviourObservations = [];
    expect(() => parseGameSave(fabricated)).toThrow('Field study progress has no witnessed episode');
    const falseReady = structuredClone(save);
    falseReady.missionObjectiveProgress[mission.id] = [];
    expect(() => parseGameSave(falseReady)).toThrow('Ready field study is missing an observation packet');
  });
  it('retains witnessed episodes and restores version-15 saves without inventing behaviour records', () => {
    const f = ethologyFixture();
    const research = new XenobiologyService();
    research.snapshot.fields[f.field.site.id] = f.field;
    research.observe(f.consumer, 2);
    const result = new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, createDefaultCargo(50), 1);
    research.recordBehaviour(result.behaviourWitnesses![0]);
    const save = createSave();
    save.xenobiology = research.createSnapshot();
    expect(parseGameSave(JSON.stringify(save)).xenobiology).toEqual(save.xenobiology);
    const legacy = { ...createSave(), version: 15 };
    expect(parseGameSave(legacy).version).toBe(SAVE_GAME_VERSION);
    expect(parseGameSave(legacy).xenobiology).toEqual(createXenobiologySnapshot());
    const session = new MemoryStorage();
    session.setItem('cosmic-voyage.session.v15', JSON.stringify(legacy));
    const storage = new SaveGameStorage(session, new MemoryStorage());
    expect(storage.loadSession()?.version).toBe(SAVE_GAME_VERSION);
    storage.clearSession();
    expect(session.length).toBe(0);
  });
  it('restores active fields at the current biology version and retains older field IDs', () => {
    const save = createSave();
    const location = { worldX: 3, worldY: -2, systemSlot: 0, bodyPath: 'planet:0' };
    /** Builds a valid field snapshot with either the persisted or current generated body suffix. */
    const makeField = (version: number) => {
      const bodyId = `3,-2,0/planet:0/bio${version}`;
      const biosphere = generateBiosphere(biologyFixture({ bodyId }))!;
      return createEncounter(biosphere, {
        id: `${bodyId}/site:12,15`,
        x: 12,
        y: 15,
        label: 'Restoration site',
      });
    };
    const currentField = makeField(BIOLOGY_VERSION);
    save.location = { ...location, kind: 'planet', orbitReferencePath: 'planet:0' };
    save.player.position.surfaceX = 12;
    save.player.position.surfaceY = 15;
    save.player.terrainVehicle.deployed = true;
    save.xenobiology.fields[currentField.site.id] = currentField;
    save.xenobiology.activeSiteId = currentField.site.id;
    expect(parseGameSave(save).xenobiology.fields[currentField.site.id].bodyId).toContain(
      `/bio${BIOLOGY_VERSION}`
    );
    expect(() => parseGameSave({ ...save, location: { ...save.location, worldX: 4 } })).toThrow(
      'Active encounter does not match saved location'
    );

    const legacyField = makeField(1);
    save.xenobiology.fields = { [legacyField.site.id]: legacyField };
    save.xenobiology.activeSiteId = legacyField.site.id;
    expect(parseGameSave(save).xenobiology.fields[legacyField.site.id].bodyId).toContain('/bio1');
    const versionTwo = makeField(2);
    save.xenobiology.fields = { [versionTwo.site.id]: versionTwo };
    save.xenobiology.activeSiteId = versionTwo.site.id;
    expect(parseGameSave({ ...save, version: 14 }).xenobiology.fields[versionTwo.site.id]).toEqual(
      versionTwo
    );
  });

  it('migrates version-fourteen storage and preserves exact class-three equipment capabilities', () => {
    const legacy = { ...createSave(), version: 14 };
    const session = new MemoryStorage(),
      manual = new MemoryStorage();
    session.setItem('cosmic-voyage.session.v14', JSON.stringify(legacy));
    manual.setItem('cosmic-voyage.manual.v14', JSON.stringify(legacy));
    const storage = new SaveGameStorage(session, manual);
    expect(storage.loadSession()).toEqual({ ...legacy, version: SAVE_GAME_VERSION });
    expect(storage.loadManual()).toEqual({ ...legacy, version: SAVE_GAME_VERSION });
    expect(session.getItem('cosmic-voyage.session.v14')).toBeNull();
    expect(manual.getItem('cosmic-voyage.manual.v14')).toBeNull();
    const current = createSave();
    current.player.ship.stasisClass = 3;
    expect(parseGameSave(JSON.stringify(current)).player.ship.stasisClass).toBe(3);
    current.player.ship.stasisClass = 4;
    expect(() => parseGameSave(current)).toThrow();
    storage.clearSession();
    storage.clearManual();
    expect(session.length).toBe(0);
    expect(manual.length).toBe(0);
  });

  it('migrates version-thirteen storage without losing evidence or accepted contract packets', () => {
    const legacy = { ...createSave(), version: 13 };
    const session = new MemoryStorage();
    const manual = new MemoryStorage();
    session.setItem('cosmic-voyage.session.v13', JSON.stringify(legacy));
    manual.setItem('cosmic-voyage.manual.v13', JSON.stringify(legacy));
    const storage = new SaveGameStorage(session, manual);
    expect(storage.loadSession()).toEqual({ ...legacy, version: SAVE_GAME_VERSION });
    expect(storage.loadManual()).toEqual({ ...legacy, version: SAVE_GAME_VERSION });
    expect(session.getItem('cosmic-voyage.session.v13')).toBeNull();
    expect(manual.getItem('cosmic-voyage.manual.v13')).toBeNull();
    expect(session.getItem(SESSION_SAVE_KEY)).not.toBeNull();
    expect(manual.getItem(MANUAL_SAVE_KEY)).not.toBeNull();
  });

  it('round-trips bounded comparative objectives and rejects forged sizes, duplicate objectives or mixed surveys', () => {
    const save = createSave();
    const mission: StarbaseMission = {
      id: 'comparison',
      title: 'Size comparison',
      type: 'xenobiology',
      issuer: 'Office',
      summary: 'Two specimens',
      detail: 'Supply both.',
      rewardCredits: 1000,
      risk: 'Low',
      originStarbaseId: 'port',
      originStarbaseName: 'Port',
      systemName: 'Fixture',
      objectives: (['small', 'large'] as const).map((sizeClass) => ({
        id: sizeClass,
        kind: 'specimen' as const,
        targetName: 'Organism',
        targetLabel: `${sizeClass} tissue`,
        speciesId: 'species',
        siteId: 'site',
        requiredKind: 'tissue' as const,
        minimumQuality: 0.6,
        sizeClass,
      })),
    };
    save.activeMissions[mission.id] = mission;
    save.acceptedMissionIds = [mission.id];
    save.missionObjectiveProgress[mission.id] = [];
    expect(parseGameSave(JSON.parse(JSON.stringify(save))).activeMissions[mission.id]).toEqual(mission);
    const invalidSize = structuredClone(save);
    Object.assign(invalidSize.activeMissions[mission.id].objectives[0], { sizeClass: 'gigantic' });
    expect(() => parseGameSave(invalidSize)).toThrow('specimen mission objective');
    const duplicate = structuredClone(save);
    duplicate.activeMissions[mission.id].objectives[1].id = 'small';
    expect(() => parseGameSave(duplicate)).toThrow('Duplicate mission objective');
    const excessive = structuredClone(save);
    excessive.activeMissions[mission.id].objectives = Array.from({ length: 5 }, (_, index) => ({
      ...mission.objectives[0],
      id: `${index}`,
    }));
    expect(() => parseGameSave(excessive)).toThrow('biological delivery contract');
    const mixed = structuredClone(save);
    mixed.activeMissions[mission.id].objectives.push({
      id: 'scan',
      kind: 'scan',
      targetName: 'Fixture',
      targetLabel: 'Scan',
      targetType: 'planet',
      requiredDiscoveryLevel: 'surveyed',
    });
    expect(() => parseGameSave(mixed)).toThrow('biological delivery contract');
    mission.objectives = ['first', 'second'].map((siteId) => ({
      id: siteId,
      kind: 'biology-data' as const,
      targetName: 'Organism',
      targetLabel: siteId,
      speciesId: 'species',
      siteId,
      requiredEvidenceLevel: 3 as const,
    }));
    save.missionObjectiveProgress[mission.id] = ['first'];
    expect(parseGameSave(JSON.parse(JSON.stringify(save))).missionObjectiveProgress[mission.id]).toEqual([
      'first',
    ]);
  });

  it('migrates version-eleven storage without resetting biology or other progress', () => {
    const session = new MemoryStorage();
    const storage = new SaveGameStorage(session, new MemoryStorage());
    const legacy = { ...createSave(), version: 11 };
    session.setItem('cosmic-voyage.session.v11', JSON.stringify(legacy));
    const migrated = storage.loadSession();
    expect(migrated).toEqual({ ...legacy, version: SAVE_GAME_VERSION });
    expect(session.getItem('cosmic-voyage.session.v11')).toBeNull();
    expect(session.getItem(SESSION_SAVE_KEY)).not.toBeNull();
  });

  it('migrates version-twelve storage and admits bounded biological data objectives', () => {
    const legacy = { ...createSave(), version: 12 };
    const session = new MemoryStorage();
    session.setItem('cosmic-voyage.session.v12', JSON.stringify(legacy));
    const migrated = new SaveGameStorage(session, new MemoryStorage()).loadSession()!;
    expect(migrated).toEqual({ ...legacy, version: SAVE_GAME_VERSION });
    expect(session.getItem('cosmic-voyage.session.v12')).toBeNull();
    const mission: StarbaseMission = {
      id: 'analysis',
      title: 'Field analysis',
      type: 'xenobiology',
      issuer: 'Office',
      summary: 'Detailed evidence',
      detail: 'No capture needed.',
      rewardCredits: 450,
      risk: 'Low',
      originStarbaseId: 'port',
      originStarbaseName: 'Port',
      systemName: 'Fixture',
      objectives: [
        {
          id: 'analysis',
          kind: 'biology-data',
          speciesId: 'species',
          siteId: 'site',
          targetName: 'Organism',
          targetLabel: 'Detailed analysis',
          requiredEvidenceLevel: 3,
        },
      ],
    };
    migrated.activeMissions[mission.id] = mission;
    migrated.acceptedMissionIds.push(mission.id);
    migrated.missionObjectiveProgress[mission.id] = [];
    expect(() => parseGameSave(migrated)).not.toThrow();
    const objective = mission.objectives[0];
    if (objective.kind !== 'biology-data') throw new Error('Expected biological data.');
    objective.reference = {
      symmetry: 'radial',
      bodyForm: 'mat',
      locomotion: 'rooted',
      metabolism: 'autotroph',
      role: 'primary producer',
      behaviour: 'sessile',
    };
    expect(parseGameSave(migrated).activeMissions[mission.id].objectives[0]).toEqual(objective);
    Object.assign(objective.reference, { symmetry: 'invalid' });
    expect(() => parseGameSave(migrated)).toThrow('reference traits');
    delete objective.reference;
    Object.assign(objective, { requiredEvidenceLevel: 99 });
    expect(() => parseGameSave(migrated)).toThrow('evidence requirement');
  });

  it('validates biological objective identity, kind and quality bounds', () => {
    const save = createSave();
    save.acceptedMissionIds = ['biology-contract'];
    save.activeMissions['biology-contract'] = {
      id: 'biology-contract',
      title: 'Reference',
      type: 'xenobiology',
      issuer: 'Science Office',
      summary: 'Live specimen',
      detail: 'Regional reference',
      rewardCredits: 900,
      risk: 'Low',
      originStarbaseId: 'biology-port',
      originStarbaseName: 'Biology Port',
      systemName: 'Fixture',
      objectives: [
        {
          id: 'deliver',
          kind: 'specimen',
          targetName: 'Known organism',
          targetLabel: 'Live reference',
          speciesId: 'managed-carbon-water:1',
          siteId: 'fixture/site:4,4',
          requiredKind: 'live',
          minimumQuality: 0.75,
        },
      ],
    };
    save.missionObjectiveProgress = { 'biology-contract': [] };
    expect(() => parseGameSave(save)).not.toThrow();
    const mission = save.activeMissions['biology-contract'];
    mission.systemAddress = { worldX: -72, worldY: -73, systemSlot: 0 };
    const objective = mission.objectives[0];
    objective.location = {
      bodyName: 'Fixture I',
      bodyPath: 'planet:0',
      surface: { x: 4, y: 4, siteId: 'fixture/site:4,4', label: 'Habitat 1' },
    };
    expect(parseGameSave(save).activeMissions['biology-contract']).toEqual(mission);
    objective.location.surface!.x = -1;
    expect(() => parseGameSave(save)).toThrow('landing coordinates');
    objective.location.surface!.x = 4;
    objective.location.surface!.siteId = 'wrong-habitat';
    expect(() => parseGameSave(save)).toThrow('does not match');
    objective.location.surface!.siteId = 'fixture/site:4,4';
    mission.systemAddress.systemSlot = -1;
    expect(() => parseGameSave(save)).toThrow('mission system slot');
    mission.systemAddress.systemSlot = 0;
    objective.location.bodyPath = 'not-a-body-path';
    expect(() => parseGameSave(save)).toThrow('mission body path');
    objective.location.bodyPath = 'planet:0';
    delete objective.location;
    if (objective.kind !== 'specimen') throw new Error('Expected a specimen objective.');
    objective.minimumQuality = 1.5;
    expect(() => parseGameSave(save)).toThrow('specimen mission objective');
    objective.minimumQuality = 0.75;
    objective.siteId = '';
    expect(() => parseGameSave(save)).toThrow('habitat id');
  });

  it('migrates version ten without altering generated-world identity or vessel progress', () => {
    const old = { ...createSave(), version: 10, xenobiology: undefined };
    delete old.player.cargoHold.specimens;
    delete old.player.terrainVehicle.cargoHold.specimens;
    delete old.player.terrainVehicle.integrity;
    delete old.player.ship.stasisClass;
    const migrated = parseGameSave(old);
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.location).toEqual(old.location);
    expect(migrated.generationVersion).toBe(old.generationVersion);
    expect(migrated.xenobiology).toEqual(createXenobiologySnapshot());
    expect(migrated.player.terrainVehicle.integrity).toBe(100);
    expect(migrated.player.ship.stasisClass).toBe(1);
    expect(old.player.ship.stasisClass).toBeUndefined();
  });
  it('round-trips session and persistent browser saves independently', () => {
    const session = new MemoryStorage();
    const persistent = new MemoryStorage();
    const storage = new SaveGameStorage(session, persistent);
    const save = createSave();

    storage.saveSession(save);
    storage.saveManual(save);

    expect(storage.loadSession()).toEqual(save);
    expect(storage.loadManual()).toEqual(save);
    expect(session.getItem(SESSION_SAVE_KEY)).not.toBeNull();
    expect(persistent.getItem(MANUAL_SAVE_KEY)).not.toBeNull();
  });

  it('discovers, migrates, and rewrites generation-three session saves', () => {
    const session = new MemoryStorage();
    const storage = new SaveGameStorage(session, new MemoryStorage());
    const previous = {
      ...createSave(),
      version: 7,
      generationVersion: 3,
    };
    session.setItem('cosmic-voyage.session.v7', JSON.stringify(previous));

    const migrated = storage.loadSession();

    expect(migrated).toMatchObject({
      version: SAVE_GAME_VERSION,
      generationVersion: CONFIG.GALAXY_MODEL_VERSION,
      migratedFromGenerationVersion: 3,
    });
    expect(session.getItem(SESSION_SAVE_KEY)).not.toBeNull();
    expect(session.getItem('cosmic-voyage.session.v7')).toBeNull();
  });

  it('discovers, migrates, and rewrites generation-four session saves', () => {
    const session = new MemoryStorage();
    const storage = new SaveGameStorage(session, new MemoryStorage());
    const previous = {
      ...createSave(),
      version: 8,
      generationVersion: 4,
    };
    session.setItem('cosmic-voyage.session.v8', JSON.stringify(previous));

    const migrated = storage.loadSession();

    expect(migrated).toMatchObject({
      version: SAVE_GAME_VERSION,
      generationVersion: CONFIG.GALAXY_MODEL_VERSION,
      migratedFromGenerationVersion: 4,
    });
    expect(session.getItem(SESSION_SAVE_KEY)).not.toBeNull();
    expect(session.getItem('cosmic-voyage.session.v8')).toBeNull();
  });

  it('rejects unsupported versions and removes corrupt stored saves', () => {
    const session = new MemoryStorage();
    const storage = new SaveGameStorage(session, new MemoryStorage());
    session.setItem(SESSION_SAVE_KEY, '{"version":99}');

    expect(storage.loadSession()).toBeNull();
    expect(session.getItem(SESSION_SAVE_KEY)).toBeNull();
    expect(() => parseGameSave('{"version":99}')).toThrow('Unsupported save version');
  });

  it('migrates version-one binary planet scans into layered discovery records', () => {
    const current = createSave();
    const {
      catalogueDiscoveries: _catalogueDiscoveries,
      readyMissionIds: _readyMissionIds,
      missionObjectiveProgress: _missionObjectiveProgress,
      economy: _economy,
      ...legacyBase
    } = current;
    const migrated = parseGameSave({
      ...legacyBase,
      version: 1,
      location: createLegacyLocation(),
      planetMutations: [
        {
          worldX: 3,
          worldY: -2,
          bodyPath: 'planet:0',
          orbitAngle: 0,
          systemX: 10,
          systemY: 20,
          scanned: true,
          primaryResource: 'Iron',
          minedLocations: [],
          minedLocationAmounts: {},
        },
      ],
    });

    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.planetMutations[0].discovery.level).toBe('surveyed');
    expect(migrated.catalogueDiscoveries).toEqual({});
  });

  it('migrates version-two mission objectives into staged progress state', () => {
    const current = createSave();
    const {
      readyMissionIds: _readyMissionIds,
      missionObjectiveProgress: _missionObjectiveProgress,
      economy: _economy,
      ...legacy
    } = current;
    const migrated = parseGameSave({
      ...legacy,
      version: 2,
      location: createLegacyLocation(),
      acceptedMissionIds: ['legacy-mission'],
      activeMissions: {
        'legacy-mission': {
          id: 'legacy-mission',
          title: 'Legacy survey',
          type: 'survey',
          issuer: 'Survey Office',
          summary: 'Survey target.',
          detail: 'Legacy contract.',
          rewardCredits: 500,
          risk: 'Low',
          originStarbaseName: 'Legacy Base',
          systemName: 'Legacy System',
          objective: {
            kind: 'scan',
            targetName: 'Legacy I',
            targetLabel: 'Scan Legacy I',
            targetType: 'planet',
            requiredDiscoveryLevel: 'surveyed',
          },
        },
      },
    });

    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.activeMissions['legacy-mission'].objectives[0].id).toBe('legacy-scan');
    expect(migrated.readyMissionIds).toEqual([]);
    expect(migrated.missionObjectiveProgress).toEqual({});
  });

  it('migrates version-three saves with a starter survey suite and empty economy', () => {
    const current = createSave();
    const { economy: _economy, ...legacy } = current;
    const { surveyEquipmentClass: _surveyEquipmentClass, ...legacyShip } = legacy.player.ship;
    const migrated = parseGameSave({
      ...legacy,
      version: 3,
      location: createLegacyLocation(),
      player: { ...legacy.player, ship: legacyShip },
    });

    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.player.ship.surveyEquipmentClass).toBe(1);
    expect(migrated.economy).toEqual({});
  });

  it('migrates version-four location fields into a discriminated location record', () => {
    const current = createSave();
    const migrated = parseGameSave({
      ...current,
      version: 4,
      location: {
        state: 'orbit',
        worldX: 3,
        worldY: -2,
        bodyPath: 'planet:0/moon:1',
        orbitReferencePath: 'planet:0',
        atStarbase: false,
      },
    });

    expect(migrated.location).toEqual({
      kind: 'orbit',
      worldX: -7,
      worldY: -10,
      systemSlot: 0,
      bodyPath: 'planet:0/moon:1',
      orbitReferencePath: 'planet:0',
    });
  });

  it('migrates version-five saves onto the one-light-year Galactic grid with slot-zero identities', () => {
    const current = createSave();
    const { generationVersion: _generationVersion, ...legacy } = current;
    const { systemSlot: _systemSlot, ...legacyLocation } = legacy.location;
    const migrated = parseGameSave({
      ...legacy,
      version: 5,
      location: legacyLocation,
    });

    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.generationVersion).toBe(CONFIG.GALAXY_MODEL_VERSION);
    expect(migrated.migratedFromGenerationVersion).toBe(1);
    expect(migrated.location.systemSlot).toBe(0);
    expect(migrated.location).toMatchObject({ worldX: -7, worldY: -10 });

    const migratedStation = parseGameSave({
      ...legacy,
      version: 5,
      location: { kind: 'starbase', worldX: 3, worldY: -2, starbaseName: 'Legacy Base' },
    });
    expect(migratedStation.location).toMatchObject({
      kind: 'starbase',
      worldX: -7,
      worldY: -10,
      systemSlot: 0,
      stationId: 'legacy-current-starbase',
      starbaseName: 'Legacy Base',
    });
  });

  it('rotates and rescales generation-two saves while preserving physical position', () => {
    const current = createSave();
    const migrated = parseGameSave({
      ...current,
      version: 6,
      generationVersion: 2,
      location: { kind: 'system', worldX: 3, worldY: -2, systemSlot: 0 },
      planetMutations: [
        {
          worldX: 3,
          worldY: -2,
          systemSlot: 0,
          bodyPath: 'planet:0',
          orbitAngle: 0,
          systemX: 10,
          systemY: 20,
          discovery: createDiscoveryRecord('surveyed', 100, 1, 'orbital-survey'),
          primaryResource: 'Iron',
          minedLocations: [],
          minedLocationAmounts: {},
        },
      ],
    });

    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.generationVersion).toBe(CONFIG.GALAXY_MODEL_VERSION);
    expect(migrated.migratedFromGenerationVersion).toBe(2);
    expect(migrated.player.position).toMatchObject({
      worldX: -7,
      worldY: -10,
      lastWorldMoveDx: 0,
      lastWorldMoveDy: -1,
    });
    expect(migrated.location).toMatchObject({ worldX: -7, worldY: -10 });
    expect(migrated.planetMutations[0]).toMatchObject({ worldX: -7, worldY: -10 });
  });

  it('rejects version-six saves that do not identify generation two', () => {
    const current = createSave();

    expect(() =>
      parseGameSave({
        ...current,
        version: 6,
        generationVersion: 1,
      })
    ).toThrow('Unsupported Galaxy generation version');
  });

  it('migrates generation-three saves without changing one-light-year coordinates', () => {
    const current = createSave();
    const migrated = parseGameSave({
      ...current,
      version: 7,
      generationVersion: 3,
    });

    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.generationVersion).toBe(CONFIG.GALAXY_MODEL_VERSION);
    expect(migrated.migratedFromGenerationVersion).toBe(3);
    expect(migrated.player.position).toMatchObject({ worldX: 3, worldY: -2 });
    expect(migrated.location).toMatchObject({ worldX: 3, worldY: -2 });
  });

  it('rejects version-seven saves that do not identify generation three', () => {
    const current = createSave();

    expect(() =>
      parseGameSave({
        ...current,
        version: 7,
        generationVersion: 2,
      })
    ).toThrow('Unsupported Galaxy generation version');
  });

  it('rejects version-eight saves that do not identify generation four', () => {
    const current = createSave();

    expect(() =>
      parseGameSave({
        ...current,
        version: 8,
        generationVersion: 3,
      })
    ).toThrow('Unsupported Galaxy generation version');
  });

  it.each(['session', 'manual'])(
    'migrates version-nine %s storage while preserving assets and coordinates',
    (kind) => {
      const session = new MemoryStorage();
      const persistent = new MemoryStorage();
      const storage = new SaveGameStorage(session, persistent);
      const store = kind === 'session' ? session : persistent;
      const oldKey = `cosmic-voyage.${kind}.v9`;
      const oldSave = { ...createSave(), version: 9, generationVersion: 5 };
      store.setItem(oldKey, JSON.stringify(oldSave));
      const result = kind === 'session' ? storage.loadSession() : storage.loadManual();
      expect(result).toMatchObject({
        version: SAVE_GAME_VERSION,
        generationVersion: CONFIG.GALAXY_MODEL_VERSION,
        migratedFromGenerationVersion: 5,
      });
      expect(result?.player).toEqual({
        ...oldSave.player,
        ship: { ...oldSave.player.ship, stasisClass: 1 },
      });
      expect(oldSave.player.ship.stasisClass).toBe(0);
      expect(result?.location).toEqual(oldSave.location);
      expect(store.getItem(oldKey)).toBeNull();
      expect(store.getItem(kind === 'session' ? SESSION_SAVE_KEY : MANUAL_SAVE_KEY)).not.toBeNull();
    }
  );

  it('rejects version-nine payloads with incompatible generation identities', () => {
    expect(() => parseGameSave({ ...createSave(), version: 9, generationVersion: 4 })).toThrow(
      'Unsupported Galaxy generation version'
    );
  });

  it('retires generation-six local identities without changing the save schema or portable progress', () => {
    const old = { ...createSave(), generationVersion: 6 };
    const migrated = parseGameSave(old);
    expect(migrated.generationVersion).toBe(CONFIG.GALAXY_MODEL_VERSION);
    expect(migrated.migratedFromGenerationVersion).toBe(6);
    expect(migrated.version).toBe(old.version);
    expect(migrated.player).toEqual(old.player);
    expect(migrated.location).toEqual(old.location);
    expect(old.generationVersion).toBe(6);
  });

  it('rejects impossible typed locations and malformed nested state', () => {
    const save = createSave();

    expect(() =>
      parseGameSave({
        ...save,
        location: { kind: 'orbit', worldX: 3, worldY: -2, systemSlot: 0 },
      })
    ).toThrow('body path');
    expect(() =>
      parseGameSave({
        ...save,
        location: {
          kind: 'hyperspace',
          worldX: 3,
          worldY: -2,
          systemSlot: 0,
          bodyPath: 'planet:0',
        },
      })
    ).toThrow('incompatible');
    expect(() =>
      parseGameSave({
        ...save,
        player: {
          ...save.player,
          resources: { ...save.player.resources, fuel: Number.NaN },
        },
      })
    ).toThrow('player fuel');
    expect(() =>
      parseGameSave({
        ...save,
        missionObjectiveProgress: { missing: ['objective'] },
      })
    ).toThrow('inconsistent');
    expect(() =>
      parseGameSave({
        ...save,
        systemOrbit: {
          stars: [{ id: 'A', orbitAngle: null, systemX: Number.POSITIVE_INFINITY, systemY: 0 }],
          starbase: null,
        },
      })
    ).toThrow('stellar orbit systemX');
    expect(() =>
      parseGameSave({
        ...save,
        location: { kind: 'hyperspace', worldX: 3, worldY: -2 },
      })
    ).toThrow('system slot');
    expect(() =>
      parseGameSave({
        ...save,
        location: {
          kind: 'starbase',
          worldX: 3,
          worldY: -2,
          systemSlot: 0,
          starbaseName: 'Repeated Name',
        },
      })
    ).toThrow('station id');
  });

  it('restores player and mission data through explicit Game APIs', () => {
    const save = createSave();
    const player = {
      position: {},
      render: {},
      resources: {},
      cargoHold: {},
      terrainVehicle: {},
      crew: [],
      ship: {},
    };
    const game = Object.assign(Object.create(Game.prototype), {
      gameSeedPRNG: { getInitialSeed: () => 'save-test' },
      stateManager: {
        restoreLocation: vi.fn(() => null),
      },
      player,
      planetMutationRegistry: new Map(),
      _missionProgress: new MissionProgressService(),
      _scanService: new ScanService(),
      tutorialHintsShown: new Set(),
      statusMessage: '',
      forceFullRender: false,
      lastMainRenderSignature: 'old',
      _publishStatusUpdate: vi.fn(),
    }) as any;

    game.restoreSaveGame(save);

    expect(player.resources).toEqual(save.player.resources);
    expect(game.gameClockElapsedSeconds).toBe(42);
    expect(game.tutorialHintsShown).toEqual(new Set(['hyperspace']));
    expect(game.forceFullRender).toBe(true);

    game.restoreSaveGame({
      ...save,
      migratedFromGenerationVersion: 1,
      location: { kind: 'system', worldX: 3, worldY: -2, systemSlot: 0 },
    });
    expect(game.stateManager.restoreLocation).toHaveBeenLastCalledWith({
      kind: 'hyperspace',
      worldX: 3,
      worldY: -2,
      systemSlot: 0,
    });
    expect(game.statusMessage).toContain('placed the vessel safely in hyperspace');
  });
});
