import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateSurfaceDataFromRequest,
  SurfaceGenerator,
  type SurfaceData,
  type SurfaceGenerationRequest,
} from '../../../entities/planet/surface_generator';
import * as heightmaps from '../../../entities/planet/heightmap_generator';
import { settlementTerrainFixture } from '../../fixtures/settlements';
import { PRNG } from '../../../utils/prng';
import { MineralRichness } from '../../../constants/resources';
import { SolarSystem } from '../../../entities/solar_system';
import { SystemDataGenerator } from '../../../generation/system_data_generator';
import { CONFIG } from '../../../config';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Holds natural surface inputs constant while varying the optional human-colony profile. */
function request(withCities: boolean): SurfaceGenerationRequest {
  return {
    planetType: 'Rock',
    mapSeed: 'city-integration-map',
    prngSeed: 'city-integration',
    atmosphere: { density: 'Earth-like', pressure: 1, composition: { Nitrogen: 79, Oxygen: 21 } },
    planetAbundance: { IRON: 0.3, SILICON: 0.2 },
    profile: {
      mineralRichness: MineralRichness.AVERAGE,
      baseMinerals: 1,
      metallicityFeH: 0,
      surfaceTemp: 288,
      hydrosphere: 'None',
    },
    settlementProfile: withCities ? { stage: 'complete', diameterKm: 12800, breathable: true } : undefined,
  };
}

/** Supplies controlled small ground so integration checks exercise the real remaining generation pipeline. */
function useSmallTerrain(): void {
  const terrain = settlementTerrainFixture('dry');
  vi.spyOn(heightmaps, 'generateHeightmap').mockImplementation(() => structuredClone(terrain.heightmap));
}

/** Excludes only the new decoration from a comparison of every existing prepared surface field. */
function naturalSurface(surface: SurfaceData): Omit<SurfaceData, 'settlements'> {
  const { settlements: _settlements, ...natural } = surface;
  return natural;
}

describe('settlement surface preparation', () => {
  it('prepares valid city data for the real starting colony', () => {
    const root = new PRNG(CONFIG.SEED);
    const generator = new SystemDataGenerator(root);
    const x = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
    const y = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
    const system = new SolarSystem(generator.getSystemProperties(x, y), x, y, root);
    const colony = system.colonyWorld!;
    expect(colony.terraforming?.stage).toBe('complete');
    colony.ensureSurfaceReady();
    const layer = colony.getSurfaceDataIfReady()?.settlements;
    expect(layer?.sites.length).toBeGreaterThan(0);
    expect(layer?.sourceWidth).toBe(colony.heightmap?.[0].length);
    expect(system.settlementStage).toBe('complete');
  });

  it('preserves every natural surface field when optional city generation is enabled', () => {
    useSmallTerrain();
    const natural = generateSurfaceDataFromRequest(request(false));
    const inhabited = generateSurfaceDataFromRequest(request(true));
    expect(inhabited.settlements?.sites.length).toBeGreaterThan(0);
    expect(natural.settlements).toBeNull();
    expect(naturalSurface(inhabited)).toEqual(naturalSurface(natural));
    expect(generateSurfaceDataFromRequest(request(true))).toEqual(inhabited);
  });

  it('does not consume any extra caller-owned resource PRNG state through the legacy synchronous wrapper', () => {
    useSmallTerrain();
    const input = request(true);
    const without = new PRNG(input.prngSeed);
    const withCities = new PRNG(input.prngSeed);
    const natural = new SurfaceGenerator(
      input.planetType,
      input.mapSeed,
      without,
      input.atmosphere
    ).generateSurfaceData(input.planetAbundance, input.profile);
    const inhabited = new SurfaceGenerator(
      input.planetType,
      input.mapSeed,
      withCities,
      input.atmosphere
    ).generateSurfaceData(input.planetAbundance, input.profile, input.settlementProfile);
    expect(inhabited.settlements?.sites.length).toBeGreaterThan(0);
    expect(naturalSurface(inhabited)).toEqual(naturalSurface(natural));
    expect(withCities.next()).toBe(without.next());
    expect(inhabited).toEqual(generateSurfaceDataFromRequest(input));
  });

  it('returns exactly the same prepared package through the actual worker message handler', async () => {
    useSmallTerrain();
    const scope = { onmessage: null as ((event: MessageEvent) => void) | null };
    const post = vi.fn<(message: { id: number; ok: boolean; data?: SurfaceData; error?: string }) => void>();
    vi.stubGlobal('self', scope);
    vi.stubGlobal('postMessage', post);
    await import('../../../entities/planet/surface_generation_worker');
    const input = structuredClone(request(true));
    scope.onmessage!(new MessageEvent('message', { data: { id: 17, request: input } }));
    expect(post).toHaveBeenCalledTimes(1);
    const response = post.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.id).toBe(17);
    expect(structuredClone(response.data)).toEqual(generateSurfaceDataFromRequest(input));
  });

  it('does not create surface cities for giant atmospheres even if a malformed caller supplies a profile', () => {
    const surface = generateSurfaceDataFromRequest({ ...request(true), planetType: 'GasGiant' });
    expect(surface.heightmap).toBeNull();
    expect(surface.settlements).toBeNull();
  });
});
