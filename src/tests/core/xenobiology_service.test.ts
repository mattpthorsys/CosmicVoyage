import { describe, expect, it } from 'vitest';
import { XenobiologyService } from '../../core/xenobiology_service';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import type { SpecimenContainer } from '../../entities/biology/biology_types';
import { biologyFixture } from '../fixtures/biology';

describe('scientific evidence and campaign demand', () => {
  it('separates unresolved, unknown, personal and well-sampled status', () => {
    const species = {
      ...generateBiosphere(biologyFixture())!.species[1],
      recognised: false,
      baselineSamples: 0,
    };
    const service = new XenobiologyService();
    service.observe(species, 1);
    expect(service.status(species)).toContain('UNRESOLVED');
    service.observe(species, 2);
    expect(service.status(species)).toBe('UNKNOWN TO SCIENCE');
    service.collected(species);
    expect(service.status(species)).toBe('PREVIOUSLY COLLECTED');
    expect(service.status({ ...species, baselineSamples: 6 })).toContain('WELL SAMPLED');
  });

  it('pays cumulative novelty only once and devalues repeat specimens across save/load', () => {
    const species = {
      ...generateBiosphere(biologyFixture())!.species[1],
      recognised: false,
      baselineSamples: 0,
    };
    const service = new XenobiologyService();
    service.observe(species, 2);
    const data = service.submit(species);
    expect(data).toBeGreaterThan(0);
    expect(service.status(species)).toBe('KNOWN / NOT COLLECTED');
    expect(species.recognised).toBe(false);
    expect(service.submit(species)).toBe(0);
    const container: SpecimenContainer = {
      id: 'c1',
      sourceId: 'a1',
      siteId: 's1',
      species,
      kind: 'live',
      quality: 1,
      volumeM3: 1,
    };
    const live = service.submit(species, container);
    expect(live).toBeGreaterThan(data);
    expect(service.submit(species, container)).toBe(0);
    const restored = new XenobiologyService();
    restored.restoreSnapshot(service.createSnapshot());
    expect(restored.submit(species, container)).toBe(0);
    const repeat = restored.submit(species, { ...container, id: 'c2', sourceId: 'a2' });
    expect(repeat).toBeLessThan(live / 10);
  });

  it('previewing and identical observations cannot mutate demand or create better evidence', () => {
    const species = generateBiosphere(biologyFixture())!.species[0];
    const service = new XenobiologyService();
    service.observe(species, 2);
    const before = service.createSnapshot();
    service.quote(species);
    service.observe(species, 2);
    expect(service.createSnapshot()).toEqual(before);
  });
});
