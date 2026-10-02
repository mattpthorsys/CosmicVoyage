import { describe, expect, it } from 'vitest';
import { PRNG } from '../../../utils/prng';
import {
  createTerraformingClimate,
  MAX_TERRAFORMING_RADIATIVE_CONTROL_WM2,
} from '../../../entities/terraforming_climate';

describe('terraforming radiative balance', () => {
  it('balances managed stellar absorption, orbital assistance, and greenhouse warming', () => {
    for (const flux of [1089, 1200, 1361, 1500]) {
      for (const gravity of [0.68, 1, 1.38]) {
        const { climate, meanTemperatureK } = createTerraformingClimate(
          {
            stage: 'complete',
            minFluxWm2: flux,
            maxFluxWm2: flux,
            pressureBar: 1,
            co2Percent: 0.04,
            gravity,
          },
          new PRNG(`balance-${flux}-${gravity}`)
        );
        const effectiveTemperature =
          (((flux * (1 - climate.bondAlbedo)) / 4 + climate.radiativeControlWm2) / 5.670374419e-8) ** 0.25;
        expect(meanTemperatureK).toBeCloseTo(effectiveTemperature + climate.greenhouseWarmingK, 0);
        expect(meanTemperatureK).toBeGreaterThanOrEqual(284);
        expect(meanTemperatureK).toBeLessThanOrEqual(291);
        expect(Math.abs(climate.radiativeControlWm2)).toBeLessThanOrEqual(
          MAX_TERRAFORMING_RADIATIVE_CONTROL_WM2
        );
        expect(climate.bondAlbedo).toBeGreaterThanOrEqual(0.2);
        expect(climate.bondAlbedo).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('responds to gravity through atmospheric column mass on a partial project', () => {
    const options = {
      stage: 'partial' as const,
      minFluxWm2: 1361,
      maxFluxWm2: 1361,
      pressureBar: 0.5,
      co2Percent: 0.1,
      gravity: 0.6,
    };
    const lowGravity = createTerraformingClimate(options, new PRNG('column-test'));
    const highGravity = createTerraformingClimate({ ...options, gravity: 1.5 }, new PRNG('column-test'));
    expect(lowGravity.meanTemperatureK).toBeGreaterThan(highGravity.meanTemperatureK);
    expect(lowGravity.climate.radiativeControlWm2).toBe(0);
  });
});
