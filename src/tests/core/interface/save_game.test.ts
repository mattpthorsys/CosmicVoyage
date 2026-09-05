import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import {
  GameSave,
  MANUAL_SAVE_KEY,
  parseGameSave,
  SaveGameStorage,
  SESSION_SAVE_KEY,
} from '../../../core/save_game';
import { MissionProgressService } from '../../../core/mission_progress';
import { ScanService } from '../../../core/scan_service';
import { createDiscoveryRecord } from '../../../core/discovery';

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
    version: 10,
    generationVersion: 6,
    savedAt: '2026-06-20T00:00:00.000Z',
    seed: 'save-test',
    gameClockElapsedSeconds: 42,
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
      cargoHold: { capacity: 100, items: { IRON: 2 } },
      terrainVehicle: {
        deployed: false,
        moving: false,
        available: true,
        onFoot: false,
        shipSurfaceX: 4,
        shipSurfaceY: 5,
        fuel: 120,
        maxFuel: 120,
        cargoHold: { capacity: 50, items: {} },
      },
      crew: [],
      ship: {
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

describe('save game persistence', () => {
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
      version: 10,
      generationVersion: 6,
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
      version: 10,
      generationVersion: 6,
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

    expect(migrated.version).toBe(10);
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

    expect(migrated.version).toBe(10);
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

    expect(migrated.version).toBe(10);
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

    expect(migrated.version).toBe(10);
    expect(migrated.generationVersion).toBe(6);
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

    expect(migrated.version).toBe(10);
    expect(migrated.generationVersion).toBe(6);
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

    expect(migrated.version).toBe(10);
    expect(migrated.generationVersion).toBe(6);
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
      expect(result).toMatchObject({ version: 10, generationVersion: 6, migratedFromGenerationVersion: 5 });
      expect(result?.player).toEqual(oldSave.player);
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
