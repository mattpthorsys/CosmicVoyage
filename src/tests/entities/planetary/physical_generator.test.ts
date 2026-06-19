import { describe, expect, it } from 'vitest';
import { PRNG } from '../../../utils/prng';
import { calculateGravity, generatePhysicalBase } from '../../../entities/planet/physical_generator';

describe('planet physical generation', () => {
  const solidExpectations: Record<
    string,
    { diameter: [number, number]; density: [number, number]; gravity: [number, number] }
  > = {
    Molten: { diameter: [4500, 18500], density: [3.8, 7.8], gravity: [0.24, 2.1] },
    Rock: { diameter: [3500, 19000], density: [3.1, 6.8], gravity: [0.15, 1.9] },
    Oceanic: { diameter: [6500, 20000], density: [2.4, 5.2], gravity: [0.22, 1.55] },
    Lunar: { diameter: [900, 6500], density: [1.9, 4.1], gravity: [0.02, 0.4] },
    Frozen: { diameter: [1800, 15000], density: [0.9, 3.6], gravity: [0.02, 0.8] },
  };

  it('generates scientifically plausible solid planet dimensions, densities, and gravities', () => {
    for (const [planetType, expected] of Object.entries(solidExpectations)) {
      for (let index = 0; index < 100; index++) {
        const { diameter, density } = generatePhysicalBase(new PRNG(`${planetType}-${index}`), planetType);
        const gravity = calculateGravity(diameter, density);

        expect(diameter).toBeGreaterThanOrEqual(expected.diameter[0]);
        expect(diameter).toBeLessThanOrEqual(expected.diameter[1]);
        expect(density).toBeGreaterThanOrEqual(expected.density[0]);
        expect(density).toBeLessThanOrEqual(expected.density[1]);
        expect(gravity).toBeGreaterThanOrEqual(expected.gravity[0]);
        expect(gravity).toBeLessThanOrEqual(expected.gravity[1]);
      }
    }
  });

  it('generates scientifically plausible gas giant dimensions and densities', () => {
    for (let index = 0; index < 100; index++) {
      const { diameter, density } = generatePhysicalBase(new PRNG(`gas-${index}`), 'GasGiant');
      const gravity = calculateGravity(diameter, density);

      expect(diameter).toBeGreaterThanOrEqual(74000);
      expect(diameter).toBeLessThanOrEqual(158000);
      expect(density).toBeGreaterThanOrEqual(0.45);
      expect(density).toBeLessThanOrEqual(1.85);
      expect(gravity).toBeGreaterThanOrEqual(0.45);
      expect(gravity).toBeLessThanOrEqual(4.3);
    }
  });

  it('generates scientifically plausible ice giant dimensions and densities', () => {
    for (let index = 0; index < 100; index++) {
      const { diameter, density } = generatePhysicalBase(new PRNG(`ice-${index}`), 'IceGiant');
      const gravity = calculateGravity(diameter, density);

      expect(diameter).toBeGreaterThanOrEqual(30000);
      expect(diameter).toBeLessThanOrEqual(65000);
      expect(density).toBeGreaterThanOrEqual(1.05);
      expect(density).toBeLessThanOrEqual(2.15);
      expect(gravity).toBeGreaterThanOrEqual(0.4);
      expect(gravity).toBeLessThanOrEqual(2.1);
    }
  });
});
