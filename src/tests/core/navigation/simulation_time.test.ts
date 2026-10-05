import { describe, expect, it, vi } from 'vitest';
import { AU_IN_METERS, GRAVITATIONAL_CONSTANT_G, SOLAR_MASS_KG } from '../../../constants/physics';
import {
  calculateStellarLuminosityW,
  type StellarBody,
  type StellarArchitecture,
} from '../../../entities/stellar_body';
import {
  frameToSimulatedSeconds,
  prepareBulkTimeAdvance,
  advanceOrbitalAngle,
} from '../../../core/simulation_time';
import {
  capturePlanetMutations,
  captureSystemOrbit,
  restoreSystemOrbits,
} from '../../../core/system_orbit_state';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';

/** Supplies controlled masses and eccentricities, independent of production galaxy sampling. */
function star(id: StellarBody['id'], mass: number): StellarBody {
  return {
    id,
    name: id,
    starType: 'G',
    massKg: mass,
    radiusM: 7e8,
    luminosityW: calculateStellarLuminosityW('G'),
    systemX: 0,
    systemY: 0,
    orbit: {
      center: 'barycenter',
      radius: 0,
      angle: id === 'B' ? Math.PI : 0,
      periodSeconds: 0,
      eccentricity: 0.2,
    },
    environment: { starType: 'G', ageGyr: 5, metallicityFeH: 0 },
  };
}

/** Exercises actual hierarchical orbital motion, including a moving inner-binary centre. */
function triple(): StellarArchitecture {
  return {
    kind: 'triple',
    stars: [star('A', SOLAR_MASS_KG), star('B', SOLAR_MASS_KG * 0.8), star('C', SOLAR_MASS_KG * 0.5)],
    primaryStarId: 'A',
    binarySeparation: 12 * AU_IN_METERS,
    outerSeparation: 150 * AU_IN_METERS,
    habitableLabel: 'A',
  };
}

describe('explicit simulation time', () => {
  it('retains four real hours per Julian year and adds bulk seconds without a second acceleration', () => {
    expect(frameToSimulatedSeconds(4 * 60 * 60)).toBe(365.25 * 24 * 60 * 60);
    expect(frameToSimulatedSeconds(0)).toBe(0);
    expect(frameToSimulatedSeconds(-1)).toBe(0);
    expect(frameToSimulatedSeconds(NaN)).toBe(0);
    const snapshot = { gameClockElapsedSeconds: 123, bulkAdvanceSeconds: 10 };
    expect(prepareBulkTimeAdvance(snapshot, 100)).toEqual({
      gameClockElapsedSeconds: 223,
      bulkAdvanceSeconds: 110,
    });
    expect(snapshot).toEqual({ gameClockElapsedSeconds: 123, bulkAdvanceSeconds: 10 });
    for (const seconds of [-1, 0, NaN, Infinity])
      expect(() => prepareBulkTimeAdvance(snapshot, seconds)).toThrow();
    expect(() => prepareBulkTimeAdvance({ gameClockElapsedSeconds: 1, bulkAdvanceSeconds: 2 }, 1)).toThrow();
    expect(() => prepareBulkTimeAdvance(snapshot, Number.MAX_VALUE)).toThrow();
  });

  it('matches frame orbital updates for the same simulated interval, without consuming generation randomness', () => {
    const address = { worldX: 100, worldY: 0, systemSlot: 0 };
    const blueprint = triple();
    const generation = JSON.stringify(blueprint);
    const a = haulSystemFixture(address, blueprint);
    const b = haulSystemFixture(address, blueprint);
    a.updateOrbits(12);
    b.advanceOrbitsBySimulatedSeconds((12 * (365.25 * 86400)) / 14400);
    expect(captureSystemOrbit(b)).toEqual(captureSystemOrbit(a));
    expect(capturePlanetMutations(b)).toEqual(capturePlanetMutations(a));
    expect(JSON.stringify(blueprint)).toBe(generation);
  });

  it('advances centuries analytically while maintaining multi-star centres and body radii', () => {
    const system = haulSystemFixture({ worldX: 0, worldY: 0, systemSlot: 0 }, triple());
    const seconds = 100 * 365.25 * 86400;
    const planets = system.planets.filter((body) => body !== null);
    expect(planets.length).toBeGreaterThan(0);
    const phases = new Map(planets.map((body) => [body, body.orbitAngle]));
    const calculate = vi.spyOn(system as any, 'calculateKeplerPeriodSeconds');
    system.advanceOrbitsBySimulatedSeconds(86400);
    const dailyCalls = calculate.mock.calls.length;
    calculate.mockClear();
    const beforeCentury = new Map(planets.map((body) => [body, body.orbitAngle]));
    system.advanceOrbitsBySimulatedSeconds(seconds);
    expect(calculate.mock.calls.length).toBe(dailyCalls);
    const totalMass = system.stars.reduce((sum, body) => sum + body.massKg, 0);
    expect(
      Math.abs(system.stars.reduce((sum, body) => sum + body.systemX * body.massKg, 0) / totalMass)
    ).toBeLessThan(0.01);
    expect(
      Math.abs(system.stars.reduce((sum, body) => sum + body.systemY * body.massKg, 0) / totalMass)
    ).toBeLessThan(0.01);
    for (const body of planets) {
      const center = system.getOrbitCenter(body.orbitHost);
      expect(Math.hypot(body.systemX - center.x, body.systemY - center.y) / body.orbitDistance).toBeCloseTo(
        1,
        10
      );
      const hostMass =
        body.orbitHost.kind === 'circumstellar'
          ? system.stars.find((star) => star.id === body.orbitHost.starId)!.massKg
          : body.orbitHost.kind === 'circumbinary'
            ? system.stars
                .filter((star) => star.id === 'A' || star.id === 'B')
                .reduce((sum, star) => sum + star.massKg, 0)
            : totalMass;
      const period =
        2 *
        Math.PI *
        Math.sqrt(body.orbitDistance ** 3 / (GRAVITATIONAL_CONSTANT_G * (hostMass + body.mass)));
      expect(body.orbitAngle).toBeCloseTo(advanceOrbitalAngle(beforeCentury.get(body)!, seconds, period), 9);
      expect(Number.isFinite(body.orbitAngle)).toBe(true);
      expect(body.orbitAngle).not.toBe(phases.get(body));
      for (const moon of body.moons)
        expect(
          Math.hypot(moon.systemX - body.systemX, moon.systemY - body.systemY) / moon.orbitDistance
        ).toBeCloseTo(1, 8);
    }
    if (system.starbase) {
      const center = system.getOrbitCenter(system.starbase.orbitHost);
      expect(
        Math.hypot(system.starbase.systemX - center.x, system.starbase.systemY - center.y) /
          system.starbase.orbitDistance
      ).toBeCloseTo(1, 10);
    }
    const before = captureSystemOrbit(system);
    expect(() => system.advanceOrbitsBySimulatedSeconds(NaN)).toThrow();
    expect(() => system.advanceOrbitsBySimulatedSeconds(-1)).toThrow();
    expect(() => system.advanceOrbitsBySimulatedSeconds(10, new Map([[planets[0], -1]]))).toThrow();
    expect(captureSystemOrbit(system)).toEqual(before);
  });

  it('applies only missing bulk time on regeneration/reload, including mixed legacy body epochs', () => {
    const address = { worldX: 100, worldY: 0, systemSlot: 0 };
    const original = haulSystemFixture(address, triple());
    original.advanceOrbitsBySimulatedSeconds(100);
    original.lastAppliedBulkSeconds = 100;
    const orbit = captureSystemOrbit(original);
    const bodies = capturePlanetMutations(original);
    const restored = haulSystemFixture(address, triple());
    restoreSystemOrbits(restored, orbit, bodies, 200);
    original.advanceOrbitsBySimulatedSeconds(100);
    original.lastAppliedBulkSeconds = 200;
    expect(captureSystemOrbit(restored)).toEqual(captureSystemOrbit(original));
    expect(capturePlanetMutations(restored)).toEqual(capturePlanetMutations(original));
    const once = captureSystemOrbit(restored);
    const onceBodies = capturePlanetMutations(restored);
    restoreSystemOrbits(restored, once, onceBodies, 200);
    expect(captureSystemOrbit(restored)).toEqual(once);
    expect(capturePlanetMutations(restored)).toEqual(onceBodies);
    const mixed = haulSystemFixture(address, triple());
    restoreSystemOrbits(mixed, undefined, onceBodies, 200);
    for (const star of mixed.stars) {
      const expected = restored.stars.find((entry) => entry.id === star.id)!;
      expect(star.orbit!.angle).toBeCloseTo(expected.orbit!.angle, 10);
      expect(star.systemX / AU_IN_METERS).toBeCloseTo(expected.systemX / AU_IN_METERS, 10);
      expect(star.systemY / AU_IN_METERS).toBeCloseTo(expected.systemY / AU_IN_METERS, 10);
    }
    expect(capturePlanetMutations(mixed).map((entry) => entry.orbitAngle)).toEqual(
      onceBodies.map((entry) => entry.orbitAngle)
    );
    const mixedBefore = captureSystemOrbit(mixed);
    expect(() => restoreSystemOrbits(mixed, once, onceBodies, 199)).toThrow('epoch');
    expect(captureSystemOrbit(mixed)).toEqual(mixedBefore);
  });
});
