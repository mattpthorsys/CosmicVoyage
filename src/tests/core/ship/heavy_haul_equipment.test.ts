import { describe, expect, it } from 'vitest';
import {
  createDefaultShipModifications,
  createShipyardUpgradeOptions,
  getFunctionalHypersleepBerths,
  installShipyardUpgrade,
  getShipCargoCapacity,
  createShipRepairOrders,
  repairShipDamage,
  getStarbaseShipyardProfile,
} from '../../../core/ship_modifications';

describe('tow and crew hypersleep fittings', () => {
  it('keeps starter specimen stasis without giving free crew berths or a tow coupler', () => {
    const ship = createDefaultShipModifications();
    expect(ship.stasisClass).toBe(1);
    expect(ship.hypersleepClass).toBe(0);
    expect(ship.towCouplerClass).toBe(0);
    expect(getFunctionalHypersleepBerths(ship)).toBe(0);
  });

  it('fits an external coupler without using cargo capacity or special bays', () => {
    const ship = createDefaultShipModifications();
    const bays = ship.specialBaysOccupied;
    const cargo = getShipCargoCapacity(ship);
    expect(installShipyardUpgrade(ship, 'shipyard:tow-coupler:1')).toContain('Installed');
    expect(ship.towCouplerClass).toBe(1);
    expect(ship.specialBaysOccupied).toBe(bays);
    expect(getShipCargoCapacity(ship)).toBe(cargo);
    expect(installShipyardUpgrade(ship, 'shipyard:tow-coupler:1')).toContain('superseded');
  });

  it('occupies one real bay and upgrades/repeats without adding another', () => {
    const ship = createDefaultShipModifications();
    expect(installShipyardUpgrade(ship, 'shipyard:hypersleep:1')).toContain('3 crew');
    expect(ship.specialBaysOccupied).toBe(2);
    expect(getFunctionalHypersleepBerths(ship)).toBe(3);
    expect(installShipyardUpgrade(ship, 'shipyard:hypersleep:2')).toContain('6 crew');
    expect(ship.specialBaysOccupied).toBe(2);
    expect(installShipyardUpgrade(ship, 'shipyard:hypersleep:2')).toContain('superseded');
    expect(ship.specialBaysOccupied).toBe(2);
    expect(getFunctionalHypersleepBerths(ship)).toBe(6);
  });

  it('refuses new modules when no bay is free and allows replacement in that same bay', () => {
    const ship = createDefaultShipModifications();
    ship.specialBaysOccupied = ship.superstructure.specialPurposeBays;
    expect(
      createShipyardUpgradeOptions(ship).find((entry) => entry.id === 'shipyard:hypersleep:1')?.disabled
    ).toBe(true);
    expect(installShipyardUpgrade(ship, 'shipyard:hypersleep:1')).toBe('No free special-purpose bay.');
    expect(ship.hypersleepClass).toBe(0);
    ship.hypersleepClass = 1;
    expect(
      createShipyardUpgradeOptions(ship).find((entry) => entry.id === 'shipyard:hypersleep:2')?.disabled
    ).toBe(false);
  });

  it('integrates new faults with the existing itemised repair system', () => {
    const ship = createDefaultShipModifications();
    installShipyardUpgrade(ship, 'shipyard:hypersleep:1');
    ship.damage.subsystemDamage.towCoupler = 30;
    ship.damage.subsystemDamage.hypersleepBay = 21;
    expect(getFunctionalHypersleepBerths(ship)).toBe(0);
    expect(createShipRepairOrders(ship).map((row) => row.target)).toContain('towCoupler');
    expect(createShipRepairOrders(ship).map((row) => row.target)).toContain('hypersleepBay');
    repairShipDamage(ship);
    expect(getFunctionalHypersleepBerths(ship)).toBe(3);
    expect(ship.damage.subsystemDamage.towCoupler ?? 0).toBe(0);
  });

  it('enables limited real drive upgrades and respects yard certification availability', () => {
    const ship = createDefaultShipModifications();
    const profile = { ...getStarbaseShipyardProfile('fixture'), kind: 'frontier' as const };
    const options = createShipyardUpgradeOptions(ship, profile);
    expect(options.find((entry) => entry.id === 'shipyard:engine:2')?.disabled).toBe(false);
    expect(options.find((entry) => entry.id === 'shipyard:engine:3')?.disabled).toBe(true);
    expect(installShipyardUpgrade(ship, 'shipyard:engine:2')).toBe('Installed Drive Class 2.');
    expect(ship.engineClass).toBe(2);
    expect(installShipyardUpgrade(ship, 'shipyard:engine:2')).toContain('superseded');
  });

  it('refuses a drive installation if the superstructure has no engine mount', () => {
    const ship = createDefaultShipModifications();
    ship.superstructure.engineMounts = 0;
    expect(installShipyardUpgrade(ship, 'shipyard:engine:2')).toBe('No engine mount available.');
    expect(ship.engineClass).toBe(1);
  });
});
