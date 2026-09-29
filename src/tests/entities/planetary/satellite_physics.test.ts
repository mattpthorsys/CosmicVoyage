import { describe, expect, it } from 'vitest';
import {
  canAddSatellite,
  fluidRocheLimitM,
  sufficientlySeparated,
} from '../../../entities/satellite_physics';
import { generatePlanetCharacteristics } from '../../../entities/planet/planet_characteristics_generator';
import { PRNG } from '../../../utils/prng';

const earth = { type: 'Rock', mass: 5.972e24, diameter: 12742, density: 5.51, moons: [] };
const moon = { mass: 7.342e22, diameter: 3474, density: 3.34 };

describe('satellite physical constraints', () => {
  it('allows an Earth-Moon hierarchy but rejects oversized satellites and Roche-interior orbits', () => {
    expect(canAddSatellite(earth, moon, 384400e3)).toBe(true);
    expect(canAddSatellite(earth, { ...moon, mass: earth.mass }, 384400e3)).toBe(false);
    expect(canAddSatellite(earth, moon, fluidRocheLimitM(earth, moon) * 0.99)).toBe(false);
  });

  it('moves the disruption boundary outwards for low-density moons', () => {
    expect(fluidRocheLimitM(earth, { ...moon, density: 1 })).toBeGreaterThan(fluidRocheLimitM(earth, moon));
  });

  it('checks the whole satellite inventory, not just each individual mass', () => {
    const giant = { ...earth, type: 'GasGiant', mass: 1.898e27 };
    const heavyMoon = { ...moon, mass: giant.mass * 0.0006 };
    expect(canAddSatellite(giant, heavyMoon, 1e9)).toBe(true);
    expect(
      canAddSatellite({ ...giant, moons: [{ ...heavyMoon, orbitDistance: 1e9 }] }, heavyMoon, 1e10)
    ).toBe(false);
  });

  it('rejects coincident or closely packed massive orbits', () => {
    const a = { mass: 1.898e27, orbitDistance: 1.5e11 };
    expect(sufficientlySeparated(a, a, 1.989e30)).toBe(false);
    expect(sufficientlySeparated(a, { ...a, orbitDistance: 1.6e11 }, 1.989e30)).toBe(false);
    expect(sufficientlySeparated(a, { ...a, orbitDistance: 6e11 }, 1.989e30)).toBe(true);
  });

  it('derives all physical properties from the supplied moon size before generating climate', () => {
    const body = generatePlanetCharacteristics(
      'Lunar',
      1.496e11,
      new PRNG('moon-physical-base'),
      'G',
      undefined,
      1361,
      {
        physicalBase: { diameter: moon.diameter, density: moon.density },
        tidallyLocked: true,
        axialTiltRad: 0.01,
        orbitalInclinationRad: 0.02,
      }
    );
    expect(body.diameter).toBe(moon.diameter);
    expect(body.mass / moon.mass).toBeCloseTo(1, 2);
    expect(body.escapeVelocity).toBeGreaterThan(2300);
    expect(body.escapeVelocity).toBeLessThan(2450);
    expect(body.axialTilt).toBe(0.01);
    expect(body.orbitalInclination).toBe(0.02);
  });
});
