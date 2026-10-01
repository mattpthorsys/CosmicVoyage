import { SPECTRAL_TYPES } from '../../constants/stellar';
import { calculateStellarLuminosityW, type StellarBody } from '../stellar_body';
import { estimateEvolutionaryLuminosityFactor, type StellarEnvironment } from '../stellar_environment';

export interface AtmosphereIrradiation {
  highEnergyFluxWm2: number;
  lifetimeMeanHighEnergyFluxWm2: number;
}

/** Adds each star's individual spectrum and age at the body's actual system position. */
export function calculateAtmosphereIrradiationAt(
  stars: readonly StellarBody[],
  x: number,
  y: number
): AtmosphereIrradiation {
  const total = { highEnergyFluxWm2: 0, lifetimeMeanHighEnergyFluxWm2: 0 };
  for (const star of stars) {
    const distanceSq = Math.max(star.radiusM ** 2, (x - star.systemX) ** 2 + (y - star.systemY) ** 2);
    const contribution = estimateAtmosphereIrradiation(
      star.environment,
      star.luminosityW / (4 * Math.PI * distanceSq)
    );
    total.highEnergyFluxWm2 += contribution.highEnergyFluxWm2;
    total.lifetimeMeanHighEnergyFluxWm2 += contribution.lifetimeMeanHighEnergyFluxWm2;
  }
  return total;
}

/** Estimates the ionizing blackbody fraction, integrating the convergent Wien series. */
function photosphericIonizingFraction(temperatureK: number): number {
  const x = 157800 / Math.max(100, temperatureK); // 13.6 eV / kT
  let integral = 0;
  for (let n = 1; n <= 12; n++) {
    integral += Math.exp(-n * x) * (x ** 3 / n + (3 * x ** 2) / n ** 2 + (6 * x) / n ** 3 + 6 / n ** 4);
  }
  return Math.min(1, (integral * 15) / Math.PI ** 4);
}

/** Estimates current and age-averaged XUV exposure from a single illuminating star. */
export function estimateAtmosphereIrradiation(
  environment: StellarEnvironment,
  bolometricFlux: number
): AtmosphereIrradiation {
  if (environment.starType === 'ROGUE' || bolometricFlux <= 0) {
    return { highEnergyFluxWm2: 0, lifetimeMeanHighEnergyFluxWm2: 0 };
  }
  const spectralClass = environment.starType.charAt(0);
  const photospheric = photosphericIonizingFraction(SPECTRAL_TYPES[environment.starType]?.temp ?? 5772);
  const saturationGyr: Record<string, number> = { F: 0.05, G: 0.1, K: 0.3, M: 1, L: 0.1, T: 0.1, Y: 0.1 };
  const saturation = saturationGyr[spectralClass] ?? 0;
  const age = Math.max(0.001, environment.ageGyr);
  const ratio = saturation > 0 ? Math.max(1, age / saturation) : 1;
  const amplitude = /^[LTY]/.test(spectralClass) ? 1e-5 : saturation > 0 ? 1e-3 : 0;
  // Saturated corona followed by t^-1.2; integrate the same law for cumulative exposure.
  const current = amplitude * ratio ** -1.2;
  const mean =
    age <= saturation ? amplitude : ((amplitude * saturation) / age) * (1 + (1 - ratio ** -0.2) / 0.2);
  return {
    highEnergyFluxWm2: bolometricFlux * (photospheric + current),
    lifetimeMeanHighEnergyFluxWm2: bolometricFlux * (photospheric + mean),
  };
}

/** Uses actual summed flux when provided, otherwise the host's luminosity and distance. */
export function atmosphereBolometricFlux(
  environment: StellarEnvironment,
  orbitDistance: number,
  totalFlux?: number
): number {
  if (totalFlux !== undefined && Number.isFinite(totalFlux)) return Math.max(0, totalFlux);
  if (environment.starType === 'ROGUE') return 0;
  const luminosity = calculateStellarLuminosityW(
    environment.starType,
    estimateEvolutionaryLuminosityFactor(environment)
  );
  return luminosity / (4 * Math.PI * Math.max(1, orbitDistance) ** 2);
}
