import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import {
  SpecimenCargoSystem,
  propaguleCompatibility,
  stasisCompatibility,
} from '../../systems/specimen_cargo_system';
import { XenobiologyService } from '../../core/xenobiology_service';
import { validateSpecies, validateXenobiology } from '../../entities/biology/biology_validation';
import { generateNativeSpecies } from '../../entities/biology/native_biosphere';
import { PRNG } from '../../utils/prng';

/** Supplies a real, nearby mat without motion or unrelated habitat hazards. */
function fixture() {
  const biosphere = generateBiosphere(biologyFixture())!;
  const field = createEncounter(biosphere, {
    id: `${biosphere.id}/site:1,1`,
    x: 1,
    y: 1,
    label: 'Mat margin',
  });
  field.individuals = [field.individuals[0]];
  const source = field.individuals[0];
  source.x = source.homeX = 15;
  source.y = source.homeY = 21;
  const cargo = createDefaultCargo(2);
  const research = new XenobiologyService();
  research.snapshot.fields[field.site.id] = field;
  research.observe(field.species[0], 3);
  return { biosphere, field, source, cargo, research, system: new SurfaceEncounterSystem() };
}

describe('finite viable propagules', () => {
  it('confines reproduction to inherited mat families without rerolling biological identities', () => {
    const f = fixture();
    expect(
      f.biosphere.species.filter((species) => species.reproduction).map((species) => species.id)
    ).toEqual(['managed-carbon-water:0']);
    let families = 0;
    for (let index = 0; index < 40; index++) {
      const species = generateNativeSpecies(biologyFixture({ origin: 'native' }), new PRNG(`buds:${index}`));
      species.forEach(validateSpecies);
      for (const entry of species.filter((entry) => entry.reproduction)) {
        families++;
        expect(entry.bodyForm).toBe('mat');
        const relatives = species.filter((relative) => relative.lineage === entry.lineage);
        expect(relatives.every((relative) => relative.reproduction?.kind === 'dormant-buds')).toBe(true);
      }
    }
    expect(families).toBeGreaterThan(0);
  });

  it('takes one compact viable batch, leaves the parent intact, and retains depletion through restore', () => {
    const f = fixture();
    const command = { kind: 'harvest' as const, targetId: f.source.id };
    expect(f.system.act(f.field, command, f.cargo, 1).elapsedSeconds).toBe(5);
    expect(f.source).toMatchObject({ state: 'active', injury: 0, sampled: false, propagulesHarvested: true });
    expect(f.cargo.specimens![0]).toMatchObject({ kind: 'propagule', quality: 1, volumeM3: 0.1 });
    expect(() => validateXenobiology(f.research.snapshot, f.cargo.specimens!)).not.toThrow();
    const restored = new XenobiologyService();
    restored.restoreSnapshot(JSON.parse(JSON.stringify(f.research.createSnapshot())));
    const field = restored.snapshot.fields[f.field.site.id];
    const before = structuredClone(field);
    expect(f.system.act(field, command, createDefaultCargo(2), 1).elapsedSeconds).toBe(0);
    expect(field).toEqual(before);
    // Subsequent harm to the parent does not retrospectively kill a sealed, viable batch.
    f.system.act(f.field, { kind: 'shoot', targetId: f.source.id }, f.cargo, 1);
    expect(() => validateXenobiology(f.research.snapshot, f.cargo.specimens!)).not.toThrow();
  });

  it('refuses dead, damaged, sampled, distant and non-reproductive sources atomically', () => {
    for (const variation of ['dead', 'injured', 'exposed', 'sampled', 'far', 'other'] as const) {
      const f = fixture();
      if (variation === 'dead') f.source.state = 'dead';
      if (variation === 'injured') f.source.injury = 0.01;
      if (variation === 'exposed') f.source.exposure = 1;
      if (variation === 'sampled') f.source.sampled = true;
      if (variation === 'far') f.field.roverX = 20;
      if (variation === 'other') f.field.species[0] = { ...f.field.species[0], reproduction: undefined };
      const before = structuredClone(f.field);
      expect(
        f.system.act(f.field, { kind: 'harvest', targetId: f.source.id }, f.cargo, 1).elapsedSeconds
      ).toBe(0);
      expect(f.field).toEqual(before);
      expect(f.cargo.specimens).toEqual([]);
    }
  });

  it('uses the batch handling profile but requires native temperature, pressure, volume and live slots', () => {
    const f = fixture();
    f.field.species[0] = {
      ...f.field.species[0],
      massKg: 200,
      preservation: { solvent: 'water', retainsSubstrate: true },
    };
    expect(stasisCompatibility(f.field.species[0], 1)).not.toBeNull();
    expect(propaguleCompatibility(f.field.species[0], 1)).toBeNull();
    expect(propaguleCompatibility({ ...f.field.species[0], temperatureK: 330 }, 1)).toContain('Temperature');
    expect(propaguleCompatibility({ ...f.field.species[0], pressureBar: 8 }, 1)).toContain('Pressure');
    const command = { kind: 'harvest' as const, targetId: f.source.id };
    const before = structuredClone(f.field);
    expect(f.system.act(f.field, command, f.cargo, 0).elapsedSeconds).toBe(0);
    expect(f.field).toEqual(before);
    expect(f.system.act(f.field, command, createDefaultCargo(0.05), 1).elapsedSeconds).toBe(0);
    expect(f.system.act(f.field, command, f.cargo, 1).elapsedSeconds).toBe(5);
    const container = f.cargo.specimens![0];
    const destination = createDefaultCargo(2);
    destination.specimens = [1, 2].map((index) => ({
      ...container,
      id: `occupied:${index}`,
      sourceId: `occupied:${index}`,
    }));
    const storage = new SpecimenCargoSystem();
    expect(storage.transfer(f.cargo, destination, container.id, 1)).toContain('slots occupied');
    expect(f.cargo.specimens).toHaveLength(1);
    destination.specimens = [];
    expect(storage.transfer(f.cargo, destination, container.id, 1)).toBeNull();
    expect(f.cargo.specimens).toEqual([]);
  });

  it('rejects forged history, changed preservation and duplicate source batches on import', () => {
    const f = fixture();
    f.system.act(f.field, { kind: 'harvest', targetId: f.source.id }, f.cargo, 1);
    const container = f.cargo.specimens![0];
    expect(() =>
      validateXenobiology(f.research.snapshot, [container, { ...container, id: 'clone' }])
    ).toThrow('source');
    expect(() =>
      validateXenobiology(f.research.snapshot, [
        { ...container, species: { ...container.species, pressureBar: 0.5 } },
      ])
    ).toThrow('preservation');
    expect(() => validateXenobiology(f.research.snapshot, [{ ...container, quality: 0.5 }])).toThrow(
      'propagule'
    );
    f.source.propagulesHarvested = false;
    expect(() => validateXenobiology(f.research.snapshot, [container])).toThrow('lifecycle');
  });

  it('keeps reproductive demand distinct, declines repeats and shares the species novelty cap', () => {
    const f = fixture();
    const species = {
      ...f.field.species[0],
      recognised: false,
      baselineSamples: 0,
      reproduction: { kind: 'dormant-buds' as const, baselineSamples: 0 },
    };
    f.research.observe(species, 3);
    f.system.act(f.field, { kind: 'harvest', targetId: f.source.id }, f.cargo, 1);
    const container = { ...f.cargo.specimens![0], species };
    f.research.submit(species, { ...container, kind: 'live' });
    const cap = f.research.snapshot.demand[species.id].entitlementPaid;
    const quote = f.research.quote(species, container);
    expect(quote.credits).toBeGreaterThan(0);
    expect(quote.credits).toBeLessThan(401);
    const before = f.research.createSnapshot();
    expect(f.research.quote(species, container)).toEqual(quote);
    expect(f.research.createSnapshot()).toEqual(before);
    f.research.submit(species, container);
    expect(f.research.snapshot.demand[species.id]).toMatchObject({
      samples: 1,
      propaguleSamples: 1,
      entitlementPaid: cap,
    });
    expect(f.research.quote(species, { ...container, id: 'renamed' }).credits).toBe(0);
    expect(f.research.quote(species, { ...container, sourceId: 'other-source' }).credits).toBeLessThan(
      quote.credits / 3
    );
    const restored = new XenobiologyService();
    restored.restoreSnapshot(f.research.createSnapshot());
    expect(restored.quote(species, container).credits).toBe(0);
  });
});
