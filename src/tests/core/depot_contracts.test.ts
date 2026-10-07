import { describe, expect, it } from 'vitest';
import {
  DEPOT_JOB_BUDGET,
  DEPOT_JOB_INTERVAL_SECONDS,
  DEPOT_SUPPLY_TARGETS,
} from '../../core/depot_contracts';
import { getSystemPlanetPaths, parseGameSave } from '../../core/save_game';
import { Planet } from '../../entities/planet';
import { Starbase } from '../../entities/starbase';
import { PRNG } from '../../utils/prng';
import { depotContractFixture, depotContractSave } from '../fixtures/depot_contracts';
import { haulSystemFixture } from '../fixtures/heavy_haul_journeys';

/** Resolves one real supply offer and its narrowed typed objective for transaction tests. */
function supply(fixture: ReturnType<typeof depotContractFixture>) {
  const mission = fixture.contracts
    .list(fixture.station, fixture.system)
    .find((entry) => entry.type === 'supply');
  const objective = mission?.objectives[0];
  if (!mission || objective?.kind !== 'delivery') throw new Error('Expected funded supply offer.');
  return { mission, objective };
}

/** Applies total simulation time before asking the board to refresh its fixed offer cycle. */
function advance(fixture: ReturnType<typeof depotContractFixture>, seconds: number) {
  fixture.depots.ensureStation(fixture.station, fixture.address, seconds, 0, fixture.system);
  fixture.contracts.refreshStation(fixture.station, fixture.system, seconds);
}

describe('robotic supply and survey contracts', () => {
  it('migrates v22 profiles while preserving stocks and extraction carry', () => {
    const fixture = depotContractFixture();
    const save = depotContractSave(fixture);
    const { jobs: _jobs, ...record } = save.depots[fixture.station.id];
    const migrated = parseGameSave({ ...save, version: 22, depots: { [fixture.station.id]: record } });
    expect(migrated.depots[fixture.station.id].jobs).toBeNull();
    expect(migrated.depots[fixture.station.id].extraction).toEqual(record.extraction);
    expect(migrated.economy).toEqual(save.economy);
  });

  it('prepares deterministic bounded offers from actual shortages without changing state on reads', () => {
    const first = depotContractFixture();
    const second = depotContractFixture();
    const before = depotContractSave(first);
    const offers = first.contracts.list(first.station, first.system);
    expect(offers).toEqual(second.contracts.list(second.station, second.system));
    expect(offers.filter((mission) => mission.type === 'supply')).toHaveLength(2);
    expect(offers.filter((mission) => mission.type === 'survey')).toHaveLength(1);
    expect(offers.every((mission) => mission.sponsor === 'robotic-depot')).toBe(true);
    expect(depotContractSave(first)).toEqual(before);
  });

  it('does not reroll offers when stock is drained, menus reopen or short periods pass', () => {
    const fixture = depotContractFixture();
    const before = fixture.depots.getRecord(fixture.station.id)!.jobs!;
    advance(fixture, 10);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs).toEqual(before);
    advance(fixture, DEPOT_JOB_INTERVAL_SECONDS * 100);
    const after = fixture.depots.getRecord(fixture.station.id)!.jobs!;
    expect(after.revision).toBe(before.revision + 1);
    expect(after.availableCredits).toBe(DEPOT_JOB_BUDGET);
    fixture.contracts.refreshStation(fixture.station, fixture.system, DEPOT_JOB_INTERVAL_SECONDS * 100);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs).toEqual(after);
  });

  it('reserves payment on acceptance, with no immediate reward or cargo consumption', () => {
    const fixture = depotContractFixture();
    const { mission } = supply(fixture);
    const before = structuredClone(fixture.player.resources);
    expect(fixture.contracts.accept(mission, fixture.station, fixture.system).ok).toBe(true);
    expect(fixture.player.resources).toEqual(before);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs).toMatchObject({
      availableCredits: DEPOT_JOB_BUDGET - mission.rewardCredits,
      reservedCredits: { [mission.id]: mission.rewardCredits },
    });
    expect(fixture.progress.getStatus(mission)).toBe('ACTIVE');
    expect(fixture.contracts.accept(mission, fixture.station, fixture.system).ok).toBe(false);
  });

  it('reverts CLAIMABLE when cargo is sold or moved out of the ship hold', () => {
    const fixture = depotContractFixture();
    const { mission, objective } = supply(fixture);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    fixture.cargo.addItem(fixture.player.terrainVehicle.cargoHold, objective.itemKey, objective.quantity);
    expect(fixture.progress.getStatus(mission)).toBe('ACTIVE');
    fixture.cargo.addItem(fixture.player.cargoHold, objective.itemKey, objective.quantity);
    expect(fixture.progress.getStatus(mission)).toBe('READY');
    expect(fixture.progress.getReadyCount()).toBe(1);
    fixture.cargo.removeItem(fixture.player.cargoHold, objective.itemKey, 1);
    expect(fixture.progress.getStatus(mission)).toBe('ACTIVE');
    const before = depotContractSave(fixture);
    expect(fixture.contracts.settle(mission.id, fixture.station).ok).toBe(false);
    expect(depotContractSave(fixture)).toEqual(before);
  });

  it('atomically consumes a whole handoff, replenishes stock and pays once', () => {
    const fixture = depotContractFixture();
    const { mission, objective } = supply(fixture);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    fixture.cargo.addItem(fixture.player.cargoHold, objective.itemKey, objective.quantity + 1);
    const credits = fixture.player.resources.credits;
    const stock = fixture.commerce.getStock(fixture.station.id, objective.itemKey);
    expect(fixture.progress.handIn(mission.id, fixture.station.name, fixture.station.id)).toBeNull();
    expect(fixture.contracts.settle(mission.id, fixture.station)).toMatchObject({
      ok: true,
      credits: mission.rewardCredits,
    });
    expect(fixture.player.cargoHold.items[objective.itemKey]).toBe(1);
    expect(fixture.commerce.getStock(fixture.station.id, objective.itemKey)).toBe(stock + objective.quantity);
    expect(fixture.player.resources.credits).toBe(credits + mission.rewardCredits);
    expect(fixture.progress.getStatus(mission)).toBe('COMPLETE');
    const paid = depotContractSave(fixture);
    expect(fixture.contracts.settle(mission.id, fixture.station).ok).toBe(false);
    expect(depotContractSave(fixture)).toEqual(paid);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs!.reservedCredits).toEqual({});
  });

  it('honours accepted terms after replenishment and receives deliveries even into full stores', () => {
    const fixture = depotContractFixture();
    const { mission, objective } = supply(fixture);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    fixture.commerce.addStock(fixture.station.id, objective.itemKey, 100);
    advance(fixture, DEPOT_JOB_INTERVAL_SECONDS);
    expect(fixture.progress.getMission(mission.id)).toEqual(mission);
    fixture.cargo.addItem(fixture.player.cargoHold, objective.itemKey, objective.quantity);
    expect(fixture.contracts.settle(mission.id, fixture.station).ok).toBe(true);
    expect(fixture.commerce.getStock(fixture.station.id, objective.itemKey)).toBe(100 + objective.quantity);
  });

  it('rejects changed terms and wrong-station acceptance or settlement', () => {
    const fixture = depotContractFixture();
    const { mission, objective } = supply(fixture);
    const other = new Starbase('other', new PRNG('other'), fixture.system.name, 'automated-depot');
    expect(
      fixture.contracts.accept(
        { ...mission, rewardCredits: mission.rewardCredits + 1 },
        fixture.station,
        fixture.system
      ).ok
    ).toBe(false);
    expect(fixture.contracts.accept(mission, other, fixture.system).ok).toBe(false);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    fixture.cargo.addItem(fixture.player.cargoHold, objective.itemKey, objective.quantity);
    const before = depotContractSave(fixture);
    expect(fixture.contracts.settle(mission.id, other).ok).toBe(false);
    expect(depotContractSave(fixture)).toEqual(before);
  });

  it('leaves every owner unchanged on failed acceptance or payment checkpoints', () => {
    const fixture = depotContractFixture();
    const { mission, objective } = supply(fixture);
    const initial = depotContractSave(fixture);
    expect(
      fixture.contracts.accept(mission, fixture.station, fixture.system, () => {
        throw new Error('Storage full');
      }).ok
    ).toBe(false);
    expect(depotContractSave(fixture)).toEqual(initial);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    fixture.cargo.addItem(fixture.player.cargoHold, objective.itemKey, objective.quantity);
    const before = depotContractSave(fixture);
    expect(
      fixture.contracts.settle(mission.id, fixture.station, (outcome) => {
        expect(depotContractSave(fixture)).toEqual(before);
        expect(outcome.resources.credits).toBe(before.player.resources.credits + mission.rewardCredits);
        expect(outcome.cargoHold.items[objective.itemKey]).toBeUndefined();
        throw new Error('Storage full');
      }).ok
    ).toBe(false);
    expect(depotContractSave(fixture)).toEqual(before);
  });

  it('persists exact terms and escrow through a full save round-trip', () => {
    const fixture = depotContractFixture();
    const { mission, objective } = supply(fixture);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    fixture.cargo.addItem(fixture.player.cargoHold, objective.itemKey, objective.quantity);
    const saved = parseGameSave(JSON.stringify(depotContractSave(fixture)));
    fixture.depots.restoreSnapshot(saved.depots);
    fixture.commerce.restoreSnapshot(saved.economy);
    fixture.progress.restoreSnapshot(saved);
    expect(fixture.progress.getStatus(mission)).toBe('READY');
    expect(fixture.contracts.settle(mission.id, fixture.station).ok).toBe(true);
    expect(parseGameSave(depotContractSave(fixture)).completedMissionIds).toContain(mission.id);
  });

  it('releases cancelled escrow, retires the offer and preserves the refresh deadline', () => {
    const fixture = depotContractFixture();
    const { mission } = supply(fixture);
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    const deadline = fixture.depots.getRecord(fixture.station.id)!.jobs!.nextRefreshSeconds;
    expect(fixture.contracts.cancel(mission.id, fixture.station).ok).toBe(true);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs!.availableCredits).toBe(DEPOT_JOB_BUDGET);
    expect(
      fixture.contracts.list(fixture.station, fixture.system).some((offer) => offer.id === mission.id)
    ).toBe(false);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs!.nextRefreshSeconds).toBe(deadline);
    expect(fixture.contracts.cancel(mission.id, fixture.station).ok).toBe(false);
  });

  it('does not replenish exhausted sponsor funds during a long sleep', () => {
    const fixture = depotContractFixture();
    const snapshot = fixture.depots.createSnapshot();
    snapshot[fixture.station.id].jobs!.availableCredits = 0;
    snapshot[fixture.station.id].jobs!.offers = [];
    fixture.depots.restoreSnapshot(snapshot);
    advance(fixture, 1000 * DEPOT_JOB_INTERVAL_SECONDS);
    expect(fixture.contracts.list(fixture.station, fixture.system)).toEqual([]);
    expect(fixture.depots.getRecord(fixture.station.id)!.jobs!.availableCredits).toBe(0);
  });

  it('does not offer supply work when stocks are adequate or surveys when bodies are measured', () => {
    const fixture = depotContractFixture();
    for (const [key, target] of Object.entries(DEPOT_SUPPLY_TARGETS))
      fixture.commerce.addStock(fixture.station.id, key, target);
    for (const { planet } of getSystemPlanetPaths(fixture.system)) planet.discovery.level = 'surveyed';
    advance(fixture, DEPOT_JOB_INTERVAL_SECONDS);
    expect(fixture.contracts.list(fixture.station, fixture.system)).toEqual([]);
  });

  it('enforces full projected addresses and actual body paths on survey completion', () => {
    const fixture = depotContractFixture();
    const mission = fixture.contracts
      .list(fixture.station, fixture.system)
      .find((entry) => entry.type === 'survey')!;
    const objective = mission.objectives[0];
    const target = getSystemPlanetPaths(fixture.system).find(
      ({ path }) => path === objective.location?.bodyPath
    )!.planet;
    fixture.contracts.accept(mission, fixture.station, fixture.system);
    expect(fixture.progress.recordDiscovery(target, fixture.system.name, 'surveyed')).toEqual([]);
    const other = haulSystemFixture({ ...fixture.address, systemSlot: 1 });
    Object.assign(other, { name: fixture.system.name });
    const impostor = Object.assign(Object.create(Planet.prototype), {
      name: target.name,
      moons: [],
    }) as Planet;
    expect(fixture.progress.recordDiscovery(target, other.name, 'surveyed', other)).toEqual([]);
    expect(
      fixture.progress.recordDiscovery(impostor, fixture.system.name, 'surveyed', fixture.system)
    ).toEqual([]);
    const updates = fixture.progress.recordDiscovery(target, fixture.system.name, 'surveyed', fixture.system);
    expect(updates[0].readyForReturn).toBe(true);
    expect(fixture.contracts.settle(mission.id, fixture.station)).toMatchObject({ ok: true, credits: 420 });
  });

  it('does not accept stale survey offers for bodies already scanned before acceptance', () => {
    const fixture = depotContractFixture();
    const mission = fixture.contracts
      .list(fixture.station, fixture.system)
      .find((entry) => entry.type === 'survey')!;
    const target = getSystemPlanetPaths(fixture.system).find(
      ({ path }) => path === mission.objectives[0].location?.bodyPath
    )!.planet;
    target.discovery.level = 'surveyed';
    expect(fixture.contracts.accept(mission, fixture.station, fixture.system).ok).toBe(false);
  });

  it('keeps accepted work within two supply slots and one survey slot across refreshes', () => {
    const fixture = depotContractFixture();
    for (const offer of fixture.contracts.list(fixture.station, fixture.system))
      fixture.contracts.accept(offer, fixture.station, fixture.system);
    expect(fixture.progress.getActiveCount()).toBe(3);
    advance(fixture, DEPOT_JOB_INTERVAL_SECONDS);
    expect(fixture.contracts.list(fixture.station, fixture.system)).toEqual([]);
    expect(parseGameSave(depotContractSave(fixture)).activeMissions).toEqual(
      fixture.progress.createSnapshot().activeMissions
    );
  });

  it.each(['unfunded', 'duplicated-offer', 'excess-budget', 'invalid-quantity', 'durable-cargo'])(
    'rejects malformed save ledger: %s',
    (kind) => {
      const fixture = depotContractFixture();
      const { mission } = supply(fixture);
      fixture.contracts.accept(mission, fixture.station, fixture.system);
      const save = depotContractSave(fixture);
      const jobs = save.depots[fixture.station.id].jobs!;
      if (kind === 'unfunded') delete jobs.reservedCredits[mission.id];
      if (kind === 'duplicated-offer') jobs.offers.push(jobs.offers[0]);
      if (kind === 'excess-budget') jobs.availableCredits = DEPOT_JOB_BUDGET;
      if (kind === 'invalid-quantity') {
        const objective = save.activeMissions[mission.id].objectives[0];
        if (objective.kind === 'delivery') objective.quantity = -1;
      }
      if (kind === 'durable-cargo') save.missionObjectiveProgress[mission.id] = ['supply-handoff'];
      expect(() => parseGameSave(save)).toThrow();
    }
  );
});
