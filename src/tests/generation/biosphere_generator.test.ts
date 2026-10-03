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
      expect(first?.species[i].senses).toBe(first?.species[i + 1].senses);
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

  it('keeps introduced identities and inherited traits stable across colony environments', () => {
    const first = generateBiosphere(biologyFixture())!;
    const other = generateBiosphere(
      biologyFixture({
        bodyId: 'another-world',
        seed: 'different-seed',
        gravity: 2,
        pressureBar: 2,
        temperatureK: 305,
      })
    )!;
    for (let index = 0; index < first.species.length; index++) {
      const a = first.species[index],
        b = other.species[index];
      expect([a.id, a.massKg, a.symmetry, a.senses, a.covering, a.susceptibility, a.baselineSamples]).toEqual(
        [b.id, b.massKg, b.symmetry, b.senses, b.covering, b.susceptibility, b.baselineSamples]
      );
      expect(b.temperatureK).toBe(305);
    }
  });

  it('makes historical recognition much more common near human settlement', () => {
    let near = 0,
      far = 0;
    for (let index = 0; index < 100; index++) {
      const env = biologyFixture({ origin: 'native', seed: `recognition-${index}` });
      near +=
        generateBiosphere({ ...env, humanIntensity: 1 })?.species.filter((species) => species.recognised)
          .length ?? 0;
      far +=
        generateBiosphere({ ...env, humanIntensity: 0 })?.species.filter((species) => species.recognised)
          .length ?? 0;
    }
    expect(near).toBeGreaterThan(far * 3);
    expect(far).toBeGreaterThan(0);
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
