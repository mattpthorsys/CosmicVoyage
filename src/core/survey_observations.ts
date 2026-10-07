import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import type { StellarBody } from '../entities/stellar_body';
import { getSystemPlanetPaths } from './save_game';
import { hasDiscoveryLevel, type DiscoveryLevel } from './discovery';
import { systemAddress } from './system_orbit_state';
import type { SurveyDataService } from './survey_data_service';
import type { SurveyMethod, SurveyTarget, SurveyTier } from './survey_data_types';

/** Publishes real local discovery updates without confusing remote spectra with an in-system survey. */
export function recordLocalSurvey(
  service: SurveyDataService,
  target: Planet | SolarSystem | StellarBody,
  system: SolarSystem,
  level: DiscoveryLevel,
  seconds: number
): void {
  const address = systemAddress(system);
  if (target instanceof Planet) {
    if (!hasDiscoveryLevel(level, 'surveyed') || !target.discovery.observations) return;
    const path = getSystemPlanetPaths(system).find((entry) => entry.planet === target)?.path;
    if (!path) return;
    const method = target.discovery.lastMethod;
    if (!['local-scan', 'orbital-survey', 'surface-map', 'sample-analysis'].includes(method)) return;
    const tier: SurveyTier = hasDiscoveryLevel(level, 'sampled')
      ? 3
      : hasDiscoveryLevel(level, 'mapped')
        ? 2
        : 1;
    service.record(
      address,
      path as SurveyTarget,
      `${system.name} / ${target.name}`,
      tier,
      method as SurveyMethod,
      seconds
    );
  } else if (hasDiscoveryLevel(level, 'observed')) {
    if (target instanceof SolarSystem) {
      if (target !== system) return;
      service.record(address, 'system', system.name, 1, 'local-scan', seconds);
    } else {
      const identity: SurveyTarget = system.stars.length > 1 ? `star:${target.id}` : 'stars';
      service.record(address, identity, `${system.name} / star ${target.id}`, 3, 'local-scan', seconds);
    }
  }
}
