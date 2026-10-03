import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createEncounterView, createBiologicalDossier } from '../../core/xenobiology_ui';
import { validateXenobiology } from '../../entities/biology/biology_validation';

/** Isolates one territorial contact with a passable, visible home range. */
function fixture() {
  const field = createEncounter(generateBiosphere(biologyFixture())!, {
    id: 'territory',
    x: 1,
    y: 1,
    label: 'Territory',
  });
  field.terrain = field.terrain.map((row) => row.replaceAll('#', '.'));
  field.species[0] = {
    ...field.species[0],
    behaviour: 'territorial',
    massKg: 20,
    sizeM: 0.7,
    susceptibility: 1,
    metabolism: 'heterotroph',
    bodyForm: 'walker',
  };
  field.individuals = [field.individuals[0]];
  const actor = field.individuals[0];
  actor.x = actor.homeX = 15;
  actor.y = actor.homeY = 17;
  field.roverX = 16;
  field.roverY = 17;
  return { field, actor, cargo: createDefaultCargo(50), system: new SurfaceEncounterSystem() };
}

describe('readable bounded organism behaviour', () => {
  it('shows a defensive pose and clear warning before any damage, even during a long command', () => {
    const f = fixture();
    const first = f.system.act(f.field, { kind: 'wait' }, f.cargo, 1);
    expect(first.damage).toBe(0);
    expect(first.message).toContain('withdraw');
    expect(f.actor.activity).toBe('displaying');
    const service = new XenobiologyService();
    service.observe(f.field.species[0], 2);
    const view = createEncounterView(f.field, f.actor.id, service, {
      power: 1,
      stasisClass: 1,
      integrity: 100,
      cargo: { usedM3: 0, capacityM3: 50 },
      message: first.message,
    });
    expect(view.actors[0].displaying).toBe(true);
    expect(view.targetRange).toContain('warning display');
    expect(f.system.act(f.field, { kind: 'wait' }, f.cargo, 1).damage).toBeGreaterThan(0);
    expect(f.actor.activity).toBe('defending');
  });

  it('disengages outside its home territory and resumes deterministically after save/restoration', () => {
    const f = fixture();
    f.system.act(f.field, { kind: 'wait' }, f.cargo, 1);
    f.system.act(f.field, { kind: 'wait' }, f.cargo, 1);
    f.actor.x = 17;
    f.field.roverX = 23;
    const restored = structuredClone(f.field);
    const response = f.system.act(f.field, { kind: 'wait' }, f.cargo, 1);
    new SurfaceEncounterSystem().act(restored, { kind: 'wait' }, createDefaultCargo(50), 1);
    expect(response.damage).toBe(0);
    expect(f.actor.alerted).toBe(false);
    expect(f.actor.displayUntil).toBeUndefined();
    expect(f.actor.x).toBe(f.actor.homeX);
    expect(f.field).toEqual(restored);
    const service = new XenobiologyService();
    service.snapshot.fields[f.field.site.id] = f.field;
    expect(() => validateXenobiology(service.snapshot, [])).not.toThrow();
  });

  it('does not sense or attack a rover through an obstructed sight line', () => {
    const f = fixture();
    f.actor.x = f.actor.homeX = 13;
    f.field.terrain[17] = f.field.terrain[17].substring(0, 14) + '#' + f.field.terrain[17].substring(15);
    const response = f.system.act(f.field, { kind: 'wait' }, f.cargo, 1);
    expect(response.damage).toBe(0);
    expect(f.actor.alerted).toBe(false);
    expect(f.actor.activity).toBe('resting');
  });

  it('keeps benign activity non-aggressive and freezes all activity during instrument reading', () => {
    const f = fixture();
    f.field.species[0] = { ...f.field.species[0], behaviour: 'passive' };
    const activities = new Set<string>();
    for (let index = 0; index < 12; index++) {
      expect(f.system.act(f.field, { kind: 'wait' }, f.cargo, 1).damage).toBe(0);
      activities.add(f.actor.activity!);
    }
    expect(activities).toContain('resting');
    expect(activities).toContain('foraging');
    const before = structuredClone(f.field);
    createBiologicalDossier(f.field.species[0], new XenobiologyService(), 30, {
      field: f.field,
      target: f.actor,
      power: 1,
      stasisClass: 1,
    });
    expect(f.field).toEqual(before);
  });

  it('gives a fresh warning after recovery instead of immediately resuming a stale attack', () => {
    const f = fixture();
    f.actor.state = 'stunned';
    f.actor.alerted = true;
    f.actor.activity = 'defending';
    f.actor.displayUntil = 0;
    f.actor.recoveryAt = 5;
    expect(f.system.act(f.field, { kind: 'wait' }, f.cargo, 1).damage).toBe(0);
    expect(f.actor.activity).toBe('displaying');
  });
});
