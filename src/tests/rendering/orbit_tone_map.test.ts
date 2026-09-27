import { describe, expect, it } from 'vitest';
import { toneMapOrbitRadiance } from '../../rendering/scenes/orbit_tone_map';

describe('orbital exposure', () => {
  it('preserves coloured terrain ratios when bright light needs compression', () => {
    const mapped = toneMapOrbitRadiance({ r: 0.2, g: 0.6, b: 0.1 }, 10);
    const linear = { r: (mapped.r / 255) ** 2.2, g: (mapped.g / 255) ** 2.2, b: (mapped.b / 255) ** 2.2 };
    expect(linear.r / linear.g).toBeCloseTo(1 / 3, 10);
    expect(linear.b / linear.g).toBeCloseTo(1 / 6, 10);
    expect(mapped.g).toBeLessThanOrEqual(255);
    expect(mapped.g).toBeGreaterThan(mapped.r);
  });

  it('keeps material colour stable after inverse-square dimming and eye adaptation', () => {
    const near = toneMapOrbitRadiance({ r: 0.1, g: 0.3, b: 0.2 }, Math.PI);
    const far = toneMapOrbitRadiance({ r: 0.025, g: 0.075, b: 0.05 }, Math.PI * 4);
    expect(far).toEqual(near);
    expect(toneMapOrbitRadiance({ r: 0, g: 0, b: 0 }, 100)).toEqual({ r: 0, g: 0, b: 0 });
  });
});
