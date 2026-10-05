import type { StarbaseMission } from '../../core/mission_board';
import type { HaulEndpoint, HaulJourneyReceipt, HaulRendezvous } from '../../core/heavy_haul_types';
import { quoteHeavyHaul, type HaulQuoteContext } from '../../core/tow_performance';
import { createDefaultShipModifications } from '../../core/ship_modifications';
import { createStartingCrew } from '../../core/crew';
import { AU_IN_METERS } from '../../constants/physics';
import { HAUL_BENCHMARKS, HAUL_FIXTURE_ADDRESSES } from './heavy_haul';

/** Builds a frozen-route test contract without depending on real generated stars or station stock. */
export function heavyHaulMissionFixture(kind: 'local' | 'medium' | 'heavy' = 'heavy'): StarbaseMission {
  const benchmark =
    kind === 'local'
      ? HAUL_BENCHMARKS.localBuoy
      : kind === 'medium'
        ? HAUL_BENCHMARKS.mediumModule
        : HAUL_BENCHMARKS.heavyDepot;
  const destinationAddress =
    kind === 'local'
      ? HAUL_FIXTURE_ADDRESSES.pickup
      : { ...HAUL_FIXTURE_ADDRESSES.destination, worldX: kind === 'medium' ? 25 : 100 };
  return {
    id: `haul-fixture-${kind}`,
    title: kind === 'heavy' ? 'Frontier depot commissioning' : 'Navigation buoy deployment',
    type: 'heavy-haul',
    issuer: 'Infrastructure Logistics',
    summary: 'External package delivery with contractor propulsion support.',
    detail: 'Payment by escrow on commissioning, without return to issuer.',
    rewardCredits: kind === 'local' ? 1400 : kind === 'medium' ? 3600 : 5800,
    risk: 'Low',
    originStarbaseId: 'haul-fixture-port',
    originStarbaseName: 'Fixture Supply Port',
    systemName: 'Fixture Supply System',
    systemAddress: { ...HAUL_FIXTURE_ADDRESSES.pickup },
    objectives: [
      {
        id: `deploy-${kind}`,
        kind: 'haul',
        targetName: kind === 'heavy' ? 'Automated Depot' : 'Navigation Buoy',
        targetLabel: 'Couple, transfer, and commission the installation.',
        pickup: {
          systemAddress: { ...HAUL_FIXTURE_ADDRESSES.pickup },
          systemName: 'Fixture Supply System',
          siteId: `pickup-${kind}`,
          orbit: { host: { kind: 'circumstellar', starId: 'A' }, radiusM: 2 * AU_IN_METERS, angleRad: 0 },
        },
        destination: {
          systemAddress: destinationAddress,
          systemName: kind === 'local' ? 'Fixture Supply System' : 'Fixture Frontier System',
          siteId: `deployment-${kind}`,
          orbit: { host: { kind: 'circumstellar', starId: 'A' }, radiusM: 3 * AU_IN_METERS, angleRad: 0 },
        },
        package: {
          id: `package-${kind}`,
          installationKind: kind === 'heavy' ? 'automated-depot' : 'navigation-buoy',
          dryMassKg: benchmark.wetMassKg * 0.8,
          wetMassKg: benchmark.wetMassKg,
          sizeClass: kind === 'local' ? 'compact' : 'module',
          supportFuelCapacityUnits: kind === 'local' ? 50 : 5000,
          commissioningFuelAllowanceUnits: kind === 'heavy' ? 500 : 0,
          minimumEngineClass: benchmark.engineClass,
          minimumCouplerClass: kind === 'heavy' ? 2 : 1,
        },
        route:
          kind === 'local'
            ? { kind: 'local', distanceM: HAUL_BENCHMARKS.localBuoy.distanceM }
            : { kind: 'interstellar' },
      },
    ],
  };
}

/** Provides an equipped three-person crew and an explicitly verified nearby resupply route. */
export function heavyHaulContextFixture(engineClass = 2): HaulQuoteContext {
  return {
    ship: {
      ...createDefaultShipModifications(),
      engineClass,
      towCouplerClass: 2,
      hypersleepClass: 1,
      specialBaysOccupied: 2,
    },
    crew: createStartingCrew('haul-fixture'),
    normalFuelUnits: 450,
    maximumNormalFuelUnits: 500,
    onward: {
      verified: true,
      resupplyStationId: 'haul-fixture-port',
      distanceLy: 25,
      commissioningFuelUnits: 0,
    },
  };
}

/** Produces a journey receipt from a valid quote; separate benchmark assertions check the formula itself. */
export function heavyHaulReceiptFixture(
  mission: StarbaseMission,
  context: HaulQuoteContext,
  departureSeconds = 100
): HaulJourneyReceipt {
  const objective = mission.objectives[0];
  if (objective.kind !== 'haul') throw new Error('Expected a haul fixture.');
  const result = quoteHeavyHaul(objective, context);
  if (!result.ok) throw new Error(result.reasons.join(' '));
  return {
    missionId: mission.id,
    operationId: `${mission.id}:transit`,
    departureSeconds,
    arrivalSeconds: departureSeconds + result.quote.durationSeconds,
    durationSeconds: result.quote.durationSeconds,
    supportFuelConsumedUnits: result.quote.transitFuelUnits,
  };
}

/** Represents a close-range contact resolved by a future world controller, not a teleport. */
export function haulRendezvousFixture(endpoint: HaulEndpoint): HaulRendezvous {
  return { systemAddress: { ...endpoint.systemAddress }, siteId: endpoint.siteId, distanceM: 1e9 };
}
