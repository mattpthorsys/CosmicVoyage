import { describe, expect, it } from 'vitest';
import { createSystemTravelStarfield } from './starfield';
import { GLYPHS } from '../constants';

describe('starfield generation', () => {
  it('creates visible deterministic system travel stars', () => {
    const first = createSystemTravelStarfield(120, 60, 1.2e11, -4.5e10);
    const second = createSystemTravelStarfield(120, 60, 1.2e11, -4.5e10);

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first.every((cell) => cell.char === GLYPHS.STAR_DIM)).toBe(true);
  });

  it('moves system stars with parallax offsets', () => {
    const atOrigin = createSystemTravelStarfield(120, 60, 0, 0);
    const afterTravel = createSystemTravelStarfield(120, 60, 9e13, 0);

    expect(afterTravel).not.toEqual(atOrigin);
  });

  it('keeps hash-generated system star density restrained', () => {
    const stars = createSystemTravelStarfield(160, 90, -2.4e11, 3.1e11);
    const ratio = stars.length / (160 * 90);

    expect(ratio).toBeGreaterThan(0.004);
    expect(ratio).toBeLessThan(0.03);
    expect(new Set(stars.map((cell) => `${cell.x},${cell.y}`)).size).toBeGreaterThan(stars.length * 0.9);
  });

});
