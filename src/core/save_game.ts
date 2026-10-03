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
import { createDiscoveryRecord, DiscoveryRecord, isDiscoveryRecord, DISCOVERY_LEVELS } from './discovery';
import type { EconomySnapshot } from './starbase_commerce';
import { CONFIG } from '../config';
import { createXenobiologySnapshot, type XenobiologySnapshot } from '../entities/biology/biology_types';
import { validateSpecimen, validateXenobiology } from '../entities/biology/biology_validation';

export const SAVE_GAME_VERSION = 13;
export const SESSION_SAVE_KEY = 'cosmic-voyage.session.v13';
export const MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v13';
const VERSION_TWELVE_SESSION_SAVE_KEY = 'cosmic-voyage.session.v12';
const VERSION_TWELVE_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v12';
const VERSION_ELEVEN_SESSION_SAVE_KEY = 'cosmic-voyage.session.v11';
const VERSION_ELEVEN_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v11';
const VERSION_TEN_SESSION_SAVE_KEY = 'cosmic-voyage.session.v10';
const VERSION_TEN_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v10';
const VERSION_NINE_SESSION_SAVE_KEY = 'cosmic-voyage.session.v9';
const VERSION_NINE_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v9';
const LEGACY_SESSION_SAVE_KEY = 'cosmic-voyage.session.v1';
const LEGACY_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v1';
const PREVIOUS_SESSION_SAVE_KEY = 'cosmic-voyage.session.v2';
const PREVIOUS_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v2';
const VERSION_THREE_SESSION_SAVE_KEY = 'cosmic-voyage.session.v3';
const VERSION_THREE_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v3';
const VERSION_FOUR_SESSION_SAVE_KEY = 'cosmic-voyage.session.v4';
const VERSION_FOUR_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v4';
const VERSION_FIVE_SESSION_SAVE_KEY = 'cosmic-voyage.session.v5';
const VERSION_FIVE_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v5';
const VERSION_SIX_SESSION_SAVE_KEY = 'cosmic-voyage.session.v6';
const VERSION_SIX_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v6';
const VERSION_SEVEN_SESSION_SAVE_KEY = 'cosmic-voyage.session.v7';
const VERSION_SEVEN_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v7';
const VERSION_EIGHT_SESSION_SAVE_KEY = 'cosmic-voyage.session.v8';
const VERSION_EIGHT_MANUAL_SAVE_KEY = 'cosmic-voyage.manual.v8';

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
  systemSlot: number;
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
  systemSlot: number;
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
      stationId: string;
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

export interface GameSaveV6 extends Omit<GameSaveV5, 'version'> {
  version: 6;
  generationVersion: number;
  migratedFromGenerationVersion?: number;
}

export interface GameSaveV7 extends Omit<GameSaveV6, 'version'> {
  version: 7;
}

export interface GameSaveV8 extends Omit<GameSaveV7, 'version'> {
  version: 8;
}

export interface GameSaveV9 extends Omit<GameSaveV8, 'version'> {
  version: 9;
}

export interface GameSaveV10 extends Omit<GameSaveV9, 'version'> {
  version: 10;
}

export interface GameSaveV11 extends Omit<GameSaveV10, 'version'> {
  version: 11;
  xenobiology: XenobiologySnapshot;
}

export interface GameSaveV12 extends Omit<GameSaveV11, 'version'> {
  version: 12;
}

export interface GameSaveV13 extends Omit<GameSaveV12, 'version'> {
  version: 13;
}

export type GameSave = GameSaveV13;

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
  const record = candidate as Partial<
    | GameSaveV1
    | GameSaveV2
    | GameSaveV3
    | GameSaveV4
    | GameSaveV5
    | GameSaveV6
    | GameSaveV7
    | GameSaveV8
    | GameSaveV9
    | GameSaveV10
    | GameSaveV11
    | GameSaveV12
    | GameSaveV13
  >;
  if (
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== 4 &&
    record.version !== 5 &&
    record.version !== 6 &&
    record.version !== 7 &&
    record.version !== 8 &&
    record.version !== 9 &&
    record.version !== 10 &&
    record.version !== 11 &&
    record.version !== 12 &&
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
  let save: GameSave;
  switch (record.version) {
    case 1:
      save = migrateV1Save(candidate as unknown as GameSaveV1);
      break;
    case 2:
      save = migrateV2Save(candidate as unknown as GameSaveV2);
      break;
    case 3:
      save = migrateV3Save(candidate as unknown as GameSaveV3);
      break;
    case 4:
      save = migrateV4Save(candidate as unknown as GameSaveV4);
      break;
    case 5:
      save = migrateV5Save(candidate as unknown as GameSaveV5);
      break;
    case 6:
      save = migrateV6Save(candidate as unknown as GameSaveV6);
      break;
    case 7:
      save = migrateV7Save(candidate as unknown as GameSaveV7);
      break;
    case 8:
      save = migrateV8Save(candidate as unknown as GameSaveV8);
      break;
    case 9:
      save = migrateV9Save(candidate as unknown as GameSaveV9);
      break;
    case 10:
      save = migrateV10Save(candidate as unknown as GameSaveV10);
      break;
    case 11:
      save = migrateV11Save(candidate as unknown as GameSaveV11);
      break;
    case 12:
      save = { ...(candidate as unknown as GameSaveV12), version: SAVE_GAME_VERSION };
      break;
    default:
      save = candidate as unknown as GameSaveV13;
  }
  // The schema is unchanged, but corrected stellar hierarchies regenerate local world identities.
  if (save.generationVersion === 6) {
    save = {
      ...save,
      generationVersion: CONFIG.GALAXY_MODEL_VERSION,
      migratedFromGenerationVersion: save.migratedFromGenerationVersion ?? 6,
    };
  }
  if (save.generationVersion !== CONFIG.GALAXY_MODEL_VERSION) {
    throw new Error(`Unsupported Galaxy generation version: ${String(save.generationVersion)}.`);
  }
  validateLocation(save.location);
  validatePlayer(save.player);
  validateXenobiology(save.xenobiology, [
    ...(save.player.cargoHold.specimens ?? []),
    ...(save.player.terrainVehicle.cargoHold.specimens ?? []),
  ]);
  if (save.xenobiology.activeSiteId) {
    const field = save.xenobiology.fields[save.xenobiology.activeSiteId];
    const location = save.location;
    if (
      location.kind !== 'planet' ||
      !save.player.terrainVehicle.deployed ||
      save.player.terrainVehicle.onFoot ||
      field.bodyId !==
        `${location.worldX},${location.worldY},${location.systemSlot}/${location.bodyPath}/bio1`
    )
      throw new Error('Active encounter does not match saved location.');
  }
  validateSystemOrbit(save.systemOrbit);
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

/** Validates mutable stellar and station orbit snapshots before restoration. */
function validateSystemOrbit(systemOrbit: unknown): asserts systemOrbit is SystemOrbitSaveData | null {
  if (systemOrbit === null) return;
  if (!isRecord(systemOrbit) || !Array.isArray(systemOrbit.stars)) {
    throw new Error('Save system orbit state is invalid.');
  }
  for (const star of systemOrbit.stars) {
    if (!isRecord(star)) throw new Error('Save stellar orbit state is invalid.');
    assertNonEmptyString(star.id, 'stellar orbit id');
    if (star.orbitAngle !== null) assertFiniteNumber(star.orbitAngle, 'stellar orbit angle');
    assertFiniteNumber(star.systemX, 'stellar orbit systemX');
    assertFiniteNumber(star.systemY, 'stellar orbit systemY');
  }
  if (systemOrbit.starbase === null) return;
  if (!isRecord(systemOrbit.starbase)) throw new Error('Save station orbit state is invalid.');
  assertFiniteNumber(systemOrbit.starbase.orbitAngle, 'station orbit angle');
  assertFiniteNumber(systemOrbit.starbase.systemX, 'station orbit systemX');
  assertFiniteNumber(systemOrbit.starbase.systemY, 'station orbit systemY');
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
  return migrateV5Save({
    ...save,
    version: 5,
    location: migrateLegacyLocation(save.location),
  });
}

/** Adds explicit Galaxy generation and system-slot identity to version-five saves. */
function migrateV5Save(save: GameSaveV5): GameSave {
  const location: LocationSaveData =
    save.location.kind === 'starbase'
      ? {
          ...save.location,
          systemSlot: save.location.systemSlot ?? 0,
          stationId: 'legacy-current-starbase',
        }
      : { ...save.location, systemSlot: save.location.systemSlot ?? 0 };
  return migrateV6Save({
    ...save,
    version: 6,
    generationVersion: 2,
    migratedFromGenerationVersion: 1,
    location,
    planetMutations: save.planetMutations.map((mutation) => ({
      ...mutation,
      systemSlot: mutation.systemSlot ?? 0,
    })),
  });
}

/** Rotates and rescales generation-two coordinates onto the one-light-year Galactic grid. */
function migrateV6Save(save: GameSaveV6): GameSave {
  if (save.generationVersion !== 2) {
    throw new Error(`Unsupported Galaxy generation version: ${String(save.generationVersion)}.`);
  }
  const playerCoordinates = migrateGenerationTwoCoordinates(
    save.player.position.worldX,
    save.player.position.worldY
  );
  return migrateV7Save({
    ...save,
    version: 7,
    generationVersion: 3,
    migratedFromGenerationVersion: save.migratedFromGenerationVersion ?? save.generationVersion,
    player: {
      ...save.player,
      position: {
        ...save.player.position,
        ...playerCoordinates,
        lastWorldMoveDx: save.player.position.lastWorldMoveDy,
        lastWorldMoveDy: -save.player.position.lastWorldMoveDx,
      },
    },
    location: migrateGenerationTwoLocation(save.location),
    planetMutations: save.planetMutations.map((mutation) => ({
      ...mutation,
      ...migrateGenerationTwoCoordinates(mutation.worldX, mutation.worldY),
    })),
  });
}

/** Advances generation-three saves after deterministic settlement identities changed. */
function migrateV7Save(save: GameSaveV7): GameSave {
  if (save.generationVersion !== 3) {
    throw new Error(`Unsupported Galaxy generation version: ${String(save.generationVersion)}.`);
  }
  return migrateV8Save({
    ...save,
    version: 8,
    generationVersion: 4,
    migratedFromGenerationVersion: save.migratedFromGenerationVersion ?? save.generationVersion,
  });
}

/** Advances generation-four saves after the bounded spiral-arm reconstruction. */
function migrateV8Save(save: GameSaveV8): GameSave {
  if (save.generationVersion !== 4) {
    throw new Error(`Unsupported Galaxy generation version: ${String(save.generationVersion)}.`);
  }
  return migrateV9Save({
    ...save,
    version: 9,
    generationVersion: 5,
    migratedFromGenerationVersion: save.migratedFromGenerationVersion ?? save.generationVersion,
  });
}

/** Retires generation-five identities after the disk density and coordinate noise correction. */
function migrateV9Save(save: GameSaveV9): GameSave {
  if (save.generationVersion !== 5) {
    throw new Error(`Unsupported Galaxy generation version: ${String(save.generationVersion)}.`);
  }
  return migrateV10Save({
    ...save,
    version: 10,
    generationVersion: CONFIG.GALAXY_MODEL_VERSION,
    migratedFromGenerationVersion: save.migratedFromGenerationVersion ?? save.generationVersion,
  });
}

/** Adds empty biological progression without changing current-generation world identities. */
function migrateV10Save(save: GameSaveV10): GameSave {
  return {
    ...save,
    version: SAVE_GAME_VERSION,
    xenobiology: createXenobiologySnapshot(),
    player: {
      ...save.player,
      cargoHold: { ...save.player.cargoHold, specimens: [] },
      terrainVehicle: {
        ...save.player.terrainVehicle,
        integrity: 100,
        cargoHold: { ...save.player.terrainVehicle.cargoHold, specimens: [] },
      },
      ship: { ...save.player.ship, stasisClass: 1 },
    },
  };
}

/** Retains existing specimens and frozen legacy fields while admitting typed biological objectives. */
function migrateV11Save(save: GameSaveV11): GameSave {
  return { ...save, version: SAVE_GAME_VERSION };
}

/** Migrates a typed local location while retaining only its mode-specific fields. */
function migrateGenerationTwoLocation(location: LocationSaveData): LocationSaveData {
  return {
    ...location,
    ...migrateGenerationTwoCoordinates(location.worldX, location.worldY),
  } as LocationSaveData;
}

/** Converts old coreward-X/rotation-Y parsec cells into east-X/south-Y one-light-year cells. */
function migrateGenerationTwoCoordinates(
  oldWorldX: number,
  oldWorldY: number
): { worldX: number; worldY: number } {
  const scale = CONFIG.REFERENCE_HYPERSPACE_CELL_LIGHT_YEARS / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
  return {
    worldX: Math.round(oldWorldY * scale),
    worldY: Math.round(-oldWorldX * scale),
  };
}

/** Converts a legacy location record while rejecting contradictory required fields. */
function migrateLegacyLocation(location: LegacyLocationSaveData): LocationSaveData {
  const base = { worldX: location.worldX, worldY: location.worldY, systemSlot: 0 };
  if (location.state === 'hyperspace' || location.state === 'system') {
    return { ...base, kind: location.state };
  }
  if (location.state === 'starbase') {
    return {
      ...base,
      kind: 'starbase',
      stationId: 'legacy-current-starbase',
      starbaseName: 'legacy-current-starbase',
    };
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
  assertSystemSlot(location.systemSlot, 'location system slot');
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
    if ('stationId' in location || 'starbaseName' in location) {
      throw new Error('Save planetary location contains incompatible starbase data.');
    }
  }
  if (location.kind === 'starbase') {
    assertNonEmptyString(location.stationId, 'station id');
    assertNonEmptyString(location.starbaseName, 'starbase name');
    if ('bodyPath' in location || 'orbitReferencePath' in location) {
      throw new Error('Save starbase location contains incompatible planetary data.');
    }
  }
  if (
    (location.kind === 'hyperspace' || location.kind === 'system') &&
    ('bodyPath' in location ||
      'orbitReferencePath' in location ||
      'stationId' in location ||
      'starbaseName' in location)
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
  if (!Number.isInteger(ship.stasisClass) || (ship.stasisClass ?? -1) < 0 || (ship.stasisClass ?? 3) > 2)
    throw new Error('Save stasis class is invalid.');
  if (
    !Number.isFinite(player.terrainVehicle.integrity) ||
    (player.terrainVehicle.integrity ?? -1) < 0 ||
    (player.terrainVehicle.integrity ?? 101) > 100
  )
    throw new Error('Save rover integrity is invalid.');
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
  if (!Array.isArray(cargo.specimens)) throw new Error('Save specimen manifest is invalid.');
  cargo.specimens.forEach(validateSpecimen);
  const volume =
    Object.values(cargo.items).reduce((sum, amount) => sum + amount, 0) +
    cargo.specimens.reduce((sum, item) => sum + item.volumeM3, 0);
  if (volume > cargo.capacity + 1e-6) throw new Error('Save cargo is over capacity.');
}

/** Validates mission progress references and completed objective arrays. */
function validateMissionProgress(save: GameSave): void {
  for (const mission of Object.values(save.activeMissions)) {
    assertNonEmptyString(mission.id, 'mission id');
    if (mission.originStarbaseId !== undefined) {
      assertNonEmptyString(mission.originStarbaseId, 'mission origin station id');
    }
    assertNonEmptyString(mission.originStarbaseName, 'mission origin starbase');
    if (mission.systemAddress !== undefined) {
      if (!isRecord(mission.systemAddress)) throw new Error('Invalid mission system address.');
      assertFiniteNumber(mission.systemAddress.worldX, 'mission world X');
      assertFiniteNumber(mission.systemAddress.worldY, 'mission world Y');
      assertSystemSlot(mission.systemAddress.systemSlot, 'mission system slot');
    }
    assertFiniteNumber(mission.rewardCredits, 'mission reward');
    if (!Number.isSafeInteger(mission.rewardCredits) || mission.rewardCredits < 0)
      throw new Error('Invalid mission reward.');
    if (!Array.isArray(mission.objectives) || mission.objectives.length === 0) {
      throw new Error('Save mission objectives are invalid.');
    }
    for (const objective of mission.objectives) {
      assertNonEmptyString(objective.id, 'mission objective id');
      assertNonEmptyString(objective.targetName, 'mission objective target');
      assertNonEmptyString(objective.targetLabel, 'mission objective label');
      if (objective.location !== undefined) {
        if (!isRecord(objective.location) || !mission.systemAddress)
          throw new Error('Invalid mission destination.');
        assertBodyPath(objective.location.bodyPath, 'mission body path');
        assertNonEmptyString(objective.location.bodyName, 'mission body name');
        const surface = objective.location.surface;
        if (surface !== undefined) {
          if (!isRecord(surface)) throw new Error('Invalid mission landing site.');
          assertFiniteNumber(surface.x, 'mission surface X');
          assertFiniteNumber(surface.y, 'mission surface Y');
          if (
            !Number.isSafeInteger(surface.x) ||
            !Number.isSafeInteger(surface.y) ||
            surface.x < 0 ||
            surface.y < 0 ||
            surface.x > CONFIG.PLANET_MAP_BASE_SIZE ||
            surface.y > CONFIG.PLANET_MAP_BASE_SIZE
          )
            throw new Error('Invalid mission landing coordinates.');
          assertNonEmptyString(surface.siteId, 'mission landing habitat id');
          assertNonEmptyString(surface.label, 'mission landing habitat label');
          if (objective.kind !== 'scan' && surface.siteId !== objective.siteId)
            throw new Error('Mission landing habitat does not match its biological objective.');
        }
      }
      if (objective.kind === 'scan') {
        if (
          !['planet', 'star', 'system'].includes(objective.targetType) ||
          !DISCOVERY_LEVELS.includes(objective.requiredDiscoveryLevel)
        )
          throw new Error('Invalid scan mission objective.');
      } else if (objective.kind === 'specimen') {
        assertNonEmptyString(objective.speciesId, 'mission species id');
        assertNonEmptyString(objective.siteId, 'mission habitat id');
        assertFiniteNumber(objective.minimumQuality, 'mission specimen quality');
        if (
          !['live', 'tissue'].includes(objective.requiredKind) ||
          objective.minimumQuality < 0 ||
          objective.minimumQuality > 1
        )
          throw new Error('Invalid specimen mission objective.');
      } else if (objective.kind === 'biology-data') {
        assertNonEmptyString(objective.speciesId, 'mission species id');
        assertNonEmptyString(objective.siteId, 'mission habitat id');
        if (objective.requiredEvidenceLevel !== 3)
          throw new Error('Invalid biological evidence requirement.');
      } else throw new Error('Unsupported mission objective kind.');
    }
    if (new Set(mission.objectives.map((objective) => objective.id)).size !== mission.objectives.length)
      throw new Error('Duplicate mission objective identity.');
    if (
      mission.objectives.some((objective) => objective.kind !== 'scan') &&
      (mission.type !== 'xenobiology' || mission.objectives.length !== 1 || !mission.originStarbaseId)
    )
      throw new Error('Invalid biological delivery contract.');
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
    assertSystemSlot(mutation.systemSlot, 'planet mutation system slot');
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

/** Validates one non-negative resolved-system slot against the generation model limit. */
function assertSystemSlot(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= CONFIG.GALACTIC_MAX_RESOLVED_SYSTEMS_PER_CELL
  ) {
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
      VERSION_TWELVE_SESSION_SAVE_KEY,
      VERSION_ELEVEN_SESSION_SAVE_KEY,
      VERSION_TEN_SESSION_SAVE_KEY,
      VERSION_NINE_SESSION_SAVE_KEY,
      VERSION_EIGHT_SESSION_SAVE_KEY,
      VERSION_SEVEN_SESSION_SAVE_KEY,
      VERSION_SIX_SESSION_SAVE_KEY,
      VERSION_FIVE_SESSION_SAVE_KEY,
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
    this.sessionStore.removeItem(VERSION_TWELVE_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_ELEVEN_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_TEN_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_NINE_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(PREVIOUS_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_THREE_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_FOUR_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_FIVE_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_SIX_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_SEVEN_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(VERSION_EIGHT_SESSION_SAVE_KEY);
    this.sessionStore.removeItem(LEGACY_SESSION_SAVE_KEY);
  }

  /** Reads the explicit persistent browser save. */
  loadManual(): GameSave | null {
    return this.readCurrentOrLegacy(
      this.persistentStore,
      MANUAL_SAVE_KEY,
      VERSION_TWELVE_MANUAL_SAVE_KEY,
      VERSION_ELEVEN_MANUAL_SAVE_KEY,
      VERSION_TEN_MANUAL_SAVE_KEY,
      VERSION_NINE_MANUAL_SAVE_KEY,
      VERSION_EIGHT_MANUAL_SAVE_KEY,
      VERSION_SEVEN_MANUAL_SAVE_KEY,
      VERSION_SIX_MANUAL_SAVE_KEY,
      VERSION_FIVE_MANUAL_SAVE_KEY,
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
    this.persistentStore.removeItem(VERSION_TWELVE_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_ELEVEN_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_TEN_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_NINE_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(PREVIOUS_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_THREE_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_FOUR_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_FIVE_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_SIX_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_SEVEN_MANUAL_SAVE_KEY);
    this.persistentStore.removeItem(VERSION_EIGHT_MANUAL_SAVE_KEY);
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
