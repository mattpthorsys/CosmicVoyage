import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { individualPhysicalProfile } from '../../entities/biology/biology_rules';
import { stunOutcome } from '../../entities/biology/stun_model';
import {
  createEncounter,
  SurfaceEncounterSystem,
  individualProfile,
} from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import { XenobiologyService } from '../../core/xenobiology_service';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { biologyFixture } from '../fixtures/biology';

/** Places a single incapacitated grazer next to the rover with an explicit, reproducible size. */
function fixture(sizeScale: number) {
  const biosphere = generateBiosphere(biologyFixture())!;
  const field = createEncounter(biosphere, {
    id: 'sizes',
    label: 'Margin',
    x: 1,
    y: 1,
    habitat: {
      version: 1,
      kind: 'moist-margin',
      relief: 0.01,
      description: 'Wet margin.',
      waterDistanceCells: 1,
    },
  });
  const actor = field.individuals.find((individual) => individual.speciesId === biosphere.species[1].id)!;
  field.species = field.species.map((species) =>
    species.id === actor.speciesId
      ? { ...species, massKg: 65, sizeM: 1, behaviour: 'passive' as const, socialBehaviour: undefined }
      : species
  );
  field.individuals = [actor];
  Object.assign(actor, {
    x: 6,
    y: 6,
    homeX: 6,
    homeY: 6,
    state: 'stunned',
    recoveryAt: 1000,
    sizeScale,
    groupId: undefined,
    retreatUntil: undefined,
  });
  field.roverX = 6;
  field.roverY = 7;
  field.terrain = field.terrain.map((row) => row.replaceAll('#', '.'));
  return { field, actor, cargo: createDefaultCargo(10), system: new SurfaceEncounterSystem() };
}

describe('individual physical variation', () => {
  it('uses mass scale and cubic length consistently in stun predictions and handling', () => {
    const f = fixture(0.45);
    const canonical = f.field.species.find((species) => species.id === f.actor.speciesId)!;
    const small = individualProfile(f.field, f.actor);
    const large = individualPhysicalProfile(canonical, 1.65);
    expect(small.massKg).toBeCloseTo(65 * 0.45);
    expect(small.sizeM).toBeCloseTo(Math.cbrt(0.45));
    expect(stunOutcome(small, 1).stunned).not.toBe(stunOutcome(large, 1).stunned);
    expect(canonical.massKg).toBe(65);
  });
  it('captures a manageable individual with canonical species identity and persistent source size', () => {
    const f = fixture(0.45);
    const result = f.system.act(f.field, { kind: 'collect', targetId: f.actor.id }, f.cargo, 1);
    expect(result.elapsedSeconds).toBeGreaterThan(0);
    expect(f.cargo.specimens![0].sizeScale).toBe(0.45);
    expect(f.cargo.specimens![0].species.massKg).toBe(65);
    expect(f.cargo.specimens![0].volumeM3).toBe(0.4);
    const research = new XenobiologyService();
    research.snapshot.fields[f.field.site.id] = f.field;
    research.collected(result.evidence!.species);
    expect(() => validateXenobiology(research.createSnapshot(), f.cargo.specimens!)).not.toThrow();
    const corrupt = structuredClone(f.cargo.specimens!);
    corrupt[0].sizeScale = 1.65;
    expect(() => validateXenobiology(research.createSnapshot(), corrupt)).toThrow('size');
  });
  it('refuses an oversized whole specimen atomically while retaining the tissue alternative', () => {
    const f = fixture(1.65);
    const before = structuredClone(f.field);
    expect(f.system.act(f.field, { kind: 'collect', targetId: f.actor.id }, f.cargo, 1).elapsedSeconds).toBe(
      0
    );
    expect(f.field).toEqual(before);
    expect(f.cargo.specimens).toHaveLength(0);
    expect(
      f.system.act(f.field, { kind: 'sample', targetId: f.actor.id }, f.cargo, 1).elapsedSeconds
    ).toBeGreaterThan(0);
    expect(f.cargo.specimens![0].kind).toBe('tissue');
  });
  it('keeps scientific prices tied to species demand rather than giving large individuals another novelty reward', () => {
    const f = fixture(0.45);
    f.system.act(f.field, { kind: 'collect', targetId: f.actor.id }, f.cargo, 1);
    const specimen = f.cargo.specimens![0];
    const service = new XenobiologyService();
    service.collected(specimen.species);
    expect(service.quote(specimen.species, specimen)).toEqual(
      service.quote(specimen.species, { ...specimen, sizeScale: 1.65 })
    );
    service.submit(specimen.species, specimen, true);
    expect(service.quote(specimen.species, { ...specimen, sizeScale: 1.65 }).credits).toBe(0);
  });
});
