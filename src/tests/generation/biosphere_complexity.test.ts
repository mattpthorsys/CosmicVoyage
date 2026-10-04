import { describe, expect, it } from 'vitest';
import {
  biosphereComplexityWeights,
  selectBiosphereComplexity,
} from '../../entities/biology/biosphere_complexity';
import { biologyFixture } from '../fixtures/biology';

describe('conditional biosphere complexity', () => {
  it('keeps microbial worlds common even at old ages, with all three outcomes possible', () => {
    const counts = { 'microbial-only': 0, 'simple-multicellular': 0, 'complex-multicellular': 0 };
    for (let index = 0; index < 800; index++) {
      const e = biologyFixture({ origin: 'native', ageGyr: 9, seed: `complexity-${index}` });
      const result = selectBiosphereComplexity(e);
      expect(selectBiosphereComplexity(e)).toBe(result);
      counts[result]++;
    }
    expect(counts['microbial-only']).toBeGreaterThan(400);
    expect(counts['simple-multicellular']).toBeGreaterThan(100);
    expect(counts['complex-multicellular']).toBeGreaterThan(30);
  });

  it('reduces energetic complex communities without making oxygen a multicellular gate', () => {
    const ordinary = biosphereComplexityWeights(biologyFixture());
    const anoxic = biosphereComplexityWeights(biologyFixture({ oxygenBar: 0 }));
    expect(anoxic.microbial).toBe(ordinary.microbial);
    expect(anoxic.simple).toBe(ordinary.simple);
    expect(anoxic.complex).toBeGreaterThan(0);
    expect(anoxic.complex).toBeLessThan(ordinary.complex);
    expect(biosphereComplexityWeights(biologyFixture({ ageGyr: 0.4 })).simple).toBeLessThan(ordinary.simple);
    expect(selectBiosphereComplexity(biologyFixture())).toBe('complex-multicellular');
  });
});
