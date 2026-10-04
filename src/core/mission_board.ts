import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { Starbase } from '../entities/starbase';
import { StellarBody } from '../entities/stellar_body';
import { DiscoveryLevel, hasDiscoveryLevel } from './discovery';
import type {
  IndividualSizeClass,
  IndividualMineralisation,
  SpeciesDefinition,
  SpecimenContainer,
  BehaviourObservationKind,
} from '../entities/biology/biology_types';
import { individualSizeClass } from '../entities/biology/biology_rules';
import type { TextDashboardSegment } from './text_ui';
import { resolveMissionNavigation } from './mission_navigation';

export type MissionRisk = 'Low' | 'Med' | 'High';
export type MissionStatus = 'AVAILABLE' | 'ACTIVE' | 'READY' | 'COMPLETE';

export interface MissionSystemAddress {
  worldX: number;
  worldY: number;
  systemSlot: number;
}

export interface MissionBodyLocation {
  bodyPath: string;
  bodyName: string;
  surface?: { x: number; y: number; siteId: string; label: string };
}

export interface StarbaseNotice {
  id: string;
  date: string;
  priority: string;
  text: string;
  detail: string;
  relatedMissionId?: string;
}

export interface ScanMissionObjective {
  id: string;
  kind: 'scan';
  targetName: string;
  targetLabel: string;
  targetType: 'star' | 'planet' | 'system';
  requiredDiscoveryLevel: DiscoveryLevel;
  location?: MissionBodyLocation;
}

export interface SpecimenMissionObjective {
  id: string;
  kind: 'specimen';
  targetName: string;
  targetLabel: string;
  speciesId: string;
  siteId: string;
  requiredKind: 'live' | 'tissue' | 'propagule';
  minimumQuality: number;
  sizeClass?: IndividualSizeClass;
  mineralisation?: IndividualMineralisation;
  reference?: BiologicalReference;
  location?: MissionBodyLocation;
}

export interface BiologicalDataObjective {
  id: string;
  kind: 'biology-data';
  targetName: string;
  targetLabel: string;
  speciesId: string;
  siteId: string;
  requiredEvidenceLevel: 3;
  reference?: BiologicalReference;
  location?: MissionBodyLocation;
}

export interface BiologicalBehaviourObjective {
  id: string;
  kind: 'biology-behaviour';
  targetName: string;
  targetLabel: string;
  speciesId: string;
  siteId: string;
  requiredBehaviour: BehaviourObservationKind;
  reference?: BiologicalReference;
  location?: MissionBodyLocation;
}

/** Public identifying traits supplied by a research office, distinct from acquired field evidence. */
export type BiologicalReference = Pick<
  SpeciesDefinition,
  'symmetry' | 'bodyForm' | 'locomotion' | 'metabolism' | 'role' | 'behaviour'
>;

export type MissionObjective =
  | ScanMissionObjective
  | SpecimenMissionObjective
  | BiologicalDataObjective
  | BiologicalBehaviourObjective;

export interface StarbaseMission {
  id: string;
  title: string;
  type: 'survey' | 'charting' | 'recovery' | 'xenobiology';
  issuer: string;
  summary: string;
  detail: string;
  rewardCredits: number;
  risk: MissionRisk;
  originStarbaseId?: string;
  originStarbaseName: string;
  systemName: string;
  systemAddress?: MissionSystemAddress;
  objectives: MissionObjective[];
}

export interface MissionProgressState {
  acceptedMissionIds: Set<string>;
  readyMissionIds: Set<string>;
  completedMissionIds: Set<string>;
}

/** Returns mission status. */
export function getMissionStatus(mission: StarbaseMission, progress: MissionProgressState): MissionStatus {
  if (progress.completedMissionIds.has(mission.id)) return 'COMPLETE';
  if (progress.readyMissionIds.has(mission.id)) return 'READY';
  if (progress.acceptedMissionIds.has(mission.id)) return 'ACTIVE';
  return 'AVAILABLE';
}

/** Names unclaimed rewards clearly without changing persisted mission progression states. */
export function getMissionStatusLabel(status: MissionStatus): string {
  return status === 'READY' ? 'CLAIMABLE' : status;
}

/** Formats mission detail. */
export function formatMissionDetail(mission: StarbaseMission, status: MissionStatus): string {
  return formatMissionDetailSegments(mission, status)
    .map((segment) => segment.text)
    .join('');
}

/** Puts the reference description first and retains its emphasis through terminal wrapping. */
export function formatMissionDetailSegments(
  mission: StarbaseMission,
  status: MissionStatus
): TextDashboardSegment[] {
  const objectiveText = mission.objectives.map((objective) => objective.targetLabel).join(' -> ');
  const species = new Set<string>();
  const references = mission.objectives.filter(
    (objective): objective is Exclude<MissionObjective, ScanMissionObjective> => {
      if (objective.kind === 'scan' || species.has(objective.speciesId)) return false;
      species.add(objective.speciesId);
      return true;
    }
  );
  const segments: TextDashboardSegment[] = references.flatMap((objective) => [
    { text: 'CREATURE: ', tone: 'muted' as const, font: 'thin' as const },
    { text: biologicalReferenceDescription(objective), tone: 'cyan' as const, font: 'thin' as const },
    { text: ' | ', font: 'thin' as const },
  ]);
  segments.push({
    text: [
      `CONTRACT: ${mission.title}`,
      `ISSUER: ${mission.issuer}`,
      `OBJECTIVES: ${objectiveText} -> Return to ${mission.originStarbaseName}`,
      `PAYMENT: ${mission.rewardCredits.toLocaleString()} Cr`,
      `RISK: ${mission.risk}`,
      `STATUS: ${getMissionStatusLabel(status)}`,
      mission.detail,
    ].join(' | '),
    tone: references.length ? 'normal' : 'cyan',
    font: 'thin',
  });
  return segments;
}

/** Describes the commissioned organism without implying that the player has identified a contact. */
export function biologicalReferenceDescription(
  objective: Exclude<MissionObjective, ScanMissionObjective>
): string {
  const reference = objective.reference;
  return reference
    ? `${objective.targetName} / ${reference.symmetry}${reference.bodyForm ? ` ${reference.bodyForm}` : ''} / ${reference.behaviour} ${reference.role} / ${reference.locomotion} / ${reference.metabolism}`
    : objective.targetName;
}

/** Returns whether a mission objective is satisfied by target knowledge. */
export function isMissionObjectiveCompletedByDiscovery(
  objective: MissionObjective,
  target: Planet | StellarBody | SolarSystem,
  discoveryLevel: DiscoveryLevel
): boolean {
  if (objective.kind !== 'scan') return false;
  if (!hasDiscoveryLevel(discoveryLevel, objective.requiredDiscoveryLevel)) return false;
  if (target instanceof Planet) {
    return objective.targetType === 'planet' && target.name === objective.targetName;
  }
  if (target instanceof SolarSystem) {
    return objective.targetType === 'system' && target.name === objective.targetName;
  }
  return objective.targetType === 'star' && target.name === objective.targetName;
}

/** Matches actual specimen provenance and condition, never just a personal collection flag. */
export function matchesSpecimenObjective(
  objective: SpecimenMissionObjective,
  container: SpecimenContainer
): boolean {
  return (
    container.species.id === objective.speciesId &&
    container.siteId === objective.siteId &&
    container.kind === objective.requiredKind &&
    container.quality >= objective.minimumQuality &&
    (!objective.sizeClass || individualSizeClass(container.sizeScale) === objective.sizeClass) &&
    (!objective.mineralisation || (container.mineralisation ?? 'standard') === objective.mineralisation)
  );
}

/** Explains a missing allocated contribution using actual cargo, including similar but unsuitable specimens. */
export function specimenObjectiveShortfall(
  objective: SpecimenMissionObjective,
  specimens: readonly SpecimenContainer[]
): string {
  const surface = objective.location?.surface;
  const habitat = surface ? `${surface.label} (X ${surface.x}, Y ${surface.y})` : 'the requested habitat';
  const material =
    objective.requiredKind === 'propagule' ? 'viable propagule batch' : `${objective.requiredKind} specimen`;
  const acquisition =
    objective.requiredKind === 'propagule'
      ? `Analyse an unharmed, unsampled mat at ${habitat}; I opens Cargo, then select Harvest viable propagules and press Enter.`
      : `Collect a ${material} at ${habitat}.`;
  let candidates = specimens.filter((container) => container.species.id === objective.speciesId);
  if (!candidates.length) return `No ${material} of ${objective.targetName} aboard. ${acquisition}`;
  candidates = candidates.filter((container) => container.siteId === objective.siteId);
  if (!candidates.length)
    return `Same-species cargo is from another habitat. Collect the ${material} at ${habitat}.`;
  const kinds = [...new Set(candidates.map((container) => container.kind.toUpperCase()))];
  candidates = candidates.filter((container) => container.kind === objective.requiredKind);
  if (!candidates.length)
    return `Cargo contains ${kinds.join(' / ')}, but this contract requires a ${material}. ${acquisition}`;
  candidates = candidates.filter(
    (container) => !objective.sizeClass || individualSizeClass(container.sizeScale) === objective.sizeClass
  );
  if (!candidates.length)
    return `Cargo is the wrong size class. Collect a ${objective.sizeClass} ${material} at ${habitat}.`;
  candidates = candidates.filter(
    (container) =>
      !objective.mineralisation || (container.mineralisation ?? 'standard') === objective.mineralisation
  );
  if (!candidates.length)
    return `Cargo has the wrong mineralisation. Collect a ${objective.mineralisation} ${material} at ${habitat}.`;
  if (!candidates.some((container) => container.quality >= objective.minimumQuality))
    return `Cargo quality is too low. Required: at least ${Math.round(objective.minimumQuality * 100)}%. Collect a healthier source.`;
  return `A matching container is already assigned to another objective; collect an additional ${material}.`;
}

/** Assigns distinct containers to objectives, including overlapping requirements, without mutating cargo. */
export function allocateSpecimenObjectives(
  objectives: readonly SpecimenMissionObjective[],
  specimens: readonly SpecimenContainer[]
): Map<string, SpecimenContainer> {
  const owners = new Map<string, SpecimenMissionObjective>();
  const allocated = new Map<string, SpecimenContainer>();
  /** Reassigns an earlier flexible match when a later objective needs that particular container. */
  function assign(objective: SpecimenMissionObjective, visited: Set<string>): boolean {
    for (const specimen of specimens) {
      if (visited.has(specimen.id) || !matchesSpecimenObjective(objective, specimen)) continue;
      visited.add(specimen.id);
      const previous = owners.get(specimen.id);
      if (previous && !assign(previous, visited)) continue;
      owners.set(specimen.id, objective);
      allocated.set(objective.id, specimen);
      return true;
    }
    return false;
  }
  for (const objective of objectives) assign(objective, new Set());
  return allocated;
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
    date: formatStationDate(starbase.id, 1),
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
    date: formatStationDate(starbase.id, 2),
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
    date: formatStationDate(starbase.id, 3),
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
      date: formatStationDate(starbase.id, 4),
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
      detail:
        'Complete an orbital survey, map one surface site, then return the telemetry to the issuing station.',
      rewardCredits: 760 + target.moons.length * 85,
      risk: target.surfaceTemp > 650 || target.gravity > 1.6 ? 'Med' : 'Low',
      originStarbaseId: starbase.id,
      originStarbaseName: starbase.name,
      systemName: system.name,
      objectives: [
        {
          id: 'orbital-survey',
          kind: 'scan',
          targetName: target.name,
          targetLabel: `Complete orbital survey of ${target.name}`,
          targetType: 'planet',
          requiredDiscoveryLevel: 'surveyed',
        },
        {
          id: 'surface-map',
          kind: 'scan',
          targetName: target.name,
          targetLabel: `Map one surface site on ${target.name}`,
          targetType: 'planet',
          requiredDiscoveryLevel: 'mapped',
        },
      ],
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
      detail:
        'Record the giant atmosphere and any listed navigation reference, then return the package to the station.',
      rewardCredits: 980 + Math.min(12, target.moons.length) * 45,
      risk: target.surfaceTemp > 420 ? 'Med' : 'Low',
      originStarbaseId: starbase.id,
      originStarbaseName: starbase.name,
      systemName: system.name,
      objectives: [
        {
          id: 'weather-survey',
          kind: 'scan',
          targetName: target.name,
          targetLabel: `Survey ${target.name} cloud bands`,
          targetType: 'planet',
          requiredDiscoveryLevel: 'surveyed',
        },
        ...(target.moons[0]
          ? [
              {
                id: 'moon-reference',
                kind: 'scan' as const,
                targetName: target.moons[0].name,
                targetLabel: `Observe ${target.moons[0].name} as a navigation reference`,
                targetType: 'planet' as const,
                requiredDiscoveryLevel: 'observed' as const,
              },
            ]
          : []),
      ],
    });
  }

  missions.push({
    id: `${prefix}:mission:chart-star`,
    title: 'Primary ephemeris check',
    type: 'charting',
    issuer: 'Navigation Registry',
    summary: `Verify ${primaryStar.name} scan data for station charts.`,
    detail:
      'Acquire a clean stellar observation and return it to the registry desk for validation and payment.',
    rewardCredits: system.architecture.kind === 'single' ? 640 : 1120,
    risk: system.architecture.kind === 'single' ? 'Low' : 'Med',
    originStarbaseId: starbase.id,
    originStarbaseName: starbase.name,
    systemName: system.name,
    objectives: [
      {
        id: 'stellar-observation',
        kind: 'scan',
        targetName: primaryStar.name,
        targetLabel: `Resolve ${primaryStar.name} stellar telemetry`,
        targetType: 'star',
        requiredDiscoveryLevel: 'observed',
      },
    ],
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
          'Localise the return, complete any listed surface confirmation, and deliver the record to station communications.',
        rewardCredits: 1680,
        risk: system.architecture.kind === 'triple' ? 'High' : 'Med',
        originStarbaseId: starbase.id,
        originStarbaseName: starbase.name,
        systemName: system.name,
        objectives: [
          {
            id: 'signal-localisation',
            kind: 'scan',
            targetName: target.name,
            targetLabel: `Localise the signal near ${target.name}`,
            targetType: 'planet',
            requiredDiscoveryLevel: 'observed',
          },
          ...(!giants.includes(target)
            ? [
                {
                  id: 'surface-confirmation',
                  kind: 'scan' as const,
                  targetName: target.name,
                  targetLabel: `Map a surface return on ${target.name}`,
                  targetType: 'planet' as const,
                  requiredDiscoveryLevel: 'mapped' as const,
                },
              ]
            : []),
        ],
      });
    }
  }

  return missions.map((mission) => resolveMissionNavigation(mission, system));
}

/** Returns planets. */
function getPlanets(system: SolarSystem): Planet[] {
  return system.planets.filter((planet): planet is Planet => planet !== null);
}

/** Returns board id prefix. */
function getBoardIdPrefix(starbase: Starbase): string {
  return starbase.id
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
