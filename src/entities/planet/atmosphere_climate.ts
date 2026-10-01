import type { Atmosphere } from '../planet';
import { AIRLESS, condenseAtmosphere } from './atmosphere_physics';
import type { TemperatureProfile } from './temperature_calculator';

/** Solves frost/greenhouse feedback using one fixed inventory and no additional random draws. */
export function resolveAtmosphereClimate(
  inventory: Atmosphere,
  planetType: string,
  temperatureFor: (atmosphere: Atmosphere) => TemperatureProfile
): { atmosphere: Atmosphere; temperature: TemperatureProfile } {
  if (planetType === 'GasGiant' || planetType === 'IceGiant' || inventory.pressure === 0) {
    return { atmosphere: inventory, temperature: temperatureFor(inventory) };
  }
  // Airless and entirely gaseous inventories bracket every climate allowed by
  // this monotonic greenhouse proxy. Bisection avoids alternating frozen/steam states.
  let low = temperatureFor(AIRLESS).average;
  let high = Math.max(low, temperatureFor(inventory).average);
  for (let step = 0; step < 32 && high - low > 0.01; step++) {
    const mid = (low + high) / 2;
    const temperature = temperatureFor(condenseAtmosphere(inventory, mid)).average;
    if (temperature > mid) low = mid;
    else high = mid;
  }
  const atmosphere = condenseAtmosphere(inventory, (low + high) / 2);
  return { atmosphere, temperature: temperatureFor(atmosphere) };
}
