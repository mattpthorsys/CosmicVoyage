import { describe, expect, it } from 'vitest';
import { DepotService } from '../../core/depot_service';
import { validateDepotSnapshot } from '../../core/depot_types';
import { StarbaseCommerceService } from '../../core/starbase_commerce';
import { Player } from '../../core/player';
import { Starbase } from '../../entities/starbase';
import { PRNG } from '../../utils/prng';
import { CargoSystem } from '../../systems/cargo_systems';
import { purchaseRepairs } from '../../core/ship_repair_console';

/** Builds independent campaign owners and a real uncrewed station without preparing terrain. */
function depotFixture(seed = 'depot-test') {
  const player = new Player(0, 0, '@', seed);
  const cargo = new CargoSystem();
  const commerce = new StarbaseCommerceService(player, cargo, 12345);
  const service = new DepotService(commerce, seed, player, cargo);
  const station = new Starbase('depot-a', new PRNG(seed), 'Frontier A', 'automated-depot');
  const address = { worldX: 0, worldY: 0, systemSlot: 0 };
  service.ensureStation(station, address, 100);
  return { player, cargo, commerce, service, station, address };
}

describe('persistent automated-depot operations', () => {
  it('seeds reproducible service supplies without consuming the station PRNG', () => {
    const first = depotFixture();
    const second = depotFixture();
    expect(first.commerce.createSnapshot()).toEqual(second.commerce.createSnapshot());
    expect(first.service.createSnapshot()).toEqual(second.service.createSnapshot());
    expect(first.commerce.getStock(first.station.id, 'REPAIR_SPARES')).toBeGreaterThan(0);
  });

  it('preserves depletion across revisits and advances only the operational epoch', () => {
    const { commerce, service, station, address } = depotFixture();
    const units = commerce.getStock(station.id, 'REPAIR_SPARES');
    expect(commerce.consumeStock(station.id, { REPAIR_SPARES: units })).toBe(true);
    service.ensureStation(station, address, 1_000_000);
    expect(commerce.getStock(station.id, 'REPAIR_SPARES')).toBe(0);
    expect(service.getRecord(station.id)?.lastUpdatedSeconds).toBe(1_000_000);
  });

  it('restores detached snapshots without reseeding a depleted inventory', () => {
    const original = depotFixture();
    original.commerce.consumeStock(original.station.id, { MEDICAL_SUPPLIES: 1 });
    const economy = original.commerce.createSnapshot();
    const snapshot = original.service.createSnapshot();
    const restored = depotFixture();
    restored.commerce.restoreSnapshot(economy);
    restored.service.restoreSnapshot(snapshot);
    restored.service.ensureStation(restored.station, restored.address, 200);
    expect(restored.commerce.createSnapshot()).toEqual(economy);
    snapshot[original.station.id].revision = 100;
    expect(restored.service.getRecord(restored.station.id)?.revision).toBe(0);
  });

  it('initialises a migrated depot without replacing existing zero stock', () => {
    const { commerce, service, station, address } = depotFixture();
    commerce.consumeStock(station.id, { TITANIUM_TRUSS: commerce.getStock(station.id, 'TITANIUM_TRUSS') });
    service.restoreSnapshot({});
    service.ensureStation(station, address, 500);
    expect(commerce.getStock(station.id, 'TITANIUM_TRUSS')).toBe(0);
  });

  it('does not partially consume a recipe with a missing component', () => {
    const { commerce, station } = depotFixture();
    const before = commerce.createSnapshot();
    expect(commerce.consumeStock(station.id, { TITANIUM_TRUSS: 1, REPAIR_SPARES: 100 })).toBe(false);
    expect(commerce.createSnapshot()).toEqual(before);
  });

  it('distinguishes station identities and rejects relocation of an existing record', () => {
    const { commerce, service, station } = depotFixture();
    const other = new Starbase('depot-b', new PRNG('other'), station.name, 'automated-depot');
    service.ensureStation(other, { worldX: 5, worldY: 0, systemSlot: 0 }, 100);
    commerce.consumeStock(station.id, { MEDICAL_SUPPLIES: 1 });
    expect(service.createSnapshot()[other.id].address.worldX).toBe(5);
    expect(() => service.ensureStation(station, { worldX: 5, worldY: 0, systemSlot: 0 }, 100)).toThrow();
  });

  it('validates shared inventory and refuses future or invalid epochs', () => {
    const { commerce, service, station } = depotFixture();
    const snapshot = service.createSnapshot();
    expect(() => validateDepotSnapshot(snapshot, 100, commerce.createSnapshot())).not.toThrow();
    expect(() => validateDepotSnapshot(snapshot, 100, {})).toThrow();
    snapshot[station.id].lastUpdatedSeconds = 101;
    expect(() => validateDepotSnapshot(snapshot, 100, commerce.createSnapshot())).toThrow();
    snapshot[station.id].lastUpdatedSeconds = Number.NaN;
    expect(() => validateDepotSnapshot(snapshot, 100, commerce.createSnapshot())).toThrow();
  });
});

describe('finite robotic repairs and reactor loading', () => {
  it('restores hull and secured rover without repairing unsupported ship equipment', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 80;
    player.ship.damage.subsystemDamage = { drive: 25 };
    player.terrainVehicle.integrity = 80;
    const before = commerce.getStock(station.id, 'REPAIR_SPARES');
    const quote = service.quote(station.id, 'repair', 'all');
    expect(quote.completedUnits).toBe(40);
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.ship.damage.hullIntegrity).toBe(100);
    expect(player.terrainVehicle.integrity).toBe(100);
    expect(player.ship.damage.subsystemDamage).toEqual({ drive: 25 });
    expect(commerce.getStock(station.id, 'REPAIR_SPARES')).toBe(before - 3);
    expect(service.quote(station.id, 'repair', 'drive').completedUnits).toBe(0);
  });

  it('quotes partial work against shared supplies and leaves unmet damage intact', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 50;
    commerce.consumeStock(station.id, { REPAIR_SPARES: commerce.getStock(station.id, 'REPAIR_SPARES') - 1 });
    const quote = service.quote(station.id, 'repair', 'hull');
    expect(quote.completedUnits).toBe(10);
    expect(quote.shortfalls.join(' ')).toContain('Workshop Spares');
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.ship.damage.hullIntegrity).toBe(60);
    expect(commerce.getStock(station.id, 'REPAIR_SPARES')).toBe(0);
  });

  it('does not consume ship cargo until supplementation is explicitly enabled', () => {
    const { player, cargo, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 80;
    commerce.consumeStock(station.id, { REPAIR_SPARES: commerce.getStock(station.id, 'REPAIR_SPARES') });
    cargo.addItem(player.cargoHold, 'REPAIR_SPARES', 2);
    expect(service.quote(station.id, 'repair', 'hull').completedUnits).toBe(0);
    expect(player.cargoHold.items.REPAIR_SPARES).toBe(2);
    const enabled = service.quote(station.id, 'repair', 'hull', true);
    expect(enabled.cargoSupplies).toEqual({ REPAIR_SPARES: 2 });
    expect(service.purchase(enabled).ok).toBe(true);
    expect(player.cargoHold.items.REPAIR_SPARES).toBeUndefined();
  });

  it('requires a sealed batch even for a small repair and never rounds charges down to free work', () => {
    const { player, service, station } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 99.5;
    const quote = service.quote(station.id, 'repair', 'hull');
    expect(quote.completedUnits).toBe(0.5);
    expect(quote.stationSupplies).toEqual({ TITANIUM_TRUSS: 1, REPAIR_SPARES: 1 });
    expect(quote.cost).toBeGreaterThan(0);
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.ship.damage.hullIntegrity).toBe(100);
  });

  it('refuses stale and repeated confirmations without changing inventory or credits', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 80;
    const stale = service.quote(station.id, 'repair', 'hull');
    player.resources.credits++;
    const before = commerce.createSnapshot();
    expect(service.purchase(stale).ok).toBe(false);
    expect(commerce.createSnapshot()).toEqual(before);
    const fresh = service.quote(station.id, 'repair', 'hull');
    expect(service.purchase(fresh).ok).toBe(true);
    const paid = player.resources.credits;
    expect(service.purchase(fresh).ok).toBe(false);
    expect(player.resources.credits).toBe(paid);
  });

  it('checkpoint failure leaves all live owners unchanged', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 80;
    const quote = service.quote(station.id, 'repair', 'hull');
    const account = structuredClone({
      ship: player.ship,
      cargo: player.cargoHold,
      resources: player.resources,
    });
    const stock = commerce.createSnapshot();
    const records = service.createSnapshot();
    const result = service.purchase(quote, () => {
      throw new Error('Storage full');
    });
    expect(result.ok).toBe(false);
    expect({ ship: player.ship, cargo: player.cargoHold, resources: player.resources }).toEqual(account);
    expect(commerce.createSnapshot()).toEqual(stock);
    expect(service.createSnapshot()).toEqual(records);
  });

  it('offers no unavailable rover or unaffordable repairs', () => {
    const { player, service, station, commerce } = depotFixture();
    player.ship.damage.hullIntegrity = 80;
    player.terrainVehicle.available = false;
    player.resources.credits = 0;
    expect(service.getQuotes(station.id, 'repair').map((quote) => quote.targetId)).toEqual(['all', 'hull']);
    const before = commerce.createSnapshot();
    expect(service.purchase(service.quote(station.id, 'repair', 'hull')).ok).toBe(false);
    expect(commerce.createSnapshot()).toEqual(before);
  });

  it('consumes real fusion stock, respects tank capacity and reports missing feedstock', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.resources.fuel = player.resources.maxFuel - 45;
    const helium = commerce.getStock(station.id, 'HELIUM_3');
    const quote = service.quote(station.id, 'fuel', 'fuel');
    expect(quote.completedUnits).toBe(45);
    expect(quote.stationSupplies).toEqual({ HELIUM_3: 2, DEUTERIUM_PELLETS: 2 });
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.resources.fuel).toBe(player.resources.maxFuel);
    expect(commerce.getStock(station.id, 'HELIUM_3')).toBe(helium - 2);
    commerce.consumeStock(station.id, { HELIUM_3: commerce.getStock(station.id, 'HELIUM_3') });
    player.resources.fuel -= 40;
    expect(service.quote(station.id, 'fuel', 'fuel').shortfalls.join(' ')).toContain('Helium-3');
  });

  it('recognises both carried deuterium forms without consuming either without consent', () => {
    const { player, cargo, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.resources.fuel = player.resources.maxFuel - 80;
    commerce.consumeStock(station.id, {
      HELIUM_3: commerce.getStock(station.id, 'HELIUM_3'),
      DEUTERIUM_PELLETS: commerce.getStock(station.id, 'DEUTERIUM_PELLETS'),
    });
    cargo.addItem(player.cargoHold, 'HELIUM_3', 2);
    cargo.addItem(player.cargoHold, 'DEUTERIUM', 1);
    cargo.addItem(player.cargoHold, 'DEUTERIUM_PELLETS', 1);
    expect(service.quote(station.id, 'fuel', 'fuel').completedUnits).toBe(0);
    const quote = service.quote(station.id, 'fuel', 'fuel', true);
    expect(quote.cargoSupplies).toEqual({ HELIUM_3: 2, DEUTERIUM: 1, DEUTERIUM_PELLETS: 1 });
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.resources.fuel).toBe(player.resources.maxFuel);
    expect(player.cargoHold.items.HELIUM_3).toBeUndefined();
  });

  it('keeps staffed-port repair rates and cargo-free restoration unchanged', () => {
    const { player } = depotFixture();
    player.resources.credits = 10_000;
    player.ship.damage.hullIntegrity = 80;
    expect(purchaseRepairs(player, 'hull')).toMatchObject({ ok: true, cost: 240 });
    expect(player.resources.credits).toBe(9760);
  });
});
