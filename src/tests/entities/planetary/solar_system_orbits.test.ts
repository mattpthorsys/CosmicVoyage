import { describe, expect, it } from 'vitest';
import { AU_IN_METERS, GRAVITATIONAL_CONSTANT_G, SOLAR_MASS_KG, SPECTRAL_TYPES } from '../../../constants';
import { SystemBasicProperties, SystemDataGenerator } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';
import { Planet } from '../../../entities/planet';
import { SolarSystem } from '../../../entities/solar_system';
import { calculateStellarLuminosityW, StellarArchitecture, StellarBody } from '../../../entities/stellar_body';

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

function testStar(id: StellarBody['id'], starType: string, angle: number = 0): StellarBody {
  const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES.G;
  return {
    id,
    name: `Wide ${id}`,
    starType,
    massKg: starInfo.mass,
    radiusM: starInfo.radius,
    luminosityW: calculateStellarLuminosityW(starType),
    systemX: 0,
    systemY: 0,
    orbit: id === 'A' ? null : { center: 'barycenter', radius: 0, angle, periodSeconds: 0 },
    environment: { starType, ageGyr: 5.2, metallicityFeH: 0.15 },
  };
}

function manualSystem(architecture: StellarArchitecture, seed: string = 'manual-wide-architecture'): SolarSystem {
  const props: SystemBasicProperties = {
    exists: true,
    starType: architecture.stars[0]?.starType ?? 'G',
    name: 'Wide Test',
    hasStarbase: false,
    ageGyr: 5.2,
    metallicityFeH: 0.15,
    architecture,
    objectKind: 'stellar',
  };
  return new SolarSystem(props, 17, -23, new PRNG(seed));
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

  it('allows local planets around dynamically wide companion stars', () => {
    const architecture: StellarArchitecture = {
      kind: 'triple',
      stars: [testStar('A', 'G'), testStar('B', 'K', Math.PI), testStar('C', 'M', Math.PI / 2)],
      primaryStarId: 'A',
      binarySeparation: 12 * AU_IN_METERS,
      outerSeparation: 45 * AU_IN_METERS,
      habitableLabel: 'A',
    };
    const system = manualSystem(architecture, 'wide-companion-local-planets');
    const secondaryPlanet = system.planets.find(
      (planet) => planet?.orbitHost.kind === 'circumstellar' && planet.orbitHost.starId !== 'A'
    );

    expect(secondaryPlanet).toBeTruthy();
    expect((system as any).getSecondaryCircumstellarPlanetHosts().map((star: StellarBody) => star.id)).toContain(
      secondaryPlanet!.orbitHost.starId
    );

    const host = system.stars.find((star) => star.id === secondaryPlanet!.orbitHost.starId)!;
    const stableZone = (system as any).getCircumstellarStableZone(host);
    expect(secondaryPlanet!.orbitDistance).toBeLessThanOrEqual(stableZone.maxOrbit_m);
    expect(secondaryPlanet!.orbitDistance).toBeGreaterThanOrEqual(stableZone.minOrbit_m);

    system.updateOrbits(1);
    const hostDistance = Math.hypot(secondaryPlanet!.systemX - host.systemX, secondaryPlanet!.systemY - host.systemY);
    expect(hostDistance).toBeCloseTo(secondaryPlanet!.orbitDistance, -5);
  });

  it('does not assign local planets to close companion stars without a stable zone', () => {
    const architecture: StellarArchitecture = {
      kind: 'binary',
      stars: [testStar('A', 'G'), testStar('B', 'K', Math.PI)],
      primaryStarId: 'A',
      binarySeparation: 1.2 * AU_IN_METERS,
      outerSeparation: 0,
      habitableLabel: 'AB',
    };
    const system = manualSystem(architecture, 'close-binary-no-local-planets');

    expect((system as any).getSecondaryCircumstellarPlanetHosts()).toHaveLength(0);
    expect(system.planets.some((planet) => planet?.orbitHost.kind === 'circumstellar' && planet.orbitHost.starId === 'B')).toBe(
      false
    );
  });
});
