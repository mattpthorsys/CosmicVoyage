import { SOLAR_LUMINOSITY_W } from '../../constants/physics';
import type { OrbitHost, StellarArchitecture } from '../stellar_body';
import { isMainSequenceStar } from '../stellar_environment';

/**
 * Compresses the orbital sampling prior for dim hosts using inverse-square illumination.
 * This is a formation/layout prior, not a habitable-zone placement or a life guarantee.
 * Evolved hosts retain the baseline: today's luminosity does not describe their formation epoch.
 */
export function getPlanetOrbitSamplingScale(architecture: StellarArchitecture, host: OrbitHost): number {
  const sources = architecture.stars.filter((star) =>
    host.kind === 'circumstellar'
      ? star.id === (host.starId ?? 'A')
      : host.kind === 'circumbinary'
        ? star.id === 'A' || star.id === 'B'
        : true
  );
  if (
    sources.length === 0 ||
    sources.some((star) => !isMainSequenceStar(star.starType) && !/^[LTY]/.test(star.starType))
  )
    return 1;
  const luminosity = sources.reduce((sum, star) => sum + star.luminosityW, 0);
  if (!Number.isFinite(luminosity) || luminosity <= 0) return 1;
  // The floor is a bounded substellar layout prior; physical survival and Hill limits still apply.
  return Math.max(0.02, Math.min(1, Math.sqrt(luminosity / SOLAR_LUMINOSITY_W)));
}
