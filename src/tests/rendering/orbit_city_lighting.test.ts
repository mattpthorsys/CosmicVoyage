import { describe, expect, it } from 'vitest';
import { Planet } from '../../entities/planet';
import type { SurfaceSettlementLayer } from '../../entities/planet/surface_settlements';
import type { OrbitScreenModel } from '../../core/orbit_ui';
import { SceneRenderer } from '../../rendering/scene_renderer';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { DrawingContext } from '../../rendering/drawing_context';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { hexToRgb, type RgbColour } from '../../rendering/colour';
import {
  createOrbitAtmosphere,
  forEachOrbitAtmospherePixelRay,
} from '../../rendering/scenes/orbit_atmosphere';
import { OrbitAtmosphereSampler } from '../../rendering/scenes/orbit_atmosphere_sampler';
import { orbitSurfaceNormal, type OrbitVector } from '../../rendering/scenes/orbit_lighting';
import { getOrbitSettlementNightFactor } from '../../rendering/scenes/orbit_settlement_light';
import { settlementLayerFixture, settlementTerrainFixture } from '../fixtures/settlements';

interface CitySurface {
  normal: OrbitVector;
  albedo: RgbColour;
  liquidCoverage: number;
  reflectiveColour: null;
  emission: RgbColour | null;
}

interface Pixel {
  x: number;
  y: number;
  colour: RgbColour;
}

interface OrbitHooks {
  /** Exposes the production compositor for controlled optical checks. */
  composeOrbitRadiance(
    surface: CitySurface | null,
    cell: { dx: number; dy: number; sampleDx: number; sampleDy: number; coverage: number },
    radius: number,
    sampler: OrbitAtmosphereSampler | null,
    lights: Array<{ direction: OrbitVector; irradiance: RgbColour }>,
    exposure: number
  ): RgbColour;
  /** Draws only the globe so city motion can be measured independently of terminal layout. */
  drawRotatingPlanetSphere(
    model: Pick<OrbitScreenModel, 'selectedBody' | 'rotationPhase' | 'illuminationPhase' | 'stellarSources'>,
    cx: number,
    cy: number,
    radius: number
  ): void;
}

const NIGHT_PHASE = (1.5 - 0.55 / (2 * Math.PI)) % 1;
const FRONT_ROTATION = 1 - NIGHT_PHASE;
const CENTRE_CELL = { dx: 0, dy: 0, sampleDx: 0, sampleDy: 0, coverage: 1 };
const EMISSION = { r: 0.03, g: 0.012, b: 0.003 };

/** Records the actual globe raster while allowing isolated radiance queries. */
function rendererFixture() {
  const pixels: Pixel[] = [];
  const buffer = {
    /** Captures the fixed half-cell raster colours written by the production renderer. */
    drawScaledChar: (_char: string, x: number, y: number, colour: string) => {
      pixels.push({ x, y, colour: hexToRgb(colour) });
    },
  } as unknown as ScreenBuffer;
  const renderer = new SceneRenderer(
    buffer,
    new DrawingContext(buffer),
    new NebulaRenderer(),
    {} as SystemDataGenerator
  );
  return { renderer, hooks: renderer as unknown as OrbitHooks, pixels };
}

/** Supplies a dark material so measured night-side light can only come from city emission. */
function citySurface(normal: OrbitVector = { x: 0, y: 0, z: 1 }): CitySurface {
  return {
    normal,
    albedo: { r: 0, g: 0, b: 0 },
    liquidCoverage: 0,
    reflectiveColour: null,
    emission: EMISSION,
  };
}

/** Creates prepared regional data without introducing generation or gameplay side effects into optical checks. */
function cityPlanet(layer: SurfaceSettlementLayer | null, pressure = 0): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  const size = layer?.sourceWidth ?? 65;
  Object.defineProperties(planet, {
    type: { value: 'Rock' },
    name: { value: 'Optical Colony' },
    diameter: { value: 12742 },
    gravity: { value: 1 },
    surfaceTemp: { value: 288 },
    axialTilt: { value: 0 },
    heightmap: { value: settlementTerrainFixture('dry', size).heightmap },
    heightLevelColors: { value: Array<string>(256).fill('#000000') },
    settlements: { value: layer },
    atmosphere: {
      value: {
        density: pressure > 0 ? 'Earth-like' : 'None',
        pressure,
        composition: { Nitrogen: 79, Oxygen: 21 },
      },
    },
  });
  return planet;
}

/** Builds one compact asymmetric region to expose accidental screen-fixed lights or mirrored rotation. */
function compactCity(): SurfaceSettlementLayer {
  const cells = Array.from({ length: 12 }, (_, index) => ({
    x: 31 + (index % 3),
    y: 31 + Math.floor(index / 3),
    coverage: 0.7,
    emission: 0.5,
    siteIndex: 0,
  }));
  return settlementLayerFixture(cells);
}

/** Returns a night-side globe at a controlled rotation using the real projection and texture sampling. */
function renderGlobe(planet: Planet, rotation = FRONT_ROTATION): Pixel[] {
  const { renderer, hooks, pixels } = rendererFixture();
  renderer.prepareOrbitAssets([planet]);
  hooks.drawRotatingPlanetSphere(
    {
      selectedBody: planet,
      rotationPhase: rotation,
      illuminationPhase: NIGHT_PHASE,
      stellarSources: [
        { id: 'A', primary: true, brightness: 1, colour: '#FFFFFF', temperatureK: 5772, irradianceWm2: 1361 },
      ],
    },
    30,
    30,
    12
  );
  return pixels;
}

/** Measures the horizontal position of emitted light rather than the colour of a handpicked raster cell. */
function lightCentroid(pixels: readonly Pixel[]): number {
  let weightedX = 0;
  let light = 0;
  for (const pixel of pixels) {
    const luma = pixel.colour.r * 0.2126 + pixel.colour.g * 0.7152 + pixel.colour.b * 0.0722;
    weightedX += pixel.x * luma;
    light += luma;
  }
  return weightedX / light;
}

describe('orbital city illumination', () => {
  it('brings lights on smoothly at twilight and does not treat a faint companion as daylight', () => {
    const fluxes = [0, 1e-6, 1e-5, 0.0001, 0.001, 0.01, 0.1, 1];
    const factors = fluxes.map(getOrbitSettlementNightFactor);
    expect(factors[0]).toBe(1);
    expect(factors[2]).toBeGreaterThan(0.99);
    expect(factors.at(-1)!).toBeLessThan(0.00001);
    for (let index = 1; index < factors.length; index++) {
      expect(factors[index]).toBeLessThan(factors[index - 1]);
      expect(factors[index]).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits once with the same warm spectrum under one, two or three night-side stars', () => {
    const { hooks } = rendererFixture();
    const surface = citySurface();
    const stars = [
      { direction: { x: 0, y: 0, z: -1 }, irradiance: { r: 1, g: 1, b: 1 } },
      { direction: { x: 0.6, y: 0, z: -0.8 }, irradiance: { r: 0.6, g: 0.1, b: 0.01 } },
      { direction: { x: -0.6, y: 0, z: -0.8 }, irradiance: { r: 0.01, g: 0.1, b: 0.6 } },
    ];
    const dark = hooks.composeOrbitRadiance(surface, CENTRE_CELL, 24, null, [], 1);
    expect(dark.r).toBeGreaterThan(dark.g);
    expect(dark.g).toBeGreaterThan(dark.b);
    expect(dark.b).toBeGreaterThan(0);
    for (const count of [1, 2, 3]) {
      expect(hooks.composeOrbitRadiance(surface, CENTRE_CELL, 24, null, stars.slice(0, count), 1)).toEqual(
        dark
      );
    }
    expect(
      hooks.composeOrbitRadiance({ ...surface, emission: null }, CENTRE_CELL, 24, null, stars, 1)
    ).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('uses combined incident flux so a bright companion suppresses lights while a dim one does not', () => {
    const { hooks } = rendererFixture();
    /** Makes a star face the ground at a controlled visible flux. */
    const light = (flux: number) => ({
      direction: { x: 0, y: 0, z: 1 },
      irradiance: { r: flux, g: flux, b: flux },
    });
    const dark = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, null, [], 1);
    const faint = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, null, [light(1e-5)], 1);
    const bright = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, null, [light(1)], 1);
    const pair = hooks.composeOrbitRadiance(
      citySurface(),
      CENTRE_CELL,
      24,
      null,
      [light(0.001), light(0.001)],
      1
    );
    const single = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, null, [light(0.001)], 1);
    expect(faint.r).toBeGreaterThan(dark.r * 0.99);
    expect(bright.r).toBeLessThan(dark.r * 0.02);
    expect(pair.r).toBeLessThan(single.r);
  });

  it('dims and reddens ground lights through haze even when the star is occulted', () => {
    const { hooks } = rendererFixture();
    const night = [{ direction: { x: 0, y: 0, z: -1 }, irradiance: { r: 1, g: 1, b: 1 } }];
    const clear = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, null, night, 1);
    const sampler = new OrbitAtmosphereSampler(createOrbitAtmosphere(1, 288, 1, 12742)!);
    const hazy = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, sampler, night, 1);
    expect(hazy.r).toBeGreaterThan(0);
    expect(hazy.r).toBeLessThan(clear.r);
    expect(hazy.b / clear.b).toBeLessThan(hazy.r / clear.r);
    const dense = new OrbitAtmosphereSampler(createOrbitAtmosphere(90, 288, 1, 12742)!);
    const obscured = hooks.composeOrbitRadiance(citySurface(), CENTRE_CELL, 24, dense, night, 1);
    expect(obscured.r).toBeLessThan(hazy.r * 0.3);
  });

  it('applies atmospheric solid coverage once rather than multiplying by the independent silhouette mask', () => {
    const { hooks } = rendererFixture();
    const air = { ...createOrbitAtmosphere(1, 288, 1, 12742)!, extinction: { r: 0, g: 0, b: 0 } };
    const sampler = new OrbitAtmosphereSampler(air);
    let coveredArea = 0;
    forEachOrbitAtmospherePixelRay(1, 0, 1 / 24, air, (x, y, area) => {
      if (orbitSurfaceNormal(x, y)) coveredArea += area;
    });
    const surface = { ...citySurface(orbitSurfaceNormal(1, 0)!), emission: { r: 0.01, g: 0.01, b: 0.01 } };
    const cell = { dx: 24, dy: 0, sampleDx: 23.8, sampleDy: 0, coverage: 0.25 };
    const result = hooks.composeOrbitRadiance(surface, cell, 24, sampler, [], 1);
    const recoveredArea = -Math.log1p(-((result.r / 255) ** 2.2)) / 0.01;
    expect(coveredArea).toBeGreaterThan(0.3);
    expect(coveredArea).toBeLessThan(0.7);
    expect(recoveredArea).toBeCloseTo(coveredArea, 8);
    expect(hooks.composeOrbitRadiance(surface, { ...cell, coverage: 1 }, 24, sampler, [], 1)).toEqual(result);
  });

  it('moves city light with the body and hides it after rotation behind the globe', () => {
    const planet = cityPlanet(compactCity());
    const front = renderGlobe(planet);
    const moved = renderGlobe(planet, FRONT_ROTATION + 0.08);
    const back = renderGlobe(planet, FRONT_ROTATION + 0.5);
    expect(front.filter((pixel) => pixel.colour.r > 0).length).toBeGreaterThan(4);
    expect(Math.abs(lightCentroid(moved) - lightCentroid(front))).toBeGreaterThan(2);
    expect(back.every((pixel) => pixel.colour.r === 0 && pixel.colour.g === 0 && pixel.colour.b === 0)).toBe(
      true
    );
    expect(renderGlobe(planet)).toEqual(front);
  });

  it.each([0, 1])('keeps city-only changes within the covered globe at %s bar', (pressure) => {
    const plain = renderGlobe(cityPlanet(null, pressure));
    const original = new Map(plain.map((pixel) => [`${pixel.x}:${pixel.y}`, pixel.colour]));
    const city = renderGlobe(cityPlanet(compactCity(), pressure));
    const changed = city.filter((pixel) => {
      const before = original.get(`${pixel.x}:${pixel.y}`) ?? { r: 0, g: 0, b: 0 };
      return pixel.colour.r !== before.r || pixel.colour.g !== before.g || pixel.colour.b !== before.b;
    });
    expect(changed.length).toBeGreaterThan(4);
    for (const pixel of changed)
      expect(Math.hypot(pixel.x - 30, pixel.y - 30)).toBeLessThanOrEqual(12 + Math.SQRT2 / 4);
  });
});
