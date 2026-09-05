import { describe, expect, it } from 'vitest';
import {
  ORBIT_CAMERA_DISTANCE,
  orbitSurfaceNormal,
  orbitSunDirection,
  projectOrbitSource,
  orbitSolarIncidence,
} from '../../rendering/scenes/orbit_lighting';

describe('orbital lighting geometry', () => {
  it('places every sampled surface normal on the sphere', () => {
    for (let y = -1; y <= 1; y += 0.1) {
      for (let x = -1; x <= 1; x += 0.1) {
        const n = orbitSurfaceNormal(x, y);
        if (x * x + y * y > 1) expect(n).toBeNull();
        else expect(Math.hypot(n!.x, n!.y, n!.z)).toBeCloseTo(1, 10);
      }
    }
    expect(orbitSurfaceNormal(0, 0)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('aligns stellar limb contact with zero solar incidence at every limb angle', () => {
    for (let angle = 0; angle < 2 * Math.PI; angle += 0.2) {
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const normal = orbitSurfaceNormal(x * (1 - 1e-12), y * (1 - 1e-12))!;
      const sun = {
        x: x / ORBIT_CAMERA_DISTANCE,
        y: y / ORBIT_CAMERA_DISTANCE,
        z: -Math.sqrt(1 - 1 / ORBIT_CAMERA_DISTANCE ** 2),
      };
      const projected = projectOrbitSource(sun)!;
      expect(projected.x).toBeCloseTo(x, 10);
      expect(projected.y).toBeCloseTo(y, 10);
      expect(orbitSolarIncidence(normal, sun)).toBeCloseTo(0, 5);
    }
  });

  it('keeps occulted sources from lighting the visible disc throughout an orbit', () => {
    let eclipsedPhases = 0;
    for (let phase = 0; phase < 1; phase += 0.01) {
      const sun = orbitSunDirection(phase * 2 * Math.PI);
      const projected = projectOrbitSource(sun);
      if (!projected || Math.hypot(projected.x, projected.y) >= 1) continue;
      eclipsedPhases++;
      for (let y = -0.99; y <= 0.99; y += 0.1) {
        for (let x = -0.99; x <= 0.99; x += 0.1) {
          const n = orbitSurfaceNormal(x, y);
          if (n) expect(orbitSolarIncidence(n, sun)).toBeLessThanOrEqual(0);
        }
      }
    }
    expect(eclipsedPhases).toBeGreaterThan(0);
    expect(projectOrbitSource({ x: 0, y: 0, z: 1 })).toBeNull();
  });
});
