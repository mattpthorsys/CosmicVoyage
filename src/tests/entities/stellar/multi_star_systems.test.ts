import { describe, expect, it } from 'vitest';
import { AU_IN_METERS, GRAVITATIONAL_CONSTANT_G, SOLAR_MASS_KG } from '../../../constants/physics';
import { SPECTRAL_TYPES } from '../../../constants/stellar';
import { SolarSystem } from '../../../entities/solar_system';
import {
  calculateStellarLuminosityW,
  StellarArchitecture,
  StellarBody,
} from '../../../entities/stellar_body';
import {
  getConservativeSatelliteHillRadius,
  getStableOrbitRange,
  isOrbitWithinStableRange,
} from '../../../entities/orbital_stability';
import { PRNG } from '../../../utils/prng';
import { CONFIG } from '../../../config';

/** Builds unequal coeval stars so mass-weighted geometry cannot pass by symmetry alone. */
function star(id: StellarBody['id'], starType: string): StellarBody {
  return {
    id,
    name: `Audit ${id}`,
    starType,
    massKg: SPECTRAL_TYPES[starType].mass,
    radiusM: SPECTRAL_TYPES[starType].radius,
    luminosityW: calculateStellarLuminosityW(starType),
    systemX: 0,
    systemY: 0,
    orbit:
      id === 'A'
        ? null
        : { center: 'barycenter', radius: 0, angle: id === 'B' ? 0.4 : 1.3, periodSeconds: 0 },
    environment: { starType, ageGyr: 5, metallicityFeH: 0 },
  };
}

/** Creates a detached hierarchical triple with a wide local region around C. */
function triple(): StellarArchitecture {
  return {
    kind: 'triple',
    stars: [star('A', 'G'), star('B', 'K'), star('C', 'M')],
    primaryStarId: 'A',
    binarySeparation: 0.2 * AU_IN_METERS,
    outerSeparation: 40 * AU_IN_METERS,
    habitableLabel: 'AB+C',
  };
}

/** Materializes an isolated system without surface generation or catalogue searches. */
function system(architecture = triple(), seed = 'hierarchy-audit', depot = false): SolarSystem {
  return new SolarSystem(
    {
      exists: true,
      name: 'Audit',
      starType: 'G',
      ageGyr: 5,
      metallicityFeH: 0,
      architecture,
      objectKind: 'stellar',
      hasStarbase: false,
      stationKind: depot ? 'automated-depot' : null,
      settlementStage: 'none',
    },
    17,
    -23,
    new PRNG(seed)
  );
}

/** Captures generation output, excluding mutable caches and methods. */
function planetaryProfiles(value: SolarSystem) {
  return value.planets.map(
    (planet) =>
      planet && {
        name: planet.name,
        type: planet.type,
        host: planet.orbitHost,
        radius: planet.orbitDistance,
        angle: planet.orbitAngle,
        temperature: planet.surfaceTemp,
        atmosphere: planet.atmosphere,
        moons: planet.moons.map((moon) => ({ name: moon.name, radius: moon.orbitDistance })),
      }
  );
}

describe('multi-star physical and generation contracts', () => {
  it('never mutates cached descriptors or another live system and regenerates repeatably', () => {
    const blueprint = triple();
    const original = structuredClone(blueprint);
    const first = system(blueprint);
    const second = system(blueprint);
    const secondStars = structuredClone(second.stars);
    const profiles = planetaryProfiles(second);
    first.updateOrbits(1200);
    first.stars[0].environment.ageGyr = 1;
    expect(blueprint).toEqual(original);
    expect(second.stars).toEqual(secondStars);
    expect(planetaryProfiles(system(blueprint))).toEqual(profiles);
  });

  it('keeps the total centre of mass fixed and both separations correct at many phases', () => {
    const value = system();
    const [a, b, c] = value.stars;
    const totalMass = a.massKg + b.massKg + c.massKg;
    const initialCentre = value.getOrbitCenter({ kind: 'circumbinary' });
    for (const elapsed of [0, 1, 100, 2000, 20000]) {
      value.updateOrbits(elapsed);
      const centre = value.getOrbitCenter({ kind: 'circumbinary' });
      expect(Math.hypot(a.systemX - b.systemX, a.systemY - b.systemY) / AU_IN_METERS).toBeCloseTo(0.2, 10);
      expect(Math.hypot(c.systemX - centre.x, c.systemY - centre.y) / AU_IN_METERS).toBeCloseTo(40, 10);
      expect(
        value.stars.reduce((sum, item) => sum + (item.massKg / totalMass) * item.systemX, 0) / AU_IN_METERS
      ).toBeCloseTo(0, 10);
      expect(
        value.stars.reduce((sum, item) => sum + (item.massKg / totalMass) * item.systemY, 0) / AU_IN_METERS
      ).toBeCloseTo(0, 10);
      for (const planet of value.planets) {
        if (!planet) continue;
        const host = value.getOrbitCenter(planet.orbitHost);
        expect(Math.hypot(planet.systemX - host.x, planet.systemY - host.y) / AU_IN_METERS).toBeCloseTo(
          planet.orbitDistance / AU_IN_METERS,
          10
        );
        expect(Math.hypot(planet.systemX, planet.systemY)).toBeLessThan(
          value.edgeRadius / CONFIG.SYSTEM_EDGE_RADIUS_FACTOR
        );
        for (const moon of planet.moons) {
          expect(Math.hypot(moon.systemX, moon.systemY)).toBeLessThan(
            value.edgeRadius / CONFIG.SYSTEM_EDGE_RADIUS_FACTOR
          );
        }
      }
    }
    expect(value.getOrbitCenter({ kind: 'circumbinary' })).not.toEqual(initialCentre);
    expect(value.planets.some((planet) => planet?.orbitHost.kind === 'circumbinary')).toBe(true);
  });

  it('keeps eccentric AB and C motions bound to their barycentres at periapsis and apoapsis', () => {
    const architecture = triple();
    architecture.stars[1].orbit!.angle = 0;
    architecture.stars[1].orbit!.eccentricity = 0.32;
    architecture.stars[1].orbit!.argumentOfPeriapsis = 0.7;
    architecture.stars[2].orbit!.angle = 0;
    architecture.stars[2].orbit!.eccentricity = 0.22;
    architecture.stars[2].orbit!.argumentOfPeriapsis = 1.4;
    const value = system(architecture, 'eccentric-triple-phases');
    const [a, b, c] = value.stars;
    const totalMass = a.massKg + b.massKg + c.massKg;

    for (const [meanAnomaly, innerFactor, outerFactor] of [
      [0, 0.68, 0.78],
      [Math.PI, 1.32, 1.22],
    ]) {
      a.orbit!.angle = meanAnomaly;
      b.orbit!.angle = meanAnomaly;
      c.orbit!.angle = meanAnomaly;
      value.updateOrbits(0);
      const abCentre = value.getOrbitCenter({ kind: 'circumbinary' });
      expect(Math.hypot(a.systemX - b.systemX, a.systemY - b.systemY)).toBeCloseTo(
        value.architecture.binarySeparation * innerFactor,
        -1
      );
      expect(Math.hypot(c.systemX - abCentre.x, c.systemY - abCentre.y)).toBeCloseTo(
        value.architecture.outerSeparation * outerFactor,
        -1
      );
      expect(
        value.stars.reduce((sum, item) => sum + item.massKg * item.systemX, 0) / (totalMass * AU_IN_METERS)
      ).toBeCloseTo(0, 10);
      expect(
        value.stars.reduce((sum, item) => sum + item.massKg * item.systemY, 0) / (totalMass * AU_IN_METERS)
      ).toBeCloseTo(0, 10);
    }

    const oldAnomaly = b.orbit!.angle;
    value.updateOrbits(1);
    const scaledSeconds = (365.25 * 86400) / (4 * 3600);
    expect(b.orbit!.angle - oldAnomaly).toBeCloseTo(
      (2 * Math.PI * scaledSeconds) / b.orbit!.periodSeconds,
      10
    );
  });

  it('tightens eccentric binary and triple planet zones using closest approaches', () => {
    const circular = triple();
    const eccentric = triple();
    eccentric.stars[1].orbit!.eccentricity = 0.32;
    eccentric.stars[2].orbit!.eccentricity = 0.22;
    for (const host of [
      { kind: 'circumstellar', starId: 'A' } as const,
      { kind: 'circumstellar', starId: 'C' } as const,
      { kind: 'circumbinary' } as const,
    ]) {
      const baseline = getStableOrbitRange(circular, host)!;
      const tighter = getStableOrbitRange(eccentric, host)!;
      expect(tighter.maxRadius).toBeLessThan(baseline.maxRadius);
      if (host.kind === 'circumbinary') expect(tighter.minRadius).toBeGreaterThan(baseline.minRadius);
    }
    const outerCircular = getStableOrbitRange(circular, { kind: 'barycentric' })!;
    const outerEccentric = getStableOrbitRange(eccentric, { kind: 'barycentric' })!;
    expect(outerEccentric.minRadius).toBeGreaterThan(outerCircular.minRadius);
  });

  it('bounds moons by the binary components and the tertiary at closest approach', () => {
    const architecture = triple();
    const mass = 1.898e27;
    const radius = 1 * AU_IN_METERS;
    const abMass = architecture.stars[0].massKg + architecture.stars[1].massKg;
    const nominal = radius * Math.cbrt(mass / (3 * abMass));
    const circular = getConservativeSatelliteHillRadius(architecture, { kind: 'circumbinary' }, radius, mass);
    expect(circular).toBeGreaterThan(0);
    expect(circular).toBeLessThan(nominal);

    architecture.stars[1].orbit!.eccentricity = 0.32;
    architecture.stars[2].orbit!.eccentricity = 0.22;
    const eccentric = getConservativeSatelliteHillRadius(
      architecture,
      { kind: 'circumbinary' },
      radius,
      mass
    );
    expect(eccentric).toBeLessThan(circular);
    for (const [host, distance, hostMass] of [
      [{ kind: 'circumstellar', starId: 'A' } as const, 0.04 * AU_IN_METERS, architecture.stars[0].massKg],
      [{ kind: 'circumstellar', starId: 'C' } as const, 2 * AU_IN_METERS, architecture.stars[2].massKg],
      [
        { kind: 'barycentric' } as const,
        150 * AU_IN_METERS,
        architecture.stars.reduce((sum, star) => sum + star.massKg, 0),
      ],
    ] as const) {
      const bound = getConservativeSatelliteHillRadius(architecture, host, distance, mass);
      expect(bound).toBeGreaterThan(0);
      expect(bound).toBeLessThan(distance * Math.cbrt(mass / (3 * hostMass)));
    }
    expect(getConservativeSatelliteHillRadius(architecture, { kind: 'circumbinary' }, 0, mass)).toBe(0);
  });

  it('uses the AB host for depot motion, periods and stable orbital placement', () => {
    const value = system(triple(), 'depot-hierarchy', true);
    const depot = value.starbase!;
    const oldAngle = depot.orbitAngle;
    const abMass = value.stars[0].massKg + value.stars[1].massKg;
    const period = 2 * Math.PI * Math.sqrt(depot.orbitDistance ** 3 / (GRAVITATIONAL_CONSTANT_G * abMass));
    const scaledSeconds = (365.25 * 86400) / (4 * 3600);
    expect(depot.orbitHost).toEqual({ kind: 'circumbinary' });
    expect(isOrbitWithinStableRange(value.architecture, depot.orbitHost, depot.orbitDistance)).toBe(true);
    value.updateOrbits(1);
    expect(depot.orbitAngle).toBeCloseTo(
      (oldAngle + (2 * Math.PI * scaledSeconds) / period) % (2 * Math.PI),
      10
    );
    const centre = value.getOrbitCenter(depot.orbitHost);
    expect(Math.hypot(depot.systemX - centre.x, depot.systemY - centre.y) / AU_IN_METERS).toBeCloseTo(
      depot.orbitDistance / AU_IN_METERS,
      10
    );
  });

  it('does not fabricate a primary fallback beyond the supported generation region', () => {
    const architecture = triple();
    architecture.kind = 'binary';
    architecture.stars.pop();
    architecture.binarySeparation = 200 * AU_IN_METERS;
    architecture.outerSeparation = 0;
    const value = system(architecture);
    expect(value.planets.some((planet) => planet?.orbitHost.kind === 'circumbinary')).toBe(false);
    expect(value.planets.some(Boolean)).toBe(true);
  });

  it('uses combined host mass to bound circumbinary moons and screens all generated planets', () => {
    let moonCount = 0;
    for (let index = 0; index < 12; index++) {
      const value = system(triple(), `moon-hierarchy-${index}`);
      for (const planet of value.planets) {
        if (!planet) continue;
        expect(isOrbitWithinStableRange(value.architecture, planet.orbitHost, planet.orbitDistance)).toBe(
          true
        );
        const hillRadius = getConservativeSatelliteHillRadius(
          value.architecture,
          planet.orbitHost,
          planet.orbitDistance,
          planet.mass
        );
        const fraction = ['GasGiant', 'IceGiant'].includes(planet.type) ? 0.42 : 0.32;
        for (const moon of planet.moons) {
          expect(moon.orbitDistance).toBeLessThanOrEqual(hillRadius * fraction);
          expect(moon.orbitHost).toEqual(planet.orbitHost);
          expect(moon.orbitalInclination).toBeLessThanOrEqual(Math.PI / 18);
          expect(moon.mass).toBeLessThan(planet.mass);
          expect(moon.atmosphere.pressure).toBeGreaterThanOrEqual(0);
          expect(
            Object.values(moon.atmosphere.composition).reduce((sum, percent) => sum + percent, 0)
          ).toBeCloseTo(100, 8);
          if (moon.atmosphere.density === 'None') expect(moon.atmosphere.pressure).toBe(0);
          moonCount++;
        }
      }
    }
    expect(moonCount).toBeGreaterThan(0);
  });

  it('screens A/B, AB, C and whole-triple orbits against the appropriate hierarchy', () => {
    const architecture = triple();
    architecture.stars.forEach((item) => {
      item.massKg = SOLAR_MASS_KG;
    });
    const ab = getStableOrbitRange(architecture, { kind: 'circumbinary' })!;
    // Circular equal-mass HW P-type boundary: 2.3875 a, plus the declared 10% margin.
    expect(ab.minRadius / architecture.binarySeparation).toBeCloseTo(2.3875 * 1.1, 10);
    expect(ab.maxRadius / architecture.outerSeparation).toBeCloseTo((0.464 - 0.38 / 3) * 0.9, 10);
    const c = getStableOrbitRange(architecture, { kind: 'circumstellar', starId: 'C' })!;
    expect(c.maxRadius / architecture.outerSeparation).toBeCloseTo((0.464 - (0.38 * 2) / 3) * 0.9, 10);
    expect(isOrbitWithinStableRange(architecture, { kind: 'circumbinary' }, 30 * AU_IN_METERS)).toBe(false);
    expect(isOrbitWithinStableRange(architecture, { kind: 'circumstellar', starId: 'C' }, AU_IN_METERS)).toBe(
      true
    );
    expect(isOrbitWithinStableRange(architecture, { kind: 'circumstellar', starId: 'A' }, AU_IN_METERS)).toBe(
      false
    );
    expect(isOrbitWithinStableRange(architecture, { kind: 'barycentric' }, 150 * AU_IN_METERS)).toBe(true);
  });
});
