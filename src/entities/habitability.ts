import { SPECTRAL_TYPES } from '../constants/stellar';
import { AU_IN_METERS, SOLAR_LUMINOSITY_W, SOLAR_MASS_KG } from '../constants/physics';
import { PRNG } from '../utils/prng';
import type { Atmosphere, Planet } from './planet';
import {
  estimateMainSequenceLifetimeGyr,
  estimateStellarActivity,
  getSpectralClass,
} from './stellar_environment';
import type { StellarArchitecture, StellarBody } from './stellar_body';

export type TerraformingStage = 'partial' | 'complete';

export interface TerraformingProfile {
  readonly stage: TerraformingStage;
  readonly atmosphere: Atmosphere;
  readonly meanTemperatureK: number;
  readonly minTemperatureK: number;
  readonly maxTemperatureK: number;
  readonly hydrosphereFraction: number;
  readonly biosphereStage: string;
  readonly engineeringSupport: readonly string[];
  readonly habitabilityScore: number;
}

export interface StellarHostAssessment {
  readonly score: number;
  readonly eligibleForCompleteTerraforming: boolean;
  readonly eligibleForPartialTerraforming: boolean;
  readonly reasons: readonly string[];
}

export interface HabitableZone {
  readonly innerAu: number;
  readonly outerAu: number;
  readonly preferredAu: number;
}

export interface HabitabilityAssessment {
  readonly score: number;
  readonly viableForCompleteTerraforming: boolean;
  readonly viableForPartialTerraforming: boolean;
  readonly stableOrbit: boolean;
  readonly insideConservativeHabitableZone: boolean;
  readonly reasons: readonly string[];
}

/** Assesses whether a stellar architecture is quiet and long-lived enough for open-air terraforming. */
export function assessStellarHost(architecture: StellarArchitecture): StellarHostAssessment {
  if (architecture.kind === 'starless' || architecture.stars.length === 0) {
    return {
      score: 0,
      eligibleForCompleteTerraforming: false,
      eligibleForPartialTerraforming: false,
      reasons: ['no luminous main-sequence host'],
    };
  }

  const primary =
    architecture.stars.find((star) => star.id === architecture.primaryStarId) ?? architecture.stars[0];
  const spectralClass = getSpectralClass(primary.starType);
  const subtype = getSpectralSubtype(primary.starType);
  const lifetimeGyr = estimateMainSequenceLifetimeGyr(primary.starType);
  const remainingLifetimeGyr = lifetimeGyr - primary.environment.ageGyr;
  const activity = estimateStellarActivity(primary.environment, 1);
  const reasons: string[] = [];
  let score = 100;

  if (spectralClass === 'O' || spectralClass === 'B' || spectralClass === 'A') {
    score -= 100;
    reasons.push('short-lived high-energy primary');
  } else if (spectralClass === 'F' && subtype < 5) {
    score -= 72;
    reasons.push('early-F ultraviolet output and limited stable lifetime');
  } else if (spectralClass === 'F') {
    score -= 28;
    reasons.push('late-F host requires strong ultraviolet shielding');
  } else if (spectralClass === 'G') {
    score -= subtype >= 7 ? 0 : 7;
    reasons.push('long-lived solar-class primary');
  } else if (spectralClass === 'K') {
    score += subtype <= 5 ? 8 : 2;
    reasons.push('quiet, long-lived K-class primary');
  } else if (spectralClass === 'M') {
    if (subtype <= 3 && primary.environment.ageGyr >= 3.5) {
      score -= 24;
      reasons.push('old early-M host with close, potentially locked habitable zone');
    } else {
      score -= 64;
      reasons.push('active or very cool M host complicates atmospheric retention');
    }
  } else {
    score -= 100;
    reasons.push('substellar primary cannot support ordinary open-air terraforming');
  }

  if (primary.environment.ageGyr < 1.2) {
    score -= 32;
    reasons.push('system is still astrophysically young');
  }
  if (remainingLifetimeGyr < 2.5) {
    score -= 48;
    reasons.push('insufficient remaining main-sequence lifetime');
  }
  if (activity > 1.75) {
    score -= Math.min(32, (activity - 1.75) * 16);
    reasons.push('elevated stellar activity');
  }
  if (architecture.kind === 'binary') {
    score -= 10;
    reasons.push('binary illumination and orbital-stability constraints');
  } else if (architecture.kind === 'triple') {
    score -= 25;
    reasons.push('triple-star stability and flux variability constraints');
  }

  score = clamp(Math.round(score), 0, 100);
  return {
    score,
    eligibleForCompleteTerraforming: score >= 62,
    eligibleForPartialTerraforming: score >= 34,
    reasons,
  };
}

/** Calculates conservative temperature-dependent habitable-zone limits from the combined stellar luminosity. */
export function calculateHabitableZone(architecture: StellarArchitecture): HabitableZone | null {
  if (architecture.stars.length === 0) return null;
  const primary =
    architecture.stars.find((star) => star.id === architecture.primaryStarId) ?? architecture.stars[0];
  const totalLuminositySolar = architecture.stars.reduce(
    (sum, star) => sum + star.luminosityW / SOLAR_LUMINOSITY_W,
    0
  );
  const temperatureK = SPECTRAL_TYPES[primary.starType]?.temp ?? 5778;
  const temperatureOffset = temperatureK - 5780;
  const innerFlux = effectiveStellarFlux(temperatureOffset, 'inner');
  const outerFlux = effectiveStellarFlux(temperatureOffset, 'outer');
  const innerAu = Math.sqrt(Math.max(0.0001, totalLuminositySolar / innerFlux));
  const outerAu = Math.sqrt(Math.max(0.0001, totalLuminositySolar / outerFlux));

  return {
    innerAu,
    outerAu,
    preferredAu: Math.sqrt(innerAu * outerAu),
  };
}

/** Scores a generated solid planet for complete or partial terraforming. */
export function assessPlanetHabitability(
  planet: Planet,
  architecture: StellarArchitecture
): HabitabilityAssessment {
  const host = assessStellarHost(architecture);
  const habitableZone = calculateHabitableZone(architecture);
  const orbitAu = planet.orbitDistance / AU_IN_METERS;
  const stableOrbit = isPlanetOrbitStable(planet, architecture);
  const insideConservativeHabitableZone = Boolean(
    habitableZone && orbitAu >= habitableZone.innerAu && orbitAu <= habitableZone.outerAu
  );
  const solid = !['GasGiant', 'IceGiant', 'Hycean', 'DwarfIce', 'Lunar'].includes(planet.type);
  const gravityComplete = planet.gravity >= 0.68 && planet.gravity <= 1.38;
  const gravityPartial = planet.gravity >= 0.42 && planet.gravity <= 1.62;
  const escapeSuitable = planet.escapeVelocity >= 6500;
  const temperatureDelta = Math.abs(planet.surfaceTemp - 287);
  const reasons = [...host.reasons];
  let score = host.score * 0.42;

  if (solid) score += 18;
  else reasons.push('body is not an ordinary terrestrial terraforming target');
  if (stableOrbit) score += 14;
  else reasons.push('orbit falls outside the architecture stability limit');
  if (insideConservativeHabitableZone) score += 16;
  else reasons.push('orbit lies outside the conservative liquid-water flux zone');
  if (gravityComplete) score += 14;
  else if (gravityPartial) score += 6;
  else reasons.push('surface gravity is unsuitable for long-term open settlement');
  if (escapeSuitable) score += 8;
  else reasons.push('low escape velocity makes atmosphere retention expensive');
  score += clamp(10 - temperatureDelta / 18, 0, 10);
  if (planet.tidallyLocked) {
    score -= 7;
    reasons.push('tidal locking requires active heat redistribution');
  }
  if (planet.magneticFieldStrength < 5) {
    score -= 4;
    reasons.push('weak magnetic shielding');
  }

  score = clamp(Math.round(score), 0, 100);
  const viableForCompleteTerraforming =
    host.eligibleForCompleteTerraforming &&
    solid &&
    stableOrbit &&
    insideConservativeHabitableZone &&
    gravityComplete &&
    escapeSuitable &&
    score >= 67;
  const viableForPartialTerraforming =
    host.eligibleForPartialTerraforming && solid && stableOrbit && gravityPartial && score >= 46;

  return {
    score,
    viableForCompleteTerraforming,
    viableForPartialTerraforming,
    stableOrbit,
    insideConservativeHabitableZone,
    reasons,
  };
}

/** Returns the highest-scoring generated world for the requested terraforming stage. */
export function selectTerraformingCandidate(
  planets: readonly (Planet | null)[],
  architecture: StellarArchitecture,
  stage: TerraformingStage
): { planet: Planet; assessment: HabitabilityAssessment } | null {
  let best: { planet: Planet; assessment: HabitabilityAssessment } | null = null;
  for (const planet of planets) {
    if (!planet) continue;
    const assessment = assessPlanetHabitability(planet, architecture);
    const viable =
      stage === 'complete'
        ? assessment.viableForCompleteTerraforming
        : assessment.viableForPartialTerraforming;
    if (!viable) continue;
    if (!best || assessment.score > best.assessment.score) best = { planet, assessment };
  }
  return best;
}

/** Creates a deterministic engineered environment while preserving the planet's natural physical properties. */
export function createTerraformingProfile(
  stage: TerraformingStage,
  assessment: HabitabilityAssessment,
  prng: PRNG
): TerraformingProfile {
  if (stage === 'complete') {
    const pressure = prng.random(0.88, 1.08);
    return {
      stage,
      atmosphere: {
        density: 'Earth-like',
        pressure: Number(pressure.toFixed(3)),
        composition: {
          Nitrogen: 78.08,
          Oxygen: 20.94,
          Argon: 0.93,
          'Carbon Dioxide': 0.04,
          Trace: 0.01,
        },
      },
      meanTemperatureK: Math.round(prng.random(284, 291)),
      minTemperatureK: Math.round(prng.random(235, 250)),
      maxTemperatureK: Math.round(prng.random(307, 321)),
      hydrosphereFraction: Number(prng.random(0.48, 0.78).toFixed(2)),
      biosphereStage: prng.choice(['mature managed biosphere', 'temperate seeded biosphere'])!,
      engineeringSupport: assessment.reasons.includes('weak magnetic shielding')
        ? ['orbital magnetic shield', 'climate-control lattice']
        : ['climate-control lattice'],
      habitabilityScore: Math.max(82, assessment.score),
    };
  }

  const oxygen = prng.random(5.5, 15.5);
  const pressure = prng.random(0.38, 0.82);
  return {
    stage,
    atmosphere: {
      density: pressure > 0.65 ? 'Earth-like' : 'Thin',
      pressure: Number(pressure.toFixed(3)),
      composition: {
        Nitrogen: Number((95 - oxygen).toFixed(2)),
        Oxygen: Number(oxygen.toFixed(2)),
        Argon: 0.8,
        'Carbon Dioxide': Number(prng.random(0.08, 0.65).toFixed(2)),
      },
    },
    meanTemperatureK: Math.round(prng.random(268, 301)),
    minTemperatureK: Math.round(prng.random(205, 245)),
    maxTemperatureK: Math.round(prng.random(310, 344)),
    hydrosphereFraction: Number(prng.random(0.12, 0.52).toFixed(2)),
    biosphereStage: 'pioneer ecology in protected regions',
    engineeringSupport: ['atmospheric processors', 'sealed settlements', 'orbital climate mirrors'],
    habitabilityScore: Math.max(48, assessment.score),
  };
}

/** Returns whether an engineered atmosphere has safe pressure and oxygen partial pressure. */
export function isBreathableTerraformingProfile(profile: TerraformingProfile): boolean {
  const oxygenFraction = (profile.atmosphere.composition.Oxygen ?? 0) / 100;
  const oxygenPartialPressureKpa = profile.atmosphere.pressure * 100 * oxygenFraction;
  return (
    profile.stage === 'complete' &&
    profile.atmosphere.pressure >= 0.75 &&
    profile.atmosphere.pressure <= 1.25 &&
    oxygenPartialPressureKpa >= 16 &&
    oxygenPartialPressureKpa <= 24
  );
}

/** Applies temperature-dependent conservative HZ polynomial coefficients. */
function effectiveStellarFlux(temperatureOffsetK: number, edge: 'inner' | 'outer'): number {
  // Kopparapu-style coefficients for runaway greenhouse and maximum greenhouse limits.
  const coefficients =
    edge === 'inner'
      ? { seff: 1.107, a: 1.332e-4, b: 1.58e-8, c: -8.308e-12, d: -1.931e-15 }
      : { seff: 0.356, a: 6.171e-5, b: 1.698e-9, c: -3.198e-12, d: -5.575e-16 };
  const t = clamp(temperatureOffsetK, -3200, 1500);
  return (
    coefficients.seff +
    coefficients.a * t +
    coefficients.b * t ** 2 +
    coefficients.c * t ** 3 +
    coefficients.d * t ** 4
  );
}

/** Tests a planet against approximate Holman-Wiegert circumstellar or circumbinary limits. */
function isPlanetOrbitStable(planet: Planet, architecture: StellarArchitecture): boolean {
  if (architecture.kind === 'single') return true;
  if (architecture.kind === 'starless' || architecture.stars.length < 2) return false;
  const primary = architecture.stars[0];
  const secondary = architecture.stars[1];
  const totalMass = primary.massKg + secondary.massKg;
  const mu = secondary.massKg / Math.max(1, totalMass);
  const eccentricity = 0.2;
  const binarySeparation = Math.max(0.001, architecture.binarySeparation);

  if (planet.orbitHost.kind === 'circumbinary') {
    const criticalRatio =
      1.6 +
      5.1 * eccentricity -
      2.22 * eccentricity ** 2 +
      4.12 * mu -
      4.27 * eccentricity * mu -
      5.09 * mu ** 2 +
      4.61 * eccentricity ** 2 * mu ** 2;
    return planet.orbitDistance >= criticalRatio * binarySeparation;
  }

  if (planet.orbitHost.kind === 'circumstellar') {
    const criticalRatio =
      0.464 -
      0.38 * mu -
      0.631 * eccentricity +
      0.586 * mu * eccentricity +
      0.15 * eccentricity ** 2 -
      0.198 * mu * eccentricity ** 2;
    return planet.orbitDistance <= criticalRatio * binarySeparation;
  }

  return false;
}

/** Extracts the numerical subclass, using a conservative midpoint when absent. */
function getSpectralSubtype(starType: string): number {
  const match = starType.match(/^[OBAFGKM](\d)/);
  return match ? Number(match[1]) : 5;
}

/** Clamps a scalar to inclusive bounds. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Returns stellar luminosity in solar units for diagnostics and future callers. */
export function getCombinedLuminositySolar(stars: readonly StellarBody[]): number {
  return stars.reduce((sum, star) => sum + star.luminosityW / SOLAR_LUMINOSITY_W, 0);
}

/** Returns stellar mass in solar units for diagnostics and future callers. */
export function getCombinedMassSolar(stars: readonly StellarBody[]): number {
  return stars.reduce((sum, star) => sum + star.massKg / SOLAR_MASS_KG, 0);
}
