import { describe, expect, it } from 'vitest';
import {
  createOrbitAtmosphere,
  orbitSolarDensityColumn,
  sampleOrbitAtmospherePixelTransfer,
  type OrbitAtmosphereTransfer,
} from '../../rendering/scenes/orbit_atmosphere';
import {
  OrbitAtmosphereSampler,
  OrbitSolarColumnTable,
  orbitSunlightTransmission,
} from '../../rendering/scenes/orbit_atmosphere_sampler';
import { toneMapOrbitRadiance } from '../../rendering/scenes/orbit_tone_map';
import { getOrbitStellarIrradiance, getOrbitViewExposure } from '../../rendering/scenes/orbit_stellar_light';
import { orbitSunDirection } from '../../rendering/scenes/orbit_lighting';
import type { OrbitStellarSource } from '../../core/orbit_ui';
import type { RgbColour } from '../../rendering/colour';

const fixtures: {
  name: string;
  pressure: number;
  temperature: number;
  gravity: number;
  diameter: number;
  gases: Record<string, number>;
}[] = [
  {
    name: 'Earth',
    pressure: 1.01325,
    temperature: 288,
    gravity: 1,
    diameter: 12742,
    gases: { Nitrogen: 78, Oxygen: 21, Argon: 1 },
  },
  {
    name: 'thin CO2',
    pressure: 0.006,
    temperature: 210,
    gravity: 0.38,
    diameter: 6792,
    gases: { 'Carbon Dioxide': 95, Nitrogen: 5 },
  },
  {
    name: 'dense CO2',
    pressure: 90,
    temperature: 735,
    gravity: 0.9,
    diameter: 12104,
    gases: { 'Carbon Dioxide': 96, Nitrogen: 4 },
  },
  {
    name: 'giant cloud tops',
    pressure: 0.5,
    temperature: 130,
    gravity: 2.4,
    diameter: 140000,
    gases: { Hydrogen: 85, Helium: 15 },
  },
];
const channels = ['r', 'g', 'b'] as const;

/** Creates varied coloured illumination at both Earth-like and adapted outer-system fluxes. */
function sources(fluxScale: number): OrbitStellarSource[] {
  return [5772, 3200, 8000].map((temperatureK, index) => ({
    id: String(index),
    primary: index === 0,
    brightness: 1,
    colour: '#FFFFFF',
    temperatureK,
    irradianceWm2: (1361 * fluxScale) / (index + 1),
  }));
}

/** Adds transfer using coloured material and physical stellar RGB before the common tone map. */
function addRadiance(result: RgbColour, transfer: OrbitAtmosphereTransfer, irradiance: RgbColour): void {
  for (const channel of channels) {
    const albedo = channel === 'r' ? 0.46 : channel === 'g' ? 0.25 : 0.11;
    result[channel] +=
      (albedo * transfer.surface[channel] + transfer.scattering[channel]) * irradiance[channel];
  }
}

describe('prepared orbital atmospheric transfer', () => {
  it('bounds transmission interpolation error and preserves monotonic extinction', () => {
    let previous = 1;
    let maximumIncrease = 0;
    let maximumRelativeError = 0;
    // Uneven alignment with the lookup grid exercises interpolation between nodes.
    for (let index = 0; index < 10001; index++) {
      const depth = (40 * index) / 10001;
      const reference = Math.exp(-depth);
      const actual = orbitSunlightTransmission(depth);
      maximumRelativeError = Math.max(maximumRelativeError, Math.abs(actual / reference - 1));
      maximumIncrease = Math.max(maximumIncrease, actual - previous);
      previous = actual;
    }
    expect(maximumRelativeError).toBeLessThan(4.8e-7);
    expect(maximumIncrease).toBe(0);
    expect(previous).toBeGreaterThan(0);
    expect(orbitSunlightTransmission(0)).toBe(1);
    for (const depth of [40, 40.000001, 64, 1000, Infinity]) {
      expect(orbitSunlightTransmission(depth)).toBe(0);
      expect(Math.abs(orbitSunlightTransmission(depth) - Math.exp(-depth))).toBeLessThan(4.3e-18);
    }
    expect(orbitSunlightTransmission(-1e-10)).toBe(Math.exp(1e-10));
    expect(orbitSunlightTransmission(NaN)).toBeNaN();
  });

  it.each(fixtures)('preserves sunlight transmission and the exact shadow boundary for $name', (fixture) => {
    const air = createOrbitAtmosphere(
      fixture.pressure,
      fixture.temperature,
      fixture.gravity,
      fixture.diameter,
      fixture.gases
    )!;
    const table = new OrbitSolarColumnTable(air);
    for (const fraction of [0, 0.0001, 0.001, 0.01, 0.05, 0.2, 0.5, 0.9, 1]) {
      const radius = 1 + (air.outerRadius - 1) * fraction;
      const horizon = -Math.sqrt(Math.max(0, 1 - 1 / (radius * radius)));
      for (const mu of [horizon - 1e-6, horizon + 1e-7, horizon + 1e-4, 0, 0.01, 0.1, 0.5, 1]) {
        const sun = { x: Math.sqrt(1 - mu * mu), y: 0, z: mu };
        const reference = orbitSolarDensityColumn(0, 0, radius, sun, air);
        const fast = table.sample(radius * radius, radius * mu);
        if (!Number.isFinite(reference)) {
          expect(fast).toBe(Infinity);
          continue;
        }
        expect(Number.isFinite(fast)).toBe(true);
        expect(fast).toBeGreaterThanOrEqual(0);
        for (const channel of channels) {
          const error = Math.abs(
            Math.exp(-air.extinction[channel] * fast) - Math.exp(-air.extinction[channel] * reference)
          );
          expect(error, `${fixture.name}, height ${fraction}, mu ${mu}, ${channel}`).toBeLessThan(0.001);
        }
      }
    }
  });

  it.each(fixtures)(
    'keeps displayed one- and three-star colours within half a channel level for $name',
    (fixture) => {
      const air = createOrbitAtmosphere(
        fixture.pressure,
        fixture.temperature,
        fixture.gravity,
        fixture.diameter,
        fixture.gases
      )!;
      const sampler = new OrbitAtmosphereSampler(air);
      for (const size of [1 / 24, 1 / 48]) {
        for (const phase of [0, 0.9, 2.2, 2.58, 2.94, 3.3]) {
          for (const radius of [0, 0.5, 0.96, 0.985, 1, 1.004, 1.015, air.projectedLayers.at(-1)!]) {
            for (const angle of [0, 0.6, Math.PI / 2, Math.PI]) {
              const x = radius * Math.cos(angle);
              const y = radius * Math.sin(angle);
              const transfers = [0, 0.7, -1.1].map((offset) => {
                const sun = orbitSunDirection(phase + offset);
                return {
                  reference: sampleOrbitAtmospherePixelTransfer(x, y, size, sun, air),
                  fast: sampler.samplePixel(x, y, size, sun),
                };
              });
              for (const count of [1, 3]) {
                for (const scale of [1, 0.001]) {
                  const lights = sources(scale).slice(0, count);
                  const reference = { r: 0, g: 0, b: 0 };
                  const fast = { r: 0, g: 0, b: 0 };
                  lights.forEach((source, index) => {
                    const irradiance = getOrbitStellarIrradiance(source);
                    addRadiance(reference, transfers[index].reference, irradiance);
                    addRadiance(fast, transfers[index].fast, irradiance);
                  });
                  const exposure = getOrbitViewExposure(lights);
                  const referenceColour = toneMapOrbitRadiance(reference, exposure);
                  const fastColour = toneMapOrbitRadiance(fast, exposure);
                  for (const channel of channels) {
                    expect(
                      Math.abs(fastColour[channel] - referenceColour[channel]),
                      `${fixture.name}, phase ${phase}, pixel ${x},${y}, size ${size}, stars ${count}, flux ${scale}, ${channel}`
                    ).toBeLessThan(0.5);
                  }
                }
              }
            }
          }
        }
      }
    }
  );

  it('preserves opposite contact symmetry and does not create light inside the planetary shadow', () => {
    const air = createOrbitAtmosphere(1.01325, 288, 1, 12742)!;
    const sampler = new OrbitAtmosphereSampler(air);
    const right = sampler.samplePixel(1, 0, 1 / 24, { x: 1 / 3, y: 0, z: -Math.sqrt(8) / 3 });
    const left = sampler.samplePixel(-1, 0, 1 / 24, { x: -1 / 3, y: 0, z: -Math.sqrt(8) / 3 });
    for (const channel of channels)
      expect(left.scattering[channel]).toBeCloseTo(right.scattering[channel], 10);
    expect(right.scattering.r).toBeGreaterThan(0);
    expect(sampler.samplePixel(0, 0, 1 / 24, { x: 0, y: 0, z: -1 })).toEqual({
      scattering: { r: 0, g: 0, b: 0 },
      surface: { r: 0, g: 0, b: 0 },
    });
  });

  it('preserves inclined multi-star illumination with prepared ray geometry', () => {
    const air = createOrbitAtmosphere(90, 735, 0.9, 12104, { 'Carbon Dioxide': 96, Nitrogen: 4 })!;
    const sampler = new OrbitAtmosphereSampler(air);
    const lights = sources(0.001);
    const exposure = getOrbitViewExposure(lights);
    const directions = [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: -2, z: -3 },
      { x: -2, y: -1, z: 3 },
    ];
    for (const sign of [-1, 1]) {
      for (const [x, y] of [
        [0, 0],
        [0.4, 0.3],
        [0.98, 0.14],
        [-1.002, 0],
        [0, 1.005],
        [0, -1.005],
      ]) {
        const reference = { r: 0, g: 0, b: 0 };
        const fast = { r: 0, g: 0, b: 0 };
        directions.forEach((direction, index) => {
          const scale = sign / Math.hypot(direction.x, direction.y, direction.z);
          const sun = { x: direction.x * scale, y: direction.y * scale, z: direction.z * scale };
          const irradiance = getOrbitStellarIrradiance(lights[index]);
          addRadiance(reference, sampleOrbitAtmospherePixelTransfer(x, y, 1 / 48, sun, air), irradiance);
          addRadiance(fast, sampler.samplePixel(x, y, 1 / 48, sun), irradiance);
        });
        const expectedColour = toneMapOrbitRadiance(reference, exposure);
        const actualColour = toneMapOrbitRadiance(fast, exposure);
        for (const channel of channels) {
          expect(
            Math.abs(actualColour[channel] - expectedColour[channel]),
            `inclined stars, sign ${sign}, pixel ${x},${y}, ${channel}`
          ).toBeLessThan(0.5);
        }
      }
    }
  });

  it('shares prepared rays between stars, resets them on resize, and snapshots optical inputs', () => {
    const air = createOrbitAtmosphere(1.01325, 288, 1, 12742)!;
    const sampler = new OrbitAtmosphereSampler(air);
    const first = sampler.samplePixel(1, 0, 1 / 24, orbitSunDirection(0));
    const stats = sampler.getCacheStats();
    sampler.samplePixel(1, 0, 1 / 24, orbitSunDirection(2));
    expect(sampler.getCacheStats()).toEqual(stats);
    expect(sampler.samplePixel(1, 0, 1 / 24, orbitSunDirection(0))).toEqual(first);
    sampler.samplePixel(0, 0, 1 / 48, orbitSunDirection(0));
    expect(sampler.getCacheStats().pixels).toBe(1);
    expect(sampler.getCacheStats().rays).toBe(1);
    expect(sampler.matches({ ...air })).toBe(true);
    air.extinction.r *= 2;
    expect(sampler.matches(air)).toBe(false);
    expect(sampler.samplePixel(1, 0, 1 / 24, orbitSunDirection(0))).toEqual(first);
  });

  it('bounds cached off-globe pixels during arbitrary panning or repeated unusual calls', () => {
    const sampler = new OrbitAtmosphereSampler(createOrbitAtmosphere(1, 288, 1, 12742)!);
    const sun = orbitSunDirection(0);
    for (let index = 0; index < 20000; index++) sampler.samplePixel(2 + index / 10000, 0, 1 / 24, sun);
    const stats = sampler.getCacheStats();
    expect(stats.pixels).toBeLessThan(20000);
    expect(stats.rays).toBe(0);
    expect(stats.numericBytes).toBeLessThan(3 * 1024 * 1024);
  });
});
