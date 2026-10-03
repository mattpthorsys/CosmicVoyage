import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { PRNG } from '../../utils/prng';
import { biologyFixture } from '../fixtures/biology';

describe('bounded biosphere generation', () => {
  it('is independent of unrelated PRNG consumption and generates inherited traits', () => {
    const first = generateBiosphere(biologyFixture());
    const unrelated = new PRNG('biology-fixture');
    for (let i = 0; i < 100; i++) unrelated.random();
    expect(generateBiosphere(biologyFixture())).toEqual(first);
    expect(first?.species).toHaveLength(6);
    for (let i = 0; i < 6; i += 2) {
      expect(first?.species[i].covering).toBe(first?.species[i + 1].covering);
      expect(first?.species[i].symmetry).toBe(first?.species[i + 1].symmetry);
      expect(first?.species[i].role).toBe('primary producer');
    }
  });

  it('rejects dry, unlandable, hot, cold, young and low-pressure worlds', () => {
    for (const overrides of [
      { waterCoverage: 0 },
      { landable: false },
      { temperatureK: 500 },
      { temperatureK: 170 },
      { ageGyr: 0.01 },
      { pressureBar: 0.001 },
    ]) {
      expect(generateBiosphere(biologyFixture(overrides))).toBeNull();
    }
  });

  it('limits anaerobic mobile sizes and keeps native occurrence probabilistic', () => {
    let living = 0;
    for (let i = 0; i < 150; i++) {
      const biosphere = generateBiosphere(
        biologyFixture({ origin: 'native', seed: `native-${i}`, oxygenBar: 0, humanIntensity: 0 })
      );
      if (!biosphere) continue;
      living++;
      for (const species of biosphere.species) {
        expect(species.respiration).toBe('anaerobic');
        expect(species.massKg).toBeLessThanOrEqual(3);
      }
    }
    expect(living).toBeGreaterThan(10);
    expect(living).toBeLessThan(80);
  });
});
