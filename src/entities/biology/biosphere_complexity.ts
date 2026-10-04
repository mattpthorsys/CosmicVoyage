import type { BiologyEnvironment } from './biosphere_generator';
import type { BiosphereComplexity } from './biology_types';
import { PRNG } from '../../utils/prng';

export interface ComplexityWeights {
  readonly microbial: number;
  readonly simple: number;
  readonly complex: number;
}

/** Returns conditional gameplay priors for inhabited worlds, not empirical evolutionary rates. */
export function biosphereComplexityWeights(e: BiologyEnvironment): ComplexityWeights {
  const maturity = Math.max(0.15, Math.min(1, (e.ageGyr - 0.3) / 3));
  const temperate = Math.max(0.2, 1 - Math.abs(e.temperatureK - 294) / 55);
  const energy = Math.max(0.1, Math.min(1, (e.stellarFluxWm2 ?? 1361) / 250));
  // Oxygen favours the existing energetic fauna; it is not a prerequisite for all multicellularity.
  const oxygen = 0.2 + 0.8 * Math.max(0, Math.min(1, e.oxygenBar / 0.15));
  const pressure = e.pressureBar > 8 ? 0.25 : 1;
  return {
    microbial: 0.62,
    simple: 0.28 * maturity * temperate,
    complex: 0.1 * maturity * temperate * energy * oxygen * pressure,
  };
}

/** Chooses complexity on an isolated stream after life occurrence, never as an inevitable age ladder. */
export function selectBiosphereComplexity(e: BiologyEnvironment): BiosphereComplexity {
  if (e.origin === 'introduced') return 'complex-multicellular';
  const weights = biosphereComplexityWeights(e);
  const roll =
    new PRNG(e.seed).seedNew('biosphere-complexity', 1).random() *
    (weights.microbial + weights.simple + weights.complex);
  if (roll < weights.microbial) return 'microbial-only';
  if (roll < weights.microbial + weights.simple) return 'simple-multicellular';
  return 'complex-multicellular';
}
