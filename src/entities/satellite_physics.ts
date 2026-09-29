/** Minimal physical state needed for satellite and circular-orbit screening. */
interface PhysicalBody {
  mass: number; // kg
  diameter: number; // km
  density: number; // g/cm^3
}

/** Conservative fluid Roche limit; strength-supported rubble is not a generated major moon. */
export function fluidRocheLimitM(parent: PhysicalBody, moon: PhysicalBody): number {
  return 2.44 * parent.diameter * 500 * Math.cbrt(parent.density / moon.density);
}

/** Screens circular neighbouring orbits, not resonances or long-term N-body stability. */
export function sufficientlySeparated(
  first: { orbitDistance: number; mass: number },
  second: { orbitDistance: number; mass: number },
  hostMass: number,
  hillRadii = 8
): boolean {
  if (hostMass <= 0 || first.mass <= 0 || second.mass <= 0) return false;
  const mutualHill =
    (Math.cbrt((first.mass + second.mass) / (3 * hostMass)) * (first.orbitDistance + second.orbitDistance)) /
    2;
  return Math.abs(first.orbitDistance - second.orbitDistance) > hillRadii * mutualHill;
}

/** Allows impact moons around solids but caps regular giant-planet satellite inventories. */
export function satelliteMassBudget(parent: PhysicalBody & { type: string }): number {
  // Broad ceilings, not fitted occurrence rates: giant systems cluster near 10^-4;
  // terrestrial impact moons can be much heavier (Earth's Moon is about 1.2%).
  return parent.mass * (['GasGiant', 'IceGiant'].includes(parent.type) ? 0.001 : 0.04);
}

/** Checks mass hierarchy, collisions, disruption, and adjacent satellite spacing. */
export function canAddSatellite(
  parent: PhysicalBody & { type: string; moons: (PhysicalBody & { orbitDistance: number })[] },
  moon: PhysicalBody,
  orbitDistance: number
): boolean {
  const massUsed = parent.moons.reduce((sum, body) => sum + body.mass, 0);
  if (moon.mass <= 0 || massUsed + moon.mass > satelliteMassBudget(parent)) return false;
  if (orbitDistance <= Math.max(fluidRocheLimitM(parent, moon), (parent.diameter + moon.diameter) * 500)) {
    return false;
  }
  return parent.moons.every((other) =>
    sufficientlySeparated(other, { mass: moon.mass, orbitDistance }, parent.mass)
  );
}
