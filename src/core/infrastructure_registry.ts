import { CONFIG } from '../config';
import { AU_IN_METERS, GRAVITATIONAL_CONSTANT_G } from '../constants/physics';
import { getStableOrbitRange, findUncrowdedStationOrbit } from '../entities/orbital_stability';
import { NavigationMarker } from '../entities/navigation_marker';
import { Starbase } from '../entities/starbase';
import type { SolarSystem } from '../entities/solar_system';
import { getHostLabel, type OrbitHost } from '../entities/stellar_body';
import { PRNG } from '../utils/prng';
import { advanceOrbitalAngle } from './simulation_time';
import { sameHaulAddress, type InfrastructureRecord, type HaulOrbitSpecification } from './heavy_haul_types';
import type { MissionSystemAddress } from './mission_board';
import { systemAddress } from './system_orbit_state';
import { findHaulHomeboundRoute } from './haul_navigation';
import type { ObservatoryDestination } from './observatory_types';

/** Resolves stable Kepler motion using the actual host mass, including inner pairs in triples. */
export function advanceInstallationAngle(
  system: SolarSystem,
  orbit: HaulOrbitSpecification,
  seconds: number
): number {
  const period = Math.sqrt(
    (4 * Math.PI ** 2 * orbit.radiusM ** 3) /
      (GRAVITATIONAL_CONSTANT_G * system.getOrbitHostMassKg(orbit.host))
  );
  return advanceOrbitalAngle(orbit.angleRad, seconds, period);
}

/** Requires a real stable host and clear radial space, without changing the proposed orbit. */
export function isClearInstallationOrbit(system: SolarSystem, orbit: HaulOrbitSpecification): boolean {
  const range = getStableOrbitRange(system.architecture, orbit.host);
  if (!range || orbit.radiusM < range.minRadius || orbit.radiusM > range.maxRadius) return false;
  const label = getHostLabel(orbit.host);
  const planets = system.planets.filter((body) => body && getHostLabel(body.orbitHost) === label);
  const clear = findUncrowdedStationOrbit(
    orbit.radiusM,
    range,
    planets.filter((body) => body !== null),
    system.getOrbitHostMassKg(orbit.host)
  );
  return (
    clear === orbit.radiusM &&
    system.stations.every(
      (station) =>
        getHostLabel(station.orbitHost) !== label ||
        Math.abs(station.orbitDistance - orbit.radiusM) > 0.08 * AU_IN_METERS
    )
  );
}

/** Finds a bounded, reproducible installation slot on a host's conservative stable orbit range. */
export function reserveInstallationOrbit(
  system: SolarSystem,
  preferredRadiusM: number,
  angleRad: number,
  excluded: readonly HaulOrbitSpecification[] = []
): HaulOrbitSpecification | null {
  const hosts: OrbitHost[] = [
    { kind: 'barycentric' },
    ...(system.architecture.kind === 'triple' ? [{ kind: 'circumbinary' } as const] : []),
    ...system.stars.map((star) => ({ kind: 'circumstellar', starId: star.id }) as OrbitHost),
  ];
  for (const host of hosts) {
    const range = getStableOrbitRange(system.architecture, host);
    if (!range) continue;
    for (let index = 0; index < 24; index++) {
      const radiusM = Math.max(range.minRadius * 1.1, preferredRadiusM * 1.22 ** index);
      const orbit = { host, radiusM, angleRad };
      if (
        radiusM > range.maxRadius ||
        excluded.some(
          (other) =>
            getHostLabel(other.host) === getHostLabel(host) &&
            Math.abs(other.radiusM - radiusM) < 0.08 * AU_IN_METERS
        )
      )
        continue;
      if (isClearInstallationOrbit(system, orbit)) return orbit;
    }
  }
  return null;
}

/** Owns player-world assets, keeping generated blueprints and their PRNG streams immutable. */
export class InfrastructureRegistry {
  private records: InfrastructureRecord[] = [];
  revision = 0;

  /** Restores records that have already passed the save boundary's cross-owner validation. */
  restore(records: readonly InfrastructureRecord[], legacyDestination?: ObservatoryDestination | null): void {
    this.records = structuredClone([...records]);
    const route = findHaulHomeboundRoute(this.records, legacyDestination);
    if (route && !this.records.some((asset) => asset.homeboundRoute)) {
      const latest = this.records.reduce<InfrastructureRecord | null>(
        (previous, asset) =>
          !sameHaulAddress(asset.systemAddress, route.systemAddress) &&
          (!previous || asset.commissionedAtSeconds >= previous.commissionedAtSeconds)
            ? asset
            : previous,
        null
      );
      if (latest) {
        // Save the recovered legacy issuer before another navigation choice replaces its only remaining mark.
        this.records = this.records.map((asset) =>
          asset === latest ? { ...asset, homeboundRoute: route } : asset
        );
      }
    }
    this.revision++;
  }

  /** Captures a detached ledger, never a live station instance or market inventory. */
  createSnapshot(): InfrastructureRecord[] {
    return structuredClone(this.records);
  }

  /** Returns registered assets at a full address for navigation and technology evidence. */
  at(address: MissionSystemAddress): readonly InfrastructureRecord[] {
    return this.records.filter((asset) => sameHaulAddress(asset.systemAddress, address));
  }

  /** Adds deployment overlays after natural orbital catch-up; pre-commissioning time is never applied. */
  materialize(system: SolarSystem, bulkSeconds: number): void {
    const stations: Starbase[] = [];
    const markers: NavigationMarker[] = [];
    for (const asset of this.at(systemAddress(system))) {
      const delta = bulkSeconds - asset.lastAppliedBulkSeconds;
      if (!Number.isFinite(delta) || delta < 0)
        throw new Error('Installation epoch exceeds the voyage clock.');
      const range = getStableOrbitRange(system.architecture, asset.orbit.host);
      if (!range || asset.orbit.radiusM < range.minRadius || asset.orbit.radiusM > range.maxRadius)
        throw new Error(`Installation ${asset.assetId} no longer has a stable host orbit.`);
      const orbit = { ...asset.orbit, angleRad: advanceInstallationAngle(system, asset.orbit, delta) };
      if (asset.kind === 'automated-depot') {
        stations.push(
          new Starbase(
            asset.assetId,
            new PRNG(`${CONFIG.GALAXY_MODEL_VERSION}:${asset.assetId}`),
            system.name,
            'automated-depot',
            null,
            orbit.radiusM,
            {
              id: asset.assetId,
              name: `${system.name} Logistics Depot ${asset.sourceMissionId.slice(-6)}`,
              orbit,
            }
          )
        );
      } else {
        markers.push(
          new NavigationMarker(
            asset.assetId,
            `${system.name} Navigation Buoy ${asset.sourceMissionId.slice(-6)}`,
            'navigation-buoy',
            orbit.host,
            orbit.radiusM,
            orbit.angleRad
          )
        );
      }
    }
    system.setInfrastructure(stations, markers);
  }

  /** Stores live overlay phases at the same bulk epoch as their natural host system. */
  capture(system: SolarSystem): void {
    this.records = this.records.map((asset) => {
      if (!sameHaulAddress(asset.systemAddress, systemAddress(system))) return asset;
      const entity =
        asset.kind === 'automated-depot'
          ? system.stations.find((station) => station.id === asset.assetId)
          : system.navigationMarkers.find((marker) => marker.id === asset.assetId);
      return entity
        ? {
            ...asset,
            orbit: { ...asset.orbit, angleRad: entity.orbitAngle },
            lastAppliedBulkSeconds: system.lastAppliedBulkSeconds,
          }
        : asset;
    });
  }
}
