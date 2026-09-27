import { describe, expect, it } from 'vitest';
import { AU_IN_METERS, SOLAR_LUMINOSITY_W } from '../../constants/physics';
import {
  getOrbitStellarIrradiance,
  getOrbitViewExposure,
  sampleOrbitStellarDisc,
} from '../../rendering/scenes/orbit_stellar_light';
import { projectOrbitSource } from '../../rendering/scenes/orbit_lighting';

const sun = {
  id: 'A',
  primary: true,
  brightness: 1,
  colour: '#FFFFFF',
  temperatureK: 5772,
  irradianceWm2: SOLAR_LUMINOSITY_W / (4 * Math.PI * AU_IN_METERS ** 2),
};

describe('physical orbit starlight', () => {
  it('adapts the whole orbital view to distant stars and combined companion light', () => {
    const single = getOrbitViewExposure([sun]);
    expect(single).toBeCloseTo(Math.PI, 10);
    expect(getOrbitViewExposure([{ ...sun, irradianceWm2: sun.irradianceWm2 / 4 }])).toBeCloseTo(
      single * 4,
      10
    );
    expect(getOrbitViewExposure([sun, { ...sun, id: 'B', primary: false }])).toBeCloseTo(single / 2, 10);
    expect(getOrbitViewExposure([{ ...sun, irradianceWm2: 0 }])).toBeLessThan(Infinity);
  });
  it('preserves absolute irradiance and treats zero output as darkness', () => {
    expect(getOrbitStellarIrradiance(sun)).toEqual({ r: 1, g: 1, b: 1 });
    expect(getOrbitStellarIrradiance({ ...sun, irradianceWm2: sun.irradianceWm2 / 4 })).toEqual({
      r: 0.25,
      g: 0.25,
      b: 0.25,
    });
    expect(getOrbitStellarIrradiance({ ...sun, irradianceWm2: 0 })).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('makes cool starlight redder without converting its infrared energy to visible red', () => {
    const cool = getOrbitStellarIrradiance({ ...sun, temperatureK: 3000 });
    const hot = getOrbitStellarIrradiance({ ...sun, temperatureK: 12000 });
    expect(cool.r).toBeGreaterThan(cool.b);
    expect(cool.r).toBeLessThan(1);
    expect(hot.b / hot.r).toBeGreaterThan(1);
    expect(getOrbitStellarIrradiance({ ...sun, colour: '#FF0000' })).toEqual(getOrbitStellarIrradiance(sun));
  });

  it('conserves stellar-disc energy and resolves partial occultation on either limb', () => {
    for (const sign of [-1, 1]) {
      const direction = { x: sign / 3, y: 0, z: -Math.sqrt(8) / 3 };
      const samples = sampleOrbitStellarDisc(direction, 0.00465);
      expect(samples.reduce((sum, sample) => sum + sample.weight, 0)).toBe(1);
      let visible = 0;
      for (const sample of samples) {
        expect(Math.hypot(sample.direction.x, sample.direction.y, sample.direction.z)).toBeCloseTo(1, 12);
        const projected = projectOrbitSource(sample.direction)!;
        if (Math.hypot(projected.x, projected.y) > 1) visible += sample.weight;
      }
      expect(visible).toBeGreaterThan(0);
      expect(visible).toBeLessThan(1);
      expect(sampleOrbitStellarDisc(direction, 0)).toEqual([{ direction, weight: 1 }]);
    }
  });
});
