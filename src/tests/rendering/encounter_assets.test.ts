import { describe, expect, it } from 'vitest';
import { createOrganismSprite, ROVER_SPRITE } from '../../rendering/encounter_sprites';
import { prepareEncounterSurface } from '../../core/encounter_surface';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import type { Planet } from '../../entities/planet';

describe('field visual assets', () => {
  it('uses observed external anatomy and distinguishes newly added silhouette families', () => {
    const species = generateBiosphere(biologyFixture())!.species[0];
    const forms = [
      'mat',
      'frond',
      'colony',
      'fan',
      'rosette',
      'walker',
      'tripod',
      'radial',
      'burrower',
      'ambush',
    ] as const;
    const shapes = forms.map((bodyForm) => createOrganismSprite({ ...species, bodyForm }).frames[0].join(''));
    expect(new Set(shapes).size).toBe(forms.length);
  });
  it('bakes reproducible four-colour pixel silhouettes with consistent six-by-four frames', () => {
    const species = generateBiosphere(biologyFixture())!.species;
    for (const sprite of [...species.map(createOrganismSprite), ROVER_SPRITE]) {
      expect(sprite.palette.length).toBeLessThanOrEqual(4);
      for (const frame of sprite.frames) {
        expect(frame).toHaveLength(4);
        expect(frame.every((row) => row.length === 6)).toBe(true);
        expect(
          frame.every((row) =>
            [...row].every((pixel) => pixel === '.' || Number(pixel) <= sprite.palette.length)
          )
        ).toBe(true);
      }
    }
    expect(species.map(createOrganismSprite)).toEqual(species.map(createOrganismSprite));
  });
  it('uses native surface colours, caches texture and leaves generation/collision data unchanged', () => {
    const field = createEncounter(generateBiosphere(biologyFixture())!, {
      id: 'site',
      label: 'Site',
      x: 1,
      y: 1,
    });
    const before = structuredClone(field);
    const planet = {
      heightmap: [
        [1, 1],
        [1, 1],
      ],
      heightLevelColors: ['#263a23', '#65a247'],
      surfaceElementMap: [
        ['', ''],
        ['', ''],
      ],
    } as unknown as Planet;
    const appearance = prepareEncounterSurface(field, planet);
    expect(appearance.groundColour).toBe('#65a247');
    expect(appearance.colours[21][16].toLowerCase()).toBe(appearance.groundColour);
    expect(new Set(appearance.colours.flat()).size).toBeGreaterThan(20);
    expect(field).toEqual(before);
    expect(prepareEncounterSurface(field)).toBe(prepareEncounterSurface(field));
  });
});
