import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { generateMicrobialCommunity } from '../../entities/biology/microbial_biosphere';
import { generateNativeSpecies } from '../../entities/biology/native_biosphere';
import { isMicrobialPatch } from '../../entities/biology/biology_rules';
import { biologyFixture } from '../fixtures/biology';
import { PRNG } from '../../utils/prng';
import { createEncounter } from '../../systems/surface_encounter_system';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';

describe('native microbial communities', () => {
  it('generates inherited, stationary sampling patches with no giant cells or stun profiles', () => {
    const e = biologyFixture({ origin: 'native' });
    const species = generateMicrobialCommunity(e, new PRNG(e.seed));
    expect(species).toEqual(generateMicrobialCommunity(e, new PRNG(e.seed)));
    expect(species).toHaveLength(4);
    expect(new Set(species.map((entry) => entry.id)).size).toBe(4);
    for (let index = 0; index < species.length; index++) {
      const member = species[index];
      expect(isMicrobialPatch(member)).toBe(true);
      expect(member.behaviour).toBe('sessile');
      expect(member.susceptibility).toBe(0);
      expect(member.anatomy?.appendages).toBe(0);
      expect(member.reproduction).toBeUndefined();
      expect(member.preservation?.retainsSubstrate).toBe(false);
      if (index % 2 === 0) {
        expect(member.lineage).toBe(species[index + 1].lineage);
        expect(member.anatomy).toEqual(species[index + 1].anatomy);
      }
    }
  });

  it('does not fabricate oxygen or pigment edges for sparse chemically powered colonies', () => {
    const e = biologyFixture({ origin: 'native', oxygenBar: 0, stellarFluxWm2: 2 });
    const species = generateMicrobialCommunity(e, new PRNG(e.seed));
    expect(species.every((member) => member.respiration === 'anaerobic')).toBe(true);
    expect(
      species
        .filter((member) => member.metabolism === 'autotroph')
        .every((member) => member.energySource === 'chemical')
    ).toBe(true);
    for (let index = 0; index < 100; index++) {
      const biosphere = generateBiosphere({ ...e, seed: `chemical-${index}` });
      if (!biosphere) continue;
      expect(biosphere.complexity).toBe('microbial-only');
      expect(biosphere.pigmentCover).toBe(0);
    }
  });

  it('makes simple communities small and non-predatory without forcing them to be microbial', () => {
    for (let index = 0; index < 40; index++) {
      const e = biologyFixture({ origin: 'native', seed: `simple-${index}` });
      const species = generateNativeSpecies(e, new PRNG(e.seed), 'simple-multicellular');
      expect(species.every((member) => member.cellularity === 'simple-multicellular')).toBe(true);
      expect(species.every((member) => member.massKg <= 0.8 && member.anatomy?.appendages === 0)).toBe(true);
      expect(species.some((member) => ['ambush', 'territorial'].includes(member.behaviour))).toBe(false);
    }
  });

  it('includes microbes in richer communities while preserving the managed ten-species catalogue', () => {
    const complexities = new Set<string>();
    for (let index = 0; index < 600; index++) {
      const biosphere = generateBiosphere(
        biologyFixture({ origin: 'native', seed: `biosphere-profile-${index}` })
      );
      if (!biosphere) continue;
      complexities.add(biosphere.complexity!);
      expect(biosphere.species.filter(isMicrobialPatch)).toHaveLength(4);
      if (biosphere.complexity === 'microbial-only')
        expect(biosphere.species.every(isMicrobialPatch)).toBe(true);
      else expect(biosphere.species.some((member) => !isMicrobialPatch(member))).toBe(true);
      const field = createEncounter(biosphere, {
        id: `${biosphere.id}/site:1,1`,
        x: 1,
        y: 1,
        label: 'Population fixture',
      });
      const snapshot = createXenobiologySnapshot();
      snapshot.fields[field.site.id] = field;
      expect(() => validateXenobiology(snapshot, [])).not.toThrow();
    }
    expect(complexities.size).toBe(3);
    expect(generateBiosphere(biologyFixture())?.species).toHaveLength(10);
  });
});
