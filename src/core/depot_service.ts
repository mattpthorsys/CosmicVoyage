import { PRNG } from '../utils/prng';
import type { Starbase } from '../entities/starbase';
import type { MissionSystemAddress } from './mission_board';
import { DEPOT_PROFILE_VERSION, type DepotRecord, type DepotSnapshot } from './depot_types';
import type { StarbaseCommerceService } from './starbase_commerce';

/** Owns robotic operations while commerce remains the sole owner of saleable supplies. */
export class DepotService {
  private records = new Map<string, DepotRecord>();

  /** Keeps depot initialisation independent of generated-system and station PRNG streams. */
  constructor(
    private readonly commerce: StarbaseCommerceService,
    private readonly worldSeed: string
  ) {}

  /** Initialises each materialised depot once, preserving all previously stocked or depleted goods. */
  ensureStation(
    station: Starbase,
    address: MissionSystemAddress,
    gameClockSeconds: number,
    commissionedAtSeconds = gameClockSeconds
  ): void {
    if (station.kind !== 'automated-depot') return;
    if (
      !Number.isFinite(gameClockSeconds) ||
      !Number.isFinite(commissionedAtSeconds) ||
      commissionedAtSeconds < 0 ||
      commissionedAtSeconds > gameClockSeconds
    )
      throw new Error('Invalid depot initialisation epoch.');
    this.commerce.registerStation(station.id, station.kind);
    const existing = this.records.get(station.id);
    if (existing) {
      if (
        existing.address.worldX !== address.worldX ||
        existing.address.worldY !== address.worldY ||
        existing.address.systemSlot !== address.systemSlot
      )
        throw new Error('Depot identity belongs to another system.');
      if (gameClockSeconds < existing.lastUpdatedSeconds)
        throw new Error('Depot epoch exceeds the game clock.');
      // M0-M2 advance only the watermark; extraction will be added explicitly in M3.
      existing.lastUpdatedSeconds = gameClockSeconds;
      return;
    }
    const rng = new PRNG(`${this.worldSeed}:robotic-depot:v1:${station.id}`);
    this.commerce.initialiseStock(station.id, 'TITANIUM_TRUSS', rng.randomInt(4, 8));
    this.commerce.initialiseStock(station.id, 'REPAIR_SPARES', rng.randomInt(3, 6));
    this.commerce.initialiseStock(station.id, 'MEDICAL_SUPPLIES', rng.randomInt(2, 4));
    this.records.set(station.id, {
      stationId: station.id,
      address: { ...address },
      profileVersion: DEPOT_PROFILE_VERSION,
      profile: 'robotic-basic',
      initialisedAtSeconds: commissionedAtSeconds,
      lastUpdatedSeconds: gameClockSeconds,
      revision: 0,
    });
  }

  /** Returns a detached record, never allowing presentation code to mutate operational state. */
  getRecord(stationId: string): DepotRecord | null {
    const record = this.records.get(stationId);
    return record ? structuredClone(record) : null;
  }

  /** Captures small operational records without copying station inventories or generated worlds. */
  createSnapshot(): DepotSnapshot {
    return Object.fromEntries([...this.records].map(([id, record]) => [id, structuredClone(record)]));
  }

  /** Restores validated records before station materialisation can initialise missing facilities. */
  restoreSnapshot(snapshot: DepotSnapshot): void {
    this.records = new Map(Object.entries(snapshot).map(([id, record]) => [id, structuredClone(record)]));
  }
}
