import { describe, expect, it } from 'vitest';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import { NebulaColourSampler } from '../../rendering/nebula_colour_sampler';
import { createHyperspaceTile } from '../../rendering/hyperspace_tile_generation';
import { LocalHyperspaceTileGenerationProvider } from '../../rendering/hyperspace_tile_generation_provider';

describe('complete hyperspace tile generation', () => {
  it('matches synchronous domain and nebula composition for the same seed', async () => {
    const seed = 'complete-tile-worker-parity';
    const requests = [
      { worldX: -12, worldY: 8, rangeCells: 4 },
      { worldX: 27, worldY: -19, rangeCells: 13 },
      { worldX: 64, worldY: 41, rangeCells: 31 },
    ];
    const provider = new LocalHyperspaceTileGenerationProvider(seed);
    const generator = new SystemDataGenerator(new PRNG(seed));
    const nebula = new NebulaColourSampler(`${seed}_nebula`);

    const samples = await provider.getTilesAsync(requests);
    const expected = requests.map(({ worldX, worldY, rangeCells }) => {
      const system = generator.getSystemMapProperties(worldX, worldY);
      const phenomenon = system.exists ? null : generator.getDeepSpacePhenomenonProperties(worldX, worldY);
      return {
        worldX,
        worldY,
        rangeCells,
        tile: createHyperspaceTile(
          nebula.sample(worldX, worldY),
          system,
          phenomenon,
          worldX,
          worldY,
          rangeCells
        ),
      };
    });

    expect(samples).toEqual(expected);
  });
});
