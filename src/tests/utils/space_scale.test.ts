import { describe, expect, it } from 'vitest';
import { AU_IN_METERS } from '../../constants';
import { CONFIG } from '../../config';
import {
  formatDistanceAu,
  formatHyperspaceSignalDelay,
  formatHyperspaceSpan,
  formatLightTimeFromMeters,
} from '../../utils/space_scale';

describe('space scale formatting', () => {
  it('formats solar-system distances as AU and one-way light time', () => {
    expect(formatDistanceAu(AU_IN_METERS)).toBe('1.00 AU');
    expect(formatLightTimeFromMeters(AU_IN_METERS)).toBe('8.3 light-min');
  });

  it('formats hyperspace cells as light-year scale spans', () => {
    expect(formatHyperspaceSpan(3)).toBe('3.0 ly');
    expect(formatHyperspaceSignalDelay(3)).toBe('3.0 years at c');
  });

  it('derives interstellar density, fuel, ranges, and noise from the cell-distance constant', () => {
    expect(CONFIG.HYPERSPACE_CELL_LIGHT_YEARS).toBe(1);
    expect(CONFIG.HYPERSPACE_MOVE_FUEL_COST * CONFIG.HYPERSPACE_CELL_LINEAR_SCALE).toBeCloseTo(0.35);
    expect(CONFIG.HYPERSPACE_MOVE_INTERVAL_MS * CONFIG.HYPERSPACE_CELL_LINEAR_SCALE).toBeCloseTo(145);
    expect(CONFIG.STAR_DENSITY / CONFIG.HYPERSPACE_CELL_AREA_RATIO).toBeCloseTo(0.09);
    expect(CONFIG.NEBULA_SCALE * CONFIG.HYPERSPACE_CELL_LINEAR_SCALE).toBeCloseTo(0.05);
    expect(CONFIG.NORMAL_STAR_DETECTION_RADIUS_CELLS / CONFIG.HYPERSPACE_CELL_LINEAR_SCALE).toBeCloseTo(
      18,
      0
    );
  });
});
