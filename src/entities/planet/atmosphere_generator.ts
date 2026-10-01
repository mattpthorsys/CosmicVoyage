import { PRNG } from '../../utils/prng';
import { STANDARD_GRAVITY_M_S2 } from '../../constants/physics';
import type { Atmosphere } from '../planet';
import { getDefaultStellarEnvironment, type StellarEnvironment } from '../stellar_environment';
import {
  AIRLESS,
  atmosphereFromPartialPressures,
  condenseAtmosphere,
  jeansParameter,
} from './atmosphere_physics';
import {
  atmosphereBolometricFlux,
  estimateAtmosphereIrradiation,
  type AtmosphereIrradiation,
} from './stellar_irradiation';

export interface AtmosphereGenerationOptions {
  totalFluxWm2?: number;
  temperatureK?: number; // Airless surface estimate for retention, or known rogue-world temperature.
  irradiation?: AtmosphereIrradiation;
}

/** Samples a volatile inventory, then removes material instead of merely reweighting escaping gases. */
export function generateAtmosphereInventory(
  prng: PRNG,
  planetType: string,
  gravity: number,
  escapeVelocity: number,
  parentStarType: string,
  orbitDistance: number,
  stellarEnvironment?: StellarEnvironment,
  options: AtmosphereGenerationOptions = {}
): Atmosphere {
  if (gravity <= 0 || escapeVelocity <= 0 || !Number.isFinite(gravity + escapeVelocity)) {
    return { ...AIRLESS, composition: { None: 100 } };
  }
  const environment = stellarEnvironment ?? getDefaultStellarEnvironment(parentStarType);
  const flux = atmosphereBolometricFlux(environment, orbitDistance, options.totalFluxWm2);
  const temperature = options.temperatureK ?? Math.max(3, 255 * (flux / 1361) ** 0.25);
  const irradiation = options.irradiation ?? estimateAtmosphereIrradiation(environment, flux);

  if (planetType === 'GasGiant' || planetType === 'IceGiant') {
    // Giants have no surface pressure. This is the model's deep reference level,
    // not a frost equilibrium at the temperature of their visible cloud tops.
    const helium = prng.random(12, 22);
    const methane = temperature < 500 ? prng.random(0.1, planetType === 'IceGiant' ? 4 : 1) : 0.01;
    const pressure = 10 ** prng.random(1.5, planetType === 'IceGiant' ? 2.8 : 3.2);
    return atmosphereFromPartialPressures({
      Hydrogen: (pressure * (100 - helium - methane)) / 100,
      Helium: (pressure * helium) / 100,
      Methane: (pressure * methane) / 100,
    });
  }

  const icy = ['Frozen', 'DwarfIce', 'Cryovolcanic'].includes(planetType);
  const depleted = ['Lunar', 'Chthonian', 'Molten'].includes(planetType);
  const rich = ['Hycean', 'Greenhouse', 'Oceanic'].includes(planetType);
  // Delivery/outgassing histories span orders of magnitude at the same mass.
  // Type is a prior, not permission to bypass retention or condensation.
  if (prng.random() < (depleted ? 0.65 : rich ? 0.03 : 0.15)) {
    return { ...AIRLESS, composition: { None: 100 } };
  }
  const inventoryScale =
    Math.min(8, (escapeVelocity / 11200) ** 3) *
    10 ** (Math.max(-1.75, Math.min(0.55, environment.metallicityFeH)) * 0.2);
  let pressure =
    10 ** prng.random(depleted ? -8 : rich ? -0.2 : -2, depleted ? -3 : rich ? 2.4 : icy ? 2.5 : 1.8) *
    inventoryScale;
  const primordial = planetType === 'Hycean' || (!depleted && escapeVelocity > 14000 && prng.random() < 0.08);
  let mixture: Record<string, number>;
  if (primordial) {
    pressure = 10 ** prng.random(2, 3.5) * inventoryScale;
    mixture = { Hydrogen: 80, Helium: 18, Nitrogen: 1, 'Water Vapor': 1 };
  } else if (icy || temperature < 170) {
    mixture = {
      Nitrogen: prng.random(65, 95),
      Methane: prng.random(1, 12),
      'Carbon Monoxide': prng.random(0.1, 5),
      'Carbon Dioxide': prng.random(1, 15),
      Argon: prng.random(0.2, 3),
      Ammonia: prng.random(0.001, 0.1),
    };
  } else if (planetType === 'Greenhouse' || temperature > 430 || prng.random() < 0.4) {
    mixture = {
      'Carbon Dioxide': prng.random(65, 96),
      Nitrogen: prng.random(3, 30),
      'Water Vapor': prng.random(0.01, 2),
      'Sulfur Dioxide': prng.random(0.001, 0.05),
      Argon: prng.random(0.1, 2),
    };
  } else {
    mixture = {
      Nitrogen: prng.random(70, 96),
      'Carbon Dioxide': 10 ** prng.random(-2, 1.3),
      'Water Vapor': prng.random(0.1, 5),
      Argon: prng.random(0.2, 2),
      Methane: 10 ** prng.random(-5, -1),
    };
  }

  const age = Math.max(0.001, environment.ageGyr);
  const exobaseK = temperature + 650 * (Math.max(0, irradiation.highEnergyFluxWm2) / 0.005) ** 0.35;
  const bindingThreshold = 18 + 3 * Math.log1p(age);
  const erosion = Math.exp(
    -Math.min(
      30,
      ((0.03 * age * irradiation.lifetimeMeanHighEnergyFluxWm2) / 0.05) * (11200 / escapeVelocity) ** 2
    )
  );
  const total = Object.values(mixture).reduce((sum, weight) => sum + weight, 0);
  const partials: Record<string, number> = {};
  for (const [gas, weight] of Object.entries(mixture)) {
    const binding = jeansParameter(gas, escapeVelocity, exobaseK);
    const retained = 1 / (1 + (bindingThreshold / Math.max(binding, 1e-12)) ** 8);
    partials[gas] = ((pressure * weight) / total) * retained * erosion;
  }

  if (primordial) {
    // Energy-limited escape applies to H/He envelopes, not wholesale to cool CO2/N2 air.
    // Combining dM/dt with P = Mg/(4*pi*R^2) gives dP/dt = efficiency*F_XUV/(4R).
    const radiusM = escapeVelocity ** 2 / (2 * gravity * STANDARD_GRAVITY_M_S2);
    const lostBar =
      (0.1 * irradiation.lifetimeMeanHighEnergyFluxWm2 * age * 3.15576e16) / (4 * radiusM * 1e5);
    const envelopeBar = partials.Hydrogen + partials.Helium;
    const remaining = Math.max(0, 1 - lostBar / Math.max(envelopeBar, 1e-30));
    partials.Hydrogen *= remaining;
    partials.Helium *= remaining;
  }
  return atmosphereFromPartialPressures(partials);
}

/** Generates atmospheres for a known surface temperature; normal planets use coupled climate solving. */
export function generateAtmosphere(
  prng: PRNG,
  planetType: string,
  gravity: number,
  escapeVelocity: number,
  parentStarType: string,
  orbitDistance: number,
  stellarEnvironment?: StellarEnvironment,
  options: AtmosphereGenerationOptions = {}
): Atmosphere {
  const inventory = generateAtmosphereInventory(
    prng,
    planetType,
    gravity,
    escapeVelocity,
    parentStarType,
    orbitDistance,
    stellarEnvironment,
    options
  );
  if (planetType === 'GasGiant' || planetType === 'IceGiant') return inventory;
  const flux = atmosphereBolometricFlux(
    stellarEnvironment ?? getDefaultStellarEnvironment(parentStarType),
    orbitDistance,
    options.totalFluxWm2
  );
  return condenseAtmosphere(inventory, options.temperatureK ?? Math.max(3, 255 * (flux / 1361) ** 0.25));
}
