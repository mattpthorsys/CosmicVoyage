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

export const SAVE_GAME_VERSION = 5;
export const SESSION_SAVE_KEY = 'cosmic-voyage.session.v5';
export const MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v5';
const LEGACY_SESSION_SAVE_KEY = 'cosmic-voyage.session.v1';
const LEGACY_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v1';
const PREVIOUS_SESSION_SAVE_KEY = 'cosmic-voyage.session.v2';
const PREVIOUS_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v2';
const VERSION_THREE_SESSION_SAVE_KEY = 'cosmic-voyage.session.v3';
const VERSION_THREE_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v3';
const VERSION_FOUR_SESSION_SAVE_KEY = 'cosmic-voyage.session.v4';
const VERSION_FOUR_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v4';

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

export interface LegacyLocationSaveData {
  state: GameState;
  worldX: number;
  worldY: number;
  bodyPath: string | null;
  orbitReferencePath: string | null;
  atStarbase: boolean;
}

interface BaseLocationSaveData {
  worldX: number;
  worldY: number;
}

export type LocationSaveData =
  | (BaseLocationSaveData & { kind: 'hyperspace' })
  | (BaseLocationSaveData & { kind: 'system' })
  | (BaseLocationSaveData & {
      kind: 'orbit';
      bodyPath: string;
      orbitReferencePath: string;
    })
  | (BaseLocationSaveData & {
      kind: 'planet';
      bodyPath: string;
      orbitReferencePath: string;
    })
  | (BaseLocationSaveData & {
      kind: 'starbase';
      starbaseName: string;
    });

export interface GameSaveV1 {
  version: 1;
  savedAt: string;
  seed: string;
  gameClockElapsedSeconds: number;
  player: PlayerSaveData;
  location: LegacyLocationSaveData;
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

export interface GameSaveV5 extends Omit<GameSaveV4, 'version' | 'location'> {
  version: 5;
  location: LocationSaveData;
}

export type GameSave = GameSaveV5;

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
  const record = candidate as Partial<GameSaveV1 | GameSaveV2 | GameSaveV3 | GameSaveV4 | GameSaveV5>;
  if (
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== 4 &&
    record.version !== SAVE_GAME_VERSION
  ) {
    throw new Error(`Unsupported save version: ${String(record.version)}.`);
  }
  if (typeof record.seed !== 'string' || record.seed.length === 0) throw new Error('Save seed is missing.');
  if (!isRecord(record.player) || !isRecord(record.location)) {
    throw new Error('Save player or location data is missing.');
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
  if (record.version === 4) return migrateV4Save(candidate as unknown as GameSaveV4);
  const save = candidate as unknown as GameSaveV5;
  validateLocation(save.location);
  validatePlayer(save.player);
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
  validateStringArray(save.acceptedMissionIds, 'accepted mission ids');
  validateStringArray(save.readyMissionIds, 'ready mission ids');
  validateStringArray(save.completedMissionIds, 'completed mission ids');
  validateStringArray(save.tutorialHintsShown, 'tutorial hints');
  validateMissionProgress(save);
  validatePlanetMutations(save.planetMutations);
  validateEconomy(save.economy);
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
  return migrateV4Save({
    ...save,
    version: 4,
    player: {
      ...save.player,
      ship: {
        ...save.player.ship,
        surveyEquipmentClass: save.player.ship.surveyEquipmentClass ?? 1,
        specialBaysOccupied: Math.max(1, save.player.ship.specialBaysOccupied ?? 0),
      },
    },
    economy: {},
  });
}

/** Converts independent legacy location fields into a mode-specific location record. */
function migrateV4Save(save: GameSaveV4): GameSave {
  return {
    ...save,
    version: SAVE_GAME_VERSION,
    location: migrateLegacyLocation(save.location),
  };
}

/** Converts a legacy location record while rejecting contradictory required fields. */
function migrateLegacyLocation(location: LegacyLocationSaveData): LocationSaveData {
  const base = { worldX: location.worldX, worldY: location.worldY };
  if (location.state === 'hyperspace' || location.state === 'system') {
    return { ...base, kind: location.state };
  }
  if (location.state === 'starbase') {
    return { ...base, kind: 'starbase', starbaseName: 'legacy-current-starbase' };
  }
  if (!location.bodyPath) {
    throw new Error(`Legacy ${location.state} save is missing its planetary body path.`);
  }
  return {
    ...base,
    kind: location.state,
    bodyPath: location.bodyPath,
    orbitReferencePath: location.orbitReferencePath ?? location.bodyPath,
  };
}

/** Validates the discriminated location record and its mode-specific fields. */
function validateLocation(location: unknown): asserts location is LocationSaveData {
  if (!isRecord(location)) throw new Error('Save location data is invalid.');
  assertFiniteNumber(location.worldX, 'location worldX');
  assertFiniteNumber(location.worldY, 'location worldY');
  if (
    location.kind !== 'hyperspace' &&
    location.kind !== 'system' &&
    location.kind !== 'orbit' &&
    location.kind !== 'planet' &&
    location.kind !== 'starbase'
  ) {
    throw new Error('Save location kind is invalid.');
  }
  if (location.kind === 'orbit' || location.kind === 'planet') {
    assertBodyPath(location.bodyPath, 'location body path');
    assertBodyPath(location.orbitReferencePath, 'orbit reference path');
    if ('starbaseName' in location) {
      throw new Error('Save planetary location contains incompatible starbase data.');
    }
  }
  if (location.kind === 'starbase') {
    assertNonEmptyString(location.starbaseName, 'starbase name');
    if ('bodyPath' in location || 'orbitReferencePath' in location) {
      throw new Error('Save starbase location contains incompatible planetary data.');
    }
  }
  if (
    (location.kind === 'hyperspace' || location.kind === 'system') &&
    ('bodyPath' in location || 'orbitReferencePath' in location || 'starbaseName' in location)
  ) {
    throw new Error(`Save ${location.kind} location contains incompatible local-object data.`);
  }
}

/** Validates nested player components that are required for safe restoration. */
function validatePlayer(player: PlayerSaveData): void {
  const position = player.position as unknown as Record<string, unknown>;
  for (const field of [
    'worldX',
    'worldY',
    'lastWorldMoveDx',
    'lastWorldMoveDy',
    'systemX',
    'systemY',
    'surfaceX',
    'surfaceY',
  ]) {
    assertFiniteNumber(position[field], `player position ${field}`);
  }
  assertNonEmptyString(player.render.char, 'player glyph');
  assertFiniteNumber(player.resources.credits, 'player credits');
  assertFiniteNumber(player.resources.fuel, 'player fuel');
  assertFiniteNumber(player.resources.maxFuel, 'player maximum fuel');
  if (player.resources.fuel < 0 || player.resources.maxFuel <= 0) {
    throw new Error('Save player fuel values are invalid.');
  }
  validateCargo(player.cargoHold, 'ship cargo');
  validateCargo(player.terrainVehicle.cargoHold, 'terrain vehicle cargo');
  if (!Array.isArray(player.crew)) throw new Error('Save crew data is invalid.');
  for (const member of player.crew) {
    assertNonEmptyString(member.id, 'crew id');
    assertNonEmptyString(member.name, 'crew name');
    assertFiniteNumber(member.hitPoints, 'crew hit points');
    assertFiniteNumber(member.maxHitPoints, 'crew maximum hit points');
    if (!isRecord(member.skills) || !isRecord(member.skillCaps)) {
      throw new Error('Save crew skill data is invalid.');
    }
  }
  const ship = player.ship;
  assertFiniteNumber(ship.engineClass, 'ship engine class');
  assertFiniteNumber(ship.surveyEquipmentClass, 'ship survey equipment class');
  assertFiniteNumber(ship.damage.hullIntegrity, 'ship hull integrity');
  assertFiniteNumber(ship.damage.maxHullIntegrity, 'ship maximum hull integrity');
}

/** Validates cargo capacity and all stored item quantities. */
function validateCargo(cargo: CargoComponent, label: string): void {
  assertFiniteNumber(cargo.capacity, `${label} capacity`);
  if (cargo.capacity < 0 || !isRecord(cargo.items)) throw new Error(`Save ${label} is invalid.`);
  for (const amount of Object.values(cargo.items)) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Save ${label} quantity is invalid.`);
  }
}

/** Validates mission progress references and completed objective arrays. */
function validateMissionProgress(save: GameSave): void {
  for (const mission of Object.values(save.activeMissions)) {
    assertNonEmptyString(mission.id, 'mission id');
    assertNonEmptyString(mission.originStarbaseName, 'mission origin starbase');
    if (!Array.isArray(mission.objectives) || mission.objectives.length === 0) {
      throw new Error('Save mission objectives are invalid.');
    }
    for (const objective of mission.objectives) {
      assertNonEmptyString(objective.id, 'mission objective id');
      assertNonEmptyString(objective.targetName, 'mission objective target');
    }
  }
  for (const [missionId, objectiveIds] of Object.entries(save.missionObjectiveProgress)) {
    if (!save.activeMissions[missionId] || !Array.isArray(objectiveIds)) {
      throw new Error('Save mission objective progress is inconsistent.');
    }
    validateStringArray(objectiveIds, `mission ${missionId} objective ids`);
    const validObjectives = new Set(
      save.activeMissions[missionId].objectives.map((objective) => objective.id)
    );
    if (objectiveIds.some((objectiveId) => !validObjectives.has(objectiveId))) {
      throw new Error('Save mission objective progress references an unknown objective.');
    }
  }
  if (save.readyMissionIds.some((missionId) => !save.activeMissions[missionId])) {
    throw new Error('Save ready mission state is inconsistent.');
  }
}

/** Validates every persistent planetary mutation. */
function validatePlanetMutations(mutations: PlanetMutationSaveData[]): void {
  for (const mutation of mutations) {
    assertFiniteNumber(mutation.worldX, 'planet mutation worldX');
    assertFiniteNumber(mutation.worldY, 'planet mutation worldY');
    assertBodyPath(mutation.bodyPath, 'planet mutation body path');
    assertFiniteNumber(mutation.orbitAngle, 'planet mutation orbit angle');
    assertFiniteNumber(mutation.systemX, 'planet mutation systemX');
    assertFiniteNumber(mutation.systemY, 'planet mutation systemY');
    if (!isDiscoveryRecord(mutation.discovery)) {
      throw new Error('Save planet discovery record is invalid.');
    }
    validateStringArray(mutation.minedLocations, 'mined locations');
    if (!isRecord(mutation.minedLocationAmounts)) {
      throw new Error('Save mined location amounts are invalid.');
    }
    for (const amount of Object.values(mutation.minedLocationAmounts)) {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new Error('Save mined location amount is invalid.');
      }
    }
  }
}

/** Validates persistent station stock and price records. */
function validateEconomy(economy: EconomySnapshot): void {
  for (const [stationName, station] of Object.entries(economy)) {
    assertNonEmptyString(stationName, 'economy station name');
    if (!isRecord(station) || !isRecord(station.items)) {
      throw new Error('Save station economy state is invalid.');
    }
    for (const item of Object.values(station.items)) {
      if (!isRecord(item)) throw new Error('Save station economy item is invalid.');
      assertNonEmptyString(item.itemKey, 'economy item key');
      assertFiniteNumber(item.units, 'economy item stock');
      assertFiniteNumber(item.buyPrice, 'economy buy price');
      assertFiniteNumber(item.sellPrice, 'economy sell price');
      if (item.units < 0 || item.buyPrice < 1 || item.sellPrice < 1) {
        throw new Error('Save station economy values are invalid.');
      }
    }
  }
}

/** Validates a stable generated planet path. */
function assertBodyPath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^planet:\d+(?:\/moon:\d+)?$/.test(value)) {
    throw new Error(`Save ${label} is invalid.`);
  }
}

/** Validates a finite numeric field. */
function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Save ${label} is invalid.`);
  }
}

/** Validates a non-empty string field. */
function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Save ${label} is invalid.`);
  }
}

/** Validates an array containing only strings. */
function validateStringArray(value: unknown[], label: string): void {
  if (value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Save ${label} is invalid.`);
  }
}

/** Returns whether a value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
      VERSION_FOUR_SESSION_SAVE_KEY,
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
    this.sessionStore.removeItem(VERSION_FOUR_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(LEGACY_SESSION_SAVE_KEY);
  }

  /** Reads the explicit persistent browser save. */
  loadManual(): GameSave | null {
    return this.readCurrentOrLegacy(
      this.persistentStore,
      MANUAL_SAVE_KEY,
      VERSION_FOUR_MANUAL_SAVE_KEY,
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
    this.persistentStore.removeItem(VERSION_FOUR_MANUAL_SAVE_KEY);
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
