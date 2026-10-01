import type { Atmosphere } from '../planet';
import { BOLTZMANN_CONSTANT_K } from '../../constants/physics';

export const AIRLESS: Atmosphere = { density: 'None', pressure: 0, composition: { None: 100 } };

// Bulk species only. Reactive mineral vapours and exotic trace chemistry need a
// separate chemical model, not a random share of the remaining atmosphere.
export const MOLECULAR_MASS_AMU: Record<string, number> = {
  Hydrogen: 2.016,
  Helium: 4.003,
  Nitrogen: 28.014,
  Oxygen: 31.998,
  Argon: 39.948,
  'Carbon Dioxide': 44.01,
  'Carbon Monoxide': 28.01,
  Methane: 16.043,
  Ammonia: 17.031,
  'Water Vapor': 18.015,
  'Sulfur Dioxide': 64.066,
};

interface Condensable {
  tripleK: number;
  tripleBar: number;
  criticalK: number;
  sublimationOverR: number;
  vaporizationOverR: number;
  antoine?: [number, number, number];
}

// Approximate Clausius-Clapeyron curves anchored at the triple point; NIST
// Antoine fits replace the liquid branches for nitrogen and methane.
// Below the triple point use sublimation, not an extrapolated liquid fit.
const CONDENSABLES: Record<string, Condensable> = {
  Hydrogen: {
    tripleK: 13.8,
    tripleBar: 0.0704,
    criticalK: 33.2,
    sublimationOverR: 120,
    vaporizationOverR: 108,
  },
  Nitrogen: {
    tripleK: 63.15,
    tripleBar: 0.1252,
    criticalK: 126.2,
    sublimationOverR: 850,
    vaporizationOverR: 670,
    antoine: [3.7362, 264.651, -6.788],
  },
  Methane: {
    tripleK: 90.69,
    tripleBar: 0.117,
    criticalK: 190.56,
    sublimationOverR: 1160,
    vaporizationOverR: 990,
    antoine: [3.9895, 443.028, -0.49],
  },
  'Carbon Monoxide': {
    tripleK: 68.15,
    tripleBar: 0.1535,
    criticalK: 132.86,
    sublimationOverR: 900,
    vaporizationOverR: 730,
  },
  'Carbon Dioxide': {
    tripleK: 216.58,
    tripleBar: 5.185,
    criticalK: 304.13,
    sublimationOverR: 3030,
    vaporizationOverR: 2000,
  },
  'Water Vapor': {
    tripleK: 273.16,
    tripleBar: 0.0061166,
    criticalK: 647.1,
    sublimationOverR: 6140,
    vaporizationOverR: 5200,
  },
  Ammonia: {
    tripleK: 195.4,
    tripleBar: 0.0606,
    criticalK: 405.4,
    sublimationOverR: 3750,
    vaporizationOverR: 2800,
  },
  Argon: {
    tripleK: 83.81,
    tripleBar: 0.6889,
    criticalK: 150.69,
    sublimationOverR: 930,
    vaporizationOverR: 780,
  },
  Oxygen: {
    tripleK: 54.36,
    tripleBar: 0.001463,
    criticalK: 154.58,
    sublimationOverR: 1100,
    vaporizationOverR: 820,
  },
  'Sulfur Dioxide': {
    tripleK: 197.7,
    tripleBar: 0.0167,
    criticalK: 430.64,
    sublimationOverR: 3800,
    vaporizationOverR: 3000,
  },
};

/** Returns a saturation partial pressure in bar, not a cap on total air pressure. */
export function saturationPressureBar(gas: string, temperatureK: number): number {
  const phase = CONDENSABLES[gas];
  if (!phase || temperatureK >= phase.criticalK) return Infinity;
  const temperature = Math.max(2, temperatureK);
  if (temperature >= phase.tripleK && phase.antoine) {
    const [a, b, c] = phase.antoine;
    return 10 ** (a - b / (temperature + c));
  }
  const latentOverR = temperature < phase.tripleK ? phase.sublimationOverR : phase.vaporizationOverR;
  return phase.tripleBar * Math.exp(latentOverR * (1 / phase.tripleK - 1 / temperature));
}

/** Density labels describe pressure bands; "Earth-like" does not mean breathable. */
export function atmosphereDensity(pressureBar: number): string {
  if (pressureBar < 1e-9) return 'None';
  if (pressureBar < 0.01) return 'Trace';
  if (pressureBar < 0.5) return 'Thin';
  if (pressureBar < 2) return 'Earth-like';
  if (pressureBar < 20) return 'Thick';
  return 'Superdense';
}

/** Converts surviving partial pressures without restoring material lost to escape or frost. */
export function atmosphereFromPartialPressures(partials: Record<string, number>): Atmosphere {
  const gases = Object.entries(partials).filter(([, p]) => Number.isFinite(p) && p > 0);
  const pressure = gases.reduce((sum, [, p]) => sum + p, 0);
  if (atmosphereDensity(pressure) === 'None') return { ...AIRLESS, composition: { None: 100 } };
  return {
    pressure,
    density: atmosphereDensity(pressure),
    composition: Object.fromEntries(gases.map(([gas, p]) => [gas, (100 * p) / pressure])),
  };
}

/** Equilibrates an available inventory with surface frost/liquid reservoirs. */
export function condenseAtmosphere(inventory: Atmosphere, temperatureK: number): Atmosphere {
  return atmosphereFromPartialPressures(
    Object.fromEntries(
      Object.entries(inventory.composition)
        .filter(([gas]) => gas !== 'None')
        .map(([gas, percent]) => [
          gas,
          Math.min((inventory.pressure * percent) / 100, saturationPressureBar(gas, temperatureK)),
        ])
    )
  );
}

/** Jeans binding parameter at an approximate exobase; hydrogen is photodissociated there. */
export function jeansParameter(gas: string, escapeVelocity: number, exobaseTemperatureK: number): number {
  const amu = gas === 'Hydrogen' ? 1.008 : MOLECULAR_MASS_AMU[gas];
  if (!amu) return 0;
  return (
    (amu * 1.6605390666e-27 * escapeVelocity ** 2) /
    (2 * BOLTZMANN_CONSTANT_K * Math.max(2, exobaseTemperatureK))
  );
}

/** Continuous grey-atmosphere approximation; zero partial pressure means zero warming. */
export function greenhouseTemperatureFactor(atmosphere: Atmosphere): number {
  /** Converts a volume percentage into its partial pressure in bar. */
  const partial = (gas: string): number =>
    (Math.max(0, atmosphere.pressure) * (atmosphere.composition[gas] ?? 0)) / 100;
  const co2 = partial('Carbon Dioxide');
  const water = partial('Water Vapor');
  const methane = partial('Methane');
  const hydrogen = partial('Hydrogen');
  // Broad-band opacity/pressure broadening proxy, not a line-by-line transfer model.
  const opticalDepth =
    0.03 * Math.log1p(atmosphere.pressure) +
    1.8 * Math.log1p(co2 * 20) +
    0.25 * co2 +
    0.7 * Math.log1p(water * 100) +
    0.3 * water +
    0.5 * Math.log1p(methane * 100) +
    0.2 * Math.log1p(partial('Ammonia') * 100) +
    0.02 * hydrogen ** 1.5;
  return Math.min(3.5, (1 + 0.75 * Math.max(0, opticalDepth)) ** 0.25);
}
