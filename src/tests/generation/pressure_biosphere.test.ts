import { describe, expect, it } from 'vitest';
import {
  supportsPressureCommunity,
  generatePressureCommunity,
} from '../../entities/biology/pressure_biosphere';
import { createBiologyEnvironment, generateBiosphere } from '../../entities/biology/biosphere_generator';
import { Planet } from '../../entities/planet';
import type { SolarSystem } from '../../entities/solar_system';
import { AU_IN_METERS } from '../../constants/physics';
import { validateSpecies } from '../../entities/biology/biology_validation';
import { createEncounter } from '../../systems/surface_encounter_system';
import { pressureBiologyFixture } from '../fixtures/biology';
import { PRNG } from '../../utils/prng';

describe('pressure-tolerant water colonies', () => {
  it('reads generated reference flux and actual partial pressure without depending on animation phase', () => {
    const planet = new Planet(
      'Reference I',
      'Rock',
      AU_IN_METERS,
      0,
      new PRNG('reference-flux'),
      'G2V',
      undefined,
      undefined,
      undefined,
      0,
      0,
      800
    );
    // Fix environmental inputs independently of the procedural world's incidental atmosphere.
    Object.assign(planet, {
      surfaceTemp: 300,
      hydrosphere: 'Connected shallow seas',
      gravity: 1,
      atmosphere: {
        density: 'Superdense',
        pressure: 20,
        composition: { Nitrogen: 99.995, 'Carbon Dioxide': 0.005 },
      },
    });
    const system = { starX: 12, starY: -9, systemSlot: 1, ageGyr: 4 } as SolarSystem;
    const first = createBiologyEnvironment(planet, system, 'planet:0');
    expect(first.stellarFluxWm2).toBe(800);
    expect(first.carbonDioxideBar).toBeCloseTo(0.001);
    expect(first.waterCoverage).toBe(0.42);
    expect(supportsPressureCommunity(first)).toBe(true);
    planet.orbitAngle = Math.PI;
    planet.systemX = -AU_IN_METERS;
    expect(createBiologyEnvironment(planet, system, 'planet:0')).toEqual(first);
    Object.assign(planet, { surfaceTemp: 200 });
    expect(createBiologyEnvironment(planet, system, 'planet:0').waterCoverage).toBe(0);
  });
  it('screens actual liquid water, energy, carbon inventory and a bounded native envelope', () => {
    const e = pressureBiologyFixture();
    expect(supportsPressureCommunity(e)).toBe(true);
    for (const patch of [
      { origin: 'introduced' as const },
      { landable: false },
      { waterCoverage: 0 },
      { temperatureK: 279 },
      { temperatureK: 331 },
      { pressureBar: 7.99 },
      { pressureBar: 30.01 },
      { stellarFluxWm2: 0 },
      { stellarFluxWm2: undefined },
      { stellarFluxWm2: 3001 },
      { carbonDioxideBar: 0 },
      { carbonDioxideBar: 0.101 },
    ])
      expect(supportsPressureCommunity({ ...e, ...patch })).toBe(false);
    expect(supportsPressureCommunity({ ...e, pressureBar: 8, temperatureK: 280, stellarFluxWm2: 20 })).toBe(
      true
    );
    expect(
      supportsPressureCommunity({ ...e, pressureBar: 30, temperatureK: 330, stellarFluxWm2: 3000 })
    ).toBe(true);
  });

  it('generates coherent, deterministic colonial samples with producers and small non-predatory recyclers', () => {
    const e = pressureBiologyFixture();
    const species = generatePressureCommunity(e, new PRNG(e.seed));
    expect(species).toEqual(generatePressureCommunity(e, new PRNG(e.seed)));
    expect(new Set(species.map((entry) => entry.id)).size).toBe(4);
    expect(species.filter((entry) => entry.metabolism === 'autotroph')).toHaveLength(2);
    expect(species.filter((entry) => entry.metabolism === 'heterotroph')).toHaveLength(2);
    for (const entry of species) {
      expect(entry.behaviour).toBe('sessile');
      expect(entry.susceptibility).toBe(0);
      expect(entry.massKg).toBeGreaterThanOrEqual(0.04);
      expect(entry.massKg).toBeLessThanOrEqual(0.45);
      expect(entry.preservation).toEqual({ solvent: 'water', retainsSubstrate: true });
      expect(entry.respiration).toBe('anaerobic');
      expect(() => validateSpecies(entry)).not.toThrow();
    }
    const bio = { id: e.bodyId, bodyName: e.bodyName, origin: e.origin, species, sites: [] };
    const field = createEncounter(bio, {
      id: `${e.bodyId}/site:1,1`,
      x: 1,
      y: 1,
      label: 'Wet margin',
      habitat: {
        version: 1,
        kind: 'moist-margin',
        description: 'Wet margin',
        relief: 0.02,
        waterDistanceCells: 1,
      },
    });
    expect(field).toEqual(createEncounter(bio, field.site));
    expect(field.individuals.length).toBeGreaterThanOrEqual(3);
    expect(field.species.some((entry) => entry.metabolism === 'autotroph')).toBe(true);
    expect(
      field.individuals.every(
        (actor) => field.species.find((entry) => entry.id === actor.speciesId)?.behaviour === 'sessile'
      )
    ).toBe(true);
  });

  it('keeps occurrence probabilistic, allowing only the screened community beyond ordinary pressure limits', () => {
    let inhabited = 0;
    for (let index = 0; index < 80; index++) {
      const e = pressureBiologyFixture({ seed: `pressure-${index}`, pressureBar: 20 });
      const biosphere = generateBiosphere(e);
      expect(generateBiosphere(e)).toEqual(biosphere);
      if (biosphere) {
        inhabited++;
        expect(biosphere.species.every((entry) => entry.preservation?.retainsSubstrate)).toBe(true);
      }
      expect(generateBiosphere({ ...e, stellarFluxWm2: 0 })).toBeNull();
      expect(generateBiosphere({ ...e, carbonDioxideBar: 5 })).toBeNull();
      expect(generateBiosphere({ ...e, ageGyr: 0.1 })).toBeNull();
    }
    expect(inhabited).toBeGreaterThan(0);
    expect(inhabited).toBeLessThan(80);
  });
});
