import type { OrbitHost, StellarArchitecture } from './stellar_body';
import { AU_IN_METERS } from '../constants/physics';
import type { StellarBody } from './stellar_body';

/** Keeps survivors outside both today's photosphere and a white dwarf's former giant envelope. */
function survivalRadius(star: StellarBody): number {
  const evolution = star.environment.evolution;
  return evolution?.stage === 'white-dwarf'
    ? Math.max(star.radiusM * 3, (2 * AU_IN_METERS * evolution.initialMassSolar) / evolution.massSolar)
    : star.radiusM * 3;
}

export interface StableOrbitRange {
  minRadius: number;
  maxRadius: number;
}

/** Prograde S-type limit with a 10% margin inside the Holman-Wiegert boundary. */
function circumstellarLimit(separation: number, hostMass: number, perturberMass: number, e: number): number {
  const mu = perturberMass / (hostMass + perturberMass);
  // Outside the fit's 0.1-0.9 mass-ratio interval, also limit by the periapse Hill sphere.
  const fittedMu = Math.max(0.1, Math.min(0.9, mu));
  const fitted =
    (0.464 - 0.38 * fittedMu - 0.631 * e + 0.586 * fittedMu * e + 0.15 * e * e - 0.198 * fittedMu * e * e) *
    separation;
  const hill = separation * (1 - e) * Math.cbrt(hostMass / (3 * perturberMass)) * 0.4;
  return Math.min(fitted * 0.9, hill);
}

/** Prograde P-type limit with a 10% margin outside the Holman-Wiegert boundary. */
function circumbinaryLimit(separation: number, massA: number, massB: number, e: number): number {
  const mu = Math.max(0.1, Math.min(massA, massB) / (massA + massB));
  return (
    separation *
    (1.6 + 5.1 * e - 2.22 * e * e + 4.12 * mu - 4.27 * mu * e - 5.09 * mu * mu + 4.61 * mu * mu * e * e) *
    1.1
  );
}

/**
 * Shared screening limits for the game's coplanar stellar hierarchy, in metres.
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
    return { minRadius: survivalRadius(a), maxRadius: Infinity };
  }
  const inner = architecture.binarySeparation;
  const outer = architecture.outerSeparation;
  const innerE = b.orbit?.eccentricity ?? 0;
  const outerE = c?.orbit?.eccentricity ?? 0;
  if (!(inner > 0) || (c && !(outer > 0)) || innerE < 0 || innerE >= 1 || outerE < 0 || outerE >= 1) {
    return null;
  }
  const abMass = a.massKg + b.massKg;
  const innerEnvelope = Math.max(
    (inner * (1 + innerE) * b.massKg) / abMass + survivalRadius(a),
    (inner * (1 + innerE) * a.massKg) / abMass + survivalRadius(b)
  );
  let minRadius: number;
  let maxRadius = Infinity;
  if (host.kind === 'circumstellar') {
    const star = architecture.stars.find((candidate) => candidate.id === (host.starId ?? 'A'));
    if (!star) return null;
    minRadius = survivalRadius(star);
    if (star.id === 'C' && c) {
      maxRadius = circumstellarLimit(outer, c.massKg, abMass, outerE);
    } else {
      const companion = star.id === 'A' ? b : a;
      maxRadius = circumstellarLimit(inner, star.massKg, companion.massKg, innerE);
      if (c) {
        // The whole local orbit must fit inside the outer pair's inner stable region.
        const hostExcursion = (inner * (1 + innerE) * companion.massKg) / abMass;
        maxRadius = Math.min(maxRadius, circumstellarLimit(outer, abMass, c.massKg, outerE) - hostExcursion);
      }
    }
  } else if (host.kind === 'barycentric' && c) {
    minRadius = Math.max(
      circumbinaryLimit(outer, abMass, c.massKg, outerE),
      (outer * (1 + outerE) * c.massKg) / (abMass + c.massKg) + innerEnvelope,
      (outer * (1 + outerE) * abMass) / (abMass + c.massKg) + survivalRadius(c)
    );
  } else {
    minRadius = Math.max(circumbinaryLimit(inner, a.massKg, b.massKg, innerE), innerEnvelope);
    if (c) maxRadius = circumstellarLimit(outer, abMass, c.massKg, outerE);
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

/** Finds the nearest circular station orbit outside the encounter zones of same-host planets. */
export function findUncrowdedStationOrbit(
  preferredRadius: number,
  range: StableOrbitRange,
  planets: readonly { orbitDistance: number; mass: number }[],
  hostMass: number
): number | null {
  if (!(hostMass > 0) || !(range.minRadius < range.maxRadius) || !Number.isFinite(preferredRadius))
    return null;
  const margin = Math.min(range.minRadius * 0.05, (range.maxRadius - range.minRadius) * 0.05);
  const lower = range.minRadius + margin;
  const upper = range.maxRadius - margin;
  if (!(lower <= upper)) return null;
  const preferred = Math.max(lower, Math.min(preferredRadius, upper));
  const candidates = [preferred, lower];
  if (Number.isFinite(upper)) candidates.push(upper);
  const excluded = planets
    .filter((planet) => planet.orbitDistance > 0 && planet.mass > 0)
    .map((planet) => {
      const hillRadius = planet.orbitDistance * Math.cbrt(planet.mass / (3 * hostMass));
      const clearance = Math.max(0.01 * AU_IN_METERS, 5 * hillRadius);
      const epsilon = 1e-8 * Math.max(AU_IN_METERS, planet.orbitDistance);
      candidates.push(planet.orbitDistance - clearance - epsilon, planet.orbitDistance + clearance + epsilon);
      return { min: planet.orbitDistance - clearance, max: planet.orbitDistance + clearance };
    });
  return (
    candidates
      .filter(
        (radius) =>
          radius >= lower &&
          radius <= upper &&
          excluded.every((zone) => radius < zone.min || radius > zone.max)
      )
      .sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred))[0] ?? null
  );
}

/** Maximum tidal strength from two stars sharing a barycentre, at either conjunction. */
function binaryTidalStrength(distance: number, separation: number, massA: number, massB: number): number {
  const total = massA + massB;
  const aRadius = (separation * massB) / total;
  const bRadius = (separation * massA) / total;
  if (distance <= Math.max(aRadius, bRadius)) return Infinity;
  return Math.max(
    massA / (distance - aRadius) ** 3 + massB / (distance + bRadius) ** 3,
    massA / (distance + aRadius) ** 3 + massB / (distance - bRadius) ** 3
  );
}

/** Conservative moon Hill radius across stellar conjunctions in the circular planet model. */
export function getConservativeSatelliteHillRadius(
  architecture: StellarArchitecture,
  host: OrbitHost,
  orbitRadius: number,
  planetMass: number
): number {
  const a = architecture.stars.find((star) => star.id === 'A');
  const b = architecture.stars.find((star) => star.id === 'B');
  const c = architecture.stars.find((star) => star.id === 'C');
  if (!a || !(orbitRadius > 0) || !(planetMass > 0) || !Number.isFinite(orbitRadius + planetMass)) {
    return 0;
  }
  if (!b) return orbitRadius * Math.cbrt(planetMass / (3 * a.massKg));
  if (host.kind === 'circumstellar' && host.starId === 'C' && !c) return 0;

  const abMass = a.massKg + b.massKg;
  const innerApo = architecture.binarySeparation * (1 + (b.orbit?.eccentricity ?? 0));
  const outerPeri = c ? architecture.outerSeparation * (1 - (c.orbit?.eccentricity ?? 0)) : Infinity;
  const aExcursion = (innerApo * b.massKg) / abMass;
  const bExcursion = (innerApo * a.massKg) / abMass;
  let tidalStrength: number;

  if (host.kind === 'circumstellar' && host.starId === 'C' && c) {
    tidalStrength =
      c.massKg / orbitRadius ** 3 +
      binaryTidalStrength(outerPeri - orbitRadius, innerApo, a.massKg, b.massKg);
  } else if (host.kind === 'circumstellar') {
    const central = host.starId === 'B' ? b : a;
    const companion = host.starId === 'B' ? a : b;
    const excursion = host.starId === 'B' ? bExcursion : aExcursion;
    const innerPeri = architecture.binarySeparation * (1 - (b.orbit?.eccentricity ?? 0));
    if (orbitRadius >= innerPeri || (c && orbitRadius >= outerPeri - excursion)) return 0;
    tidalStrength = central.massKg / orbitRadius ** 3 + companion.massKg / (innerPeri - orbitRadius) ** 3;
    if (c) tidalStrength += c.massKg / (outerPeri - excursion - orbitRadius) ** 3;
  } else if (host.kind === 'circumbinary' || !c) {
    tidalStrength = binaryTidalStrength(orbitRadius, innerApo, a.massKg, b.massKg);
    if (c) {
      if (orbitRadius >= outerPeri) return 0;
      tidalStrength += c.massKg / (outerPeri - orbitRadius) ** 3;
    }
  } else {
    // A circumbarycentric planet may pass either the AB pair or C at conjunction.
    const outerApo = architecture.outerSeparation * (1 + (c.orbit?.eccentricity ?? 0));
    const abExcursion = (outerApo * c.massKg) / (abMass + c.massKg);
    const cExcursion = (outerApo * abMass) / (abMass + c.massKg);
    if (orbitRadius <= abExcursion + Math.max(aExcursion, bExcursion) || orbitRadius <= cExcursion) {
      return 0;
    }
    tidalStrength = Math.max(
      binaryTidalStrength(orbitRadius - abExcursion, innerApo, a.massKg, b.massKg) +
        c.massKg / (orbitRadius + cExcursion) ** 3,
      binaryTidalStrength(orbitRadius + abExcursion, innerApo, a.massKg, b.massKg) +
        c.massKg / (orbitRadius - cExcursion) ** 3
    );
  }
  return Number.isFinite(tidalStrength) && tidalStrength > 0
    ? Math.cbrt(planetMass / (3 * tidalStrength))
    : 0;
}
