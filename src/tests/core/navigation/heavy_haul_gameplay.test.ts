import { describe, expect, it, vi } from 'vitest';
import { HeavyHaulOffers } from '../../../core/heavy_haul_offers';
import { prepareHaulLifecycle } from '../../../core/heavy_haul_lifecycle';
import { commitHaulChange, prepareHaulCommissioning } from '../../../core/heavy_haul_commissioning';
import { prepareHaulJourney } from '../../../core/heavy_haul_journey';
import { createHeavyHaulSnapshot } from '../../../core/heavy_haul_types';
import { InfrastructureRegistry } from '../../../core/infrastructure_registry';
import { materializeHaulSites } from '../../../core/haul_sites';
import { getHeavyHaulObjective, type MissionSystemAddress } from '../../../core/mission_board';
import { MissionProgressService } from '../../../core/mission_progress';
import { HeavyHaulService } from '../../../core/heavy_haul_service';
import { parseGameSave } from '../../../core/save_game';
import { createDefaultShipModifications } from '../../../core/ship_modifications';
import { haulJourneyFixture, haulSystemFixture } from '../../fixtures/heavy_haul_journeys';
import { CONFIG } from '../../../config';
import { sameHaulAddress } from '../../../core/heavy_haul_types';
import { capturePlanetMutations, captureSystemOrbit, systemAddress } from '../../../core/system_orbit_state';
import { findHaulHomeboundRoute } from '../../../core/haul_navigation';
import { GameStateManager } from '../../../core/game_state_manager';
import { Player } from '../../../core/player';
import { PRNG } from '../../../utils/prng';
import { SystemDataGenerator } from '../../../generation/system_data_generator';

/** Builds the starter local offer against real host geometry and the existing save/ship owners. */
function gameplayFixture() {
  const fixture = haulJourneyFixture('local');
  const hub = {
    worldX: CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X,
    worldY: CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y,
    systemSlot: 0,
  };
  const world = {
    createSystem: (address: MissionSystemAddress) =>
      haulSystemFixture(address, null, sameHaulAddress(address, hub)),
  };
  const source = world.createSystem(hub);
  Object.assign(source.starbase!, {
    kind: 'starbase',
    capabilities: { ...source.starbase!.capabilities, missions: true },
  });
  const offers = new HeavyHaulOffers(fixture.save.seed, world).list(source, source.starbase!, [], []);
  const mission = offers.find((entry) => getHeavyHaulObjective(entry)?.route.kind === 'local')!;
  const save = fixture.save;
  Object.assign(save, new MissionProgressService().createSnapshot(), {
    heavyHaul: createHeavyHaulSnapshot(),
  });
  save.player.ship = createDefaultShipModifications();
  save.player.ship.towCouplerClass = 1;
  save.player.position.worldX = source.starX;
  save.player.position.worldY = source.starY;
  save.systemOrbit = captureSystemOrbit(source);
  save.systemOrbitHistory = [{ ...systemAddress(source), orbit: save.systemOrbit }];
  save.planetMutations = capturePlanetMutations(source);
  save.location = {
    kind: 'starbase',
    ...systemAddress(source),
    stationId: source.starbase!.id,
    starbaseName: source.starbase!.name,
  };
  return { save, source, world, mission, offers };
}

describe('production haul vertical slice', () => {
  it('transfers a production depot with hypersleep, commissions it and restores usable station services', () => {
    const fixture = gameplayFixture();
    const mission = fixture.offers.find(
      (entry) => getHeavyHaulObjective(entry)?.package.installationKind === 'automated-depot'
    )!;
    const objective = getHeavyHaulObjective(mission)!;
    fixture.save.player.ship.engineClass = 2;
    fixture.save.player.ship.towCouplerClass = 2;
    fixture.save.player.ship.hypersleepClass = 1;
    fixture.save.player.ship.specialBaysOccupied = 2;
    const accepted = prepareHaulLifecycle(
      fixture.save,
      { kind: 'accept', mission },
      fixture.source,
      fixture.world
    );
    if (!accepted.ok) throw new Error(accepted.message);
    accepted.save.location = { kind: 'system', ...systemAddress(fixture.source) };
    materializeHaulSites(
      fixture.source,
      accepted.save.activeMissions[mission.id],
      accepted.save.systemOrbit ?? undefined,
      0
    );
    const pickup = fixture.source.navigationMarkers.find((marker) => marker.id === objective.pickup.siteId)!;
    accepted.save.player.position.systemX = pickup.systemX + 1e9;
    accepted.save.player.position.systemY = pickup.systemY;
    const coupled = prepareHaulLifecycle(accepted.save, { kind: 'couple' }, fixture.source, fixture.world);
    if (!coupled.ok) throw new Error(coupled.message);
    materializeHaulSites(
      fixture.source,
      coupled.save.activeMissions[mission.id],
      coupled.save.systemOrbit ?? undefined,
      0,
      'attached'
    );
    const boundary = fixture.source.navigationMarkers.find((marker) => marker.kind === 'departure')!;
    coupled.save.player.position.systemX = boundary.systemX;
    coupled.save.player.position.systemY = boundary.systemY;
    const departed = prepareHaulJourney(
      coupled.save,
      fixture.source,
      { resupply: objective.resupply! },
      fixture.world
    );
    if (!departed.ok) throw new Error(departed.message);
    const journey = departed.journey;
    expect(journey.quote.requiredBerths).toBe(3);
    expect(journey.quote.durationSeconds).toBeGreaterThan(48 * 3600);
    const site = journey.system.navigationMarkers.find(
      (marker) => marker.id === objective.destination.siteId
    )!;
    journey.save.player.position.systemX = site.systemX;
    journey.save.player.position.systemY = site.systemY;
    const commissioned = prepareHaulCommissioning(journey.save, journey.system);
    if (!commissioned.ok) throw new Error(commissioned.message);
    const registry = new InfrastructureRegistry();
    registry.restore(commissioned.save.infrastructure);
    const fresh = fixture.world.createSystem(objective.destination.systemAddress);
    registry.materialize(fresh, commissioned.save.bulkAdvanceSeconds);
    const depot = fresh.stations.find((station) => station.id === `haul-installation:${mission.id}`)!;
    expect(depot.capabilities).toMatchObject({
      trade: true,
      fuel: true,
      repairs: 'basic',
      missions: false,
      crew: false,
    });
    expect(fresh.getObjectNear(depot.systemX, depot.systemY)).toBe(depot);
    expect(depot.getScanInfo().join(' ')).toContain('supplies are finite');
    const restored = parseGameSave(JSON.stringify(commissioned.save));
    if (restored.observatory) restored.observatory.destination = null;
    expect(findHaulHomeboundRoute(restored.infrastructure)).toEqual({
      systemAddress: objective.pickup.systemAddress,
      stationId: mission.originStarbaseId,
      stationName: mission.originStarbaseName,
    });
    const player = new Player();
    player.position.systemX = depot.systemX + 5e7;
    player.position.systemY = depot.systemY;
    const seed = new PRNG('haul-journey-fixture');
    const manager = new GameStateManager(player, seed, new SystemDataGenerator(seed));
    const progress = new MissionProgressService();
    progress.restoreSnapshot(restored);
    const haul = new HeavyHaulService(progress);
    haul.restoreSnapshot(restored.heavyHaul, restored.gameClockElapsedSeconds);
    manager.setTowPolicy(() => haul.attachedTowPolicy);
    expect(haul.attachedTowPolicy).toBeNull();
    try {
      manager.installHaulArrival(fresh, { x: player.position.systemX, y: player.position.systemY });
      manager.setLandingTargetProvider(() => depot);
      expect(manager.landOnNearbyObject()).toBe(depot);
      expect(manager.currentStarbase).toBe(depot);
      expect(manager.state).toBe('starbase');
      expect(manager.liftOff()).toBe(true);
      const planet = fresh.planets.find((body) => body !== null)!;
      player.position.systemX = planet.systemX + 5e7;
      player.position.systemY = planet.systemY;
      manager.setLandingTargetProvider(() => planet);
      expect(manager.landOnNearbyObject()).toBe(planet);
      expect(manager.state).toBe('orbit');
    } finally {
      manager.destroy();
    }
    commissioned.save.location = {
      kind: 'starbase',
      ...objective.destination.systemAddress,
      stationId: depot.id,
      starbaseName: depot.name,
    };
    expect(parseGameSave(JSON.stringify(commissioned.save)).location).toEqual(commissioned.save.location);
    expect(commissioned.save.player.resources.fuel).toBe(fixture.save.player.resources.fuel);
    expect(registry.createSnapshot()[0].commissioningFuelRemainingUnits).toBe(500);
    expect(commissioned.save.observatory?.destination).toEqual({
      ...objective.pickup.systemAddress,
      name: mission.originStarbaseName,
      kind: 'system',
    });
  });
  it('accepts, couples, travels, commissions and reloads without consuming ordinary fuel or internal cargo', () => {
    const fixture = gameplayFixture();
    const original = structuredClone(fixture.save);
    const accepted = prepareHaulLifecycle(
      fixture.save,
      { kind: 'accept', mission: fixture.mission },
      fixture.source,
      fixture.world
    );
    if (!accepted.ok) throw new Error(accepted.message);
    expect(fixture.save).toEqual(original);
    const save = accepted.save;
    save.location = { kind: 'system', ...systemAddress(fixture.source) };
    const objective = getHeavyHaulObjective(fixture.mission)!;
    materializeHaulSites(
      fixture.source,
      save.activeMissions[fixture.mission.id],
      save.systemOrbit ?? undefined,
      save.bulkAdvanceSeconds
    );
    const pickup = fixture.source.navigationMarkers.find((marker) => marker.id === objective.pickup.siteId)!;
    save.player.position.systemX = pickup.systemX + 1e9;
    save.player.position.systemY = pickup.systemY;
    const coupled = prepareHaulLifecycle(save, { kind: 'couple' }, fixture.source, fixture.world);
    if (!coupled.ok) throw new Error(coupled.message);
    expect(coupled.save.heavyHaul.activeTow?.stage).toBe('attached');
    const departed = prepareHaulJourney(
      coupled.save,
      fixture.source,
      { resupply: objective.resupply! },
      fixture.world
    );
    if (!departed.ok) throw new Error(departed.message);
    const journey = departed.journey;
    const deployment = journey.system.navigationMarkers.find(
      (marker) => marker.id === objective.destination.siteId
    )!;
    journey.save.player.position.systemX = deployment.systemX;
    journey.save.player.position.systemY = deployment.systemY;
    const commissioned = prepareHaulCommissioning(journey.save, journey.system);
    if (!commissioned.ok) throw new Error(commissioned.message);
    const restored = parseGameSave(JSON.stringify(commissioned.save));
    expect(restored.heavyHaul.activeTow).toBeNull();
    expect(restored.player.resources.fuel).toBe(original.player.resources.fuel);
    expect(restored.player.resources.credits).toBe(
      original.player.resources.credits + fixture.mission.rewardCredits
    );
    expect(restored.player.cargoHold).toEqual(original.player.cargoHold);
    expect(restored.gameClockElapsedSeconds).toBe(
      original.gameClockElapsedSeconds + journey.quote.durationSeconds
    );
    const registry = new InfrastructureRegistry();
    registry.restore(restored.infrastructure);
    const fresh = fixture.world.createSystem(objective.destination.systemAddress);
    registry.materialize(fresh, restored.bulkAdvanceSeconds);
    expect(fresh.navigationMarkers[0].id).toBe(`haul-installation:${fixture.mission.id}`);
    expect(prepareHaulJourney(restored, fresh, { resupply: objective.resupply! }, fixture.world).ok).toBe(
      false
    );
    expect(prepareHaulCommissioning(restored, fresh).ok).toBe(false);
  });

  it('shows equipment refusal without accepting, and applies nothing on checkpoint failure', () => {
    const fixture = gameplayFixture();
    fixture.save.player.ship.towCouplerClass = 0;
    expect(
      prepareHaulLifecycle(
        fixture.save,
        { kind: 'accept', mission: fixture.mission },
        fixture.source,
        fixture.world
      ).ok
    ).toBe(false);
    expect(fixture.save.activeMissions).toEqual({});
    fixture.save.player.ship.towCouplerClass = 1;
    const prepared = prepareHaulLifecycle(
      fixture.save,
      { kind: 'accept', mission: fixture.mission },
      fixture.source,
      fixture.world
    );
    const apply = vi.fn();
    expect(
      commitHaulChange(
        prepared,
        () => {
          throw new Error('storage full');
        },
        apply
      ).ok
    ).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(fixture.save.heavyHaul.activeTow).toBeNull();
  });

  it('retires cancelled jobs without payout or converting support fuel into cargo', () => {
    const fixture = gameplayFixture();
    const accepted = prepareHaulLifecycle(
      fixture.save,
      { kind: 'accept', mission: fixture.mission },
      fixture.source,
      fixture.world
    );
    if (!accepted.ok) throw new Error(accepted.message);
    const recovered = prepareHaulLifecycle(accepted.save, { kind: 'recover' }, fixture.source, fixture.world);
    if (!recovered.ok) throw new Error(recovered.message);
    expect(recovered.save.heavyHaul.activeTow).toBeNull();
    expect(recovered.save.heavyHaul.retiredMissionIds).toContain(fixture.mission.id);
    expect(recovered.save.player.resources).toEqual(fixture.save.player.resources);
    expect(recovered.save.player.cargoHold).toEqual(fixture.save.player.cargoHold);
    expect(
      prepareHaulLifecycle(
        recovered.save,
        { kind: 'accept', mission: fixture.mission },
        fixture.source,
        fixture.world
      ).ok
    ).toBe(false);
  });
});
