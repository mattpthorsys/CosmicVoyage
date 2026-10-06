import { sameHaulAddress, type HaulEndpoint, type HeavyHaulObjective } from './heavy_haul_types';
import type { HaulManifestStage } from './haul_manifest';
import type { MissionSystemAddress } from './mission_board';

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
      return 'Installation operational / no return to issuer required';
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
  current: MissionSystemAddress | null
): { endpoint: HaulEndpoint; localSiteId: string | null } {
  const endpoint =
    stage === 'awaiting-pickup' || stage === 'attached' ? objective.pickup : objective.destination;
  const local = current && sameHaulAddress(current, endpoint.systemAddress);
  const siteId =
    stage === 'attached' && objective.route.kind === 'interstellar'
      ? `${missionId}:departure`
      : endpoint.siteId;
  return { endpoint, localSiteId: local && stage !== 'available' && stage !== 'complete' ? siteId : null };
}
