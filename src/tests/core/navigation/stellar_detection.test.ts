import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../config';
import { SOLAR_RADIUS_M } from '../../../constants/physics';
import { getStellarDetectionRadii, getVisibleLuminositySolar } from '../../../core/stellar_detection';
import { createHyperspaceTile } from '../../../rendering/hyperspace_tile_generation';
import { getRenderedStarCell } from '../../../rendering/starfield';

describe('stellar detection', () => {
  it('uses visible flux rather than temperature alone, with finite navigation horizons', () => {
    const sun = { starType: 'G', objectKind: 'stellar' as const };
    expect(getVisibleLuminositySolar(sun)).toBeCloseTo(1, 12);
    expect(getStellarDetectionRadii(sun).statusRadius).toBe(CONFIG.NORMAL_STAR_DETECTION_RADIUS_CELLS);
    const giant = getStellarDetectionRadii({ ...sun, starType: 'B5III' });
    const dwarf = getStellarDetectionRadii({ ...sun, starType: 'DA2' });
    expect(giant.statusRadius).toBe(CONFIG.MAX_STAR_DETECTION_RADIUS_CELLS);
    expect(dwarf.statusRadius).toBe(CONFIG.MIN_STAR_DETECTION_RADIUS_CELLS);
    expect(giant.overlayRadius).toBe(CONFIG.MAX_STAR_OVERLAY_RADIUS_CELLS);
    expect(getStellarDetectionRadii({ starType: 'T5', objectKind: 'brown-dwarf' }).statusRadius).toBeLessThan(
      getStellarDetectionRadii(sun).statusRadius
    );
    expect(getStellarDetectionRadii(sun, 0.6).statusRadius).toBeCloseTo(
      getStellarDetectionRadii(sun).statusRadius * 0.6
    );
  });

  it('uses the actual evolved radius instead of the representative spectral anchor', () => {
    const star = {
      starType: 'G',
      objectKind: 'stellar' as const,
      stellarEvolution: {
        stage: 'subgiant' as const,
        initialMassSolar: 1,
        massSolar: 0.9,
        radiusM: 2 * SOLAR_RADIUS_M,
        mainSequenceLifetimeGyr: 10,
      },
    };
    expect(getVisibleLuminositySolar(star)).toBeCloseTo(4, 12);
    expect(getStellarDetectionRadii(star).statusRadius).toBe(CONFIG.NORMAL_STAR_DETECTION_RADIUS_CELLS * 2);
  });

  it.each(['O5V', 'B5III', 'B1Ia', 'M2Iab', 'WN', 'DA2', 'DC', 'M9V'])(
    'renders %s consistently on both sides of its exact detection limit',
    (starType) => {
      const system = { exists: true, starType, objectKind: 'stellar' as const };
      const horizon = getStellarDetectionRadii(system).statusRadius;
      const near = createHyperspaceTile('#010203', system, null, 11, -4, horizon);
      const far = createHyperspaceTile('#010203', system, null, 11, -4, horizon + 0.001);
      const glyph = getRenderedStarCell(starType, 11, -4);
      expect(near.starChar).toBe(glyph.char);
      expect(near.starColor).toBe(glyph.color);
      expect(far.starChar).toBeNull();
      expect(far.visibilityRadius).toBe(horizon);
      expect(far.bg).toBe(near.bg);
      if (/^[OBW]/.test(starType)) {
        expect(parseInt(glyph.color.slice(5, 7), 16)).toBeGreaterThan(parseInt(glyph.color.slice(1, 3), 16));
      }
    }
  );
});
