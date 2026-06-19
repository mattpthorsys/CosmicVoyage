import { describe, expect, it } from 'vitest';
import { Player } from '../../core/player';
import { StarbaseCommerceService } from '../../core/starbase_commerce';
import { CargoSystem } from '../../systems/cargo_systems';

/** Creates commerce. */
function createCommerce(seed = 12345) {
  const player = new Player(0, 0, '@', 'commerce-test');
  const cargo = new CargoSystem();
  const commerce = new StarbaseCommerceService(player, cargo, seed);
  return { player, cargo, commerce };
}

describe('StarbaseCommerceService', () => {
  it('generates stable local markets from station identity and world seed', () => {
    const first = createCommerce().commerce.getManifest('Fuel Dock');
    const second = createCommerce().commerce.getManifest('Fuel Dock');
    const otherStation = createCommerce().commerce.getManifest('Frontier Exchange');

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(5);
    expect(otherStation).not.toEqual(first);
  });

  it('buys fusion mix as equal helium-3 and deuterium cargo', () => {
    const { player, commerce } = createCommerce();
    player.resources.credits = 10_000;

    const result = commerce.buyItem('Fuel Dock', 'FUSION_FUEL_MIX', 10);

    expect(result.message).toContain('Helium-3');
    expect(player.cargoHold.items.HELIUM_3).toBe(5);
    expect(player.cargoHold.items.DEUTERIUM_PELLETS).toBe(5);
    expect(player.cargoHold.items.FUSION_FUEL_MIX).toBeUndefined();
    expect(result.effects.cargoAdded?.items).toEqual({
      HELIUM_3: 5,
      DEUTERIUM_PELLETS: 5,
    });
    expect(result.effects.creditsChanged?.amountChanged).toBeLessThan(0);
  });

  it('sells a requested cargo amount and reports resulting effects', () => {
    const { player, cargo, commerce } = createCommerce();
    const item = commerce.getManifest('Fuel Dock').find((candidate) => candidate.itemKey === 'WATER_ICE')!;
    cargo.addItem(player.cargoHold, item.itemKey, 7);
    const oldCredits = player.resources.credits;

    const result = commerce.sellItem('Fuel Dock', item.itemKey, 3);

    expect(player.cargoHold.items[item.itemKey]).toBe(4);
    expect(player.resources.credits).toBe(oldCredits + 3 * item.sellPrice);
    expect(result.effects.cargoSold?.itemsSold).toEqual({ [item.itemKey]: 3 });
    expect(result.effects.creditsChanged?.amountChanged).toBe(3 * item.sellPrice);
  });

  it('uses carried reactor feedstock before station credits', () => {
    const { player, cargo, commerce } = createCommerce();
    player.resources.fuel = player.resources.maxFuel - 80;
    player.resources.credits = 0;
    cargo.addItem(player.cargoHold, 'HELIUM_3', 2);
    cargo.addItem(player.cargoHold, 'DEUTERIUM', 1);
    cargo.addItem(player.cargoHold, 'DEUTERIUM_PELLETS', 1);

    const result = commerce.refuel();

    expect(player.resources.fuel).toBe(player.resources.maxFuel);
    expect(player.cargoHold.items.HELIUM_3).toBeUndefined();
    expect(player.cargoHold.items.DEUTERIUM).toBeUndefined();
    expect(player.cargoHold.items.DEUTERIUM_PELLETS).toBeUndefined();
    expect(result.message).toContain('Tank full');
    expect(result.effects.fuelChanged?.amountChanged).toBe(80);
    expect(result.effects.creditsChanged).toBeUndefined();
  });
});
