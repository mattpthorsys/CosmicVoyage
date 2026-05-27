import { describe, expect, it } from 'vitest';
import { AU_IN_METERS } from '../../constants';
import { formatDistanceAu, formatHyperspaceSignalDelay, formatHyperspaceSpan, formatLightTimeFromMeters } from '../../utils/space_scale';

describe('space scale formatting', () => {
  it('formats solar-system distances as AU and one-way light time', () => {
    expect(formatDistanceAu(AU_IN_METERS)).toBe('1.00 AU');
    expect(formatLightTimeFromMeters(AU_IN_METERS)).toBe('8.3 light-min');
  });

  it('formats hyperspace cells as light-year scale spans', () => {
    expect(formatHyperspaceSpan(3)).toBe('9.8 ly');
    expect(formatHyperspaceSignalDelay(3)).toBe('9.8 years at c');
  });
});
