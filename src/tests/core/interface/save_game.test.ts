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
    version: 5,
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

    expect(migrated.version).toBe(5);
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

    expect(migrated.version).toBe(5);
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

    expect(migrated.version).toBe(5);
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
      worldX: 3,
      worldY: -2,
      bodyPath: 'planet:0/moon:1',
      orbitReferencePath: 'planet:0',
    });
  });

  it('rejects impossible typed locations and malformed nested state', () => {
    const save = createSave();

    expect(() =>
      parseGameSave({
        ...save,
        location: { kind: 'orbit', worldX: 3, worldY: -2 },
      })
    ).toThrow('body path');
    expect(() =>
      parseGameSave({
        ...save,
        location: {
          kind: 'hyperspace',
          worldX: 3,
          worldY: -2,
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
  });
});
