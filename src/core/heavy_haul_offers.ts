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
import { getStationMissionProfile } from './station_mission_offers';

export interface HaulOfferWorld extends HaulJourneyWorld {
  /** Optional cheap catalogue query; only promising contacts need a complete planetary system. */
  hasStellarSystem?(address: HeavyHaulObjective['pickup']['systemAddress']): boolean;
}

interface HaulOfferSpec {
  readonly slot: number;
  readonly title: string;
  readonly targetName: string;
  readonly depot: boolean;
  readonly wetMassKg: number;
  readonly engineClass: number;
  readonly minimumDistanceLy: number;
  readonly maximumDistanceLy: number;
  readonly baseReward: number;
}

/** Produces bounded, stable jobs; ship upgrades and board reopening never reroll terms or escrow. */
export class HeavyHaulOffers {
  private readonly cache = new Map<string, readonly StarbaseMission[]>();

  /** Uses fresh natural worlds; deployment overlays and the gameplay PRNG never enter offer generation. */
  constructor(
    private readonly seed: string,
    private readonly world: HaulOfferWorld
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

  /** Gives ports distinct logistics workloads while guaranteeing a small tow at the starting hub. */
  private generate(local: SolarSystem, station: Starbase): StarbaseMission[] {
    const source = this.world.createSystem(systemAddress(local));
    if (!source || !source.stations.some((entry) => entry.id === station.id && entry.capabilities.fuel))
      return [];
    const rng = new PRNG(`${this.seed}:haul-offers:v2:${station.id}`);
    const profile = getStationMissionProfile(this.seed, station.id, systemAddress(source));
    const pickup = reserveInstallationOrbit(source, AU_IN_METERS * 0.7, rng.random() * 2 * Math.PI);
    if (!pickup) return [];
    const offers: StarbaseMission[] = [];
    if (profile.starter || rng.random() < 0.18) {
      const localOrbit = reserveInstallationOrbit(
        source,
        pickup.radiusM * 1.14,
        (pickup.angleRad + 0.3) % (2 * Math.PI),
        [pickup]
      );
      if (localOrbit) {
        const mission = this.build(source, station, source, pickup, localOrbit, {
          slot: 0,
          title: 'Local navigation buoy transfer',
          targetName: 'Navigation Buoy',
          depot: false,
          wetMassKg: 3000,
          engineClass: 1,
          minimumDistanceLy: 0,
          maximumDistanceLy: 0,
          baseReward: 1600,
        });
        if (mission) offers.push(mission);
      }
    }
    const regionalDepot = rng.random() < 0.65;
    const specs: HaulOfferSpec[] = [
      {
        slot: 1,
        title: regionalDepot ? 'Regional logistics depot' : 'Regional navigation relay',
        targetName: regionalDepot ? 'Automated Logistics Depot' : 'Navigation Relay Buoy',
        depot: regionalDepot,
        wetMassKg: regionalDepot ? rng.randomInt(16, 24) * 4000 : rng.randomInt(8, 15) * 1000,
        engineClass: regionalDepot ? 2 : 1,
        minimumDistanceLy: 35,
        maximumDistanceLy: 140,
        baseReward: regionalDepot ? 4600 : 2800,
      },
      {
        slot: 2,
        title: regionalDepot ? 'Deep-range navigation relay' : 'Long-range depot commissioning',
        targetName: regionalDepot ? 'Deep-Range Navigation Buoy' : 'Automated Logistics Depot',
        depot: !regionalDepot,
        wetMassKg: regionalDepot ? rng.randomInt(12, 18) * 1000 : rng.randomInt(8, 10) * 4000,
        engineClass: 2,
        minimumDistanceLy: 450,
        maximumDistanceLy: 1800,
        baseReward: regionalDepot ? 3600 : 5600,
      },
    ];
    // Small offices still sometimes sponsor a distant job; larger boards show both route tiers.
    if (profile.heavyHaul - offers.length < 2 && rng.random() < 0.65) specs.reverse();
    const seen = new Set<string>();
    for (const spec of specs) {
      if (offers.length >= profile.heavyHaul) break;
      let materialized = 0;
      // Sparse projection needs many cheap catalogue checks, not many expensive planetary generations.
      const catalogueBudget = this.world.hasStellarSystem ? 512 : 12;
      for (let attempt = 0; attempt < catalogueBudget && materialized < 12; attempt++) {
        const angle = rng.random() * 2 * Math.PI;
        const radius =
          rng.random(spec.minimumDistanceLy, spec.maximumDistanceLy) / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
        const address = {
          worldX: source.starX + Math.round(Math.cos(angle) * radius),
          worldY: source.starY + Math.round(Math.sin(angle) * radius),
          systemSlot: 0,
        };
        const key = `${address.worldX},${address.worldY}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.world.hasStellarSystem && !this.world.hasStellarSystem(address)) continue;
        materialized++;
        const destination = this.world.createSystem(address);
        if (!destination || destination.isStarless || !sameHaulAddress(address, systemAddress(destination)))
          continue;
        // An existing fuel depot already satisfies the infrastructure request.
        if (spec.depot && destination.stations.some((entry) => entry.capabilities.fuel)) continue;
        const orbit = reserveInstallationOrbit(destination, AU_IN_METERS, rng.random() * 2 * Math.PI);
        if (!orbit) continue;
        const mission = this.build(source, station, destination, pickup, orbit, spec);
        if (mission) {
          offers.push(mission);
          break;
        }
      }
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
    spec: HaulOfferSpec
  ): StarbaseMission | null {
    const local = spec.slot === 0;
    const depot = spec.depot;
    const id = `haul-v2:${station.id}:${spec.slot}`;
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
      targetName: spec.targetName,
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
        dryMassKg: spec.wetMassKg * 0.8,
        wetMassKg: spec.wetMassKg,
        sizeClass: local ? 'compact' : 'module',
        supportFuelCapacityUnits: 1e9,
        commissioningFuelAllowanceUnits: depot ? 500 : 0,
        minimumEngineClass: spec.engineClass,
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
      title: spec.title,
      issuer: 'Infrastructure Logistics',
      originStarbaseId: station.id,
      originStarbaseName: station.name,
      systemName: destination.name,
      systemAddress: systemAddress(destination),
      summary: `${local ? 'Local' : `${distanceLy.toFixed(0)} ly`} / ${(funded.package.wetMassKg / 1000).toFixed(1)} t external tow`,
      detail: `Contractor propulsion support included. Escrow releases on commissioning. Normal reactor fuel is reserved for the ${distanceLy.toFixed(0)} ly route back to ${station.name}; return is optional and untowed. Recovery forfeits payment and retires this offer.`,
      rewardCredits: local
        ? spec.baseReward
        : Math.round(spec.baseReward + (spec.wetMassKg / 1000) * 16 + Math.min(5000, distanceLy * 3)),
      risk: local ? 'Low' : 'Med',
      objectives: [funded],
    };
  }
}
