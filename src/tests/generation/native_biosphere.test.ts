import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { validateSpecies } from '../../entities/biology/biology_validation';
import { biologyFixture } from '../fixtures/biology';
import { PRNG } from '../../utils/prng';
import { generateNativeSpecies } from '../../entities/biology/native_biosphere';
import { createEncounter } from '../../systems/surface_encounter_system';
import type { HabitatKind } from '../../entities/biology/biology_types';

describe('native biological families', () => {
  it('persists a bounded covering variation within suitable inherited materials', () => {
    const forms = new Set<string>();
    for (let index = 0; index < 30; index++) {
      const environment = biologyFixture({ origin: 'native', seed: `covering-${index}` });
      const species = generateNativeSpecies(environment, new PRNG(environment.seed));
      const biosphere = {
        id: environment.bodyId,
        bodyName: 'Fixture',
        origin: 'native' as const,
        species,
        sites: [],
      };
      const site = {
        id: `covering-site-${index}`,
        x: 1,
        y: 1,
        label: 'Rocks',
        habitat: {
          version: 1,
          kind: 'rocky-margin' as const,
          relief: 0.1,
          waterDistanceCells: 1,
          description: 'Rock margin',
        },
      };
      const field = createEncounter(biosphere, site);
      expect(field).toEqual(createEncounter(biosphere, site));
      for (const actor of field.individuals) {
        if (!actor.mineralisation) continue;
        forms.add(actor.mineralisation);
        expect(field.species.find((entry) => entry.id === actor.speciesId)?.structuralMaterial).not.toBe(
          'organic'
        );
      }
    }
    expect(forms).toEqual(new Set(['standard', 'reinforced']));
  });
  it('produces distinct inherited communities rather than the managed templates, with deterministic anatomy', () => {
    const signatures = new Set<string>();
    for (let index = 0; index < 40; index++) {
      const environment = biologyFixture({
        origin: 'native',
        bodyId: `world-${index}`,
        seed: `family-${index}`,
      });
      const species = generateNativeSpecies(environment, new PRNG(environment.seed));
      expect(species.length).toBeGreaterThanOrEqual(6);
      expect(species.length).toBeLessThanOrEqual(10);
      signatures.add(
        species.map((entry) => `${entry.bodyForm}:${entry.anatomy?.pigment}:${entry.symmetry}`).join('|')
      );
      for (let member = 0; member < species.length; member += 2) {
        expect(species[member].anatomy).toEqual(species[member + 1].anatomy);
        expect(species[member].lineage).toBe(species[member + 1].lineage);
        expect(species[member].covering).toBe(species[member + 1].covering);
        expect(species[member].habitatAffinity).not.toEqual(species[member + 1].habitatAffinity);
      }
      expect(species).toEqual(generateNativeSpecies(environment, new PRNG(environment.seed)));
      species.forEach((entry) => expect(() => validateSpecies(entry)).not.toThrow());
    }
    expect(signatures.size).toBeGreaterThan(30);
  });

  it('keeps low-energy native consumers small and non-predatory, and constrains high-gravity mobile size', () => {
    for (let index = 0; index < 30; index++) {
      const environment = biologyFixture({ origin: 'native', seed: `limits-${index}` });
      const low = generateNativeSpecies({ ...environment, oxygenBar: 0 }, new PRNG(environment.seed));
      expect(low.every((entry) => entry.massKg <= 3 && entry.respiration === 'anaerobic')).toBe(true);
      expect(low.some((entry) => ['ambush', 'territorial'].includes(entry.behaviour))).toBe(false);
      const ordinary = generateNativeSpecies(environment, new PRNG(environment.seed));
      const heavy = generateNativeSpecies({ ...environment, gravity: 3 }, new PRNG(environment.seed));
      ordinary.forEach((entry, member) => {
        if (entry.metabolism === 'heterotroph')
          expect(heavy[member].massKg).toBeLessThanOrEqual(entry.massKg);
      });
    }
  });

  it('offers reachable producer-supported habitat communities without rerolling on entry', () => {
    let living = 0;
    for (let index = 0; index < 50; index++) {
      const biosphere = generateBiosphere(biologyFixture({ origin: 'native', seed: `habitat-${index}` }));
      if (!biosphere) continue;
      living++;
      for (const kind of [
        'moist-margin',
        'rocky-margin',
        'sheltered-ground',
        'exposed-ground',
        'upland-ground',
      ] as HabitatKind[]) {
        const site = {
          id: `${index}/${kind}`,
          x: 1,
          y: 1,
          label: kind,
          habitat: {
            version: 1,
            kind,
            relief: 0.05,
            waterDistanceCells: kind.includes('margin') ? 1 : null,
            description: 'Fixture',
          },
        };
        const field = createEncounter(biosphere, site);
        expect(field.individuals.length).toBeGreaterThanOrEqual(3);
        expect(field.individuals.length).toBeLessThanOrEqual(8);
        expect(field).toEqual(createEncounter(biosphere, site));
        expect(
          field.individuals.every((actor) =>
            field.species.find((entry) => entry.id === actor.speciesId)?.habitatAffinity?.includes(kind)
          )
        ).toBe(true);
      }
    }
    expect(living).toBeGreaterThan(0);
  });
});
