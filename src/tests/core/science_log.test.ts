import { describe, expect, it } from 'vitest';
import { ScienceLog } from '../../core/science_log';
import { XenobiologyService } from '../../core/xenobiology_service';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { biologyFixture } from '../fixtures/biology';
import type { BiologyOrigin, SpecimenContainer } from '../../entities/biology/biology_types';
import type { StarbaseMission } from '../../core/mission_board';

/** Supplies explicit navigable provenance without decoding generated identity strings. */
function origin(siteId = 'habitat'): BiologyOrigin {
  return {
    systemName: 'Fixture System',
    worldX: 12,
    worldY: -9,
    systemSlot: 1,
    bodyPath: 'planet:0/moon:0',
    bodyName: 'Fixture',
    surface: { x: 123, y: 456, siteId, label: 'Water margin' },
  };
}

describe('science log', () => {
  it('compares only acquired records and cycles counterparts without collecting or changing time', () => {
    const service = new XenobiologyService();
    const species = generateBiosphere(biologyFixture())!.species;
    species.slice(0, 3).forEach((entry) => service.observe(entry, 3));
    const before = service.createSnapshot();
    const log = new ScienceLog();
    const actions = new Set(['BIOLOGY_COLLECT']);
    const input = {
      wasActionJustPressed: (action: string) => actions.has(action),
      wasAnyKeyJustPressed: () => actions.size > 0,
    };
    log.input(input, log.entries(service, []), log.createModel(service, [], 1, 100, 35, false));
    expect(log.comparing).toBe(true);
    const first = log.createModel(service, [], 1, 100, 35, false);
    expect(
      first.dashboard!.some((line) => line.segments.some((span) => span.text === 'COMPARATIVE BIOLOGY'))
    ).toBe(true);
    const old = log.comparisonId;
    actions.clear();
    actions.add('CYCLE_TARGET');
    log.input(input, log.entries(service, []), first);
    expect(log.comparisonId).not.toBe(old);
    const narrow = log.createModel(service, [], 1, 32, 24, false);
    expect(
      narrow.dashboard!.every(
        (line) => line.segments.reduce((length, span) => length + span.text.length, 0) <= 20
      )
    ).toBe(true);
    expect(service.createSnapshot()).toEqual(before);
  });
  it('compares actual acquired contributions, updates when cargo is lost and preserves demand', () => {
    const service = new XenobiologyService();
    const species = generateBiosphere(biologyFixture())!.species[0];
    service.observe(species, 3, origin());
    const mission: StarbaseMission = {
      id: 'comparison',
      title: 'Size comparison',
      type: 'xenobiology',
      issuer: 'Office',
      summary: 'Small and large tissue',
      detail: 'Return both together.',
      rewardCredits: 1000,
      risk: 'Low',
      originStarbaseId: 'port',
      originStarbaseName: 'Port',
      systemName: 'Fixture',
      objectives: (['small', 'large'] as const).map((sizeClass) => ({
        id: sizeClass,
        kind: 'specimen' as const,
        targetName: species.name,
        targetLabel: `${sizeClass.toUpperCase()} TISSUE`,
        speciesId: species.id,
        siteId: 'habitat',
        requiredKind: 'tissue' as const,
        minimumQuality: 0.6,
        sizeClass,
      })),
    };
    const container: SpecimenContainer = {
      id: 'small/tissue',
      sourceId: 'small',
      siteId: 'habitat',
      species,
      kind: 'tissue',
      quality: 0.8,
      sizeScale: 0.45,
      volumeM3: 0.02,
    };
    const before = service.createSnapshot();
    const log = new ScienceLog();
    const model = log.createModel(service, [container], 1, 100, 35, false, [mission]);
    const text = model.dashboard!.map((line) => line.segments.map((span) => span.text).join('')).join('\n');
    expect(text).toContain('COMPARATIVE EVIDENCE');
    expect(text).toContain('COMPLETE / SMALL TISSUE');
    expect(text).toContain('NEEDED / LARGE TISSUE');
    expect(text).toContain(`${(species.massKg * 0.45).toFixed(2)} kg / quality 80%`);
    expect(
      model.dashboard!.some((line) =>
        line.segments.some((span) => span.tone === 'green' && span.text === 'COMPLETE / SMALL TISSUE')
      )
    ).toBe(true);
    const lost = log.createModel(service, [], 1, 32, 24, false, [mission], { comparison: [] });
    expect(
      lost.dashboard!.map((line) => line.segments.map((span) => span.text).join('')).join(' ')
    ).not.toContain('COMPLETE');
    expect(
      lost.dashboard!.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= 20)
    ).toBe(true);
    expect(service.createSnapshot()).toEqual(before);
  });

  it('does not treat analysis at one recorded habitat as evidence for an unvisited comparison site', () => {
    const service = new XenobiologyService();
    const species = generateBiosphere(biologyFixture())!.species[0];
    service.observe(species, 3, origin('first'));
    service.observe(species, 1, origin('second'));
    const mission: StarbaseMission = {
      id: 'comparison',
      title: 'Habitat comparison',
      type: 'xenobiology',
      issuer: 'Office',
      summary: 'Two habitats',
      detail: 'Return both analyses.',
      rewardCredits: 1100,
      risk: 'Low',
      originStarbaseId: 'port',
      originStarbaseName: 'Port',
      systemName: 'Fixture',
      objectives: ['first', 'second'].map((siteId) => ({
        id: siteId,
        kind: 'biology-data' as const,
        targetName: species.name,
        targetLabel: `${siteId} habitat`,
        speciesId: species.id,
        siteId,
        requiredEvidenceLevel: 3 as const,
      })),
    };
    const model = new ScienceLog().createModel(service, [], 1, 100, 35, false, [mission]);
    const text = model.dashboard!.map((line) => line.segments.map((span) => span.text).join('')).join('\n');
    expect(text).toContain('COMPLETE / first habitat');
    expect(text).toContain('NEEDED / second habitat');
  });

  it('keeps site evidence separate from stronger species knowledge acquired elsewhere', () => {
    const service = new XenobiologyService();
    const species = generateBiosphere(biologyFixture())!.species[0];
    service.observe(species, 3, origin('analysed-site'));
    service.observe(species, 1, origin('distant-site'));
    expect(service.evidence(species.id)?.level).toBe(3);
    expect(service.evidence(species.id)?.origins?.map((site) => site.level)).toEqual([3, 1]);
  });
  it('retains bounded independent provenance across repeated observation and save restoration', () => {
    const service = new XenobiologyService();
    const species = generateBiosphere(biologyFixture())!.species[0];
    const first = origin();
    service.observe(species, 2, first);
    service.observe(species, 3, first);
    first.surface.x = 0;
    for (let index = 0; index < 40; index++) service.observe(species, 3, origin(`habitat:${index}`));
    const saved = service.createSnapshot();
    expect(saved.evidence[species.id].origins).toHaveLength(32);
    expect(saved.evidence[species.id].origins![0].surface.x).toBe(123);
    expect(() => validateXenobiology(saved, [])).not.toThrow();
    const restored = new XenobiologyService();
    restored.restoreSnapshot(saved);
    expect(restored.createSnapshot()).toEqual(saved);
    saved.evidence[species.id].origins![0].bodyPath = 'not-a-path';
    expect(() => validateXenobiology(saved, [])).toThrow('body path');
  });
  it('shows acquired evidence and never mutates scientific demand while reading', () => {
    const service = new XenobiologyService();
    const species = generateBiosphere(biologyFixture())!.species[0];
    service.observe(species, 1, origin());
    const before = service.createSnapshot();
    const log = new ScienceLog();
    log.open('ship-menu');
    const model = log.createModel(service, [], 1, 30, 24, false);
    const text = model.dashboard!.flatMap((line) => line.segments.map((span) => span.text)).join(' ');
    expect(text).toContain('UNRESOLVED');
    expect(text).not.toContain(species.chemistry);
    expect(text).not.toContain(species.lineage);
    expect(text).not.toContain('Next live reference');
    expect(service.createSnapshot()).toEqual(before);
    expect((model.subtitle ?? '').length).toBeLessThanOrEqual(20);
  });
  it('filters records, cycles saved origins and consumes the key completing reveal', () => {
    const service = new XenobiologyService();
    const species = {
      ...generateBiosphere(biologyFixture())!.species[1],
      recognised: false,
      baselineSamples: 0,
    };
    service.observe(species, 3, origin());
    service.observe(species, 3, origin('second'));
    const log = new ScienceLog();
    log.open('none');
    const actions = new Set<string>();
    const input = {
      wasActionJustPressed: (action: string) => actions.has(action),
      wasAnyKeyJustPressed: () => actions.size > 0,
    };
    const model = log.createModel(service, [], 1, 100, 35, true);
    actions.add('ENTER_SYSTEM');
    expect(log.input(input, log.entries(service, []), model)).toBeUndefined();
    expect(log.input(input, log.entries(service, []), model)).toBe('landing');
    actions.clear();
    actions.add('BIOLOGY_SITE');
    log.input(input, log.entries(service, []), model);
    expect(log.origin(log.selected(log.entries(service, [])))?.surface.siteId).toBe('second');
    log.filter = 1;
    expect(log.entries(service, [])).toHaveLength(1);
    service.submit(species);
    expect(log.entries(service, [])).toHaveLength(0);
    log.filter = 2;
    expect(log.entries(service, [])).toHaveLength(0);
  });
});
