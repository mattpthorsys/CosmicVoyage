import { describe, expect, it } from 'vitest';
import {
  createDefaultShipModifications,
  createShipyardUpgradeOptions,
  getAvailableCargoPodBays,
  getShipCargoCapacity,
  installShipyardUpgrade,
} from '../../../core/ship_modifications';

describe('ship modifications', () => {
  it('creates the default survey superstructure and starter fittings', () => {
    const ship = createDefaultShipModifications();

    expect(ship.superstructure.engineMounts).toBe(1);
    expect(ship.superstructure.shieldMounts).toBe(1);
    expect(ship.superstructure.laserMounts).toBe(1);
    expect(ship.superstructure.missileBayMounts).toBe(1);
    expect(ship.superstructure.specialPurposeBays).toBe(4);
    expect(ship.superstructure.landingBays).toBe(1);
    expect(ship.superstructure.probeBays).toBe(3);
    expect(ship.superstructure.cargoBays).toBe(16);
    expect(ship.cargoPodsInstalled).toBe(4);
    expect(getShipCargoCapacity(ship)).toBe(100);
    expect(ship.missileCount).toBe(5);
    expect(ship.shieldClass).toBe(0);
    expect(ship.laserClass).toBe(0);
  });

  it('installs cargo pods, shields, lasers, and missiles within superstructure limits', () => {
    const ship = createDefaultShipModifications();

    expect(installShipyardUpgrade(ship, 'shipyard:cargo-pod')).toContain('Installed cargo pod');
    expect(ship.cargoPodsInstalled).toBe(5);
    expect(getShipCargoCapacity(ship)).toBe(125);

    expect(installShipyardUpgrade(ship, 'shipyard:shield:3')).toBe('Installed Shield Class 3.');
    expect(ship.shieldClass).toBe(3);
    expect(installShipyardUpgrade(ship, 'shipyard:laser:2')).toBe('Installed Laser Class 2.');
    expect(ship.laserClass).toBe(2);
    expect(installShipyardUpgrade(ship, 'shipyard:missile')).toContain('Loaded nuclear missile');
    expect(ship.missileCount).toBe(6);
  });

  it('marks unavailable shipyard upgrades disabled', () => {
    const ship = createDefaultShipModifications();
    ship.shieldClass = 2;
    ship.cargoPodsInstalled = 16;

    const options = createShipyardUpgradeOptions(ship);

    expect(getAvailableCargoPodBays(ship)).toBe(0);
    expect(options.find((option) => option.id === 'shipyard:cargo-pod')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'shipyard:shield:1')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'shipyard:shield:3')?.disabled).toBe(false);
  });
});
