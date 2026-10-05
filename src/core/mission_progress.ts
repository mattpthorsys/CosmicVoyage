import { DiscoveryLevel } from './discovery';
import {
  getMissionStatus,
  isMissionObjectiveCompletedByDiscovery,
  MissionStatus,
  StarbaseMission,
  allocateSpecimenObjectives,
  specimenObjectiveShortfall,
  isBiologicalMissionObjective,
  getHeavyHaulObjective,
} from './mission_board';
import { sameHaulAddress } from './heavy_haul_types';
import type { MissionSystemAddress } from './mission_board';
import { validateHeavyHaulObjective } from './heavy_haul_validation';
import type { SpecimenContainer } from '../entities/biology/biology_types';
import type { BehaviourObservationKind } from '../entities/biology/biology_types';
import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { StellarBody } from '../entities/stellar_body';
import type { BiosphereDefinition, EncounterField } from '../entities/biology/biology_types';
import { resolveMissionNavigation } from './mission_navigation';
import { createBiologicalReference } from './biological_mission_guidance';

export interface MissionProgressSnapshot {
  acceptedMissionIds: string[];
  readyMissionIds: string[];
  completedMissionIds: string[];
  activeMissions: Record<string, StarbaseMission>;
  missionObjectiveProgress: Record<string, string[]>;
}

export interface MissionDiscoveryUpdate {
  mission: StarbaseMission;
  completedObjectiveIds: string[];
  readyForReturn: boolean;
}

/** Owns accepted mission state and evaluates multi-stage objective progression. */
export class MissionProgressService {
  private acceptedMissionIds = new Set<string>();
  private readyMissionIds = new Set<string>();
  private completedMissionIds = new Set<string>();
  private activeMissions: Record<string, StarbaseMission> = {};
  private missionObjectiveProgress: Record<string, string[]> = {};

  /** Returns the current status of a generated mission. */
  getStatus(mission: StarbaseMission, specimens: readonly SpecimenContainer[] = []): MissionStatus {
    const status = getMissionStatus(mission, {
      acceptedMissionIds: this.acceptedMissionIds,
      readyMissionIds: this.readyMissionIds,
      completedMissionIds: this.completedMissionIds,
    });
    if (
      (status === 'ACTIVE' || status === 'READY') &&
      mission.objectives.some((objective) => objective.kind === 'specimen')
    ) {
      const counts = this.getObjectiveCounts(mission, specimens);
      return counts.completed === counts.total ? 'READY' : 'ACTIVE';
    }
    return status;
  }

  /** Returns completed and total objective counts for one mission. */
  getObjectiveCounts(
    mission: StarbaseMission,
    specimens: readonly SpecimenContainer[] = []
  ): { completed: number; total: number } {
    return {
      completed: this.getCompletedObjectiveIds(mission, specimens).length,
      total: mission.objectives.length,
    };
  }

  /** Combines durable analysis packets and uniquely allocated physical contributions for all readouts. */
  getCompletedObjectiveIds(mission: StarbaseMission, specimens: readonly SpecimenContainer[] = []): string[] {
    const allocated = allocateSpecimenObjectives(
      mission.objectives.filter((objective) => objective.kind === 'specimen'),
      specimens
    );
    return mission.objectives
      .filter((objective) =>
        objective.kind === 'specimen'
          ? allocated.has(objective.id)
          : this.missionObjectiveProgress[mission.id]?.includes(objective.id)
      )
      .map((objective) => objective.id);
  }

  /** Gives journal and station readouts the same actionable reasons for each incomplete objective. */
  getObjectiveShortfalls(
    mission: StarbaseMission,
    specimens: readonly SpecimenContainer[] = []
  ): Record<string, string> {
    const completed = new Set(this.getCompletedObjectiveIds(mission, specimens));
    return Object.fromEntries(
      mission.objectives
        .filter((objective) => !completed.has(objective.id))
        .map((objective) => [
          objective.id,
          objective.kind === 'specimen'
            ? specimenObjectiveShortfall(objective, specimens)
            : objective.kind === 'biology-data'
              ? `Detailed analysis not recorded: ${objective.targetLabel}.`
              : objective.kind === 'biology-behaviour'
                ? `Field episode not recorded: ${objective.targetLabel}.`
                : objective.kind === 'haul'
                  ? `Deploy the external package at ${objective.destination.systemName}.`
                  : `Survey incomplete: ${objective.targetLabel}.`,
        ])
    );
  }

  /** Accepts an available mission and returns whether state changed. */
  accept(mission: StarbaseMission): boolean {
    if (this.getStatus(mission) !== 'AVAILABLE') return false;
    if (mission.type === 'heavy-haul') {
      const objective = getHeavyHaulObjective(mission);
      if (
        !objective ||
        !mission.id.trim() ||
        ['__proto__', 'constructor', 'prototype'].includes(mission.id) ||
        this.getActiveMissions().some((entry) => entry.type === 'heavy-haul')
      )
        return false;
      try {
        validateHeavyHaulObjective(objective);
      } catch {
        return false;
      }
    }
    this.acceptedMissionIds.add(mission.id);
    const accepted = structuredClone(mission);
    this.activeMissions[mission.id] = mission.type === 'heavy-haul' ? freezeHaulTerms(accepted) : accepted;
    this.missionObjectiveProgress[mission.id] = [];
    return true;
  }

  /** Records a site-specific field analysis as a durable mission data packet, without paying research. */
  recordBiologicalEvidence(speciesId: string, siteId: string, level: number): void {
    for (const mission of Object.values(this.activeMissions)) {
      const completed = new Set(this.missionObjectiveProgress[mission.id] ?? []);
      for (const objective of mission.objectives)
        if (
          objective.kind === 'biology-data' &&
          objective.speciesId === speciesId &&
          objective.siteId === siteId &&
          level >= objective.requiredEvidenceLevel
        )
          completed.add(objective.id);
      this.missionObjectiveProgress[mission.id] = [...completed];
      if (mission.objectives.every((objective) => completed.has(objective.id)))
        this.readyMissionIds.add(mission.id);
    }
  }

  /** Records a witnessed episode at its actual site; scan strength alone never completes ethology work. */
  recordBehaviourEvidence(speciesId: string, siteId: string, kind: BehaviourObservationKind): void {
    for (const mission of Object.values(this.activeMissions)) {
      const completed = new Set(this.missionObjectiveProgress[mission.id] ?? []);
      for (const objective of mission.objectives)
        if (
          objective.kind === 'biology-behaviour' &&
          objective.speciesId === speciesId &&
          objective.siteId === siteId &&
          objective.requiredBehaviour === kind
        )
          completed.add(objective.id);
      this.missionObjectiveProgress[mission.id] = [...completed];
      if (mission.objectives.every((objective) => completed.has(objective.id)))
        this.readyMissionIds.add(mission.id);
    }
  }

  /** Records discovery against every matching incomplete mission objective. */
  recordDiscovery(
    target: Planet | SolarSystem | StellarBody,
    systemName: string | null,
    level: DiscoveryLevel
  ): MissionDiscoveryUpdate[] {
    const updates: MissionDiscoveryUpdate[] = [];
    for (const mission of Object.values(this.activeMissions)) {
      if (this.readyMissionIds.has(mission.id)) continue;
      if (systemName && mission.systemName !== systemName) continue;
      const completed = new Set(this.missionObjectiveProgress[mission.id] ?? []);
      const newlyCompleted = mission.objectives
        .filter((objective) => !completed.has(objective.id))
        .filter((objective) => isMissionObjectiveCompletedByDiscovery(objective, target, level))
        .map((objective) => objective.id);
      if (newlyCompleted.length === 0) continue;

      for (const objectiveId of newlyCompleted) completed.add(objectiveId);
      this.missionObjectiveProgress[mission.id] = [...completed];
      const readyForReturn = mission.objectives.every((objective) => completed.has(objective.id));
      if (readyForReturn) this.readyMissionIds.add(mission.id);
      updates.push({ mission, completedObjectiveIds: newlyCompleted, readyForReturn });
    }
    return updates;
  }

  /** Hands in one ready mission at its issuing starbase. */
  handIn(
    missionId: string,
    starbaseName: string,
    starbaseId?: string,
    specimen?: SpecimenContainer | readonly SpecimenContainer[]
  ): StarbaseMission | null {
    const mission = this.activeMissions[missionId];
    const specimens = specimen ? ('id' in specimen ? [specimen] : specimen) : [];
    if (!mission || mission.type === 'heavy-haul' || this.getStatus(mission, specimens) !== 'READY')
      return null;
    if (mission.originStarbaseId) {
      if (mission.originStarbaseId !== starbaseId) return null;
    } else if (mission.originStarbaseName !== starbaseName) {
      return null;
    }
    this.readyMissionIds.delete(missionId);
    this.completedMissionIds.add(missionId);
    delete this.activeMissions[missionId];
    delete this.missionObjectiveProgress[missionId];
    return mission;
  }

  /** Reads the accepted contract so changing generation or board readiness cannot change its target. */
  getMission(missionId: string): StarbaseMission | undefined {
    return this.activeMissions[missionId];
  }

  /** Settles only a haul at its frozen destination; the caller coordinates deployment and credits atomically. */
  completeHaulAtDestination(
    missionId: string,
    address: MissionSystemAddress,
    siteId: string
  ): StarbaseMission | null {
    const mission = this.activeMissions[missionId];
    const objective = mission && getHeavyHaulObjective(mission);
    if (
      !mission ||
      !objective ||
      objective.destination.siteId !== siteId ||
      !sameHaulAddress(objective.destination.systemAddress, address)
    )
      return null;
    this.readyMissionIds.delete(missionId);
    this.completedMissionIds.add(missionId);
    delete this.activeMissions[missionId];
    delete this.missionObjectiveProgress[missionId];
    return mission;
  }

  /** Withdraws a haul without a discovery reward; the haul ledger retains its retired offer ID. */
  cancelHaul(missionId: string): boolean {
    if (this.activeMissions[missionId]?.type !== 'heavy-haul') return false;
    this.acceptedMissionIds.delete(missionId);
    this.readyMissionIds.delete(missionId);
    delete this.activeMissions[missionId];
    delete this.missionObjectiveProgress[missionId];
    return true;
  }

  /** Returns all accepted contracts, including physical deliveries currently ready for return. */
  getActiveMissions(): readonly StarbaseMission[] {
    return Object.values(this.activeMissions);
  }

  /** Adds missing navigation metadata to older local contracts without changing their accepted objectives. */
  resolveNavigation(system: SolarSystem, biospheres: readonly BiosphereDefinition[]): void {
    for (const mission of this.getActiveMissions())
      this.activeMissions[mission.id] = resolveMissionNavigation(mission, system, biospheres);
  }

  /** Supplies reference traits to older accepted contracts from already generated target fields. */
  resolveBiologicalReferences(fields: Readonly<Record<string, EncounterField>>): void {
    for (const mission of this.getActiveMissions()) {
      if (mission.type === 'heavy-haul') continue;
      mission.objectives = mission.objectives.map((objective) => {
        if (!isBiologicalMissionObjective(objective) || objective.reference) return objective;
        const species = fields[objective.siteId]?.species.find((entry) => entry.id === objective.speciesId);
        return species ? { ...objective, reference: createBiologicalReference(species) } : objective;
      });
    }
  }

  /** Retains accepted contracts on their issuing board even when targets are no longer in the field. */
  getStationMissions(starbaseName: string, starbaseId: string): StarbaseMission[] {
    return Object.values(this.activeMissions).filter((mission) =>
      mission.originStarbaseId
        ? mission.originStarbaseId === starbaseId
        : mission.originStarbaseName === starbaseName
    );
  }

  /** Returns active requests relevant to an encountered species at its actual collection site. */
  getSpecimenRequests(speciesId: string, siteId: string): StarbaseMission[] {
    return Object.values(this.activeMissions).filter((mission) =>
      mission.objectives.some(
        (objective) =>
          isBiologicalMissionObjective(objective) &&
          objective.speciesId === speciesId &&
          objective.siteId === siteId
      )
    );
  }

  /** Returns the number of currently active contracts, including those ready for hand-in. */
  getActiveCount(): number {
    return Object.keys(this.activeMissions).length;
  }

  /** Returns the number of contracts ready to hand in. */
  getReadyCount(specimens: readonly SpecimenContainer[] = []): number {
    return Object.values(this.activeMissions).filter(
      (mission) => this.getStatus(mission, specimens) === 'READY'
    ).length;
  }

  /** Returns JSON-compatible mission progression state. */
  createSnapshot(): MissionProgressSnapshot {
    return {
      acceptedMissionIds: [...this.acceptedMissionIds],
      readyMissionIds: [...this.readyMissionIds],
      completedMissionIds: [...this.completedMissionIds],
      activeMissions: structuredClone(this.activeMissions),
      missionObjectiveProgress: structuredClone(this.missionObjectiveProgress),
    };
  }

  /** Replaces mission progression from a validated save snapshot. */
  restoreSnapshot(snapshot: MissionProgressSnapshot): void {
    this.acceptedMissionIds = new Set(snapshot.acceptedMissionIds);
    this.readyMissionIds = new Set(snapshot.readyMissionIds);
    this.completedMissionIds = new Set(snapshot.completedMissionIds);
    this.activeMissions = structuredClone(snapshot.activeMissions);
    for (const mission of Object.values(this.activeMissions))
      if (mission.type === 'heavy-haul') freezeHaulTerms(mission);
    this.missionObjectiveProgress = structuredClone(snapshot.missionObjectiveProgress);
  }
}

/** Freezes only canonical haul definitions; legacy biological metadata still resolves through its existing path. */
function freezeHaulTerms(mission: StarbaseMission): StarbaseMission {
  const objective = getHeavyHaulObjective(mission);
  if (!objective) return mission;
  for (const endpoint of [objective.pickup, objective.destination]) {
    Object.freeze(endpoint.systemAddress);
    Object.freeze(endpoint.orbit.host);
    Object.freeze(endpoint.orbit);
    Object.freeze(endpoint);
  }
  Object.freeze(objective.package);
  Object.freeze(objective.route);
  Object.freeze(objective);
  Object.freeze(mission.objectives);
  if (mission.systemAddress) Object.freeze(mission.systemAddress);
  Object.freeze(mission);
  return mission;
}
