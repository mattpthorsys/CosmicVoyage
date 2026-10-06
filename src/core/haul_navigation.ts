import {
  sameHaulAddress,
  type HaulEndpoint,
  type HaulHomeboundRoute,
  type HeavyHaulObjective,
  type InfrastructureRecord,
  type AttachedTowPolicy,
} from './heavy_haul_types';
import type { HaulManifestStage } from './haul_manifest';
import type { MissionSystemAddress } from './mission_board';
import type { ObservatoryDestination } from './observatory_types';

/** Explains the next usable action instead of treating an arrived tow as a source-yard departure. */
export function describeTowTravelRestriction(tow: AttachedTowPolicy): string {
  return tow.stage === 'arrived'
    ? 'Haul arrived: tow still attached. Approach its deployment contact, then deploy via O / Heavy-Haul Manifest before orbiting planets or leaving.'
    : 'External tow attached: use the haul voyage or contractor recovery; only the source repair yard is available.';
}

/** Recovers the most recent remote haul's issuer independently of the current navigation mark. */
export function findHaulHomeboundRoute(
  installations: readonly InfrastructureRecord[],
  legacyDestination?: ObservatoryDestination | null
): HaulHomeboundRoute | null {
  const latest = findHaulHomeboundInstallation(installations);
  if (latest?.homeboundRoute) return structuredClone(latest.homeboundRoute);
  // Before issuer metadata existed, settlement saved only a named port destination.
  if (
    legacyDestination?.kind === 'system' &&
    /starbase|depot/i.test(legacyDestination.name) &&
    installations.some((asset) => !sameHaulAddress(asset.systemAddress, legacyDestination))
  ) {
    return {
      systemAddress: {
        worldX: legacyDestination.worldX,
        worldY: legacyDestination.worldY,
        systemSlot: legacyDestination.systemSlot,
      },
      stationId: null,
      stationName: legacyDestination.name,
    };
  }
  return null;
}

/** Links the latest issuer to its one-time return receipt without reviving a settled mission. */
export function findHaulHomeboundInstallation(
  installations: readonly InfrastructureRecord[]
): InfrastructureRecord | null {
  return installations.reduce<InfrastructureRecord | null>(
    (previous, asset) =>
      asset.homeboundRoute && (!previous || asset.commissionedAtSeconds >= previous.commissionedAtSeconds)
        ? asset
        : previous,
    null
  );
}

/** Describes the next physical staging requirement, independently of presentation and action execution. */
export function describeHaulStage(
  stage: HaulManifestStage,
  interstellar: boolean,
  inRange: boolean,
  atBoundary: boolean,
  undocked: boolean
): string {
  switch (stage) {
    case 'awaiting-pickup':
      return inRange && undocked
        ? 'Pickup contact in coupling range'
        : 'Undock and rendezvous with the pickup contact';
    case 'attached':
      if (interstellar)
        return atBoundary && undocked
          ? 'Departure boundary reached / ready for voyage'
          : 'Stage at the source-system departure boundary';
      return inRange && undocked
        ? 'Local transfer staged / ready for voyage'
        : 'Return to pickup contact for local transfer';
    case 'arrived':
      return inRange
        ? 'Deployment contact in range / escrow ready'
        : 'Approach the destination deployment contact';
    case 'complete':
      return 'Installation operational / optional untowed route home available';
    case 'none':
      return 'No external package attached';
    default:
      return 'Review certification before accepting';
  }
}

/** Resolves phase-appropriate navigation without ever interpreting a remote site as local coordinates. */
export function resolveHaulNavigation(
  missionId: string,
  objective: HeavyHaulObjective,
  stage: HaulManifestStage,
  current: MissionSystemAddress | null,
  originStationId?: string
): { endpoint: HaulEndpoint; localSiteId: string | null } {
  const endpoint =
    stage === 'awaiting-pickup' || stage === 'attached' || stage === 'complete'
      ? objective.pickup
      : objective.destination;
  const local = current && sameHaulAddress(current, endpoint.systemAddress);
  const siteId =
    stage === 'complete'
      ? (originStationId ??
        (objective.resupply && sameHaulAddress(objective.resupply.systemAddress, endpoint.systemAddress)
          ? objective.resupply.stationId
          : null))
      : stage === 'attached' && objective.route.kind === 'interstellar'
        ? `${missionId}:departure`
        : endpoint.siteId;
  return { endpoint, localSiteId: local && stage !== 'available' ? siteId : null };
}
