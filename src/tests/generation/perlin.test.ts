import { describe, expect, it } from 'vitest';
import { PerlinNoise } from '../../generation/perlin';

describe('PerlinNoise', () => {
  it('returns deterministic samples before and after cache clearing', () => {
    const noise = new PerlinNoise('cache-determinism');
    const coordinates = [
      [-2.75, 4.125],
      [0, 0],
      [3.5, -1.25],
      [12.125, 8.875],
    ];

    const firstPass = coordinates.map(([x, y]) => noise.get(x, y));
    const cachedPass = coordinates.map(([x, y]) => noise.get(x, y));
    noise.clearCache();
    const afterClear = coordinates.map(([x, y]) => noise.get(x, y));

    expect(cachedPass).toEqual(firstPass);
    expect(afterClear).toEqual(firstPass);
  });

  it('makes coordinate-hashed gradients independent of sampling order', () => {
    const coordinates = [
      [-14.75, 3.125],
      [8.5, -12.25],
      [0.375, 0.625],
      [41.25, 18.875],
    ] as const;
    const forward = new PerlinNoise('coordinate-order', { coordinateHashedGradients: true });
    const reverse = new PerlinNoise('coordinate-order', { coordinateHashedGradients: true });

    const forwardSamples = new Map(coordinates.map(([x, y]) => [`${x},${y}`, forward.get(x, y)] as const));
    const reverseSamples = new Map(
      [...coordinates].reverse().map(([x, y]) => [`${x},${y}`, reverse.get(x, y)] as const)
    );

    expect(reverseSamples).toEqual(forwardSamples);
  });
});
