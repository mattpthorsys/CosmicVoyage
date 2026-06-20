import type {
  CargoComponent,
  PositionComponent,
  RenderComponent,
  ResourceComponent,
  TerrainVehicleComponent,
} from './components';
import type { CrewMember } from './crew';
import type { GameState } from './game_state_manager';
import type { StarbaseMission } from './mission_board';
import type { ShipModificationState } from './ship_modifications';
import { Planet } from '../entities/planet';
import type { SolarSystem } from '../entities/solar_system';

export const SAVE_GAME_VERSION = 1;
export const SESSION_SAVE_KEY = 'cosmic-voyage.session.v1';
export const MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v1';

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
  scanned: boolean;
  primaryResource: string | null;
  minedLocations: string[];
  minedLocationAmounts: Record<string, number>;
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
  planetMutations: PlanetMutationSaveData[];
  acceptedMissionIds: string[];
  completedMissionIds: string[];
  activeMissions: Record<string, StarbaseMission>;
  tutorialHintsShown: string[];
}

export type GameSave = GameSaveV1;

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
  const record = candidate as Partial<GameSaveV1>;
  if (record.version !== SAVE_GAME_VERSION) {
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
  return candidate as unknown as GameSaveV1;
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
    return this.read(this.sessionStore, SESSION_SAVE_KEY);
  }

  /** Writes the current tab's automatic checkpoint. */
  saveSession(save: GameSave): void {
    this.sessionStore.setItem(SESSION_SAVE_KEY, JSON.stringify(save));
  }

  /** Clears the current tab's automatic checkpoint. */
  clearSession(): void {
    this.sessionStore.removeItem(SESSION_SAVE_KEY);
  }

  /** Reads the explicit persistent browser save. */
  loadManual(): GameSave | null {
    return this.read(this.persistentStore, MANUAL_SAVE_KEY);
  }

  /** Writes the explicit persistent browser save. */
  saveManual(save: GameSave): void {
    this.persistentStore.setItem(MANUAL_SAVE_KEY, JSON.stringify(save));
  }

  /** Clears the explicit persistent browser save. */
  clearManual(): void {
    this.persistentStore.removeItem(MANUAL_SAVE_KEY);
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
}
