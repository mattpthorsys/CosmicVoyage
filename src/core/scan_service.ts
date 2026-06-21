import { Planet } from '../entities/planet';
import {
  advanceDiscoveryRecord,
  createDiscoveryRecord,
  DiscoveryLevel,
  DiscoveryMethod,
  DiscoveryRecord,
} from './discovery';

export interface ScanResolution {
  previous: DiscoveryRecord;
  current: DiscoveryRecord;
  advanced: boolean;
}

/** Owns discovery progression for planetary and catalogue-based scan targets. */
export class ScanService {
  private catalogue = new Map<string, DiscoveryRecord>();

  /** Resolves a planetary observation and returns the resulting knowledge state. */
  resolvePlanet(
    planet: Planet,
    level: DiscoveryLevel,
    confidence: number,
    method: DiscoveryMethod
  ): ScanResolution {
    const previous = { ...planet.discovery };
    planet.advanceDiscovery(level, confidence, method);
    return {
      previous,
      current: { ...planet.discovery },
      advanced: previous.level !== planet.discovery.level,
    };
  }

  /** Resolves an observation for a non-planet target identified by a stable catalogue key. */
  resolveCatalogueTarget(
    key: string,
    level: DiscoveryLevel,
    confidence: number,
    method: DiscoveryMethod
  ): ScanResolution {
    const previous = this.catalogue.get(key) ?? createDiscoveryRecord();
    const current = advanceDiscoveryRecord(previous, level, confidence, method);
    this.catalogue.set(key, current);
    return {
      previous: { ...previous },
      current: { ...current },
      advanced: previous.level !== current.level,
    };
  }

  /** Returns the known record for one catalogue target. */
  getCatalogueRecord(key: string): DiscoveryRecord {
    return { ...(this.catalogue.get(key) ?? createDiscoveryRecord()) };
  }

  /** Returns a JSON-compatible snapshot of all non-planet discovery records. */
  createSnapshot(): Record<string, DiscoveryRecord> {
    return Object.fromEntries([...this.catalogue.entries()].map(([key, record]) => [key, { ...record }]));
  }

  /** Replaces catalogue discovery state from a validated save snapshot. */
  restoreSnapshot(snapshot: Record<string, DiscoveryRecord>): void {
    this.catalogue = new Map(Object.entries(snapshot).map(([key, record]) => [key, { ...record }]));
  }
}
