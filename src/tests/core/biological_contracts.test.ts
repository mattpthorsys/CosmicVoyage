import { describe, expect, it } from 'vitest';
import {
  createBiologicalContract,
  createBiologicalContracts,
  deliverBiologicalContract,
} from '../../core/biological_contracts';
import { MissionProgressService } from '../../core/mission_progress';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createDefaultCargo } from '../../core/components';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { biologyFixture } from '../fixtures/biology';
import {
  HABITAT_VERSION,
  type BiosphereDefinition,
  type SpecimenContainer,
} from '../../entities/biology/biology_types';
import { matchesSpecimenObjective } from '../../core/mission_board';

/** Supplies a real generated community and an issuer without constructing Game or a renderer. */
function fixture() {
  const station = { id: 'station:biology', name: 'Biology Port', kind: 'starbase' as const };
  const generated = generateBiosphere(biologyFixture())!;
  const biosphere: BiosphereDefinition = {
    ...generated,
    sites: [
      {
        id: `${generated.id}/site:4,4`,
        x: 4,
        y: 4,
        label: 'Water margin',
        habitat: {
          version: HABITAT_VERSION,
          kind: 'moist-margin',
          description: 'Water-adjacent substrate.',
          relief: 0.04,
          waterDistanceCells: 1,
        },
      },
    ],
  };
  const field = createEncounter(biosphere, biosphere.sites[0]);
  const research = new XenobiologyService();
  research.snapshot.fields[field.site.id] = field;
  const mission = createBiologicalContract(station, 'Fixture System', [biosphere], research.snapshot.fields)!;
  const progress = new MissionProgressService();
  progress.accept(mission);
  const objective = mission.objectives[0];
  if (objective.kind !== 'specimen') throw new Error('Expected a biological objective.');
  const source = field.individuals.find((actor) => actor.speciesId === objective.speciesId)!;
  const species = field.species.find((entry) => entry.id === source.speciesId)!;
  const container: SpecimenContainer = {
    id: `${source.id}/live`,
    sourceId: source.id,
    siteId: field.site.id,
    species,
    kind: 'live',
    quality: 1,
    volumeM3: 0.5,
    sizeScale: source.sizeScale,
  };
  const hold = createDefaultCargo(10),
    rover = createDefaultCargo(10);
  const resources = { credits: 1000 };
  return {
    station,
    biosphere,
    field,
    research,
    progress,
    mission,
    objective,
    source,
    species,
    container,
    hold,
    rover,
    resources,
  };
}

describe('habitat specimen contracts', () => {
  it('offers real analysis and tissue alternatives alongside the finite live-reference request', () => {
    const f = fixture();
    const offers = createBiologicalContracts(
      f.station,
      'Fixture System',
      [f.biosphere],
      f.research.snapshot.fields,
      [],
      f.research
    );
    expect(offers).toHaveLength(4);
    expect(new Set(offers.map((mission) => mission.id)).size).toBe(4);
    expect(offers.some((mission) => mission.id.endsWith('size-comparison'))).toBe(true);
    expect(offers.some((mission) => mission.objectives[0].kind === 'biology-data')).toBe(true);
    expect(
      offers.some(
        (mission) =>
          mission.objectives[0].kind === 'specimen' && mission.objectives[0].requiredKind === 'tissue'
      )
    ).toBe(true);
    expect(
      createBiologicalContracts(
        { ...f.station, kind: 'automated-depot' },
        'Fixture System',
        [f.biosphere],
        {},
        [],
        f.research
      )
    ).toEqual([]);
    for (const actor of f.field.individuals) {
      actor.state = 'collected';
      actor.sampled = true;
    }
    expect(
      createBiologicalContracts(
        f.station,
        'Fixture System',
        [f.biosphere],
        f.research.snapshot.fields,
        [],
        f.research
      )
    ).toEqual([]);
  });

  it('requires site-specific detailed evidence and settles a data request once without consuming cargo', () => {
    const f = fixture();
    const mission = createBiologicalContracts(
      f.station,
      'Fixture System',
      [f.biosphere],
      f.research.snapshot.fields,
      [],
      f.research
    ).find((entry) => entry.objectives[0].kind === 'biology-data')!;
    const objective = mission.objectives[0];
    if (objective.kind !== 'biology-data') throw new Error('Expected an analysis objective.');
    const species = f.field.species.find((entry) => entry.id === objective.speciesId)!;
    f.progress.accept(mission);
    f.research.observe(species, 3);
    f.progress.recordBiologicalEvidence(species.id, 'wrong-site', 3);
    f.progress.recordBiologicalEvidence(species.id, objective.siteId, 2);
    expect(f.progress.getStatus(mission)).toBe('ACTIVE');
    const context = { station: f.station, holds: [f.hold, f.rover], resources: f.resources };
    expect(deliverBiologicalContract(f.progress, f.research, context, mission.id).ok).toBe(false);
    f.progress.recordBiologicalEvidence(species.id, objective.siteId, 3);
    expect(f.progress.getStatus(mission)).toBe('READY');
    expect(
      deliverBiologicalContract(
        f.progress,
        f.research,
        { ...context, station: { ...f.station, id: 'other' } },
        mission.id
      ).ok
    ).toBe(false);
    const value = f.research.quote(species).credits;
    expect(deliverBiologicalContract(f.progress, f.research, context, mission.id).ok).toBe(true);
    expect(f.resources.credits).toBe(1000 + 450 + value);
    expect(f.hold.specimens).toHaveLength(0);
    expect(f.research.quote(species).credits).toBe(0);
    const after = f.progress.createSnapshot();
    expect(deliverBiologicalContract(f.progress, f.research, context, mission.id).ok).toBe(false);
    expect(f.progress.createSnapshot()).toEqual(after);
    expect(f.resources.credits).toBe(1000 + 450 + value);
  });

  it('consumes one tissue container with source provenance and leaves its organism in the field', () => {
    const f = fixture();
    const mission = createBiologicalContracts(
      f.station,
      'Fixture System',
      [f.biosphere],
      f.research.snapshot.fields,
      [],
      f.research
    ).find(
      (entry) => entry.objectives[0].kind === 'specimen' && entry.objectives[0].requiredKind === 'tissue'
    )!;
    const objective = mission.objectives[0];
    if (objective.kind !== 'specimen') throw new Error('Expected a tissue objective.');
    const actor = f.field.individuals.find((entry) => entry.speciesId === objective.speciesId)!;
    f.field.roverX = actor.x;
    f.field.roverY = actor.y + 1;
    const result = new SurfaceEncounterSystem().act(
      f.field,
      { kind: 'sample', targetId: actor.id },
      f.rover,
      0
    );
    expect(result.evidence).toBeDefined();
    f.research.collected(result.evidence!.species);
    f.progress.accept(mission);
    expect(f.progress.getStatus(mission, f.rover.specimens!)).toBe('READY');
    expect(f.progress.getStatus(mission, [])).toBe('ACTIVE');
    const context = { station: f.station, holds: [f.hold, f.rover], resources: f.resources };
    expect(deliverBiologicalContract(f.progress, f.research, context, mission.id).ok).toBe(true);
    expect(f.rover.specimens).toHaveLength(0);
    expect(actor.state).not.toBe('collected');
    expect(actor.sampled).toBe(true);
    expect(f.resources.credits).toBeGreaterThanOrEqual(1550);
  });
  it('offers a deterministic real target compatible with included stasis', () => {
    const f = fixture();
    expect(
      createBiologicalContract(f.station, 'Fixture System', [f.biosphere], f.research.snapshot.fields)
    ).toEqual(f.mission);
    expect(f.species.socialBehaviour).toBe('group-retreat');
    expect(f.mission.detail).toContain('Basic stasis compatible');
    expect(
      createBiologicalContract({ ...f.station, kind: 'automated-depot' }, 'Fixture System', [f.biosphere], {})
    ).toBeNull();
    expect(
      createBiologicalContract(f.station, 'Fixture System', [{ ...f.biosphere, sites: [] }], {})
    ).toBeNull();
  });
  it('does not issue an impossible request after the local population has been removed', () => {
    const f = fixture();
    f.field.individuals.forEach((actor) => {
      actor.state = 'dead';
    });
    expect(
      createBiologicalContract(f.station, 'Fixture System', [f.biosphere], f.research.snapshot.fields)
    ).toBeNull();
    f.source.state = 'collected';
    expect(
      createBiologicalContract(f.station, 'Fixture System', [f.biosphere], f.research.snapshot.fields, [
        f.container,
      ])
    ).not.toBeNull();
  });
  it('derives readiness from actual cargo and loses it if a specimen is sold or discarded', () => {
    const f = fixture();
    expect(f.progress.getStatus(f.mission)).toBe('ACTIVE');
    expect(f.progress.getStatus(f.mission, [f.container])).toBe('READY');
    expect(f.progress.getReadyCount([f.container])).toBe(1);
    expect(f.progress.getStatus(f.mission, [])).toBe('ACTIVE');
    expect(f.progress.handIn(f.mission.id, f.station.name, f.station.id)).toBeNull();
    for (const invalid of [
      { ...f.container, siteId: 'wrong-site' },
      { ...f.container, kind: 'dead' as const },
      { ...f.container, kind: 'tissue' as const },
      { ...f.container, quality: 0.7 },
    ])
      expect(matchesSpecimenObjective(f.objective, invalid)).toBe(false);
  });
  it('settles a whole rover container once and shares the research ledger with Sell', () => {
    const f = fixture();
    f.source.state = 'collected';
    f.research.collected(f.species);
    f.rover.specimens!.push(f.container);
    const researchValue = f.research.quote(f.species, f.container).credits;
    const context = { station: f.station, holds: [f.hold, f.rover], resources: f.resources };
    const result = deliverBiologicalContract(f.progress, f.research, context, f.mission.id);
    expect(result.ok).toBe(true);
    expect(f.resources.credits).toBe(1000 + 900 + researchValue);
    expect(f.rover.specimens).toHaveLength(0);
    expect(f.progress.getStatus(f.mission)).toBe('COMPLETE');
    expect(f.research.quote(f.species, f.container).credits).toBe(0);
    expect(deliverBiologicalContract(f.progress, f.research, context, f.mission.id).ok).toBe(false);
    expect(f.resources.credits).toBe(1000 + 900 + researchValue);
  });
  it('accepts and records zero-demand material without restoring novelty', () => {
    const f = fixture();
    const species = { ...f.species, baselineSamples: 12 };
    f.container.species = species;
    f.source.state = 'collected';
    f.research.collected(species);
    f.hold.specimens!.push(f.container);
    expect(f.research.quote(species, f.container).credits).toBe(0);
    const result = deliverBiologicalContract(
      f.progress,
      f.research,
      {
        station: f.station,
        holds: [f.hold],
        resources: f.resources,
      },
      f.mission.id
    );
    expect(result.ok).toBe(true);
    expect(f.resources.credits).toBe(1900);
    expect(f.research.snapshot.demand[species.id].samples).toBe(1);
    expect(f.research.snapshot.demand[species.id].entitlementPaid).toBe(0);
  });
  it('refuses wrong issuer, lost provenance and duplicate ownership without changing any owner', () => {
    const f = fixture();
    f.research.collected(f.species);
    f.hold.specimens!.push(f.container);
    const context = { station: f.station, holds: [f.hold, f.rover], resources: f.resources };
    const before = {
      mission: f.progress.createSnapshot(),
      research: f.research.createSnapshot(),
      credits: f.resources.credits,
    };
    expect(
      deliverBiologicalContract(
        f.progress,
        f.research,
        { ...context, station: { ...f.station, id: 'other-port' } },
        f.mission.id
      ).ok
    ).toBe(false);
    expect(deliverBiologicalContract(f.progress, f.research, context, f.mission.id).ok).toBe(false);
    expect(f.progress.createSnapshot()).toEqual(before.mission);
    expect(f.research.createSnapshot()).toEqual(before.research);
    expect(f.resources.credits).toBe(before.credits);
    f.source.state = 'collected';
    f.rover.specimens!.push(f.container);
    const duplicateBefore = f.research.createSnapshot();
    expect(deliverBiologicalContract(f.progress, f.research, context, f.mission.id).ok).toBe(false);
    expect(f.research.createSnapshot()).toEqual(duplicateBefore);
    expect(f.hold.specimens).toHaveLength(1);
    expect(f.rover.specimens).toHaveLength(1);
  });
  it('keeps accepted targets immutable and persistent when procedural offers change', () => {
    const f = fixture();
    f.mission.objectives[0].targetName = 'Changed board label';
    expect(f.progress.getMission(f.mission.id)?.objectives[0].targetName).not.toBe('Changed board label');
    const restored = new MissionProgressService();
    restored.restoreSnapshot(JSON.parse(JSON.stringify(f.progress.createSnapshot())));
    expect(restored.getStationMissions(f.station.name, f.station.id)).toHaveLength(1);
    expect(restored.getSpecimenRequests(f.species.id, f.field.site.id)).toHaveLength(1);
    expect(restored.getStatus(restored.getMission(f.mission.id)!, [f.container])).toBe('READY');
  });
});
