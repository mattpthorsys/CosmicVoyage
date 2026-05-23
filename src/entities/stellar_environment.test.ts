import { describe, expect, it } from 'vitest';
import { PRNG } from '../utils/prng';
import {
  estimateEvolutionaryLuminosityFactor,
  estimateMainSequenceLifetimeGyr,
  generateMilkyWayMetallicityFeH,
  generateStellarAgeGyr,
} from './stellar_environment';

describe('stellar environment generation', () => {
  it('keeps generated star ages below the main sequence lifetime', () => {
    for (const starType of ['O', 'B', 'A', 'F3V', 'G2V', 'K5V', 'M7V']) {
      const ageGyr = generateStellarAgeGyr(starType, new PRNG(`age-${starType}`));
      const lifetimeGyr = estimateMainSequenceLifetimeGyr(starType);

      expect(ageGyr).toBeGreaterThan(0);
      expect(ageGyr).toBeLessThanOrEqual(Math.min(13.2, lifetimeGyr * 0.92) + 0.01);
    }
  });

  it('generates plausible Milky Way metallicities', () => {
    for (const ageGyr of [0.05, 1.5, 4.6, 9.5, 12.5]) {
      const metallicityFeH = generateMilkyWayMetallicityFeH(ageGyr, 'G2V', new PRNG(`metallicity-${ageGyr}`));

      expect(metallicityFeH).toBeGreaterThanOrEqual(-1.75);
      expect(metallicityFeH).toBeLessThanOrEqual(0.55);
    }
  });

  it('keeps stellar evolution luminosity adjustments bounded', () => {
    const luminosityFactor = estimateEvolutionaryLuminosityFactor({
      starType: 'G2V',
      ageGyr: 4.6,
      metallicityFeH: 0,
    });

    expect(luminosityFactor).toBeGreaterThan(0.55);
    expect(luminosityFactor).toBeLessThan(1.9);
  });
});
