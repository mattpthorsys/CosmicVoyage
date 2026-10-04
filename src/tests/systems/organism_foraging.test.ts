import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { habitatForagingIntent } from '../../systems/organism_foraging';
import { createDefaultCargo } from '../../core/components';
import { PRNG } from '../../utils/prng';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';

/** Builds a quiet field with one actual producer, one mobile consumer and a small sheltered patch. */
function fixture() {
  const field = createEncounter(generateBiosphere(biologyFixture())!, {
    id: 'purposeful-foraging',
    label: 'Resource patch',
    x: 1,
    y: 1,
  });
  field.terrain = field.terrain.map((row) => row.replaceAll('#', '.'));
  field.patches = field.terrain.map((_row, y) => '.'.repeat(32).replaceAll('.', y === 9 ? 's' : 'o'));
  const producer = { ...field.species[0], foragingGuild: undefined, seeksShelter: false };
  const consumer = {
    ...field.species[1],
    behaviour: 'passive' as const,
    socialBehaviour: undefined,
    foragingGuild: 'grazer' as const,
    seeksShelter: true,
  };
  field.species = [producer, consumer];
  const source = { ...field.individuals[0], speciesId: producer.id, x: 10, y: 10, homeX: 10, homeY: 10 };
  const actor = { ...field.individuals[1], speciesId: consumer.id, x: 14, y: 10, homeX: 14, homeY: 10 };
  field.individuals = [source, actor];
  field.roverX = 24;
  field.roverY = 18;
  const phase = new PRNG(field.seed).seedNew(actor.id, 'activity-phase').randomInt(0, 5);
  return {
    field,
    producer,
    consumer,
    source,
    actor,
    feedingTick: (2 - phase + 6) % 6,
    restingTick: (6 - phase) % 6,
  };
}

describe('habitat-directed foraging', () => {
  it('seeks an adjacent producer resource and feeds only after reaching it', () => {
    const f = fixture();
    const intent = habitatForagingIntent(f.field, f.actor, f.consumer, f.feedingTick)!;
    expect(intent.activity).toBe('foraging');
    expect(intent.goal).not.toBeNull();
    expect(Math.hypot(intent.goal![0] - f.source.x, intent.goal![1] - f.source.y)).toBeLessThanOrEqual(1.5);
    [f.actor.x, f.actor.y] = [...intent.goal!];
    expect(habitatForagingIntent(f.field, f.actor, f.consumer, f.feedingTick)).toEqual({
      goal: null,
      activity: 'feeding',
    });
    expect(f.source.state).toBe('active');
  });
  it('returns to real shelter during a resting phase and does not mistake open ground for shelter', () => {
    const f = fixture();
    const intent = habitatForagingIntent(f.field, f.actor, f.consumer, f.restingTick)!;
    expect(intent.activity).toBe('returning');
    [f.actor.x, f.actor.y] = [...intent.goal!];
    expect(f.field.patches![f.actor.y][f.actor.x]).toBe('s');
    expect(habitatForagingIntent(f.field, f.actor, f.consumer, f.restingTick)).toEqual({
      goal: null,
      activity: 'sheltering',
    });
    f.field.patches = f.field.patches!.map((row) => row.replaceAll('s', 'o'));
    expect(habitatForagingIntent(f.field, f.actor, f.consumer, f.restingTick)?.activity).toBe('resting');
  });
  it('does not feed on dead or removed producers or seek unreachable, occupied resources', () => {
    const f = fixture();
    f.source.state = 'dead';
    expect(habitatForagingIntent(f.field, f.actor, f.consumer, f.feedingTick)?.activity).toBe('resting');
    f.source.state = 'active';
    for (let y = 8; y <= 12; y++)
      for (let x = 8; x <= 12; x++)
        if (Math.hypot(x - f.source.x, y - f.source.y) <= 1.5 && !(x === f.source.x && y === f.source.y))
          f.field.terrain[y] = f.field.terrain[y].substring(0, x) + '#' + f.field.terrain[y].substring(x + 1);
    expect(habitatForagingIntent(f.field, f.actor, f.consumer, f.feedingTick)?.activity).toBe('resting');
  });
  it('uses detrital substrate beside a producer community, not an invented carcass', () => {
    const f = fixture();
    f.actor.x = 11;
    f.actor.y = 9;
    const consumer = { ...f.consumer, foragingGuild: 'detritivore' as const };
    expect(habitatForagingIntent(f.field, f.actor, consumer, f.feedingTick)?.activity).toBe('feeding');
    f.field.patches = f.field.patches!.map((row) => row.replaceAll('s', 'o'));
    expect(habitatForagingIntent(f.field, f.actor, consumer, f.feedingTick)?.activity).toBe('resting');
  });
  it('resumes resource-directed behaviour identically and never consumes food or cargo', () => {
    const f = fixture();
    const restored = structuredClone(f.field);
    const cargo = createDefaultCargo(50);
    for (let step = 0; step < 12; step++) {
      new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, cargo, 1);
      new SurfaceEncounterSystem().act(restored, { kind: 'wait' }, createDefaultCargo(50), 1);
    }
    expect(restored).toEqual(f.field);
    expect(f.source.state).toBe('active');
    expect(cargo.items).toEqual({});
    expect(cargo.specimens).toEqual([]);
    const snapshot = createXenobiologySnapshot();
    snapshot.fields[f.field.site.id] = f.field;
    expect(() => validateXenobiology(snapshot, [])).not.toThrow();
  });
});
