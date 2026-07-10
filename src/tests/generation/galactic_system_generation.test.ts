import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';

describe('Galactic stellar-system generation', () => {
  it('makes cool dwarfs dominant and keeps massive stars genuinely rare near the Sun', () => {
    const generator = new SystemDataGenerator(new PRNG('present-day-mass-function'));
    const classes: Record<string, number> = {};
    let total = 0;

    for (let y = -100; y <= 100; y++) {
      for (let x = -100; x <= 100; x++) {
        const properties = generator.getSystemMapProperties(x, y);
        if (!properties.exists || properties.objectKind !== 'stellar' || !properties.starType) continue;
        const stellarClass = properties.starType.charAt(0);
        classes[stellarClass] = (classes[stellarClass] ?? 0) + 1;
        total++;
      }
    }

    expect(total).toBeGreaterThan(250);
    expect((classes.M ?? 0) / total).toBeGreaterThan(0.65);
    expect(((classes.O ?? 0) + (classes.B ?? 0)) / total).toBeLessThan(0.004);
    expect((classes.K ?? 0) + (classes.G ?? 0)).toBeGreaterThan(30);
  });

  it('exposes multiple stable system slots in dense projected Galactic-centre cells', () => {
    const generator = new SystemDataGenerator(new PRNG('dense-system-slots'));
    let resolved = [] as ReturnType<SystemDataGenerator['getResolvedSystemMapProperties']>;
    const coreWorldY = -Math.round(
      (CONFIG.GALACTIC_SOLAR_RADIUS_PC * 3.26156) / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS
    );

    for (let y = coreWorldY - 40; y <= coreWorldY + 40 && resolved.length < 2; y++) {
      for (let x = -40; x <= 40 && resolved.length < 2; x++) {
        resolved = generator.getResolvedSystemMapProperties(x, y);
      }
    }

    expect(resolved.length).toBeGreaterThanOrEqual(2);
    expect(resolved.length).toBeLessThanOrEqual(CONFIG.GALACTIC_MAX_RESOLVED_SYSTEMS_PER_CELL);
    expect(new Set(resolved.map((system) => system.systemSlot)).size).toBe(resolved.length);
    expect(resolved.every((system) => system.exists)).toBe(true);
  });

  it('hard-stops inhabited worlds and automated depots at their configured outer limits', () => {
    const generator = new SystemDataGenerator(new PRNG('human-outer-cutoff'));
    const beyondDepotCells = Math.ceil(
      (CONFIG.AUTOMATED_DEPOT_OUTER_RADIUS_LY + 500) / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS
    );

    for (let y = -80; y <= 80; y++) {
      for (let x = beyondDepotCells; x <= beyondDepotCells + 80; x++) {
        const properties = generator.getSystemMapProperties(x, y);
        expect(properties.stationKind).toBeNull();
        expect(properties.settlementStage).toBe('none');
      }
    }
  });
});
