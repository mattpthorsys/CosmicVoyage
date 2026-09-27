import type { OrbitHost, StellarArchitecture } from './stellar_body';

export interface StableOrbitRange {
  minRadius: number;
  maxRadius: number;
}

/** Circular, prograde S-type limit with a 10% generation margin inside the empirical boundary. */
function circumstellarLimit(separation: number, hostMass: number, perturberMass: number): number {
  const mu = perturberMass / (hostMass + perturberMass);
  // Holman-Wiegert (1999), e=0. Outside its fitted mass ratios, also limit by the Hill sphere.
  const fitted = (0.464 - 0.38 * Math.max(0.1, Math.min(0.9, mu))) * separation;
  const hill = separation * Math.cbrt(hostMass / (3 * perturberMass)) * 0.4;
  return Math.min(fitted * 0.9, hill);
}

/** Circular, prograde P-type limit with a 10% margin outside the empirical boundary. */
function circumbinaryLimit(separation: number, massA: number, massB: number): number {
  const mu = Math.max(0.1, Math.min(massA, massB) / (massA + massB));
  return separation * (1.6 + 4.12 * mu - 5.09 * mu * mu) * 1.1;
}

/**
 * Shared screening limits for the game's circular coplanar hierarchy, in metres.
 * Triple limits intersect inner/outer binary approximations; they are not an N-body stability proof.
 * A null range means no supported orbit, never permission to invent a fallback planet.
 */
export function getStableOrbitRange(
  architecture: StellarArchitecture,
  host: OrbitHost
): StableOrbitRange | null {
  const a = architecture.stars.find((star) => star.id === 'A');
  const b = architecture.stars.find((star) => star.id === 'B');
  const c = architecture.stars.find((star) => star.id === 'C');
  if (!a || architecture.kind === 'starless') return null;
  if (!b) {
    if (host.kind === 'circumbinary' || (host.kind === 'circumstellar' && (host.starId ?? 'A') !== a.id)) {
      return null;
    }
    return { minRadius: a.radiusM * 3, maxRadius: Infinity };
  }
  const inner = architecture.binarySeparation;
  const outer = architecture.outerSeparation;
  if (!(inner > 0) || (c && !(outer > 0))) return null;
  const abMass = a.massKg + b.massKg;
  let minRadius: number;
  let maxRadius = Infinity;
  if (host.kind === 'circumstellar') {
    const star = architecture.stars.find((candidate) => candidate.id === (host.starId ?? 'A'));
    if (!star) return null;
    minRadius = star.radiusM * 3;
    if (star.id === 'C' && c) {
      maxRadius = circumstellarLimit(outer, c.massKg, abMass);
    } else {
      const companion = star.id === 'A' ? b : a;
      maxRadius = circumstellarLimit(inner, star.massKg, companion.massKg);
      if (c) {
        // The whole local orbit must fit inside the outer pair's inner stable region.
        const hostExcursion = (inner * companion.massKg) / abMass;
        maxRadius = Math.min(maxRadius, circumstellarLimit(outer, abMass, c.massKg) - hostExcursion);
      }
    }
  } else if (host.kind === 'barycentric' && c) {
    minRadius = circumbinaryLimit(outer, abMass, c.massKg);
  } else {
    minRadius = circumbinaryLimit(inner, a.massKg, b.massKg);
    if (c) maxRadius = circumstellarLimit(outer, abMass, c.massKg);
  }
  return minRadius < maxRadius ? { minRadius, maxRadius } : null;
}

/** Uses the same limits as generation when screening an existing orbital radius. */
export function isOrbitWithinStableRange(
  architecture: StellarArchitecture,
  host: OrbitHost,
  radius: number
): boolean {
  const range = getStableOrbitRange(architecture, host);
  return Boolean(range && Number.isFinite(radius) && radius >= range.minRadius && radius <= range.maxRadius);
}
