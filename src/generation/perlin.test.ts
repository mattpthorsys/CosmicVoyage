import { describe, expect, it } from 'vitest';
import { PerlinNoise } from './perlin';

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
});
