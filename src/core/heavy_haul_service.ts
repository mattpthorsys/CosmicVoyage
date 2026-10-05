import { HAUL_RENDEZVOUS_RANGE_M } from '../constants/heavy_haul';
import { getHeavyHaulObjective, type StarbaseMission } from './mission_board';
import type { MissionProgressService } from './mission_progress';
import {
  createHeavyHaulSnapshot,
  sameHaulAddress,
  type HaulEndpoint,
  type HaulJourneyReceipt,
  type HaulOrbitSpecification,
  type HaulQuoteResult,
  type HaulRendezvous,
  type HeavyHaulSnapshot,
  type InfrastructureRecord,
  type AttachedTowPolicy,
} from './heavy_haul_types';
import { validateHeavyHaulSnapshot, validateInfrastructureRecords } from './heavy_haul_validation';
import { quoteHeavyHaul, type HaulQuoteContext } from './tow_performance';

export type HaulActionResult = { readonly ok: boolean; readonly message: string };
export interface HaulDeploymentContext extends HaulRendezvous {
  readonly gameClockSeconds: number;
  readonly bulkAdvanceSeconds: number;
  readonly orbit: HaulOrbitSpecification;
}
export type HaulDeploymentResult =
  | { readonly ok: false; readonly message: string }
  | {
      readonly ok: true;
      readonly message: string;
      readonly credits: number;
      readonly installation: InfrastructureRecord;
    };

/** Owns logical attachment; clock, position, actual installations, and payment remain coordinated effects. */
export class HeavyHaulService {
  private state = createHeavyHaulSnapshot();

  /** Uses the existing mission owner as the sole source of accepted terms. */
  constructor(private readonly missions: MissionProgressService) {}

  /** Returns a defensive snapshot so controllers cannot alter support or attachment state. */
  createSnapshot(): HeavyHaulSnapshot {
    return structuredClone(this.state);
  }

  /** Exposes current restrictions cheaply, with frozen terms still owned by MissionProgress. */
  get attachedTowPolicy(): AttachedTowPolicy | null {
    const active = this.state.activeTow;
    const mission = active && this.missions.getMission(active.missionId);
    const objective = mission && getHeavyHaulObjective(mission);
    if (!active || !mission || !objective || active.stage === 'awaiting-pickup') return null;
    return {
      wetMassKg: objective.package.wetMassKg,
      sourceStationId: active.stage === 'attached' ? (mission.originStarbaseId ?? null) : null,
      sourceAddress: objective.pickup.systemAddress,
    };
  }

  /** Restores only a validated state compatible with the already restored mission owner. */
  restoreSnapshot(snapshot: HeavyHaulSnapshot, gameClockSeconds: number): void {
    const progress = this.missions.createSnapshot();
    validateHeavyHaulSnapshot(
      snapshot,
      progress.activeMissions,
      progress.completedMissionIds,
      gameClockSeconds
    );
    this.state = structuredClone(snapshot);
  }

  /** Accepts one fully quoted job without enabling production offer generation. */
  accept(mission: StarbaseMission, context: HaulQuoteContext): HaulActionResult {
    if (this.state.activeTow) return { ok: false, message: 'Only one heavy-haul contract may be active.' };
    if (this.state.retiredMissionIds.includes(mission.id))
      return { ok: false, message: 'This haul offer has been retired.' };
    if (this.state.retiredMissionIds.length >= 4096)
      return { ok: false, message: 'Haul history has reached its supported limit.' };
    const objective = getHeavyHaulObjective(mission);
    if (
      !objective ||
      !mission.originStarbaseId ||
      !Number.isSafeInteger(mission.rewardCredits) ||
      mission.rewardCredits < 0
    )
      return { ok: false, message: 'Invalid heavy-haul contract.' };
    const result = quoteHeavyHaul(objective, context);
    if (!result.ok) return { ok: false, message: result.reasons.join(' ') };
    if (!this.missions.accept(mission))
      return { ok: false, message: 'Contract already accepted or completed.' };
    this.state.activeTow = {
      missionId: mission.id,
      packageId: objective.package.id,
      stage: 'awaiting-pickup',
      remainingSupportFuelUnits: objective.package.supportFuelCapacityUnits,
      journeyOperationId: null,
    };
    return { ok: true, message: `Accepted ${mission.title}. Rendezvous at ${objective.pickup.systemName}.` };
  }

  /** Rechecks the canonical contract and current equipment without consuming any resources. */
  quote(context: HaulQuoteContext): HaulQuoteResult {
    const active = this.state.activeTow;
    const mission = active && this.missions.getMission(active.missionId);
    const objective = mission && getHeavyHaulObjective(mission);
    return active && objective
      ? quoteHeavyHaul(objective, context, active.remainingSupportFuelUnits)
      : { ok: false, quote: null, reasons: ['No active heavy-haul contract.'] };
  }

  /** Couples only a nearby package at its complete frozen pickup address. */
  couple(rendezvous: HaulRendezvous, context: HaulQuoteContext): HaulActionResult {
    const active = this.state.activeTow;
    const mission = active && this.missions.getMission(active.missionId);
    const objective = mission && getHeavyHaulObjective(mission);
    if (!active || !objective || active.stage !== 'awaiting-pickup')
      return { ok: false, message: 'No package awaiting coupling.' };
    if (!isRendezvous(rendezvous, objective.pickup))
      return { ok: false, message: 'Move within coupling range of the contracted package.' };
    const result = this.quote(context);
    if (!result.ok) return { ok: false, message: result.reasons.join(' ') };
    active.stage = 'attached';
    return { ok: true, message: 'External package and contractor support tank coupled.' };
  }

  /** Records a coordinated journey outcome; this method never advances time or moves the ship itself. */
  recordArrival(receipt: HaulJourneyReceipt, context: HaulQuoteContext): HaulActionResult {
    const active = this.state.activeTow;
    if (
      !active ||
      active.stage !== 'attached' ||
      receipt.missionId !== active.missionId ||
      receipt.operationId !== `${active.missionId}:transit`
    )
      return { ok: false, message: 'No matching attached package for this journey.' };
    const quote = this.quote(context);
    if (!quote.ok) return { ok: false, message: quote.reasons.join(' ') };
    if (
      Math.abs(receipt.durationSeconds - quote.quote.durationSeconds) > 1e-6 ||
      Math.abs(receipt.supportFuelConsumedUnits - quote.quote.transitFuelUnits) > 1e-6
    )
      return { ok: false, message: 'Journey receipt does not match the current voyage quote.' };
    const candidate = this.createSnapshot();
    if (!candidate.activeTow) return { ok: false, message: 'Package is no longer attached.' };
    candidate.activeTow.stage = 'arrived';
    candidate.activeTow.remainingSupportFuelUnits -= receipt.supportFuelConsumedUnits;
    candidate.activeTow.journeyOperationId = receipt.operationId;
    candidate.journeyReceipts[receipt.operationId] = structuredClone(receipt);
    try {
      const progress = this.missions.createSnapshot();
      validateHeavyHaulSnapshot(
        candidate,
        progress.activeMissions,
        progress.completedMissionIds,
        receipt.arrivalSeconds
      );
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Invalid journey receipt.' };
    }
    this.state = candidate;
    return { ok: true, message: 'Haul arrived. Approach the contracted deployment site.' };
  }

  /** Prepares commissioning/escrow effects; the caller must persist them together with mission completion. */
  prepareDeployment(context: HaulDeploymentContext): HaulDeploymentResult {
    const active = this.state.activeTow;
    const mission = active && this.missions.getMission(active.missionId);
    const objective = mission && getHeavyHaulObjective(mission);
    if (!active || !mission || !objective || active.stage !== 'arrived')
      return { ok: false, message: 'Complete the contracted transfer before deployment.' };
    if (!isRendezvous(context, objective.destination))
      return { ok: false, message: 'Approach the contracted deployment site.' };
    const receipt = active.journeyOperationId && this.state.journeyReceipts[active.journeyOperationId];
    if (
      !receipt ||
      context.gameClockSeconds < receipt.arrivalSeconds ||
      !Number.isFinite(context.bulkAdvanceSeconds) ||
      context.bulkAdvanceSeconds < 0 ||
      context.bulkAdvanceSeconds > context.gameClockSeconds
    )
      return { ok: false, message: 'Deployment clock is inconsistent with arrival.' };
    const planned = objective.destination.orbit;
    if (
      context.orbit.radiusM !== planned.radiusM ||
      context.orbit.host.kind !== planned.host.kind ||
      context.orbit.host.starId !== planned.host.starId
    )
      return { ok: false, message: 'Deployment orbit differs from the reserved site.' };
    const installation: InfrastructureRecord = {
      assetId: `haul-installation:${mission.id}`,
      sourceMissionId: mission.id,
      kind: objective.package.installationKind,
      systemAddress: structuredClone(objective.destination.systemAddress),
      systemName: objective.destination.systemName,
      orbit: structuredClone(context.orbit),
      commissionedAtSeconds: context.gameClockSeconds,
      lastAppliedBulkSeconds: context.bulkAdvanceSeconds,
      commissioningFuelRemainingUnits: objective.package.commissioningFuelAllowanceUnits,
    };
    try {
      validateInfrastructureRecords([installation], context.gameClockSeconds, context.bulkAdvanceSeconds, [
        mission.id,
      ]);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Invalid deployment.' };
    }
    return {
      ok: true,
      message: 'Deployment and escrow payment prepared.',
      credits: mission.rewardCredits,
      installation,
    };
  }

  /** Commits the domain part of a prepared deployment; no fuel commodity or second payout is created. */
  commitDeployment(context: HaulDeploymentContext): HaulDeploymentResult {
    const prepared = this.prepareDeployment(context);
    if (!prepared.ok) return prepared;
    const mission = this.missions.completeHaulAtDestination(
      prepared.installation.sourceMissionId,
      context.systemAddress,
      context.siteId
    );
    if (!mission) return { ok: false, message: 'Deployment contract is no longer active.' };
    this.state.activeTow = null;
    return { ...prepared, message: 'Package released; contractor tank retained by the installation.' };
  }

  /** Recovers the logical package without payout or transferring its support fuel to normal cargo. */
  cancel(): HaulActionResult {
    const active = this.state.activeTow;
    if (!active || !this.missions.cancelHaul(active.missionId))
      return { ok: false, message: 'No active haul to recover.' };
    this.state.retiredMissionIds.push(active.missionId);
    this.state.activeTow = null;
    return {
      ok: true,
      message: 'Contract retired. Contractor recovered the package and remaining support; no payment.',
    };
  }
}

/** Rejects remote, wrong-slot, wrong-site, and nonfinite coupling/deployment attempts. */
function isRendezvous(contact: HaulRendezvous, endpoint: HaulEndpoint): boolean {
  return (
    sameHaulAddress(contact.systemAddress, endpoint.systemAddress) &&
    contact.siteId === endpoint.siteId &&
    Number.isFinite(contact.distanceM) &&
    contact.distanceM >= 0 &&
    contact.distanceM <= HAUL_RENDEZVOUS_RANGE_M
  );
}
