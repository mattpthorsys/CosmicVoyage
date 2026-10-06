import type { SolarSystem } from '../entities/solar_system';
import { NavigationMarker } from '../entities/navigation_marker';
import { advanceInstallationAngle } from './infrastructure_registry';
import { getHeavyHaulObjective, type StarbaseMission } from './mission_board';
import { sameHaulAddress } from './heavy_haul_types';
import type { SystemOrbitSaveData } from './save_game';
import { systemAddress } from './system_orbit_state';

/** Adds the accepted package's orbital contacts after natural catch-up and registered infrastructure. */
export function materializeHaulSites(
  system: SolarSystem,
  mission: StarbaseMission | undefined,
  snapshot: SystemOrbitSaveData | undefined,
  bulkSeconds: number
): void {
  const markers = [...system.navigationMarkers.filter((marker) => marker.kind === 'navigation-buoy')];
  const objective = mission && getHeavyHaulObjective(mission);
  if (objective) {
    for (const [kind, endpoint] of [
      ['pickup', objective.pickup],
      ['deployment', objective.destination],
    ] as const) {
      if (!sameHaulAddress(systemAddress(system), endpoint.systemAddress)) continue;
      const saved = snapshot?.markers?.find((marker) => marker.id === endpoint.siteId);
      const delta = saved ? bulkSeconds - (snapshot?.lastAppliedBulkSeconds ?? 0) : bulkSeconds;
      if (delta < 0) throw new Error('Contract marker epoch exceeds voyage clock.');
      const angle = advanceInstallationAngle(
        system,
        { ...endpoint.orbit, angleRad: saved?.orbitAngle ?? endpoint.orbit.angleRad },
        delta
      );
      markers.push(
        new NavigationMarker(
          endpoint.siteId,
          `${objective.targetName} / ${kind.toUpperCase()}`,
          kind,
          endpoint.orbit.host,
          endpoint.orbit.radiusM,
          angle
        )
      );
    }
  }
  system.setInfrastructure(
    system.stations.filter((station) => station !== system.starbase),
    markers
  );
}
