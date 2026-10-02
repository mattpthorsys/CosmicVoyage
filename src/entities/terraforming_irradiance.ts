import type { OrbitHost, StellarArchitecture, StellarBody } from './stellar_body';

export interface StellarDistanceBounds {
  star: StellarBody;
  minDistanceM: number;
  maxDistanceM: number;
}

/** Bounds illumination over all phases of the game's circular planetary and hierarchical stellar orbits. */
export function getTerraformingStellarDistances(
  architecture: StellarArchitecture,
  host: OrbitHost,
  planetRadiusM: number
): StellarDistanceBounds[] {
  const a = architecture.stars.find((star) => star.id === 'A');
  const b = architecture.stars.find((star) => star.id === 'B');
  const c = architecture.stars.find((star) => star.id === 'C');
  if (!a || !(planetRadiusM > 0) || !Number.isFinite(planetRadiusM)) return [];
  const innerE = b?.orbit?.eccentricity ?? 0;
  const outerE = c?.orbit?.eccentricity ?? 0;
  const abMass = a.massKg + (b?.massKg ?? 0);
  const innerApo = architecture.binarySeparation * (1 + innerE);
  const outerPeri = architecture.outerSeparation * (1 - outerE);
  const outerApo = architecture.outerSeparation * (1 + outerE);
  const hostStar =
    host.kind === 'circumstellar'
      ? architecture.stars.find((star) => star.id === (host.starId ?? 'A'))
      : null;
  if (host.kind === 'circumstellar' && !hostStar) return [];

  return architecture.stars.map((star) => {
    let minRadius = 0;
    let maxRadius = 0;
    if (hostStar) {
      if (star.id === hostStar.id) {
        return { star, minDistanceM: planetRadiusM, maxDistanceM: planetRadiusM };
      }
      if (star.id !== 'C' && hostStar.id !== 'C') {
        minRadius = architecture.binarySeparation * (1 - innerE);
        maxRadius = innerApo;
      } else {
        const innerStar = star.id === 'C' ? hostStar : star;
        const innerExcursion = (innerApo * (innerStar.id === 'A' ? (b?.massKg ?? 0) : a.massKg)) / abMass;
        minRadius = Math.max(0, outerPeri - innerExcursion);
        maxRadius = outerApo + innerExcursion;
      }
    } else if (host.kind === 'circumbinary' || !c) {
      if (star.id === 'C') {
        minRadius = outerPeri;
        maxRadius = outerApo;
      } else if (b) {
        const share = (star.id === 'A' ? b.massKg : a.massKg) / abMass;
        minRadius = architecture.binarySeparation * (1 - innerE) * share;
        maxRadius = innerApo * share;
      }
    } else {
      // In a triple, the AB centre and C also move around the full-system barycentre.
      const outerShare = star.id === 'C' ? abMass / (abMass + c.massKg) : c.massKg / (abMass + c.massKg);
      const innerExcursion =
        star.id === 'C' ? 0 : (innerApo * (star.id === 'A' ? (b?.massKg ?? 0) : a.massKg)) / abMass;
      minRadius = Math.max(0, outerPeri * outerShare - innerExcursion);
      maxRadius = outerApo * outerShare + innerExcursion;
    }
    // These independent extrema deliberately give a conservative climate screen.
    const closest = Math.max(0, minRadius - planetRadiusM, planetRadiusM - maxRadius);
    return {
      star,
      minDistanceM: Math.max(star.radiusM, closest),
      maxDistanceM: planetRadiusM + maxRadius,
    };
  });
}
