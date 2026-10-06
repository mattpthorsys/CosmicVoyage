import type { SolarSystem } from '../entities/solar_system';
import type { MissionSystemAddress } from './mission_board';
import { getSystemPlanetPaths, type PlanetMutationSaveData, type SystemOrbitSaveData } from './save_game';
import { sameHaulAddress } from './heavy_haul_types';

export interface SystemOrbitHistoryRecord extends MissionSystemAddress {
  readonly orbit: SystemOrbitSaveData;
}

/** Stable key shared by orbital history and full-address journey queries. */
export function systemAddressKey(address: MissionSystemAddress): string {
  return `${address.worldX},${address.worldY},${address.systemSlot}`;
}

/** Converts the generated system's coordinates into a canonical world address. */
export function systemAddress(system: SolarSystem): MissionSystemAddress {
  return { worldX: system.starX, worldY: system.starY, systemSlot: system.systemSlot };
}

/** Captures phases separately from generator blueprints, including the applied bulk epoch. */
export function captureSystemOrbit(system: SolarSystem): SystemOrbitSaveData {
  return {
    lastAppliedBulkSeconds: system.lastAppliedBulkSeconds,
    markers: system.navigationMarkers
      .filter((marker) => marker.kind !== 'navigation-buoy')
      .map((marker) => ({ id: marker.id, orbitAngle: marker.orbitAngle })),
    stars: system.stars.map((star) => ({
      id: star.id,
      orbitAngle: star.orbit?.angle ?? null,
      systemX: star.systemX,
      systemY: star.systemY,
    })),
    starbase: system.starbase
      ? {
          orbitAngle: system.starbase.orbitAngle,
          systemX: system.starbase.systemX,
          systemY: system.starbase.systemY,
        }
      : null,
  };
}

/** Captures scientific/mining progress and body phases together at the system's actual bulk epoch. */
export function capturePlanetMutations(system: SolarSystem): PlanetMutationSaveData[] {
  return getSystemPlanetPaths(system).map(({ path, planet }) => ({
    ...systemAddress(system),
    lastAppliedBulkSeconds: system.lastAppliedBulkSeconds,
    bodyPath: path,
    orbitAngle: planet.orbitAngle,
    systemX: planet.systemX,
    systemY: planet.systemY,
    discovery: { ...planet.discovery },
    primaryResource: planet.primaryResource,
    minedLocations: [...planet.minedLocations],
    minedLocationAmounts: { ...planet.minedLocationAmounts },
  }));
}

/** Applies saved survey/mining state without advancing time or rebuilding terrain. */
export function restorePlanetProgress(
  system: SolarSystem,
  mutations: readonly PlanetMutationSaveData[]
): void {
  const local = new Map(
    mutations
      .filter((entry) => sameHaulAddress(entry, systemAddress(system)))
      .map((entry) => [entry.bodyPath, entry])
  );
  for (const { path, planet } of getSystemPlanetPaths(system)) {
    const mutation = local.get(path);
    if (!mutation) continue;
    planet.discovery = { ...mutation.discovery };
    planet.primaryResource = mutation.primaryResource;
    planet.minedLocations = new Set(mutation.minedLocations);
    planet.minedLocationAmounts = { ...mutation.minedLocationAmounts };
  }
}

/** Restores local phases and applies only missing voyage time; never iterates through simulated days. */
export function restoreSystemOrbits(
  system: SolarSystem,
  snapshot: SystemOrbitSaveData | undefined,
  mutations: readonly PlanetMutationSaveData[],
  bulkAdvanceSeconds: number
): void {
  const address = systemAddress(system);
  const localMutations = new Map(
    mutations.filter((entry) => sameHaulAddress(entry, address)).map((entry) => [entry.bodyPath, entry])
  );
  const stellarSeconds = bulkAdvanceSeconds - (snapshot?.lastAppliedBulkSeconds ?? 0);
  const entries = getSystemPlanetPaths(system);
  const bodySeconds = new Map(
    entries.map(({ path, planet }) => [
      planet,
      bulkAdvanceSeconds - (localMutations.get(path)?.lastAppliedBulkSeconds ?? 0),
    ])
  );
  if (
    [bulkAdvanceSeconds, stellarSeconds, ...bodySeconds.values()].some(
      (seconds) => !Number.isFinite(seconds) || seconds < 0
    )
  )
    throw new Error('System orbital epoch exceeds the current bulk clock.');
  if (snapshot) {
    for (const saved of snapshot.stars) {
      const star = system.stars.find((candidate) => candidate.id === saved.id);
      if (!star) continue;
      if (star.orbit && saved.orbitAngle !== null) star.orbit.angle = saved.orbitAngle;
      star.systemX = saved.systemX;
      star.systemY = saved.systemY;
    }
    if (system.starbase && snapshot.starbase) Object.assign(system.starbase, snapshot.starbase);
  }
  for (const { path, planet } of entries) {
    const saved = localMutations.get(path);
    if (saved) {
      planet.orbitAngle = saved.orbitAngle;
      planet.systemX = saved.systemX;
      planet.systemY = saved.systemY;
    }
  }
  // Preserve exact saved coordinates when there is no catch-up; otherwise rebuild all host-relative positions.
  if (stellarSeconds > 0 || [...bodySeconds.values()].some((seconds) => seconds > 0))
    system.advanceOrbitsBySimulatedSeconds(stellarSeconds, bodySeconds);
  system.lastAppliedBulkSeconds = bulkAdvanceSeconds;
}
