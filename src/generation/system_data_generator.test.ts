import { describe, expect, it } from 'vitest';
import { PRNG } from '../utils/prng';
import { SystemDataGenerator } from './system_data_generator';
import { SolarSystem } from '../entities/solar_system';
import { CONFIG } from '../config';

function findGeneratedSystem(generator: SystemDataGenerator): { x: number; y: number } {
  for (let y = -80; y <= 80; y++) {
    for (let x = -80; x <= 80; x++) {
      const props = generator.getSystemProperties(x, y);
      if (props.exists) return { x, y };
    }
  }
  throw new Error('Expected at least one generated system in search window.');
}

describe('SystemDataGenerator', () => {
  it('returns stable cached system properties and can rebuild them after clearing cache', () => {
    const generator = new SystemDataGenerator(new PRNG('system-cache-regression'));
    const first = generator.getSystemProperties(12, -34);
    const cached = generator.getSystemProperties(12, -34);
    generator.clearCache();
    const rebuilt = generator.getSystemProperties(12, -34);

    expect(cached).toBe(first);
    expect(rebuilt).toEqual(first);
  });

  it('generates deterministic stellar evolution properties for systems', () => {
    const firstGenerator = new SystemDataGenerator(new PRNG('system-data-test'));
    const secondGenerator = new SystemDataGenerator(new PRNG('system-data-test'));
    const { x, y } = findGeneratedSystem(firstGenerator);

    const first = firstGenerator.getSystemProperties(x, y);
    const second = secondGenerator.getSystemProperties(x, y);

    expect(first).toEqual(second);
    expect(first.exists).toBe(true);
    expect(first.starType).toMatch(/^[OBAFGKM](\dV)?$/);
    expect(first.architecture).toBeTruthy();
    expect(first.architecture!.stars.length).toBeGreaterThanOrEqual(1);
    expect(first.architecture!.stars.length).toBeLessThanOrEqual(3);
    expect(first.architecture!.stars[0].starType).toBe(first.starType);
    expect(first.name).toBeTruthy();
    expect(first.ageGyr).toBeGreaterThan(0);
    expect(first.ageGyr).toBeLessThanOrEqual(13.2);
    expect(first.metallicityFeH).toBeGreaterThanOrEqual(-1.75);
    expect(first.metallicityFeH).toBeLessThanOrEqual(0.55);
  });

  it('leaves stellar details empty when no system exists', () => {
    const generator = new SystemDataGenerator(new PRNG('system-data-empty-test'));
    let empty = generator.getSystemProperties(0, 0);
    for (let coordinate = 1; empty.exists && coordinate < 200; coordinate++) {
      empty = generator.getSystemProperties(coordinate, -coordinate);
    }

    expect(empty.exists).toBe(false);
    expect(empty.starType).toBeNull();
    expect(empty.architecture).toBeNull();
    expect(empty.ageGyr).toBeNull();
    expect(empty.metallicityFeH).toBeNull();
  });

  it('still produces Jovian worlds across a representative sector', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    const counts: Record<string, number> = {};
    let systems = 0;

    for (let y = -40; y <= 40; y++) {
      for (let x = -40; x <= 40; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        systems++;
        const system = new SolarSystem(props, x, y, seed);
        for (const planet of system.planets) {
          if (!planet) continue;
          counts[planet.type] = (counts[planet.type] ?? 0) + 1;
        }
      }
    }

    expect(systems).toBeGreaterThan(0);
    expect(counts.GasGiant ?? 0).toBeGreaterThan(0);
    expect((counts.GasGiant ?? 0) + (counts.IceGiant ?? 0)).toBeGreaterThan(5);
  });

  it('keeps sector-level discovery pacing within playable bounds', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let systems = 0;
    let starbases = 0;
    let systemsWithPlanets = 0;
    let planets = 0;
    let giants = 0;
    const sectorCells = 101 * 101;

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        systems++;
        if (props.hasStarbase) starbases++;
        const system = new SolarSystem(props, x, y, seed);
        const systemPlanets = system.planets.filter((planet) => planet !== null);
        if (systemPlanets.length > 0) systemsWithPlanets++;
        planets += systemPlanets.length;
        giants += systemPlanets.filter((planet) => planet.type === 'GasGiant' || planet.type === 'IceGiant').length;
      }
    }

    const starDensity = systems / sectorCells;
    const starbaseRate = starbases / systems;
    const averagePlanets = planets / systems;
    const giantRate = giants / planets;

    expect(starDensity).toBeGreaterThan(CONFIG.STAR_DENSITY * 0.65);
    expect(starDensity).toBeLessThan(CONFIG.STAR_DENSITY * 1.35);
    expect(starbaseRate).toBeGreaterThan(0.005);
    expect(starbaseRate).toBeLessThan(0.075);
    expect(systemsWithPlanets).toBe(systems);
    expect(averagePlanets).toBeGreaterThan(2.5);
    expect(averagePlanets).toBeLessThan(7.5);
    expect(giantRate).toBeGreaterThan(0.08);
    expect(giantRate).toBeLessThan(0.45);
  });

  it('keeps moon systems plausible for parent type and stellar heating', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let giantWithMoons = false;

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);

        for (const planet of system.planets) {
          if (!planet) continue;
          const isGiant = planet.type === 'GasGiant' || planet.type === 'IceGiant';
          const maxMoons = planet.type === 'GasGiant' ? 24 : planet.type === 'IceGiant' ? 14 : 3;
          expect(planet.moons.length).toBeLessThanOrEqual(maxMoons);
          if (planet.surfaceTemp > 390 || planet.orbitDistance < 0.35 * 1.495978707e11) {
            expect(planet.moons.length).toBeLessThanOrEqual(isGiant ? 5 : 1);
          }
          if (isGiant && planet.moons.length >= 4) giantWithMoons = true;
          for (const moon of planet.moons) {
            expect(moon.diameter).toBeLessThan(planet.diameter * (isGiant ? 0.1 : 0.35));
          }
        }
      }
    }

    expect(giantWithMoons).toBe(true);
  });

  it('resolves moon orbital insertion to the parent planet context', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);
        const parent = system.planets.find((planet) => planet && planet.moons.length > 0);
        const moon = parent?.moons[0];
        if (!parent || !moon) continue;

        expect(system.getOrbitParentFor(parent)).toBe(parent);
        expect(system.getOrbitParentFor(moon)).toBe(parent);
        return;
      }
    }

    throw new Error('Expected at least one moon-bearing planet in representative sector.');
  });

  it('resolves moon proximity scans to the parent planet', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);
        const parent = system.planets.find((planet) => planet && planet.moons.length > 0);
        const moon = parent?.moons[0];
        if (!parent || !moon) continue;

        expect(system.getObjectNear(moon.systemX, moon.systemY)).toBe(moon);
        expect(system.getScannableObjectNear(moon.systemX, moon.systemY)).toBe(parent);
        return;
      }
    }

    throw new Error('Expected at least one moon-bearing planet in representative sector.');
  });

  it('generates regular giant-planet moons with tidal locking and low obliquity', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let checkedRegularGiantMoon = false;
    let checkedCapturedLikeMoon = false;

    for (let y = -60; y <= 60; y++) {
      for (let x = -60; x <= 60; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);

        for (const parent of system.planets) {
          if (!parent || (parent.type !== 'GasGiant' && parent.type !== 'IceGiant')) continue;
          const parentRadiusM = parent.diameter * 500;
          for (const moon of parent.moons) {
            const orbitInParentRadii = moon.orbitDistance / parentRadiusM;
            if (orbitInParentRadii < 80) {
              checkedRegularGiantMoon = true;
              expect(moon.tidallyLocked).toBe(true);
              expect((moon.axialTilt * 180) / Math.PI).toBeLessThanOrEqual(4);
              expect((moon.orbitalInclination * 180) / Math.PI).toBeLessThanOrEqual(3);
            } else if (orbitInParentRadii > 250) {
              checkedCapturedLikeMoon = true;
              expect(moon.diameter).toBeLessThan(parent.diameter * 0.1);
            }
          }
        }
      }
    }

    expect(checkedRegularGiantMoon).toBe(true);
    expect(checkedCapturedLikeMoon).toBe(true);
  });
});
