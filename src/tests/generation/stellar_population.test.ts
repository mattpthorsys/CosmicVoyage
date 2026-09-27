import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { SPECTRAL_TYPES } from '../../constants/stellar';
import { MilkyWayModel, StellarPopulationSample } from '../../generation/milky_way_model';
import {
  getStellarPopulationDistribution,
  sampleStellarEvolution,
} from '../../generation/stellar_population';
import {
  projectedDepthPc,
  projectedSystemMean,
  projectedPopulationWeights,
} from '../../generation/galactic_projection';
import { estimateMainSequenceLifetimeGyr } from '../../entities/stellar_environment';
import { PRNG } from '../../utils/prng';

const context = { ...new MilkyWayModel('population-regression').getCellContext(0, 0), cluster: null };
const population: StellarPopulationSample = { population: 'thin-disk', ageGyr: 4.6, metallicityFeH: 0 };

describe('joint stellar population', () => {
  it('keeps cool stars dominant without suppressing hot stars twice', () => {
    const distribution = getStellarPopulationDistribution(context, population);
    /** Sums probability across the requested spectra. */
    const mass = (predicate: (type: string) => boolean): number =>
      distribution
        .filter((option) => predicate(option.starType))
        .reduce((sum, option) => sum + option.probability, 0);
    expect(distribution.reduce((sum, option) => sum + option.probability, 0)).toBeCloseTo(1, 12);
    expect(mass((type) => /^M\dV$/.test(type))).toBeGreaterThan(0.55);
    expect(mass((type) => /^[OB]/.test(type))).toBeGreaterThan(0.0001);
    expect(mass((type) => /^[OB]/.test(type))).toBeLessThan(0.015);
    for (const type of ['B5III', 'B1Ia', 'M2Iab', 'O5III', 'WN', 'DA2', 'DA5', 'DC']) {
      expect(
        mass((candidate) => candidate === type),
        type
      ).toBeGreaterThan(0);
    }
  });

  it('makes every phase selectable at its calculated probability, with consistent age and mass', () => {
    const distribution = getStellarPopulationDistribution(context, population);
    let cumulative = 0;
    for (const option of distribution) {
      const prng = new PRNG('phase-selection');
      vi.spyOn(prng, 'random').mockReturnValueOnce(cumulative + option.probability / 2);
      const sample = sampleStellarEvolution(context, population, prng);
      cumulative += option.probability;
      expect(sample.starType).toBe(option.starType);
      expect(sample.population.ageGyr).toBeGreaterThanOrEqual(option.minAgeGyr);
      expect(sample.population.ageGyr).toBeLessThan(option.maxAgeGyr);
      expect(sample.evolution.massSolar).toBeLessThanOrEqual(sample.evolution.initialMassSolar);
      expect(sample.evolution.radiusM).toBeGreaterThan(0);
      expect(SPECTRAL_TYPES[sample.starType]).toBeDefined();
      if (sample.evolution.stage === 'main-sequence') {
        expect(sample.population.ageGyr).toBeLessThan(sample.evolution.mainSequenceLifetimeGyr);
      } else {
        expect(sample.population.ageGyr).toBeGreaterThanOrEqual(sample.evolution.mainSequenceLifetimeGyr);
      }
    }
  });

  it('removes dead massive stars from old populations and enhances them in young clusters', () => {
    const old = getStellarPopulationDistribution(context, { ...population, population: 'halo' });
    expect(old.some((option) => /^[OBW]/.test(option.starType))).toBe(false);
    expect(old.some((option) => option.evolution.stage === 'white-dwarf')).toBe(true);
    const young = getStellarPopulationDistribution(
      {
        ...context,
        cluster: { kind: 'open', name: 'Young association', ageGyr: 0.003, metallicityFeH: 0, influence: 1 },
      },
      population
    );
    /** Sums the hot-star contribution without including white dwarfs. */
    const hotProbability = (options: typeof young): number =>
      options
        .filter((option) => /^[OB]/.test(option.starType))
        .reduce((sum, option) => sum + option.probability, 0);
    expect(hotProbability(young)).toBeGreaterThan(
      hotProbability(getStellarPopulationDistribution(context, population)) * 5
    );
    expect(young.every((option) => option.minAgeGyr >= 0.0027 && option.maxAgeGyr <= 0.0033)).toBe(true);
    expect(estimateMainSequenceLifetimeGyr('O5V')).toBeGreaterThan(0.004);
  });

  it('is deterministic without mutating population inputs or phase templates', () => {
    const first = sampleStellarEvolution(context, population, new PRNG('repeat'));
    const baseline = structuredClone(first);
    first.evolution.radiusM = 1;
    expect(sampleStellarEvolution(context, population, new PRNG('repeat'))).toEqual(baseline);
    expect(population.ageGyr).toBe(4.6);
  });
});

describe('finite-slab projection', () => {
  const weights = { 'thin-disk': 0.8, 'thick-disk': 0.1, bulge: 0.05, halo: 0.05 };
  it('integrates the vertical profile and preserves cell-area scaling', () => {
    expect(projectedDepthPc(300, 0)).toBe(0);
    expect(projectedDepthPc(300, 0.001)).toBeCloseTo(0.002, 7);
    expect(projectedDepthPc(300, 1e6)).toBeCloseTo(600);
    expect(projectedSystemMean(1, weights, 0, 2)).toBeCloseTo(projectedSystemMean(1, weights, 0, 1) * 4, 12);
    expect(projectedSystemMean(2, weights, 0)).toBeCloseTo(projectedSystemMean(1, weights, 0) * 2, 12);
    expect(projectedSystemMean(1, weights, 0)).toBeLessThan(CONFIG.STAR_DENSITY);
  });
  it('uses integrated rather than midplane fractions when choosing populations', () => {
    const projected = projectedPopulationWeights(weights, 1);
    expect(Object.values(projected).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    expect(projected.halo).toBeGreaterThan(weights.halo);
    expect(projected['thin-disk']).toBeLessThan(weights['thin-disk']);
  });
});
