import { DiscoveryLevel } from './discovery';
import {
  getMissionStatus,
  isMissionObjectiveCompletedByDiscovery,
  MissionStatus,
  StarbaseMission,
} from './mission_board';
import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { StellarBody } from '../entities/stellar_body';

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
  getStatus(mission: StarbaseMission): MissionStatus {
    return getMissionStatus(mission, {
      acceptedMissionIds: this.acceptedMissionIds,
      readyMissionIds: this.readyMissionIds,
      completedMissionIds: this.completedMissionIds,
    });
  }

  /** Returns completed and total objective counts for one mission. */
  getObjectiveCounts(mission: StarbaseMission): { completed: number; total: number } {
    return {
      completed: this.missionObjectiveProgress[mission.id]?.length ?? 0,
      total: mission.objectives.length,
    };
  }

  /** Accepts an available mission and returns whether state changed. */
  accept(mission: StarbaseMission): boolean {
    if (this.getStatus(mission) !== 'AVAILABLE') return false;
    this.acceptedMissionIds.add(mission.id);
    this.activeMissions[mission.id] = mission;
    this.missionObjectiveProgress[mission.id] = [];
    return true;
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
  handIn(missionId: string, starbaseName: string): StarbaseMission | null {
    const mission = this.activeMissions[missionId];
    if (!mission || !this.readyMissionIds.has(missionId)) return null;
    if (mission.originStarbaseName !== starbaseName) return null;
    this.readyMissionIds.delete(missionId);
    this.completedMissionIds.add(missionId);
    delete this.activeMissions[missionId];
    delete this.missionObjectiveProgress[missionId];
    return mission;
  }

  /** Returns the number of currently active contracts, including those ready for hand-in. */
  getActiveCount(): number {
    return Object.keys(this.activeMissions).length;
  }

  /** Returns the number of contracts ready to hand in. */
  getReadyCount(): number {
    return this.readyMissionIds.size;
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
