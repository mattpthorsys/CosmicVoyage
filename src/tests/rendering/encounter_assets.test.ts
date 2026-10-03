import { describe, expect, it } from 'vitest';
import { createOrganismSprite, ROVER_SPRITE } from '../../rendering/encounter_sprites';
import { prepareEncounterSurface } from '../../core/encounter_surface';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import type { Planet } from '../../entities/planet';
import { generateNativeSpecies } from '../../entities/biology/native_biosphere';
import { PRNG } from '../../utils/prng';
import { createBiologicalDossier } from '../../core/xenobiology_ui';
import { XenobiologyService } from '../../core/xenobiology_service';

describe('field visual assets', () => {
  it('renders inherited native pigments and limbs consistently without changing the stable raster footprint', () => {
    const environment = biologyFixture({ origin: 'native' });
    const species = generateNativeSpecies(environment, new PRNG('anatomy'));
    const before = structuredClone(species);
    for (let index = 0; index < species.length; index += 2) {
      const first = createOrganismSprite(species[index]);
      const relative = createOrganismSprite(species[index + 1]);
      expect(first.palette).toEqual(relative.palette);
      expect(first.frames[0]).toEqual(relative.frames[0]);
      expect(first.palette).toHaveLength(4);
      for (const frame of [...first.frames, ...(first.displayFrame ? [first.displayFrame] : [])]) {
        expect(frame).toHaveLength(4);
        expect(frame.every((row) => row.length === 6 && /^[.1234]+$/.test(row))).toBe(true);
      }
    }
    const mobile = species.find((entry) => entry.anatomy!.appendages > 0)!;
    const four = {
      ...mobile,
      bodyForm: 'walker' as const,
      anatomy: { ...mobile.anatomy!, appendages: 4, profile: 'low' as const },
    };
    const six = { ...four, anatomy: { ...four.anatomy, appendages: 6 } };
    expect(createOrganismSprite(four).frames[0]).not.toEqual(createOrganismSprite(six).frames[0]);
    for (const mobile of species.filter((entry) => entry.behaviour !== 'sessile')) {
      const sprite = createOrganismSprite(mobile);
      expect(sprite.frames[0]).not.toEqual(sprite.frames[1]);
    }
    expect(species).toEqual(before);
  });
  it('keeps detailed external traits out of preliminary dossiers while making them readable after observation', () => {
    const species = generateNativeSpecies(biologyFixture({ origin: 'native' }), new PRNG('visible'))[0];
    const service = new XenobiologyService();
    service.observe(species, 1);
    const preliminary = createBiologicalDossier(species, service, 24)
      .flatMap((line) => line.segments)
      .map((span) => span.text)
      .join(' ');
    expect(preliminary).not.toContain('Surface pigment');
    expect(preliminary).not.toContain(species.lineage);
    service.observe(species, 2);
    const observed = createBiologicalDossier(species, service, 24)
      .flatMap((line) => line.segments)
      .map((span) => span.text)
      .join(' ');
    expect(observed).toContain('Surface pigment');
    expect(observed).toContain(species.anatomy!.pigment);
    expect(observed).not.toContain(species.lineage);
  });
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
