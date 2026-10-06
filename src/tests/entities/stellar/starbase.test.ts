import { describe, expect, it } from 'vitest';
import { DEPLOYED_DEPOT_NOTICE, Starbase } from '../../../entities/starbase';
import { PRNG } from '../../../utils/prng';
import { CONFIG } from '../../../config';

describe('Starbase', () => {
  it('initializes deterministic orbit and placeholder surface data', () => {
    const starbase = new Starbase('base-seed', new PRNG('system-seed'), 'TestSystem');

    expect(starbase.id).toBe(`station:${CONFIG.GALAXY_MODEL_VERSION}:starbase:base-seed`);
    expect(starbase.name).toBe('TestSystem Starbase Delta');
    expect(starbase.type).toBe('Starbase');
    expect(starbase.orbitDistance).toBeGreaterThan(CONFIG.STARBASE_ORBIT_DISTANCE * 0.89);
    expect(starbase.orbitDistance).toBeLessThan(CONFIG.STARBASE_ORBIT_DISTANCE * 1.11);
    expect(starbase.heightmap).toEqual([[0]]);
    expect(starbase.heightLevelColors).toEqual([CONFIG.STARBASE_COLOUR]);
  });

  it('keeps persistent identity separate from potentially repeated display names', () => {
    const first = new Starbase('10:20:0', new PRNG('system-seed'), 'SharedName');
    const second = new Starbase('11:20:0', new PRNG('system-seed'), 'SharedName');

    expect(first.name).toBe(second.name);
    expect(first.id).not.toBe(second.id);
  });

  it('returns tagged scan text for the terminal renderer', () => {
    const starbase = new Starbase('base-seed', new PRNG('system-seed'), 'TestSystem');
    const scanInfo = starbase.getScanInfo();

    expect(scanInfo[0]).toContain(starbase.name);
    expect(scanInfo).toContain('Type: <hl>Orbital Starbase</hl>');
    expect(scanInfo).toContain('Mineral Scan: <hl>N/A</hl>');
  });

  it('explains delivered depot staffing while preserving its usable automated services', () => {
    const station = new Starbase(
      'delivered',
      new PRNG('system-seed'),
      'Frontier',
      'automated-depot',
      null,
      undefined,
      {
        id: 'haul-installation:depot',
        name: 'Frontier Logistics Depot',
        orbit: { host: { kind: 'barycentric' }, radiusM: 2e11, angleRad: 0 },
      }
    );
    expect(station.serviceNotice).toBe(DEPLOYED_DEPOT_NOTICE);
    expect(station.getScanInfo().join(' ')).toContain(DEPLOYED_DEPOT_NOTICE);
    expect(station.capabilities).toMatchObject({
      trade: true,
      fuel: true,
      repairs: 'basic',
      crew: false,
      shipyard: false,
    });
    expect(new Starbase('natural', new PRNG('system-seed'), 'TestSystem').serviceNotice).toBeNull();
  });
});
