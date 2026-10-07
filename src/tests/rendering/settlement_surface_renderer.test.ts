import { describe, expect, it } from 'vitest';
import type { ScreenBuffer } from '../../rendering/screen_buffer';
import {
  SettlementSurfaceRenderer,
  projectSettlementLandingSite,
} from '../../rendering/scenes/settlement_surface_renderer';
import type { SettlementArchetype } from '../../entities/planet/surface_settlements';
import { settlementLayerFixture, settlementTerrainFixture } from '../fixtures/settlements';

/** Prepares one real regional cell with controlled fractional coverage and natural terrain. */
function fixture(archetype: SettlementArchetype = 'urban', coverage = 0.8, x = 32, y = 32) {
  const renderer = new SettlementSurfaceRenderer();
  const layer = settlementLayerFixture(
    [{ x, y, coverage, emission: coverage * 0.5, siteIndex: 0 }],
    65,
    archetype
  );
  const map = settlementTerrainFixture('dry').heightmap;
  const colours = Array<string>(256).fill('#4D7660');
  const visuals = renderer.prepare(layer, map, colours, null)!;
  return { renderer, layer, map, colours, visuals };
}

/** Captures only the actual half-cell artwork, keeping world placement and clipping observable. */
function display() {
  const pixels: Array<{ x: number; y: number; colour: string }> = [];
  const buffer = {
    /** Records a drawn raster block at the production half-cell scale. */
    drawScaledChar(_char: string, x: number, y: number, colour: string, _bg: string, sx: number, sy: number) {
      expect(sx).toBe(0.5);
      expect(sy).toBe(0.5);
      pixels.push({ x, y, colour });
    },
  } as unknown as ScreenBuffer;
  return { buffer, pixels };
}

describe('settlement map and regional artwork', () => {
  it('uses distinct four-colour archetypes without changing prepared terrain or colony data', () => {
    const artwork: ReturnType<typeof display>['pixels'][] = [];
    for (const archetype of ['urban', 'sealed', 'industrial'] as const) {
      const { renderer, visuals, layer, map, colours } = fixture(archetype);
      const before = structuredClone({ map, layer });
      const first = display();
      const second = display();
      const viewport = { x: 1, y: 2, width: 3, height: 3 };
      renderer.drawSurface(first.buffer, visuals, viewport, 32, 32, 3);
      renderer.drawSurface(second.buffer, visuals, viewport, 32, 32, 3);
      expect(first.pixels).toEqual(second.pixels);
      expect(first.pixels.length).toBeGreaterThan(6);
      expect(first.pixels.length).toBeLessThan(36);
      expect(new Set(first.pixels.map((pixel) => pixel.colour)).size).toBeLessThanOrEqual(4);
      expect(renderer.prepare(layer, map, colours, null)).toBe(visuals);
      expect({ map, layer }).toEqual(before);
      artwork.push(first.pixels);
    }
    expect(artwork[0]).not.toEqual(artwork[1]);
    expect(artwork[1]).not.toEqual(artwork[2]);
  });

  it.each([1, 2, 3])('keeps tiny core sites visible inside one native cell at scale %s', (scale) => {
    const { renderer, visuals } = fixture('sealed', 0.00001);
    const { buffer, pixels } = display();
    const viewport = { x: 4, y: 2, width: scale, height: scale };
    renderer.drawSurface(buffer, visuals, viewport, 32, 32, scale);
    expect(pixels.length).toBeGreaterThan(0);
    for (const pixel of pixels) {
      expect(pixel.x).toBeGreaterThanOrEqual(viewport.x);
      expect(pixel.y).toBeGreaterThanOrEqual(viewport.y);
      expect(pixel.x + 0.5).toBeLessThanOrEqual(viewport.x + scale);
      expect(pixel.y + 0.5).toBeLessThanOrEqual(viewport.y + scale);
    }
  });

  it('moves artwork with regional coordinates and clips partially visible native cells', () => {
    const { renderer, visuals } = fixture();
    const first = display();
    const moved = display();
    const viewport = { x: 2, y: 2, width: 8, height: 6 };
    renderer.drawSurface(first.buffer, visuals, viewport, 31, 32, 3);
    renderer.drawSurface(moved.buffer, visuals, viewport, 32, 32, 3);
    expect(first.pixels.map((pixel) => ({ ...pixel, x: pixel.x - 3 }))).toEqual(moved.pixels);
    const edge = display();
    const clipped = { ...viewport, width: 4, height: 2 };
    renderer.drawSurface(edge.buffer, visuals, clipped, 31, 32, 3);
    expect(edge.pixels.length).toBeGreaterThan(0);
    expect(
      edge.pixels.every(
        (pixel) => pixel.x + 0.5 <= clipped.x + clipped.width && pixel.y + 0.5 <= clipped.y + clipped.height
      )
    ).toBe(true);
  });

  it('aliases the duplicated longitude column while latitude never wraps', () => {
    const { renderer, visuals } = fixture('industrial', 1, 0, 0);
    const origin = display();
    const duplicate = display();
    const outsideLatitude = display();
    const viewport = { x: 2, y: 2, width: 3, height: 3 };
    renderer.drawSurface(origin.buffer, visuals, viewport, 0, 0, 3);
    renderer.drawSurface(duplicate.buffer, visuals, viewport, 64, 0, 3);
    renderer.drawSurface(outsideLatitude.buffer, visuals, viewport, 0, -1, 3);
    expect(origin.pixels.length).toBeGreaterThan(0);
    expect(duplicate.pixels).toEqual(origin.pixels);
    expect(outsideLatitude.pixels).toEqual([]);
  });

  it('rejects mismatched and newly flooded decoration rather than painting cities over water', () => {
    const { renderer, layer, map, colours } = fixture();
    expect(renderer.prepare({ ...layer, sourceWidth: 129 }, map, colours, null)).toBeNull();
    const flooded = { ...settlementTerrainFixture('flooded').liquid!, seaLevel: 140 };
    expect(renderer.prepare(layer, map, colours, flooded)).toBeNull();
    expect(renderer.prepare(null, map, colours, null)).toBeNull();
    const restored = renderer.prepare(layer, map, colours, null);
    expect(restored?.cells.size).toBe(1);
  });

  it('projects fractional site centres into the exact selectable native landing cell', () => {
    for (const [x, y] of [
      [15.99, 16.99],
      [0.5, 0.5],
      [63.75, 63.75],
    ]) {
      const position = projectSettlementLandingSite({ x, y }, 65, 65, 88, 72);
      expect(position.x).toBe(Math.floor((Math.floor(x) / 65) * 88));
      expect(position.y).toBe(Math.round((Math.floor(y) / 64) * 71));
    }
    expect(projectSettlementLandingSite({ x: 64.5, y: 32.5 }, 65, 65, 88, 72)).toEqual(
      projectSettlementLandingSite({ x: 0.5, y: 32.5 }, 65, 65, 88, 72)
    );
  });

  it('wraps a compact map annotation at the seam but clips it at a pole', () => {
    const { renderer, visuals } = fixture('sealed', 1, 0, 0);
    const raster = Array<string>(16 * 8).fill('#4D7660');
    renderer.paintLandingMap(visuals, raster, 16, 8);
    const changed = raster.flatMap((colour, index) => (colour === '#4D7660' ? [] : [index]));
    expect(changed.length).toBe(6);
    expect(changed.some((index) => index % 16 === 15)).toBe(true);
    expect(changed.some((index) => index % 16 === 0)).toBe(true);
    expect(changed.every((index) => index < 32)).toBe(true);
    const onePixel = ['#4D7660'];
    renderer.paintLandingMap(visuals, onePixel, 1, 1);
    expect(onePixel[0]).not.toBe('#4D7660');
  });

  it('invalidates artwork for changed settlement versions, terrain identity and material identity', () => {
    const { renderer, layer, map, colours, visuals } = fixture();
    Object.assign(layer, { version: layer.version + 1 });
    const revised = renderer.prepare(layer, map, colours, null);
    expect(revised).not.toBe(visuals);
    expect(renderer.prepare(layer, map, colours, null)).toBe(revised);
    const replacement = map.map((row) => [...row]);
    const regenerated = renderer.prepare(layer, replacement, colours, null);
    expect(regenerated).not.toBe(revised);
    const materials = {
      width: 65,
      height: 65,
      sourceWidth: 65,
      sourceHeight: 65,
      indices: new Uint8Array(65 * 65),
      palette: ['#877365'],
      strength: 1,
    };
    const changedMaterial = renderer.prepare(layer, replacement, colours, null, materials);
    expect(changedMaterial?.cells.get(32 * 64 + 32)?.palette).not.toEqual(
      regenerated?.cells.get(32 * 64 + 32)?.palette
    );
  });
});
