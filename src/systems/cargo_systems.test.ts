import { describe, expect, it } from 'vitest';
import { CargoSystem } from './cargo_systems';
import { createDefaultCargo } from '../core/components';

describe('CargoSystem', () => {
  it('adds only what fits and reports total cargo units', () => {
    const cargo = createDefaultCargo(10);
    const system = new CargoSystem();

    expect(system.addItem(cargo, 'IRON', 7)).toBe(7);
    expect(system.addItem(cargo, 'COPPER', 7)).toBe(3);
    expect(system.getTotalUnits(cargo)).toBe(10);
    expect(cargo.items).toEqual({ IRON: 7, COPPER: 3 });
  });

  it('clears cargo and returns the removed manifest', () => {
    const cargo = createDefaultCargo(10);
    const system = new CargoSystem();
    system.addItem(cargo, 'IRON', 2);
    system.addItem(cargo, 'WATER_ICE', 3);

    expect(system.clearAllItems(cargo)).toEqual({ IRON: 2, WATER_ICE: 3 });
    expect(system.getTotalUnits(cargo)).toBe(0);
  });
});
