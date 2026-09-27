import { CONFIG } from '../config';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { SOLAR_RADIUS_M } from '../constants/physics';
import type { SystemMapProperties } from '../generation/system_data_generator';

type StellarContact = Pick<SystemMapProperties, 'starType' | 'stellarEvolution'> & {
  objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | 'neutron-star' | null;
};

/** Approximates visible-band luminosity at 550 nm, avoiding bolometric over-detection of hot remnants. */
export function getVisibleLuminositySolar(system: StellarContact): number {
  const info = SPECTRAL_TYPES[system.starType ?? 'G'] ?? SPECTRAL_TYPES.G;
  const radius = system.stellarEvolution?.radiusM ?? info.radius;
  const planckTemperature = 0.01438777 / 550e-9;
  return (
    ((radius / SOLAR_RADIUS_M) ** 2 * Math.expm1(planckTemperature / 5770)) /
    Math.expm1(planckTemperature / info.temp)
  );
}

/** Detection follows inverse-square visible flux with explicit instrument and gameplay limits. */
export function getStellarDetectionRadii(
  system: StellarContact,
  sensorMultiplier = 1
): { statusRadius: number; overlayRadius: number } {
  const radius =
    system.objectKind === 'brown-dwarf'
      ? CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS
      : Math.max(
          CONFIG.MIN_STAR_DETECTION_RADIUS_CELLS,
          Math.min(
            CONFIG.MAX_STAR_DETECTION_RADIUS_CELLS,
            CONFIG.NORMAL_STAR_DETECTION_RADIUS_CELLS * Math.sqrt(getVisibleLuminositySolar(system))
          )
        );
  return {
    statusRadius: radius * sensorMultiplier,
    overlayRadius: Math.min(CONFIG.MAX_STAR_OVERLAY_RADIUS_CELLS, radius * 0.6) * sensorMultiplier,
  };
}
