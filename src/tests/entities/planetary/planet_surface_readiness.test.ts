import { afterEach, describe, expect, it, vi } from 'vitest';
import { Planet } from '../../../entities/planet';
import { readReadySurfaceData } from '../../../entities/planet/surface_data';
import { AU_IN_METERS } from '../../../constants/physics';
import { PRNG } from '../../../utils/prng';
import type { TerraformingProfile } from '../../../entities/habitability';
import type { SurfaceData, SurfaceGenerationRequest } from '../../../entities/planet/surface_generator';
import {
  getSurfaceGenerationProvider,
  setSurfaceGenerationProvider,
} from '../../../entities/planet/surface_generation_provider';

const initialProvider = getSurfaceGenerationProvider();
afterEach(() => setSurfaceGenerationProvider(initialProvider));

/** Supplies a managed environment independently of procedural settlement selection. */
function managedEnvironment(): TerraformingProfile {
  return {
    stage: 'complete',
    atmosphere: {
      density: 'Earth-like',
      pressure: 1,
      composition: { Nitrogen: 78.96, Oxygen: 21, 'Carbon Dioxide': 0.04 },
    },
    meanTemperatureK: 288,
    minTemperatureK: 245,
    maxTemperatureK: 320,
    hydrosphereFraction: 0.63,
    biosphereStage: 'managed biosphere',
    engineeringSupport: [],
    habitabilityScore: 90,
    climate: {
      minStellarFluxWm2: 1361,
      maxStellarFluxWm2: 1361,
      bondAlbedo: 0.3,
      greenhouseWarmingK: 33,
      radiativeControlWm2: 0,
    },
  };
}

/** Provides a complete small surface package for cache and worker lifecycle tests. */
function surfacePackage(height: number): SurfaceData {
  return {
    heightmap: [[height]],
    heightLevelColors: ['#123456'],
    surfaceElementMap: [['']],
    rgbPaletteCache: null,
    liquidOverlay: null,
    materialMap: null,
  };
}

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
  it('refreshes managed water and vegetation without changing natural terrain identity', () => {
    const requests: SurfaceGenerationRequest[] = [];
    setSurfaceGenerationProvider({
      generateSurfaceData: (request) => {
        requests.push(request);
        return surfacePackage(requests.length);
      },
    });
    const planet = new Planet('Natural I', 'Rock', AU_IN_METERS, 0, new PRNG('surface-environment'), 'G2V');
    planet.ensureSurfaceReady();
    const mapSeed = planet.mapSeed;
    planet.applyTerraforming(managedEnvironment(), 'Arcadia');
    expect(planet.isSurfaceReady()).toBe(false);
    planet.ensureSurfaceReady();
    expect(planet.heightmap).toEqual([[2]]);
    expect(planet.name).toBe('Arcadia');
    expect(planet.catalogueName).toBe('Natural I');
    expect(planet.mapSeed).toBe(mapSeed);
    expect(requests[1].terrainAtmosphere).toEqual(requests[0].terrainAtmosphere);
    expect(requests[1].atmosphere).toBe(planet.effectiveAtmosphere);
    expect(requests[1].profile?.managedWaterFraction).toBe(0.63);
  });

  it('waits for the latest environment when an older worker finishes after terraforming changes', async () => {
    const resolve: ((surface: SurfaceData) => void)[] = [];
    setSurfaceGenerationProvider({
      generateSurfaceData: () => surfacePackage(0),
      generateSurfaceDataAsync: () => new Promise<SurfaceData>((complete) => resolve.push(complete)),
    });
    const planet = new Planet('Worker I', 'Rock', AU_IN_METERS, 0, new PRNG('surface-race'), 'G2V');
    const oldPreparation = planet.prepareSurfaceReady();
    planet.applyTerraforming(managedEnvironment());
    const newPreparation = planet.prepareSurfaceReady();
    resolve[0](surfacePackage(1));
    await Promise.resolve();
    expect(planet.isSurfaceReady()).toBe(false);
    expect(planet.isSurfacePreparing()).toBe(true);
    resolve[1](surfacePackage(2));
    await Promise.all([oldPreparation, newPreparation]);
    expect(planet.heightmap).toEqual([[2]]);
    expect(planet.isSurfacePreparing()).toBe(false);
    expect(resolve).toHaveLength(2);
  });

  it('describes frozen managed water as ice rather than as open surface oceans', () => {
    const planet = new Planet('Cold I', 'Rock', AU_IN_METERS, 0, new PRNG('surface-phase'), 'G2V');
    planet.applyTerraforming({ ...managedEnvironment(), stage: 'partial', meanTemperatureK: 260 });
    expect(planet.effectiveHydrosphere).toContain('surface ice');
  });

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
