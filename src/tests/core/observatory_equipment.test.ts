import { describe, expect, it } from 'vitest';
import {
  createDefaultShipModifications,
  createShipyardUpgradeOptions,
  installShipyardUpgrade,
} from '../../core/ship_modifications';
import {
  getObservatoryCapabilities,
  createObservatorySnapshot,
  validateObservatorySnapshot,
} from '../../core/observatory_types';

describe('observatory equipment', () => {
  it('occupies one bay and replaces that installation for subsequent classes', () => {
    const ship = createDefaultShipModifications();
    const bays = ship.specialBaysOccupied;
    expect(installShipyardUpgrade(ship, 'shipyard:observatory:1')).toContain('Installed');
    expect(ship.specialBaysOccupied).toBe(bays + 1);
    expect(installShipyardUpgrade(ship, 'shipyard:observatory:3')).toContain('Installed');
    expect(ship.specialBaysOccupied).toBe(bays + 1);
    expect(installShipyardUpgrade(ship, 'shipyard:observatory:2')).toContain('superseded');
    expect(ship.observatoryClass).toBe(3);
  });

  it('refuses installation into a full ship without altering any equipment', () => {
    const ship = createDefaultShipModifications();
    ship.specialBaysOccupied = ship.superstructure.specialPurposeBays;
    expect(
      createShipyardUpgradeOptions(ship).find((option) => option.id === 'shipyard:observatory:1')?.disabled
    ).toBe(true);
    expect(installShipyardUpgrade(ship, 'shipyard:observatory:1')).toContain('No free');
    expect(ship.observatoryClass).toBe(0);
  });

  it('separates stellar reach from atmospheric sensitivity and respects instrument damage', () => {
    const ship = createDefaultShipModifications();
    expect(getObservatoryCapabilities(ship).atmosphericRadiusLy).toBe(0);
    ship.observatoryClass = 2;
    const healthy = getObservatoryCapabilities(ship);
    expect(healthy.contactRadiusLy).toBeGreaterThan(healthy.atmosphericRadiusLy);
    ship.damage.subsystemDamage.specialBay = 90;
    expect(getObservatoryCapabilities(ship).qualityCeiling).toBeLessThan(healthy.qualityCeiling);
  });

  it('accepts empty evidence and rejects destinations the travel UI cannot reach', () => {
    const state = createObservatorySnapshot();
    expect(() => validateObservatorySnapshot(state)).not.toThrow();
    state.destination = { worldX: 1, worldY: 2, systemSlot: 1, name: 'Unreachable', kind: 'system' };
    expect(() => validateObservatorySnapshot(state)).toThrow('unreachable');
  });
});
