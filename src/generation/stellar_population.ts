import { SPECTRAL_TYPES } from '../constants/stellar';
import { SOLAR_MASS_KG, SOLAR_RADIUS_M } from '../constants/physics';
import {
  estimateMainSequenceLifetimeGyr,
  isMainSequenceStar,
  StellarEvolutionStage,
  StellarEvolutionState,
} from '../entities/stellar_environment';
import { PRNG } from '../utils/prng';
import type { GalacticCellContext, StellarPopulationSample } from './milky_way_model';
import { projectedYoungFraction } from './galactic_projection';

interface AgeBand {
  min: number;
  max: number;
  weight: number;
}
interface EvolutionPhase {
  starType: string;
  min: number;
  max: number;
  birthWeight: number;
  evolution: StellarEvolutionState;
}

export interface StellarPopulationOption {
  starType: string;
  evolution: Readonly<StellarEvolutionState>;
  minAgeGyr: number;
  maxAgeGyr: number;
  probability: number;
}

/** Integrates the continuous two-slope Kroupa birth-mass distribution in solar masses. */
function birthWeight(min: number, max: number): number {
  if (min < 0.5 && max > 0.5) return birthWeight(min, 0.5) + birthWeight(0.5, max);
  const slope = min >= 0.5 ? 2.3 : 1.3;
  const continuity = min >= 0.5 ? 0.5 : 1;
  return (continuity * (max ** (1 - slope) - min ** (1 - slope))) / (1 - slope);
}

/** Builds quadrature tracks once; phase durations supply rarity rather than a second frequency table. */
function createPhases(): EvolutionPhase[] {
  const types = Object.keys(SPECTRAL_TYPES)
    .filter((type) => isMainSequenceStar(type) && (type.length > 1 || 'OBA'.includes(type)))
    .sort((a, b) => SPECTRAL_TYPES[a].mass - SPECTRAL_TYPES[b].mass);
  const phases: EvolutionPhase[] = [];
  types.forEach((type, index) => {
    const mass = SPECTRAL_TYPES[type].mass / SOLAR_MASS_KG;
    const lower =
      index === 0 ? 0.08 : Math.sqrt((mass * SPECTRAL_TYPES[types[index - 1]].mass) / SOLAR_MASS_KG);
    const upper =
      index === types.length - 1
        ? 80
        : Math.sqrt((mass * SPECTRAL_TYPES[types[index + 1]].mass) / SOLAR_MASS_KG);
    const weight = birthWeight(lower, upper);
    const lifetime = estimateMainSequenceLifetimeGyr(type);
    /** Appends a phase with representative spectrum and a mass tied to its progenitor. */
    const add = (starType: string, stage: StellarEvolutionStage, min: number, max: number): void => {
      const info = SPECTRAL_TYPES[starType];
      const currentMass =
        stage === 'white-dwarf'
          ? Math.min(1.25, 0.109 * mass + 0.394)
          : stage === 'wolf-rayet'
            ? mass * 0.5
            : stage === 'main-sequence'
              ? mass
              : mass * 0.9;
      const radiusM =
        stage === 'main-sequence'
          ? info.radius
          : stage === 'white-dwarf'
            ? 0.012 * SOLAR_RADIUS_M * Math.cbrt(0.6 / currentMass)
            : info.radius * Math.sqrt(currentMass / (info.mass / SOLAR_MASS_KG));
      phases.push({
        starType,
        min,
        max,
        birthWeight: weight,
        evolution: {
          stage,
          initialMassSolar: mass,
          mainSequenceLifetimeGyr: lifetime,
          massSolar: currentMass,
          radiusM,
        },
      });
    };
    add(type, 'main-sequence', 0, lifetime);
    if (mass < 0.9) return;
    if (mass < 8) {
      add(mass >= 3 ? 'B5III' : 'G5IV', mass >= 3 ? 'blue-giant' : 'subgiant', lifetime, lifetime * 1.06);
      add('K1III', 'red-giant', lifetime * 1.06, lifetime * 1.14);
      add('M3III', 'red-giant', lifetime * 1.14, lifetime * 1.17);
      const end = lifetime * 1.17;
      add('DA2', 'white-dwarf', end, end + 0.2);
      add('DA5', 'white-dwarf', end + 0.2, end + 3);
      add('DC', 'white-dwarf', end + 3, 13.2);
    } else if (mass < 25) {
      add('B1Ia', 'blue-supergiant', lifetime, lifetime * 1.035);
      add('M2Iab', 'red-supergiant', lifetime * 1.035, lifetime * 1.11);
    } else {
      add('O5III', 'blue-giant', lifetime, lifetime * 1.025);
      add('WN', 'wolf-rayet', lifetime * 1.025, lifetime * 1.075);
    }
  });
  return phases;
}

const PHASES = createPhases();

/** Approximates local star-formation history with normalised age intervals. */
function ageBands(context: GalacticCellContext, population: StellarPopulationSample): AgeBand[] {
  if (context.cluster) {
    const spread = Math.min(0.04, context.cluster.ageGyr * 0.1);
    return [
      {
        min: Math.max(0.0001, context.cluster.ageGyr - spread),
        max: Math.min(13.2, context.cluster.ageGyr + spread),
        weight: 1,
      },
    ];
  }
  if (population.population === 'thin-disk') {
    const young = projectedYoungFraction(context.armInfluence);
    return [
      { min: 0.0001, max: 1.2, weight: young },
      { min: 0.25, max: 10, weight: 1 - young },
    ];
  }
  if (population.population === 'thick-disk') return [{ min: 8, max: 12.2, weight: 1 }];
  if (population.population === 'bulge')
    return [
      { min: 0.2, max: 3.5, weight: 0.12 },
      { min: 7.5, max: 12.8, weight: 0.88 },
    ];
  return [{ min: 10.2, max: 13.2, weight: 1 }];
}

/** Exposes the normalised joint distribution for both sampling and population calibration. */
export function getStellarPopulationDistribution(
  context: GalacticCellContext,
  population: StellarPopulationSample
): StellarPopulationOption[] {
  const bands = ageBands(context, population);
  const candidates: StellarPopulationOption[] = [];
  let total = 0;
  for (const phase of PHASES) {
    for (const band of bands) {
      const min = Math.max(phase.min, band.min);
      const max = Math.min(phase.max, band.max);
      if (max <= min) continue;
      const weight = (phase.birthWeight * band.weight * (max - min)) / (band.max - band.min);
      total += weight;
      candidates.push({
        starType: phase.starType,
        evolution: phase.evolution,
        minAgeGyr: min,
        maxAgeGyr: max,
        probability: weight,
      });
    }
  }
  if (!(total > 0)) throw new RangeError('Stellar population has no supported ages between 0 and 13.2 Gyr.');
  for (const candidate of candidates) candidate.probability /= total;
  return candidates;
}

/** Samples mass, evolutionary phase and age jointly from birth weights and local formation history. */
export function sampleStellarEvolution(
  context: GalacticCellContext,
  population: StellarPopulationSample,
  prng: PRNG
): {
  starType: string;
  population: StellarPopulationSample;
  evolution: StellarEvolutionState;
} {
  const candidates = getStellarPopulationDistribution(context, population);
  let roll = prng.random();
  const selected =
    candidates.find((candidate) => (roll -= candidate.probability) < 0) ?? candidates[candidates.length - 1];
  const ageGyr = prng.random(selected.minAgeGyr, selected.maxAgeGyr);
  // Retain the chemical scatter while applying the existing age-metallicity relation to the joint age.
  const correction = context.cluster
    ? 0
    : (Math.max(0, population.ageGyr - 4.5) - Math.max(0, ageGyr - 4.5)) * 0.025;
  return {
    starType: selected.starType,
    population: {
      ...population,
      ageGyr,
      metallicityFeH: Math.max(-2.35, Math.min(0.62, population.metallicityFeH + correction)),
    },
    evolution: { ...selected.evolution },
  };
}
