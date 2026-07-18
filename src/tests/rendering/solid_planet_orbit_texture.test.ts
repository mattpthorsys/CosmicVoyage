import { describe, expect, it } from 'vitest';
import { Planet } from '../../entities/planet';
import { SurfaceLiquidOverlay } from '../../entities/planet/surface_liquid';
import { SolidPlanetOrbitTextureRenderer } from '../../rendering/scenes/solid_planet_orbit_texture';

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
    const coast = renderer.sample(planet, heightmap, palette, liquid, 0.5 - 0.5 / 128, 0.5, 52, 1);
    const land = renderer.sample(planet, heightmap, palette, liquid, 0.75, 0.5, 52, 1);

    expect(water.liquidCoverage).toBeGreaterThan(0.99);
    expect(coast.liquidCoverage).toBeGreaterThan(0.2);
    expect(coast.liquidCoverage).toBeLessThan(0.8);
    expect(land.liquidCoverage).toBeLessThan(0.01);
    expect(coast.reflectiveColour).toEqual({ r: 128, g: 184, b: 208 });
  });
});
