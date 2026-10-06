import { describe, expect, it } from 'vitest';
import { findHaulHomeboundRoute } from '../../../core/haul_navigation';
import type { InfrastructureRecord } from '../../../core/heavy_haul_types';
import { validateInfrastructureRecords } from '../../../core/heavy_haul_validation';
import { InfrastructureRegistry } from '../../../core/infrastructure_registry';

/** Builds a paid remote installation with issuer metadata independent of any live mission owner. */
function installation(commissionedAtSeconds = 100): InfrastructureRecord {
  return {
    assetId: `haul-installation:remote-${commissionedAtSeconds}`,
    sourceMissionId: `remote-${commissionedAtSeconds}`,
    kind: 'automated-depot',
    systemAddress: { worldX: 80, worldY: 25, systemSlot: 0 },
    systemName: 'Frontier',
    orbit: { host: { kind: 'barycentric' }, radiusM: 2e11, angleRad: 0 },
    commissionedAtSeconds,
    lastAppliedBulkSeconds: 0,
    commissioningFuelRemainingUnits: 500,
    homeboundRoute: {
      systemAddress: { worldX: -10, worldY: -20, systemSlot: 0 },
      stationId: 'station:issuer',
      stationName: 'Home Starbase Delta',
    },
  };
}

describe('deferred homebound navigation', () => {
  it('keeps the latest remote issuer despite later local jobs and different navigation marks', () => {
    const first = installation(100);
    const latest = installation(200);
    const local = { ...installation(300), homeboundRoute: undefined };
    const route = findHaulHomeboundRoute([latest, local, first], {
      worldX: 999,
      worldY: 888,
      systemSlot: 0,
      name: 'Other destination',
      kind: 'system',
    })!;
    expect(route).toEqual(latest.homeboundRoute);
    expect(route).not.toBe(latest.homeboundRoute);
  });

  it('recovers the marked issuing port for deliveries saved before issuer metadata existed', () => {
    const old = { ...installation(), homeboundRoute: undefined };
    expect(
      findHaulHomeboundRoute([old], {
        worldX: -10,
        worldY: -20,
        systemSlot: 0,
        name: 'Home Starbase Delta',
        kind: 'system',
      })
    ).toEqual({ ...installation().homeboundRoute, stationId: null });
    expect(
      findHaulHomeboundRoute([old], {
        ...old.systemAddress,
        name: 'Frontier Starbase Delta',
        kind: 'system',
      })
    ).toBeNull();
    expect(findHaulHomeboundRoute([])).toBeNull();
    const registry = new InfrastructureRegistry();
    registry.restore([old], {
      worldX: -10,
      worldY: -20,
      systemSlot: 0,
      name: 'Home Starbase Delta',
      kind: 'system',
    });
    const restored = new InfrastructureRegistry();
    restored.restore(registry.createSnapshot());
    expect(findHaulHomeboundRoute(restored.createSnapshot())).toEqual({
      ...installation().homeboundRoute,
      stationId: null,
    });
  });

  it('validates optional saved home ports and rejects malformed or unreachable destinations', () => {
    const asset = installation();
    /** Exercises the save boundary without creating a live world or changing any owner. */
    const validate = (value: unknown): void =>
      validateInfrastructureRecords([value], 100, 0, [asset.sourceMissionId]);
    expect(() => validate(asset)).not.toThrow();
    for (const invalid of [
      null,
      { ...asset.homeboundRoute, stationId: '' },
      { ...asset.homeboundRoute, stationName: '' },
      {
        ...asset.homeboundRoute,
        systemAddress: { worldX: 0, worldY: 0, systemSlot: 1 },
      },
    ]) {
      expect(() => validate({ ...asset, homeboundRoute: invalid })).toThrow(/homebound|system address/);
    }
    expect(() => validate({ ...asset, homeboundRoute: undefined })).not.toThrow();
  });
});
