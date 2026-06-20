import { describe, expect, it, vi } from 'vitest';
import { Planet } from '../../../entities/planet';
import { readReadySurfaceData } from '../../../entities/planet/surface_data';

/** Creates a minimal Planet instance without running characteristic generation. */
function createUnpreparedPlanet(): {
  planet: Planet;
  ensureSurfaceReady: ReturnType<typeof vi.fn>;
} {
  const fixture = Object.create(Planet.prototype) as {
    _surfaceData: null;
    ensureSurfaceReady: ReturnType<typeof vi.fn>;
  };
  fixture._surfaceData = null;
  fixture.ensureSurfaceReady = vi.fn();
  return {
    planet: fixture as unknown as Planet,
    ensureSurfaceReady: fixture.ensureSurfaceReady,
  };
}

describe('Planet surface readiness', () => {
  it('keeps surface accessors cache-only when data is not ready', () => {
    const { planet, ensureSurfaceReady } = createUnpreparedPlanet();

    expect(planet.heightmap).toBeNull();
    expect(planet.heightLevelColors).toBeNull();
    expect(planet.rgbPaletteCache).toBeNull();
    expect(planet.surfaceElementMap).toBeNull();
    expect(planet.surfaceLiquid).toBeNull();
    expect(ensureSurfaceReady).not.toHaveBeenCalled();
  });

  it('reads own-property fixture data without requiring Planet generation methods', () => {
    const heightmap = [[42]];
    const surfaceElementMap = [['IRON']];

    expect(readReadySurfaceData({ heightmap, surfaceElementMap } as never)).toMatchObject({
      heightmap,
      surfaceElementMap,
    });
  });
});
