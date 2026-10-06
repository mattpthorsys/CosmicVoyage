import { describe, expect, it, vi } from 'vitest';
import { AU_IN_METERS } from '../../../constants/physics';
import {
  InfrastructureRegistry,
  reserveInstallationOrbit,
  advanceInstallationAngle,
} from '../../../core/infrastructure_registry';
import type { InfrastructureRecord } from '../../../core/heavy_haul_types';
import { captureSystemOrbit, restoreSystemOrbits, systemAddress } from '../../../core/system_orbit_state';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';
import type { StellarArchitecture, StellarBody } from '../../../entities/stellar_body';
import { GameStateManager } from '../../../core/game_state_manager';
import { Player } from '../../../core/player';
import { SystemDataGenerator } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';

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
  it('materializes deployed station identities before resolving a docked save location', () => {
    const asset = assetFixture();
    const seed = new PRNG('haul-journey-fixture');
    const generator = new SystemDataGenerator(seed);
    const mock = vi.spyOn(generator, 'getNavigableSystemProperties').mockReturnValue({
      exists: true,
      starType: 'G',
      name: asset.systemName,
      hasStarbase: true,
      stationKind: 'automated-depot',
      ageGyr: 5,
      metallicityFeH: 0,
      architecture: null,
      objectKind: 'stellar',
      systemSlot: 0,
    });
    const registry = new InfrastructureRegistry();
    registry.restore([asset]);
    const manager = new GameStateManager(new Player(0, 0, '@', 'haul-journey-fixture'), seed, generator);
    manager.setSystemInitializer((system) => {
      restoreSystemOrbits(system, undefined, [], 1000);
      registry.materialize(system, 1000);
    });
    try {
      const system = manager.restoreLocation({
        kind: 'starbase',
        ...asset.systemAddress,
        stationId: asset.assetId,
        starbaseName: 'Delivered depot',
      });
      expect(manager.currentStarbase?.id).toBe(asset.assetId);
      expect(system?.stations).toHaveLength(2);
      registry.materialize(system!, 1000);
      manager.reconcileDockedStation();
      expect(manager.currentStarbase).toBe(system!.stations.find((station) => station.id === asset.assetId));
    } finally {
      manager.destroy();
      mock.mockRestore();
    }
  });
  it('preserves the natural station and generator bodies, expands bounds and retains deployed identity', () => {
    const asset = assetFixture();
    const registry = new InfrastructureRegistry();
    registry.restore([asset]);
    const system = haulSystemFixture(asset.systemAddress);
    const natural = system.starbase;
    const planets = system.planets.map((body) => body?.name);
    restoreSystemOrbits(system, undefined, [], 1000);
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
    restoreSystemOrbits(fresh, undefined, [], 1000);
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

  it.each(['binary', 'triple'] as const)(
    'keeps deployed %s installations relative to the specified moving host',
    (kind) => {
      const asset = assetFixture();
      const template = haulSystemFixture(asset.systemAddress);
      const stars: StellarBody[] = ['A', 'B', ...(kind === 'triple' ? ['C'] : [])].map((id) => ({
        ...structuredClone(template.stars[0]),
        id: id as StellarBody['id'],
        name: `Host ${id}`,
        orbit: id === 'A' ? null : { center: 'barycenter', radius: 0, angle: 0, periodSeconds: 0 },
      }));
      const architecture: StellarArchitecture = {
        ...template.architecture,
        kind,
        stars,
        binarySeparation: 40 * AU_IN_METERS,
        outerSeparation: kind === 'triple' ? 500 * AU_IN_METERS : 0,
      };
      const hosted = {
        ...asset,
        orbit: {
          host: { kind: 'circumstellar' as const, starId: 'B' as const },
          radiusM: 2 * AU_IN_METERS,
          angleRad: 0.7,
        },
      };
      const system = haulSystemFixture(asset.systemAddress, architecture);
      const before = JSON.stringify(architecture);
      restoreSystemOrbits(system, undefined, [], 1600);
      const registry = new InfrastructureRegistry();
      registry.restore([hosted]);
      registry.materialize(system, 1600);
      const station = system.stations.find((entry) => entry.id === asset.assetId)!;
      const center = system.getOrbitCenter(hosted.orbit.host);
      expect(Math.hypot(station.systemX - center.x, station.systemY - center.y)).toBeCloseTo(
        hosted.orbit.radiusM,
        0
      );
      expect(station.orbitAngle).toBe(advanceInstallationAngle(system, hosted.orbit, 600));
      expect(JSON.stringify(architecture)).toBe(before);
    }
  );
});
