import { describe, expect, it } from 'vitest';
import { Starbase } from './starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';

describe('Starbase', () => {
  it('initializes deterministic orbit and placeholder surface data', () => {
    const starbase = new Starbase('base-seed', new PRNG('system-seed'), 'TestSystem');

    expect(starbase.name).toBe('TestSystem Starbase Delta');
    expect(starbase.type).toBe('Starbase');
    expect(starbase.orbitDistance).toBeGreaterThan(CONFIG.STARBASE_ORBIT_DISTANCE * 0.89);
    expect(starbase.orbitDistance).toBeLessThan(CONFIG.STARBASE_ORBIT_DISTANCE * 1.11);
    expect(starbase.heightmap).toEqual([[0]]);
    expect(starbase.heightLevelColors).toEqual([CONFIG.STARBASE_COLOUR]);
  });

  it('returns tagged scan text for the terminal renderer', () => {
    const starbase = new Starbase('base-seed', new PRNG('system-seed'), 'TestSystem');
    const scanInfo = starbase.getScanInfo();

    expect(scanInfo[0]).toContain(starbase.name);
    expect(scanInfo).toContain('Type: <hl>Orbital Starbase</hl>');
    expect(scanInfo).toContain('Mineral Scan: <hl>N/A</hl>');
  });
});
