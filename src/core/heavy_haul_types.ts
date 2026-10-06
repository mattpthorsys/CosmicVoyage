import type { OrbitHost } from '../entities/stellar_body';
import type { MissionSystemAddress } from './mission_board';

export type TowInstallationKind = 'navigation-buoy' | 'automated-depot';

export interface HaulOrbitSpecification {
  readonly host: OrbitHost;
  readonly radiusM: number;
  readonly angleRad: number;
}

export interface HaulEndpoint {
  readonly systemAddress: MissionSystemAddress;
  readonly systemName: string;
  readonly siteId: string;
  readonly orbit: HaulOrbitSpecification;
}

export interface TowPackageDefinition {
  readonly id: string;
  readonly installationKind: TowInstallationKind;
  readonly dryMassKg: number;
  readonly wetMassKg: number;
  readonly sizeClass: 'compact' | 'module' | 'large';
  readonly supportFuelCapacityUnits: number;
  readonly commissioningFuelAllowanceUnits: number;
  readonly minimumEngineClass: number;
  readonly minimumCouplerClass: number;
}

export interface HeavyHaulObjective {
  id: string;
  kind: 'haul';
  targetName: string;
  targetLabel: string;
  readonly pickup: HaulEndpoint;
  readonly destination: HaulEndpoint;
  readonly package: TowPackageDefinition;
  readonly route: { readonly kind: 'local'; readonly distanceM: number } | { readonly kind: 'interstellar' };
  /** Concrete supply endpoint certified when an offer is generated, rechecked before departure. */
  readonly resupply?: HaulResupplyTarget;
  /** Haul endpoints are external installations, never planetary landing sites. */
  location?: never;
}

/** Prepared by world queries in the journey stage, not inferred from a fuel amount alone. */
export interface HaulOnwardPlan {
  readonly verified: boolean;
  readonly resupplyStationId: string;
  readonly distanceLy: number;
  /** Restricted one-time commissioning refill; zero for an existing supply route. */
  readonly commissioningFuelUnits: number;
}

/** A concrete world target, rather than the caller's assertion that a supply route exists. */
export interface HaulResupplyTarget {
  readonly systemAddress: MissionSystemAddress;
  readonly stationId: string;
}

export interface AttachedTowPolicy {
  readonly wetMassKg: number;
  /** Only the source repair yard may dock an externally parked, not-yet-arrived package. */
  readonly sourceStationId: string | null;
  readonly sourceAddress: MissionSystemAddress;
}

export interface HaulQuote {
  readonly routeKind: 'local' | 'interstellar';
  readonly distance: number;
  readonly durationSeconds: number;
  readonly localStepFactor: number;
  readonly maximumTowMassKg: number;
  readonly requiredBerths: number;
  readonly functionalBerths: number;
  readonly transitFuelUnits: number;
  readonly requiredSupportFuelUnits: number;
  readonly onwardFuelRequiredUnits: number;
}

export type HaulQuoteResult =
  | { readonly ok: true; readonly quote: HaulQuote; readonly reasons: readonly [] }
  | { readonly ok: false; readonly quote: HaulQuote | null; readonly reasons: readonly string[] };

export interface HaulJourneyReceipt {
  readonly operationId: string;
  readonly missionId: string;
  readonly departureSeconds: number;
  readonly arrivalSeconds: number;
  readonly durationSeconds: number;
  readonly supportFuelConsumedUnits: number;
}

export interface ActiveTowRecord {
  readonly missionId: string;
  readonly packageId: string;
  stage: 'awaiting-pickup' | 'attached' | 'arrived';
  remainingSupportFuelUnits: number;
  journeyOperationId: string | null;
}

export interface HeavyHaulSnapshot {
  activeTow: ActiveTowRecord | null;
  retiredMissionIds: string[];
  journeyReceipts: Record<string, HaulJourneyReceipt>;
}

export interface InfrastructureRecord {
  readonly assetId: string;
  readonly sourceMissionId: string;
  readonly kind: TowInstallationKind;
  readonly systemAddress: MissionSystemAddress;
  readonly systemName: string;
  readonly orbit: HaulOrbitSpecification;
  readonly commissionedAtSeconds: number;
  readonly lastAppliedBulkSeconds: number;
  commissioningFuelRemainingUnits: number;
}

export interface HaulRendezvous {
  readonly systemAddress: MissionSystemAddress;
  readonly siteId: string;
  readonly distanceM: number;
}

/** Creates an empty independent ledger without enabling any production offers. */
export function createHeavyHaulSnapshot(): HeavyHaulSnapshot {
  return { activeTow: null, retiredMissionIds: [], journeyReceipts: {} };
}

/** Compares complete addresses rather than display names or projected positions alone. */
export function sameHaulAddress(a: MissionSystemAddress, b: MissionSystemAddress): boolean {
  return a.worldX === b.worldX && a.worldY === b.worldY && a.systemSlot === b.systemSlot;
}
