import { describe, expect, it } from 'vitest';
import { createBehaviourContracts } from '../../core/behaviour_research';
import { deliverBiologicalContract } from '../../core/biological_contracts';
import { MissionProgressService } from '../../core/mission_progress';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createDefaultCargo } from '../../core/components';
import { SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import type { BehaviourObservationKind, EncounterField } from '../../entities/biology/biology_types';
import { ethologyFixture } from '../fixtures/ethology';

const station = { id: 'station:ethology', name: 'Ethology Port', kind: 'starbase' as const };

/** Uses a canonical field and the production contract/progress/settlement services. */
function fixture() {
  const f = ethologyFixture();
  const research = new XenobiologyService();
  research.snapshot.fields[f.field.site.id] = f.field;
  research.observe(f.consumer, 2);
  /** Rebuilds the board from current authoritative contacts, without changing an accepted target. */
  const offers = () =>
    createBehaviourContracts(station, 'Fixture System', [f.biosphere], research.snapshot.fields, research);
  const mission = offers().find((entry) => entry.id.endsWith('-feeding'))!;
  const progress = new MissionProgressService();
  progress.accept(mission);
  const hold = createDefaultCargo(10),
    rover = createDefaultCargo(10),
    resources = { credits: 1000 };
  const context = { station, holds: [hold, rover], resources };
  return { ...f, research, offers, mission, progress, hold, rover, resources, context };
}

/** Obtains evidence from simulation, never from an activity timer or an invented scan grade. */
function witness(f: ReturnType<typeof fixture>, kind: BehaviourObservationKind, field = f.field) {
  const result = new SurfaceEncounterSystem().act(field, { kind: 'wait' }, f.rover, 1);
  const observed = result.behaviourWitnesses!.find((entry) => entry.observation.kind === kind)!;
  expect(observed).toBeDefined();
  expect(f.research.recordBehaviour(observed)).toBe(true);
  f.progress.recordBehaviourEvidence(f.consumer.id, field.site.id, kind);
  return observed;
}

describe('non-destructive field-study contracts', () => {
  it('offers finite real feeding and shelter opportunities without mutating fields or evidence', () => {
    const f = fixture();
    const before = f.research.createSnapshot();
    expect(f.offers().map((entry) => entry.title)).toEqual([
      'Feeding behaviour survey',
      'Shelter-use survey',
    ]);
    expect(f.offers()).toEqual(f.offers());
    expect(f.research.createSnapshot()).toEqual(before);
    expect(
      createBehaviourContracts(
        { ...station, kind: 'automated-depot' },
        'Fixture',
        [f.biosphere],
        {},
        f.research
      )
    ).toEqual([]);
    expect(f.mission.objectives[0].kind).toBe('biology-behaviour');
    expect(f.mission.rewardCredits).toBe(650);
  });

  it.each(['injured', 'sampled', 'removed', 'unreachable'] as const)(
    'does not advertise an unobtainable %s population',
    (reason) => {
      const f = fixture();
      if (reason === 'injured') f.actor.injury = 0.1;
      if (reason === 'sampled') f.actor.sampled = true;
      if (reason === 'removed') f.actor.state = 'collected';
      if (reason === 'unreachable') {
        f.actor.x = f.actor.homeX = 20;
        f.actor.y = f.actor.homeY = 18;
        f.field.terrain = f.field.terrain.map((row) => '#'.repeat(row.length));
        f.field.terrain[f.actor.y] =
          f.field.terrain[f.actor.y].slice(0, f.actor.x) +
          '.' +
          f.field.terrain[f.actor.y].slice(f.actor.x + 1);
      }
      expect(f.offers()).toEqual([]);
    }
  );

  it('does not equate analysis, a wrong species/site or the wrong observed behaviour with the requested episode', () => {
    const f = fixture();
    f.research.observe(f.consumer, 3);
    f.progress.recordBiologicalEvidence(f.consumer.id, f.field.site.id, 3);
    f.progress.recordBehaviourEvidence(f.consumer.id, 'elsewhere', 'feeding');
    f.progress.recordBehaviourEvidence('another-species', f.field.site.id, 'feeding');
    f.progress.recordBehaviourEvidence(f.consumer.id, f.field.site.id, 'shelter-use');
    const before = f.research.createSnapshot();
    expect(f.progress.getStatus(f.mission)).toBe('ACTIVE');
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).ok).toBe(false);
    expect(f.resources.credits).toBe(1000);
    expect(f.research.createSnapshot()).toEqual(before);
  });

  it('settles a witnessed feeding record once for the fixed fee without cargo, novelty or sample-ledger changes', () => {
    const f = fixture();
    witness(f, 'feeding');
    expect(f.progress.getStatus(f.mission)).toBe('READY');
    const biology = f.research.createSnapshot(),
      cargo = structuredClone(f.context.holds);
    const before = f.progress.createSnapshot();
    expect(
      deliverBiologicalContract(
        f.progress,
        f.research,
        { ...f.context, station: { ...station, id: 'other-port' } },
        f.mission.id
      ).ok
    ).toBe(false);
    expect(f.progress.createSnapshot()).toEqual(before);
    const result = deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id);
    expect(result).toMatchObject({ ok: true, credits: 650, containerIds: [] });
    expect(f.resources.credits).toBe(1650);
    expect(f.research.createSnapshot()).toEqual(biology);
    expect(f.context.holds).toEqual(cargo);
    expect(f.progress.getStatus(f.mission)).toBe('COMPLETE');
    expect(f.progress.accept(f.offers()[0])).toBe(false);
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).ok).toBe(false);
    expect(f.resources.credits).toBe(1650);
  });

  it('revalidates episode provenance rather than trusting a READY flag', () => {
    const f = fixture();
    f.progress.recordBehaviourEvidence(f.consumer.id, f.field.site.id, 'feeding');
    const before = f.progress.createSnapshot();
    expect(f.progress.getStatus(f.mission)).toBe('READY');
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).ok).toBe(false);
    expect(f.progress.createSnapshot()).toEqual(before);
    expect(f.resources.credits).toBe(1000);
  });

  it('keeps earlier episodes usable when an organism has subsequently been collected', () => {
    const f = fixture();
    witness(f, 'feeding');
    f.actor.state = 'collected';
    const mission = f.offers()[0];
    const progress = new MissionProgressService();
    progress.accept(mission);
    for (const episode of f.research.evidence(f.consumer.id)!.behaviourObservations!)
      progress.recordBehaviourEvidence(f.consumer.id, episode.siteId, episode.kind);
    expect(progress.getStatus(mission)).toBe('READY');
    expect(deliverBiologicalContract(progress, f.research, f.context, mission.id).ok).toBe(true);
  });

  it('requires both real contrasting habitats, retains partial progress and refuses partial settlement atomically', () => {
    const f = fixture();
    const second = ethologyFixture('ethology/site:8,8');
    second.field.site = {
      ...second.field.site,
      x: 8,
      y: 8,
      habitat: { ...second.field.site.habitat!, kind: 'sheltered-ground', waterDistanceCells: null },
    };
    f.consumer = {
      ...f.consumer,
      socialBehaviour: 'group-retreat',
      behaviour: 'skittish',
      habitatAffinity: ['moist-margin', 'sheltered-ground'],
    };
    /** Adds a second genuine same-species contact for each controlled paired habitat. */
    const prepareGroup = (field: EncounterField) => {
      field.species[1] = f.consumer;
      const actor = field.individuals[1];
      actor.groupId = `${field.site.id}/group`;
      actor.retreatUntil = 0;
      field.individuals.push({ ...actor, id: `${actor.id}/second`, x: 11, y: 11, homeY: 11 });
      field.roverX = 16;
    };
    prepareGroup(f.field);
    prepareGroup(second.field);
    f.biosphere = {
      ...f.biosphere,
      species: [f.producer, f.consumer],
      sites: [...f.biosphere.sites, second.field.site],
    };
    f.research.snapshot.fields[second.field.site.id] = second.field;
    const mission = createBehaviourContracts(
      station,
      'Fixture System',
      [f.biosphere],
      f.research.snapshot.fields,
      f.research
    ).find((entry) => entry.id.endsWith('-group-retreat'))!;
    expect(mission.title).toBe('Coordinated retreat comparison');
    expect(mission.objectives).toHaveLength(2);
    f.progress.accept(mission);
    witness(f, 'group-retreat');
    expect(f.progress.getObjectiveCounts(mission)).toEqual({ completed: 1, total: 2 });
    const before = f.progress.createSnapshot();
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
    expect(f.progress.createSnapshot()).toEqual(before);
    const resumed = new MissionProgressService();
    resumed.restoreSnapshot(before);
    expect(resumed.getObjectiveCounts(mission)).toEqual({ completed: 1, total: 2 });
    f.progress = resumed;
    witness(f, 'group-retreat', second.field);
    expect(f.progress.getStatus(mission)).toBe('READY');
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id)).toMatchObject({
      ok: true,
      credits: 1100,
    });
    expect(f.resources.credits).toBe(2100);
    expect(f.research.snapshot.demand).toEqual({});
  });
});
