import { describe, expect, it } from 'vitest';
import { DepotService } from '../../core/depot_service';
import { validateDepotSnapshot } from '../../core/depot_types';
import { StarbaseCommerceService } from '../../core/starbase_commerce';
import { Player } from '../../core/player';
import { Starbase } from '../../entities/starbase';
import { PRNG } from '../../utils/prng';
import { CargoSystem } from '../../systems/cargo_systems';

/** Builds independent campaign owners and a real uncrewed station without preparing terrain. */
function depotFixture(seed = 'depot-test') {
  const player = new Player(0, 0, '@', seed);
  const commerce = new StarbaseCommerceService(player, new CargoSystem(), 12345);
  const service = new DepotService(commerce, seed);
  const station = new Starbase('depot-a', new PRNG(seed), 'Frontier A', 'automated-depot');
  const address = { worldX: 0, worldY: 0, systemSlot: 0 };
  service.ensureStation(station, address, 100);
  return { player, commerce, service, station, address };
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
