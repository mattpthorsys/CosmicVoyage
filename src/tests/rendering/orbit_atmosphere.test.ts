import { describe, expect, it } from 'vitest';
import {
  createOrbitAtmosphere,
  orbitSourceTransmittance,
  sampleOrbitAtmosphere,
  sampleOrbitAtmospherePixel,
} from '../../rendering/scenes/orbit_atmosphere';

const air = createOrbitAtmosphere(1, 288.15, 1, 12742)!;
const contact = { x: 1 / 3, y: 0, z: -Math.sqrt(8) / 3 };

describe('orbital molecular scattering', () => {
  it('captures subpixel contact light at different limb angles without changing the display grid', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const value = sampleOrbitAtmospherePixel(x, y, 1 / 24, { x: x / 3, y: y / 3, z: contact.z }, air);
      expect(value.r).toBeGreaterThan(0);
      expect(value.b).toBeGreaterThan(0);
      expect(Object.values(value).every(Number.isFinite)).toBe(true);
      const opposite = sampleOrbitAtmospherePixel(
        -x,
        -y,
        1 / 24,
        { x: -x / 3, y: -y / 3, z: contact.z },
        air
      );
      expect(value.r).toBeCloseTo(opposite.r, 10);
    }
    expect(sampleOrbitAtmospherePixel(1.2, 0, 1 / 24, contact, air)).toEqual({ r: 0, g: 0, b: 0 });
  });
  it('reddens and dims the stellar point at contact, with no premature solid occultation', () => {
    const grazing = orbitSourceTransmittance(1.001, 0, air);
    expect(grazing.r).toBeGreaterThan(grazing.g);
    expect(grazing.g).toBeGreaterThan(grazing.b);
    expect(grazing.r).toBeLessThan(1);
    expect(orbitSourceTransmittance(0.999, 0, air)).toEqual({ r: 0, g: 0, b: 0 });
    expect(orbitSourceTransmittance(1.1, 0, air)).toEqual({ r: 1, g: 1, b: 1 });
  });
  it('uses hydrostatic scale height and pressure-dependent extinction, not a fixed-width glow', () => {
    expect(air.scaleHeight * 6371000).toBeCloseTo(8434, -1);
    const thin = createOrbitAtmosphere(0.01, 288.15, 1, 12742)!;
    expect(thin.scaleHeight).toBe(air.scaleHeight);
    expect(thin.extinction.r).toBeCloseTo(air.extinction.r / 100, 10);
    expect(createOrbitAtmosphere(1, 288.15, 2, 12742)!.scaleHeight).toBe(air.scaleHeight / 2);
    expect(createOrbitAtmosphere(0, 288.15, 1, 12742)).toBeNull();
    expect(createOrbitAtmosphere(1, NaN, 1, 12742)).toBeNull();
    expect(createOrbitAtmosphere(1, 288.15, 0, 12742)).toBeNull();
  });

  it('distinguishes molecular weight and scattering strength without assigning gas-name colours', () => {
    const nitrogen = createOrbitAtmosphere(1, 288.15, 1, 12742, { Nitrogen: 100 })!;
    const helium = createOrbitAtmosphere(1, 288.15, 1, 12742, { Helium: 100 })!;
    expect(helium.scaleHeight).toBeGreaterThan(nitrogen.scaleHeight * 6);
    expect(helium.extinction.b).toBeLessThan(nitrogen.extinction.b / 50);
    expect(createOrbitAtmosphere(1, 288.15, 1, 12742, { Nitrogen: 1 })).toEqual(nitrogen);
  });

  it('produces a reddened grazing path and symmetric ingress and egress', () => {
    const right = sampleOrbitAtmosphere(1.001, 0, contact, air);
    const left = sampleOrbitAtmosphere(-1.001, 0, { ...contact, x: -contact.x }, air);
    expect(right).toEqual(left);
    expect(right.r).toBeGreaterThan(0);
    expect(right.r).toBeGreaterThan(right.b);
    const day = sampleOrbitAtmosphere(0.98, 0, { x: 0, y: 0, z: 1 }, air);
    expect(day.b).toBeGreaterThan(day.r);
  });

  it('respects the planetary shadow and does not paint a ring through deep occultation', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const colour = sampleOrbitAtmosphere(
        1.001 * Math.cos(angle),
        1.001 * Math.sin(angle),
        { x: 0, y: 0, z: -1 },
        air
      );
      // Very high, tenuous gas can see the Sun; its radiance remains sub-visible.
      expect(Math.max(colour.r, colour.g, colour.b)).toBeLessThan(1e-7);
    }
    expect(sampleOrbitAtmosphere(-1.001, 0, contact, air)).toEqual({ r: 0, g: 0, b: 0 });
    expect(sampleOrbitAtmosphere(1.1, 0, contact, air)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('matches a resolved tangent-column integration for thin and dense atmospheres', () => {
    for (const pressure of [0.006, 1.01325, 90]) {
      const atmosphere = createOrbitAtmosphere(pressure, 288.15, 1, 12742)!;
      const x = 1.003;
      const impact2 = (9 * x * x) / (x * x + 8);
      const half = Math.sqrt(atmosphere.outerRadius ** 2 - impact2);
      const step = (2 * half) / 4096;
      let column = 0;
      for (let i = 0; i < 4096; i++) {
        const t = -half + (i + 0.5) * step;
        column += Math.exp(-(Math.sqrt(impact2 + t * t) - 1) / atmosphere.scaleHeight) * step;
      }
      const transmission = orbitSourceTransmittance(x, 0, atmosphere);
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(transmission[channel]).toBeCloseTo(Math.exp(-atmosphere.extinction[channel] * column), 3);
      }
    }
  });

  it('uses bar consistently and extends the shell for optically dense gas', () => {
    const standardAir = createOrbitAtmosphere(1.01325, 288.15, 1, 12742)!;
    expect(standardAir.extinction.r).toBeCloseTo(5.8e-6 * 6371000, 8);
    const dense = createOrbitAtmosphere(90, 288.15, 1, 12742)!;
    expect(dense.outerRadius).toBeGreaterThan(standardAir.outerRadius);
    expect(dense.projectedLayers.every((value, i, values) => i === 0 || value > values[i - 1])).toBe(true);
  });

  it('matches the analytic single-scattering solution looking directly along a stellar ray', () => {
    for (const x of [1.001, 1.005, 1.01]) {
      const length = Math.sqrt(x * x + 8);
      const sun = { x: x / length, y: 0, z: -Math.sqrt(8) / length };
      const impact2 = (9 * x * x) / (x * x + 8);
      const half = Math.sqrt(air.outerRadius ** 2 - impact2);
      const step = (2 * half) / 4096;
      let column = 0;
      for (let i = 0; i < 4096; i++) {
        const t = -half + (i + 0.5) * step;
        column += Math.exp(-(Math.sqrt(impact2 + t * t) - 1) / air.scaleHeight) * step;
      }
      const radiance = sampleOrbitAtmosphere(x, 0, sun, air);
      for (const channel of ['r', 'g', 'b'] as const) {
        // Along this unobstructed chord, incoming + outgoing optical depth is
        // constant: L / E = phase(0) * tau * exp(-tau).
        const tau = column * air.extinction[channel];
        const expected = (3 / (8 * Math.PI)) * tau * Math.exp(-tau);
        // Bound absolute error to <0.5% of the analytic peak phase(0)/e,
        // including strongly extinguished channels whose relative error is large.
        expect(Math.abs(radiance[channel] - expected)).toBeLessThan(2e-4);
      }
    }
  });

  it('concentrates the warm contact light beside the apparent sun rather than around the whole limb', () => {
    const besideSun = sampleOrbitAtmosphere(1.001, 0, contact, air);
    const awayFromSun = sampleOrbitAtmosphere(1.001 * Math.cos(0.6), 1.001 * Math.sin(0.6), contact, air);
    expect(besideSun.r).toBeGreaterThan(awayFromSun.r * 2);
    // Compare warm radiance, not R/B: an almost-black shadow can have a huge
    // colour ratio while contributing no perceptible sunset light.
    expect(besideSun.r - besideSun.b).toBeGreaterThan((awayFromSun.r - awayFromSun.b) * 2);
  });
});
