import { CONFIG } from '../config';
import type { ShipModificationState } from './ship_modifications';
import type { SystemMapProperties, DeepSpacePhenomenonProperties } from '../generation/system_data_generator';

export type BiologicalAssessment =
  | 'unmeasured'
  | 'insufficient'
  | 'no-signal'
  | 'candidate'
  | 'strong'
  | 'catalogued';
export type TechnologyAssessment = 'unmeasured' | 'no-signal' | 'registered' | 'unidentified';

export interface ObservatoryAddress {
  worldX: number;
  worldY: number;
  systemSlot: number;
}

export interface ObservatoryDestination extends ObservatoryAddress {
  name: string;
  kind: 'system' | 'signal';
}

export interface ObservatoryObservation {
  address: ObservatoryAddress;
  quality: number;
  biology: BiologicalAssessment;
  technology: TechnologyAssessment;
  origin: 'native' | 'managed' | 'unknown';
  features: string[];
  bodyName: string | null;
  bodyPath: string | null;
  observedFromX: number;
  observedFromY: number;
  rangeLy: number;
  equipmentClass: number;
  exposure: number;
}

export interface ObservatorySnapshot {
  observations: Record<string, ObservatoryObservation>;
  destination: ObservatoryDestination | null;
}

export interface ObservatoryContact extends ObservatoryDestination {
  id: string;
  distanceLy: number;
  system: SystemMapProperties | null;
  phenomenon: DeepSpacePhenomenonProperties | null;
  multiplicity: 'single' | 'binary' | 'triple' | 'unresolved';
}

export interface ObservatoryCapabilities {
  equipmentClass: number;
  contactRadiusLy: number;
  atmosphericRadiusLy: number;
  stellarRangeMultiplier: number;
  qualityCeiling: number;
  passiveTargets: number;
}

/** Keeps photometric reach distinct from the much shorter planetary spectroscopy range. */
export function getObservatoryCapabilities(
  ship: Pick<ShipModificationState, 'observatoryClass' | 'damage'>
): ObservatoryCapabilities {
  const equipmentClass = Math.max(0, Math.min(3, Math.floor(ship.observatoryClass ?? 0)));
  const damage = Math.max(0, Math.min(100, ship.damage?.subsystemDamage.specialBay ?? 0));
  const efficiency = Math.max(0.3, 1 - damage / 140);
  return {
    equipmentClass,
    contactRadiusLy: [36, 60, 84, 112][equipmentClass] * efficiency,
    atmosphericRadiusLy: [0, 24, 40, 60][equipmentClass] * efficiency,
    stellarRangeMultiplier: 1 + equipmentClass * 0.2 * efficiency,
    qualityCeiling: [0, 0.58, 0.78, 0.94][equipmentClass] * efficiency,
    passiveTargets: [0, 12, 20, 32][equipmentClass],
  };
}

/** Uses complete reachable addresses, rather than names or projected-cell star counts. */
export function observatoryContactId(
  address: ObservatoryAddress,
  kind: 'system' | 'signal' = 'system'
): string {
  return `${kind}:${address.worldX},${address.worldY},${address.systemSlot}`;
}

/** Creates independent persistent observation and navigation state for a new campaign. */
export function createObservatorySnapshot(): ObservatorySnapshot {
  return { observations: {}, destination: null };
}

/** Rejects malformed imported records before they can reach generation or instrument rendering. */
export function validateObservatorySnapshot(value: unknown): asserts value is ObservatorySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid observatory data.');
  const state = value as ObservatorySnapshot;
  if (!state.observations || typeof state.observations !== 'object' || Array.isArray(state.observations))
    throw new Error('Invalid observatory catalogue.');
  if (Object.keys(state.observations).length > 4096) throw new Error('Observatory catalogue is too large.');
  if (state.destination !== null) {
    validateAddress(state.destination);
    if (
      !['system', 'signal'].includes(state.destination.kind) ||
      typeof state.destination.name !== 'string' ||
      state.destination.name.length > 160
    )
      throw new Error('Invalid observatory destination.');
  }
  for (const [id, record] of Object.entries(state.observations)) {
    if (!record || typeof record !== 'object') throw new Error('Invalid observatory observation.');
    validateAddress(record.address);
    if (id !== observatoryContactId(record.address) && id !== observatoryContactId(record.address, 'signal'))
      throw new Error('Invalid observatory contact identity.');
    if (
      !['unmeasured', 'insufficient', 'no-signal', 'candidate', 'strong', 'catalogued'].includes(
        record.biology
      ) ||
      !['unmeasured', 'no-signal', 'registered', 'unidentified'].includes(record.technology) ||
      !['native', 'managed', 'unknown'].includes(record.origin)
    )
      throw new Error('Invalid observatory assessment.');
    if (
      !Number.isFinite(record.quality) ||
      record.quality < 0 ||
      record.quality > 1 ||
      !Number.isFinite(record.rangeLy) ||
      record.rangeLy < 0 ||
      !Number.isInteger(record.equipmentClass) ||
      record.equipmentClass < 0 ||
      record.equipmentClass > 3 ||
      !Number.isInteger(record.exposure) ||
      record.exposure < 0 ||
      record.exposure > 3 ||
      !Number.isSafeInteger(record.observedFromX) ||
      !Number.isSafeInteger(record.observedFromY) ||
      !Array.isArray(record.features) ||
      record.features.length > 24 ||
      record.features.some((feature) => typeof feature !== 'string' || feature.length > 240) ||
      (record.bodyName !== null && (typeof record.bodyName !== 'string' || record.bodyName.length > 160)) ||
      (record.bodyPath !== null && !/^planet:\d+(\/moon:\d+)?$/.test(record.bodyPath))
    )
      throw new Error('Invalid observatory measurement.');
  }
}

/** Keeps destinations within the same finite integer coordinate domain as travel. */
function validateAddress(address: ObservatoryAddress): void {
  if (
    !address ||
    !Number.isSafeInteger(address.worldX) ||
    !Number.isSafeInteger(address.worldY) ||
    address.systemSlot !== 0
  )
    throw new Error('Invalid or unreachable observatory address.');
}

/** Converts projected navigation cells to the game's declared physical distance units. */
export function observatoryDistanceLy(x: number, y: number, address: ObservatoryAddress): number {
  return Math.hypot(address.worldX - x, address.worldY - y) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
}
