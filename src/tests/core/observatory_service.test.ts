import { describe, expect, it, vi } from 'vitest';
import { ObservatoryService } from '../../core/observatory_service';
import { createDefaultShipModifications } from '../../core/ship_modifications';
import { getObservatoryCapabilities, validateObservatorySnapshot } from '../../core/observatory_types';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import type {
  HyperspaceSurveyCellData,
  HyperspaceSurveyCellProvider,
  HyperspaceSurveyCellRequest,
} from '../../core/hyperspace_survey_cell_provider';
import { observatoryContactFixture, observatoryObservationFixture } from '../fixtures/observatory';
import { InfrastructureRegistry } from '../../core/infrastructure_registry';
import { AU_IN_METERS } from '../../constants/physics';

/** Provides a tiny bounded catalogue without planetary construction or a browser worker. */
function harness() {
  const contact = observatoryContactFixture();
  const generator = {
    getInterstellarMediumProperties: () => ({ sensorRangeMultiplier: 1 }),
    getSystemProperties: vi.fn(() => ({ architecture: null })),
  } as unknown as SystemDataGenerator;
  const provider: HyperspaceSurveyCellProvider = {
    getCellData: (x, y): HyperspaceSurveyCellData => ({
      worldX: x,
      worldY: y,
      system:
        x === 3 && y === 0
          ? contact.system!
          : { exists: false, starType: null, name: null, objectKind: null, hasStarbase: false },
      phenomenon: {
        exists: false,
        type: null,
        name: null,
        classification: null,
        signal: null,
        char: null,
        colour: null,
        rarity: null,
      },
    }),
    getCellDataBatchAsync: vi.fn(async (requests: readonly HyperspaceSurveyCellRequest[]) =>
      requests.map(({ worldX, worldY }) => provider.getCellData(worldX, worldY))
    ),
    clearCache: () => {},
  };
  const service = new ObservatoryService(generator, new PRNG('observatory-service'), provider);
  const capabilities = {
    ...getObservatoryCapabilities(createDefaultShipModifications()),
    contactRadiusLy: 4,
  };
  return { contact, generator, provider, service, capabilities };
}

describe('observatory catalogue', () => {
  it('refreshes registered deployment evidence at rest without inventing or erasing biological evidence', () => {
    const { generator, provider, contact } = harness();
    const registry = new InfrastructureRegistry();
    const service = new ObservatoryService(generator, new PRNG('deployed-evidence'), provider, registry);
    const observation = observatoryObservationFixture(contact, { biology: 'strong', origin: 'native' });
    service.retain(contact, observation);
    registry.restore([
      {
        assetId: 'haul-installation:evidence',
        sourceMissionId: 'evidence',
        kind: 'navigation-buoy',
        systemAddress: { worldX: contact.worldX, worldY: contact.worldY, systemSlot: contact.systemSlot },
        systemName: contact.name,
        orbit: { host: { kind: 'barycentric' }, radiusM: AU_IN_METERS, angleRad: 0 },
        commissionedAtSeconds: 0,
        lastAppliedBulkSeconds: 0,
        commissioningFuelRemainingUnits: 0,
      },
    ]);
    service.invalidateInfrastructure();
    expect(service.snapshot.observations[contact.id]).toMatchObject({
      technology: 'registered',
      biology: 'strong',
      origin: 'native',
    });
    service.retain(
      contact,
      observatoryObservationFixture(contact, { quality: 0, technology: 'no-signal', biology: 'insufficient' })
    );
    expect(service.snapshot.observations[contact.id]).toMatchObject({
      technology: 'registered',
      biology: 'strong',
      origin: 'native',
    });
  });
  it('progresses bounded preliminary sweeps beyond the same nearest contacts', () => {
    const { service } = harness();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 1;
    const capabilities = { ...getObservatoryCapabilities(ship), passiveTargets: 2 };
    const contacts = [
      observatoryContactFixture(1),
      observatoryContactFixture(2),
      observatoryContactFixture(3),
    ];
    expect(service.selectPreliminaryTargets(contacts, capabilities, 1)).toEqual(contacts.slice(0, 2));
    service.retain(contacts[0], observatoryObservationFixture(contacts[0]));
    service.retain(contacts[1], observatoryObservationFixture(contacts[1]));
    expect(service.selectPreliminaryTargets(contacts, capabilities, 1)[0]).toBe(contacts[2]);
    expect(contacts.map((contact) => contact.worldX)).toEqual([1, 2, 3]);
  });

  it('includes registered carrier targets beyond spectroscopy range without admitting distant unregistered worlds', () => {
    const { service } = harness();
    const ship = createDefaultShipModifications();
    ship.observatoryClass = 1;
    const colony = observatoryContactFixture(30);
    colony.system = { ...colony.system!, stationKind: 'starbase', settlementStage: 'complete' };
    const contacts = [observatoryContactFixture(29), colony, observatoryContactFixture(1)];
    expect(service.selectPreliminaryTargets(contacts, getObservatoryCapabilities(ship), 1)).toEqual([
      contacts[2],
      colony,
    ]);
    ship.observatoryClass = 0;
    expect(service.selectPreliminaryTargets(contacts, getObservatoryCapabilities(ship), 1)).toEqual([]);
  });

  it('does not discard a charted colony solely because its red-dwarf host is optically faint', async () => {
    const { service, contact } = harness();
    Object.assign(contact.system!, { starType: 'M', stationKind: 'starbase' });
    const ship = createDefaultShipModifications();
    expect(await service.search(-27, 0, getObservatoryCapabilities(ship))).toEqual([]);
    ship.observatoryClass = 1;
    const contacts = await service.search(-27, 0, getObservatoryCapabilities(ship));
    expect(contacts?.map((entry) => entry.id)).toEqual([contact.id]);
  });

  it('reuses a bounded catalogue and changes coverage only when the search setup changes', async () => {
    const { service, provider, capabilities } = harness();
    const contacts = await service.search(0, 0, capabilities);
    expect(contacts?.map((contact) => contact.worldX)).toEqual([3]);
    expect(await service.search(0, 0, capabilities)).toBe(contacts);
    expect(provider.getCellDataBatchAsync).toHaveBeenCalledTimes(1);
    await service.search(1, 0, capabilities);
    expect(provider.getCellDataBatchAsync).toHaveBeenCalledTimes(2);
  });

  it('discards delayed work after cancellation without populating a stale catalogue', async () => {
    const { service, provider, capabilities } = harness();
    let complete!: (cells: HyperspaceSurveyCellData[]) => void;
    provider.getCellDataBatchAsync = () =>
      new Promise((resolve) => {
        complete = resolve;
      });
    const pending = service.search(0, 0, capabilities);
    service.cancel();
    complete([]);
    expect(await pending).toBeNull();
  });

  it('retains stronger evidence and exports detached, validated destination and observation records', () => {
    const { service, contact } = harness();
    const strong = observatoryObservationFixture(contact, { quality: 0.8, biology: 'strong' });
    service.retain(contact, strong);
    service.retain(contact, observatoryObservationFixture(contact, { quality: 0.2, biology: 'no-signal' }));
    service.markDestination(contact);
    const saved = service.createSnapshot();
    expect(() => validateObservatorySnapshot(saved)).not.toThrow();
    saved.observations[contact.id].features.push('Detached');
    expect(service.snapshot.observations[contact.id].features).not.toContain('Detached');
    expect(service.snapshot.observations[contact.id].biology).toBe('strong');
    expect(saved.destination?.systemSlot).toBe(0);
  });

  it('merges new registry knowledge without downgrading a stronger saved exposure', () => {
    const { service, contact } = harness();
    service.retain(contact, observatoryObservationFixture(contact, { quality: 0.8, exposure: 3 }));
    service.retain(
      contact,
      observatoryObservationFixture(contact, {
        biology: 'catalogued',
        origin: 'managed',
        quality: 0,
        exposure: 0,
        technology: 'registered',
        bodyName: 'Known colony',
        bodyPath: 'planet:0',
        features: ['Registry identifies Known colony: established managed biosphere.'],
      })
    );
    const record = service.snapshot.observations[contact.id];
    expect(record.biology).toBe('catalogued');
    expect(record.origin).toBe('managed');
    expect(record.quality).toBe(0.8);
    expect(record.exposure).toBe(3);
    expect(record.bodyName).toBe('Known colony');
    expect(record.features.some((feature) => feature.startsWith('Registry'))).toBe(true);
  });

  it('does not erase confirmed surface provenance when a remote nondetection is obtained', () => {
    const { service, contact } = harness();
    service.recordKnownBiosphere(
      contact,
      {
        systemName: contact.name,
        worldX: contact.worldX,
        worldY: contact.worldY,
        systemSlot: 0,
        bodyPath: 'planet:0',
        bodyName: 'Known world',
        surface: { x: 1, y: 2, siteId: 'known-site', label: 'shore' },
      },
      true
    );
    service.retain(contact, observatoryObservationFixture(contact, { biology: 'no-signal' }));
    expect(service.snapshot.observations[contact.id].biology).toBe('catalogued');
    expect(service.snapshot.observations[contact.id].origin).toBe('native');
  });

  it('caps paid exposures and restores the completed integration budget from saved evidence', () => {
    const { service, contact, capabilities, generator, provider } = harness();
    const fitted = { ...capabilities, equipmentClass: 2, qualityCeiling: 0.78, atmosphericRadiusLy: 40 };
    /** Performs one deliberate integration using a fixed location and instrument. */
    const integrate = () => service.observe(contact, fitted, 0, 0, true);
    expect([integrate().seconds, integrate().seconds, integrate().seconds, integrate().seconds]).toEqual([
      300, 300, 300, 0,
    ]);
    expect(service.snapshot.observations[contact.id].exposure).toBe(3);
    const restored = new ObservatoryService(generator, new PRNG('restored-observatory'), provider);
    restored.restoreSnapshot(service.createSnapshot());
    expect(restored.observe(contact, fitted, 0, 0, true).seconds).toBe(0);
    expect(restored.observe(contact, fitted, 1, 0, true).seconds).toBe(300);
  });

  it('bounds confirmed records just like remote readings so the catalogue remains saveable', () => {
    const { service } = harness();
    for (let index = 0; index < 4097; index++) {
      const contact = observatoryContactFixture(index);
      service.recordKnownBiosphere(
        contact,
        {
          systemName: contact.name,
          worldX: index,
          worldY: 0,
          systemSlot: 0,
          bodyPath: 'planet:0',
          bodyName: 'Known world',
          surface: { x: 0, y: 0, siteId: `site-${index}`, label: 'shore' },
        },
        true
      );
    }
    expect(Object.keys(service.snapshot.observations)).toHaveLength(4096);
    expect(() => validateObservatorySnapshot(service.createSnapshot())).not.toThrow();
  });
});
