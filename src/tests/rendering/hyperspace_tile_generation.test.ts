import { describe, expect, it } from 'vitest';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import { NebulaColourSampler } from '../../rendering/nebula_colour_sampler';
import { createHyperspaceTile } from '../../rendering/hyperspace_tile_generation';
import { CONFIG } from '../../config';
import { hexToRgb } from '../../rendering/colour';
import { LocalHyperspaceTileGenerationProvider } from '../../rendering/hyperspace_tile_generation_provider';

describe('complete hyperspace tile generation', () => {
  it.each([
    [
      'red dwarf',
      { exists: true, starType: 'M9V', objectKind: 'stellar' as const },
      null,
      CONFIG.MIN_STAR_DETECTION_RADIUS_CELLS,
    ],
    [
      'cool white dwarf',
      { exists: true, starType: 'DC', objectKind: 'stellar' as const },
      null,
      CONFIG.MIN_STAR_DETECTION_RADIUS_CELLS,
    ],
    [
      'brown dwarf',
      { exists: true, starType: 'T5', objectKind: 'brown-dwarf' as const },
      null,
      CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS,
    ],
    [
      'rogue planet',
      { exists: false, starType: null, objectKind: null },
      { exists: true, type: 'rogue-planet' as const, char: 'o', colour: '#395052' },
      CONFIG.ROGUE_PLANET_VISIBILITY_RADIUS_CELLS,
    ],
    [
      'deep-space signal',
      { exists: false, starType: null, objectKind: null },
      { exists: true, type: 'ancient-signal' as const, char: '?', colour: '#40CFC0' },
      CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS,
    ],
  ])(
    'fades %s smoothly into the local background across its visible area',
    (_label, system, phenomenon, radius) => {
      const bg = '#091519';
      const ranges = [radius + 1, radius, radius * 0.75, radius * 0.5, radius * 0.25, 0];
      const tiles = ranges.map((range) => createHyperspaceTile(bg, system, phenomenon, 12, -3, range));
      /** Measures the rendered foreground's contrast with the actual background. */
      const contrast = (colour: string | null): number => {
        const a = hexToRgb(colour);
        const b = hexToRgb(bg);
        return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
      };
      expect(tiles[0].starChar).toBeNull();
      expect(tiles[1].starChar).toBeTruthy();
      expect(tiles[1].starColor).toBe(bg);
      const justInside = createHyperspaceTile(bg, system, phenomenon, 12, -3, radius - 0.01);
      expect(contrast(justInside.starColor)).toBeLessThanOrEqual(1);
      expect(tiles.slice(1).map((tile) => contrast(tile.starColor))).toEqual(
        [...tiles.slice(1).map((tile) => contrast(tile.starColor))].sort((a, b) => a - b)
      );
      expect(contrast(tiles.at(-1)!.starColor)).toBeGreaterThan(contrast(tiles[2].starColor));
      expect(new Set(tiles.slice(1).map((tile) => tile.starColor)).size).toBeGreaterThanOrEqual(4);
      expect(tiles.slice(1).every((tile) => tile.rangeFaded)).toBe(true);
    }
  );

  it('keeps the doubled faint-contact radii and leaves other phenomena at their original distance limit', () => {
    expect(CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS).toBe(
      2 * Math.round(36 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS)
    );
    expect(CONFIG.ROGUE_PLANET_VISIBILITY_RADIUS_CELLS).toBe(
      4 * CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS
    );
    const other = createHyperspaceTile(
      '#000000',
      { exists: false, starType: null, objectKind: null },
      { exists: true, type: 'ancient-signal', char: '?', colour: '#40CFC0' },
      0,
      0,
      CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS + 1
    );
    expect(other.starChar).toBeNull();
  });
  it('matches synchronous domain and nebula composition for the same seed', async () => {
    const seed = 'complete-tile-worker-parity';
    const requests = [
      { worldX: -12, worldY: 8, rangeCells: 4 },
      { worldX: 27, worldY: -19, rangeCells: 13 },
      { worldX: 64, worldY: 41, rangeCells: 31 },
    ];
    const provider = new LocalHyperspaceTileGenerationProvider(seed);
    const generator = new SystemDataGenerator(new PRNG(seed));
    const nebula = new NebulaColourSampler(`${seed}_nebula`);

    const samples = await provider.getTilesAsync(requests);
    const expected = requests.map(({ worldX, worldY, rangeCells }) => {
      const system = generator.getSystemMapProperties(worldX, worldY);
      const phenomenon = system.exists ? null : generator.getDeepSpacePhenomenonProperties(worldX, worldY);
      return {
        worldX,
        worldY,
        rangeCells,
        tile: createHyperspaceTile(
          nebula.sample(worldX, worldY),
          system,
          phenomenon,
          worldX,
          worldY,
          rangeCells
        ),
      };
    });

    expect(samples).toEqual(expected);
  });
});
