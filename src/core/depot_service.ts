import { PRNG } from '../utils/prng';
import type { Starbase } from '../entities/starbase';
import type { MissionSystemAddress } from './mission_board';
import {
  DEPOT_PROFILE_VERSION,
  type DepotRecord,
  type DepotSnapshot,
  type DepotServiceKind,
  type DepotServiceQuote,
  type DepotWorkTarget,
} from './depot_types';
import type { CommerceEffects, EconomySnapshot, StarbaseCommerceService } from './starbase_commerce';
import { quoteDepotWork } from './depot_rules';
import { HULL_REPAIR_COST_PER_POINT, ROVER_REPAIR_COST_PER_POINT } from './ship_modifications';
import type { Player } from './player';
import type { CargoSystem } from '../systems/cargo_systems';
import { CONFIG } from '../config';

export interface DepotServiceResult {
  readonly ok: boolean;
  readonly message: string;
  readonly effects: CommerceEffects;
  readonly cargoConsumed: Readonly<Record<string, number>>;
}

export interface DepotServiceCheckpoint {
  readonly player: Pick<Player, 'ship' | 'terrainVehicle' | 'resources' | 'cargoHold' | 'crew'>;
  readonly economy: EconomySnapshot;
  readonly depots: DepotSnapshot;
}

/** Owns robotic operations while commerce remains the sole owner of saleable supplies. */
export class DepotService {
  private records = new Map<string, DepotRecord>();

  /** Keeps depot initialisation independent of generated-system and station PRNG streams. */
  constructor(
    private readonly commerce: StarbaseCommerceService,
    private readonly worldSeed: string,
    private readonly player: Player,
    private readonly cargoSystem: CargoSystem
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

  /** Builds supported robotic tasks, excluding advanced ship equipment and nonliving medical patients. */
  private getTargets(kind: DepotServiceKind): DepotWorkTarget[] {
    if (kind === 'medical')
      return (
        this.player.crew
          .filter((member) => member.hitPoints > 0)
          .map((member) => ({
            id: `crew:${member.id}`,
            label: member.name,
            current: member.hitPoints,
            maximum: member.maxHitPoints,
            unitsPerBatch: 20,
            labourPerUnit: 4,
            supplies: ['MEDICAL_SUPPLIES'],
          }))
          // All-crew treatment prioritises the most injured; individual selection can override triage.
          .sort((a, b) => a.current / a.maximum - b.current / b.maximum || a.id.localeCompare(b.id))
      );
    if (kind === 'fuel')
      return [
        {
          id: 'fuel',
          label: 'D/He3 reactor loading',
          current: this.player.resources.fuel,
          maximum: this.player.resources.maxFuel,
          unitsPerBatch: 40,
          labourPerUnit: 1 / CONFIG.FUEL_PER_CREDIT,
          supplies: ['HELIUM_3', 'DEUTERIUM_PELLETS'],
        },
      ];
    const hull = this.player.ship.damage;
    const targets: DepotWorkTarget[] = [
      {
        id: 'hull',
        label: 'Hull structural repair',
        current: hull.hullIntegrity,
        maximum: hull.maxHullIntegrity,
        unitsPerBatch: 10,
        labourPerUnit: HULL_REPAIR_COST_PER_POINT,
        supplies: ['TITANIUM_TRUSS', 'REPAIR_SPARES'],
      },
    ];
    const rover = this.player.terrainVehicle;
    if (rover.available && !rover.deployed && !rover.onFoot)
      targets.push({
        id: 'rover',
        label: 'Rover armour repair',
        current: rover.integrity ?? 100,
        maximum: 100,
        unitsPerBatch: 20,
        labourPerUnit: ROVER_REPAIR_COST_PER_POINT,
        supplies: ['TITANIUM_TRUSS', 'REPAIR_SPARES'],
      });
    return targets;
  }

  /** Produces a deterministic resource/cargo/account quote from live owners, without consuming supplies. */
  quote(stationId: string, kind: DepotServiceKind, targetId: string, useCargo = false): DepotServiceQuote {
    const record = this.records.get(stationId);
    if (!record) throw new Error('Depot service inventory has not been initialised.');
    const targets = this.getTargets(kind);
    const keys = [...new Set(targets.flatMap((target) => target.supplies))];
    return quoteDepotWork({
      stationId,
      revision: record.revision,
      kind,
      targetId,
      useCargo,
      credits: this.player.resources.credits,
      targets,
      stock: Object.fromEntries(keys.map((key) => [key, this.commerce.getStock(stationId, key)])),
      prices: Object.fromEntries(
        keys.map((key) => [key, this.commerce.getTradeQuote(stationId, key)?.buyPrice ?? 0])
      ),
      cargo: { ...this.player.cargoHold.items },
    });
  }

  /** Quotes selection rows through the same rules used for purchase; all-work orders share one supply budget. */
  getQuotes(stationId: string, kind: DepotServiceKind, useCargo = false): DepotServiceQuote[] {
    const ids = this.getTargets(kind).map((target) => target.id);
    if (kind !== 'fuel') ids.unshift('all');
    return ids.map((id) => this.quote(stationId, kind, id, useCargo));
  }

  /** Checkpoints a detached outcome before applying confirmed work; storage failure leaves every live owner untouched. */
  purchase(
    quote: DepotServiceQuote,
    checkpoint?: (outcome: DepotServiceCheckpoint) => void
  ): DepotServiceResult {
    const record = this.records.get(quote.stationId);
    /** Reports an expected refusal without resource effects or a partially applied work order. */
    const refusal = (message: string): DepotServiceResult => ({
      ok: false,
      message,
      effects: {},
      cargoConsumed: {},
    });
    if (!record) return refusal('This robotic service is not available.');
    const current = this.quote(quote.stationId, quote.kind, quote.targetId, quote.useCargo);
    if (JSON.stringify(current) !== JSON.stringify(quote))
      return refusal('Work order changed. Review the updated quote before confirming.');
    if (quote.completedUnits <= 0) return refusal(quote.shortfalls.join(' ') || 'No work can be performed.');
    if (
      this.player.resources.credits < quote.cost ||
      Object.entries(quote.cargoSupplies).some(
        ([key, units]) => (this.player.cargoHold.items[key] ?? 0) < units
      )
    )
      return refusal('Funds or carried supplies changed; no work was performed.');
    const economy = this.commerce.prepareStockConsumption(quote.stationId, quote.stationSupplies);
    if (!economy) return refusal('Depot supplies changed; no work was performed.');
    const next = structuredClone({
      ship: this.player.ship,
      terrainVehicle: this.player.terrainVehicle,
      resources: this.player.resources,
      cargoHold: this.player.cargoHold,
      crew: this.player.crew,
    });
    for (const [key, units] of Object.entries(quote.cargoSupplies))
      this.cargoSystem.removeItem(next.cargoHold, key, units);
    const previousFuel = this.player.resources.fuel;
    for (const work of quote.work) {
      if (work.id === 'hull') next.ship.damage.hullIntegrity = work.to;
      else if (work.id === 'rover') next.terrainVehicle.integrity = work.to;
      else if (work.id === 'fuel') next.resources.fuel = work.to;
      else if (work.id.startsWith('crew:')) {
        const member = next.crew.find((candidate) => candidate.id === work.id.slice(5));
        if (member) member.hitPoints = work.to;
      }
    }
    next.resources.credits -= quote.cost;
    const depots = this.createSnapshot();
    depots[quote.stationId].revision++;
    try {
      checkpoint?.({ player: next, economy, depots });
    } catch {
      return refusal('Checkpoint failed. No service performed or supplies consumed.');
    }
    // The durable outcome is complete. Only detached assignments remain, with no callbacks during the commit.
    this.commerce.restoreSnapshot(economy);
    this.restoreSnapshot(depots);
    Object.assign(this.player, next);
    return {
      ok: true,
      message: `${quote.label}: ${quote.completedUnits.toLocaleString()} ${quote.unitLabel} completed${quote.completedUnits < quote.requestedUnits ? ' / partial service' : ''}. Paid ${quote.cost.toLocaleString()} Cr.`,
      cargoConsumed: { ...quote.cargoSupplies },
      effects: {
        creditsChanged: { newCredits: this.player.resources.credits, amountChanged: -quote.cost },
        ...(previousFuel !== this.player.resources.fuel
          ? {
              fuelChanged: {
                newFuel: this.player.resources.fuel,
                maxFuel: this.player.resources.maxFuel,
                amountChanged: this.player.resources.fuel - previousFuel,
              },
            }
          : {}),
      },
    };
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
