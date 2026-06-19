import { describe, expect, it } from 'vitest';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { HyperspaceTileProvider } from '../../rendering/hyperspace_tile_provider';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { CONFIG } from '../../config';
import { HyperspaceTileGenerationProvider } from '../../rendering/hyperspace_tile_generation_provider';

/** Creates nebula renderer. */
function createNebulaRenderer(): NebulaRenderer {
  return {
    getBackgroundColor: () => '#010203',
    prefetchRegion: () => {},
  } as unknown as NebulaRenderer;
}

/** Waits for the next queued asynchronous task to complete. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('HyperspaceTileProvider', () => {
  it('hides brown dwarfs beyond their detection radius', () => {
    const generator = {
      getSystemMapProperties: () => ({
        exists: true,
        starType: 'T5',
        name: 'Faint ember',
        hasStarbase: false,
        objectKind: 'brown-dwarf',
      }),
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const provider = new HyperspaceTileProvider(createNebulaRenderer(), generator);

    const distant = provider.getTile(10, 10, CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS + 1);
    const near = provider.getTile(10, 10, CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS);

    expect(distant).toEqual({ bg: '#010203', starChar: null, starColor: null });
    expect(near.starChar).toBeTruthy();
    expect(near.starColor).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('renders deep-space phenomena only within detection range', () => {
    const generator = {
      getSystemMapProperties: () => ({
        exists: false,
        starType: null,
        name: null,
        hasStarbase: false,
        objectKind: null,
      }),
      getDeepSpacePhenomenonProperties: () => ({
        exists: true,
        type: 'ancient-signal',
        name: 'Whisper',
        classification: 'ancient artificial carrier',
        signal: 'narrowband',
        char: '?',
        colour: '#40CFC0',
        rarity: 'rare',
      }),
    } as unknown as SystemDataGenerator;
    const provider = new HyperspaceTileProvider(createNebulaRenderer(), generator);

    const near = provider.getTile(20, -4, CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS);
    const distant = provider.getTile(20, -4, CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS + 1);

    expect(near.starChar).toBe('?');
    expect(near.starColor).toBe('#288077');
    expect(distant.starChar).toBeNull();
  });

  it('warms whole hyperspace tiles asynchronously without blocking the current call', async () => {
    let mapCalls = 0;
    let workerCalls = 0;
    const generator = {
      getSystemMapProperties: () => {
        mapCalls++;
        return {
          exists: false,
          starType: null,
          name: null,
          hasStarbase: false,
          objectKind: null,
        };
      },
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const tileGenerationProvider: HyperspaceTileGenerationProvider = {
      getTilesAsync: async (requests) => {
        workerCalls++;
        return requests.map(({ worldX, worldY, rangeCells }) => ({
          worldX,
          worldY,
          rangeCells,
          tile: { bg: '#010203', starChar: null, starColor: null },
        }));
      },
      clearCache: () => undefined,
    };
    const provider = new HyperspaceTileProvider(createNebulaRenderer(), generator, tileGenerationProvider);

    provider.prefetchTileRegion(100, 200, 3, 3, 1, 1);

    expect(mapCalls).toBe(0);
    await nextTask();
    expect(workerCalls).toBe(1);
    expect(mapCalls).toBe(0);

    provider.getTile(101, 201, 0);
    expect(mapCalls).toBe(0);
  });

  it('does not rescan an unchanged viewport for tile prefetching', async () => {
    let workerCalls = 0;
    const generator = {
      getSystemMapProperties: () => ({
        exists: false,
        starType: null,
        name: null,
        hasStarbase: false,
        objectKind: null,
      }),
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const tileGenerationProvider: HyperspaceTileGenerationProvider = {
      getTilesAsync: async (requests) => {
        workerCalls++;
        return requests.map(({ worldX, worldY, rangeCells }) => ({
          worldX,
          worldY,
          rangeCells,
          tile: { bg: '#010203', starChar: null, starColor: null },
        }));
      },
      clearCache: () => undefined,
    };
    const provider = new HyperspaceTileProvider(createNebulaRenderer(), generator, tileGenerationProvider);

    provider.prefetchTileRegion(100, 200, 3, 3, 1, 1);
    await nextTask();
    provider.prefetchTileRegion(100, 200, 3, 3, 1, 1);
    await nextTask();

    expect(workerCalls).toBe(1);
  });
});
