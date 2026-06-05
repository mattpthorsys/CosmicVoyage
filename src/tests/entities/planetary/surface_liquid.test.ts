import { describe, expect, it } from 'vitest';
import { generateSurfaceDataFromRequest, SurfaceGenerator } from '../../../entities/planet/surface_generator';
import { createSurfaceLiquidOverlay, isLiquidCovered } from '../../../entities/planet/surface_liquid';
import { MineralRichness } from '../../../constants';
import { PRNG } from '../../../utils/prng';

describe('surface liquid overlays', () => {
  it('creates sea levels from hydrosphere coverage and liquid chemistry', () => {
    const heightmap = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => x + y));
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'Oceanic',
      hydrosphere: 'Global Saline Ocean',
      surfaceTemp: 288,
      atmosphere: { density: 'Standard', pressure: 1, composition: { Nitrogen: 78, Oxygen: 21 } },
      heightmap,
    });

    expect(overlay).not.toBeNull();
    expect(overlay?.kind).toBe('water');
    expect(overlay?.coverage).toBeGreaterThan(0.75);
    expect(isLiquidCovered(overlay!.seaLevel, overlay)).toBe(true);
    expect(isLiquidCovered(overlay!.seaLevel + 40, overlay)).toBe(false);
  });

  it('masks mineral deposits below visible liquid surfaces', () => {
    const generator = new SurfaceGenerator('Oceanic', 'liquid-mask-test', new PRNG('liquid-mask-test'), {
      density: 'Standard',
      pressure: 1,
      composition: { Nitrogen: 80, Oxygen: 20 },
    });

    const data = generator.generateSurfaceData({ IRON: 100, SILICON: 80, DEUTERIUM: 20 }, {
      mineralRichness: MineralRichness.ULTRA_RICH,
      baseMinerals: 120,
      metallicityFeH: 0.4,
      surfaceTemp: 288,
      hydrosphere: 'Global Saline Ocean',
    });

    expect(data.liquidOverlay).not.toBeNull();
    expect(data.heightmap).not.toBeNull();
    expect(data.surfaceElementMap).not.toBeNull();

    let submergedMinerals = 0;
    let dryMinerals = 0;
    for (let y = 0; y < data.heightmap!.length; y++) {
      for (let x = 0; x < data.heightmap![y].length; x++) {
        const element = data.surfaceElementMap![y][x];
        if (!element) continue;
        if (isLiquidCovered(data.heightmap![y][x], data.liquidOverlay)) submergedMinerals++;
        else dryMinerals++;
      }
    }

    expect(submergedMinerals).toBe(0);
    expect(dryMinerals).toBeGreaterThan(0);
  });

  it('keeps worker-safe surface requests deterministic with the legacy generator path', () => {
    const atmosphere = {
      density: 'Standard',
      pressure: 1,
      composition: { Nitrogen: 80, Oxygen: 20 },
    };
    const abundance = { IRON: 100, SILICON: 80, DEUTERIUM: 20 };
    const profile = {
      mineralRichness: MineralRichness.ULTRA_RICH,
      baseMinerals: 120,
      metallicityFeH: 0.4,
      surfaceTemp: 288,
      hydrosphere: 'Global Saline Ocean',
    };
    const legacy = new SurfaceGenerator('Oceanic', 'worker-compat-test', new PRNG('worker-compat-test'), atmosphere)
      .generateSurfaceData(abundance, profile);
    const request = generateSurfaceDataFromRequest({
      planetType: 'Oceanic',
      mapSeed: 'worker-compat-test',
      prngSeed: 'worker-compat-test',
      atmosphere,
      planetAbundance: abundance,
      profile,
    });

    expect(request).toEqual(legacy);
  });
});
