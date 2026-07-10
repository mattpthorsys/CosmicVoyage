import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';

/** Counts the inhabited-world rate among stellar contacts in one square region. */
function measureSettlementRate(
  generator: SystemDataGenerator,
  centerX: number,
  centerY: number,
  radius: number
): { stellarSystems: number; inhabitedSystems: number; rate: number } {
  let stellarSystems = 0;
  let inhabitedSystems = 0;
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      const properties = generator.getSystemMapProperties(x, y);
      if (!properties.exists || properties.objectKind !== 'stellar') continue;
      stellarSystems++;
      if (properties.settlementStage !== 'none') inhabitedSystems++;
    }
  }
  return {
    stellarSystems,
    inhabitedSystems,
    rate: inhabitedSystems / Math.max(1, stellarSystems),
  };
}

describe('Galactic stellar-system generation', () => {
  it('reserves a unique nearest stellar contact as the inhabited starting hub', () => {
    const generator = new SystemDataGenerator(new PRNG('starting-hub-nearest'));
    const hubX = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
    const hubY = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
    const hubDistance = Math.hypot(CONFIG.STARTING_HUB_OFFSET_X, CONFIG.STARTING_HUB_OFFSET_Y);

    for (let y = CONFIG.PLAYER_START_Y - 1; y <= CONFIG.PLAYER_START_Y + 1; y++) {
      for (let x = CONFIG.PLAYER_START_X - 1; x <= CONFIG.PLAYER_START_X + 1; x++) {
        if (Math.hypot(x - CONFIG.PLAYER_START_X, y - CONFIG.PLAYER_START_Y) > hubDistance) continue;
        const properties = generator.getSystemMapProperties(x, y);
        if (x === hubX && y === hubY) {
          expect(properties).toMatchObject({
            exists: true,
            objectKind: 'stellar',
            starType: 'G2V',
            settlementStage: 'complete',
            stationKind: 'starbase',
          });
        } else {
          expect(properties.exists).toBe(false);
        }
      }
    }

    expect(generator.getResolvedSystemMapProperties(hubX, hubY)).toHaveLength(1);
  });

  it('raises inhabited-world density approximately fivefold in the human core', () => {
    const generator = new SystemDataGenerator(new PRNG('core-settlement-density'));
    const core = measureSettlementRate(generator, 0, 0, 100);
    const settled = measureSettlementRate(generator, 2500, 0, 100);

    expect(CONFIG.CORE_SETTLEMENT_DENSITY_MULTIPLIER).toBe(5);
    expect(core.stellarSystems).toBeGreaterThan(200);
    expect(settled.stellarSystems).toBeGreaterThan(200);
    expect(core.inhabitedSystems).toBeGreaterThan(20);
    expect(core.rate).toBeGreaterThan(settled.rate * 3);
  });

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
