import { DiscoveryLevel } from './discovery';
import {
  getMissionStatus,
  isMissionCompletedByDiscovery,
  MissionStatus,
  StarbaseMission,
} from './mission_board';
import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { StellarBody } from '../entities/stellar_body';

export interface MissionProgressSnapshot {
  acceptedMissionIds: string[];
  completedMissionIds: string[];
  activeMissions: Record<string, StarbaseMission>;
}

/** Owns accepted mission state and evaluates objective progression. */
export class MissionProgressService {
  private acceptedMissionIds = new Set<string>();
  private completedMissionIds = new Set<string>();
  private activeMissions: Record<string, StarbaseMission> = {};

  /** Returns the current status of a generated mission. */
  getStatus(mission: StarbaseMission): MissionStatus {
    return getMissionStatus(mission, {
      acceptedMissionIds: this.acceptedMissionIds,
      completedMissionIds: this.completedMissionIds,
    });
  }

  /** Accepts an available mission and returns whether state changed. */
  accept(mission: StarbaseMission): boolean {
    if (this.getStatus(mission) !== 'AVAILABLE') return false;
    this.acceptedMissionIds.add(mission.id);
    this.activeMissions[mission.id] = mission;
    return true;
  }

  /** Completes active objectives satisfied by a target at the supplied discovery level. */
  completeForDiscovery(
    target: Planet | SolarSystem | StellarBody,
    systemName: string | null,
    level: DiscoveryLevel
  ): StarbaseMission[] {
    const completed = Object.values(this.activeMissions).filter((mission) => {
      if (this.completedMissionIds.has(mission.id)) return false;
      if (systemName && mission.systemName !== systemName) return false;
      return isMissionCompletedByDiscovery(mission, target, level);
    });

    for (const mission of completed) {
      this.completedMissionIds.add(mission.id);
      delete this.activeMissions[mission.id];
    }
    return completed;
  }

  /** Returns the number of currently active missions. */
  getActiveCount(): number {
    return Object.keys(this.activeMissions).length;
  }

  /** Returns JSON-compatible mission progression state. */
  createSnapshot(): MissionProgressSnapshot {
    return {
      acceptedMissionIds: [...this.acceptedMissionIds],
      completedMissionIds: [...this.completedMissionIds],
      activeMissions: structuredClone(this.activeMissions),
    };
  }

  /** Replaces mission progression from a validated save snapshot. */
  restoreSnapshot(snapshot: MissionProgressSnapshot): void {
    this.acceptedMissionIds = new Set(snapshot.acceptedMissionIds);
    this.completedMissionIds = new Set(snapshot.completedMissionIds);
    this.activeMissions = structuredClone(snapshot.activeMissions);
  }
}
