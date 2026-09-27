import { SPECTRAL_TYPES } from '../constants/stellar';
import type { StellarBody } from '../entities/stellar_body';
import type { OrbitStellarSource } from './orbit_ui';

type LightSource = Pick<StellarBody, 'id' | 'starType' | 'luminosityW' | 'systemX' | 'systemY'> &
  Partial<Pick<StellarBody, 'radiusM'>>;

/** Uses the strongest local irradiance as the camera's reference light. */
export function createOrbitStellarSources(
  stars: readonly LightSource[],
  body: { systemX: number; systemY: number }
): OrbitStellarSource[] {
  const starsByFlux = stars
    .map((star) => ({
      star,
      distanceSq: (star.systemX - body.systemX) ** 2 + (star.systemY - body.systemY) ** 2,
    }))
    .map((entry) => ({
      ...entry,
      flux: Math.max(0, entry.star.luminosityW) / Math.max(1, entry.distanceSq),
    }))
    .sort((a, b) => b.flux - a.flux);
  const dominantId = starsByFlux[0]?.star.id;
  const reference = starsByFlux[0]?.star;
  const referenceBearing = reference
    ? Math.atan2(reference.systemY - body.systemY, reference.systemX - body.systemX)
    : 0;
  const baselineFlux = Math.max(Number.MIN_VALUE, starsByFlux[0]?.flux ?? 1);
  return starsByFlux.slice(0, 3).map(({ star, flux, distanceSq }) => ({
    id: star.id,
    primary: star.id === dominantId,
    relativeFlux: flux / baselineFlux,
    irradianceWm2: flux / (4 * Math.PI),
    temperatureK:
      (star.radiusM ?? 0) > 0
        ? Math.pow(star.luminosityW / (4 * Math.PI * star.radiusM! ** 2 * 5.670374419e-8), 0.25)
        : (SPECTRAL_TYPES[star.starType]?.temp ?? SPECTRAL_TYPES.G.temp),
    angularRadius: Math.asin(
      Math.min(1, Math.max(0, star.radiusM || 0) / Math.sqrt(Math.max(1, distanceSq)))
    ),
    longitudeOffset: Math.atan2(star.systemY - body.systemY, star.systemX - body.systemX) - referenceBearing,
    brightness: Math.max(0.12, Math.min(1.5, Math.sqrt(flux / baselineFlux))),
    colour: SPECTRAL_TYPES[star.starType]?.colour ?? SPECTRAL_TYPES.G.colour,
  }));
}
