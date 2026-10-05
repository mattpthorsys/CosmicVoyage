import { describe, expect, it } from 'vitest';
import {
  createComparativeBiologicalContracts,
  createMineralisationComparison,
} from '../../core/comparative_biology';
import { deliverBiologicalContract } from '../../core/biological_contracts';
import {
  allocateSpecimenObjectives,
  isBiologicalMissionObjective,
  type SpecimenMissionObjective,
} from '../../core/mission_board';
import { MissionProgressService } from '../../core/mission_progress';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createDefaultCargo } from '../../core/components';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import {
  HABITAT_VERSION,
  type BiosphereDefinition,
  type SpecimenContainer,
} from '../../entities/biology/biology_types';
import { individualSizeClass } from '../../entities/biology/biology_rules';
import { createEncounter } from '../../systems/surface_encounter_system';
import { biologyFixture } from '../fixtures/biology';

/** Uses real communities, with two explicitly measured habitat kinds and separate expedition holds. */
function fixture() {
  const generated = generateBiosphere(biologyFixture())!;
  const biosphere: BiosphereDefinition = {
    ...generated,
    sites: (['moist-margin', 'sheltered-ground'] as const).map((kind, index) => ({
      id: `${generated.id}/site:${index + 4},4`,
      x: index + 4,
      y: 4,
      label: index ? 'Sheltered substrate' : 'Water margin',
      habitat: {
        version: HABITAT_VERSION,
        kind,
        description: kind,
        relief: 0.04,
        waterDistanceCells: index ? 12 : 1,
      },
    })),
  };
  const research = new XenobiologyService();
  const fields = biosphere.sites.map((site) => createEncounter(biosphere, site));
  for (const field of fields) research.snapshot.fields[field.site.id] = field;
  const station = { id: 'station:comparison', name: 'Comparison Port', kind: 'starbase' as const };
  /** Rebuilds offers from current records and the contents of both cargo holds. */
  const offers = () =>
    createComparativeBiologicalContracts(
      station,
      'Fixture',
      [biosphere],
      research.snapshot.fields,
      [...hold.specimens!, ...rover.specimens!],
      research
    );
  const hold = createDefaultCargo(10),
    rover = createDefaultCargo(10),
    resources = { credits: 100 };
  const progress = new MissionProgressService();
  const context = { station, holds: [hold, rover], resources };
  /** Isolates settlement from weapon physics, retaining the actual source's collection provenance. */
  function sample(objective: SpecimenMissionObjective): SpecimenContainer {
    const field = research.snapshot.fields[objective.siteId];
    const source = field.individuals.find(
      (actor) =>
        actor.speciesId === objective.speciesId &&
        !actor.sampled &&
        individualSizeClass(actor.sizeScale) === objective.sizeClass
    )!;
    source.sampled = true;
    const species = field.species.find((entry) => entry.id === source.speciesId)!;
    research.collected(species);
    return {
      id: `${source.id}/tissue`,
      sourceId: source.id,
      siteId: field.site.id,
      species,
      kind: 'tissue',
      quality: 1,
      volumeM3: 0.02,
      sizeScale: source.sizeScale,
    };
  }
  return { biosphere, fields, research, station, offers, hold, rover, resources, progress, context, sample };
}

describe('comparative biological studies', () => {
  it('requests real covering forms, rejects forged provenance and pays the complete pair only once', () => {
    const f = fixture();
    const field = f.fields[0];
    const sources = field.individuals
      .filter((actor) => actor.speciesId === field.individuals[0].speciesId)
      .slice(0, 2);
    field.species = field.species.map((species) =>
      species.id === sources[0].speciesId ? { ...species, structuralMaterial: 'mineral' as const } : species
    );
    sources[0].mineralisation = 'standard';
    sources[1].mineralisation = 'reinforced';
    const mission = createMineralisationComparison(
      f.station,
      'Fixture',
      [f.biosphere],
      f.research.snapshot.fields,
      [],
      f.research
    )[0];
    expect(mission).toBeDefined();
    f.progress.accept(mission);
    const species = field.species.find((entry) => entry.id === sources[0].speciesId)!;
    f.research.collected(species);
    for (const source of sources) {
      source.sampled = true;
      f.hold.specimens!.push({
        id: `${source.id}/tissue`,
        sourceId: source.id,
        siteId: field.site.id,
        species,
        kind: 'tissue',
        quality: 1,
        volumeM3: 0.1,
        sizeScale: source.sizeScale,
        mineralisation: source.mineralisation,
      });
    }
    f.hold.specimens![1].mineralisation = 'standard';
    const before = structuredClone(f.hold);
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
    expect(f.hold).toEqual(before);
    f.hold.specimens![1].mineralisation = 'reinforced';
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(true);
    expect(f.hold.specimens).toHaveLength(0);
    const credits = f.resources.credits;
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
    expect(f.resources.credits).toBe(credits);
  });
  it('offers deterministic finite comparisons only for actual sizes and contrasting habitats', () => {
    const f = fixture();
    const offers = f.offers();
    expect(offers).toHaveLength(2);
    expect(f.offers()).toEqual(offers);
    const sizes = offers.find((mission) => mission.id.endsWith('size-comparison'))!;
    expect(sizes.objectives.map((objective) => objective.kind === 'specimen' && objective.sizeClass)).toEqual(
      ['small', 'large']
    );
    const habitats = offers.find((mission) => mission.id.endsWith('habitat-comparison'))!;
    expect(
      new Set(
        habitats.objectives.map((objective) => isBiologicalMissionObjective(objective) && objective.siteId)
      ).size
    ).toBe(2);
    for (const field of f.fields)
      for (const actor of field.individuals) {
        actor.state = 'collected';
        actor.sampled = true;
      }
    expect(f.offers()).toEqual([]);
    expect(
      createComparativeBiologicalContracts(
        { ...f.station, kind: 'automated-depot' },
        'Fixture',
        [f.biosphere],
        {},
        [],
        f.research
      )
    ).toEqual([]);
  });

  it('refuses partial delivery without mutation, then consumes the pair across holds and pays once', () => {
    const f = fixture();
    const mission = f.offers().find((entry) => entry.id.endsWith('size-comparison'))!;
    f.progress.accept(mission);
    const [small, large] = mission.objectives as SpecimenMissionObjective[];
    const first = f.sample(small);
    f.hold.specimens!.push(first);
    expect(f.progress.getCompletedObjectiveIds(mission, [first])).toEqual([small.id]);
    expect(f.progress.getStatus(mission, [first])).toBe('ACTIVE');
    const before = structuredClone({
      research: f.research.createSnapshot(),
      missions: f.progress.createSnapshot(),
      hold: f.hold,
      rover: f.rover,
      credits: f.resources.credits,
    });
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
    expect({
      research: f.research.createSnapshot(),
      missions: f.progress.createSnapshot(),
      hold: f.hold,
      rover: f.rover,
      credits: f.resources.credits,
    }).toEqual(before);
    const second = f.sample(large);
    f.rover.specimens!.push(second);
    expect(f.progress.getStatus(mission, [first, second])).toBe('READY');
    expect(f.progress.getStatus(mission, [second])).toBe('ACTIVE');
    // Reconstruct expected settlement through the same ordinary demand ledger, rather than granting novelty twice.
    const ledger = new XenobiologyService();
    ledger.restoreSnapshot(f.research.createSnapshot());
    const expected =
      mission.rewardCredits +
      ledger.submit(first.species, first, true) +
      ledger.submit(second.species, second, true);
    const result = deliverBiologicalContract(f.progress, f.research, f.context, mission.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.containerIds).toEqual([first.id, second.id]);
    expect(f.resources.credits).toBe(100 + expected);
    expect(f.hold.specimens).toEqual([]);
    expect(f.rover.specimens).toEqual([]);
    expect(f.progress.getStatus(mission)).toBe('COMPLETE');
    expect(f.research.quote(first.species, first).credits).toBe(0);
    expect(f.research.quote(second.species, second).credits).toBe(0);
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
    expect(f.resources.credits).toBe(100 + expected);
  });

  it.each(['duplicate', 'size', 'source', 'submitted'] as const)(
    'rejects %s provenance before any partial settlement',
    (fault) => {
      const f = fixture();
      const mission = f.offers().find((entry) => entry.id.endsWith('size-comparison'))!;
      f.progress.accept(mission);
      const [small, large] = mission.objectives as SpecimenMissionObjective[];
      f.hold.specimens!.push(f.sample(small));
      const second = f.sample(large);
      f.rover.specimens!.push(second);
      if (fault === 'duplicate') f.hold.specimens!.push(structuredClone(second));
      if (fault === 'size') second.sizeScale = 1.8;
      if (fault === 'source')
        f.research.snapshot.fields[second.siteId].individuals.find(
          (actor) => actor.id === second.sourceId
        )!.sampled = false;
      if (fault === 'submitted') f.research.submit(second.species, second, true);
      const before = structuredClone({
        research: f.research.createSnapshot(),
        missions: f.progress.createSnapshot(),
        holds: f.context.holds,
        credits: f.resources.credits,
      });
      expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
      expect({
        research: f.research.createSnapshot(),
        missions: f.progress.createSnapshot(),
        holds: f.context.holds,
        credits: f.resources.credits,
      }).toEqual(before);
    }
  );

  it('allocates distinct containers and reassigns a flexible match for a restrictive objective', () => {
    const f = fixture();
    const mission = f.offers().find((entry) => entry.id.endsWith('size-comparison'))!;
    const [small, large] = mission.objectives as SpecimenMissionObjective[];
    const first = f.sample(small),
      second = f.sample(large);
    const flexible = { ...small, id: 'any', sizeClass: undefined };
    const allocated = allocateSpecimenObjectives([flexible, small], [first, second]);
    expect(allocated.get(flexible.id)?.id).toBe(second.id);
    expect(allocated.get(small.id)?.id).toBe(first.id);
    expect(allocateSpecimenObjectives([flexible, small], [first, first]).size).toBe(1);
    expect(allocateSpecimenObjectives([small, large], [{ ...first, siteId: 'wrong' }, second]).size).toBe(1);
  });

  it('requires two site-specific analyses, persists each packet, and does not double-pay observational novelty', () => {
    const f = fixture();
    const mission = f.offers().find((entry) => entry.id.endsWith('habitat-comparison'))!;
    f.progress.accept(mission);
    const [first, second] = mission.objectives;
    if (first.kind !== 'biology-data' || second.kind !== 'biology-data')
      throw new Error('Expected analysis pair.');
    const species = f.biosphere.species.find((entry) => entry.id === first.speciesId)!;
    f.research.observe(species, 3);
    f.progress.recordBiologicalEvidence(species.id, first.siteId, 3);
    f.progress.recordBiologicalEvidence(species.id, second.siteId, 2);
    expect(f.progress.getCompletedObjectiveIds(mission)).toEqual([first.id]);
    expect(deliverBiologicalContract(f.progress, f.research, f.context, mission.id).ok).toBe(false);
    const restored = new MissionProgressService();
    restored.restoreSnapshot(f.progress.createSnapshot());
    restored.recordBiologicalEvidence(species.id, second.siteId, 3);
    expect(restored.getStatus(mission)).toBe('READY');
    const value = f.research.quote(species).credits;
    expect(deliverBiologicalContract(restored, f.research, f.context, mission.id).ok).toBe(true);
    expect(f.resources.credits).toBe(100 + mission.rewardCredits + value);
    expect(f.hold.specimens).toEqual([]);
    expect(f.rover.specimens).toEqual([]);
    expect(f.research.quote(species).credits).toBe(0);
  });
});
