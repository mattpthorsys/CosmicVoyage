import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import {
  GameSave,
  MANUAL_SAVE_KEY,
  parseGameSave,
  SaveGameStorage,
  SESSION_SAVE_KEY,
} from '../../../core/save_game';

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
    version: 1,
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
        specialBaysOccupied: 0,
        damage: { hullIntegrity: 100, maxHullIntegrity: 100, subsystemDamage: {} },
      },
    },
    location: {
      state: 'hyperspace',
      worldX: 3,
      worldY: -2,
      bodyPath: null,
      orbitReferencePath: null,
      atStarbase: false,
    },
    systemOrbit: null,
    planetMutations: [],
    acceptedMissionIds: [],
    completedMissionIds: [],
    activeMissions: {},
    tutorialHintsShown: ['hyperspace'],
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
      acceptedMissionIds: new Set(),
      completedMissionIds: new Set(),
      activeMissions: {},
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
