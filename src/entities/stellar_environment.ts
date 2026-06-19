import { PRNG } from '../utils/prng';
import { SOLAR_MASS_KG } from '../constants/physics';
import { SPECTRAL_TYPES } from '../constants/stellar';

export interface StellarEnvironment {
  starType: string;
  ageGyr: number;
  metallicityFeH: number;
}

const MILKY_WAY_DISK_AGE_GYR = 13.2;

/** Clamps a numeric value to the supplied bounds. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Returns spectral class. */
export function getSpectralClass(starType: string): string {
  return starType.charAt(0).toUpperCase();
}

/** Estimates main sequence lifetime gyr. */
export function estimateMainSequenceLifetimeGyr(starType: string): number {
  const massSolar = (SPECTRAL_TYPES[starType]?.mass ?? SPECTRAL_TYPES['G'].mass) / SOLAR_MASS_KG;
  return clamp(10 * Math.pow(massSolar, -2.5), 0.003, 1000);
}

/** Generates stellar age gyr. */
export function generateStellarAgeGyr(starType: string, prng: PRNG): number {
  const spectralClass = getSpectralClass(starType);
  const lifetimeLimit = estimateMainSequenceLifetimeGyr(starType) * 0.92;
  const maxAge = Math.min(MILKY_WAY_DISK_AGE_GYR, lifetimeLimit);

  const lowerBounds: Record<string, number> = {
    O: 0.001,
    B: 0.006,
    A: 0.05,
    F: 0.4,
    G: 0.7,
    K: 1.0,
    M: 0.05,
    L: 0.02,
    T: 0.02,
    Y: 0.02,
  };
  const minAge = Math.min(lowerBounds[spectralClass] ?? 0.5, maxAge * 0.7);

  // Long-lived cool stars may come from almost any epoch; short-lived hot stars must be young.
  const ageBias =
    spectralClass === 'L' || spectralClass === 'T' || spectralClass === 'Y'
      ? 0.62
      : spectralClass === 'M' || spectralClass === 'K'
        ? 0.72
        : spectralClass === 'G'
          ? 0.9
          : 1.35;
  const age = minAge + (maxAge - minAge) * Math.pow(prng.random(), ageBias);
  return age < 0.1 ? Math.round(age * 1000) / 1000 : Math.round(age * 100) / 100;
}

/** Generates milky way metallicity fe h. */
export function generateMilkyWayMetallicityFeH(ageGyr: number, starType: string, prng: PRNG): number {
  const ageFraction = clamp(ageGyr / MILKY_WAY_DISK_AGE_GYR, 0, 1);
  const spectralClass = getSpectralClass(starType);
  const isOldCoolPopulation =
    (spectralClass === 'K' ||
      spectralClass === 'M' ||
      spectralClass === 'L' ||
      spectralClass === 'T' ||
      spectralClass === 'Y') &&
    ageGyr > 8;

  // Disk stars cluster around solar metallicity, with older populations trending metal-poor.
  const meanFeH = 0.16 - ageFraction * 0.55;
  let scatter = prng.random(-0.24, 0.24) + prng.random(-0.12, 0.12);

  if (isOldCoolPopulation && prng.random() < 0.16) {
    scatter -= prng.random(0.25, 0.65); // thick-disk tail
  }
  if (prng.random() < 0.025) {
    scatter -= prng.random(0.7, 1.25); // rare halo interloper
  }

  const feh = clamp(meanFeH + scatter, -1.75, 0.55);
  return Math.round(feh * 100) / 100;
}

/** Returns default stellar environment. */
export function getDefaultStellarEnvironment(parentStarType: string): StellarEnvironment {
  return {
    starType: parentStarType,
    ageGyr: parentStarType.startsWith('G') ? 4.6 : 5.0,
    metallicityFeH: 0,
  };
}

/** Estimates evolutionary luminosity factor. */
export function estimateEvolutionaryLuminosityFactor(environment: StellarEnvironment): number {
  const spectralClass = getSpectralClass(environment.starType);
  const lifetime = estimateMainSequenceLifetimeGyr(environment.starType);
  const fractionalAge = clamp(environment.ageGyr / lifetime, 0, 0.98);
  const metalFactor = Math.pow(10, -environment.metallicityFeH * 0.08);

  let ageFactor = 1;
  if (spectralClass === 'O' || spectralClass === 'B') ageFactor = 1 + fractionalAge * 0.65;
  else if (spectralClass === 'A' || spectralClass === 'F') ageFactor = 1 + fractionalAge * 0.42;
  else if (spectralClass === 'G' || spectralClass === 'K') ageFactor = 0.72 + fractionalAge * 0.58;
  else if (spectralClass === 'M') ageFactor = 0.9 + fractionalAge * 0.16;
  else if (spectralClass === 'L' || spectralClass === 'T' || spectralClass === 'Y')
    ageFactor = 1.18 - fractionalAge * 0.58;

  return clamp(ageFactor * metalFactor, 0.55, 1.9);
}

/** Estimates stellar activity. */
export function estimateStellarActivity(environment: StellarEnvironment, orbitAu: number): number {
  const spectralClass = getSpectralClass(environment.starType);
  const youngBoost =
    environment.ageGyr < 0.1 ? 2.5 : environment.ageGyr < 1 ? 1.6 : environment.ageGyr < 3 ? 1.15 : 0.85;
  const typeBoost =
    spectralClass === 'O' || spectralClass === 'B'
      ? 2.2
      : spectralClass === 'A'
        ? 1.65
        : spectralClass === 'M'
          ? 1.45
          : spectralClass === 'L' || spectralClass === 'T' || spectralClass === 'Y'
            ? 0.55
            : spectralClass === 'F'
              ? 1.2
              : 1.0;
  const proximityBoost = orbitAu < 0.35 ? 1.7 : orbitAu < 0.8 ? 1.25 : 1.0;
  return clamp(typeBoost * youngBoost * proximityBoost, 0.45, 5);
}
