import { describe, expect, it } from 'vitest';
import { PRNG } from '../utils/prng';
import { SystemDataGenerator } from './system_data_generator';

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
});
