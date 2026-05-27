import { describe, expect, it } from 'vitest';
import { AU_IN_METERS, GRAVITATIONAL_CONSTANT_G, SOLAR_MASS_KG } from '../../../constants';
import { SystemDataGenerator } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';
import { Planet } from '../../../entities/planet';
import { SolarSystem } from '../../../entities/solar_system';

const SIMULATED_SECONDS_PER_REAL_SECOND = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);

function keplerPeriodSeconds(radius_m: number, centralMass_kg: number): number {
  return 2 * Math.PI * Math.sqrt(Math.pow(radius_m, 3) / (GRAVITATIONAL_CONSTANT_G * centralMass_kg));
}

function positiveAngularDelta(from: number, to: number): number {
  return ((to - from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}

function expectedDelta(deltaTimeSeconds: number, radius_m: number, centralMass_kg: number): number {
  const period = keplerPeriodSeconds(radius_m, centralMass_kg);
  return ((2 * Math.PI * deltaTimeSeconds * SIMULATED_SECONDS_PER_REAL_SECOND) / period) % (Math.PI * 2);
}

function findSystem(predicate: (system: SolarSystem) => boolean): SolarSystem {
  const seed = new PRNG('orbital-velocity-regression');
  const generator = new SystemDataGenerator(seed);
  for (let y = -90; y <= 90; y++) {
    for (let x = -90; x <= 90; x++) {
      const props = generator.getSystemProperties(x, y);
      if (!props.exists) continue;
      const system = new SolarSystem(props, x, y, seed);
      if (predicate(system)) return system;
    }
  }
  throw new Error('Expected representative generated system.');
}

describe('SolarSystem orbital velocities', () => {
  it('uses Kepler periods for binary star motion', () => {
    const system = findSystem((candidate) => candidate.stars.length >= 2);
    const primary = system.stars.find((star) => star.id === 'A')!;
    const secondary = system.stars.find((star) => star.id === 'B')!;

    const separation = primary.orbit!.radius + secondary.orbit!.radius;
    const expectedPeriod = keplerPeriodSeconds(separation, primary.massKg + secondary.massKg);

    expect(primary.orbit!.periodSeconds).toBeCloseTo(expectedPeriod, -5);
    expect(secondary.orbit!.periodSeconds).toBeCloseTo(expectedPeriod, -5);

    const oldAngle = secondary.orbit!.angle;
    system.updateOrbits(1);
    expect(positiveAngularDelta(oldAngle, secondary.orbit!.angle)).toBeCloseTo(
      expectedDelta(1, separation, primary.massKg + secondary.massKg),
      8
    );
  });

  it('uses Kepler periods for planets around their stellar host mass', () => {
    const system = findSystem((candidate) => candidate.planets.some(Boolean) && candidate.stars.length > 0);
    const planet = system.planets.find(Boolean) as Planet;
    const hostMass =
      planet.orbitHost.kind === 'circumbinary'
        ? system.stars.filter((star) => star.id === 'A' || star.id === 'B').reduce((sum, star) => sum + star.massKg, 0)
        : system.stars.reduce((sum, star) => sum + star.massKg, 0);

    const oldAngle = planet.orbitAngle;
    system.updateOrbits(1);

    expect(positiveAngularDelta(oldAngle, planet.orbitAngle)).toBeCloseTo(
      expectedDelta(1, planet.orbitDistance, hostMass),
      8
    );
  });

  it('uses Kepler periods for moons around parent planet mass', () => {
    const system = findSystem((candidate) => candidate.planets.some((planet) => planet && planet.moons.length > 0));
    const parent = system.planets.find((planet) => planet && planet.moons.length > 0)!;
    const moon = parent.moons[0];

    const oldAngle = moon.orbitAngle;
    system.updateOrbits(1);

    expect(positiveAngularDelta(oldAngle, moon.orbitAngle)).toBeCloseTo(
      expectedDelta(1, moon.orbitDistance, parent.mass),
      8
    );
  });

  it('reports synchronous rotation periods for tidally locked moons', () => {
    const system = findSystem((candidate) =>
      candidate.planets.some((planet) => planet && planet.moons.some((moon) => moon.tidallyLocked))
    );
    const parent = system.planets.find((planet) => planet && planet.moons.some((moon) => moon.tidallyLocked))!;
    const moon = parent.moons.find((candidate) => candidate.tidallyLocked)!;
    const orbitalPeriodHours = keplerPeriodSeconds(moon.orbitDistance, parent.mass) / 3600;

    expect(moon.rotationPeriodHours).toBeCloseTo(orbitalPeriodHours, 0);
    expect(moon.getRotationPeriodLabel()).not.toBe('unknown');
  });

  it('locks close-in planets to their stellar orbital period while leaving distant planets free', () => {
    const system = findSystem((candidate) => candidate.stars.length > 0);
    const close = (system as any).calculatePlanetTidalRotation(
      'Rock',
      0.03 * AU_IN_METERS,
      SOLAR_MASS_KG,
      6,
      new PRNG('close-lock')
    );
    const distant = (system as any).calculatePlanetTidalRotation(
      'Rock',
      1.0 * AU_IN_METERS,
      SOLAR_MASS_KG,
      6,
      new PRNG('distant-lock')
    );

    expect(close.tidallyLocked).toBe(true);
    expect(close.rotationPeriodHours).toBeCloseTo(keplerPeriodSeconds(0.03 * AU_IN_METERS, SOLAR_MASS_KG) / 3600, 0);
    expect(distant.tidallyLocked).toBe(false);
  });
});
