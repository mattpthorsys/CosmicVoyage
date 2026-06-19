import { CONFIG } from '../config';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import { NebulaColourSampler } from './nebula_colour_sampler';
import {
  createHyperspaceTile,
  HyperspaceTileRequest,
  HyperspaceTileSample,
} from './hyperspace_tile_generation';

export interface HyperspaceTileGenerationProvider {
  getTilesAsync(requests: readonly HyperspaceTileRequest[]): Promise<HyperspaceTileSample[]>;
  clearCache(): void;
}

export class LocalHyperspaceTileGenerationProvider implements HyperspaceTileGenerationProvider {
  private readonly generator: SystemDataGenerator;
  private readonly nebulaSampler: NebulaColourSampler;

  /** Initializes a deterministic local complete-tile generator. */
  constructor(seed = CONFIG.SEED) {
    this.generator = new SystemDataGenerator(new PRNG(seed));
    this.nebulaSampler = new NebulaColourSampler(`${seed}_nebula`);
  }

  /** Generates complete hyperspace tiles without crossing a worker boundary. */
  getTilesAsync(requests: readonly HyperspaceTileRequest[]): Promise<HyperspaceTileSample[]> {
    return Promise.resolve().then(() =>
      requests.map(({ worldX, worldY, rangeCells }) => {
        const system = this.generator.getSystemMapProperties(worldX, worldY);
        const phenomenon = system.exists
          ? null
          : this.generator.getDeepSpacePhenomenonProperties(worldX, worldY);
        const bg = this.nebulaSampler.sample(worldX, worldY);
        return {
          worldX,
          worldY,
          rangeCells,
          tile: createHyperspaceTile(bg, system, phenomenon, worldX, worldY, rangeCells),
        };
      })
    );
  }

  /** Clears local procedural-generation caches. */
  clearCache(): void {
    this.generator.clearCache();
    this.nebulaSampler.clearCache();
  }
}

let tileGenerationProvider: HyperspaceTileGenerationProvider = new LocalHyperspaceTileGenerationProvider();

/** Updates the provider used for speculative complete-tile generation. */
export function setHyperspaceTileGenerationProvider(provider: HyperspaceTileGenerationProvider): void {
  tileGenerationProvider = provider;
}

/** Returns the configured complete-tile generation provider. */
export function getHyperspaceTileGenerationProvider(): HyperspaceTileGenerationProvider {
  return tileGenerationProvider;
}
