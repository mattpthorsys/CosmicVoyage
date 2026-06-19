import { describe, expect, it } from 'vitest';
import { generateAxialTiltRad } from '../../../entities/planet/planet_characteristics_generator';
import { PRNG } from '../../../utils/prng';

describe('planet axial tilt generation', () => {
  it('usually generates modest obliquities but includes rare Uranus-like outliers', () => {
    const tilts = Array.from(
      { length: 400 },
      (_, index) => (generateAxialTiltRad(new PRNG(`tilt-${index}`)) * 180) / Math.PI
    );
    const extreme = tilts.filter((tilt) => tilt >= 62);
    const modest = tilts.filter((tilt) => tilt <= 28);

    expect(extreme.length).toBeGreaterThan(15);
    expect(extreme.length).toBeLessThan(75);
    expect(modest.length).toBeGreaterThan(220);
    expect(Math.max(...tilts)).toBeGreaterThan(85);
  });

  it('keeps tidally locked bodies at low spin obliquity', () => {
    const tilts = Array.from(
      { length: 100 },
      (_, index) => (generateAxialTiltRad(new PRNG(`locked-tilt-${index}`), true) * 180) / Math.PI
    );

    expect(Math.max(...tilts)).toBeLessThanOrEqual(5);
  });
});
