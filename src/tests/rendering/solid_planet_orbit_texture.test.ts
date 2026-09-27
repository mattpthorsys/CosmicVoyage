import { describe, expect, it } from 'vitest';
import { Planet } from '../../entities/planet';
import { SurfaceLiquidOverlay } from '../../entities/planet/surface_liquid';
import { SolidPlanetOrbitTextureRenderer } from '../../rendering/scenes/solid_planet_orbit_texture';
import { getSurfaceDisplayColour, SurfaceMaterialMap } from '../../entities/planet/surface_material';
import { hexToRgb } from '../../rendering/colour';

/** Creates an identity-only planet suitable for the renderer's weak cache. */
function createTexturePlanet(): Planet {
  return Object.create(Planet.prototype) as Planet;
}

/** Creates a full 256-entry palette from a colour callback. */
function createPalette(colourAt: (height: number) => string): string[] {
  return Array.from({ length: 256 }, (_, height) => colourAt(height));
}

/** Returns the largest spread among one RGB channel from several texture samples. */
function channelSpread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe('SolidPlanetOrbitTextureRenderer', () => {
  it('uses the same material geography in orbital, landing, and native surface samples', () => {
    const renderer = new SolidPlanetOrbitTextureRenderer();
    const planet = createTexturePlanet();
    const heights = Array.from({ length: 32 }, () => Array<number>(32).fill(128));
    const palette = createPalette(() => '#FF00FF');
    const materials: SurfaceMaterialMap = {
      width: 32,
      height: 32,
      sourceWidth: 32,
      sourceHeight: 32,
      palette: ['#605040', '#C0B0A0'],
      indices: Uint8Array.from({ length: 32 * 32 }, (_, index) => (index % 32 < 16 ? 0 : 1)),
      strength: 1,
    };
    for (const [u, x] of [
      [0.25, 8],
      [0.75, 24],
    ]) {
      const native = hexToRgb(getSurfaceDisplayColour(128, palette, null, materials, x, 16));
      expect(renderer.sample(planet, heights, palette, null, u, 0.5, 52, 1, materials).colour).toEqual(
        native
      );
      expect(renderer.sampleMap(planet, heights, palette, null, u, 0.5, 32, 32, materials).colour).toEqual(
        native
      );
    }
    const replaced = { ...materials, palette: ['#102030', '#405060'] };
    expect(renderer.sample(planet, heights, palette, null, 0.25, 0.5, 52, 1, replaced).colour).toEqual(
      hexToRgb('#102030')
    );
  });

  it('prefilters material boundaries through rotation and preserves overlying water and vegetation', () => {
    const renderer = new SolidPlanetOrbitTextureRenderer();
    const planet = createTexturePlanet();
    const palette = createPalette(() => '#806040');
    const materials: SurfaceMaterialMap = {
      width: 256,
      height: 256,
      sourceWidth: 256,
      sourceHeight: 256,
      palette: ['#000000', '#FFFFFF'],
      indices: Uint8Array.from({ length: 256 * 256 }, (_, index) => (index + Math.floor(index / 256)) % 2),
      strength: 1,
    };
    const heights = Array.from({ length: 256 }, () => Array<number>(256).fill(128));
    const samples = [0.101, 0.102, 0.103, 0.104].map((u) =>
      renderer.sample(planet, heights, palette, null, u, 0.5, 52, 1, materials)
    );
    expect(channelSpread(samples.map((sample) => sample.colour.r))).toBeLessThanOrEqual(1);
    expect(samples[0].colour.r).toBeGreaterThan(120);
    expect(samples[0].colour.r).toBeLessThan(136);
    const liquid: SurfaceLiquidOverlay = {
      kind: 'water',
      label: 'Water',
      seaLevel: 140,
      coverage: 1,
      colour: '#204060',
      reflectiveColour: '#80B8D0',
      coastalVegetation: null,
    };
    const water = renderer.sample(planet, heights, palette, liquid, 0.25, 0.5, 52, 1, materials);
    expect(water.colour).toEqual(hexToRgb(liquid.colour));
    expect(water.liquidCoverage).toBe(1);
    const vegetated = {
      ...liquid,
      seaLevel: 100,
      coastalVegetation: {
        minHeight: 110,
        maxHeight: 150,
        shoreColour: '#285838',
        uplandColour: '#547048',
      },
    };
    const shore = renderer.sample(planet, heights, palette, vegetated, 0.25, 0.5, 52, 1, materials);
    expect(shore.colour).toEqual(hexToRgb('#285838'));
    expect(shore.liquidCoverage).toBe(0);
  });

  it('prefilters sub-pixel terrain so small rotation changes do not shimmer', () => {
    const renderer = new SolidPlanetOrbitTextureRenderer();
    const planet = createTexturePlanet();
    const heightmap = Array.from({ length: 256 }, (_, y) =>
      Array.from({ length: 256 }, (_, x) => ((x + y) % 2 === 0 ? 0 : 255))
    );
    const palette = createPalette((height) => {
      const channel = height.toString(16).padStart(2, '0');
      return `#${channel}${channel}${channel}`;
    });
    const samples = [0.101, 0.102, 0.103, 0.104].map((u) =>
      renderer.sample(planet, heightmap, palette, null, u, 0.5, 52, 1)
    );

    expect(channelSpread(samples.map((sample) => sample.colour.r))).toBeLessThanOrEqual(1);
    expect(channelSpread(samples.map((sample) => sample.colour.g))).toBeLessThanOrEqual(1);
    expect(samples[0].colour.r).toBeGreaterThan(120);
    expect(samples[0].colour.r).toBeLessThan(136);
  });

  it('keeps high-frequency terraforming green body-fixed and temporally stable', () => {
    const renderer = new SolidPlanetOrbitTextureRenderer();
    const planet = createTexturePlanet();
    const heightmap = Array.from({ length: 256 }, (_, y) =>
      Array.from({ length: 256 }, (_, x) => ((x + y) % 2 === 0 ? 8 : 80))
    );
    const palette = createPalette(() => '#806040');
    const liquid: SurfaceLiquidOverlay = {
      kind: 'water',
      label: 'Water',
      seaLevel: 0,
      coverage: 0.4,
      colour: '#204060',
      reflectiveColour: '#80B8D0',
      coastalVegetation: {
        minHeight: 1,
        maxHeight: 16,
        shoreColour: '#285838',
        uplandColour: '#547048',
      },
    };
    const samples = [0.271, 0.272, 0.273, 0.274].map((u) =>
      renderer.sample(planet, heightmap, palette, liquid, u, 0.5, 52, 1)
    );

    expect(channelSpread(samples.map((sample) => sample.colour.g))).toBeLessThanOrEqual(1);
    expect(samples.every((sample) => sample.liquidCoverage === 0)).toBe(true);
    expect(samples[0].colour.g).toBeGreaterThan(samples[0].colour.r);
  });

  it('retains a two-cell terrain feature at the largest orbital globe size', () => {
    const renderer = new SolidPlanetOrbitTextureRenderer();
    const planet = createTexturePlanet();
    const heightmap = Array.from({ length: 256 }, () =>
      Array.from({ length: 256 }, (_, x) => (x >= 66 && x < 68 ? 0 : 255))
    );
    const palette = createPalette((height) => {
      const channel = height.toString(16).padStart(2, '0');
      return `#${channel}${channel}${channel}`;
    });

    const feature = renderer.sample(planet, heightmap, palette, null, 66 / 256, 0.5, 52, 1);
    const terrain = renderer.sample(planet, heightmap, palette, null, 62 / 256, 0.5, 52, 1);

    expect(feature.colour.r).toBeLessThan(70);
    expect(terrain.colour.r).toBeGreaterThan(220);
  });

  it('returns fractional liquid coverage at filtered coastlines', () => {
    const renderer = new SolidPlanetOrbitTextureRenderer();
    const planet = createTexturePlanet();
    const heightmap = Array.from({ length: 256 }, () =>
      Array.from({ length: 256 }, (_, x) => (x < 128 ? 20 : 180))
    );
    const palette = createPalette(() => '#806040');
    const liquid: SurfaceLiquidOverlay = {
      kind: 'water',
      label: 'Water',
      seaLevel: 80,
      coverage: 0.5,
      colour: '#204060',
      reflectiveColour: '#80B8D0',
      coastalVegetation: null,
    };

    const water = renderer.sample(planet, heightmap, palette, liquid, 0.25, 0.5, 52, 1);
    const coast = renderer.sample(planet, heightmap, palette, liquid, 0.5 - 0.5 / 256, 0.5, 52, 1);
    const land = renderer.sample(planet, heightmap, palette, liquid, 0.75, 0.5, 52, 1);

    expect(water.liquidCoverage).toBeGreaterThan(0.99);
    expect(coast.liquidCoverage).toBeGreaterThan(0.2);
    expect(coast.liquidCoverage).toBeLessThan(0.8);
    expect(land.liquidCoverage).toBeLessThan(0.01);
    expect(coast.reflectiveColour).toEqual({ r: 128, g: 184, b: 208 });
  });
});
