import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { DepotCommunications } from '../../core/depot_communications';
import {
  FrontierCatalogue,
  type DepotContact,
  type FrontierCatalogueContact,
} from '../../core/frontier_catalogue';
import { InfrastructureRegistry, reserveInstallationOrbit } from '../../core/infrastructure_registry';
import {
  COMMUNICATIONS_CONTACT_LIMIT,
  COMMUNICATIONS_NOTICE_LIMIT,
  COMMUNICATIONS_REPORT_LIFETIME_SECONDS,
  validateCommunicationsSnapshot,
} from '../../core/communications_types';
import { createCommunicationsEntries } from '../../core/communications_console';
import { parseGameSave, SAVE_GAME_VERSION } from '../../core/save_game';
import { depotContractFixture, depotContractSave } from '../fixtures/depot_contracts';
import type { InfrastructureRecord } from '../../core/heavy_haul_types';

/** Uses actual stock and mission owners with a controlled asynchronous contact transport. */
function fixture() {
  const world = depotContractFixture();
  const registry = new InfrastructureRegistry();
  const contact: DepotContact = {
    stationId: world.station.id,
    name: world.station.name,
    address: world.address,
  };
  const candidate: FrontierCatalogueContact = {
    ...world.address,
    name: world.system.name,
    spectralType: 'G',
    stationKind: 'automated-depot',
    distanceLy: 0,
  };
  const search = vi.fn(
    async (
      _x: number,
      _y: number,
      _radius: number,
      _current?: () => boolean
    ): Promise<FrontierCatalogueContact[] | null> => [candidate]
  );
  const verifyDepot = vi.fn((_candidate: FrontierCatalogueContact) => contact as DepotContact | null);
  const catalogue = { search, verifyDepot } as unknown as FrontierCatalogue;
  const service = new DepotCommunications(catalogue, registry, world.depots, world.commerce, world.progress);
  return { ...world, registry, contact, candidate, search, verifyDepot, service };
}

/** Builds finite informational carrier identities without initialising service inventory. */
function carrier(index: number): DepotContact {
  return {
    stationId: `carrier:${index}`,
    name: `Frontier depot ${index}`,
    address: { worldX: index, worldY: 0, systemSlot: 0 },
  };
}

describe('frontier depot communications', () => {
  it('reports actual stocks and offers without changing inventory, escrow, progression or player resources', () => {
    const f = fixture();
    const before = depotContractSave(f);
    expect(f.service.receive([f.contact], 0)).toBe(1);
    const report = f.service.list(0)[0];
    expect(report.report.telemetry).toBe('stored');
    expect(
      report.report.shortages.some((item) => item.itemKey === 'MEDICAL_SUPPLIES' && item.units === 0)
    ).toBe(true);
    expect(report.report.jobs).toHaveLength(3);
    expect(depotContractSave(f)).toEqual(before);
    const unknown = carrier(5);
    f.service.receive([unknown], 0);
    expect(f.service.list(0).find((entry) => entry.sourceId === unknown.stationId)!.report).toMatchObject({
      telemetry: 'carrier',
      shortages: [],
      jobs: [],
    });
    expect(f.depots.getRecord(unknown.stationId)).toBeNull();
  });

  it('deduplicates content, preserves read state and announces genuine shortage/job changes only', () => {
    const f = fixture();
    f.service.receive([f.contact], 0);
    f.service.markRead(f.contact.stationId);
    expect(f.service.receive([f.contact, f.contact], 1)).toBe(0);
    expect(f.service.list(1)).toHaveLength(1);
    expect(f.service.list(1)[0].read).toBe(true);
    f.commerce.addStock(f.station.id, 'MEDICAL_SUPPLIES', 1);
    expect(f.service.receive([f.contact], 2)).toBe(0);
    f.commerce.addStock(f.station.id, 'MEDICAL_SUPPLIES', 100);
    expect(f.service.receive([f.contact], 3)).toBe(1);
    expect(f.service.list(3)[0].read).toBe(false);
    const offer = f.contracts.list(f.station, f.system)[0];
    expect(f.contracts.accept(offer, f.station, f.system).ok).toBe(true);
    expect(f.service.receive([f.contact], 4)).toBe(1);
    expect(f.service.list(4)[0].report.jobs.some((job) => job.id === offer.id)).toBe(false);
  });

  it('merges real natural and delivered contacts, excluding radius overflow, buoys and phantom station candidates', async () => {
    const f = fixture();
    const orbit = reserveInstallationOrbit(f.system, 2e11, 0)!;
    expect(orbit).toBeTruthy();
    const delivered: InfrastructureRecord = {
      assetId: 'haul-installation:receiver',
      sourceMissionId: 'receiver',
      kind: 'automated-depot',
      systemAddress: { ...f.address, worldX: CONFIG.DEPOT_COMMUNICATIONS_RADIUS_LY },
      systemName: 'Receiver',
      orbit,
      commissionedAtSeconds: 0,
      lastAppliedBulkSeconds: 0,
      commissioningFuelRemainingUnits: 0,
    };
    f.registry.restore([
      delivered,
      {
        ...delivered,
        assetId: 'outside',
        sourceMissionId: 'outside',
        systemAddress: { ...delivered.systemAddress, worldX: CONFIG.DEPOT_COMMUNICATIONS_RADIUS_LY + 1 },
      },
      { ...delivered, assetId: 'buoy', sourceMissionId: 'buoy', kind: 'navigation-buoy' },
    ]);
    expect(await f.service.refresh(0, 0, 0)).toBe(2);
    expect(f.search).toHaveBeenCalledWith(0, 0, CONFIG.DEPOT_COMMUNICATIONS_RADIUS_LY, expect.any(Function));
    expect(
      f.service
        .list(0)
        .map((entry) => entry.sourceId)
        .sort()
    ).toEqual([f.station.id, delivered.assetId].sort());
    f.verifyDepot.mockReturnValue(null);
    f.service.restoreSnapshot({ notices: [], heard: {} });
    expect(await f.service.refresh(0, 0, 0)).toBe(1);
  });

  it('cancels a superseded query without retaining stale contacts', async () => {
    const f = fixture();
    let resolve!: (value: FrontierCatalogueContact[]) => void;
    f.search.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = f.service.refresh(0, 0, 0);
    f.service.cancel();
    resolve([f.candidate]);
    expect(await pending).toBeNull();
    expect(f.service.list(0)).toEqual([]);
    expect(await f.service.refresh(0, 0, 0)).toBe(1);
  });

  it('lets a moving query finish but filters acquisition at the latest ship position', async () => {
    const f = fixture();
    let resolve!: (value: FrontierCatalogueContact[]) => void;
    f.search.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = f.service.poll(0, 0, 0, 0);
    expect(await f.service.poll(1000, 0, 0, 1000)).toBeNull();
    resolve([f.candidate]);
    expect(await pending).toBeNull();
    expect(f.service.list(0)).toEqual([]);
    expect(f.search).toHaveBeenCalledTimes(1);
  });

  it('throttles background sweeps and aggregates alerts rather than flooding travel', async () => {
    const f = fixture();
    expect(await f.service.poll(0, 0, 0, 0)).toContain('1 frontier depot report');
    expect(await f.service.poll(0, 0, 1, 1000)).toBeNull();
    expect(await f.service.poll(0, 0, 1, 14000)).toBeNull();
    expect(f.search).toHaveBeenCalledTimes(1);
    expect(await f.service.poll(0, 0, 2, 15000)).toBeNull();
    expect(f.search).toHaveBeenCalledTimes(2);
    f.verifyDepot.mockReturnValue(carrier(7));
    expect(await f.service.poll(1, 0, 3, 17000)).toContain('1 frontier depot report');
    f.verifyDepot.mockReturnValue(carrier(8));
    expect(await f.service.poll(2, 0, 4, 19000)).toBeNull();
    expect(f.service.list(4)).toHaveLength(3);
  });

  it('bounds inbox and heard identities, expires old notices and keeps restored reports detached', () => {
    const f = fixture();
    for (let offset = 0; offset < 640; offset += 32)
      f.service.receive(
        Array.from({ length: 32 }, (_, i) => carrier(offset + i)),
        offset
      );
    const snapshot = f.service.createSnapshot();
    expect(snapshot.notices).toHaveLength(COMMUNICATIONS_NOTICE_LIMIT);
    expect(Object.keys(snapshot.heard)).toHaveLength(COMMUNICATIONS_CONTACT_LIMIT);
    expect(() => validateCommunicationsSnapshot(snapshot, 1000)).not.toThrow();
    expect(JSON.stringify(snapshot).length).toBeLessThan(150000);
    f.service.restoreSnapshot(snapshot);
    snapshot.notices[0].name = 'mutated';
    const listed = f.service.list(1000);
    listed[0].read = true;
    expect(f.service.list(1000).some((entry) => entry.name === 'mutated' || entry.read)).toBe(false);
    expect(f.service.list(COMMUNICATIONS_REPORT_LIFETIME_SECONDS + 1000)).toEqual([]);
  });

  it('saves read status and migrates v24 without losing science receipts or inventing communications', () => {
    const f = fixture();
    f.service.receive([f.contact], 0);
    f.service.markRead(f.station.id);
    const saved = depotContractSave(f);
    saved.communications = f.service.createSnapshot();
    const restored = parseGameSave(JSON.stringify(saved));
    expect(restored.communications).toEqual(saved.communications);
    const { communications: _inbox, ...v24 } = saved;
    const migrated = parseGameSave({ ...v24, version: 24 });
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.communications).toEqual({ notices: [], heard: {} });
    expect(migrated.surveyData).toEqual(saved.surveyData);
    expect(migrated.depots).toEqual(saved.depots);
  });

  it.each(['future', 'expiry', 'revision', 'address', 'stock', 'fake-carrier', 'duplicate', 'limit'])(
    'rejects malformed inbox import: %s',
    (kind) => {
      const f = fixture();
      f.service.receive([f.contact], 0);
      const state = f.service.createSnapshot();
      const notice = state.notices[0];
      if (kind === 'future') notice.report.issuedAtSeconds = 1;
      if (kind === 'expiry') notice.expiresAtSeconds++;
      if (kind === 'revision') state.heard[notice.sourceId].revision = 'r1-0';
      if (kind === 'address') notice.address.systemSlot = -1;
      if (kind === 'stock') notice.report.shortages[0].units = -1;
      if (kind === 'fake-carrier') notice.report.telemetry = 'carrier';
      if (kind === 'duplicate') state.notices.push(structuredClone(notice));
      if (kind === 'limit') state.notices = Array.from({ length: 129 }, () => notice);
      expect(() => validateCommunicationsSnapshot(state, 0)).toThrow();
    }
  );

  it('labels saved stock epochs and unknown carrier data rather than promising current remote quotes', () => {
    const f = fixture();
    f.service.receive([f.contact, carrier(5)], 0);
    const entries = createCommunicationsEntries(f.service.list(10 * 86400), 0, 0, 10 * 86400);
    const text = entries
      .flatMap((entry) => entry.lines)
      .flatMap((line) => line.segments)
      .map((span) => span.text)
      .join(' ');
    expect(text).toContain('10.0 days');
    expect(text).toContain('Stored telemetry can be stale');
    expect(text).toContain('stock and job telemetry available on docking');
  });
});
