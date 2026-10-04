import { describe, expect, it } from 'vitest';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import { XenobiologyService } from '../../core/xenobiology_service';
import { createPropaguleContract } from '../../core/propagule_research';
import { deliverBiologicalContract } from '../../core/biological_contracts';
import { MissionProgressService } from '../../core/mission_progress';
import { assessBiologicalRequests } from '../../core/biological_mission_guidance';
import {
  createBiologicalDossier,
  specimenRows,
  specimenSaleRows,
  targetQuotes,
} from '../../core/xenobiology_ui';
import { HABITAT_VERSION, type SpecimenContainer } from '../../entities/biology/biology_types';

/** Provides a generated habitat, issuer and real collection command for contract/UI checks. */
function fixture() {
  const generated = generateBiosphere(biologyFixture())!;
  const site = {
    id: `${generated.id}/site:4,4`,
    x: 4,
    y: 4,
    label: 'Water margin',
    habitat: {
      version: HABITAT_VERSION,
      kind: 'moist-margin' as const,
      description: 'Water-adjacent substrate.',
      relief: 0.04,
      waterDistanceCells: 1,
    },
  };
  const biosphere = { ...generated, sites: [site] };
  const field = createEncounter(biosphere, site);
  const source = field.individuals.find((actor) => actor.speciesId === generated.species[0].id)!;
  field.individuals = [source];
  field.roverX = source.x + 1;
  field.roverY = source.y;
  field.terrain[source.y] =
    field.terrain[source.y].substring(0, field.roverX) +
    '.' +
    field.terrain[source.y].substring(field.roverX + 1);
  const research = new XenobiologyService();
  research.snapshot.fields[site.id] = field;
  const station = { id: 'port:buds', name: 'Bud Survey Port', kind: 'starbase' as const };
  /** Regenerates offers against actual remaining sources and carrier ownership. */
  const offers = () =>
    createPropaguleContract(
      station,
      'Fixture',
      [biosphere],
      research.snapshot.fields,
      cargo.specimens!,
      research
    );
  const cargo = createDefaultCargo(2);
  const mission = offers()[0];
  const progress = new MissionProgressService();
  progress.accept(mission);
  const species = generated.species[0];
  /** Acquires the material through the production action rather than inserting invented cargo. */
  const harvest = () => {
    research.observe(species, 3);
    return new SurfaceEncounterSystem().act(field, { kind: 'harvest', targetId: source.id }, cargo, 1);
  };
  const context = { station, holds: [cargo], resources: { credits: 1000 } };
  return {
    biosphere,
    field,
    source,
    species,
    research,
    station,
    offers,
    cargo,
    mission,
    progress,
    harvest,
    context,
  };
}

describe('reproductive reference requests', () => {
  it('offers a finite, deterministic, obtainable request and excludes unsuited ports and exhausted sources', () => {
    const f = fixture();
    expect(f.offers()).toEqual([f.mission]);
    expect(f.mission.detail).toContain('leave the parent');
    expect(
      createPropaguleContract(
        { ...f.station, kind: 'automated-depot' },
        'Fixture',
        [f.biosphere],
        {},
        [],
        f.research
      )
    ).toEqual([]);
    f.source.sampled = true;
    expect(f.offers()).toEqual([]);
    f.source.sampled = false;
    f.harvest();
    expect(f.offers()).toEqual([f.mission]);
    f.research.submit(f.species, f.cargo.specimens![0], true);
    expect(f.offers()).toEqual([]);
  });

  it('requires the correct material, site and real parent history and settles only once', () => {
    const f = fixture();
    expect(f.progress.getStatus(f.mission, [])).toBe('ACTIVE');
    expect(Object.values(f.progress.getObjectiveShortfalls(f.mission, [])).join(' ')).toContain(
      'No viable propagule batch'
    );
    f.harvest();
    const container = f.cargo.specimens![0];
    expect(f.progress.getStatus(f.mission, [container])).toBe('READY');
    expect(f.progress.getObjectiveShortfalls(f.mission, [container])).toEqual({});
    for (const [altered, reason] of [
      [{ ...container, kind: 'live' as const }, 'Cargo contains LIVE'],
      [{ ...container, kind: 'tissue' as const }, 'Cargo contains TISSUE'],
      [{ ...container, siteId: 'other' }, 'another habitat'],
      [{ ...container, quality: 0.5 }, 'quality is too low'],
    ] as const) {
      f.cargo.specimens = [altered];
      const before = f.progress.createSnapshot();
      const result = deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(reason);
      expect(Object.values(f.progress.getObjectiveShortfalls(f.mission, [altered])).join(' ')).toContain(
        reason
      );
      expect(f.context.resources.credits).toBe(1000);
      expect(f.cargo.specimens).toEqual([altered]);
      expect(f.progress.createSnapshot()).toEqual(before);
    }
    f.cargo.specimens = [container];
    f.source.propagulesHarvested = false;
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).ok).toBe(false);
    f.source.propagulesHarvested = true;
    const researchValue = f.research.quote(f.species, container).credits;
    const delivered = deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id);
    expect(delivered.ok).toBe(true);
    expect(delivered.message).toContain('Viable propagule');
    expect(f.context.resources.credits).toBe(1000 + 750 + researchValue);
    expect(f.cargo.specimens).toEqual([]);
    expect(f.source.state).toBe('active');
    expect(f.research.snapshot.demand[f.species.id]).toMatchObject({ samples: 0, propaguleSamples: 1 });
    const before = f.research.createSnapshot();
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).ok).toBe(false);
    expect(f.research.createSnapshot()).toEqual(before);
  });

  it('refuses wrong issuer, duplicate ownership and weakened reproductive metadata without mutations', () => {
    const f = fixture();
    f.harvest();
    const container = f.cargo.specimens![0];
    expect(
      deliverBiologicalContract(
        f.progress,
        f.research,
        { ...f.context, station: { ...f.station, id: 'other' } },
        f.mission.id
      ).ok
    ).toBe(false);
    f.cargo.specimens = [container, { ...container, id: 'duplicate' }];
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).message).toContain(
      'ambiguous'
    );
    f.cargo.specimens = [
      {
        ...container,
        species: { ...container.species, reproduction: { kind: 'dormant-buds', baselineSamples: 0 } },
      },
    ];
    expect(deliverBiologicalContract(f.progress, f.research, f.context, f.mission.id).message).toContain(
      'provenance'
    );
    expect(f.context.resources.credits).toBe(1000);
    expect(f.progress.getStatus(f.mission)).not.toBe('COMPLETE');
    expect(f.research.snapshot.demand).toEqual({});
  });

  it('resolves availability only after analysis and distinguishes harvested parents from viable cargo', () => {
    const f = fixture();
    const request = [{ mission: f.mission, status: 'ACTIVE' as const }];
    const contact = { field: f.field, target: f.source, stasisClass: 1 };
    const preliminary = assessBiologicalRequests(f.species, 2, request, contact);
    expect(preliminary.confirmed).toBe(true);
    expect(preliminary.eligible).toBe(false);
    expect(
      preliminary.lines
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('Analyse');
    expect(assessBiologicalRequests(f.species, 3, request, contact).eligible).toBe(true);
    f.harvest();
    expect(assessBiologicalRequests(f.species, 3, request, contact).eligible).toBe(false);
    expect(
      assessBiologicalRequests(f.species, 3, [{ mission: f.mission, status: 'READY' }], contact)
        .lines.flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('return to issuer');
  });
});

describe('propagule terminal presentation', () => {
  it('keeps biology progressive and reproduces readable styled dossiers at narrow widths', () => {
    const f = fixture();
    const contact = { field: f.field, target: f.source, power: 1 as const, stasisClass: 1 };
    f.research.observe(f.species, 1);
    expect(
      createBiologicalDossier(f.species, f.research, 40, contact)
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).not.toContain('dormant buds');
    f.research.observe(f.species, 2);
    expect(targetQuotes(f.field, f.source, f.research)).not.toContain('propagule');
    f.research.observe(f.species, 3);
    expect(targetQuotes(f.field, f.source, f.research)).toContain('propagule');
    for (const width of [24, 40, 72]) {
      const lines = createBiologicalDossier(f.species, f.research, width, contact);
      expect(
        lines.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= width)
      ).toBe(true);
      const text = lines
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ');
      expect(text).toContain('REPRODUCTIVE');
      expect(text).toContain('one live stasis slot');
      expect(
        lines.flatMap((line) => line.segments).some((span) => span.font === 'thin' && span.tone === 'green')
      ).toBe(true);
    }
    f.harvest();
    expect(targetQuotes(f.field, f.source, f.research)).not.toContain('propagule');
  });

  it('lists viable batches in Cargo and Sell including zero-demand material without adult mass claims', () => {
    const f = fixture();
    f.harvest();
    const container: SpecimenContainer = f.cargo.specimens![0];
    const before = f.research.createSnapshot();
    expect(specimenRows([container], f.research)[0].detail).toContain('5 g material');
    expect(specimenRows([container], f.research)[0].detail).not.toContain('kg');
    expect(specimenSaleRows([container], f.research, true)[0].cells[3]).toBe('propagule specimen');
    expect(specimenSaleRows([container], f.research, false)[0].disabled).toBe(true);
    expect(f.research.createSnapshot()).toEqual(before);
    f.research.submit(f.species, container, true);
    const row = specimenSaleRows([container], f.research, true)[0];
    expect(row.cells[2]).toBe('0');
    expect(row.disabled).toBe(true);
  });
});
