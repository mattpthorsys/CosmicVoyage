import { describe, expect, it } from 'vitest';
import { advanceDiscoveryRecord, createDiscoveryRecord, hasDiscoveryLevel } from '../../core/discovery';

describe('layered discovery', () => {
  it('advances knowledge without allowing weaker observations to erase it', () => {
    const surveyed = advanceDiscoveryRecord(
      createDiscoveryRecord('observed', 70, 1, 'local-scan'),
      'surveyed',
      95,
      'orbital-survey'
    );
    const weakerRepeat = advanceDiscoveryRecord(surveyed, 'classified', 40, 'long-range');

    expect(weakerRepeat.level).toBe('surveyed');
    expect(weakerRepeat.confidence).toBe(95);
    expect(weakerRepeat.observations).toBe(3);
    expect(hasDiscoveryLevel(weakerRepeat.level, 'observed')).toBe(true);
  });
});
