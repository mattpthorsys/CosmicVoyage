import { describe, expect, it } from 'vitest';
import {
  createSurfaceMaterialMap,
  getSurfaceDisplayColour,
  getSurfaceMaterialColour,
} from '../../../entities/planet/surface_material';
import { SurfaceLiquidOverlay } from '../../../entities/planet/surface_liquid';

/** Creates terrain whose constant height cannot itself explain material variation. */
function plateau(size = 65): number[][] {
  return Array.from({ length: size }, () => Array<number>(size).fill(128));
}

describe('shared surface materials', () => {
  it('creates repeatable, seed-dependent provinces without modifying terrain', () => {
    const heights = plateau();
    const before = heights.map((row) => row.slice());
    const first = createSurfaceMaterialMap('Lunar', 'material-fixture', heights)!;
    const repeated = createSurfaceMaterialMap('Lunar', 'material-fixture', heights)!;
    const other = createSurfaceMaterialMap('Lunar', 'another-world', heights)!;

    expect(first).toEqual(repeated);
    expect(first.indices).not.toEqual(other.indices);
    expect(heights).toEqual(before);
    expect(new Set(first.indices).size).toBeGreaterThan(20);
    expect(first.indices.byteLength).toBe(65 * 65);
    expect(first.palette).toHaveLength(256);
    expect(structuredClone(first)).toEqual(first);
  });

  it('forms coherent regions and closes the longitude seam at every latitude', () => {
    const map = createSurfaceMaterialMap('Rock', 'continuous-provinces', plateau())!;
    let adjacent = 0;
    let distant = 0;
    for (let y = 0; y < map.height; y++) {
      expect(map.indices[y * map.width]).toBe(map.indices[(y + 1) * map.width - 1]);
      for (let x = 0; x < map.width - 1; x++) {
        const here = map.indices[y * map.width + x];
        adjacent += Math.abs(here - map.indices[y * map.width + x + 1]);
        distant += Math.abs(here - map.indices[y * map.width + ((x + 32) % (map.width - 1))]);
      }
    }
    expect(adjacent).toBeLessThan(distant * 0.5);
    expect(getSurfaceMaterialColour(map, -1, 32)).toBe(getSurfaceMaterialColour(map, map.width - 1, 32));
  });

  it('bounds material sampling while mapping back to native terrain coordinates', () => {
    const map = createSurfaceMaterialMap('Lunar', 'bounded-material-grid', plateau(513))!;

    expect(map.width).toBe(257);
    expect(map.height).toBe(257);
    expect(map.sourceWidth).toBe(513);
    expect(map.sourceHeight).toBe(513);
    expect(getSurfaceMaterialColour(map, 0, 128)).toBe(getSurfaceMaterialColour(map, 1, 128));
    expect(getSurfaceMaterialColour(map, 512, 128)).toBe(getSurfaceMaterialColour(map, -1, 128));
  });

  it('retains water and vegetation above geological colour and supports palette-only surfaces', () => {
    const materials = createSurfaceMaterialMap('Rock', 'covered-terrain', plateau(8))!;
    const palette = Array<string>(256).fill('#886644');
    const water: SurfaceLiquidOverlay = {
      kind: 'water',
      label: 'Water',
      seaLevel: 40,
      coverage: 0.4,
      colour: '#204060',
      reflectiveColour: '#80B8D0',
      coastalVegetation: { minHeight: 41, maxHeight: 70, shoreColour: '#285838', uplandColour: '#547048' },
    };
    expect(getSurfaceDisplayColour(20, palette, water, materials, 2, 2)).toBe(water.colour);
    expect(getSurfaceDisplayColour(48, palette, water, materials, 2, 2)).toBe('#285838');
    expect(getSurfaceDisplayColour(128, palette, water, materials, 2, 2)).not.toBe(
      getSurfaceMaterialColour(materials, 2, 2)
    );
    expect(getSurfaceDisplayColour(128, palette, null, null, 2, 2)).toBe('#886644');
  });

  it('retains crater and basin contrast beneath the material tint', () => {
    const materials = createSurfaceMaterialMap('Lunar', 'crater-colour', plateau())!;
    const palette = Array.from(
      { length: 256 },
      (_, level) => `#${level.toString(16).padStart(2, '0').repeat(3)}`
    );
    const craterFloor = getSurfaceDisplayColour(20, palette, null, materials, 24, 32);
    const highland = getSurfaceDisplayColour(220, palette, null, materials, 24, 32);
    expect(Number.parseInt(craterFloor.slice(1, 3), 16)).toBeLessThan(
      Number.parseInt(highland.slice(1, 3), 16)
    );
  });

  it('uses exposed rock for hot icy-type fixtures and preserves molten and giant palettes', () => {
    const heights = plateau(8);
    const cold = createSurfaceMaterialMap('Frozen', 'phase', heights, 100)!;
    const hot = createSurfaceMaterialMap('Frozen', 'phase', heights, 500)!;
    const rock = createSurfaceMaterialMap('Rock', 'phase', heights, 500)!;
    expect(hot).toEqual(rock);
    expect(cold.palette).not.toEqual(hot.palette);
    for (const type of ['Molten', 'GasGiant', 'IceGiant', 'Unknown']) {
      expect(createSurfaceMaterialMap(type, 'phase', heights)).toBeNull();
    }
  });
});
