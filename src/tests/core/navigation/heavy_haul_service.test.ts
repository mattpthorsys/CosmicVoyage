import { describe, expect, it } from 'vitest';
import { HeavyHaulService } from '../../../core/heavy_haul_service';
import { MissionProgressService } from '../../../core/mission_progress';
import {
  getHeavyHaulObjective,
  isBiologicalMissionObjective,
  formatMissionDetail,
} from '../../../core/mission_board';
import {
  heavyHaulContextFixture,
  heavyHaulMissionFixture,
  heavyHaulReceiptFixture,
  haulRendezvousFixture,
} from '../../fixtures/heavy_haul_contracts';

/** Provides a real mission owner, valid route, and independent logical attachment owner. */
function fixture() {
  const missions = new MissionProgressService();
  const service = new HeavyHaulService(missions);
  const mission = heavyHaulMissionFixture();
  const objective = getHeavyHaulObjective(mission)!;
  const context = heavyHaulContextFixture();
  return { missions, service, mission, objective, context };
}

/** Advances only domain records; actual calendar/position execution is deliberately an M3 responsibility. */
function arrivedFixture() {
  const f = fixture();
  f.service.accept(f.mission, f.context);
  f.service.couple(haulRendezvousFixture(f.objective.pickup), f.context);
  const receipt = heavyHaulReceiptFixture(f.mission, f.context);
  f.service.recordArrival(receipt, f.context);
  return { ...f, receipt };
}

describe('heavy-haul lifecycle foundations', () => {
  it('copies accepted terms and allows only one active package', () => {
    const f = fixture();
    expect(f.service.accept(f.mission, f.context).ok).toBe(true);
    f.mission.rewardCredits = 999999;
    expect(f.missions.getMission(f.mission.id)!.rewardCredits).toBe(5800);
    expect(Object.isFrozen(f.missions.getMission(f.mission.id))).toBe(true);
    expect(
      Object.isFrozen(getHeavyHaulObjective(f.missions.getMission(f.mission.id)!)!.destination.orbit)
    ).toBe(true);
    expect(() => f.missions.resolveBiologicalReferences({})).not.toThrow();
    expect(f.service.accept(heavyHaulMissionFixture('medium'), f.context).ok).toBe(false);
    expect(f.service.createSnapshot().activeTow!.stage).toBe('awaiting-pickup');
    expect(f.missions.getSpecimenRequests('anything', 'anywhere')).toEqual([]);
  });

  it('refuses acceptance without equipment or a verified onward route', () => {
    const f = fixture();
    f.context.ship.towCouplerClass = 0;
    expect(f.service.accept(f.mission, f.context).ok).toBe(false);
    expect(f.missions.getActiveCount()).toBe(0);
    expect(f.service.createSnapshot().activeTow).toBeNull();
  });

  it('requires an actual close-range pickup and rechecks changed capabilities', () => {
    const f = fixture();
    f.service.accept(f.mission, f.context);
    const pickup = haulRendezvousFixture(f.objective.pickup);
    expect(f.service.couple({ ...pickup, distanceM: 3e10 + 1 }, f.context).ok).toBe(false);
    expect(f.service.couple({ ...pickup, distanceM: NaN }, f.context).ok).toBe(false);
    expect(f.service.couple({ ...pickup, siteId: 'other-package' }, f.context).ok).toBe(false);
    expect(
      f.service.couple({ ...pickup, systemAddress: { ...pickup.systemAddress, systemSlot: 1 } }, f.context).ok
    ).toBe(false);
    f.context.ship.hypersleepClass = 0;
    expect(f.service.couple(pickup, f.context).ok).toBe(false);
    f.context.ship.hypersleepClass = 1;
    expect(f.service.couple(pickup, f.context).ok).toBe(true);
    expect(f.service.couple(pickup, f.context).ok).toBe(false);
  });

  it('returns defensive snapshots and prevents deployment before a committed transfer', () => {
    const f = fixture();
    f.service.accept(f.mission, f.context);
    const snapshot = f.service.createSnapshot();
    snapshot.activeTow!.remainingSupportFuelUnits = 0;
    expect(f.service.createSnapshot().activeTow!.remainingSupportFuelUnits).toBe(5000);
    f.service.couple(haulRendezvousFixture(f.objective.pickup), f.context);
    expect(
      f.service.prepareDeployment({
        ...haulRendezvousFixture(f.objective.destination),
        gameClockSeconds: 0,
        bulkAdvanceSeconds: 0,
        orbit: f.objective.destination.orbit,
      }).ok
    ).toBe(false);
  });

  it('records quoted support consumption once without modifying normal resources', () => {
    const f = fixture();
    f.service.accept(f.mission, f.context);
    f.service.couple(haulRendezvousFixture(f.objective.pickup), f.context);
    const receipt = heavyHaulReceiptFixture(f.mission, f.context);
    const before = structuredClone(f.context);
    expect(
      f.service.recordArrival({ ...receipt, durationSeconds: receipt.durationSeconds + 1 }, f.context).ok
    ).toBe(false);
    expect(f.service.recordArrival(receipt, f.context).ok).toBe(true);
    expect(f.service.createSnapshot().activeTow!.remainingSupportFuelUnits).toBeCloseTo(
      5000 - receipt.supportFuelConsumedUnits
    );
    expect(f.service.recordArrival(receipt, f.context).ok).toBe(false);
    expect(f.context).toEqual(before);
  });

  it('rejects invalid chronology before changing the attachment ledger', () => {
    const f = fixture();
    f.service.accept(f.mission, f.context);
    f.service.couple(haulRendezvousFixture(f.objective.pickup), f.context);
    const receipt = heavyHaulReceiptFixture(f.mission, f.context);
    const before = f.service.createSnapshot();
    expect(f.service.recordArrival({ ...receipt, arrivalSeconds: NaN }, f.context).ok).toBe(false);
    expect(
      f.service.recordArrival({ ...receipt, arrivalSeconds: receipt.arrivalSeconds + 100 }, f.context).ok
    ).toBe(false);
    expect(f.service.createSnapshot()).toEqual(before);
  });

  it('prepares destination escrow and commissioning without an issuer return or premature mutation', () => {
    const f = arrivedFixture();
    const context = {
      ...haulRendezvousFixture(f.objective.destination),
      gameClockSeconds: f.receipt.arrivalSeconds,
      bulkAdvanceSeconds: f.receipt.durationSeconds,
      orbit: { ...f.objective.destination.orbit, angleRad: 1 },
    };
    const before = f.service.createSnapshot();
    const proposal = f.service.prepareDeployment(context);
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) throw new Error(proposal.message);
    expect(proposal.credits).toBe(5800);
    expect(proposal.installation.lastAppliedBulkSeconds).toBe(f.receipt.durationSeconds);
    expect(proposal.installation.orbit.angleRad).toBe(1);
    expect(proposal.installation.commissioningFuelRemainingUnits).toBe(500);
    expect(f.service.createSnapshot()).toEqual(before);
    expect(f.service.commitDeployment({ ...context, siteId: 'wrong-site' }).ok).toBe(false);
    expect(f.service.commitDeployment(context).ok).toBe(true);
    expect(f.missions.getStatus(f.mission)).toBe('COMPLETE');
    expect(f.service.createSnapshot().activeTow).toBeNull();
    expect(f.service.commitDeployment(context).ok).toBe(false);
  });

  it('does not allow generic station hand-in to pay a haul', () => {
    const f = fixture();
    f.service.accept(f.mission, f.context);
    expect(
      f.missions.handIn(f.mission.id, f.mission.originStarbaseName, f.mission.originStarbaseId)
    ).toBeNull();
    expect(formatMissionDetail(f.mission, 'ACTIVE')).toContain('Deploy for escrow payment');
    expect(isBiologicalMissionObjective(f.objective)).toBe(false);
  });

  it('retires recovery without payout and does not allow its fuel/package to be respawned', () => {
    const f = fixture();
    f.service.accept(f.mission, f.context);
    f.service.couple(haulRendezvousFixture(f.objective.pickup), f.context);
    expect(f.service.cancel().ok).toBe(true);
    expect(f.service.createSnapshot().retiredMissionIds).toEqual([f.mission.id]);
    expect(f.service.createSnapshot().activeTow).toBeNull();
    expect(f.missions.getActiveCount()).toBe(0);
    expect(f.missions.getStatus(f.mission)).not.toBe('COMPLETE');
    expect(f.context.normalFuelUnits).toBe(450);
    expect(f.service.accept(f.mission, f.context).ok).toBe(false);
    expect(f.service.cancel().ok).toBe(false);
  });

  it('restores arrived packages only when their canonical contract and receipt agree', () => {
    const f = arrivedFixture();
    const missions = new MissionProgressService();
    missions.restoreSnapshot(f.missions.createSnapshot());
    const service = new HeavyHaulService(missions);
    service.restoreSnapshot(f.service.createSnapshot(), f.receipt.arrivalSeconds);
    expect(service.createSnapshot()).toEqual(f.service.createSnapshot());
    const corrupt = service.createSnapshot();
    corrupt.activeTow!.remainingSupportFuelUnits += 1;
    expect(() => service.restoreSnapshot(corrupt, f.receipt.arrivalSeconds)).toThrow('support ledger');
    expect(service.createSnapshot()).toEqual(f.service.createSnapshot());
  });
});
