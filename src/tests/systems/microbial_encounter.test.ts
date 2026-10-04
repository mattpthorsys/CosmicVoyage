import { describe, expect, it } from 'vitest';
import { microbialBiosphereFixture, pressureBiologyFixture } from '../fixtures/biology';
import {
  createEncounter,
  SurfaceEncounterSystem,
  encounterVisible,
  createCollectionContainer,
} from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import {
  validateSpecies,
  validateSpecimen,
  validateXenobiology,
} from '../../entities/biology/biology_validation';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';
import { withMatReproduction } from '../../entities/biology/propagules';
import { generatePressureCommunity } from '../../entities/biology/pressure_biosphere';
import { XenobiologyService } from '../../core/xenobiology_service';
import { SpecimenCargoSystem } from '../../systems/specimen_cargo_system';
import { PRNG } from '../../utils/prng';

/** Isolates one reachable microbial patch, preserving genuine species and source identities. */
function fixture() {
  const biosphere = microbialBiosphereFixture({ humanIntensity: 0 });
  const field = createEncounter(biosphere, biosphere.sites[0]);
  const target = field.individuals[0];
  field.individuals = [target];
  target.x = target.homeX = 15;
  target.y = target.homeY = 21;
  field.terrain[21] = '.'.repeat(32);
  return { field, target, cargo: createDefaultCargo(1), system: new SurfaceEncounterSystem() };
}

describe('microbial field sampling', () => {
  it('keeps sparse microbial contacts stationary on the action clock and rejects weapons atomically', () => {
    const { field, target, system, cargo } = fixture();
    for (const command of [
      { kind: 'shoot' as const, targetId: target.id },
      { kind: 'stun' as const, targetId: target.id, power: 2 as const },
    ]) {
      const before = structuredClone(field);
      expect(system.act(field, command, cargo, 1).elapsedSeconds).toBe(0);
      expect(field).toEqual(before);
    }
    for (let tick = 0; tick < 20; tick++) system.act(field, { kind: 'wait' }, cargo, 1);
    expect([target.x, target.y, target.state]).toEqual([15, 21, 'active']);
    expect(target.activity).toBe('attached');
  });

  it('uses close scanner range for subtle colonies, retains obstacle occlusion, and never reveals spent contacts', () => {
    const { field, target } = fixture();
    const index = field.species.findIndex((entry) => entry.id === target.speciesId);
    field.species[index] = { ...field.species[index], surfaceExpression: 'subtle-colony' };
    target.x = field.roverX - 4;
    expect(encounterVisible(field, target)).toBe(false);
    target.x++;
    expect(encounterVisible(field, target)).toBe(true);
    field.terrain[21] = field.terrain[21].substring(0, 14) + '#' + field.terrain[21].substring(15);
    expect(encounterVisible(field, target)).toBe(false);
    field.terrain[21] = '.'.repeat(32);
    target.state = 'collected';
    expect(encounterVisible(field, target)).toBe(false);
  });

  it('permits one material sample plus one viable cassette with basic stasis, not unlimited cultures', () => {
    const { field, target, system, cargo } = fixture();
    expect(system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0).evidence?.level).toBe(3);
    const before = structuredClone(field);
    expect(system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0).elapsedSeconds).toBe(0);
    expect(field).toEqual(before);
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 1).message).toContain(
      'Viable microbial'
    );
    expect(cargo.specimens?.map((item) => [item.kind, item.materialMassKg, item.volumeM3])).toEqual([
      ['tissue', 0.005, 0.1],
      ['live', 0.005, 0.1],
    ]);
    const snapshot = createXenobiologySnapshot();
    snapshot.fields[field.site.id] = field;
    expect(() =>
      validateXenobiology(JSON.parse(JSON.stringify(snapshot)), JSON.parse(JSON.stringify(cargo.specimens)))
    ).not.toThrow();
    cargo.specimens = [];
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 1).elapsedSeconds).toBe(0);
    expect(createEncounter(microbialBiosphereFixture(), field.site).individuals.length).toBeLessThanOrEqual(
      4
    );
  });

  it('refuses unsuitable stasis or cargo without consuming a sampling source', () => {
    const { field, target, system, cargo } = fixture();
    const before = structuredClone(field);
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 0).message).toContain(
      'No stasis'
    );
    expect(field).toEqual(before);
    cargo.capacity = 0;
    expect(system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0).message).toContain(
      'cargo volume'
    );
    expect(field).toEqual(before);
  });

  it('retains pressure-community substrate requirements and ordinary sample options', () => {
    const { field, target, system, cargo } = fixture();
    const e = pressureBiologyFixture({ bodyId: field.bodyId });
    field.species = generatePressureCommunity(e, new PRNG(e.seed));
    target.speciesId = field.species[0].id;
    const before = structuredClone(field);
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 2).message).toContain('cradle');
    expect(field).toEqual(before);
    expect(system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0).evidence?.collected).toBe(
      true
    );
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 3).evidence?.collected).toBe(
      true
    );
  });

  it('validates typed contacts and samples without upgrading microbial mats into propagule parents', () => {
    const { field, target } = fixture();
    const species = field.species.find((entry) => entry.id === target.speciesId)!;
    expect(withMatReproduction(species)).toBe(species);
    expect(() => validateSpecies(species)).not.toThrow();
    expect(() => validateSpecies({ ...species, susceptibility: 1 })).toThrow();
    expect(() => validateSpecies({ ...species, cellularity: 'incorrect' })).toThrow();
    expect(() => validateSpecies({ ...species, contactRepresentation: 'individual' })).toThrow();
    const container = createCollectionContainer(field, target, 'live');
    expect(() => validateSpecimen(container)).not.toThrow();
    expect(() => validateSpecimen({ ...container, materialMassKg: species.massKg })).toThrow();
    expect(() => validateSpecimen({ ...container, volumeM3: 0.01 })).toThrow();
  });

  it('reuses finite scientific demand, pays for novelty rather than mass, and preserves one stasis slot per sample', () => {
    const { field, target, system, cargo } = fixture();
    const speciesIndex = field.species.findIndex((entry) => entry.id === target.speciesId);
    field.species[speciesIndex] = { ...field.species[speciesIndex], recognised: false, baselineSamples: 0 };
    system.act(field, { kind: 'collect', targetId: target.id }, cargo, 1);
    const specimen = cargo.specimens![0];
    const service = new XenobiologyService();
    service.collected(specimen.species);
    const quote = service.quote(specimen.species, specimen).credits;
    expect(quote).toBeGreaterThan(1000);
    expect(service.quote({ ...specimen.species, massKg: 30 }, specimen).credits).toBe(quote);
    service.submit(specimen.species, specimen);
    expect(service.quote(specimen.species, specimen).credits).toBe(0);
    cargo.specimens!.push({ ...specimen, id: 'second', sourceId: 'second' });
    expect(
      new SpecimenCargoSystem().canAdd(cargo, { ...specimen, id: 'third', sourceId: 'third' }, 1)
    ).toContain('slots');
  });
});
