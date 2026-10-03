import { describe, expect, it } from 'vitest';
import { ScienceLog } from '../../core/science_log';
import { XenobiologyService } from '../../core/xenobiology_service';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { validateXenobiology } from '../../entities/biology/biology_validation';
import { biologyFixture } from '../fixtures/biology';
import type { BiologyOrigin } from '../../entities/biology/biology_types';

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
