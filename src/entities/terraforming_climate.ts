import { PRNG } from '../utils/prng';

const SIGMA = 5.670374419e-8;
export const EARTH_INSTELLATION_WM2 = 1361;
export const MAX_TERRAFORMING_RADIATIVE_CONTROL_WM2 = 40;

export interface TerraformingClimate {
  readonly minStellarFluxWm2: number;
  readonly maxStellarFluxWm2: number;
  readonly bondAlbedo: number;
  readonly greenhouseWarmingK: number;
  readonly radiativeControlWm2: number;
}

/** Estimates a managed climate from radiative balance, with explicit and bounded orbital assistance. */
export function createTerraformingClimate(
  options: {
    stage: 'partial' | 'complete';
    minFluxWm2: number;
    maxFluxWm2: number;
    pressureBar: number;
    co2Percent: number;
    gravity: number;
  },
  prng: PRNG
): { climate: TerraformingClimate; meanTemperatureK: number } {
  const { stage, minFluxWm2, maxFluxWm2, pressureBar, co2Percent, gravity } = options;
  if (
    ![minFluxWm2, maxFluxWm2, pressureBar, co2Percent, gravity].every(Number.isFinite) ||
    minFluxWm2 <= 0 ||
    maxFluxWm2 < minFluxWm2 ||
    pressureBar <= 0 ||
    co2Percent < 0 ||
    gravity <= 0
  )
    throw new RangeError('Invalid terraforming climate inputs.');
  const flux = (minFluxWm2 + maxFluxWm2) / 2;
  // Earth calibration: ~255 K effective emission temperature and ~33 K greenhouse warming.
  // This is a temperate-climate screening model, not a general radiative-transfer solver.
  const column = pressureBar / gravity; // Atmospheric column mass scales as pressure / surface gravity.
  const greenhouseWarmingK =
    stage === 'complete'
      ? 33 * column ** 0.1 * prng.random(0.94, 1.06)
      : Math.min(34, 24 * Math.sqrt(column) + 2 * Math.log1p((pressureBar * co2Percent) / 0.04));
  let bondAlbedo = stage === 'complete' ? 0.3 : prng.random(0.28, 0.4);
  let radiativeControlWm2 = 0;
  let absorbedFlux = (flux * (1 - bondAlbedo)) / 4;
  if (stage === 'complete') {
    const target = prng.random(284, 291);
    const targetAbsorbed = SIGMA * (target - greenhouseWarmingK) ** 4;
    bondAlbedo = Math.max(0.2, Math.min(0.4, 1 - (4 * targetAbsorbed) / flux));
    absorbedFlux = (flux * (1 - bondAlbedo)) / 4;
    radiativeControlWm2 = Math.max(
      -MAX_TERRAFORMING_RADIATIVE_CONTROL_WM2,
      Math.min(MAX_TERRAFORMING_RADIATIVE_CONTROL_WM2, targetAbsorbed - absorbedFlux)
    );
  }
  return {
    climate: {
      minStellarFluxWm2: minFluxWm2,
      maxStellarFluxWm2: maxFluxWm2,
      bondAlbedo,
      greenhouseWarmingK,
      radiativeControlWm2,
    },
    meanTemperatureK: Math.round(((absorbedFlux + radiativeControlWm2) / SIGMA) ** 0.25 + greenhouseWarmingK),
  };
}

/** Returns the temperature excursion from the representative flux to either orbital illumination bound. */
export function getTerraformingOrbitalTemperatureOffset(
  climate: TerraformingClimate,
  fluxWm2: number
): number {
  const meanFlux = (climate.minStellarFluxWm2 + climate.maxStellarFluxWm2) / 2;
  const absorbedMean = (meanFlux * (1 - climate.bondAlbedo)) / 4 + climate.radiativeControlWm2;
  const absorbed = Math.max(0, (fluxWm2 * (1 - climate.bondAlbedo)) / 4 + climate.radiativeControlWm2);
  return (absorbed / SIGMA) ** 0.25 - (absorbedMean / SIGMA) ** 0.25;
}
