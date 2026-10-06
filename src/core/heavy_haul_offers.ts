import { CONFIG } from '../config';
import { AU_IN_METERS } from '../constants/physics';
import type { SolarSystem } from '../entities/solar_system';
import type { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { getHostLabel } from '../entities/stellar_body';
import { reserveInstallationOrbit, type InfrastructureRegistry } from './infrastructure_registry';
import type { HaulJourneyWorld } from './heavy_haul_journey';
import { sameHaulAddress, type HeavyHaulObjective } from './heavy_haul_types';
import { getHeavyHaulObjective, type StarbaseMission } from './mission_board';
import { createDefaultShipModifications } from './ship_modifications';
import { systemAddress } from './system_orbit_state';
import { quoteHeavyHaul } from './tow_performance';

/** Produces bounded, stable jobs; ship upgrades and board reopening never reroll terms or escrow. */
export class HeavyHaulOffers {
  private readonly cache = new Map<string, readonly StarbaseMission[]>();

  /** Uses fresh natural worlds; deployment overlays and the gameplay PRNG never enter offer generation. */
  constructor(
    private readonly seed: string,
    private readonly world: HaulJourneyWorld
  ) {}

  /** Lists unretired offers at staffed ports, leaving accepted canonical contracts to MissionProgress. */
  list(
    system: SolarSystem,
    station: Starbase,
    retired: readonly string[],
    completed: readonly string[],
    infrastructure?: InfrastructureRegistry
  ): StarbaseMission[] {
    if (station.kind === 'automated-depot' || !station.capabilities.missions) return [];
    let offers = this.cache.get(station.id);
    if (!offers) {
      offers = this.generate(system, station);
      this.cache.set(station.id, offers);
      if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    }
    const unavailable = new Set([...retired, ...completed]);
    return structuredClone(
      offers.filter((mission) => {
        if (unavailable.has(mission.id)) return false;
        const objective = getHeavyHaulObjective(mission)!;
        return [objective.pickup, objective.destination].every(
          (endpoint) =>
            !(infrastructure?.at(endpoint.systemAddress) ?? []).some(
              (asset) =>
                getHostLabel(asset.orbit.host) === getHostLabel(endpoint.orbit.host) &&
                Math.abs(asset.orbit.radiusM - endpoint.orbit.radiusM) <= 0.08 * AU_IN_METERS
            )
        );
      })
    );
  }

  /** Guarantees a starter-sized local job where safe geometry exists, then attempts two frontier routes. */
  private generate(local: SolarSystem, station: Starbase): StarbaseMission[] {
    const source = this.world.createSystem(systemAddress(local));
    if (!source || !source.stations.some((entry) => entry.id === station.id && entry.capabilities.fuel))
      return [];
    const rng = new PRNG(`${this.seed}:haul-offers:v1:${station.id}`);
    const pickup = reserveInstallationOrbit(source, AU_IN_METERS * 0.7, rng.random() * 2 * Math.PI);
    if (!pickup) return [];
    const offers: StarbaseMission[] = [];
    const localOrbit = reserveInstallationOrbit(
      source,
      pickup.radiusM * 1.14,
      (pickup.angleRad + 0.3) % (2 * Math.PI),
      [pickup]
    );
    if (localOrbit) {
      const mission = this.build(source, station, source, pickup, localOrbit, 0);
      if (mission) offers.push(mission);
    }
    const seen = new Set<string>();
    // A fixed candidate budget bounds board latency even in sparse regions; no nearest-world global search.
    for (
      let attempt = 0;
      attempt < 12 &&
      offers.filter((mission) => getHeavyHaulObjective(mission)?.route.kind === 'interstellar').length < 2;
      attempt++
    ) {
      const angle = rng.random() * 2 * Math.PI;
      const radius = rng.randomInt(16, 42);
      const address = {
        worldX: source.starX + Math.round(Math.cos(angle) * radius),
        worldY: source.starY + Math.round(Math.sin(angle) * radius),
        systemSlot: 0,
      };
      const key = `${address.worldX},${address.worldY}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const destination = this.world.createSystem(address);
      if (!destination || destination.isStarless || !sameHaulAddress(address, systemAddress(destination)))
        continue;
      const index = offers.some((mission) => getHeavyHaulObjective(mission)?.route.kind === 'interstellar')
        ? 2
        : 1;
      if (index === 2 && destination.stations.length) continue;
      const orbit = reserveInstallationOrbit(destination, AU_IN_METERS, rng.random() * 2 * Math.PI);
      if (!orbit) continue;
      const mission = this.build(source, station, destination, pickup, orbit, index);
      if (mission) offers.push(mission);
    }
    return offers;
  }

  /** Certifies support and return fuel with conservative reference equipment, independently of the player's fit. */
  private build(
    source: SolarSystem,
    station: Starbase,
    destination: SolarSystem,
    pickup: HeavyHaulObjective['pickup']['orbit'],
    deployment: HeavyHaulObjective['destination']['orbit'],
    index: number
  ): StarbaseMission | null {
    const local = index === 0;
    const depot = index === 2;
    const id = `haul-v1:${station.id}:${index}`;
    const distanceLy =
      Math.hypot(source.starX - destination.starX, source.starY - destination.starY) *
      CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
    const pickupCenter = source.getOrbitCenter(pickup.host);
    const deploymentCenter = destination.getOrbitCenter(deployment.host);
    const localDistanceM = Math.hypot(
      pickupCenter.x +
        Math.cos(pickup.angleRad) * pickup.radiusM -
        deploymentCenter.x -
        Math.cos(deployment.angleRad) * deployment.radiusM,
      pickupCenter.y +
        Math.sin(pickup.angleRad) * pickup.radiusM -
        deploymentCenter.y -
        Math.sin(deployment.angleRad) * deployment.radiusM
    );
    const objective: HeavyHaulObjective = {
      id: `${id}:commission`,
      kind: 'haul',
      targetName: depot ? 'Automated Logistics Depot' : 'Navigation Buoy',
      targetLabel: 'Rendezvous, couple, transfer and commission',
      pickup: {
        systemAddress: systemAddress(source),
        systemName: source.name,
        siteId: `${id}:pickup`,
        orbit: pickup,
      },
      destination: {
        systemAddress: systemAddress(destination),
        systemName: destination.name,
        siteId: `${id}:deployment`,
        orbit: deployment,
      },
      resupply: { systemAddress: systemAddress(source), stationId: station.id },
      package: {
        id: `${id}:package`,
        installationKind: depot ? 'automated-depot' : 'navigation-buoy',
        dryMassKg: local ? 2400 : depot ? 64000 : 10000,
        wetMassKg: local ? 3000 : depot ? 80000 : 12500,
        sizeClass: local ? 'compact' : 'module',
        supportFuelCapacityUnits: 1e9,
        commissioningFuelAllowanceUnits: depot ? 500 : 0,
        minimumEngineClass: depot ? 2 : 1,
        minimumCouplerClass: depot ? 2 : 1,
      },
      route: local ? { kind: 'local', distanceM: localDistanceM } : { kind: 'interstellar' },
    };
    const ship = createDefaultShipModifications();
    ship.engineClass = objective.package.minimumEngineClass;
    ship.towCouplerClass = objective.package.minimumCouplerClass;
    ship.hypersleepClass = 2;
    ship.specialBaysOccupied = 2;
    const context = {
      ship,
      crew: [],
      normalFuelUnits: 500,
      maximumNormalFuelUnits: 500,
      onward: {
        verified: true,
        resupplyStationId: station.id,
        distanceLy,
        commissioningFuelUnits: depot ? 500 : 0,
      },
    };
    const quote = quoteHeavyHaul(objective, context);
    if (!quote.ok) return null;
    // Support is budgeted for a conservative uncrewed reference, never sold or debited from normal fuel.
    const funded = {
      ...objective,
      package: {
        ...objective.package,
        supportFuelCapacityUnits: Math.ceil(quote.quote.requiredSupportFuelUnits * 1.15),
      },
    };
    return {
      id,
      type: 'heavy-haul',
      title: local
        ? 'Local navigation buoy transfer'
        : depot
          ? 'Frontier depot commissioning'
          : 'Frontier navigation buoy',
      issuer: 'Infrastructure Logistics',
      originStarbaseId: station.id,
      originStarbaseName: station.name,
      systemName: destination.name,
      systemAddress: systemAddress(destination),
      summary: `${local ? 'Local' : `${distanceLy.toFixed(0)} ly`} / ${(funded.package.wetMassKg / 1000).toFixed(1)} t external tow`,
      detail:
        'Contractor propulsion support included. Escrow releases on commissioning; no return to issuer required. Recovery forfeits payment and retires this offer.',
      rewardCredits: local ? 1600 : Math.round((depot ? 4600 : 2800) + Math.min(1200, distanceLy * 20)),
      risk: local ? 'Low' : 'Med',
      objectives: [funded],
    };
  }
}
