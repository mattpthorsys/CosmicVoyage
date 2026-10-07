import { describe, expect, it, vi } from 'vitest';
import { Planet } from '../../entities/planet';
import { SETTLEMENT_APPEARANCES } from '../../entities/planet/surface_settlements';
import type { SurfaceSettlementLayer } from '../../entities/planet/surface_settlements';
import { SolidPlanetOrbitTextureRenderer } from '../../rendering/scenes/solid_planet_orbit_texture';
import { hexToRgb } from '../../rendering/colour';
import { ORBIT_SETTLEMENT_RADIANCE } from '../../rendering/scenes/orbit_settlement_light';
import { settlementLayerFixture, settlementTerrainFixture } from '../fixtures/settlements';

/** Samples a prepared city layer at one body-fixed coordinate. */
function fixture(layer: SurfaceSettlementLayer | null, size = 65) {
  const renderer = new SolidPlanetOrbitTextureRenderer();
  const planet = Object.create(Planet.prototype) as Planet;
  const heights = settlementTerrainFixture('dry', size).heightmap;
  const palette = Array<string>(256).fill('#806040');
  /** Keeps sampling inputs stable while exercising rotation, footprint and replacement. */
  const sample = (u = 0.5, v = 0.5, diameter = 52, cities = layer) =>
    renderer.sample(planet, heights, palette, null, u, v, diameter, 1, null, cities);
  return { renderer, planet, heights, palette, sample };
}

/** Reads channel integrals to test brightness conservation independently of any display sampling grid. */
function levelMeans(renderer: SolidPlanetOrbitTextureRenderer, planet: Planet) {
  const cache = renderer as unknown as {
    textureCache: WeakMap<
      Planet,
      {
        levels: Array<{
          width: number;
          height: number;
          settlements: {
            coverage: Float32Array;
            emission: Float32Array;
          } | null;
        }>;
      }
    >;
  };
  return cache.textureCache.get(planet)!.levels.map((level) => {
    const channels = level.settlements!;
    let red = 0;
    for (let index = 0; index < channels.emission.length; index += 3) red += channels.emission[index];
    return {
      coverage: channels.coverage.reduce((sum, value) => sum + value, 0) / (level.width * level.height),
      red: red / (level.width * level.height),
    };
  });
}

describe('orbital settlement textures', () => {
  it('preserves sub-cell coverage and integrated linear emission through every mip level', () => {
    const coverage = 0.0002;
    const layer = settlementLayerFixture([
      { x: 20, y: 24, coverage, emission: coverage * 0.5, siteIndex: 0 },
    ]);
    const { renderer, planet, sample } = fixture(layer);
    sample();
    const expectedCoverage = coverage / (65 * 65);
    const light = hexToRgb(SETTLEMENT_APPEARANCES.urban.lightColour);
    const expectedRed = (light.r / 255) ** 2.2 * ORBIT_SETTLEMENT_RADIANCE * 0.5 * expectedCoverage;
    const means = levelMeans(renderer, planet);
    expect(means.length).toBeGreaterThan(4);
    for (const mean of means) {
      expect(mean.coverage).toBeCloseTo(expectedCoverage, 12);
      expect(mean.red).toBeCloseTo(expectedRed, 12);
      expect(mean.red).toBeGreaterThan(0);
    }
  });

  it('keeps city albedo subdued and the landing-map terrain unchanged without cache churn', () => {
    const size = 17;
    const cells = Array.from({ length: size * (size - 1) }, (_, index) => ({
      x: index % (size - 1),
      y: Math.floor(index / (size - 1)),
      coverage: 1,
      emission: 0.5,
      siteIndex: 0,
    }));
    const layer = settlementLayerFixture(cells, size);
    const { renderer, planet, heights, palette, sample } = fixture(layer, size);
    const builder = vi.spyOn(
      renderer as unknown as { buildBaseLevel: (...args: unknown[]) => unknown },
      'buildBaseLevel'
    );
    const orbit = sample();
    const natural = hexToRgb(palette[108]);
    expect(orbit.colour).not.toEqual(natural);
    expect(Math.abs(orbit.colour.r - natural.r)).toBeLessThan(20);
    expect(orbit.settlementCoverage).toBe(1);
    expect(orbit.emission?.r).toBeGreaterThan(orbit.emission!.b);
    const map = renderer.sampleMap(planet, heights, palette, null, 0.5, 0.5, 44, 36, null, layer);
    expect(map.colour).toEqual(natural);
    expect(map.emission).toBeNull();
    expect(sample()).toEqual(orbit);
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it('does not blink tiny lights off between adjacent rotation samples or coarse texture levels', () => {
    const layer = settlementLayerFixture([
      { x: 32, y: 32, coverage: 0.0002, emission: 0.0001, siteIndex: 0 },
    ]);
    const { sample } = fixture(layer);
    for (const diameter of [52, 26, 12]) {
      const values = [0.499, 0.5, 0.501].map((u) => sample(u, 0.5, diameter).emission!.r);
      expect(Math.min(...values)).toBeGreaterThan(0);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThan(Math.max(...values) * 0.3);
    }
  });

  it('wraps seam lights and preserves fractional emission rather than applying coverage twice', () => {
    const cells = Array.from({ length: 5 }, (_, index) => ({
      x: 0,
      y: 30 + index,
      coverage: 0.5,
      emission: 0.25,
      siteIndex: 0,
    }));
    const layer = settlementLayerFixture(cells);
    const { sample } = fixture(layer);
    const first = sample(0);
    expect(first.emission!.r).toBeGreaterThan(0);
    expect(sample(1)).toEqual(first);
    const dimmed = { ...layer, cells: cells.map((cell) => ({ ...cell, emission: cell.emission / 2 })) };
    expect(sample(0, 0.5, 52, dimmed).emission!.r).toBeCloseTo(first.emission!.r / 2, 9);
  });

  it('drops incompatible layers and submerged cells rather than painting free-floating ocean lights', () => {
    const layer = settlementLayerFixture([{ x: 32, y: 32, coverage: 1, emission: 1, siteIndex: 0 }]);
    const { renderer, planet, heights, palette, sample } = fixture(layer);
    expect(sample().emission!.r).toBeGreaterThan(0);
    expect(sample(0.5, 0.5, 52, { ...layer, sourceWidth: 129 }).emission).toBeNull();
    const liquid = { ...settlementTerrainFixture('flooded').liquid!, seaLevel: 140 };
    const water = renderer.sample(planet, heights, palette, liquid, 0.5, 0.5, 52, 1, null, layer);
    expect(water.emission?.r ?? 0).toBe(0);
    expect(water.settlementCoverage).toBe(0);
    expect(water.liquidCoverage).toBe(1);
    expect(water.colour).toEqual(hexToRgb(liquid.colour));
  });

  it('rebuilds changed settlement inputs and leaves city-free terrain on its existing path', () => {
    const layer = settlementLayerFixture([{ x: 32, y: 32, coverage: 1, emission: 0.5, siteIndex: 0 }]);
    const { sample } = fixture(layer);
    const first = sample();
    const revised = { ...layer, cells: layer.cells.map((cell) => ({ ...cell, emission: 0.1 })) };
    expect(sample(0.5, 0.5, 52, revised).emission!.r).toBeLessThan(first.emission!.r);
    const empty = sample(0.5, 0.5, 52, { ...layer, cells: [] });
    const none = sample(0.5, 0.5, 52, null);
    expect(empty).toEqual(none);
    expect(none.emission).toBeNull();
    expect(none.settlementCoverage).toBe(0);
  });
});
