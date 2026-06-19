import { SOLAR_RADIUS_M } from '../constants/physics';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { StellarEnvironment } from './stellar_environment';

const STEFAN_BOLTZMANN_SIGMA = 5.670374419e-8;

export type StellarSystemKind = 'single' | 'binary' | 'triple' | 'starless';
export type StellarOrbitCenter = 'barycenter' | 'primary' | 'ab-barycenter';
export type PlanetOrbitKind = 'circumbinary' | 'circumstellar' | 'barycentric';

export interface StellarOrbit {
  center: StellarOrbitCenter;
  radius: number;
  angle: number;
  periodSeconds: number;
}

export interface StellarBody {
  id: 'A' | 'B' | 'C';
  name: string;
  starType: string;
  massKg: number;
  radiusM: number;
  luminosityW: number;
  systemX: number;
  systemY: number;
  orbit: StellarOrbit | null;
  environment: StellarEnvironment;
}

export interface StellarArchitecture {
  kind: StellarSystemKind;
  stars: StellarBody[];
  primaryStarId: 'A';
  binarySeparation: number;
  outerSeparation: number;
  habitableLabel: string;
}

export interface OrbitHost {
  kind: PlanetOrbitKind;
  starId?: StellarBody['id'];
}

/** Calculates stellar luminosity w. */
export function calculateStellarLuminosityW(starType: string, luminosityFactor: number = 1): number {
  const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES.G;
  return (
    4 *
    Math.PI *
    Math.pow(starInfo.radius ?? SOLAR_RADIUS_M, 2) *
    STEFAN_BOLTZMANN_SIGMA *
    Math.pow(starInfo.temp, 4) *
    luminosityFactor
  );
}

/** Returns primary star. */
export function getPrimaryStar(architecture: StellarArchitecture): StellarBody {
  return architecture.stars.find((star) => star.id === architecture.primaryStarId) ?? architecture.stars[0];
}

/** Returns host label. */
export function getHostLabel(host: OrbitHost): string {
  if (host.kind === 'circumbinary') return 'AB';
  if (host.kind === 'circumstellar') return host.starId ?? 'A';
  return 'Barycenter';
}
