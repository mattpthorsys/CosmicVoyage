import { CONFIG } from '../config';
import type { MissionSystemAddress } from './mission_board';
import type { EconomySnapshot } from './starbase_commerce';

export const DEPOT_PROFILE_VERSION = 1;
export const DEPOT_SERVICE_GOODS = ['TITANIUM_TRUSS', 'REPAIR_SPARES', 'MEDICAL_SUPPLIES'] as const;

export interface DepotRecord {
  readonly stationId: string;
  readonly address: MissionSystemAddress;
  readonly profileVersion: 1;
  readonly profile: 'robotic-basic';
  readonly initialisedAtSeconds: number;
  lastUpdatedSeconds: number;
  revision: number;
}

export type DepotSnapshot = Record<string, DepotRecord>;

/** Validates operational epochs and shared market identity before restoring imported depot state. */
export function validateDepotSnapshot(
  value: unknown,
  gameClockSeconds: number,
  economy: EconomySnapshot
): asserts value is DepotSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid depot operations.');
  for (const [id, candidate] of Object.entries(value)) {
    if (
      !id.trim() ||
      id.length > 512 ||
      ['__proto__', 'constructor', 'prototype'].includes(id) ||
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    )
      throw new Error('Invalid depot identity.');
    const record = candidate as DepotRecord;
    const address = record.address;
    if (
      record.stationId !== id ||
      record.profileVersion !== DEPOT_PROFILE_VERSION ||
      record.profile !== 'robotic-basic' ||
      !address ||
      !Number.isSafeInteger(address.worldX) ||
      !Number.isSafeInteger(address.worldY) ||
      !Number.isInteger(address.systemSlot) ||
      address.systemSlot < 0 ||
      address.systemSlot >= CONFIG.GALACTIC_MAX_RESOLVED_SYSTEMS_PER_CELL ||
      !Number.isFinite(record.initialisedAtSeconds) ||
      record.initialisedAtSeconds < 0 ||
      !Number.isFinite(record.lastUpdatedSeconds) ||
      record.lastUpdatedSeconds < record.initialisedAtSeconds ||
      record.lastUpdatedSeconds > gameClockSeconds ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 0 ||
      !Object.hasOwn(economy, id)
    )
      throw new Error(`Invalid depot operational record: ${id}.`);
    for (const key of DEPOT_SERVICE_GOODS)
      if (!Object.hasOwn(economy[id].items, key))
        throw new Error(`Depot service inventory is missing: ${key}.`);
  }
}
