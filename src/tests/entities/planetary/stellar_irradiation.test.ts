import { describe, expect, it } from 'vitest';
import {
  estimateAtmosphereIrradiation,
  calculateAtmosphereIrradiationAt,
} from '../../../entities/planet/stellar_irradiation';
import { generateAtmosphereInventory } from '../../../entities/planet/atmosphere_generator';
import {
  estimateMainSequenceLifetimeGyr,
  getDefaultStellarEnvironment,
} from '../../../entities/stellar_environment';
import type { StellarBody } from '../../../entities/stellar_body';
import { PRNG } from '../../../utils/prng';

/** Isolates spectrum and distance without invoking procedural architecture generation. */
function star(id: StellarBody['id'], starType: string, x: number, ageGyr = 4.6): StellarBody {
  return {
    id,
    name: id,
    starType,
    systemX: x,
    systemY: 0,
    radiusM: 7e8,
    massKg: 2e30,
    luminosityW: 3.828e26,
    orbit: null,
    environment: { starType, ageGyr, metallicityFeH: 0 },
  };
}

describe('stellar atmosphere irradiation', () => {
  it('uses plausible default main-sequence ages even for short-lived O/B stars', () => {
    for (const type of ['O', 'B', 'A', 'F3V', 'G2V', 'K5V', 'M7V']) {
      expect(getDefaultStellarEnvironment(type).ageGyr).toBeGreaterThan(0);
      expect(getDefaultStellarEnvironment(type).ageGyr).toBeLessThan(estimateMainSequenceLifetimeGyr(type));
    }
    for (const type of ['B5III', 'O5III', 'B1Ia', 'WN']) {
      expect(getDefaultStellarEnvironment(type).ageGyr).toBeLessThan(0.2);
    }
  });

  it('distinguishes spectral high-energy output at equal bolometric irradiation', () => {
    const g = estimateAtmosphereIrradiation(star('A', 'G', 0).environment, 1361);
    const m = estimateAtmosphereIrradiation(star('A', 'M', 0).environment, 1361);
    const o = estimateAtmosphereIrradiation(star('A', 'O', 0, 0.002).environment, 1361);
    expect(m.highEnergyFluxWm2).toBeGreaterThan(g.highEnergyFluxWm2);
    expect(m.lifetimeMeanHighEnergyFluxWm2).toBeGreaterThan(g.lifetimeMeanHighEnergyFluxWm2);
    expect(o.highEnergyFluxWm2).toBeGreaterThan(m.highEnergyFluxWm2);
  });

  it('remembers early active phases after a cool star has aged', () => {
    const young = estimateAtmosphereIrradiation(star('A', 'G', 0, 0.02).environment, 1361);
    const old = estimateAtmosphereIrradiation(star('A', 'G', 0, 8).environment, 1361);
    expect(young.highEnergyFluxWm2).toBeGreaterThan(old.highEnergyFluxWm2);
    expect(old.lifetimeMeanHighEnergyFluxWm2).toBeGreaterThan(old.highEnergyFluxWm2);
    expect(young.lifetimeMeanHighEnergyFluxWm2).toBeCloseTo(young.highEnergyFluxWm2, 8);
  });

  it('sums all three stars independently and respects inverse-square distance', () => {
    const stars = [star('A', 'G', 0), star('B', 'M', -1e11), star('C', 'B', 8e11, 0.02)];
    const total = calculateAtmosphereIrradiationAt(stars, 1.5e11, 0);
    const parts = stars.map((body) => calculateAtmosphereIrradiationAt([body], 1.5e11, 0));
    expect(total.highEnergyFluxWm2).toBeCloseTo(
      parts.reduce((sum, part) => sum + part.highEnergyFluxWm2, 0),
      10
    );
    expect(total.lifetimeMeanHighEnergyFluxWm2).toBeCloseTo(
      parts.reduce((sum, part) => sum + part.lifetimeMeanHighEnergyFluxWm2, 0),
      10
    );
    expect(calculateAtmosphereIrradiationAt([stars[0]], 3e11, 0).highEnergyFluxWm2).toBeCloseTo(
      parts[0].highEnergyFluxWm2 / 4,
      10
    );
    expect(calculateAtmosphereIrradiationAt([], 0, 0).highEnergyFluxWm2).toBe(0);
  });

  it('makes atmosphere retention probabilistically harsher around active M stars at equal heating', () => {
    let solarPressure = 0;
    let dwarfPressure = 0;
    let dwarfSurvivors = 0;
    for (let i = 0; i < 64; i++) {
      const atmospheres = ['G', 'M'].map((type) =>
        generateAtmosphereInventory(
          new PRNG(`paired-stars-${i}`),
          'Rock',
          0.8,
          9000,
          type,
          1.496e11,
          { starType: type, ageGyr: 4.6, metallicityFeH: 0 },
          { totalFluxWm2: 1361, temperatureK: 255 }
        )
      );
      solarPressure += atmospheres[0].pressure;
      dwarfPressure += atmospheres[1].pressure;
      if (atmospheres[1].pressure > 0.01) dwarfSurvivors++;
    }
    expect(dwarfPressure).toBeLessThan(solarPressure);
    expect(dwarfSurvivors).toBeGreaterThan(0);
    expect(dwarfSurvivors).toBeLessThan(64);
  });
});
