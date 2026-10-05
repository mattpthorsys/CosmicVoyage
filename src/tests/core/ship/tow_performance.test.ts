import { describe, expect, it } from 'vitest';
import { getHeavyHaulObjective } from '../../../core/mission_board';
import { getTowLocalStepFactor, quoteHeavyHaul } from '../../../core/tow_performance';
import { HAUL_AWAKE_LIMIT_SECONDS, HAUL_MAX_DURATION_SECONDS } from '../../../constants/heavy_haul';
import { heavyHaulContextFixture, heavyHaulMissionFixture } from '../../fixtures/heavy_haul_contracts';

describe('heavy-haul performance', () => {
  it('calibrates light local, medium interstellar, and heavy upgraded jobs independently of real time', () => {
    const local = quoteHeavyHaul(
      getHeavyHaulObjective(heavyHaulMissionFixture('local'))!,
      heavyHaulContextFixture(1)
    );
    const medium = quoteHeavyHaul(
      getHeavyHaulObjective(heavyHaulMissionFixture('medium'))!,
      heavyHaulContextFixture(2)
    );
    const heavy = quoteHeavyHaul(
      getHeavyHaulObjective(heavyHaulMissionFixture())!,
      heavyHaulContextFixture(2)
    );
    const upgraded = quoteHeavyHaul(
      getHeavyHaulObjective(heavyHaulMissionFixture())!,
      heavyHaulContextFixture(3)
    );
    expect(local.quote?.durationSeconds).toBeCloseTo(14959.78707 * Math.sqrt(2.2));
    expect(local.quote?.requiredBerths).toBe(0);
    expect(medium.quote?.durationSeconds).toBe(25 * 120 * 626);
    expect(heavy.quote?.durationSeconds).toBe(100 * 120 * 10001);
    expect(upgraded.quote?.durationSeconds).toBe(100 * 90 * 626);
    expect([local.ok, medium.ok, heavy.ok, upgraded.ok]).toEqual([true, true, true, true]);
    expect(upgraded.quote!.transitFuelUnits).toBeLessThan(heavy.quote!.transitFuelUnits);
  });

  it('preserves no-tow identity and bounds local handling for enormous loads', () => {
    expect(getTowLocalStepFactor(0, 1)).toBe(1);
    expect(getTowLocalStepFactor(0, 5)).toBe(1);
    expect(getTowLocalStepFactor(1200, 1)).toBeCloseTo(1 / Math.sqrt(2.2));
    expect(getTowLocalStepFactor(1e12, 1)).toBe(0.35);
  });

  it('increases duration with mass and rejects overweight packages rather than hiding their penalty', () => {
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    const context = heavyHaulContextFixture();
    const heavier = { ...objective, package: { ...objective.package, wetMassKg: 160000 } };
    expect(quoteHeavyHaul(heavier, context).quote!.durationSeconds).toBeGreaterThan(
      quoteHeavyHaul(objective, context).quote!.durationSeconds
    );
    const overweight = quoteHeavyHaul(
      { ...objective, package: { ...objective.package, wetMassKg: 300000 } },
      context
    );
    expect(overweight.ok).toBe(false);
    expect(overweight.reasons.join(' ')).toContain('certified limit');
  });

  it('counts injured living crew and refuses missing or damaged hypersleep modules', () => {
    const context = heavyHaulContextFixture();
    context.ship.hypersleepClass = 0;
    context.crew[0].hitPoints = 1;
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    expect(quoteHeavyHaul(objective, context).quote?.requiredBerths).toBe(3);
    expect(quoteHeavyHaul(objective, context).reasons.join(' ')).toContain('3 functional hypersleep berths');
    context.ship.hypersleepClass = 1;
    context.ship.damage.subsystemDamage.hypersleepBay = 21;
    expect(quoteHeavyHaul(objective, context).quote?.functionalBerths).toBe(0);
    context.ship.damage.subsystemDamage.hypersleepBay = 20;
    expect(quoteHeavyHaul(objective, context).ok).toBe(true);
  });

  it('requires a functional berth for every extra living crew member', () => {
    const context = heavyHaulContextFixture();
    const largerCrew = [...context.crew, { ...context.crew[0], id: 'extra-crew' }];
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    expect(quoteHeavyHaul(objective, { ...context, crew: largerCrew }).ok).toBe(false);
    context.ship.hypersleepClass = 2;
    expect(quoteHeavyHaul(objective, { ...context, crew: largerCrew }).ok).toBe(true);
  });

  it('refuses damaged drive, coupler, or hull without changing the ship', () => {
    const context = heavyHaulContextFixture();
    context.ship.damage.hullIntegrity = 74;
    context.ship.damage.subsystemDamage.drive = 21;
    context.ship.damage.subsystemDamage.towCoupler = 21;
    const before = structuredClone(context);
    const result = quoteHeavyHaul(getHeavyHaulObjective(heavyHaulMissionFixture())!, context);
    expect(result.reasons.join(' ')).toContain('Hull integrity');
    expect(result.reasons.join(' ')).toContain('Repair drive');
    expect(result.reasons.join(' ')).toContain('Repair tow coupler');
    expect(context).toEqual(before);
  });

  it('reserves final-approach support and keeps normal fuel independent', () => {
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    const context = heavyHaulContextFixture();
    const result = quoteHeavyHaul(objective, context);
    expect(result.quote!.requiredSupportFuelUnits - result.quote!.transitFuelUnits).toBeCloseTo(10);
    expect(quoteHeavyHaul(objective, context, result.quote!.transitFuelUnits).ok).toBe(false);
    expect(context.normalFuelUnits).toBe(450);
  });

  it('allows a local return to same-system supply without requiring hyperspace entry fuel', () => {
    const context = heavyHaulContextFixture(1);
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture('local'))!;
    expect(
      quoteHeavyHaul(objective, {
        ...context,
        normalFuelUnits: 0,
        onward: { ...context.onward, distanceLy: 0 },
      }).ok
    ).toBe(true);
  });

  it('rejects unverified onward routes and insufficient range even after a depot refill', () => {
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    const context = heavyHaulContextFixture();
    expect(quoteHeavyHaul(objective, { ...context, onward: { ...context.onward, verified: false } }).ok).toBe(
      false
    );
    expect(
      quoteHeavyHaul(objective, {
        ...context,
        normalFuelUnits: 0,
        onward: { ...context.onward, commissioningFuelUnits: 500 },
      }).ok
    ).toBe(true);
    const remote = {
      ...context,
      normalFuelUnits: 0,
      onward: { ...context.onward, distanceLy: 10000, commissioningFuelUnits: 500 },
    };
    expect(quoteHeavyHaul(objective, remote).reasons.join(' ')).toContain('fuel-safe');
    expect(
      quoteHeavyHaul(objective, { ...context, onward: { ...context.onward, commissioningFuelUnits: 501 } }).ok
    ).toBe(false);
  });

  it('rejects corrupted quantities and unsupported slots', () => {
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    const context = heavyHaulContextFixture();
    for (const wetMassKg of [NaN, Infinity, -1, 0])
      expect(quoteHeavyHaul({ ...objective, package: { ...objective.package, wetMassKg } }, context).ok).toBe(
        false
      );
    expect(
      quoteHeavyHaul(
        {
          ...objective,
          destination: {
            ...objective.destination,
            systemAddress: { ...objective.destination.systemAddress, systemSlot: 1 },
          },
        },
        context
      ).ok
    ).toBe(false);
    expect(quoteHeavyHaul(objective, { ...context, normalFuelUnits: NaN }).ok).toBe(false);
    expect(quoteHeavyHaul(objective, context, Infinity).ok).toBe(false);
  });

  it('uses the full projected route distance and enforces a maximum duration', () => {
    const objective = getHeavyHaulObjective(heavyHaulMissionFixture())!;
    const diagonal = {
      ...objective,
      destination: { ...objective.destination, systemAddress: { worldX: 100, worldY: 100, systemSlot: 0 } },
    };
    expect(quoteHeavyHaul(diagonal, heavyHaulContextFixture()).quote!.distance).toBeCloseTo(100 * Math.SQRT2);
    const distant = {
      ...objective,
      destination: { ...objective.destination, systemAddress: { worldX: 10000, worldY: 0, systemSlot: 0 } },
    };
    const result = quoteHeavyHaul(distant, heavyHaulContextFixture());
    expect(result.quote!.durationSeconds).toBeGreaterThan(HAUL_MAX_DURATION_SECONDS);
    expect(result.reasons.join(' ')).toContain('twenty-year');
    expect(HAUL_AWAKE_LIMIT_SECONDS).toBe(172800);
  });
});
