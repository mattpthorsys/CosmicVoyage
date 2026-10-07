import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { FrontierCatalogue } from '../../core/frontier_catalogue';
import {
  LocalHyperspaceSurveyCellProvider,
  type HyperspaceSurveyCellProvider,
} from '../../core/hyperspace_survey_cell_provider';
import { SystemDataGenerator, type SystemBasicProperties } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';

describe('bounded frontier catalogue', () => {
  it('uses physical circular reach, stable sorted addresses and detached cached results', async () => {
    const seed = new PRNG('catalogue-reach');
    const generator = new SystemDataGenerator(seed);
    vi.spyOn(generator, 'getSystemMapProperties').mockReturnValue({
      exists: true,
      name: 'Reference',
      starType: 'G',
      hasStarbase: false,
      objectKind: 'stellar',
    });
    const provider = new LocalHyperspaceSurveyCellProvider(generator);
    const batch = vi.spyOn(provider, 'getCellDataBatchAsync');
    const catalogue = new FrontierCatalogue(generator, seed, provider);
    const radius = 2 * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
    const contacts = (await catalogue.search(0, 0, radius))!;
    expect(contacts).toHaveLength(13);
    expect(contacts.every((entry) => entry.distanceLy <= radius)).toBe(true);
    expect(contacts.some((entry) => entry.worldX === 2 && entry.worldY === 0)).toBe(true);
    expect(contacts.some((entry) => entry.worldX === 2 && entry.worldY === 2)).toBe(false);
    contacts[0].name = 'corrupted';
    expect((await catalogue.search(0, 0, radius))![0].name).toBe('Reference');
    expect(batch).toHaveBeenCalledTimes(1);
    await expect(catalogue.search(0.5, 0, radius)).rejects.toThrow('Invalid');
  });

  it('returns identical descriptors for batch transport and the deterministic local fallback', async () => {
    const seed = new PRNG('catalogue-parity');
    const generator = new SystemDataGenerator(seed);
    const local = new LocalHyperspaceSurveyCellProvider(generator);
    const transport: HyperspaceSurveyCellProvider = {
      getCellData: (x, y) => structuredClone(local.getCellData(x, y)),
      clearCache: () => {},
      getCellDataBatchAsync: async (requests) => structuredClone(await local.getCellDataBatchAsync(requests)),
    };
    const fallback = new FrontierCatalogue(generator, seed, null);
    const workerShape = new FrontierCatalogue(generator, seed, transport);
    expect(await workerShape.search(CONFIG.PLAYER_START_X, CONFIG.PLAYER_START_Y, 3)).toEqual(
      await fallback.search(CONFIG.PLAYER_START_X, CONFIG.PLAYER_START_Y, 3)
    );
    expect(seed.random()).toBe(new PRNG('catalogue-parity').random());
  });

  it('discards cancelled batches and does not cache an incomplete search', async () => {
    const seed = new PRNG('catalogue-cancel');
    const generator = new SystemDataGenerator(seed);
    const provider = new LocalHyperspaceSurveyCellProvider(generator);
    let current = true;
    const original = provider.getCellDataBatchAsync.bind(provider);
    const batch = vi.spyOn(provider, 'getCellDataBatchAsync').mockImplementation(async (requests) => {
      current = false;
      return original(requests);
    });
    const catalogue = new FrontierCatalogue(generator, seed, provider);
    expect(await catalogue.search(0, 0, 4, () => current)).toBeNull();
    batch.mockImplementation(original);
    expect(await catalogue.search(0, 0, 4)).not.toBeNull();
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it('verifies a map candidate against canonical station generation without advancing the shared seed', () => {
    const seed = new PRNG('haul-journey-fixture');
    const generator = new SystemDataGenerator(seed);
    const props: SystemBasicProperties = {
      exists: true,
      starType: 'G',
      name: 'Controlled',
      hasStarbase: true,
      stationKind: 'automated-depot',
      ageGyr: 5,
      metallicityFeH: 0,
      architecture: null,
      objectKind: 'stellar',
      systemSlot: 0,
    };
    const getter = vi.spyOn(generator, 'getSystemProperties').mockReturnValue(props);
    const catalogue = new FrontierCatalogue(generator, seed, null);
    const contact = {
      worldX: 0,
      worldY: 0,
      systemSlot: 0,
      name: 'Controlled',
      spectralType: 'G',
      stationKind: 'automated-depot' as const,
      distanceLy: 0,
    };
    const actual = catalogue.verifyDepot(contact);
    expect(actual?.address).toEqual({ worldX: 0, worldY: 0, systemSlot: 0 });
    expect(actual?.stationId).toBeTruthy();
    catalogue.verifyDepot(contact);
    expect(getter).toHaveBeenCalledOnce();
    getter.mockReturnValue({ ...props, hasStarbase: false, stationKind: null });
    expect(catalogue.verifyDepot({ ...contact, worldX: 1 })).toBeNull();
    expect(seed.random()).toBe(new PRNG('haul-journey-fixture').random());
  });
});
