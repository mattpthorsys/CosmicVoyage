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

  it('persists stock changes and restores them into a new commerce service', () => {
    const first = createCommerce();
    first.player.resources.credits = 10_000;
    const before = first.commerce.getManifest('Fuel Dock').find((item) => item.itemKey === 'WATER_ICE')!;

    first.commerce.buyItem('Fuel Dock', 'WATER_ICE', 2);
    const after = first.commerce.getManifest('Fuel Dock').find((item) => item.itemKey === 'WATER_ICE')!;
    const restored = createCommerce();
    restored.commerce.restoreSnapshot(first.commerce.createSnapshot());

    expect(after.units).toBe(before.units - 2);
    expect(
      restored.commerce.getManifest('Fuel Dock').find((item) => item.itemKey === 'WATER_ICE')?.units
    ).toBe(after.units);
  });

  it('uses trade and communication skill to improve station purchase prices', () => {
    const skilled = createCommerce();
    const baseline = createCommerce();
    skilled.player.crew.forEach((member) => {
      member.skills.trade = 10;
      member.skills.communication = 10;
    });

    const skilledMarket = skilled.commerce.getManifest('Fuel Dock');
    const baselineMarket = baseline.commerce.getManifest('Fuel Dock');
    const baselineItem = [...baselineMarket].sort((a, b) => b.buyPrice - a.buyPrice)[0];
    const skilledItem = skilledMarket.find((item) => item.itemKey === baselineItem.itemKey)!;

    expect(skilledItem.buyPrice).toBeLessThan(baselineItem.buyPrice);
    expect(skilledItem.sellPrice).toBe(Math.floor(skilledItem.buyPrice / 2));
    expect(baselineItem.sellPrice).toBe(Math.floor(baselineItem.buyPrice / 2));
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

  it('buys any recognized mined element for half its local resale price', () => {
    const { player, cargo, commerce } = createCommerce();
    cargo.addItem(player.cargoHold, 'IRON', 4);
    const before = commerce.getManifest('Remote Dock');
    expect(before.some((item) => item.itemKey === 'IRON')).toBe(false);
    const quote = commerce.getTradeQuote('Remote Dock', 'IRON');
    if (!quote) throw new Error('Expected an iron assay quote.');

    const result = commerce.sellItem('Remote Dock', 'IRON', 3);
    const stocked = commerce.getManifest('Remote Dock').find((item) => item.itemKey === 'IRON');

    expect(quote.sellPrice).toBe(Math.floor(quote.buyPrice / 2));
    expect(result.effects.creditsChanged?.amountChanged).toBe(3 * quote.sellPrice);
    expect(player.cargoHold.items.IRON).toBe(1);
    expect(stocked?.units).toBe(3);
    expect(stocked?.buyPrice).toBe(quote.buyPrice);
  });

  it('leaves unidentified cargo aboard when selling all recognized material', () => {
    const { player, cargo, commerce } = createCommerce();
    cargo.addItem(player.cargoHold, 'IRON', 2);
    cargo.addItem(player.cargoHold, 'UNKNOWN_RELIC', 1);

    const result = commerce.sellAll('Remote Dock');

    expect(result.effects.cargoSold?.itemsSold).toEqual({ IRON: 2 });
    expect(player.cargoHold.items.IRON).toBeUndefined();
    expect(player.cargoHold.items.UNKNOWN_RELIC).toBe(1);
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
