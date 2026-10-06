import { describe, expect, it, vi } from 'vitest';
import {
  quoteHomeboundJourney,
  prepareHomeboundJourney,
  commitPreparedHomeboundJourney,
} from '../../../core/homebound_journey';
import { parseGameSave } from '../../../core/save_game';
import { captureSystemOrbit, restoreSystemOrbits } from '../../../core/system_orbit_state';
import { homeboundJourneyFixture } from '../../fixtures/homebound_journeys';
import { haulJourneyFixture } from '../../fixtures/heavy_haul_journeys';
import { CONFIG } from '../../../config';
import { getOperationalCapabilities } from '../../../core/operational_capabilities';
import { getEngineFuelUseMultiplier } from '../../../core/ship_modifications';

describe('automatic untowed return journeys', () => {
  it('returns to the actual issuer with unloaded travel time, ordinary fuel, preserved cargo and no second payment', () => {
    const fixture = homeboundJourneyFixture();
    const before = structuredClone(fixture.save);
    const sourceOrbit = captureSystemOrbit(fixture.source);
    const result = prepareHomeboundJourney(fixture.save, fixture.source, fixture.assetId, fixture.world);
    if (!result.ok) throw new Error(result.message);
    const { journey } = result;
    expect(journey.quote.distanceLy).toBe(100);
    expect(journey.quote.durationSeconds).toBe(100 * 120);
    const expectedFuel =
      100 *
        CONFIG.HYPERSPACE_MOVE_FUEL_COST *
        getEngineFuelUseMultiplier(before.player.ship.engineClass) *
        getOperationalCapabilities(before.player.crew, before.player.ship).hyperspaceFuelMultiplier +
      CONFIG.HYPERSPACE_FUEL_COST;
    expect(journey.save.player.resources.fuel).toBeCloseTo(before.player.resources.fuel - expectedFuel);
    expect(journey.save.gameClockElapsedSeconds).toBe(
      before.gameClockElapsedSeconds + journey.quote.durationSeconds
    );
    expect(journey.save.bulkAdvanceSeconds).toBe(before.bulkAdvanceSeconds + journey.quote.durationSeconds);
    expect(journey.save.player.resources.credits).toBe(before.player.resources.credits);
    expect(journey.save.player.cargoHold).toEqual(before.player.cargoHold);
    expect(journey.save.player.crew).toEqual(before.player.crew);
    expect(journey.save.heavyHaul).toEqual(before.heavyHaul);
    expect(journey.save.infrastructure[0].commissioningFuelRemainingUnits).toBe(
      before.infrastructure[0].commissioningFuelRemainingUnits
    );
    expect(journey.save.infrastructure[0].homeboundReceipt).toEqual(journey.receipt);
    expect(journey.save.location).toEqual({ kind: 'system', ...journey.route.systemAddress });
    expect(journey.system.stations.find((entry) => entry.id === journey.stationId)).toBeDefined();
    expect(journey.system.lastAppliedBulkSeconds).toBe(journey.save.bulkAdvanceSeconds);
    const expected = fixture.world.createSystem(journey.route.systemAddress);
    if (!expected) throw new Error('No fixture home system.');
    restoreSystemOrbits(
      expected,
      before.systemOrbitHistory.find((entry) => entry.worldX === 0)?.orbit,
      before.planetMutations,
      before.bulkAdvanceSeconds
    );
    expected.advanceOrbitsBySimulatedSeconds(journey.quote.durationSeconds);
    expect(journey.system.starbase!.orbitAngle).toBeCloseTo(expected.starbase!.orbitAngle);
    expect(parseGameSave(JSON.stringify(journey.save))).toEqual(journey.save);
    expect(fixture.save).toEqual(before);
    expect(captureSystemOrbit(fixture.source)).toEqual(sourceOrbit);
  });

  it('refuses unsafe fuel, missing berths on a long return, attached tows and docked departures', () => {
    const fixture = homeboundJourneyFixture();
    const poor = structuredClone(fixture.save);
    poor.player.resources.fuel = 0;
    expect(quoteHomeboundJourney(poor, fixture.assetId)).toMatchObject({
      ok: false,
      reasons: [expect.stringContaining('Refuel')],
    });
    const distant = structuredClone(fixture.save);
    distant.location = { kind: 'hyperspace', worldX: 2000, worldY: 0, systemSlot: 0 };
    distant.systemOrbit = null;
    distant.player.position.worldX = 2000;
    distant.player.ship.hypersleepClass = 0;
    expect(quoteHomeboundJourney(distant, fixture.assetId)).toMatchObject({
      ok: false,
      reasons: [expect.stringContaining('3 functional hypersleep berths')],
    });
    distant.player.ship.hypersleepClass = 1;
    expect(quoteHomeboundJourney(distant, fixture.assetId)).toMatchObject({
      ok: true,
      quote: { requiredBerths: 3 },
    });
    const attached = structuredClone(fixture.save);
    attached.heavyHaul = haulJourneyFixture().save.heavyHaul;
    expect(quoteHomeboundJourney(attached, fixture.assetId)).toMatchObject({
      ok: false,
      reasons: [expect.stringContaining('Deploy or release')],
    });
    const docked = structuredClone(fixture.save);
    docked.location = {
      kind: 'starbase',
      ...fixture.save.infrastructure[0].systemAddress,
      stationId: fixture.assetId,
      starbaseName: 'Delivered Depot',
    };
    expect(prepareHomeboundJourney(docked, fixture.source, fixture.assetId, fixture.world)).toMatchObject({
      ok: false,
      message: expect.stringContaining('Launch or undock'),
    });
  });

  it('requires an actual home port and rechecks the confirmed drive quote without a partial departure', () => {
    const fixture = homeboundJourneyFixture();
    const before = structuredClone(fixture.save);
    const quote = quoteHomeboundJourney(before, fixture.assetId);
    if (!quote.ok) throw new Error(quote.reasons.join(' '));
    const missingPort = structuredClone(before);
    missingPort.infrastructure[0] = {
      ...missingPort.infrastructure[0],
      homeboundRoute: {
        ...missingPort.infrastructure[0].homeboundRoute!,
        stationId: 'missing-port',
      },
    };
    expect(
      prepareHomeboundJourney(missingPort, fixture.source, fixture.assetId, fixture.world)
    ).toMatchObject({ ok: false, message: expect.stringContaining('port cannot be located') });
    expect(
      prepareHomeboundJourney(before, fixture.source, fixture.assetId, { createSystem: () => null })
    ).toMatchObject({ ok: false });
    const changed = structuredClone(before);
    changed.player.ship.engineClass = 3;
    expect(
      prepareHomeboundJourney(changed, fixture.source, fixture.assetId, fixture.world, quote.quote)
    ).toMatchObject({ ok: false, message: expect.stringContaining('fresh quote') });
    expect(fixture.save).toEqual(before);
  });

  it('checkpoints before applying fuel/time and rejects a second return after reload', () => {
    const fixture = homeboundJourneyFixture();
    const prepared = prepareHomeboundJourney(fixture.save, fixture.source, fixture.assetId, fixture.world);
    if (!prepared.ok) throw new Error(prepared.message);
    const apply = vi.fn();
    expect(commitPreparedHomeboundJourney(prepared.journey, undefined, apply).ok).toBe(false);
    expect(
      commitPreparedHomeboundJourney(
        prepared.journey,
        () => {
          throw new Error('storage full');
        },
        apply
      ).ok
    ).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    const checkpoint = vi.fn();
    expect(commitPreparedHomeboundJourney(prepared.journey, checkpoint, apply).ok).toBe(true);
    expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(apply.mock.invocationCallOrder[0]);
    const restored = parseGameSave(JSON.stringify(prepared.journey.save));
    expect(
      prepareHomeboundJourney(restored, prepared.journey.system, fixture.assetId, fixture.world)
    ).toMatchObject({ ok: false, message: expect.stringContaining('already completed') });
    const corrupt = structuredClone(restored);
    corrupt.infrastructure[0] = {
      ...corrupt.infrastructure[0],
      homeboundReceipt: {
        ...corrupt.infrastructure[0].homeboundReceipt!,
        durationSeconds: 1,
      },
    };
    expect(() => parseGameSave(corrupt)).toThrow('homebound receipt time');
  });
});
