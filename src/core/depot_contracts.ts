import { TRADE_COMMODITIES } from '../constants';
import type { SolarSystem } from '../entities/solar_system';
import type { Starbase } from '../entities/starbase';
import type { Player } from './player';
import type { CargoSystem } from '../systems/cargo_systems';
import type { DepotService } from './depot_service';
import type { DepotJobState, DepotRecord, DepotSnapshot } from './depot_types';
import type { StarbaseCommerceService, EconomySnapshot } from './starbase_commerce';
import { getSystemPlanetPaths } from './save_game';
import { hasDiscoveryLevel } from './discovery';
import { MissionProgressService, type MissionProgressSnapshot } from './mission_progress';
import type { StarbaseMission } from './mission_board';
import { PRNG } from '../utils/prng';
import { isMissionSystem } from './mission_navigation';

export const DEPOT_JOB_BUDGET = 6000;
export const DEPOT_JOB_INTERVAL_SECONDS = 90 * 86400;
export const DEPOT_SUPPLY_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  REPAIR_SPARES: 8,
  MEDICAL_SUPPLIES: 6,
  TITANIUM_TRUSS: 8,
  HELIUM_3: 6,
  DEUTERIUM_PELLETS: 8,
});

export interface DepotContractCheckpoint {
  readonly missions: MissionProgressSnapshot;
  readonly depots: DepotSnapshot;
  readonly economy: EconomySnapshot;
  readonly resources: Player['resources'];
  readonly cargoHold: Player['cargoHold'];
}

export interface DepotContractResult {
  readonly ok: boolean;
  readonly message: string;
  readonly credits: number;
}

/** Owns bounded sponsor-funded robot work; accepted definitions remain in the existing mission ledger. */
export class DepotContracts {
  /** Injects the same stock, cargo, clock-facing operations and progression owners used by station services. */
  constructor(
    private readonly depots: DepotService,
    private readonly commerce: StarbaseCommerceService,
    private readonly progress: MissionProgressService,
    private readonly player: Player,
    private readonly cargo: CargoSystem,
    private readonly seed: string
  ) {}

  /** Refreshes on materialisation, never on rendering; missed cycles neither bank funds nor generate a backlog. */
  refreshStation(station: Starbase, system: SolarSystem, seconds: number): void {
    const record = this.depots.getRecord(station.id);
    if (!record || station.kind !== 'automated-depot') return;
    if (
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      seconds !== record.lastUpdatedSeconds ||
      !isMissionSystem(record.address, system)
    )
      throw new Error('Robot board requires an updated depot in its recorded system.');
    record.jobs ??= {
      availableCredits: DEPOT_JOB_BUDGET,
      reservedCredits: {},
      revision: 0,
      nextRefreshSeconds: seconds,
      offers: [],
    };
    const jobs = record.jobs;
    if (seconds < jobs.nextRefreshSeconds) return;
    const accepted = this.progress
      .getStationMissions(station.name, station.id)
      .filter((mission) => mission.sponsor === 'robotic-depot');
    jobs.revision++;
    jobs.nextRefreshSeconds = seconds + DEPOT_JOB_INTERVAL_SECONDS;
    jobs.offers = this.buildOffers(station, system, record, jobs, accepted);
    const snapshot = this.depots.createSnapshot();
    snapshot[station.id] = record;
    this.depots.restoreSnapshot(snapshot);
  }

  /** Derives at most two supply and one actual unmeasured-body survey offers within unreserved sponsor funds. */
  private buildOffers(
    station: Starbase,
    system: SolarSystem,
    record: DepotRecord,
    jobs: DepotJobState,
    accepted: readonly StarbaseMission[]
  ): StarbaseMission[] {
    const offers: StarbaseMission[] = [];
    let funds = jobs.availableCredits;
    const supplySlots = Math.max(0, 2 - accepted.filter((mission) => mission.type === 'supply').length);
    const needs = Object.entries(DEPOT_SUPPLY_TARGETS)
      .map(([key, target]) => ({
        key,
        target,
        stock: this.commerce.getStock(station.id, key),
        rank: new PRNG(`${this.seed}:depot-needs:v1:${station.id}:${key}`).random(),
      }))
      .filter(
        ({ key, target, stock }) =>
          stock < target * 0.75 &&
          !accepted.some((mission) =>
            mission.objectives.some((objective) => objective.kind === 'delivery' && objective.itemKey === key)
          )
      )
      .sort((a, b) => a.stock / a.target - b.stock / b.target || a.rank - b.rank);
    for (const { key, target, stock } of needs) {
      if (offers.length >= supplySlots) break;
      const quantity = Math.min(6, Math.ceil(target - stock));
      const info = TRADE_COMMODITIES[key];
      const rewardCredits = quantity * info.baseValue * 2 + 80;
      if (rewardCredits > funds) continue;
      offers.push({
        id: `depot-job:${station.id}:${jobs.revision}:supply:${key}`,
        type: 'supply',
        sponsor: 'robotic-depot',
        title: `${info.name} resupply`,
        issuer: 'Robotic Logistics / sponsor escrow',
        summary: `Deliver ${quantity} m^3 ${info.name} to this depot.`,
        detail:
          'Deliver the complete sealed lot from your ship hold through Missions. Ordinary sale does not fulfil this request. Payment includes materials and a modest logistics premium; accepted terms remain fixed.',
        rewardCredits,
        risk: 'Low',
        originStarbaseId: station.id,
        originStarbaseName: station.name,
        systemName: system.name,
        systemAddress: { ...record.address },
        objectives: [
          {
            id: 'supply-handoff',
            kind: 'delivery',
            itemKey: key,
            quantity,
            stationId: station.id,
            targetName: info.name,
            targetLabel: `Deliver ${quantity} m^3 ${info.name} to ${station.name}`,
          },
        ],
      });
      funds -= rewardCredits;
    }
    if (!accepted.some((mission) => mission.type === 'survey')) {
      const target = getSystemPlanetPaths(system)
        .filter(({ planet }) => !hasDiscoveryLevel(planet.discovery.level, 'surveyed'))
        .map((body) => ({
          ...body,
          rank: new PRNG(`${this.seed}:depot-survey:v1:${station.id}:${jobs.revision}:${body.path}`).random(),
        }))
        .sort((a, b) => a.rank - b.rank)[0];
      if (target && funds >= 420)
        offers.push({
          id: `depot-job:${station.id}:${jobs.revision}:survey`,
          type: 'survey',
          sponsor: 'robotic-depot',
          title: `${target.planet.name} instrument survey`,
          issuer: 'Robotic Survey / sponsor escrow',
          summary: 'Return a complete local orbital measurement.',
          detail:
            'Survey the identified body in this system, then return the telemetry through Missions. Remote charts and identically named worlds elsewhere do not satisfy the observation.',
          rewardCredits: 420,
          risk: 'Low',
          originStarbaseId: station.id,
          originStarbaseName: station.name,
          systemName: system.name,
          systemAddress: { ...record.address },
          objectives: [
            {
              id: 'local-survey',
              kind: 'scan',
              targetName: target.planet.name,
              targetLabel: `Survey ${target.planet.name} from orbit`,
              targetType: 'planet',
              requiredDiscoveryLevel: 'surveyed',
              location: { bodyPath: target.path, bodyName: target.planet.name },
            },
          ],
        });
    }
    return offers;
  }

  /** Reads prepared offers without changing stock, budget, revision or the world's generation stream. */
  list(station: Starbase, system: SolarSystem): StarbaseMission[] {
    const record = this.depots.getRecord(station.id);
    const jobs = record?.jobs;
    if (!record || !jobs || station.kind !== 'automated-depot' || !isMissionSystem(record.address, system))
      return [];
    return structuredClone(
      jobs.offers.filter((mission) => {
        if (this.progress.getStatus(mission) !== 'AVAILABLE' || mission.rewardCredits > jobs.availableCredits)
          return false;
        const objective = mission.objectives[0];
        if (objective.kind === 'delivery')
          return (
            this.commerce.getStock(station.id, objective.itemKey) < DEPOT_SUPPLY_TARGETS[objective.itemKey]
          );
        if (objective.kind !== 'scan') return false;
        const body = getSystemPlanetPaths(system).find(
          ({ path }) => path === objective.location?.bodyPath
        )?.planet;
        return body && !hasDiscoveryLevel(body.discovery.level, objective.requiredDiscoveryLevel);
      })
    );
  }

  /** Reserves exact accepted reward terms and checkpoints them before mutating any live owner. */
  accept(
    mission: StarbaseMission,
    station: Starbase,
    system: SolarSystem,
    checkpoint?: (outcome: DepotContractCheckpoint) => void
  ): DepotContractResult {
    const offered = this.list(station, system).find((offer) => offer.id === mission.id);
    const record = this.depots.getRecord(station.id);
    if (!offered || !record?.jobs || JSON.stringify(offered) !== JSON.stringify(mission))
      return this.refusal('This robot offer is no longer available.');
    const next = this.detachedProgress();
    if (!next.accept(offered)) return this.refusal('Contract already accepted or retired.');
    record.jobs.availableCredits -= offered.rewardCredits;
    record.jobs.reservedCredits[offered.id] = offered.rewardCredits;
    return this.commit(
      record,
      next,
      this.commerce.createSnapshot(),
      this.player.cargoHold,
      0,
      `Accepted: ${offered.title}. ${offered.rewardCredits} Cr reserved in sponsor escrow.`,
      checkpoint
    );
  }

  /** Consumes a whole ship-hold delivery and pays once, or settles address-verified survey telemetry. */
  settle(
    missionId: string,
    station: Starbase,
    checkpoint?: (outcome: DepotContractCheckpoint) => void
  ): DepotContractResult {
    const mission = this.progress.getMission(missionId);
    const record = this.depots.getRecord(station.id);
    if (
      station.kind !== 'automated-depot' ||
      !mission ||
      mission.sponsor !== 'robotic-depot' ||
      mission.originStarbaseId !== station.id ||
      !record?.jobs ||
      record.jobs.reservedCredits[missionId] !== mission.rewardCredits
    )
      return this.refusal('Return this funded contract to its issuing depot.');
    const next = this.detachedProgress();
    if (!next.completeDepotAtStation(missionId, station.id))
      return this.refusal(
        Object.values(this.progress.getObjectiveShortfalls(mission)).join(' ') ||
          'Contract not ready for settlement.'
      );
    const hold = structuredClone(this.player.cargoHold);
    let economy = this.commerce.createSnapshot();
    const objective = mission.objectives[0];
    let receipt = 'Orbital telemetry accepted';
    if (objective.kind === 'delivery') {
      if (this.cargo.removeItem(hold, objective.itemKey, objective.quantity) !== objective.quantity)
        return this.refusal('Requested cargo is no longer in the ship hold.');
      const deposit = this.commerce.prepareStockDeposit(station.id, objective.itemKey, objective.quantity);
      if (!deposit) return this.refusal('Depot intake unavailable; no cargo consumed.');
      economy = deposit;
      // Contract deliveries use overflow receiving storage; an accepted promise never expires when miners fill a store.
      receipt = `${objective.quantity} m^3 ${objective.targetName} received / depot stock replenished`;
    }
    delete record.jobs.reservedCredits[missionId];
    record.jobs.offers = record.jobs.offers.filter((offer) => offer.id !== missionId);
    return this.commit(
      record,
      next,
      economy,
      hold,
      mission.rewardCredits,
      `${receipt}. Payment ${mission.rewardCredits.toLocaleString()} Cr credited.`,
      checkpoint
    );
  }

  /** Releases an accepted reservation while retiring its offer until the next scheduled board revision. */
  cancel(
    missionId: string,
    station: Starbase,
    checkpoint?: (outcome: DepotContractCheckpoint) => void
  ): DepotContractResult {
    const mission = this.progress.getMission(missionId);
    const record = this.depots.getRecord(station.id);
    if (
      station.kind !== 'automated-depot' ||
      !mission ||
      mission.sponsor !== 'robotic-depot' ||
      mission.originStarbaseId !== station.id ||
      !record?.jobs ||
      record.jobs.reservedCredits[missionId] !== mission.rewardCredits
    )
      return this.refusal('Cancel robot work at its issuing depot.');
    const next = this.detachedProgress();
    if (!next.cancelDepot(missionId)) return this.refusal('No active robot contract.');
    record.jobs.availableCredits += mission.rewardCredits;
    delete record.jobs.reservedCredits[missionId];
    record.jobs.offers = record.jobs.offers.filter((offer) => offer.id !== missionId);
    return this.commit(
      record,
      next,
      this.commerce.createSnapshot(),
      this.player.cargoHold,
      0,
      'Contract cancelled / sponsor escrow released. No cargo consumed or payment made.',
      checkpoint
    );
  }

  /** Clones progression for a prospective transaction while reading current ship-hold eligibility. */
  private detachedProgress(): MissionProgressService {
    const next = new MissionProgressService(() => this.player.cargoHold.items);
    next.restoreSnapshot(this.progress.createSnapshot());
    return next;
  }

  /** Reports an expected refusal without partial stock, cargo, mission or payment changes. */
  private refusal(message: string): DepotContractResult {
    return { ok: false, message, credits: 0 };
  }

  /** Persists the whole detached outcome first, then assigns it with no intervening callbacks. */
  private commit(
    record: DepotRecord,
    progress: MissionProgressService,
    economy: EconomySnapshot,
    hold: Player['cargoHold'],
    credits: number,
    message: string,
    checkpoint?: (outcome: DepotContractCheckpoint) => void
  ): DepotContractResult {
    const depots = this.depots.createSnapshot();
    record.revision++;
    depots[record.stationId] = record;
    const outcome: DepotContractCheckpoint = {
      depots,
      economy,
      missions: progress.createSnapshot(),
      cargoHold: structuredClone(hold),
      resources: { ...this.player.resources, credits: this.player.resources.credits + credits },
    };
    try {
      checkpoint?.(outcome);
    } catch {
      return this.refusal('Checkpoint failed. No contract, cargo or payment changes applied.');
    }
    this.depots.restoreSnapshot(outcome.depots);
    this.commerce.restoreSnapshot(outcome.economy);
    this.progress.restoreSnapshot(outcome.missions);
    this.player.cargoHold = outcome.cargoHold;
    this.player.resources = outcome.resources;
    return { ok: true, message, credits };
  }
}
