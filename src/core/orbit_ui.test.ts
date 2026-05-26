import { describe, expect, it } from 'vitest';
import { MineralRichness } from '../constants';
import { Planet } from '../entities/planet';
import { PlanetCharacteristics } from '../entities/planet/planet_characteristics_generator';
import { PRNG } from '../utils/prng';
import { createOrbitScreenModel } from './orbit_ui';

function createCharacteristics(): PlanetCharacteristics {
  return {
    diameter: 46000,
    density: 1.45,
    gravity: 0.95,
    mass: 1.9e26,
    escapeVelocity: 24000,
    atmosphere: {
      density: 'Superdense',
      pressure: 160,
      composition: { Hydrogen: 52, Helium: 18, Methane: 18, Ammonia: 12 },
    },
    surfaceTemp: 38,
    surfaceTempMin: 36,
    surfaceTempMax: 41,
    hydrosphere: 'Deep volatile atmosphere',
    lithosphere: 'No solid surface',
    mineralRichness: MineralRichness.NONE,
    baseMinerals: 0,
    elementAbundance: { 'Water Ice': 34, 'Methane Ice': 22, Hydrogen: 16 },
    magneticFieldStrength: 300,
    axialTilt: 0.1,
    tidallyLocked: false,
    rotationPeriodHours: 17.2,
    orbitalInclination: 0,
  };
}

describe('Orbit UI formatting', () => {
  it('describes planet classes and shows no orbit for free-floating primaries', () => {
    const planet = new Planet(
      'Rogue Ice',
      'IceGiant',
      0,
      0,
      new PRNG('rogue-orbit-format'),
      'ROGUE',
      createCharacteristics(),
      { starType: 'ROGUE', ageGyr: 6, metallicityFeH: -0.2 }
    );

    const model = createOrbitScreenModel({
      parentPlanet: planet,
      selectedBody: planet,
      selectedIndex: 0,
      mode: 'overview',
      landingCursorX: 0,
      landingCursorY: 0,
      rotationPhase: 0,
    });

    expect(model.description[0]).toContain('ice giant');
    expect(model.description[1]).toBe('Orbit none; free planetary-mass object in interstellar space.');
    expect(model.telemetry).toContain('Orbit none | Light time none');
    expect(model.telemetry).toContain('Tilt 5.7 deg | Rot 17.2 hours | Free rotation');
    expect(model.telemetry.join('\n')).not.toContain('IceGiant');
    expect(model.telemetry.join('\n')).not.toContain('0.000 AU');
  });
});
