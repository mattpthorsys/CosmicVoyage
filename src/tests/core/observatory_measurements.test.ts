import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { SolarSystem } from '../../entities/solar_system';
import { createBiologyEnvironment, generateBiosphere } from '../../entities/biology/biosphere_generator';
import { PRNG } from '../../utils/prng';
import { measureObservatoryContact } from '../../core/observatory_measurements';
import { createDefaultShipModifications } from '../../core/ship_modifications';
import {
  getObservatoryCapabilities,
  observatoryContactId,
  type ObservatoryContact,
} from '../../core/observatory_types';

/** Constructs the canonical starting colony without requesting any terrain data. */
function fixture(): { system: SolarSystem; contact: ObservatoryContact } {
  const seed = new PRNG('observatory-measurements');
  const generator = new SystemDataGenerator(seed);
  const x = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
  const y = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
  const system = new SolarSystem(generator.getSystemProperties(x, y), x, y, seed);
  const address = { worldX: x, worldY: y, systemSlot: 0 };
  return {
    system,
    contact: {
      ...address,
      id: observatoryContactId(address),
      name: system.name,
      kind: 'system',
      distanceLy: 1,
      system: generator.getSystemMapProperties(x, y),
      phenomenon: null,
      multiplicity: 'single',
    },
  };
}

describe('distant planetary measurements', () => {
  it('requires the installation rather than silently granting biological knowledge', () => {
    const { system, contact } = fixture();
    const capabilities = getObservatoryCapabilities(createDefaultShipModifications());
    expect(
      measureObservatoryContact(contact, system, capabilities, contact.worldX - 1, contact.worldY, 1, 3)
        .biology
    ).toBe('unmeasured');
  });

  it('recognises an actual registered managed world without generating surface maps', () => {
    const { system, contact } = fixture();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 3;
    const result = measureObservatoryContact(
      contact,
      system,
      getObservatoryCapabilities(ship),
      contact.worldX - 1,
      contact.worldY,
      1,
      3
    );
    expect(result.biology).toBe('catalogued');
    expect(result.origin).toBe('managed');
    expect(result.technology).toBe('registered');
    expect(result.features.some((feature) => feature.includes('Oxygen'))).toBe(true);
    expect(system.colonyWorld?.isSurfaceReady()).toBe(false);
  });

  it('retains a documented colony outside atmospheric reach but within registered beacon reach', () => {
    const { system, contact } = fixture();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 1;
    const result = measureObservatoryContact(
      contact,
      system,
      getObservatoryCapabilities(ship),
      contact.worldX - 30,
      contact.worldY,
      1,
      0
    );
    expect(result.biology).toBe('catalogued');
    expect(result.origin).toBe('managed');
    expect(result.technology).toBe('registered');
    expect(result.quality).toBe(0);
    expect(result.bodyName).toBe(system.colonyWorld?.name);
    expect(result.features.some((feature) => feature.includes('below useful sensitivity'))).toBe(true);
    expect(result.features.some((feature) => feature.startsWith('Registry'))).toBe(true);
  });

  it('does not lose registry knowledge when every planetary spectrum is faint', () => {
    const { system, contact } = fixture();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 1;
    const capabilities = { ...getObservatoryCapabilities(ship), qualityCeiling: 0.05 };
    const result = measureObservatoryContact(
      contact,
      system,
      capabilities,
      contact.worldX - 1,
      contact.worldY,
      1,
      0
    );
    expect(result.biology).toBe('catalogued');
    expect(result.bodyName).toBe(system.colonyWorld?.name);
    expect(result.features.some((feature) => feature.includes('No usable'))).toBe(true);
    expect(system.colonyWorld?.isSurfaceReady()).toBe(false);
  });

  it('detects an unregistered terraformed biosphere spectrally without inventing a registry entry', () => {
    const { system, contact } = fixture();
    Object.defineProperty(system, 'stations', { value: [] });
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 3;
    const result = measureObservatoryContact(
      contact,
      system,
      getObservatoryCapabilities(ship),
      contact.worldX - 1,
      contact.worldY,
      1,
      3
    );
    expect(['candidate', 'strong']).toContain(result.biology);
    expect(result.origin).toBe('unknown');
    expect(result.technology).toBe('no-signal');
    expect(result.features.some((feature) => feature.startsWith('Registry'))).toBe(false);
  });

  it('reports a native biosphere as a spectral candidate without revealing or cataloguing its species', () => {
    const { system, contact } = fixture();
    const planet = system.colonyWorld!;
    // Keep a suitable water world but remove its engineered overlay and human registry.
    Object.defineProperty(planet, 'atmosphere', { value: planet.effectiveAtmosphere });
    Object.defineProperty(planet, 'surfaceTemp', { value: planet.effectiveSurfaceTemp });
    Object.defineProperty(planet, 'hydrosphere', { value: 'shallow saline seas' });
    planet.terraforming = null;
    planet.moons.splice(0);
    system.planets.splice(0, system.planets.length, planet);
    Object.defineProperty(system, 'stations', { value: [] });
    let native: ReturnType<typeof generateBiosphere> = null;
    for (let index = 0; index < 64 && !native; index++) {
      Object.defineProperty(planet, 'mapSeed', { value: `observatory-native-${index}` });
      native = generateBiosphere(createBiologyEnvironment(planet, system, 'planet:0'));
    }
    expect(native?.origin).toBe('native');
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 3;
    const result = measureObservatoryContact(
      contact,
      system,
      getObservatoryCapabilities(ship),
      contact.worldX - 1,
      contact.worldY,
      1,
      3
    );
    expect(['candidate', 'strong']).toContain(result.biology);
    expect(result.origin).toBe('unknown');
    expect(result.technology).toBe('no-signal');
    expect(result.features.some((feature) => feature.includes('reflectance discontinuity'))).toBe(true);
    expect(
      native!.species.every((species) => !result.features.some((feature) => feature.includes(species.name)))
    ).toBe(true);
    expect(planet.isSurfaceReady()).toBe(false);
  });

  it('reports inadequate sensitivity rather than declaring distant worlds lifeless', () => {
    const { system, contact } = fixture();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 1;
    const result = measureObservatoryContact(
      contact,
      system,
      getObservatoryCapabilities(ship),
      contact.worldX - 100,
      contact.worldY,
      1,
      3
    );
    expect(result.biology).toBe('insufficient');
    expect(result.bodyName).toBeNull();
  });

  it('does not classify common gas-giant absorption as evidence of a terrestrial biosphere', () => {
    const { system, contact } = fixture();
    const giant = system.colonyWorld!;
    Object.defineProperty(giant, 'type', { value: 'GasGiant' });
    giant.moons.splice(0);
    system.planets.splice(0, system.planets.length, giant);
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 3;
    const result = measureObservatoryContact(
      contact,
      system,
      getObservatoryCapabilities(ship),
      contact.worldX - 1,
      contact.worldY,
      1,
      3
    );
    expect(result.biology).toBe('no-signal');
    expect(result.features.some((feature) => feature.includes('not diagnostic of biology'))).toBe(true);
  });

  it('has repeatable results and improves quality with proximity and exposure', () => {
    const { system, contact } = fixture();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 3;
    const capabilities = getObservatoryCapabilities(ship);
    const near = measureObservatoryContact(
      contact,
      system,
      capabilities,
      contact.worldX - 1,
      contact.worldY,
      1,
      3
    );
    const far = measureObservatoryContact(
      contact,
      system,
      capabilities,
      contact.worldX - 35,
      contact.worldY,
      1,
      3
    );
    const passive = measureObservatoryContact(
      contact,
      system,
      capabilities,
      contact.worldX - 1,
      contact.worldY,
      1,
      0
    );
    expect(near.quality).toBeGreaterThan(far.quality);
    expect(near.quality).toBeGreaterThan(passive.quality);
    expect(
      measureObservatoryContact(contact, system, capabilities, contact.worldX - 1, contact.worldY, 1, 3)
    ).toEqual(near);
  });
});
