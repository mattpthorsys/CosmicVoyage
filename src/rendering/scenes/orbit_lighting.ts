export interface OrbitVector {
  x: number;
  y: number;
  z: number;
}

// Camera distance in planet radii. The same pinhole camera projects both the
// globe and distant stars; a star at the limb must graze a sunlit surface normal.
export const ORBIT_CAMERA_DISTANCE = 3;
export const ORBIT_FOCAL_FACTOR = Math.sqrt(ORBIT_CAMERA_DISTANCE ** 2 - 1);

/** Returns the light direction in the orbit camera frame (positive z faces the viewer). */
export function orbitSunDirection(phaseRadians: number): OrbitVector {
  const longitude = -0.55 - phaseRadians;
  const latitude = 0.12;
  return {
    x: Math.cos(latitude) * Math.sin(longitude),
    y: Math.sin(latitude),
    z: Math.cos(latitude) * Math.cos(longitude),
  };
}

/** Intersects a camera ray with the unit globe; x/y are normalized image coordinates, y up. */
export function orbitSurfaceNormal(x: number, y: number): OrbitVector | null {
  const r2 = x * x + y * y;
  if (r2 > 1) return null;
  const rayX = x / ORBIT_FOCAL_FACTOR;
  const rayY = y / ORBIT_FOCAL_FACTOR;
  const t = (ORBIT_CAMERA_DISTANCE - Math.sqrt(Math.max(0, 1 - r2))) / (1 + rayX * rayX + rayY * rayY);
  return { x: t * rayX, y: t * rayY, z: ORBIT_CAMERA_DISTANCE - t };
}

/** Projects a distant source onto the image plane in planet-radius units; y points up. */
export function projectOrbitSource(sun: OrbitVector): { x: number; y: number } | null {
  if (sun.z >= -0.0001) return null;
  return { x: (ORBIT_FOCAL_FACTOR * sun.x) / -sun.z, y: (ORBIT_FOCAL_FACTOR * sun.y) / -sun.z };
}

/** Keeps the sign of the solar incidence so twilight can straddle the terminator. */
export function orbitSolarIncidence(normal: OrbitVector, sun: OrbitVector): number {
  return normal.x * sun.x + normal.y * sun.y + normal.z * sun.z;
}
