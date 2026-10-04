import { CONFIG } from '../config';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { SolarSystem } from '../entities/solar_system';
import { PRNG } from '../utils/prng';
import {
  getHyperspaceSurveyCellProvider,
  LocalHyperspaceSurveyCellProvider,
  type HyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';
import { getStellarDetectionRadii } from './stellar_detection';
import { measureObservatoryContact } from './observatory_measurements';
import {
  createObservatorySnapshot,
  observatoryContactId,
  observatoryDistanceLy,
  type ObservatoryCapabilities,
  type ObservatoryContact,
  type ObservatoryObservation,
  type ObservatorySnapshot,
} from './observatory_types';

/** Owns bounded catalogue searches and persistent evidence, never terrain or physical travel state. */
export class ObservatoryService {
  snapshot = createObservatorySnapshot();
  private readonly provider: HyperspaceSurveyCellProvider;
  private readonly searchCache = new Map<string, ObservatoryContact[]>();
  private readonly physicalCache = new Map<string, SolarSystem>();
  private readonly exposureBudgets = new Map<string, number>();
  private generation = 0;

  /** Shares the installed worker provider while retaining a deterministic synchronous fallback. */
  constructor(
    private readonly generator: SystemDataGenerator,
    private readonly seed: PRNG,
    provider: HyperspaceSurveyCellProvider | null = getHyperspaceSurveyCellProvider()
  ) {
    this.provider = provider ?? new LocalHyperspaceSurveyCellProvider(generator);
  }

  /** Invalidates work when a modal closes or a new search supersedes it. */
  cancel(): void {
    this.generation++;
  }

  /** Returns a detached save payload instead of exposing live observation arrays. */
  createSnapshot(): ObservatorySnapshot {
    return structuredClone(this.snapshot);
  }

  /** Restores already-validated evidence and discards any previous in-flight catalogue work. */
  restoreSnapshot(snapshot: ObservatorySnapshot): void {
    this.cancel();
    this.snapshot = structuredClone(snapshot);
    this.searchCache.clear();
    this.physicalCache.clear();
    this.exposureBudgets.clear();
  }

  /** Searches a physical radius in small worker batches; filters and pagination never alter coverage. */
  async search(
    x: number,
    y: number,
    capabilities: ObservatoryCapabilities,
    progress: (fraction: number) => void = () => {}
  ): Promise<ObservatoryContact[] | null> {
    const generation = ++this.generation;
    const medium = this.generator.getInterstellarMediumProperties(x, y);
    const radiusLy = capabilities.contactRadiusLy * medium.sensorRangeMultiplier;
    const signature = `${x},${y}|${radiusLy.toFixed(3)}|${capabilities.stellarRangeMultiplier}`;
    const cached = this.searchCache.get(signature);
    if (cached) {
      progress(1);
      return cached;
    }
    const radius = Math.ceil(radiusLy / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const requests: Array<{ worldX: number; worldY: number }> = [];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (Math.hypot(dx, dy) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS <= radiusLy)
          requests.push({ worldX: x + dx, worldY: y + dy });
    const contacts: ObservatoryContact[] = [];
    for (let offset = 0; offset < requests.length; offset += 256) {
      if (generation !== this.generation) return null;
      const cells = await this.provider.getCellDataBatchAsync(requests.slice(offset, offset + 256));
      if (generation !== this.generation) return null;
      for (const cell of cells) {
        const address = { worldX: cell.worldX, worldY: cell.worldY, systemSlot: 0 };
        const distanceLy = observatoryDistanceLy(x, y, address);
        if (cell.system.exists && cell.system.name) {
          const detection = getStellarDetectionRadii(
            cell.system,
            medium.sensorRangeMultiplier * capabilities.stellarRangeMultiplier
          );
          if (distanceLy / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS > detection.statusRadius) continue;
          const architecture = this.generator.getSystemProperties(cell.worldX, cell.worldY).architecture;
          contacts.push({
            ...address,
            id: observatoryContactId(address),
            name: cell.system.name,
            kind: 'system',
            distanceLy,
            system: cell.system,
            phenomenon: null,
            multiplicity:
              architecture?.kind === 'starless' ? 'unresolved' : (architecture?.kind ?? 'unresolved'),
          });
        } else if (
          capabilities.equipmentClass > 0 &&
          cell.phenomenon.type === 'ancient-signal' &&
          cell.phenomenon.name
        ) {
          contacts.push({
            ...address,
            id: observatoryContactId(address, 'signal'),
            name: cell.phenomenon.name,
            kind: 'signal',
            distanceLy,
            system: null,
            phenomenon: cell.phenomenon,
            multiplicity: 'unresolved',
          });
        }
      }
      progress(Math.min(1, (offset + cells.length) / requests.length));
      // Yield even with the local fallback, so a large search cannot starve input or paint.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (generation !== this.generation) return null;
    contacts.sort((a, b) => a.distanceLy - b.distanceLy || a.id.localeCompare(b.id));
    this.searchCache.set(signature, contacts);
    if (this.searchCache.size > 6) this.searchCache.delete(this.searchCache.keys().next().value!);
    return contacts;
  }

  /** Materializes only an observed system; planet surfaces remain unprepared. */
  getPhysicalSystem(contact: ObservatoryContact): SolarSystem | null {
    if (contact.kind !== 'system') return null;
    const cached = this.physicalCache.get(contact.id);
    if (cached) return cached;
    const properties = this.generator.getSystemProperties(contact.worldX, contact.worldY, contact.systemSlot);
    if (!properties.exists) return null;
    const system = new SolarSystem(properties, contact.worldX, contact.worldY, this.seed);
    this.physicalCache.set(contact.id, system);
    if (this.physicalCache.size > 48) this.physicalCache.delete(this.physicalCache.keys().next().value!);
    return system;
  }

  /** Retains the best evidence; passive revisits cannot downgrade a deliberate exposure. */
  retain(contact: ObservatoryContact, observation: ObservatoryObservation): void {
    const previous = this.snapshot.observations[contact.id];
    if (
      !previous ||
      observation.quality > previous.quality ||
      (observation.quality === previous.quality && observation.exposure > previous.exposure)
    ) {
      this.snapshot.observations[contact.id] = structuredClone(observation);
      const keys = Object.keys(this.snapshot.observations);
      if (keys.length > 4096) delete this.snapshot.observations[keys[0]];
    }
  }

  /** Marks a reachable coordinate without revealing, generating or entering its local worlds. */
  markDestination(contact: ObservatoryContact): void {
    this.snapshot.destination = {
      worldX: contact.worldX,
      worldY: contact.worldY,
      systemSlot: contact.systemSlot,
      name: contact.name,
      kind: contact.kind,
    };
  }

  /** Integrates bounded exposures; reopening or rendering the terminal cannot reroll measurements. */
  observe(
    contact: ObservatoryContact,
    capabilities: ObservatoryCapabilities,
    x: number,
    y: number,
    deliberate: boolean,
    currentSystem: SolarSystem | null = null
  ): { record: ObservatoryObservation; seconds: number } {
    const previous = this.snapshot.observations[contact.id];
    const sameSetup =
      previous?.observedFromX === x &&
      previous.observedFromY === y &&
      previous.equipmentClass === capabilities.equipmentClass;
    const setup = `${contact.id}|${x},${y}|${capabilities.equipmentClass}|${capabilities.qualityCeiling}`;
    const used = this.exposureBudgets.get(setup) ?? (sameSetup ? (previous?.exposure ?? 0) : 0);
    const exposure = deliberate ? Math.min(3, used + 1) : 0;
    if (deliberate && capabilities.equipmentClass > 0) {
      this.exposureBudgets.set(setup, exposure);
      if (this.exposureBudgets.size > 4096)
        this.exposureBudgets.delete(this.exposureBudgets.keys().next().value!);
    }
    const medium = this.generator.getInterstellarMediumProperties(x, y);
    const range = observatoryDistanceLy(x, y, contact);
    const canResolveAtmosphere =
      capabilities.equipmentClass > 0 &&
      range <= capabilities.atmosphericRadiusLy * medium.sensorRangeMultiplier;
    const system =
      contact.kind === 'system' && (canResolveAtmosphere || contact.system?.stationKind)
        ? (currentSystem ?? this.getPhysicalSystem(contact))
        : null;
    const record = measureObservatoryContact(
      contact,
      system,
      capabilities,
      x,
      y,
      medium.sensorRangeMultiplier,
      exposure
    );
    this.retain(contact, record);
    return {
      record: this.snapshot.observations[contact.id] ?? record,
      seconds: deliberate && capabilities.equipmentClass > 0 && used < 3 ? 300 : 0,
    };
  }
}
