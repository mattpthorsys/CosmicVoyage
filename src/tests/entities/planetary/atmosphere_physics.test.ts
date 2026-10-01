import { describe, expect, it } from 'vitest';
import {
  AIRLESS,
  atmosphereDensity,
  atmosphereFromPartialPressures,
  condenseAtmosphere,
  greenhouseTemperatureFactor,
  jeansParameter,
  saturationPressureBar,
} from '../../../entities/planet/atmosphere_physics';
import {
  generateAtmosphere,
  generateAtmosphereInventory,
} from '../../../entities/planet/atmosphere_generator';
import { generatePlanetCharacteristics } from '../../../entities/planet/planet_characteristics_generator';
import { resolveAtmosphereClimate } from '../../../entities/planet/atmosphere_climate';
import { calculateTemperatureProfile } from '../../../entities/planet/temperature_calculator';
import { PRNG } from '../../../utils/prng';
import type { Atmosphere } from '../../../entities/planet';

const sun = { starType: 'G', ageGyr: 4.6, metallicityFeH: 0 };

/** Checks unit and conservation contracts shared by scanners, climate and atmospheric rendering. */
function expectValidAtmosphere(atmosphere: Atmosphere): void {
  expect(Number.isFinite(atmosphere.pressure)).toBe(true);
  expect(atmosphere.pressure).toBeGreaterThanOrEqual(0);
  expect(atmosphere.density).toBe(atmosphereDensity(atmosphere.pressure));
  expect(Object.values(atmosphere.composition).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 8);
  for (const percent of Object.values(atmosphere.composition)) {
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThanOrEqual(100);
  }
  if (atmosphere.density === 'None') expect(atmosphere).toEqual(AIRLESS);
}

describe('atmosphere physics', () => {
  it('derives every density label from pressure, including vacuum and trace gas', () => {
    for (const [pressure, label] of [
      [0, 'None'],
      [1e-6, 'Trace'],
      [0.1, 'Thin'],
      [1, 'Earth-like'],
      [5, 'Thick'],
      [92, 'Superdense'],
    ] as const) {
      expect(atmosphereDensity(pressure)).toBe(label);
    }
  });

  it('reduces pressure when gases condense and conserves the remaining partial pressures', () => {
    const inventory = atmosphereFromPartialPressures({ Nitrogen: 1, 'Water Vapor': 1 });
    const atmosphere = condenseAtmosphere(inventory, 273.16);
    expect(atmosphere.pressure).toBeCloseTo(1.0061166, 5);
    expect((atmosphere.pressure * atmosphere.composition.Nitrogen) / 100).toBeCloseTo(1, 8);
    expectValidAtmosphere(atmosphere);
    expect(condenseAtmosphere(inventory, 8)).toEqual(AIRLESS);
  });

  it('distinguishes Titan-like nitrogen air from Pluto-like frost vapour', () => {
    expect(saturationPressureBar('Nitrogen', 94)).toBeGreaterThan(1.5);
    expect(saturationPressureBar('Nitrogen', 38)).toBeGreaterThan(1e-6);
    expect(saturationPressureBar('Nitrogen', 38)).toBeLessThan(1e-4);
    expect(saturationPressureBar('Methane', 94)).toBeGreaterThan(0.1);
    expect(saturationPressureBar('Carbon Dioxide', 94)).toBeLessThan(1e-6);
  });

  it('scales Jeans binding with mass, escape speed squared and inverse exobase temperature', () => {
    const base = jeansParameter('Nitrogen', 5000, 500);
    expect(jeansParameter('Nitrogen', 10000, 500)).toBeCloseTo(base * 4, 8);
    expect(jeansParameter('Nitrogen', 5000, 1000)).toBeCloseTo(base / 2, 8);
    expect(jeansParameter('Hydrogen', 5000, 500)).toBeLessThan(base / 20);
  });

  it('cannot restore an escaped inventory by normalising a tiny gas fraction', () => {
    expect(atmosphereFromPartialPressures({ Nitrogen: 1e-15 })).toEqual(AIRLESS);
    for (let i = 0; i < 24; i++) {
      const atmosphere = generateAtmosphere(
        new PRNG(`tiny-hot-${i}`),
        'Greenhouse',
        0.01,
        300,
        'G',
        1e10,
        sun,
        { totalFluxWm2: 1e5, temperatureK: 1000 }
      );
      expect(atmosphere.pressure).toBeLessThan(1e-6);
    }
  });

  it('makes greenhouse warming vanish continuously as pressure tends to zero', () => {
    const trace = { density: 'Trace', pressure: 1e-10, composition: { 'Carbon Dioxide': 100 } };
    expect(greenhouseTemperatureFactor(trace)).toBeCloseTo(1, 7);
    expect(greenhouseTemperatureFactor({ ...trace, pressure: 92 })).toBeGreaterThan(2);
    const thin = { ...trace, pressure: 0.5, density: 'Thin' };
    expect(greenhouseTemperatureFactor(thin)).toBe(
      greenhouseTemperatureFactor({ ...thin, density: 'Thick' })
    );
  });

  it('solves climate and condensation together without a new atmosphere roll', () => {
    const inventory = atmosphereFromPartialPressures({
      Nitrogen: 0.8,
      'Carbon Dioxide': 0.01,
      'Water Vapor': 0.05,
    });
    /** Holds illumination fixed while the solver varies the gaseous inventory. */
    const temperatureFor = (atmosphere: Atmosphere) =>
      calculateTemperatureProfile('Rock', 1.496e11, 'G', atmosphere, sun, 1361);
    const result = resolveAtmosphereClimate(inventory, 'Rock', temperatureFor);
    expect(result.temperature).toEqual(temperatureFor(result.atmosphere));
    for (const [gas, percent] of Object.entries(result.atmosphere.composition)) {
      expect((result.atmosphere.pressure * percent) / 100).toBeLessThanOrEqual(
        saturationPressureBar(gas, result.temperature.average + 0.02)
      );
    }
    expect(resolveAtmosphereClimate(inventory, 'Rock', temperatureFor)).toEqual(result);
  });

  it('uses supplied flux rather than mistaking a circumplanetary distance for stellar distance', () => {
    const options = { totalFluxWm2: 15, temperatureK: 90 };
    const near = generateAtmosphere(
      new PRNG('same-irradiation'),
      'Frozen',
      0.14,
      2600,
      'G',
      1e8,
      sun,
      options
    );
    const far = generateAtmosphere(
      new PRNG('same-irradiation'),
      'Frozen',
      0.14,
      2600,
      'G',
      1.4e12,
      sun,
      options
    );
    expect(near).toEqual(far);
  });

  it('keeps giant envelopes hydrogen/helium dominated, including starless planets', () => {
    for (const type of ['GasGiant', 'IceGiant']) {
      for (let i = 0; i < 24; i++) {
        const atmosphere = generateAtmosphere(
          new PRNG(`giant-${type}-${i}`),
          type,
          1.5,
          25000,
          'ROGUE',
          0,
          { ...sun, starType: 'ROGUE' },
          { totalFluxWm2: 0, temperatureK: 25 }
        );
        expectValidAtmosphere(atmosphere);
        expect(atmosphere.composition.Hydrogen).toBeGreaterThan(70);
        expect(atmosphere.composition.Hydrogen + atmosphere.composition.Helium).toBeGreaterThanOrEqual(96);
      }
    }
  });

  it('retains probabilistic outcomes at fixed mass and spectral type', () => {
    const pressures = new Set<number>();
    for (let i = 0; i < 48; i++) {
      const atmosphere = generateAtmosphereInventory(
        new PRNG(`inventory-${i}`),
        'Rock',
        1,
        11200,
        'G',
        1.496e11,
        sun,
        { totalFluxWm2: 1361, temperatureK: 255 }
      );
      expectValidAtmosphere(atmosphere);
      pressures.add(atmosphere.pressure);
    }
    expect(pressures.size).toBeGreaterThan(20);
    expect(pressures.has(0)).toBe(true);
  });

  it('generates consistent mass, pressure and frost limits across physical sizes and illumination', () => {
    for (const diameter of [1000, 5000, 12742]) {
      for (const flux of [0.1, 15, 1361, 30000]) {
        const body = generatePlanetCharacteristics(
          'Frozen',
          1.496e11,
          new PRNG(`audit-${diameter}-${flux}`),
          'G',
          sun,
          flux,
          { physicalBase: { diameter, density: 2 } }
        );
        expectValidAtmosphere(body.atmosphere);
        expect(body.mass).toBeCloseTo((4 / 3) * Math.PI * (diameter * 500) ** 3 * 2000, -10);
        for (const [gas, percent] of Object.entries(body.atmosphere.composition)) {
          if (gas === 'None') continue;
          expect((body.atmosphere.pressure * percent) / 100).toBeLessThanOrEqual(
            saturationPressureBar(gas, body.surfaceTemp + 0.02)
          );
        }
      }
    }
  });
});
