import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { Starbase } from '../entities/starbase';
import { StellarBody } from '../entities/stellar_body';

export type MissionRisk = 'Low' | 'Med' | 'High';
export type MissionStatus = 'AVAILABLE' | 'ACTIVE' | 'COMPLETE';

export interface StarbaseNotice {
  id: string;
  date: string;
  priority: string;
  text: string;
  detail: string;
  relatedMissionId?: string;
}

export interface ScanMissionObjective {
  kind: 'scan';
  targetName: string;
  targetLabel: string;
  targetType: 'star' | 'planet' | 'system';
}

export interface StarbaseMission {
  id: string;
  title: string;
  type: 'survey' | 'charting' | 'recovery';
  issuer: string;
  summary: string;
  detail: string;
  rewardCredits: number;
  risk: MissionRisk;
  originStarbaseName: string;
  systemName: string;
  objective: ScanMissionObjective;
}

export interface MissionProgressState {
  acceptedMissionIds: Set<string>;
  completedMissionIds: Set<string>;
}

/** Returns mission status. */
export function getMissionStatus(mission: StarbaseMission, progress: MissionProgressState): MissionStatus {
  if (progress.completedMissionIds.has(mission.id)) return 'COMPLETE';
  if (progress.acceptedMissionIds.has(mission.id)) return 'ACTIVE';
  return 'AVAILABLE';
}

/** Formats mission detail. */
export function formatMissionDetail(mission: StarbaseMission, status: MissionStatus): string {
  return [
    `CONTRACT: ${mission.title}`,
    `ISSUER: ${mission.issuer}`,
    `OBJECTIVE: ${mission.objective.targetLabel}`,
    `PAYMENT: ${mission.rewardCredits.toLocaleString()} Cr`,
    `RISK: ${mission.risk}`,
    `STATUS: ${status}`,
    mission.detail,
  ].join(' | ');
}

/** Returns whether mission completed by scan. */
export function isMissionCompletedByScan(
  mission: StarbaseMission,
  target: Planet | StellarBody | SolarSystem
): boolean {
  if (mission.objective.kind !== 'scan') return false;
  if (target instanceof Planet) {
    return mission.objective.targetType === 'planet' && target.name === mission.objective.targetName;
  }
  if (target instanceof SolarSystem) {
    return mission.objective.targetType === 'system' && target.name === mission.objective.targetName;
  }
  return mission.objective.targetType === 'star' && target.name === mission.objective.targetName;
}

/** Generates starbase notices. */
export function generateStarbaseNotices(starbase: Starbase, system: SolarSystem): StarbaseNotice[] {
  const notices: StarbaseNotice[] = [];
  const planets = getPlanets(system);
  const giants = planets.filter((planet) => planet.type === 'GasGiant' || planet.type === 'IceGiant');
  const solid = planets.find((planet) => planet.type !== 'GasGiant' && planet.type !== 'IceGiant');
  const missionPrefix = getBoardIdPrefix(starbase);

  notices.push({
    id: `${missionPrefix}:notice:traffic`,
    date: formatStationDate(starbase.name, 1),
    priority: system.architecture.kind === 'single' ? 'PORT' : 'SAFETY',
    text:
      system.architecture.kind === 'single'
        ? 'Departure lanes clear outside normal radiator purge windows.'
        : `${system.architecture.kind.toUpperCase()} ephemeris advisory active for outbound traffic.`,
    detail:
      system.architecture.kind === 'single'
        ? 'Dockmaster traffic is light; automated launch holds remain tied to thermal cycling.'
        : 'Companion-star motion changes recommended launch bearings across short station intervals.',
  });

  notices.push({
    id: `${missionPrefix}:notice:trade`,
    date: formatStationDate(starbase.name, 2),
    priority: 'TRADE',
    text:
      giants.length > 0
        ? 'Volatile brokers report thinner tanker traffic from the outer giant lanes.'
        : 'Bulk haulers are favouring compact cargo until local survey returns improve.',
    detail:
      giants.length > 0
        ? `Station factors are watching ${giants[0].name} for fuel-stock opportunities.`
        : 'Market pressure is local and modest; no emergency pricing bulletin has been filed.',
  });

  notices.push({
    id: `${missionPrefix}:notice:survey`,
    date: formatStationDate(starbase.name, 3),
    priority: 'SURVEY',
    text: solid
      ? `${solid.name} remains short of current surface telemetry.`
      : `${system.name} orbital charts need refreshed passive telemetry.`,
    detail: solid
      ? 'Port survey office is accepting low-risk scan contracts for updated mineral and weather records.'
      : 'Station survey records are thin; even basic body scans improve local navigation confidence.',
    relatedMissionId: `${missionPrefix}:mission:survey-primary`,
  });

  if (system.stars.length > 1) {
    notices.push({
      id: `${missionPrefix}:notice:relay`,
      date: formatStationDate(starbase.name, 4),
      priority: 'SIGNAL',
      text: 'Relay timings drift during companion-star interference windows.',
      detail: 'A charting contract is open for pilots willing to verify the primary-star scan record.',
      relatedMissionId: `${missionPrefix}:mission:chart-star`,
    });
  }

  return notices;
}

/** Generates starbase missions. */
export function generateStarbaseMissions(starbase: Starbase, system: SolarSystem): StarbaseMission[] {
  const planets = getPlanets(system);
  const solid = planets.filter((planet) => planet.type !== 'GasGiant' && planet.type !== 'IceGiant');
  const giants = planets.filter((planet) => planet.type === 'GasGiant' || planet.type === 'IceGiant');
  const primaryStar = system.stars[0];
  const prefix = getBoardIdPrefix(starbase);
  const missions: StarbaseMission[] = [];

  if (solid.length > 0) {
    const target = solid[Math.abs(starbase.name.length + system.name.length) % solid.length];
    missions.push({
      id: `${prefix}:mission:survey-primary`,
      title: `${target.name} survey`,
      type: 'survey',
      issuer: 'Port Survey Office',
      summary: `Scan ${target.type.toLowerCase()} body and return telemetry.`,
      detail: 'Routine contract. Mineral, atmosphere, and thermal records are enough for payment authority.',
      rewardCredits: 760 + target.moons.length * 85,
      risk: target.surfaceTemp > 650 || target.gravity > 1.6 ? 'Med' : 'Low',
      originStarbaseName: starbase.name,
      systemName: system.name,
      objective: {
        kind: 'scan',
        targetName: target.name,
        targetLabel: `Scan ${target.name}`,
        targetType: 'planet',
      },
    });
  }

  if (giants.length > 0) {
    const target = giants[0];
    missions.push({
      id: `${prefix}:mission:giant-weather`,
      title: `${target.name} weather pass`,
      type: 'survey',
      issuer: 'Volatile Traffic Desk',
      summary: 'Confirm upper-atmosphere bands for tanker routing.',
      detail: 'The station wants a fresh remote scan before authorising tighter fuel-hauler approaches.',
      rewardCredits: 980 + Math.min(12, target.moons.length) * 45,
      risk: target.surfaceTemp > 420 ? 'Med' : 'Low',
      originStarbaseName: starbase.name,
      systemName: system.name,
      objective: {
        kind: 'scan',
        targetName: target.name,
        targetLabel: `Scan ${target.name}`,
        targetType: 'planet',
      },
    });
  }

  missions.push({
    id: `${prefix}:mission:chart-star`,
    title: 'Primary ephemeris check',
    type: 'charting',
    issuer: 'Navigation Registry',
    summary: `Verify ${primaryStar.name} scan data for station charts.`,
    detail: 'A clean stellar scan is sufficient; registry clerks will fold it into outbound route tables.',
    rewardCredits: system.architecture.kind === 'single' ? 640 : 1120,
    risk: system.architecture.kind === 'single' ? 'Low' : 'Med',
    originStarbaseName: starbase.name,
    systemName: system.name,
    objective: {
      kind: 'scan',
      targetName: primaryStar.name,
      targetLabel: `Scan ${primaryStar.name}`,
      targetType: 'star',
    },
  });

  if (system.architecture.kind !== 'single' || giants.length > 0) {
    const target = giants[0] ?? planets[planets.length - 1];
    if (target) {
      missions.push({
        id: `${prefix}:mission:signal-recovery`,
        title: 'Outer signal recovery',
        type: 'recovery',
        issuer: 'Station Communications',
        summary: `Investigate weak relay returns near ${target.name}.`,
        detail:
          'No docking required. A close scan pass should confirm whether the returns are natural noise.',
        rewardCredits: 1680,
        risk: system.architecture.kind === 'triple' ? 'High' : 'Med',
        originStarbaseName: starbase.name,
        systemName: system.name,
        objective: {
          kind: 'scan',
          targetName: target.name,
          targetLabel: `Scan ${target.name}`,
          targetType: 'planet',
        },
      });
    }
  }

  return missions;
}

/** Returns planets. */
function getPlanets(system: SolarSystem): Planet[] {
  return system.planets.filter((planet): planet is Planet => planet !== null);
}

/** Returns board id prefix. */
function getBoardIdPrefix(starbase: Starbase): string {
  return starbase.name
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Formats station date. */
function formatStationDate(starbaseName: string, index: number): string {
  let hash = 17 + index * 41;
  for (let i = 0; i < starbaseName.length; i++) {
    hash = Math.imul(hash ^ starbaseName.charCodeAt(i), 16777619);
  }
  const day = 40 + Math.abs(hash % 28);
  return `312.${String(day).padStart(3, '0')}`;
}
