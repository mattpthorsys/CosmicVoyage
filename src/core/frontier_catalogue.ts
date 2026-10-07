import { CONFIG } from '../config';
import { SolarSystem } from '../entities/solar_system';
import type { SystemDataGenerator } from '../generation/system_data_generator';
import type { PRNG } from '../utils/prng';
import {
  getHyperspaceSurveyCellProvider,
  LocalHyperspaceSurveyCellProvider,
  type HyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';
import { observatoryDistanceLy, type ObservatoryAddress } from './observatory_types';
import { surveyAddressKey } from './survey_data_types';

export interface FrontierCatalogueContact extends ObservatoryAddress {
  name: string;
  spectralType: string;
  stationKind: 'starbase' | 'automated-depot' | null;
  distanceLy: number;
}

export interface DepotContact {
  stationId: string;
  name: string;
  address: ObservatoryAddress;
}

/** Queries lightweight physical descriptors in cancellable batches, independent of the travel viewport. */
export class FrontierCatalogue {
  private readonly provider: HyperspaceSurveyCellProvider;
  private readonly cache = new Map<string, FrontierCatalogueContact[]>();
  private readonly stations = new Map<string, DepotContact | null>();

  /** Reuses the installed worker and a deterministic local fallback without adding generation rolls. */
  constructor(
    private readonly generator: SystemDataGenerator,
    private readonly seed: PRNG,
    provider: HyperspaceSurveyCellProvider | null = getHyperspaceSurveyCellProvider()
  ) {
    this.provider = provider ?? new LocalHyperspaceSurveyCellProvider(generator);
  }

  /** Acquires a finite physical radius, yielding between batches and refusing superseded results. */
  async search(
    x: number,
    y: number,
    radiusLy: number,
    isCurrent: () => boolean = () => true
  ): Promise<FrontierCatalogueContact[] | null> {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isFinite(radiusLy))
      throw new Error('Invalid frontier catalogue query.');
    const radius = Math.min(64, Math.max(0, radiusLy));
    const key = `${x},${y}|${radius}`;
    if (!isCurrent()) return null;
    const cached = this.cache.get(key);
    if (cached) return structuredClone(cached);
    const cells = Math.ceil(radius / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const requests: Array<{ worldX: number; worldY: number }> = [];
    for (let dy = -cells; dy <= cells; dy++)
      for (let dx = -cells; dx <= cells; dx++)
        if (
          Math.hypot(dx, dy) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS <= radius &&
          Number.isSafeInteger(x + dx) &&
          Number.isSafeInteger(y + dy)
        )
          requests.push({ worldX: x + dx, worldY: y + dy });
    const contacts: FrontierCatalogueContact[] = [];
    for (let offset = 0; offset < requests.length; offset += 128) {
      if (!isCurrent()) return null;
      const batch = await this.provider.getCellDataBatchAsync(requests.slice(offset, offset + 128));
      if (!isCurrent()) return null;
      for (const cell of batch)
        if (cell.system.exists && cell.system.name && cell.system.objectKind === 'stellar') {
          const address = { worldX: cell.worldX, worldY: cell.worldY, systemSlot: 0 };
          contacts.push({
            ...address,
            name: cell.system.name,
            spectralType: cell.system.starType ?? 'unresolved',
            stationKind: cell.system.stationKind ?? null,
            distanceLy: observatoryDistanceLy(x, y, address),
          });
        }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!isCurrent()) return null;
    contacts.sort(
      (a, b) => a.distanceLy - b.distanceLy || surveyAddressKey(a).localeCompare(surveyAddressKey(b))
    );
    this.cache.set(key, contacts);
    if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value!);
    return structuredClone(contacts);
  }

  /** Verifies only advertised depot candidates: crowded or unstable host orbits can suppress a natural station. */
  verifyDepot(contact: FrontierCatalogueContact): DepotContact | null {
    if (contact.stationKind !== 'automated-depot') return null;
    const key = surveyAddressKey(contact);
    if (this.stations.has(key)) return structuredClone(this.stations.get(key) ?? null);
    // Map station flags describe candidates. The canonical system constructor resolves actual orbit eligibility.
    const system = new SolarSystem(
      this.generator.getSystemProperties(contact.worldX, contact.worldY, contact.systemSlot),
      contact.worldX,
      contact.worldY,
      this.seed
    );
    const station = system.stations.find((entry) => entry.kind === 'automated-depot');
    const descriptor = station
      ? {
          stationId: station.id,
          name: station.name,
          address: { worldX: contact.worldX, worldY: contact.worldY, systemSlot: contact.systemSlot },
        }
      : null;
    this.stations.set(key, descriptor);
    if (this.stations.size > 256) this.stations.delete(this.stations.keys().next().value!);
    return structuredClone(descriptor);
  }
}
