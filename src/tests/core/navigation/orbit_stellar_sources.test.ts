import { describe, expect, it } from 'vitest';
import { createOrbitStellarSources } from '../../../core/orbit_stellar_sources';

describe('orbital stellar references', () => {
  it('passes absolute flux, effective temperature and angular radius to the atmosphere renderer', () => {
    const star = {
      id: 'A' as const,
      starType: 'G',
      luminosityW: 3.828e26,
      radiusM: 6.957e8,
      systemX: 1.495978707e11,
      systemY: 0,
    };
    const body = { systemX: 0, systemY: 0 };
    const first = createOrbitStellarSources([star], body)[0];
    expect(first.irradianceWm2).toBeCloseTo(1361.17, 1);
    expect(first.temperatureK).toBeCloseTo(5772, -1);
    expect(first.angularRadius).toBeCloseTo(0.00465, 5);
    star.systemX *= 2;
    const distant = createOrbitStellarSources([star], body)[0];
    expect(distant.irradianceWm2).toBeCloseTo(first.irradianceWm2! / 4, 8);
    expect(distant.temperatureK).toBe(first.temperatureK);
    expect(distant.angularRadius).toBeCloseTo(first.angularRadius! / 2, 7);
  });
  it('uses inverse-square irradiance and real relative bearings for companion stars', () => {
    const stars = [
      { id: 'A' as const, starType: 'M', luminosityW: 1e24, systemX: 1e11, systemY: 0 },
      { id: 'B' as const, starType: 'G', luminosityW: 8e24, systemX: 0, systemY: 2e11 },
    ];
    const sources = createOrbitStellarSources(stars, { systemX: 0, systemY: 0 });
    expect(sources[0]).toMatchObject({ id: 'B', primary: true, relativeFlux: 1, longitudeOffset: 0 });
    expect(sources[1].relativeFlux).toBeCloseTo(0.5);
    expect(sources[1].longitudeOffset).toBeCloseTo(-Math.PI / 2);
    stars[1].systemY *= 2;
    expect(createOrbitStellarSources(stars, { systemX: 0, systemY: 0 })[0].id).toBe('A');
  });

  it('does not invent a host star in a starless system', () => {
    expect(createOrbitStellarSources([], { systemX: 0, systemY: 0 })).toEqual([]);
  });
});
