import { describe, expect, it } from 'vitest';
import { AU_IN_METERS } from '../../../constants/physics';
import {
  InfrastructureRegistry,
  reserveInstallationOrbit,
  advanceInstallationAngle,
} from '../../../core/infrastructure_registry';
import type { InfrastructureRecord } from '../../../core/heavy_haul_types';
import { captureSystemOrbit, restoreSystemOrbits, systemAddress } from '../../../core/system_orbit_state';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';

/** Reserves an actual host-safe installation ring, independent of generated planets or markets. */
function assetFixture(kind: InfrastructureRecord['kind'] = 'automated-depot'): InfrastructureRecord {
  const system = haulSystemFixture({ worldX: 0, worldY: 0, systemSlot: 0 });
  const orbit = reserveInstallationOrbit(system, AU_IN_METERS, 0.7);
  if (!orbit) throw new Error('Fixture system has no installation slot.');
  return {
    assetId: 'haul-installation:registry-test',
    sourceMissionId: 'registry-test',
    kind,
    systemAddress: systemAddress(system),
    systemName: system.name,
    orbit,
    commissionedAtSeconds: 1000,
    lastAppliedBulkSeconds: 1000,
    commissioningFuelRemainingUnits: kind === 'automated-depot' ? 100 : 0,
  };
}

describe('delivered infrastructure overlays', () => {
  it('preserves the natural station and generator bodies, expands bounds and retains deployed identity', () => {
    const asset = assetFixture();
    const registry = new InfrastructureRegistry();
    registry.restore([asset]);
    const system = haulSystemFixture(asset.systemAddress);
    const natural = system.starbase;
    const planets = system.planets.map((body) => body?.name);
    registry.materialize(system, 1000);
    expect(system.starbase).toBe(natural);
    expect(system.stations.map((station) => station.id)).toEqual([natural!.id, asset.assetId]);
    expect(system.stations[1].orbitDistance).toBe(asset.orbit.radiusM);
    expect(system.planets.map((body) => body?.name)).toEqual(planets);
    expect(system.edgeRadius).toBeGreaterThan(asset.orbit.radiusM);
    registry.capture(system);
    const restored = new InfrastructureRegistry();
    restored.restore(registry.createSnapshot());
    const fresh = haulSystemFixture(asset.systemAddress);
    restored.materialize(fresh, 1000);
    expect(fresh.stations[1].id).toBe(asset.assetId);
    expect(fresh.stations[1].systemX).toBe(system.stations[1].systemX);
  });

  it('adds only time since commissioning and never catches an installation up twice', () => {
    const asset = assetFixture('navigation-buoy');
    const registry = new InfrastructureRegistry();
    registry.restore([asset]);
    const system = haulSystemFixture(asset.systemAddress);
    restoreSystemOrbits(system, undefined, [], 2000);
    registry.materialize(system, 2000);
    expect(system.navigationMarkers[0].orbitAngle).toBe(advanceInstallationAngle(system, asset.orbit, 1000));
    registry.capture(system);
    const orbit = captureSystemOrbit(system);
    const fresh = haulSystemFixture(asset.systemAddress);
    restoreSystemOrbits(fresh, orbit, [], 2000);
    registry.materialize(fresh, 2000);
    expect(fresh.navigationMarkers[0].orbitAngle).toBe(system.navigationMarkers[0].orbitAngle);
    expect(
      fresh.getScannableObjectNear(fresh.navigationMarkers[0].systemX, fresh.navigationMarkers[0].systemY)
    ).toBe(fresh.navigationMarkers[0]);
  });

  it('does not overlay assets in a different complete system address', () => {
    const asset = assetFixture();
    const registry = new InfrastructureRegistry();
    registry.restore([asset]);
    const system = haulSystemFixture({ ...asset.systemAddress, worldX: 1 });
    registry.materialize(system, 1000);
    expect(system.stations).toHaveLength(0);
    expect(system.navigationMarkers).toHaveLength(0);
  });
});
