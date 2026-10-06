import { describe, expect, it } from 'vitest';
import { Planet } from '../../entities/planet';
import type { SolarSystem } from '../../entities/solar_system';
import { AU_IN_METERS, SOLAR_LUMINOSITY_W } from '../../constants/physics';
import { PRNG } from '../../utils/prng';
import { createBiologyEnvironment, generateBiosphere } from '../../entities/biology/biosphere_generator';
import { measureObservatoryContact } from '../../core/observatory_measurements';
import { getObservatoryCapabilities } from '../../core/observatory_types';
import { createDefaultShipModifications } from '../../core/ship_modifications';
import { observatoryContactFixture } from '../fixtures/observatory';

/** Builds a controlled physical water world and searches seeded biology without mocking remote measurement. */
function fixture(flux = 1361) {
  const planet = new Planet(
    'Microbial reference',
    'Rock',
    AU_IN_METERS,
    0,
    new PRNG('microbial-spectrum'),
    'G2V'
  );
  Object.assign(planet, {
    atmosphere: {
      pressure: 1,
      density: 'Standard',
      composition: { Nitrogen: 99.96, 'Carbon Dioxide': 0.04 },
    },
    surfaceTemp: 294,
    hydrosphere: 'shallow saline seas',
    diameter: 12_742,
    gravity: 1,
    referenceStellarFluxWm2: flux,
  });
  const system = {
    name: 'Microbial spectrum',
    starX: 1,
    starY: 0,
    systemSlot: 0,
    ageGyr: 4,
    stars: [{ starType: 'G2V', luminosityW: SOLAR_LUMINOSITY_W }],
    planets: [planet],
    stations: [],
    navigationMarkers: [],
    colonyWorld: null,
  } as unknown as SolarSystem;
  let biosphere: ReturnType<typeof generateBiosphere> = null;
  for (let index = 0; index < 800; index++) {
    Object.assign(planet, { mapSeed: `microbial-spectrum-${index}` });
    biosphere = generateBiosphere(createBiologyEnvironment(planet, system, 'planet:0'));
    if (biosphere?.complexity !== 'microbial-only') continue;
    if (flux >= 20 && (biosphere.pigmentCover ?? 0) < 0.35) continue;
    if (new PRNG(planet.mapSeed).seedNew('observatory-reflectance', 1).random() < 0.06) continue;
    break;
  }
  expect(biosphere?.complexity).toBe('microbial-only');
  const ship = createDefaultShipModifications();
  ship.observatoryClass = 3;
  return {
    planet,
    system,
    biosphere: biosphere!,
    capabilities: getObservatoryCapabilities(ship),
    contact: observatoryContactFixture(1),
  };
}

describe('microbial distant signatures', () => {
  it('detects pigment-covered anoxic microbial worlds without inventing gases or revealing complexity', () => {
    const { planet, system, capabilities, contact } = fixture();
    const before = structuredClone(planet.effectiveAtmosphere);
    const result = measureObservatoryContact(contact, system, capabilities, 0, 0, 1, 3);
    expect(result.quality).toBeGreaterThan(0.3);
    expect(result.biology).toBe('candidate');
    expect(result.features.some((feature) => feature.startsWith('Surface reflectance'))).toBe(true);
    expect(
      result.features.some(
        (feature) =>
          feature.startsWith('Oxygen') ||
          feature.includes('single-celled') ||
          feature.includes('microbial-only')
      )
    ).toBe(false);
    expect(result.origin).toBe('unknown');
    expect(planet.effectiveAtmosphere).toEqual(before);
    expect(planet.isSurfaceReady()).toBe(false);
    expect(measureObservatoryContact(contact, system, capabilities, 0, 0, 1, 3)).toEqual(result);
  });

  it('does not turn chemically powered producers into pigment signatures or equate nondetection with sterility', () => {
    const { planet, system, biosphere, capabilities, contact } = fixture(2);
    expect(biosphere.species.some((species) => species.energySource === 'chemical')).toBe(true);
    expect(biosphere.pigmentCover).toBe(0);
    const result = measureObservatoryContact(contact, system, capabilities, 0, 0, 1, 3);
    expect(result.biology).toBe('no-signal');
    expect(result.features.some((feature) => feature.startsWith('Surface reflectance'))).toBe(false);
    expect(result.features.some((feature) => feature.includes('biology is not excluded'))).toBe(true);
    expect(planet.isSurfaceReady()).toBe(false);
  });
});
