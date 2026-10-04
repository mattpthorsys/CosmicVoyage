import { describe, expect, it } from 'vitest';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createDefaultCargo } from '../../core/components';
import { SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { createBiologicalDossier } from '../../core/xenobiology_ui';
import { ScienceLog } from '../../core/science_log';
import { ethologyFixture } from '../fixtures/ethology';

/** Runs one passive action through production simulation with previously confirmed identification. */
function observedField() {
  const f = ethologyFixture();
  const research = new XenobiologyService();
  research.snapshot.fields[f.field.site.id] = f.field;
  research.observe(f.consumer, 2);
  const result = new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, createDefaultCargo(50), 1);
  return { ...f, research, result };
}

describe('witnessed field behaviour', () => {
  it('records actual feeding once without strengthening biochemical evidence or changing research prices', () => {
    const f = observedField();
    const witness = f.result.behaviourWitnesses!.find((entry) => entry.observation.kind === 'feeding')!;
    const quote = f.research.quote(f.consumer);
    expect(f.research.recordBehaviour(witness)).toBe(true);
    expect(f.research.recordBehaviour(witness)).toBe(false);
    expect(f.research.hasBehaviour(f.consumer.id, f.field.site.id, 'feeding')).toBe(true);
    expect(f.research.hasBehaviour(f.consumer.id, 'another-site', 'feeding')).toBe(false);
    expect(f.research.evidence(f.consumer.id)?.level).toBe(2);
    expect(f.research.evidence(f.consumer.id)?.collected).toBe(false);
    expect(f.research.quote(f.consumer)).toEqual(quote);
    expect(f.research.snapshot.demand).toEqual({});
    expect(() => validateXenobiology(f.research.snapshot, [])).not.toThrow();
    const restored = new XenobiologyService();
    restored.restoreSnapshot(f.research.createSnapshot());
    expect(restored.recordBehaviour(witness)).toBe(false);
  });
  it('rejects unresolved identities and a witness from a missing source or impossible timestamp', () => {
    const f = observedField();
    const witness = f.result.behaviourWitnesses![0];
    const unresolved = new XenobiologyService();
    unresolved.snapshot.fields[f.field.site.id] = f.field;
    unresolved.observe(f.consumer, 1);
    expect(unresolved.recordBehaviour(witness)).toBe(false);
    expect(
      f.research.recordBehaviour({
        ...witness,
        observation: { ...witness.observation, individualIds: ['missing'] },
      })
    ).toBe(false);
    expect(
      f.research.recordBehaviour({
        ...witness,
        observation: { ...witness.observation, elapsedSeconds: f.field.elapsedSeconds + 1 },
      })
    ).toBe(false);
  });
  it.each(['distant', 'occluded', 'injured', 'stunned', 'sampled'] as const)(
    'does not record a %s organism',
    (reason) => {
      const f = ethologyFixture();
      if (reason === 'distant') f.field.roverX = 22;
      if (reason === 'occluded')
        f.field.terrain[10] = f.field.terrain[10].substring(0, 14) + '#' + f.field.terrain[10].substring(15);
      if (reason === 'injured') f.actor.injury = 0.1;
      if (reason === 'stunned') {
        f.actor.state = 'stunned';
        f.actor.recoveryAt = f.field.elapsedSeconds + 100;
      }
      if (reason === 'sampled') f.actor.sampled = true;
      const result = new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, createDefaultCargo(50), 1);
      expect(result.behaviourWitnesses).toBeUndefined();
    }
  );
  it('requires two visible moving group members rather than a retreat timer or a lone fleeing animal', () => {
    const f = ethologyFixture();
    f.field.species[1] = { ...f.consumer, behaviour: 'skittish', socialBehaviour: 'group-retreat' };
    f.actor.groupId = 'witness-group';
    f.actor.retreatUntil = 0;
    f.field.roverX = 16;
    const second = { ...f.actor, id: `${f.actor.id}-second`, x: 11, y: 11, homeY: 11 };
    f.field.individuals.push(second);
    const saved = structuredClone(f.field);
    const result = new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, createDefaultCargo(50), 1);
    const retreat = result.behaviourWitnesses!.find((entry) => entry.observation.kind === 'group-retreat')!;
    expect(retreat.observation.individualIds).toHaveLength(2);
    saved.individuals.pop();
    expect(
      new SurfaceEncounterSystem()
        .act(saved, { kind: 'wait' }, createDefaultCargo(50), 1)
        .behaviourWitnesses?.some((entry) => entry.observation.kind === 'group-retreat') ?? false
    ).toBe(false);
  });
  it('does not record weapon-induced episodes or mutate records while reading responsive dossiers', () => {
    const f = ethologyFixture();
    const result = new SurfaceEncounterSystem().act(
      f.field,
      { kind: 'shoot', targetId: f.actor.id },
      createDefaultCargo(50),
      1
    );
    expect(result.behaviourWitnesses).toBeUndefined();
    const observed = observedField();
    observed.research.recordBehaviour(observed.result.behaviourWitnesses![0]);
    const before = observed.research.createSnapshot();
    for (const width of [18, 36, 72]) {
      const dossier = createBiologicalDossier(observed.consumer, observed.research, width);
      const text = dossier
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ');
      expect(text).toContain('FIELD ETHOLOGY');
      expect(text).toContain('Substrate feeding');
      expect(
        dossier.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= width)
      ).toBe(true);
    }
    new ScienceLog().createModel(observed.research, [], 1, 30, 45, false);
    expect(observed.research.createSnapshot()).toEqual(before);
  });
  it('rejects duplicate, future, unsupported and untraceable episodes at the save boundary', () => {
    const f = observedField();
    f.research.recordBehaviour(f.result.behaviourWitnesses![0]);
    const saved = f.research.createSnapshot();
    const entry = saved.evidence[f.consumer.id];
    entry.behaviourObservations!.push(structuredClone(entry.behaviourObservations![0]));
    expect(() => validateXenobiology(saved, [])).toThrow();
    entry.behaviourObservations!.pop();
    entry.behaviourObservations![0] = {
      ...entry.behaviourObservations![0],
      elapsedSeconds: f.field.elapsedSeconds + 1,
    };
    expect(() => validateXenobiology(saved, [])).toThrow();
    entry.behaviourObservations![0] = {
      ...entry.behaviourObservations![0],
      elapsedSeconds: 0,
      kind: 'flying' as never,
    };
    expect(() => validateXenobiology(saved, [])).toThrow();
    entry.behaviourObservations![0] = {
      ...entry.behaviourObservations![0],
      kind: 'feeding',
      individualIds: ['missing'],
    };
    expect(() => validateXenobiology(saved, [])).toThrow();
  });
});
