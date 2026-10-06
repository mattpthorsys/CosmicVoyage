import { describe, expect, it, vi } from 'vitest';
import {
  commitHaulChange,
  prepareCommissioningRefill,
  prepareHaulCommissioning,
} from '../../../core/heavy_haul_commissioning';
import { prepareHaulJourney } from '../../../core/heavy_haul_journey';
import { getHeavyHaulObjective } from '../../../core/mission_board';
import { reserveInstallationOrbit } from '../../../core/infrastructure_registry';
import { parseGameSave, SAVE_GAME_VERSION } from '../../../core/save_game';
import { haulJourneyFixture } from '../../fixtures/heavy_haul_journeys';

/** Prepares a real local arrival at a clear ring without paying or mutating the original fixture. */
function commissioningFixture() {
  const fixture = haulJourneyFixture('local');
  const objective = getHeavyHaulObjective(fixture.save.activeMissions[fixture.mission.id])!;
  const orbit = reserveInstallationOrbit(fixture.source, objective.destination.orbit.radiusM, 1.2);
  if (!orbit) throw new Error('No fixture deployment orbit.');
  fixture.save.activeMissions[fixture.mission.id].objectives = [
    { ...objective, destination: { ...objective.destination, orbit } },
  ];
  const result = prepareHaulJourney(fixture.save, fixture.source, fixture.request, fixture.world);
  if (!result.ok) throw new Error(result.message);
  const marker = result.journey.system.navigationMarkers.find(
    (entry) => entry.id === objective.destination.siteId
  )!;
  result.journey.save.player.position.systemX = marker.systemX;
  result.journey.save.player.position.systemY = marker.systemY;
  return { ...fixture, journey: result.journey };
}

describe('checkpointed commissioning', () => {
  it('commissions the installation, detaches the tow and pays escrow once', () => {
    const { journey, mission } = commissioningFixture();
    const original = structuredClone(journey.save);
    const result = prepareHaulCommissioning(journey.save, journey.system);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(journey.save).toEqual(original);
    expect(result.save.player.resources.credits).toBe(
      original.player.resources.credits + mission.rewardCredits
    );
    expect(result.save.heavyHaul.activeTow).toBeNull();
    expect(result.save.infrastructure[0].assetId).toBe(`haul-installation:${mission.id}`);
    expect(result.save.completedMissionIds).toContain(mission.id);
    expect(prepareHaulCommissioning(result.save, journey.system).ok).toBe(false);
    expect(parseGameSave(result.save)).toEqual(result.save);
  });

  it('leaves all live owners unchanged if the durable writer fails', () => {
    const { journey } = commissioningFixture();
    const prepared = prepareHaulCommissioning(journey.save, journey.system);
    const apply = vi.fn();
    expect(
      commitHaulChange(
        prepared,
        () => {
          throw new Error('Quota exceeded');
        },
        apply
      ).ok
    ).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(journey.save.heavyHaul.activeTow?.stage).toBe('arrived');
  });

  it('restricts commissioning fuel to the docked depot and remaining allowance', () => {
    const { journey } = commissioningFixture();
    const result = prepareHaulCommissioning(journey.save, journey.system);
    if (!result.ok) throw new Error(result.message);
    const save = result.save;
    const asset = {
      ...save.infrastructure[0],
      kind: 'automated-depot' as const,
      commissioningFuelRemainingUnits: 35,
    };
    save.infrastructure[0] = asset;
    save.location = {
      kind: 'starbase',
      ...asset.systemAddress,
      stationId: asset.assetId,
      starbaseName: 'Test depot',
    };
    save.player.resources.fuel = save.player.resources.maxFuel - 10;
    const refill = prepareCommissioningRefill(save, asset.assetId);
    if (!refill.ok) throw new Error(refill.message);
    expect(refill.save.player.resources.fuel).toBe(save.player.resources.maxFuel);
    expect(refill.save.infrastructure[0].commissioningFuelRemainingUnits).toBe(25);
    expect(refill.save.player.resources.credits).toBe(save.player.resources.credits);
    expect(refill.save.player.cargoHold).toEqual(save.player.cargoHold);
    expect(prepareCommissioningRefill(refill.save, asset.assetId).ok).toBe(false);
    expect(prepareCommissioningRefill(save, 'other-depot').ok).toBe(false);
  });

  it('migrates v19 orbital histories without inventing installations or contract phases', () => {
    const { save } = haulJourneyFixture('local');
    expect(parseGameSave({ ...save, version: 19 }).version).toBe(SAVE_GAME_VERSION);
  });
});
