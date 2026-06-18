import { CONFIG } from '../config';
import { ELEMENTS } from '../constants/resources';
import { STATUS_MESSAGES } from '../constants/messages';
import { TRADE_COMMODITIES } from '../constants/trade';
import { fastHash } from '../utils/hash';
import { Player } from './player';
import { CargoSystem } from '../systems/cargo_systems';

export interface TradeDepotItem {
  itemKey: string;
  name: string;
  description: string;
  category: string;
  units: number;
  buyPrice: number;
  sellPrice: number;
}

export interface CommerceEffects {
  cargoAdded?: { elementKey: string; amount: number; items: Record<string, number> };
  cargoSold?: { itemsSold: Record<string, number>; creditsEarned: number; newCredits: number };
  creditsChanged?: { newCredits: number; amountChanged: number };
  fuelChanged?: { newFuel: number; maxFuel: number; amountChanged: number };
  actionFailed?: { action: 'TRADE' | 'REFUEL'; reason: string };
}

export interface CommerceResult {
  message: string;
  effects: CommerceEffects;
}

export interface BuyNextResult extends CommerceResult {
  nextSelectionIndex: number;
}

type CargoAddResult = { added: number; addedItems: Record<string, number> };

export function getTradeItemInfo(itemKey: string): { name: string; baseValue: number } | null {
  const commodity = TRADE_COMMODITIES[itemKey];
  if (commodity) return { name: commodity.name, baseValue: commodity.baseValue };
  const element = ELEMENTS[itemKey];
  if (element) return { name: element.name, baseValue: element.baseValue };
  return null;
}

const DEPOT_KEYS = [
  'WATER_ICE',
  'HYDROGEN_SLUSH',
  'HELIUM_3',
  'DEUTERIUM_PELLETS',
  'FUSION_FUEL_MIX',
  'TITANIUM_TRUSS',
  'SILICON_WAFERS',
  'RARE_EARTH_MAGNETS',
  'CATALYST_MESH',
  'HYDROPONIC_CULTURES',
  'MEDICAL_ISOTOPES',
  'SURVEY_DRONES',
  'NAV_BEACONS',
  'VACUUM_COFFEE',
  'CAPTAINS_SOCKS',
] as const;

export class StarbaseCommerceService {
  constructor(
    private readonly player: Player,
    private readonly cargoSystem: CargoSystem,
    private readonly worldSeed: number
  ) {}

  getManifest(starbaseName: string): TradeDepotItem[] {
    const depotKeys = DEPOT_KEYS.filter((key) => TRADE_COMMODITIES[key]);
    const hashOffset = Math.abs(fastHash(starbaseName.length, starbaseName.charCodeAt(0) || 0, this.worldSeed));
    return depotKeys
      .filter((itemKey, index) => TRADE_COMMODITIES[itemKey].rarity > 0.1 || (hashOffset + index * 23) % 100 < 18)
      .map((itemKey, index) => {
        const commodity = TRADE_COMMODITIES[itemKey];
        const localVariance = 0.9 + ((hashOffset + index * 17) % 34) / 100;
        const units = Math.max(
          1,
          Math.floor((CONFIG.TRADE_DEPOT_STOCK_UNITS + ((hashOffset + index * 7) % 9)) * commodity.rarity)
        );
        return {
          itemKey,
          name: commodity.name,
          description: commodity.description,
          category: commodity.category,
          units,
          buyPrice: Math.max(1, Math.ceil(commodity.baseValue * CONFIG.TRADE_BUY_MARKUP * localVariance)),
          sellPrice: Math.max(1, Math.floor(commodity.baseValue * CONFIG.TRADE_SELL_MARKDOWN * localVariance)),
        };
      });
  }

  getItemInfo(itemKey: string): { name: string; baseValue: number } | null {
    return getTradeItemInfo(itemKey);
  }

  getPurchaseLimit(itemKey: string, rawLimit: number): number {
    const limit = Math.max(0, Math.floor(rawLimit));
    if (itemKey !== 'FUSION_FUEL_MIX') return limit;
    return Math.floor(limit / 2) * 2;
  }

  formatManifest(market: TradeDepotItem[]): string {
    const offers = market
      .slice(0, 6)
      .map((item) => `${item.name} ${item.buyPrice}Cr`)
      .join(', ');
    return `Trade depot offers: ${offers}. Need cargo space and credits to buy.`;
  }

  buyItem(starbaseName: string, itemKey: string, amount: number): CommerceResult {
    const item = this.getManifest(starbaseName).find((candidate) => candidate.itemKey === itemKey);
    if (!item) return { message: 'Depot item unavailable.', effects: {} };
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
    const unitsToBuy = this.getPurchaseLimit(
      item.itemKey,
      Math.min(item.units, freeCargo, affordableUnits, Math.max(1, Math.floor(amount)))
    );
    if (freeCargo <= 0) return { message: 'Trade depot: cargo hold is full.', effects: {} };
    if (unitsToBuy <= 0) return { message: `Insufficient credits for ${item.name}.`, effects: {} };

    const purchase = this.addPurchasedCargo(item.itemKey, unitsToBuy);
    const cost = purchase.added * item.buyPrice;
    this.player.resources.credits -= cost;
    return {
      message: `Bought ${this.formatPurchasedCargo(item.itemKey, purchase.addedItems)} for ${cost} Cr.`,
      effects: {
        cargoAdded: { elementKey: item.itemKey, amount: purchase.added, items: purchase.addedItems },
        creditsChanged: { newCredits: this.player.resources.credits, amountChanged: -cost },
      },
    };
  }

  sellItem(starbaseName: string, itemKey: string, amount: number): CommerceResult {
    const item = this.getManifest(starbaseName).find((candidate) => candidate.itemKey === itemKey);
    if (!item) return { message: 'Depot item unavailable.', effects: {} };
    const held = this.player.cargoHold.items[item.itemKey] || 0;
    const unitsToSell = Math.min(held, Math.max(1, Math.floor(amount)));
    if (unitsToSell <= 0) return { message: `No ${item.name} in cargo.`, effects: {} };

    const removed = this.cargoSystem.removeItem(this.player.cargoHold, item.itemKey, unitsToSell);
    const creditsEarned = removed * item.sellPrice;
    this.player.resources.credits += creditsEarned;
    return {
      message: `Sold ${removed} m^3 ${item.name} for ${creditsEarned} Cr.`,
      effects: {
        cargoSold: {
          itemsSold: { [item.itemKey]: removed },
          creditsEarned,
          newCredits: this.player.resources.credits,
        },
        creditsChanged: { newCredits: this.player.resources.credits, amountChanged: creditsEarned },
      },
    };
  }

  buyNext(starbaseName: string, selectionIndex: number): BuyNextResult {
    const market = this.getManifest(starbaseName);
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    if (freeCargo <= 0) {
      return {
        message: 'Trade depot: cargo hold is full.',
        effects: {},
        nextSelectionIndex: selectionIndex,
      };
    }

    let nextSelectionIndex = selectionIndex;
    for (let attempts = 0; attempts < market.length; attempts++) {
      const item = market[nextSelectionIndex % market.length];
      nextSelectionIndex++;
      const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
      const unitsToBuy = this.getPurchaseLimit(item.itemKey, Math.min(item.units, freeCargo, affordableUnits));
      if (unitsToBuy > 0) {
        const result = this.buyItem(starbaseName, item.itemKey, unitsToBuy);
        return { ...result, nextSelectionIndex };
      }
    }

    return {
      message: this.formatManifest(market),
      effects: {},
      nextSelectionIndex,
    };
  }

  sellAll(starbaseName: string): CommerceResult {
    const market = this.getManifest(starbaseName);
    const currentCargo = { ...this.player.cargoHold.items };
    const totalUnitsSold = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    if (totalUnitsSold <= 0) return { message: this.formatManifest(market), effects: {} };

    let totalCreditsEarned = 0;
    const soldItemsLog: string[] = [];
    for (const [itemKey, amount] of Object.entries(currentCargo)) {
      const itemInfo = getTradeItemInfo(itemKey);
      if (amount <= 0 || !itemInfo) continue;
      const depotItem = market.find((item) => item.itemKey === itemKey);
      const valuePerUnit =
        depotItem?.sellPrice ?? Math.max(1, Math.floor(itemInfo.baseValue * CONFIG.TRADE_SELL_MARKDOWN));
      totalCreditsEarned += amount * valuePerUnit;
      soldItemsLog.push(`${amount} ${itemInfo.name}`);
    }

    this.player.resources.credits += totalCreditsEarned;
    const removedCargo = this.cargoSystem.clearAllItems(this.player.cargoHold);
    return {
      message: STATUS_MESSAGES.STARBASE_TRADE_SUCCESS(
        soldItemsLog.join(', '),
        totalUnitsSold,
        totalCreditsEarned
      ),
      effects: {
        cargoSold: {
          itemsSold: removedCargo,
          creditsEarned: totalCreditsEarned,
          newCredits: this.player.resources.credits,
        },
        creditsChanged: {
          newCredits: this.player.resources.credits,
          amountChanged: totalCreditsEarned,
        },
      },
    };
  }

  refuel(): CommerceResult {
    const fuelNeeded = this.player.resources.maxFuel - this.player.resources.fuel;
    if (fuelNeeded <= 0) {
      return { message: STATUS_MESSAGES.STARBASE_REFUEL_FULL, effects: {} };
    }

    const oldFuel = this.player.resources.fuel;
    const cargoFuelPairs = Math.min(
      this.player.cargoHold.items.HELIUM_3 || 0,
      this.getAvailableDeuteriumCargo(),
      Math.ceil(fuelNeeded / 40)
    );
    const consumed = this.consumeFusionFuelCargo(cargoFuelPairs);
    if (consumed.fuel > 0) {
      this.player.addFuel(consumed.fuel);
      this.player.awardCrewExperience('engineering', Math.max(2, Math.floor(consumed.fuel / 80)));
    }

    const remainingFuelNeeded = this.player.resources.maxFuel - this.player.resources.fuel;
    if (remainingFuelNeeded <= 0) {
      return {
        message: `Loaded ${consumed.helium} m^3 He3 and ${consumed.deuterium} m^3 deuterium into the reactor. Tank full.`,
        effects: {
          fuelChanged: {
            newFuel: this.player.resources.fuel,
            maxFuel: this.player.resources.maxFuel,
            amountChanged: this.player.resources.fuel - oldFuel,
          },
        },
      };
    }

    const creditsPerUnit = 1 / CONFIG.FUEL_PER_CREDIT;
    const maxAffordableFuel = this.player.resources.credits * CONFIG.FUEL_PER_CREDIT;
    const fuelToBuy = Math.floor(Math.min(remainingFuelNeeded, maxAffordableFuel));
    const cost = Math.ceil(fuelToBuy * creditsPerUnit);
    if (fuelToBuy <= 0 || this.player.resources.credits < cost) {
      return {
        message:
          consumed.fuel > 0
            ? 'Loaded cargo fuel, but credits are insufficient for station He3/deuterium top-off.'
            : STATUS_MESSAGES.STARBASE_REFUEL_FAIL_CREDITS(creditsPerUnit, this.player.resources.credits),
        effects: {
          actionFailed: { action: 'REFUEL', reason: 'Insufficient credits' },
          ...(consumed.fuel > 0
            ? {
                fuelChanged: {
                  newFuel: this.player.resources.fuel,
                  maxFuel: this.player.resources.maxFuel,
                  amountChanged: this.player.resources.fuel - oldFuel,
                },
              }
            : {}),
        },
      };
    }

    this.player.resources.credits -= cost;
    this.player.addFuel(fuelToBuy);
    this.player.awardCrewExperience('engineering', Math.max(2, Math.floor(fuelToBuy / 50)));
    const cargoPrefix =
      consumed.fuel > 0
        ? `Loaded ${consumed.helium} m^3 He3 + ${consumed.deuterium} m^3 deuterium, then `
        : '';
    const tankFull = this.player.resources.fuel >= this.player.resources.maxFuel ? ' Tank full!' : '';
    return {
      message: `${cargoPrefix}purchased ${fuelToBuy} D/He3 reactor fuel for ${cost} Cr.${tankFull}`,
      effects: {
        fuelChanged: {
          newFuel: this.player.resources.fuel,
          maxFuel: this.player.resources.maxFuel,
          amountChanged: this.player.resources.fuel - oldFuel,
        },
        creditsChanged: { newCredits: this.player.resources.credits, amountChanged: -cost },
      },
    };
  }

  private addPurchasedCargo(itemKey: string, amount: number): CargoAddResult {
    const requested = Math.max(0, Math.floor(amount));
    if (requested <= 0) return { added: 0, addedItems: {} };
    if (itemKey !== 'FUSION_FUEL_MIX') {
      const added = this.cargoSystem.addItem(this.player.cargoHold, itemKey, requested);
      return { added, addedItems: added > 0 ? { [itemKey]: added } : {} };
    }

    const mixUnits = Math.floor(requested / 2) * 2;
    if (mixUnits <= 0) return { added: 0, addedItems: {} };
    const heliumUnits = mixUnits / 2;
    const deuteriumUnits = mixUnits / 2;
    const addedHelium = this.cargoSystem.addItem(this.player.cargoHold, 'HELIUM_3', heliumUnits);
    const addedDeuterium = this.cargoSystem.addItem(
      this.player.cargoHold,
      'DEUTERIUM_PELLETS',
      deuteriumUnits
    );
    const addedItems: Record<string, number> = {};
    if (addedHelium > 0) addedItems.HELIUM_3 = addedHelium;
    if (addedDeuterium > 0) addedItems.DEUTERIUM_PELLETS = addedDeuterium;
    return { added: addedHelium + addedDeuterium, addedItems };
  }

  private formatPurchasedCargo(itemKey: string, addedItems: Record<string, number>): string {
    if (itemKey === 'FUSION_FUEL_MIX') {
      return `${addedItems.HELIUM_3 || 0} m^3 Helium-3 and ${
        addedItems.DEUTERIUM_PELLETS || 0
      } m^3 Deuterium`;
    }
    const [addedKey, amount] = Object.entries(addedItems)[0] ?? [itemKey, 0];
    const info = getTradeItemInfo(addedKey);
    return `${amount} m^3 ${info?.name ?? addedKey}`;
  }

  private getAvailableDeuteriumCargo(): number {
    return (
      (this.player.cargoHold.items.DEUTERIUM || 0) +
      (this.player.cargoHold.items.DEUTERIUM_PELLETS || 0)
    );
  }

  private consumeFusionFuelCargo(pairUnits: number): { helium: number; deuterium: number; fuel: number } {
    const pairs = Math.max(0, Math.floor(pairUnits));
    if (pairs <= 0) return { helium: 0, deuterium: 0, fuel: 0 };
    const helium = this.cargoSystem.removeItem(this.player.cargoHold, 'HELIUM_3', pairs);
    let deuteriumNeeded = helium;
    let deuterium = this.cargoSystem.removeItem(this.player.cargoHold, 'DEUTERIUM', deuteriumNeeded);
    deuteriumNeeded -= deuterium;
    if (deuteriumNeeded > 0) {
      deuterium += this.cargoSystem.removeItem(
        this.player.cargoHold,
        'DEUTERIUM_PELLETS',
        deuteriumNeeded
      );
    }
    return { helium, deuterium, fuel: Math.min(helium, deuterium) * 40 };
  }
}
