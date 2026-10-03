import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { SpecimenCargoSystem } from '../../systems/specimen_cargo_system';
import { CargoSystem } from '../../systems/cargo_systems';
import { stunOutcome } from '../../entities/biology/stun_model';
import { XenobiologyService } from '../../core/xenobiology_service';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { createDefaultCargo } from '../../core/components';

/** Supplies a connected encounter with only one nearby sessile target for focused action tests. */
function fixture() {
  const biosphere = generateBiosphere(biologyFixture())!;
  const field = createEncounter(biosphere, { id: `${biosphere.id}/site:1,1`, label: 'Habitat', x: 1, y: 1 });
  field.individuals = [field.individuals[0]];
  const target = field.individuals[0];
  target.x = 15;
  target.y = 21;
  target.homeX = 15;
  target.homeY = 21;
  return { field, target, cargo: createDefaultCargo(1), system: new SurfaceEncounterSystem() };
}

describe('bounded biological encounters', () => {
  it('regenerates identical fields without consuming another generator stream', () => {
    expect(fixture().field).toEqual(fixture().field);
  });
  it('refuses obstructed movement without advancing any clocks or actors', () => {
    const { field, system, cargo } = fixture();
    const before = structuredClone(field);
    expect(system.act(field, { kind: 'move', dx: -1, dy: 0 }, cargo, 0).elapsedSeconds).toBe(0);
    expect(field).toEqual(before);
  });
  it('records observation and detailed analysis at explicit operation durations', () => {
    const { field, target, system, cargo } = fixture();
    expect(system.act(field, { kind: 'observe', targetId: target.id }, cargo, 0).evidence?.level).toBe(2);
    expect(system.act(field, { kind: 'analyse', targetId: target.id }, cargo, 0).evidence?.level).toBe(3);
    expect(field.elapsedSeconds).toBe(15);
  });
  it('refuses live capture without compatible stasis and leaves the source unchanged', () => {
    const { field, target, system, cargo } = fixture();
    const before = structuredClone(field);
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 0).message).toContain(
      'No stasis'
    );
    expect(field).toEqual(before);
    expect(cargo.specimens).toEqual([]);
  });
  it('permits one tissue sample and one whole capture, never regenerating either', () => {
    const { field, target, system, cargo } = fixture();
    expect(system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0).evidence?.collected).toBe(
      true
    );
    expect(system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0).elapsedSeconds).toBe(0);
    system.act(field, { kind: 'collect', targetId: target.id }, cargo, 1);
    expect(target.state).toBe('collected');
    expect(cargo.specimens).toHaveLength(2);
    expect(system.act(field, { kind: 'collect', targetId: target.id }, cargo, 1).elapsedSeconds).toBe(0);
  });
  it('uses a single mutually-exclusive dose distribution and increasing mortality', () => {
    const species = generateBiosphere(biologyFixture())!.species[1];
    const low = stunOutcome(species, 0),
      high = stunOutcome(species, 2);
    expect(low.dead + low.active + low.stunned).toBeCloseTo(1);
    expect(high.dead).toBeGreaterThan(low.dead);
    expect(stunOutcome(species, 2, 4).dead).toBeGreaterThan(high.dead);
  });
  it('issues a warning without dealing damage during the same multi-tick action', () => {
    const { field, target, system, cargo } = fixture();
    field.species[0] = { ...field.species[0], behaviour: 'territorial', massKg: 20 };
    expect(system.act(field, { kind: 'wait' }, cargo, 0).damage).toBe(0);
    expect(target.alerted).toBe(true);
    expect(system.act(field, { kind: 'wait' }, cargo, 0).damage).toBeGreaterThan(0);
  });
  it('recovers stunned individuals only on the local action clock', () => {
    const { field, target, system, cargo } = fixture();
    target.state = 'stunned';
    target.recoveryAt = 8;
    system.act(field, { kind: 'observe', targetId: target.id }, cargo, 0);
    expect(target.state).toBe('stunned');
    system.act(field, { kind: 'observe', targetId: target.id }, cargo, 0);
    expect(target.state).toBe('active');
  });
});

describe('biological cargo and snapshot contracts', () => {
  it('shares physical volume with bulk cargo and transfers containers atomically', () => {
    const { field, target, system, cargo } = fixture();
    system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0);
    const container = cargo.specimens![0],
      storage = new SpecimenCargoSystem(),
      destination = createDefaultCargo(0.1);
    destination.items.IRON = 0.1;
    expect(storage.transfer(cargo, destination, container.id, 0)).toContain('Insufficient');
    expect(cargo.specimens).toHaveLength(1);
    expect(destination.specimens).toHaveLength(0);
    destination.items = {};
    expect(storage.transfer(cargo, destination, container.id, 0)).toBeNull();
    expect(cargo.specimens).toHaveLength(0);
    expect(new CargoSystem().getTotalUnits(destination)).toBe(0.1);
    expect(new CargoSystem().addItem(destination, 'IRON', 1)).toBe(0);
  });
  it('validates source lifecycle and rejects duplicate ownership or missing actor references', () => {
    const { field, target, system, cargo } = fixture();
    system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0);
    const service = new XenobiologyService();
    service.snapshot.fields[field.site.id] = field;
    expect(() => validateXenobiology(service.snapshot, cargo.specimens!)).not.toThrow();
    expect(() => validateXenobiology(service.snapshot, [...cargo.specimens!, ...cargo.specimens!])).toThrow(
      'Duplicate'
    );
    target.sampled = false;
    expect(() => validateXenobiology(service.snapshot, cargo.specimens!)).toThrow('lifecycle');
  });
  it('persists individual depletion, evidence and global demand without retaining mutable references', () => {
    const { field, target, system, cargo } = fixture();
    const service = new XenobiologyService();
    service.snapshot.fields[field.site.id] = field;
    system.act(field, { kind: 'sample', targetId: target.id }, cargo, 0);
    service.collected(field.species[0]);
    service.submit(field.species[0], cargo.specimens![0]);
    const restored = new XenobiologyService();
    restored.restoreSnapshot(JSON.parse(JSON.stringify(service.createSnapshot())));
    expect(restored.quote(field.species[0], cargo.specimens![0]).credits).toBe(0);
    expect(restored.snapshot.fields[field.site.id].individuals[0].sampled).toBe(true);
    field.elapsedSeconds = 999;
    expect(restored.snapshot.fields[field.site.id].elapsedSeconds).toBe(5);
  });
});
