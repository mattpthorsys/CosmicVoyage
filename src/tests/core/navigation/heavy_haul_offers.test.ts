import { describe, expect, it, vi } from 'vitest';
import { HeavyHaulOffers } from '../../../core/heavy_haul_offers';
import { getHeavyHaulObjective } from '../../../core/mission_board';
import { quoteHeavyHaul } from '../../../core/tow_performance';
import { createDefaultShipModifications } from '../../../core/ship_modifications';
import { createStartingCrew } from '../../../core/crew';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';
import type { MissionSystemAddress } from '../../../core/mission_board';
import { resolveHaulNavigation } from '../../../core/haul_navigation';
import { heavyHaulMissionFixture } from '../../fixtures/heavy_haul_contracts';
import { materializeHaulSites } from '../../../core/haul_sites';
import { captureSystemOrbit, restoreSystemOrbits } from '../../../core/system_orbit_state';
import { InfrastructureRegistry } from '../../../core/infrastructure_registry';

/** Supplies real deterministic host systems and one staffed fixture port, without terrain preparation. */
function offersFixture() {
  const world = {
    createSystem: vi.fn((address: MissionSystemAddress) => {
      const system = haulSystemFixture(address);
      if (system.starbase)
        Object.assign(system.starbase, {
          kind: 'starbase',
          capabilities: { ...system.starbase.capabilities, missions: true },
        });
      return system;
    }),
  };
  const system = world.createSystem({ worldX: 0, worldY: 0, systemSlot: 0 });
  return { world, system, station: system.starbase! };
}

describe('stable production haul offers', () => {
  it('offers one achievable local job and bounded frontier jobs without rerolling on reopen', () => {
    const { world, system, station } = offersFixture();
    const service = new HeavyHaulOffers('offers-test', world);
    const offers = service.list(system, station, [], []);
    expect(offers).toHaveLength(3);
    expect(world.createSystem.mock.calls.length).toBeLessThanOrEqual(14);
    const local = offers.find((mission) => getHeavyHaulObjective(mission)?.route.kind === 'local')!;
    const ship = createDefaultShipModifications();
    ship.towCouplerClass = 1;
    const quote = quoteHeavyHaul(getHeavyHaulObjective(local)!, {
      ship,
      crew: createStartingCrew('offers-test'),
      normalFuelUnits: 500,
      maximumNormalFuelUnits: 500,
      onward: { verified: true, resupplyStationId: station.id, distanceLy: 0, commissioningFuelUnits: 0 },
    });
    expect(quote.ok).toBe(true);
    expect(quote.quote?.requiredBerths).toBe(0);
    const queries = world.createSystem.mock.calls.length;
    expect(service.list(system, station, [], [])).toEqual(offers);
    expect(world.createSystem.mock.calls.length).toBe(queries);
    expect(new HeavyHaulOffers('offers-test', world).list(system, station, [], [])).toEqual(offers);
    expect(
      service.list(system, station, [offers[0].id], [offers[1].id]).map((mission) => mission.id)
    ).toEqual([offers[2].id]);
  });

  it('bounds searches when no remote stellar endpoints exist and never enables depot mission offices', () => {
    const { system, station } = offersFixture();
    const createSystem = vi.fn((address: MissionSystemAddress) =>
      address.worldX === 0 && address.worldY === 0 ? haulSystemFixture(address) : null
    );
    expect(
      new HeavyHaulOffers('empty-neighbourhood', { createSystem }).list(system, station, [], [])
    ).toHaveLength(1);
    expect(createSystem.mock.calls.length).toBeLessThanOrEqual(13);
    const depot = haulSystemFixture({ worldX: 0, worldY: 0, systemSlot: 0 });
    expect(new HeavyHaulOffers('depot', { createSystem }).list(depot, depot.starbase!, [], [])).toEqual([]);
  });

  it('filters occupied deployment rings without changing the remaining offers or rerolling terms', () => {
    const { world, system, station } = offersFixture();
    const service = new HeavyHaulOffers('occupied-offers', world);
    const offers = service.list(system, station, [], []);
    const objective = getHeavyHaulObjective(offers[1])!;
    const registry = new InfrastructureRegistry();
    registry.restore([
      {
        assetId: 'haul-installation:previous-delivery',
        sourceMissionId: 'previous-delivery',
        kind: 'navigation-buoy',
        systemAddress: objective.destination.systemAddress,
        systemName: objective.destination.systemName,
        orbit: objective.destination.orbit,
        commissionedAtSeconds: 0,
        lastAppliedBulkSeconds: 0,
        commissioningFuelRemainingUnits: 0,
      },
    ]);
    const queries = world.createSystem.mock.calls.length;
    expect(service.list(system, station, [], [], registry)).toEqual([offers[0], offers[2]]);
    expect(world.createSystem.mock.calls.length).toBe(queries);
    expect(service.list(system, station, [], [])).toEqual(offers);
  });
});

describe('phase-aware haul navigation', () => {
  it('never selects a remote or wrong-slot endpoint as a local contact', () => {
    const mission = heavyHaulMissionFixture('heavy');
    const objective = getHeavyHaulObjective(mission)!;
    expect(
      resolveHaulNavigation(mission.id, objective, 'arrived', objective.pickup.systemAddress).localSiteId
    ).toBeNull();
    expect(
      resolveHaulNavigation(mission.id, objective, 'arrived', {
        ...objective.destination.systemAddress,
        systemSlot: 1,
      }).localSiteId
    ).toBeNull();
    expect(
      resolveHaulNavigation(mission.id, objective, 'arrived', objective.destination.systemAddress).localSiteId
    ).toBe(objective.destination.siteId);
    expect(
      resolveHaulNavigation(mission.id, objective, 'attached', objective.pickup.systemAddress).localSiteId
    ).toBe(`${mission.id}:departure`);
  });

  it('restores moving site phases and provides a non-orbiting departure waypoint beyond the boundary', () => {
    const mission = heavyHaulMissionFixture('heavy');
    const objective = getHeavyHaulObjective(mission)!;
    const system = haulSystemFixture(objective.pickup.systemAddress);
    materializeHaulSites(system, mission, undefined, 0, 'attached');
    const departure = system.navigationMarkers.find((marker) => marker.kind === 'departure')!;
    expect(system.isAtEdge(departure.systemX, departure.systemY)).toBe(true);
    const position = { x: departure.systemX, y: departure.systemY };
    system.advanceOrbitsBySimulatedSeconds(6000);
    expect({ x: departure.systemX, y: departure.systemY }).toEqual(position);
    const snapshot = captureSystemOrbit(system);
    expect(snapshot.markers).toHaveLength(1);
    const fresh = haulSystemFixture(objective.pickup.systemAddress);
    restoreSystemOrbits(fresh, snapshot, [], 0);
    materializeHaulSites(fresh, mission, snapshot, 0, 'attached');
    expect(fresh.navigationMarkers.find((marker) => marker.kind === 'pickup')?.orbitAngle).toBe(
      system.navigationMarkers.find((marker) => marker.kind === 'pickup')?.orbitAngle
    );
  });
});
