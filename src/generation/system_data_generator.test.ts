import { describe, expect, it } from 'vitest';
import { PRNG } from '../utils/prng';
import { SystemDataGenerator } from './system_data_generator';
import { SolarSystem } from '../entities/solar_system';

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
});
