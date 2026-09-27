import type { OrbitStellarSource } from '../../core/orbit_ui';
import { AU_IN_METERS, SOLAR_LUMINOSITY_W } from '../../constants/physics';
import type { RgbColour } from '../colour';
import type { OrbitVector } from './orbit_lighting';

const SOLAR_TEMPERATURE = 5772;
const SOLAR_IRRADIANCE = SOLAR_LUMINOSITY_W / (4 * Math.PI * AU_IN_METERS ** 2);

/** Adapts a single orbit view to its combined visible stellar irradiance. */
export function getOrbitViewExposure(sources: readonly OrbitStellarSource[]): number {
  const visibleFlux = sources.reduce((total, source) => {
    const rgb = getOrbitStellarIrradiance(source);
    return total + rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
  }, 0);
  // The floor keeps extremely faint systems dark while ordinary outer-system
  // planets remain legible after the observer has adapted to local starlight.
  return Math.PI / Math.max(0.0005, visibleFlux);
}

/** Samples Planck spectra at the Rayleigh model's RGB wavelengths, relative to sunlight at Earth. */
export function getOrbitStellarIrradiance(source: OrbitStellarSource): RgbColour {
  const temperature = source.temperatureK ?? SOLAR_TEMPERATURE;
  const flux = source.irradianceWm2 ?? SOLAR_IRRADIANCE * (source.relativeFlux ?? (source.primary ? 1 : 0));
  if (!Number.isFinite(temperature) || temperature <= 0 || !Number.isFinite(flux) || flux <= 0) {
    return { r: 0, g: 0, b: 0 };
  }
  // Bolometric flux already includes T^4. Divide that out before applying the
  // Planck spectral shape, so a cool star's infrared power is not painted red.
  const normalization = (flux / SOLAR_IRRADIANCE) * (SOLAR_TEMPERATURE / temperature) ** 4;
  /** Returns spectral irradiance relative to the Sun at one wavelength (metres). */
  const atWavelength = (wavelength: number): number =>
    normalization *
    (Math.expm1(0.01438776877 / (wavelength * SOLAR_TEMPERATURE)) /
      Math.expm1(0.01438776877 / (wavelength * temperature)));
  return { r: atWavelength(680e-9), g: atWavelength(550e-9), b: atWavelength(440e-9) };
}

export interface StellarDiscSample {
  direction: OrbitVector;
  weight: number;
}

/** Integrates a uniform stellar disc using a central sample and six equal-area azimuths. */
export function sampleOrbitStellarDisc(direction: OrbitVector, angularRadius = 0): StellarDiscSample[] {
  if (!Number.isFinite(angularRadius) || angularRadius <= 0) return [{ direction, weight: 1 }];
  // Construct an orthonormal basis without a pole singularity.
  const reference = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const cross = {
    x: direction.y * reference.z - direction.z * reference.y,
    y: direction.z * reference.x - direction.x * reference.z,
    z: direction.x * reference.y - direction.y * reference.x,
  };
  const length = Math.hypot(cross.x, cross.y, cross.z);
  const u = { x: cross.x / length, y: cross.y / length, z: cross.z / length };
  const v = {
    x: direction.y * u.z - direction.z * u.y,
    y: direction.z * u.x - direction.x * u.z,
    z: direction.x * u.y - direction.y * u.x,
  };
  const cosine = 1 - (1 - Math.cos(Math.min(Math.PI / 2, angularRadius))) * (2 / 3);
  const sine = Math.sqrt(1 - cosine * cosine);
  const samples: StellarDiscSample[] = [{ direction, weight: 0.25 }];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const a = Math.cos(angle) * sine;
    const b = Math.sin(angle) * sine;
    samples.push({
      direction: {
        x: direction.x * cosine + u.x * a + v.x * b,
        y: direction.y * cosine + u.y * a + v.y * b,
        z: direction.z * cosine + u.z * a + v.z * b,
      },
      weight: 0.125,
    });
  }
  return samples;
}
