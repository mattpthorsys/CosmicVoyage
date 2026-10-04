import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { SolarSystem } from '../../entities/solar_system';
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
    expect(system.colonyWorld?.isSurfaceReady).toBe(false);
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
