import { describe, expect, it } from 'vitest';
import { MineralRichness } from '../../../constants';
import { PRNG } from '../../../utils/prng';
import { Planet } from '../../../entities/planet';
import { PlanetCharacteristics } from '../../../entities/planet/planet_characteristics_generator';

function createCharacteristics(): PlanetCharacteristics {
  return {
    diameter: 110000,
    density: 1.2,
    gravity: 1.88,
    mass: 1.8e27,
    escapeVelocity: 59000,
    atmosphere: {
      density: 'Superdense',
      pressure: 420,
      composition: { Hydrogen: 82, Helium: 16, Methane: 2 },
    },
    surfaceTemp: 54,
    surfaceTempMin: 51,
    surfaceTempMax: 57,
    hydrosphere: 'Deep volatile atmosphere',
    lithosphere: 'No solid surface',
    mineralRichness: MineralRichness.NONE,
    baseMinerals: 0,
    elementAbundance: { Hydrogen: 62, Helium: 20, 'Methane Ice': 8 },
    magneticFieldStrength: 600,
    axialTilt: 0.2,
    tidallyLocked: false,
    rotationPeriodHours: 13.8,
    orbitalInclination: 0,
  };
}

describe('Planet scan formatting', () => {
  it('uses descriptive planet classes and reports no orbit for free-floating primaries', () => {
    const planet = new Planet(
      'Rogue Test',
      'GasGiant',
      0,
      0,
      new PRNG('rogue-scan-format'),
      'ROGUE',
      createCharacteristics(),
      { starType: 'ROGUE', ageGyr: 8.5, metallicityFeH: -0.3 }
    );

    const scan = planet.getScanInfo();

    expect(scan).toContain('Type: <hl>gas giant</hl>');
    expect(scan).toContain('Orbit: <hl>none</hl>');
    expect(scan.join('\n')).toContain('Period: <hl>13.8 hours</hl>');
    expect(scan.join('\n')).not.toContain('GasGiant');
    expect(scan.join('\n')).not.toContain('0.000 AU');
  });
});
