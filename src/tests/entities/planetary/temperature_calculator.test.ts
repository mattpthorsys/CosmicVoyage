import { describe, expect, it } from 'vitest';
import { Atmosphere } from '../../../entities/planet';
import { calculateTemperatureProfile } from '../../../entities/planet/temperature_calculator';

const noAtmosphere: Atmosphere = {
  density: 'None',
  pressure: 0,
  composition: { None: 100 },
};

const thickAtmosphere: Atmosphere = {
  density: 'Thick',
  pressure: 3.2,
  composition: { Nitrogen: 60, 'Carbon Dioxide': 28, 'Water Vapor': 12 },
};

describe('calculateTemperatureProfile', () => {
  it('reports a wider current range for airless tilted bodies than buffered atmospheres', () => {
    const airless = calculateTemperatureProfile('Rock', 1.496e11, 'G', noAtmosphere, undefined, undefined, {
      diameterKm: 6800,
      densityGcm3: 3.4,
      ageGyr: 4.6,
      axialTiltRad: Math.PI / 4,
      tidallyLocked: false,
    });
    const buffered = calculateTemperatureProfile(
      'Rock',
      1.496e11,
      'G',
      thickAtmosphere,
      undefined,
      undefined,
      {
        diameterKm: 6800,
        densityGcm3: 3.4,
        ageGyr: 4.6,
        axialTiltRad: Math.PI / 4,
        tidallyLocked: false,
      }
    );

    expect(airless.max - airless.min).toBeGreaterThan(buffered.max - buffered.min);
    expect(buffered.average).toBeGreaterThan(airless.average);
  });

  it('raises moon floor temperatures with tidal flexing', () => {
    const quiet = calculateTemperatureProfile('Frozen', 8e11, 'K', noAtmosphere, undefined, undefined, {
      diameterKm: 1800,
      densityGcm3: 1.7,
      ageGyr: 6,
      tidallyLocked: true,
      tidalHeatingFactor: 0,
    });
    const flexed = calculateTemperatureProfile('Frozen', 8e11, 'K', noAtmosphere, undefined, undefined, {
      diameterKm: 1800,
      densityGcm3: 1.7,
      ageGyr: 6,
      tidallyLocked: true,
      tidalHeatingFactor: 0.75,
    });

    expect(flexed.average).toBeGreaterThan(quiet.average);
    expect(flexed.min).toBeGreaterThanOrEqual(quiet.min);
  });

  it('keeps denser younger worlds warmer from internal heat at equal stellar flux', () => {
    const oldLight = calculateTemperatureProfile('Rock', 6e11, 'M', noAtmosphere, undefined, 0.04, {
      diameterKm: 4200,
      densityGcm3: 2.4,
      ageGyr: 9,
    });
    const youngDense = calculateTemperatureProfile('Rock', 6e11, 'M', noAtmosphere, undefined, 0.04, {
      diameterKm: 12000,
      densityGcm3: 5.8,
      ageGyr: 0.9,
    });

    expect(youngDense.average).toBeGreaterThan(oldLight.average);
    expect(youngDense.min).toBeGreaterThan(oldLight.min);
  });
});
