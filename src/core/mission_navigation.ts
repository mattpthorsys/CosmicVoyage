import type { BiosphereDefinition } from '../entities/biology/biology_types';
import type { Planet } from '../entities/planet';
import type { SolarSystem } from '../entities/solar_system';
import type { MissionBodyLocation, MissionSystemAddress, StarbaseMission } from './mission_board';
import { isBiologicalMissionObjective } from './mission_board';
import { findSystemPlanetByPath, getSystemPlanetPaths } from './save_game';
import { createBiologicalReference } from './biological_mission_guidance';

/** Compares the complete projected address, including crowded cells' resolved-system slots. */
export function isMissionSystem(address: MissionSystemAddress, system: SolarSystem): boolean {
  return (
    address.worldX === system.starX &&
    address.worldY === system.starY &&
    address.systemSlot === system.systemSlot
  );
}

/** Resolves generated targets from real objects, never by parsing their human-readable descriptions. */
export function resolveMissionNavigation(
  mission: StarbaseMission,
  system: SolarSystem,
  biospheres: readonly BiosphereDefinition[] = []
): StarbaseMission {
  if (
    mission.type === 'heavy-haul' ||
    mission.systemName !== system.name ||
    (mission.systemAddress && !isMissionSystem(mission.systemAddress, system))
  )
    return mission;
  const bodies = getSystemPlanetPaths(system);
  return {
    ...mission,
    systemAddress: mission.systemAddress ?? {
      worldX: system.starX,
      worldY: system.starY,
      systemSlot: system.systemSlot,
    },
    objectives: mission.objectives.map((objective) => {
      if (objective.kind === 'scan') {
        if (objective.location) return objective;
        if (objective.targetType !== 'planet') return objective;
        const body = bodies.find(({ planet }) => planet.name === objective.targetName);
        return body
          ? { ...objective, location: { bodyPath: body.path, bodyName: body.planet.name } }
          : objective;
      }
      if (!isBiologicalMissionObjective(objective)) return objective;
      const biosphere = biospheres.find((entry) => entry.sites.some((site) => site.id === objective.siteId));
      const site = biosphere?.sites.find((entry) => entry.id === objective.siteId);
      const body = biosphere && bodies.find(({ planet }) => planet.name === biosphere.bodyName);
      const species = biosphere?.species?.find((entry) => entry.id === objective.speciesId);
      const reference = objective.reference ?? (species && createBiologicalReference(species));
      if (objective.location) return reference ? { ...objective, reference } : objective;
      if (!site || !body) return objective;
      return {
        ...objective,
        reference,
        location: {
          bodyPath: body.path,
          bodyName: body.planet.name,
          surface: { x: site.x, y: site.y, siteId: site.id, label: site.label },
        },
      };
    }),
  };
}

/** Returns a specific habitat request; surveys permitting any landing do not invent coordinates. */
export function getMissionLandingLocation(
  mission: StarbaseMission,
  objectiveIndex?: number
): MissionBodyLocation | undefined {
  if (objectiveIndex !== undefined) return mission.objectives[objectiveIndex]?.location;
  return mission.objectives.find((objective) => objective.location?.surface)?.location;
}

/** Lists distinct advertised destinations, avoiding redundant stops for two specimens at the same habitat. */
export function getMissionLandingObjectiveIndices(mission: StarbaseMission): number[] {
  const seen = new Set<string>();
  return mission.objectives.flatMap((objective, index) => {
    const location = objective.location;
    if (!location?.surface) return [];
    const key = `${location.bodyPath}/${location.surface.siteId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [index];
  });
}

/** Allows selecting only a destination in the current orbital family, without teleporting to another planet. */
export function getMissionLandingBody(
  mission: StarbaseMission,
  system: SolarSystem,
  parent: Planet,
  objectiveIndex?: number
): Planet | null {
  const location = getMissionLandingLocation(mission, objectiveIndex);
  if (!mission.systemAddress || !isMissionSystem(mission.systemAddress, system) || !location?.surface)
    return null;
  return getRecordedLandingBody(mission.systemAddress, location, system, parent);
}

/** Resolves a recorded habitat within the current orbital family for missions or scientific records. */
export function getRecordedLandingBody(
  address: MissionSystemAddress,
  location: MissionBodyLocation,
  system: SolarSystem,
  parent: Planet
): Planet | null {
  if (!isMissionSystem(address, system) || !location.surface) return null;
  const body = findSystemPlanetByPath(system, location.bodyPath);
  return body && [parent, ...parent.moons].includes(body) && body.name === location.bodyName ? body : null;
}
