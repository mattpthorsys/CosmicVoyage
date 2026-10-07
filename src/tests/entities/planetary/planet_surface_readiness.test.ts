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
import { createSurfaceSettlementLayer } from '../../../entities/planet/surface_settlements';
import { settlementTerrainFixture, settlementTerraformingFixture } from '../../fixtures/settlements';

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
    expect(requests[0].settlementProfile).toBeUndefined();
    expect(requests[1].settlementProfile).toEqual({
      stage: 'complete',
      diameterKm: planet.diameter,
      breathable: true,
    });
  });

  it('regenerates the same city layer after renaming and reapplying identical colony inputs', () => {
    const requests: SurfaceGenerationRequest[] = [];
    const terrain = settlementTerrainFixture('dry');
    setSurfaceGenerationProvider({
      generateSurfaceData: (request) => {
        requests.push(request);
        return {
          ...surfacePackage(108),
          heightmap: terrain.heightmap,
          settlements: createSurfaceSettlementLayer(
            request.mapSeed,
            terrain.heightmap,
            null,
            request.settlementProfile
          ),
        };
      },
    });
    const planet = new Planet('Colony I', 'Rock', AU_IN_METERS, 0, new PRNG('city-renaming'), 'G2V');
    const environment = settlementTerraformingFixture('complete');
    planet.applyTerraforming(environment, 'First Name');
    planet.ensureSurfaceReady();
    const first = readReadySurfaceData(planet)?.settlements;
    expect(first?.sites.length).toBeGreaterThan(0);
    planet.applyTerraforming(environment, 'Second Name');
    expect(readReadySurfaceData(planet)).toBeNull();
    planet.ensureSurfaceReady();
    expect(readReadySurfaceData(planet)?.settlements).toEqual(first);
    expect(requests[0].mapSeed).toBe(requests[1].mapSeed);
    expect(requests[0].settlementProfile).toEqual(requests[1].settlementProfile);
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

  it('does not publish an obsolete colony layer when its worker completes after a colony revision', async () => {
    const terrain = settlementTerrainFixture('dry');
    const pending: { request: SurfaceGenerationRequest; resolve: (surface: SurfaceData) => void }[] = [];
    setSurfaceGenerationProvider({
      generateSurfaceData: () => surfacePackage(0),
      generateSurfaceDataAsync: (request) =>
        new Promise<SurfaceData>((resolve) => pending.push({ request, resolve })),
    });
    const planet = new Planet('Changing I', 'Rock', AU_IN_METERS, 0, new PRNG('city-race'), 'G2V');
    planet.applyTerraforming(settlementTerraformingFixture('partial'));
    const oldPreparation = planet.prepareSurfaceReady();
    planet.applyTerraforming(settlementTerraformingFixture('complete'));
    const currentPreparation = planet.prepareSurfaceReady();
    /** Builds a response from the exact profile captured by each queued worker request. */
    const response = (request: SurfaceGenerationRequest): SurfaceData => ({
      ...surfacePackage(108),
      heightmap: terrain.heightmap,
      settlements: createSurfaceSettlementLayer(
        request.mapSeed,
        terrain.heightmap,
        null,
        request.settlementProfile
      ),
    });
    pending[0].resolve(response(pending[0].request));
    await Promise.resolve();
    expect(readReadySurfaceData(planet)).toBeNull();
    const current = response(pending[1].request);
    pending[1].resolve(current);
    await Promise.all([oldPreparation, currentPreparation]);
    expect(readReadySurfaceData(planet)?.settlements).toBe(current.settlements);
    expect(current.settlements?.sites.some((site) => site.archetype === 'urban')).toBe(true);
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
      settlements: null,
    });
    const terrain = settlementTerrainFixture('dry');
    const settlements = createSurfaceSettlementLayer('adapter', terrain.heightmap, null, {
      stage: 'partial',
      diameterKm: 12800,
      breathable: false,
    });
    expect(readReadySurfaceData({ heightmap, settlements } as never)?.settlements).toBe(settlements);
  });
});
