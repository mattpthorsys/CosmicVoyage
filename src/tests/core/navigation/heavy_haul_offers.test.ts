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
import { CONFIG } from '../../../config';
import { sameHaulAddress } from '../../../core/heavy_haul_types';
import { getStationMissionProfile } from '../../../core/station_mission_offers';

const hubAddress = {
  worldX: CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X,
  worldY: CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y,
  systemSlot: 0,
};

/** Supplies real deterministic host systems and one staffed fixture port, without terrain preparation. */
function offersFixture(sourceAddress = hubAddress) {
  const world = {
    createSystem: vi.fn((address: MissionSystemAddress) => {
      const system = haulSystemFixture(address, null, sameHaulAddress(address, sourceAddress));
      if (system.starbase)
        Object.assign(system.starbase, {
          kind: 'starbase',
          capabilities: { ...system.starbase.capabilities, missions: true },
        });
      return system;
    }),
  };
  const system = world.createSystem(sourceAddress);
  return { world, system, station: system.starbase! };
}

describe('stable production haul offers', () => {
  it('finds sparse catalogue contacts without generating a world at every empty coordinate', () => {
    const { world, system, station } = offersFixture();
    let probes = 0;
    const hasStellarSystem = vi.fn(() => ++probes % 40 === 0);
    const offers = new HeavyHaulOffers('sparse-catalogue', { ...world, hasStellarSystem }).list(
      system,
      station,
      [],
      []
    );
    expect(offers).toHaveLength(3);
    expect(offers.every((mission) => mission.summary.length <= 22)).toBe(true);
    expect(hasStellarSystem.mock.calls.length).toBeGreaterThanOrEqual(80);
    expect(hasStellarSystem.mock.calls.length).toBeLessThanOrEqual(1024);
    expect(world.createSystem.mock.calls.length).toBeLessThanOrEqual(26);
  });

  it('bounds lightweight queries as well as materialization in completely empty regions', () => {
    const { world, system, station } = offersFixture();
    const hasStellarSystem = vi.fn(() => false);
    expect(
      new HeavyHaulOffers('empty-catalogue', { ...world, hasStellarSystem }).list(system, station, [], [])
    ).toHaveLength(1);
    expect(hasStellarSystem.mock.calls.length).toBeLessThanOrEqual(1024);
    expect(world.createSystem.mock.calls.length).toBe(2);
  });

  it('offers one achievable local job and bounded frontier jobs without rerolling on reopen', () => {
    const { world, system, station } = offersFixture();
    const service = new HeavyHaulOffers('offers-test', world);
    const offers = service.list(system, station, [], []);
    expect(offers).toHaveLength(3);
    expect(world.createSystem.mock.calls.length).toBeLessThanOrEqual(26);
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
      sameHaulAddress(address, hubAddress) ? haulSystemFixture(address, null, true) : null
    );
    expect(
      new HeavyHaulOffers('empty-neighbourhood', { createSystem }).list(system, station, [], [])
    ).toHaveLength(1);
    expect(createSystem.mock.calls.length).toBeLessThanOrEqual(25);
    const depot = haulSystemFixture({ worldX: 0, worldY: 0, systemSlot: 0 });
    expect(new HeavyHaulOffers('depot', { createSystem }).list(depot, depot.starbase!, [], [])).toEqual([]);
  });

  it('offers real long-distance routes, different installation types and funded return capability', () => {
    const { world, system, station } = offersFixture();
    const offers = new HeavyHaulOffers('long-hauls', world).list(system, station, [], []);
    const objectives = offers.map((mission) => getHeavyHaulObjective(mission)!);
    expect(new Set(objectives.map((objective) => objective.package.installationKind)).size).toBe(2);
    const remote = objectives.filter((objective) => objective.route.kind === 'interstellar');
    expect(remote).toHaveLength(2);
    expect(
      Math.max(
        ...remote.map(
          (objective) =>
            Math.hypot(
              objective.pickup.systemAddress.worldX - objective.destination.systemAddress.worldX,
              objective.pickup.systemAddress.worldY - objective.destination.systemAddress.worldY
            ) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS
        )
      )
    ).toBeGreaterThan(440);
    for (const objective of remote) {
      const ship = createDefaultShipModifications();
      ship.engineClass = objective.package.minimumEngineClass;
      ship.towCouplerClass = objective.package.minimumCouplerClass;
      ship.hypersleepClass = 1;
      ship.specialBaysOccupied = 2;
      const distanceLy =
        Math.hypot(
          objective.pickup.systemAddress.worldX - objective.destination.systemAddress.worldX,
          objective.pickup.systemAddress.worldY - objective.destination.systemAddress.worldY
        ) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
      const quote = quoteHeavyHaul(objective, {
        ship,
        crew: createStartingCrew('long-hauls'),
        normalFuelUnits: 500,
        maximumNormalFuelUnits: 500,
        onward: {
          verified: true,
          resupplyStationId: station.id,
          distanceLy,
          commissioningFuelUnits: objective.package.commissioningFuelAllowanceUnits,
        },
      });
      expect(quote.ok).toBe(true);
      expect(quote.quote!.onwardFuelRequiredUnits).toBeLessThan(500);
      expect(objective.package.supportFuelCapacityUnits).toBeGreaterThan(
        quote.quote!.requiredSupportFuelUnits
      );
      expect(objective.resupply?.stationId).toBe(station.id);
    }
  });

  it('varies workloads between ports rather than guaranteeing three buoy jobs everywhere', () => {
    const workloads = Array.from({ length: 8 }, (_, index) => {
      const { world, system, station } = offersFixture({
        worldX: 300 + index * 40,
        worldY: 20,
        systemSlot: 0,
      });
      const offers = new HeavyHaulOffers('different-ports', world).list(system, station, [], []);
      expect(offers.length).toBeLessThanOrEqual(
        getStationMissionProfile('different-ports', station.id, {
          worldX: system.starX,
          worldY: system.starY,
          systemSlot: 0,
        }).heavyHaul
      );
      return offers.map((mission) => ({
        title: mission.title,
        mass: getHeavyHaulObjective(mission)!.package.wetMassKg,
      }));
    });
    expect(new Set(workloads.map((jobs) => JSON.stringify(jobs))).size).toBeGreaterThan(1);
    expect(
      workloads.some((jobs) => !jobs.some((job) => job.title === 'Local navigation buoy transfer'))
    ).toBe(true);
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

  it('routes a settled haul home and approaches only its issuing station in the actual source system', () => {
    const mission = heavyHaulMissionFixture('heavy');
    const objective = getHeavyHaulObjective(mission)!;
    const away = resolveHaulNavigation(
      mission.id,
      objective,
      'complete',
      objective.destination.systemAddress,
      'issuer-port'
    );
    expect(away.endpoint).toBe(objective.pickup);
    expect(away.localSiteId).toBeNull();
    expect(
      resolveHaulNavigation(mission.id, objective, 'complete', objective.pickup.systemAddress, 'issuer-port')
        .localSiteId
    ).toBe('issuer-port');
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
