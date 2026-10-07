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

describe('robotic medical treatment', () => {
  it('treats an injured patient without altering healthy crew or other resources', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    const patient = player.crew[0];
    patient.hitPoints = patient.maxHitPoints - 15;
    const healthy = player.crew[1];
    const healthyHP = healthy.hitPoints;
    const before = commerce.getStock(station.id, 'MEDICAL_SUPPLIES');
    const quote = service.quote(station.id, 'medical', `crew:${patient.id}`);
    expect(quote.unitLabel).toBe('health points');
    expect(quote.completedUnits).toBe(15);
    expect(quote.stationSupplies).toEqual({ MEDICAL_SUPPLIES: 1 });
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.crew.find((member) => member.id === patient.id)?.hitPoints).toBe(patient.maxHitPoints);
    expect(player.crew.find((member) => member.id === healthy.id)?.hitPoints).toBe(healthyHP);
    expect(commerce.getStock(station.id, 'MEDICAL_SUPPLIES')).toBe(before - 1);
  });

  it('triages the most injured first and shares finite supplies across all patients', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    const [first, second] = player.crew;
    first.hitPoints = first.maxHitPoints - 5;
    second.hitPoints = 1;
    commerce.consumeStock(station.id, {
      MEDICAL_SUPPLIES: commerce.getStock(station.id, 'MEDICAL_SUPPLIES') - 1,
    });
    const quote = service.quote(station.id, 'medical', 'all');
    expect(quote.work[0].id).toBe(`crew:${second.id}`);
    expect(quote.completedUnits).toBe(20);
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.crew.find((member) => member.id === second.id)?.hitPoints).toBe(21);
    expect(player.crew.find((member) => member.id === first.id)?.hitPoints).toBe(first.hitPoints);
    expect(commerce.getStock(station.id, 'MEDICAL_SUPPLIES')).toBe(0);
  });

  it('never charges healthy crew or resurrects zero-HP crew', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.crew[0].hitPoints = 0;
    const credits = player.resources.credits;
    const before = commerce.createSnapshot();
    expect(service.quote(station.id, 'medical', `crew:${player.crew[0].id}`).completedUnits).toBe(0);
    expect(service.purchase(service.quote(station.id, 'medical', 'all')).ok).toBe(false);
    expect(player.crew[0].hitPoints).toBe(0);
    expect(player.resources.credits).toBe(credits);
    expect(commerce.createSnapshot()).toEqual(before);
  });

  it('rejects changed or removed patients without consuming medicines', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    const patient = player.crew[0];
    patient.hitPoints -= 10;
    const quote = service.quote(station.id, 'medical', `crew:${patient.id}`);
    player.crew = player.crew.filter((member) => member.id !== patient.id);
    const before = commerce.createSnapshot();
    expect(service.purchase(quote).ok).toBe(false);
    expect(commerce.createSnapshot()).toEqual(before);
  });

  it('requires a fresh clinical quote after injury changes and refuses repeated treatment', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    const patient = player.crew[0];
    patient.hitPoints -= 10;
    const stale = service.quote(station.id, 'medical', `crew:${patient.id}`);
    patient.hitPoints -= 5;
    const stock = commerce.createSnapshot();
    const credits = player.resources.credits;
    expect(service.purchase(stale).ok).toBe(false);
    expect(commerce.createSnapshot()).toEqual(stock);
    expect(player.resources.credits).toBe(credits);
    const fresh = service.quote(station.id, 'medical', `crew:${patient.id}`);
    expect(service.purchase(fresh).ok).toBe(true);
    const paidStock = commerce.createSnapshot();
    const paidCredits = player.resources.credits;
    expect(service.purchase(fresh).ok).toBe(false);
    expect(commerce.createSnapshot()).toEqual(paidStock);
    expect(player.resources.credits).toBe(paidCredits);
  });

  it('can supplement a depleted med bay from explicitly authorised ship supplies', () => {
    const { player, service, station, commerce, cargo } = depotFixture();
    player.resources.credits = 10_000;
    const patient = player.crew[0];
    patient.hitPoints -= 10;
    commerce.consumeStock(station.id, {
      MEDICAL_SUPPLIES: commerce.getStock(station.id, 'MEDICAL_SUPPLIES'),
    });
    cargo.addItem(player.cargoHold, 'MEDICAL_SUPPLIES', 1);
    expect(service.quote(station.id, 'medical', 'all').completedUnits).toBe(0);
    const quote = service.quote(station.id, 'medical', 'all', true);
    expect(quote.cargoSupplies).toEqual({ MEDICAL_SUPPLIES: 1 });
    expect(service.purchase(quote).ok).toBe(true);
    expect(player.cargoHold.items.MEDICAL_SUPPLIES).toBeUndefined();
    expect(player.crew.find((member) => member.id === patient.id)?.hitPoints).toBe(patient.maxHitPoints);
  });

  it('provides a complete detached checkpoint containing the healed patient and depleted inventory', () => {
    const { player, service, station, commerce } = depotFixture();
    player.resources.credits = 10_000;
    player.crew[0].hitPoints -= 10;
    const beforeHP = player.crew[0].hitPoints;
    const beforeStock = commerce.getStock(station.id, 'MEDICAL_SUPPLIES');
    const quote = service.quote(station.id, 'medical', `crew:${player.crew[0].id}`);
    let checkpoints = 0;
    expect(
      service.purchase(quote, (next) => {
        checkpoints++;
        expect(player.crew[0].hitPoints).toBe(beforeHP);
        expect(commerce.getStock(station.id, 'MEDICAL_SUPPLIES')).toBe(beforeStock);
        expect(next.player.crew[0].hitPoints).toBe(next.player.crew[0].maxHitPoints);
        expect(next.economy[station.id].items.MEDICAL_SUPPLIES.units).toBe(beforeStock - 1);
        expect(next.depots[station.id].revision).toBe(1);
      }).ok
    ).toBe(true);
    expect(checkpoints).toBe(1);
  });
});
