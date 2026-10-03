import { DiscoveryLevel } from './discovery';
import {
  getMissionStatus,
  isMissionObjectiveCompletedByDiscovery,
  MissionStatus,
  StarbaseMission,
  matchesSpecimenObjective,
} from './mission_board';
import type { SpecimenContainer } from '../entities/biology/biology_types';
import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { StellarBody } from '../entities/stellar_body';
import type { BiosphereDefinition } from '../entities/biology/biology_types';
import { resolveMissionNavigation } from './mission_navigation';

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
      completed: mission.objectives.filter((objective) =>
        objective.kind === 'specimen'
          ? specimens.some((container) => matchesSpecimenObjective(objective, container))
          : this.missionObjectiveProgress[mission.id]?.includes(objective.id)
      ).length,
      total: mission.objectives.length,
    };
  }

  /** Accepts an available mission and returns whether state changed. */
  accept(mission: StarbaseMission): boolean {
    if (this.getStatus(mission) !== 'AVAILABLE') return false;
    this.acceptedMissionIds.add(mission.id);
    this.activeMissions[mission.id] = structuredClone(mission);
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
    specimen?: SpecimenContainer
  ): StarbaseMission | null {
    const mission = this.activeMissions[missionId];
    if (!mission || this.getStatus(mission, specimen ? [specimen] : []) !== 'READY') return null;
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

  /** Returns all accepted contracts, including physical deliveries currently ready for return. */
  getActiveMissions(): readonly StarbaseMission[] {
    return Object.values(this.activeMissions);
  }

  /** Adds missing navigation metadata to older local contracts without changing their accepted objectives. */
  resolveNavigation(system: SolarSystem, biospheres: readonly BiosphereDefinition[]): void {
    for (const mission of this.getActiveMissions())
      this.activeMissions[mission.id] = resolveMissionNavigation(mission, system, biospheres);
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
          objective.kind !== 'scan' && objective.speciesId === speciesId && objective.siteId === siteId
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
    this.missionObjectiveProgress = structuredClone(snapshot.missionObjectiveProgress);
  }
}
