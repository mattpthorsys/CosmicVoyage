import { describe, expect, it } from 'vitest';
import { surfaceMapDegrees } from '../../utils/surface_coordinates';

describe('surface Mercator coordinate labels', () => {
  it('matches the equator and the projected latitude limits', () => {
    expect(surfaceMapDegrees(256, 256, 513)).toEqual({ latitude: 0, longitude: 0 });
    expect(surfaceMapDegrees(0, 0, 513).latitude).toBeCloseTo(85.05112878);
    expect(surfaceMapDegrees(0, 512, 513).latitude).toBeCloseTo(-85.05112878);
  });

  it('aliases the duplicated longitude endpoint and clamps latitude', () => {
    expect(surfaceMapDegrees(512, 256, 513)).toEqual(surfaceMapDegrees(0, 256, 513));
    expect(surfaceMapDegrees(-1, -20, 513)).toEqual(surfaceMapDegrees(511, 0, 513));
    expect(surfaceMapDegrees(513, 700, 513)).toEqual(surfaceMapDegrees(1, 512, 513));
  });
});
