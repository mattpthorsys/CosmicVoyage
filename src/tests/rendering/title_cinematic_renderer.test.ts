import { describe, expect, it } from 'vitest';
import { calculateIlluminatedFraction } from '../../rendering/title_cinematic_renderer';

describe('title cinematic sphere lighting', () => {
  it('shows a full phase when the star illuminates the observer-facing hemisphere', () => {
    const fraction = calculateIlluminatedFraction(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 10 },
      { x: 0, y: 0, z: 0 }
    );

    expect(fraction).toBeCloseTo(1);
  });

  it('shows a new phase when the star is behind the body from the observer', () => {
    const fraction = calculateIlluminatedFraction(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 10 },
      { x: 0, y: 0, z: 100 }
    );

    expect(fraction).toBeCloseTo(0);
  });

  it('shows a half phase when star and observer directions are perpendicular', () => {
    const fraction = calculateIlluminatedFraction(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 10 },
      { x: 10, y: 0, z: 10 }
    );

    expect(fraction).toBeCloseTo(0.5);
  });
});
