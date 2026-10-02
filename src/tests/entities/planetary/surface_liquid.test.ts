import { describe, expect, it } from 'vitest';
import { generateSurfaceDataFromRequest, SurfaceGenerator } from '../../../entities/planet/surface_generator';
import {
  createSurfaceLiquidOverlay,
  getCoastalVegetationColour,
  isLiquidCovered,
} from '../../../entities/planet/surface_liquid';
import { MineralRichness } from '../../../constants';
import { PRNG } from '../../../utils/prng';

describe('surface liquid overlays', () => {
  it('preserves cratered terrain while managed air and oceans replace the natural environment', () => {
    const natural = { density: 'Trace', pressure: 0.001, composition: { 'Carbon Dioxide': 100 } };
    const managed = { density: 'Earth-like', pressure: 1, composition: { Nitrogen: 79, Oxygen: 21 } };
    const request = {
      planetType: 'Rock',
      mapSeed: 'managed-geological-continuity',
      prngSeed: 'managed-geological-continuity',
      atmosphere: natural,
      terrainAtmosphere: natural,
      planetAbundance: {},
      profile: { surfaceTemp: 288, hydrosphere: 'Dry' },
    };
    const before = generateSurfaceDataFromRequest(request);
    const after = generateSurfaceDataFromRequest({
      ...request,
      atmosphere: managed,
      profile: {
        surfaceTemp: 288,
        hydrosphere: '63% managed surface water',
        managedBiosphere: 'complete',
        managedWaterFraction: 0.63,
      },
    });
    expect(before.heightmap).not.toBeNull();
    expect(after.heightmap).toEqual(before.heightmap);
    expect(before.liquidOverlay).toBeNull();
    expect(after.liquidOverlay?.coverage).toBe(0.63);
    expect(after.liquidOverlay?.coastalVegetation).not.toBeNull();
  });

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

  it('uses the explicit managed-water fraction on terraformed worlds', () => {
    const heightmap = Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => x + y * 10));
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'Rock',
      hydrosphere: 'Managed reservoir inventory',
      managedWaterFraction: 0.63,
      surfaceTemp: 288,
      atmosphere: { density: 'Earth-like', pressure: 1, composition: { Nitrogen: 78, Oxygen: 21 } },
      heightmap,
      managedBiosphere: 'complete',
    });

    expect(overlay?.kind).toBe('water');
    expect(overlay?.coverage).toBe(0.63);
    expect(overlay?.coastalVegetation).not.toBeNull();
    expect(getCoastalVegetationColour(overlay!.seaLevel + 1, overlay)).toBe('#315A38');
    expect(getCoastalVegetationColour(overlay!.seaLevel, overlay)).toBeNull();
    expect(getCoastalVegetationColour(overlay!.seaLevel + 17, overlay)).toBeNull();
  });

  it.each([
    [260, 1],
    [288, 0.001],
    [400, 1],
  ])('does not paint liquid managed oceans at %s K and %s bar', (surfaceTemp, pressure) => {
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'Rock',
      hydrosphere: '63% managed surface water',
      managedWaterFraction: 0.63,
      surfaceTemp,
      atmosphere: { density: 'Earth-like', pressure, composition: { Nitrogen: 79, Oxygen: 21 } },
      heightmap: [
        [1, 2],
        [3, 4],
      ],
      managedBiosphere: 'complete',
    });
    expect(overlay).toBeNull();
  });

  it('keeps a protected partial biosphere from painting global coastal vegetation', () => {
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'Rock',
      hydrosphere: '31% managed surface water',
      managedWaterFraction: 0.31,
      surfaceTemp: 288,
      atmosphere: { density: 'Earth-like', pressure: 0.6, composition: { Nitrogen: 88, Oxygen: 12 } },
      heightmap: [
        [1, 2],
        [3, 4],
      ],
      managedBiosphere: 'partial',
    });
    expect(overlay?.kind).toBe('water');
    expect(overlay?.coastalVegetation).toBeNull();
  });

  it('masks mineral deposits below visible liquid surfaces', () => {
    const generator = new SurfaceGenerator('Oceanic', 'liquid-mask-test', new PRNG('liquid-mask-test'), {
      density: 'Standard',
      pressure: 1,
      composition: { Nitrogen: 80, Oxygen: 20 },
    });

    const data = generator.generateSurfaceData(
      { IRON: 100, SILICON: 80, DEUTERIUM: 20 },
      {
        mineralRichness: MineralRichness.ULTRA_RICH,
        baseMinerals: 120,
        metallicityFeH: 0.4,
        surfaceTemp: 288,
        hydrosphere: 'Global Saline Ocean',
      }
    );

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
    const legacy = new SurfaceGenerator(
      'Oceanic',
      'worker-compat-test',
      new PRNG('worker-compat-test'),
      atmosphere
    ).generateSurfaceData(abundance, profile);
    const request = generateSurfaceDataFromRequest({
      planetType: 'Oceanic',
      mapSeed: 'worker-compat-test',
      prngSeed: 'worker-compat-test',
      atmosphere,
      planetAbundance: abundance,
      profile,
    });

    expect(request).toEqual(legacy);
    expect(request.materialMap?.indices).toBeInstanceOf(Uint8Array);
    expect(request.materialMap?.sourceWidth).toBe(request.heightmap?.[0].length);
    expect(request.materialMap?.width).toBeLessThanOrEqual(257);
    expect(structuredClone(request).materialMap).toEqual(request.materialMap);
  });
});
