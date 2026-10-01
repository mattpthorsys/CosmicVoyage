import { describe, expect, it } from 'vitest';
import { GRAVITATIONAL_CONSTANT_G } from '../../../constants/physics';
import { SolarSystem } from '../../../entities/solar_system';
import { getDefaultStellarEnvironment } from '../../../entities/stellar_environment';
import { atmosphereDensity, saturationPressureBar } from '../../../entities/planet/atmosphere_physics';
import { canAddSatellite, sufficientlySeparated } from '../../../entities/satellite_physics';
import { PRNG } from '../../../utils/prng';
import type { Planet } from '../../../entities/planet';

/** Audits observable state rather than exact generated identities. */
function auditBody(body: Planet): void {
  const radius = body.diameter * 500;
  const mass = (4 / 3) * Math.PI * radius ** 3 * body.density * 1000;
  expect(body.mass / mass).toBeCloseTo(1, 10);
  expect(body.escapeVelocity / Math.sqrt((2 * GRAVITATIONAL_CONSTANT_G * mass) / radius)).toBeCloseTo(1, 10);
  expect(body.gravity / ((GRAVITATIONAL_CONSTANT_G * mass) / radius ** 2 / 9.80665)).toBeCloseTo(1, 3);
  const atmosphere = body.atmosphere;
  expect(atmosphere.density).toBe(atmosphereDensity(atmosphere.pressure));
  expect(Object.values(atmosphere.composition).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 8);
  expect(body.surfaceTempMin).toBeLessThanOrEqual(body.surfaceTemp);
  expect(body.surfaceTempMax).toBeGreaterThanOrEqual(body.surfaceTemp);
  expect(Number.isFinite(body.surfaceTemp)).toBe(true);
  if (atmosphere.density === 'None') expect(atmosphere.pressure).toBe(0);
  if (['GasGiant', 'IceGiant'].includes(body.type)) {
    expect(atmosphere.composition.Hydrogen + atmosphere.composition.Helium).toBeGreaterThanOrEqual(96);
  } else {
    for (const [gas, percent] of Object.entries(atmosphere.composition)) {
      expect((atmosphere.pressure * percent) / 100).toBeLessThanOrEqual(
        saturationPressureBar(gas, body.surfaceTemp + 0.02)
      );
    }
  }
}

describe('generated atmosphere and mass population', () => {
  it('keeps solids, giants and satellites consistent across representative host classes', () => {
    let satellites = 0;
    let giants = 0;
    let solids = 0;
    const report: Record<
      string,
      { solids: number; airless: number; minK: number; maxK: number; maxBar: number }
    > = {};
    for (const starType of ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'L', 'T', 'Y', 'B5III', 'DA5', 'ROGUE']) {
      const summary = { solids: 0, airless: 0, minK: Infinity, maxK: 0, maxBar: 0 };
      for (let seed = 0; seed < 16; seed++) {
        const environment = getDefaultStellarEnvironment(starType);
        const system = new SolarSystem(
          {
            exists: true,
            starType,
            name: `Audit ${starType} ${seed}`,
            ageGyr: environment.ageGyr,
            metallicityFeH: ((seed % 5) - 2) * 0.25,
            hasStarbase: false,
            architecture: null,
            objectKind: starType === 'ROGUE' ? 'rogue-planet' : 'stellar',
          },
          seed,
          42,
          new PRNG(`atmosphere-population-${starType}-${seed}`)
        );
        const planets = system.planets.filter((body): body is Planet => body !== null);
        for (const planet of planets) {
          if (!system.isStarless) {
            expect(planet.mass).toBeLessThan(system.stars[0].massKg * 0.05);
            for (const other of planets) {
              if (other !== planet)
                expect(sufficientlySeparated(planet, other, system.stars[0].massKg)).toBe(true);
            }
          }
          for (const [index, moon] of planet.moons.entries()) {
            expect(
              canAddSatellite({ ...planet, moons: planet.moons.slice(0, index) }, moon, moon.orbitDistance)
            ).toBe(true);
            satellites++;
          }
          for (const body of [planet, ...planet.moons]) {
            auditBody(body);
            if (['GasGiant', 'IceGiant'].includes(body.type)) {
              giants++;
              continue;
            }
            solids++;
            summary.solids++;
            if (body.atmosphere.pressure === 0) summary.airless++;
            summary.minK = Math.min(summary.minK, body.surfaceTemp);
            summary.maxK = Math.max(summary.maxK, body.surfaceTemp);
            summary.maxBar = Math.max(summary.maxBar, body.atmosphere.pressure);
          }
        }
      }
      report[starType] = summary;
    }
    expect(solids).toBeGreaterThan(100);
    expect(giants).toBeGreaterThan(10);
    expect(satellites).toBeGreaterThan(100);
    if (process.env.COSMIC_ATMOSPHERE_REPORT === '1') console.table(report);
  });
});
