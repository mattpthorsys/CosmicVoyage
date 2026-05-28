import { describe, expect, it } from 'vitest';
import { MineralRichness } from '../../../constants';
import { generateSurfaceElementMap } from '../../../entities/planet/surface_element_generator';
import { PRNG } from '../../../utils/prng';

function makeHeightmap(size: number): number[][] {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => Math.round(((x + y) / Math.max(1, size * 2 - 2)) * 15))
  );
}

function countDeposits(map: string[][] | null, predicate: (key: string) => boolean = Boolean): number {
  return (map ?? []).flat().filter((key) => key && predicate(key)).length;
}

describe('surface element generation', () => {
  it('scales deposit density with mineral richness and metallicity context', () => {
    const heightmap = makeHeightmap(48);
    const abundance = { IRON: 32, SILICON: 28, COPPER: 12, WATER_ICE: 18, DEUTERIUM: 10 };

    const poor = generateSurfaceElementMap('Rock', 'density-test', new PRNG('density-test'), abundance, heightmap, {
      mineralRichness: MineralRichness.POOR,
      baseMinerals: 18,
      metallicityFeH: -0.45,
      surfaceTemp: 285,
    });
    const rich = generateSurfaceElementMap('Rock', 'density-test', new PRNG('density-test'), abundance, heightmap, {
      mineralRichness: MineralRichness.RICH,
      baseMinerals: 110,
      metallicityFeH: 0.35,
      surfaceTemp: 285,
    });

    expect(countDeposits(rich)).toBeGreaterThan(countDeposits(poor) * 2);
  });

  it('keeps cold volatile worlds visibly rich in ice and deuterium deposits', () => {
    const heightmap = makeHeightmap(48);
    const abundance = { WATER_ICE: 38, DEUTERIUM: 12, AMMONIA_ICE: 10, IRON: 24, SILICON: 16 };
    const isVolatile = (key: string) => ['WATER_ICE', 'DEUTERIUM', 'AMMONIA_ICE'].includes(key);

    const warm = generateSurfaceElementMap('Frozen', 'volatile-test', new PRNG('volatile-test'), abundance, heightmap, {
      mineralRichness: MineralRichness.AVERAGE,
      baseMinerals: 55,
      metallicityFeH: 0,
      surfaceTemp: 335,
    });
    const cold = generateSurfaceElementMap('Frozen', 'volatile-test', new PRNG('volatile-test'), abundance, heightmap, {
      mineralRichness: MineralRichness.AVERAGE,
      baseMinerals: 55,
      metallicityFeH: 0,
      surfaceTemp: 95,
    });

    expect(countDeposits(cold, isVolatile)).toBeGreaterThan(countDeposits(warm, isVolatile) * 2);
  });
});
