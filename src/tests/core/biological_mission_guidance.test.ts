import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter, individualProfile } from '../../systems/surface_encounter_system';
import {
  assessBiologicalRequests,
  createBiologicalReference,
  type BiologicalFieldRequest,
} from '../../core/biological_mission_guidance';
import { formatMissionDetailSegments, type StarbaseMission } from '../../core/mission_board';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createBiologicalDossier, createEncounterView } from '../../core/xenobiology_ui';
import { MissionJournal } from '../../core/mission_journal';
import { MissionProgressService } from '../../core/mission_progress';
import { wrapDashboardLines } from '../../core/text_ui';
import { ethologyFixture } from '../fixtures/ethology';
import { createBehaviourContracts } from '../../core/behaviour_research';

/** Creates a genuine generated contact with an explicit finite request and no acquired evidence. */
function fixture() {
  const biosphere = generateBiosphere(biologyFixture())!;
  const field = createEncounter(biosphere, { id: 'reference-site', x: 4, y: 5, label: 'Reference habitat' });
  const target = field.individuals[0];
  const species = field.species.find((entry) => entry.id === target.speciesId)!;
  const mission: StarbaseMission = {
    id: 'reference',
    title: 'Habitat reference specimen',
    type: 'xenobiology',
    issuer: 'Survey Office',
    summary: 'One live reference',
    detail: 'Return to the issuer.',
    rewardCredits: 900,
    risk: 'Low',
    originStarbaseId: 'port',
    originStarbaseName: 'Survey Port',
    systemName: 'Fixture',
    objectives: [
      {
        id: 'live',
        kind: 'specimen',
        targetName: species.name,
        targetLabel: 'Live reference',
        speciesId: species.id,
        siteId: field.site.id,
        requiredKind: 'live',
        minimumQuality: 0.75,
        reference: createBiologicalReference(species),
      },
    ],
  };
  const request: BiologicalFieldRequest = { mission, status: 'ACTIVE' };
  const service = new XenobiologyService();
  const contact = { field, target, stasisClass: 1 };
  const presentation = {
    power: 1 as const,
    stasisClass: 1,
    integrity: 100,
    cargo: { usedM3: 0, capacityM3: 50 },
    message: '',
    missionRequests: [request],
  };
  return { field, target, species, mission, request, service, contact, presentation };
}

describe('biological mission guidance', () => {
  it('marks identified uninjured field-study sources without stasis and removes markers after the episode is supplied', () => {
    const f = ethologyFixture();
    const service = new XenobiologyService();
    const mission = createBehaviourContracts(
      { id: 'ethology-port', name: 'Ethology Port', kind: 'starbase' },
      'Fixture',
      [f.biosphere],
      { [f.field.site.id]: f.field },
      service
    )[0];
    const request: BiologicalFieldRequest = { mission, status: 'ACTIVE', completedObjectiveIds: [] };
    const contact = { field: f.field, target: f.actor, stasisClass: 0 };
    expect(assessBiologicalRequests(f.consumer, 1, [request], contact).eligible).toBe(false);
    const identified = assessBiologicalRequests(f.consumer, 2, [request], contact);
    expect(identified.eligible).toBe(true);
    expect(identified.summary!.segments.map((span) => span.text).join(' ')).toContain('PASSIVE RECORD');
    f.actor.sampled = true;
    expect(assessBiologicalRequests(f.consumer, 2, [request], contact).eligible).toBe(false);
    f.actor.sampled = false;
    f.actor.state = 'stunned';
    expect(assessBiologicalRequests(f.consumer, 2, [request], contact).eligible).toBe(false);
    f.actor.state = 'active';
    const completed = { ...request, completedObjectiveIds: [mission.objectives[0].id] };
    expect(assessBiologicalRequests(f.consumer, 2, [completed], contact).eligible).toBe(false);
    const ready = assessBiologicalRequests(f.consumer, 2, [{ ...completed, status: 'READY' }], contact);
    expect(ready.eligible).toBe(false);
    expect(
      ready.lines
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('return to issuer');
  });
  it('marks only the missing size contribution, not an already supplied small individual', () => {
    const f = fixture();
    const template = f.mission.objectives[0];
    if (template.kind !== 'specimen') throw new Error('Expected specimen.');
    f.mission.objectives = [
      { ...template, id: 'small', requiredKind: 'tissue', sizeClass: 'small' },
      { ...template, id: 'large', requiredKind: 'tissue', sizeClass: 'large' },
    ];
    f.target.sizeScale = 0.5;
    expect(assessBiologicalRequests(f.species, 2, [f.request], f.contact).eligible).toBe(true);
    const partial = { ...f.request, completedObjectiveIds: ['small'] };
    const guidance = assessBiologicalRequests(f.species, 2, [partial], f.contact);
    expect(guidance.eligible).toBe(false);
    expect(guidance.lines[0].segments[0].text).toContain('other contributions still needed');
    expect(guidance.lines.flatMap((line) => line.segments.map((span) => span.text)).join(' ')).toContain(
      'LARGE individual required'
    );
    f.target.sizeScale = 1.65;
    const large = assessBiologicalRequests(f.species, 2, [partial], f.contact);
    expect(large.eligible).toBe(true);
    expect(large.summary!.segments[0].text).toContain('LARGE TISSUE');
    expect(
      assessBiologicalRequests(
        f.species,
        2,
        [{ ...partial, completedObjectiveIds: ['small', 'large'] }],
        f.contact
      ).eligible
    ).toBe(false);
  });

  it('separates preliminary trait similarities from confirmed identity and never reveals hidden physiology', () => {
    const f = fixture();
    expect(assessBiologicalRequests(f.species, 0, [f.request], f.contact).lines).toEqual([]);
    const preliminary = assessBiologicalRequests(f.species, 1, [f.request], f.contact);
    expect(preliminary.eligible).toBe(false);
    expect(preliminary.confirmed).toBe(false);
    expect(preliminary.traits).toContain('symmetry');
    expect(preliminary.traits).not.toContain('behaviour');
    const lookalike = { ...f.species, id: 'other-species' };
    expect(assessBiologicalRequests(lookalike, 1, [f.request], f.contact)).toEqual(preliminary);
    expect(assessBiologicalRequests(lookalike, 2, [f.request], f.contact).lines).toEqual([]);
    f.service.observe(f.species, 1);
    const spans = createBiologicalDossier(f.species, f.service, 24, {
      ...f.contact,
      power: 1,
      missionRequests: [f.request],
    }).flatMap((line) => line.segments);
    const text = spans.map((span) => span.text).join(' ');
    expect(text).toContain('POSSIBLE REFERENCE');
    expect(text).not.toContain(f.species.senses);
    expect(text).not.toContain(f.species.chemistry);
    expect(spans.some((span) => span.tone === 'match' && span.text === f.species.symmetry)).toBe(true);
  });

  it('requires exact habitat, feasible live condition, handling and an outstanding request for a field marker', () => {
    const f = fixture();
    f.field.roverX = f.target.x;
    f.field.roverY = f.target.y;
    f.service.observe(f.species, 2);
    expect(
      createEncounterView(f.field, f.target.id, f.service, f.presentation).actors.find(
        (actor) => actor.id === f.target.id
      )?.missionTarget
    ).toBe(true);
    f.field.site = { ...f.field.site, id: 'other-site' };
    expect(assessBiologicalRequests(f.species, 2, [f.request], f.contact).eligible).toBe(false);
    f.field.site = { ...f.field.site, id: 'reference-site' };
    f.target.state = 'dead';
    expect(assessBiologicalRequests(f.species, 2, [f.request], f.contact).eligible).toBe(false);
    f.target.state = 'active';
    f.target.injury = 1;
    expect(assessBiologicalRequests(f.species, 2, [f.request], f.contact).eligible).toBe(false);
    f.target.injury = 0;
    expect(
      assessBiologicalRequests(f.species, 2, [{ ...f.request, status: 'READY' }], f.contact).eligible
    ).toBe(false);
    expect(
      assessBiologicalRequests(f.species, 2, [{ ...f.request, status: 'COMPLETE' }], f.contact).lines
    ).toEqual([]);
    expect(
      assessBiologicalRequests(f.species, 2, [f.request], { ...f.contact, stasisClass: 0 }).eligible
    ).toBe(false);
    const large = { ...f.species, massKg: 60 };
    f.field.species = [large];
    f.target.sizeScale = 1.65;
    expect(
      assessBiologicalRequests(individualProfile(f.field, f.target), 2, [f.request], f.contact).eligible
    ).toBe(false);
    // The dossier receives an effective profile; the shared rule must scale its canonical source exactly once.
    f.target.sizeScale = 1.1;
    expect(
      assessBiologicalRequests(individualProfile(f.field, f.target), 2, [f.request], f.contact).eligible
    ).toBe(true);
  });

  it('distinguishes tissue and analysis opportunities after an individual has died or been sampled', () => {
    const f = fixture();
    const objective = f.mission.objectives[0];
    if (objective.kind !== 'specimen') throw new Error('Expected a reference objective.');
    objective.requiredKind = 'tissue';
    f.target.state = 'dead';
    expect(assessBiologicalRequests(f.species, 2, [f.request], f.contact).eligible).toBe(true);
    f.target.sampled = true;
    expect(assessBiologicalRequests(f.species, 2, [f.request], f.contact).eligible).toBe(false);
    f.mission.objectives = [
      {
        id: 'analysis',
        kind: 'biology-data',
        speciesId: f.species.id,
        siteId: f.field.site.id,
        targetName: f.species.name,
        targetLabel: 'Analyse',
        requiredEvidenceLevel: 3,
        reference: createBiologicalReference(f.species),
      },
    ];
    expect(
      assessBiologicalRequests(f.species, 2, [f.request], { ...f.contact, stasisClass: 0 }).eligible
    ).toBe(true);
  });

  it('preserves reference emphasis through narrow contracts, sensor output and dossier wrapping without state changes', () => {
    const f = fixture();
    f.field.roverX = f.target.x;
    f.field.roverY = f.target.y;
    f.service.observe(f.species, 2);
    const before = f.service.createSnapshot();
    const description = formatMissionDetailSegments(f.mission, 'ACTIVE');
    expect(description[1].tone).toBe('cyan');
    expect(description[1].text).toContain(f.species.symmetry);
    const wrapped = wrapDashboardLines([{ segments: description }], 20);
    expect(wrapped.every((line) => line.segments.reduce((n, span) => n + span.text.length, 0) <= 20)).toBe(
      true
    );
    expect(wrapped.flatMap((line) => line.segments).some((span) => span.tone === 'cyan')).toBe(true);
    const journal = new MissionJournal().createModel(
      [{ mission: f.mission, status: 'ACTIVE', completed: 0, total: 1 }],
      100,
      40,
      false
    );
    expect(
      journal.dashboard
        ?.flatMap((line) => line.segments)
        .some((span) => span.text.includes(f.species.locomotion) && span.tone === 'cyan')
    ).toBe(true);
    const view = createEncounterView(f.field, f.target.id, f.service, f.presentation);
    expect(view.briefSegments.some((span) => span.text === f.species.role && span.tone === 'match')).toBe(
      true
    );
    expect(
      view.scannerDashboard
        .flatMap((line) => line.segments)
        .some((span) => span.text === f.species.name && span.tone === 'match')
    ).toBe(true);
    const dossier = createBiologicalDossier(individualProfile(f.field, f.target), f.service, 30, {
      ...f.contact,
      power: 1,
      missionRequests: [f.request],
    });
    expect(
      dossier
        .flatMap((line) => line.segments)
        .some((span) => span.text === f.species.locomotion && span.tone === 'match')
    ).toBe(true);
    expect(f.service.createSnapshot()).toEqual(before);
  });

  it('adds office traits to older accepted contracts without changing their identity, requirements or progress', () => {
    const f = fixture();
    const objective = f.mission.objectives[0];
    if (objective.kind === 'scan') throw new Error('Expected a biological objective.');
    delete objective.reference;
    const progress = new MissionProgressService();
    progress.accept(f.mission);
    progress.resolveBiologicalReferences({ [f.field.site.id]: f.field });
    const resolved = progress.getMission(f.mission.id)!;
    expect(resolved.objectives[0]).toEqual({ ...objective, reference: createBiologicalReference(f.species) });
    expect(progress.getStatus(resolved)).toBe('ACTIVE');
  });
});
