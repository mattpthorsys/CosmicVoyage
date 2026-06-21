import type {
  CargoComponent,
  PositionComponent,
  RenderComponent,
  ResourceComponent,
  TerrainVehicleComponent,
} from './components';
import type { CrewMember } from './crew';
import type { GameState } from './game_state_manager';
import type { ScanMissionObjective, StarbaseMission } from './mission_board';
import type { ShipModificationState } from './ship_modifications';
import { Planet } from '../entities/planet';
import type { SolarSystem } from '../entities/solar_system';
import { createDiscoveryRecord, DiscoveryRecord, isDiscoveryRecord } from './discovery';
import type { EconomySnapshot } from './starbase_commerce';

export const SAVE_GAME_VERSION = 4;
export const SESSION_SAVE_KEY = 'cosmic-voyage.session.v4';
export const MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v4';
const LEGACY_SESSION_SAVE_KEY = 'cosmic-voyage.session.v1';
const LEGACY_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v1';
const PREVIOUS_SESSION_SAVE_KEY = 'cosmic-voyage.session.v2';
const PREVIOUS_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v2';
const VERSION_THREE_SESSION_SAVE_KEY = 'cosmic-voyage.session.v3';
const VERSION_THREE_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v3';

type LegacyScanMissionObjective = Omit<ScanMissionObjective, 'id'>;
type LegacyStarbaseMission = Omit<StarbaseMission, 'objectives'> & {
  objective?: LegacyScanMissionObjective;
  objectives?: ScanMissionObjective[];
};

export interface PlayerSaveData {
  position: PositionComponent;
  render: RenderComponent;
  resources: ResourceComponent;
  cargoHold: CargoComponent;
  terrainVehicle: TerrainVehicleComponent;
  crew: CrewMember[];
  ship: ShipModificationState;
}

export interface PlanetMutationSaveData {
  worldX: number;
  worldY: number;
  bodyPath: string;
  orbitAngle: number;
  systemX: number;
  systemY: number;
  discovery: DiscoveryRecord;
  primaryResource: string | null;
  minedLocations: string[];
  minedLocationAmounts: Record<string, number>;
}

export interface PlanetMutationSaveDataV1 extends Omit<PlanetMutationSaveData, 'discovery'> {
  scanned: boolean;
}

export interface SystemOrbitSaveData {
  stars: Array<{ id: string; orbitAngle: number | null; systemX: number; systemY: number }>;
  starbase: { orbitAngle: number; systemX: number; systemY: number } | null;
}

export interface LocationSaveData {
  state: GameState;
  worldX: number;
  worldY: number;
  bodyPath: string | null;
  orbitReferencePath: string | null;
  atStarbase: boolean;
}

export interface GameSaveV1 {
  version: 1;
  savedAt: string;
  seed: string;
  gameClockElapsedSeconds: number;
  player: PlayerSaveData;
  location: LocationSaveData;
  systemOrbit: SystemOrbitSaveData | null;
  planetMutations: PlanetMutationSaveDataV1[];
  acceptedMissionIds: string[];
  completedMissionIds: string[];
  activeMissions: Record<string, LegacyStarbaseMission>;
  tutorialHintsShown: string[];
}

export interface GameSaveV2 extends Omit<GameSaveV1, 'version' | 'planetMutations'> {
  version: 2;
  planetMutations: PlanetMutationSaveData[];
  catalogueDiscoveries: Record<string, DiscoveryRecord>;
}

export interface GameSaveV3 extends Omit<GameSaveV2, 'version' | 'activeMissions'> {
  version: 3;
  activeMissions: Record<string, StarbaseMission>;
  readyMissionIds: string[];
  missionObjectiveProgress: Record<string, string[]>;
}

export interface GameSaveV4 extends Omit<GameSaveV3, 'version'> {
  version: 4;
  economy: EconomySnapshot;
}

export type GameSave = GameSaveV4;

/** Returns stable index-based paths for every generated planet and moon in a system. */
export function getSystemPlanetPaths(system: SolarSystem): Array<{ path: string; planet: Planet }> {
  const entries: Array<{ path: string; planet: Planet }> = [];
  system.planets.forEach((planet, planetIndex) => {
    if (!planet) return;
    entries.push({ path: `planet:${planetIndex}`, planet });
    planet.moons.forEach((moon, moonIndex) => {
      entries.push({ path: `planet:${planetIndex}/moon:${moonIndex}`, planet: moon });
    });
  });
  return entries;
}

/** Finds a generated planet or moon using its stable index-based save path. */
export function findSystemPlanetByPath(system: SolarSystem, path: string | null): Planet | null {
  if (!path) return null;
  return getSystemPlanetPaths(system).find((entry) => entry.path === path)?.planet ?? null;
}

/** Returns the stable save path for a generated planet or moon. */
export function findSystemPlanetPath(system: SolarSystem, target: Planet | null): string | null {
  if (!target) return null;
  return getSystemPlanetPaths(system).find((entry) => entry.planet === target)?.path ?? null;
}

/** Parses and validates a supported save-game JSON payload. */
export function parseGameSave(value: string | unknown): GameSave {
  const candidate = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isRecord(candidate)) throw new Error('Save data is not an object.');
  const record = candidate as Partial<GameSaveV1 | GameSaveV2 | GameSaveV3 | GameSaveV4>;
  if (
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== SAVE_GAME_VERSION
  ) {
    throw new Error(`Unsupported save version: ${String(record.version)}.`);
  }
  if (typeof record.seed !== 'string' || record.seed.length === 0) throw new Error('Save seed is missing.');
  if (!isRecord(record.player) || !isRecord(record.location)) {
    throw new Error('Save player or location data is missing.');
  }
  if (!isGameState(record.location.state)) throw new Error('Save location state is invalid.');
  if (!Number.isFinite(record.location.worldX) || !Number.isFinite(record.location.worldY)) {
    throw new Error('Save world coordinates are invalid.');
  }
  if (!Number.isFinite(record.gameClockElapsedSeconds) || typeof record.savedAt !== 'string') {
    throw new Error('Save time data is invalid.');
  }
  if (
    !Array.isArray(record.planetMutations) ||
    !Array.isArray(record.acceptedMissionIds) ||
    !Array.isArray(record.completedMissionIds) ||
    !Array.isArray(record.tutorialHintsShown) ||
    !isRecord(record.activeMissions)
  ) {
    throw new Error('Save progression data is invalid.');
  }
  if (
    !isRecord(record.player.position) ||
    !isRecord(record.player.render) ||
    !isRecord(record.player.resources) ||
    !isRecord(record.player.cargoHold) ||
    !isRecord(record.player.terrainVehicle) ||
    !Array.isArray(record.player.crew) ||
    !isRecord(record.player.ship)
  ) {
    throw new Error('Save player components are invalid.');
  }
  if (record.version === 1) return migrateV1Save(candidate as unknown as GameSaveV1);
  if (record.version === 2) return migrateV2Save(candidate as unknown as GameSaveV2);
  if (record.version === 3) return migrateV3Save(candidate as unknown as GameSaveV3);
  const save = candidate as unknown as GameSaveV4;
  if (!isRecord(save.catalogueDiscoveries)) {
    throw new Error('Save discovery catalogue is invalid.');
  }
  for (const discovery of Object.values(save.catalogueDiscoveries)) {
    if (!isDiscoveryRecord(discovery)) throw new Error('Save discovery record is invalid.');
  }
  for (const mutation of save.planetMutations) {
    if (!isDiscoveryRecord(mutation.discovery)) {
      throw new Error('Save planet discovery record is invalid.');
    }
  }
  if (!Array.isArray(save.readyMissionIds) || !isRecord(save.missionObjectiveProgress)) {
    throw new Error('Save mission objective progress is invalid.');
  }
  if (!isRecord(save.economy)) throw new Error('Save economy state is invalid.');
  return save;
}

/** Migrates binary scan progress from a version-one save into layered discovery state. */
function migrateV1Save(save: GameSaveV1): GameSave {
  return migrateV2Save({
    ...save,
    version: 2,
    planetMutations: save.planetMutations.map(({ scanned, ...mutation }) => ({
      ...mutation,
      discovery: createDiscoveryRecord(
        scanned ? 'surveyed' : 'detected',
        scanned ? 100 : 0,
        scanned ? 1 : 0,
        scanned ? 'orbital-survey' : 'passive'
      ),
    })),
    catalogueDiscoveries: {},
  });
}

/** Migrates single-objective missions into staged contracts awaiting station hand-in. */
function migrateV2Save(save: GameSaveV2): GameSave {
  const activeMissions = Object.fromEntries(
    Object.entries(save.activeMissions).map(([id, mission]) => [
      id,
      {
        ...mission,
        objectives:
          mission.objectives ??
          (mission.objective
            ? [
                {
                  ...mission.objective,
                  id: 'legacy-scan',
                  requiredDiscoveryLevel:
                    mission.objective.requiredDiscoveryLevel ??
                    (mission.objective.targetType === 'star' ? 'observed' : 'surveyed'),
                },
              ]
            : []),
      },
    ])
  ) as Record<string, StarbaseMission>;
  return migrateV3Save({
    ...save,
    version: 3,
    activeMissions,
    readyMissionIds: [],
    missionObjectiveProgress: {},
  });
}

/** Adds persistent economy state and normalizes survey equipment on older ships. */
function migrateV3Save(save: GameSaveV3): GameSave {
  return {
    ...save,
    version: SAVE_GAME_VERSION,
    player: {
      ...save.player,
      ship: {
        ...save.player.ship,
        surveyEquipmentClass: save.player.ship.surveyEquipmentClass ?? 1,
        specialBaysOccupied: Math.max(1, save.player.ship.specialBaysOccupied ?? 0),
      },
    },
    economy: {},
  };
}

/** Returns whether a value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Returns whether a value is a supported gameplay state. */
function isGameState(value: unknown): value is GameState {
  return (
    value === 'hyperspace' ||
    value === 'system' ||
    value === 'orbit' ||
    value === 'planet' ||
    value === 'starbase'
  );
}

/** Provides safe browser storage access for session checkpoints and manual saves. */
export class SaveGameStorage {
  /** Initializes SaveGameStorage. */
  constructor(
    private readonly sessionStore: Storage,
    private readonly persistentStore: Storage
  ) {}

  /** Reads the current tab's automatic checkpoint. */
  loadSession(): GameSave | null {
    return this.readCurrentOrLegacy(
      this.sessionStore,
      SESSION_SAVE_KEY,
      VERSION_THREE_SESSION_SAVE_KEY,
      PREVIOUS_SESSION_SAVE_KEY,
      LEGACY_SESSION_SAVE_KEY
    );
  }

  /** Writes the current tab's automatic checkpoint. */
  saveSession(save: GameSave): void {
    this.sessionStore.setItem(SESSION_SAVE_KEY, JSON.stringify(save));
  }

  /** Clears the current tab's automatic checkpoint. */
  clearSession(): void {
    this.sessionStore.removeItem(SESSION_SAVE_KEY);
    this.sessionStore.removeItem(PREVIOUS_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_THREE_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(LEGACY_SESSION_SAVE_KEY);
  }

  /** Reads the explicit persistent browser save. */
  loadManual(): GameSave | null {
    return this.readCurrentOrLegacy(
      this.persistentStore,
      MANUAL_SAVE_KEY,
      VERSION_THREE_MANUAL_SAVE_KEY,
      PREVIOUS_MANUAL_SAVE_KEY,
      LEGACY_MANUAL_SAVE_KEY
    );
  }

  /** Writes the explicit persistent browser save. */
  saveManual(save: GameSave): void {
    this.persistentStore.setItem(MANUAL_SAVE_KEY, JSON.stringify(save));
  }

  /** Clears the explicit persistent browser save. */
  clearManual(): void {
    this.persistentStore.removeItem(MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(PREVIOUS_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_THREE_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(LEGACY_MANUAL_SAVE_KEY);
  }

  /** Reads and validates one save, removing corrupt data that cannot be loaded. */
  private read(store: Storage, key: string): GameSave | null {
    const raw = store.getItem(key);
    if (!raw) return null;
    try {
      return parseGameSave(raw);
    } catch {
      store.removeItem(key);
      return null;
    }
  }

  /** Loads a current save or migrates and rewrites the previous storage key. */
  private readCurrentOrLegacy(store: Storage, currentKey: string, ...legacyKeys: string[]): GameSave | null {
    const current = this.read(store, currentKey);
    if (current) return current;
    for (const legacyKey of legacyKeys) {
      const legacy = this.read(store, legacyKey);
      if (!legacy) continue;
      store.setItem(currentKey, JSON.stringify(legacy));
      for (const oldKey of legacyKeys) store.removeItem(oldKey);
      return legacy;
    }
    return null;
  }
}
