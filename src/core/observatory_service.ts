import { CONFIG } from '../config';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { SolarSystem } from '../entities/solar_system';
import type { StellarArchitecture } from '../entities/stellar_body';
import { AU_IN_METERS } from '../constants/physics';
import type { BiologyOrigin } from '../entities/biology/biology_types';
import { PRNG } from '../utils/prng';
import type { InfrastructureRegistry } from './infrastructure_registry';
import {
  getHyperspaceSurveyCellProvider,
  LocalHyperspaceSurveyCellProvider,
  type HyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';
import { getStellarDetectionRadii } from './stellar_detection';
import { measureObservatoryContact } from './observatory_measurements';
import type { HyperspaceSurveyCell } from './hyperspace_survey';
import {
  createObservatorySnapshot,
  observatoryContactId,
  observatoryDistanceLy,
  type ObservatoryCapabilities,
  type ObservatoryContact,
  type ObservatoryObservation,
  type ObservatorySnapshot,
  type ObservatoryAddress,
} from './observatory_types';

/** Owns bounded catalogue searches and persistent evidence, never terrain or physical travel state. */
export class ObservatoryService {
  snapshot = createObservatorySnapshot();
  private readonly provider: HyperspaceSurveyCellProvider;
  private readonly searchCache = new Map<string, ObservatoryContact[]>();
  private readonly physicalCache = new Map<string, SolarSystem>();
  private readonly exposureBudgets = new Map<string, number>();
  private generation = 0;
  private passiveGeneration = 0;
  private lastPassiveAt = -Infinity;

  /** Shares the installed worker provider while retaining a deterministic synchronous fallback. */
  constructor(
    private readonly generator: SystemDataGenerator,
    private readonly seed: PRNG,
    provider: HyperspaceSurveyCellProvider | null = getHyperspaceSurveyCellProvider(),
    private readonly infrastructure?: InfrastructureRegistry,
    private readonly bulkEpoch: () => number = () => 0,
    private readonly onMeasurement?: (
      contact: ObservatoryContact,
      observation: ObservatoryObservation
    ) => void
  ) {
    this.provider = provider ?? new LocalHyperspaceSurveyCellProvider(generator);
  }

  /** Rebuilds registered technology evidence when a deployment changes the world, preserving biology. */
  invalidateInfrastructure(): void {
    this.cancel();
    this.searchCache.clear();
    this.physicalCache.clear();
    for (const record of Object.values(this.snapshot.observations)) {
      const assets = this.infrastructure?.at(record.address) ?? [];
      if (assets.length) {
        record.technology = 'registered';
        record.features = [
          ...new Set([...record.features, 'Registered player-delivered infrastructure.']),
        ].slice(0, 24);
      }
    }
  }

  /** Invalidates work when a modal closes or a new search supersedes it. */
  cancel(): void {
    this.generation++;
    this.passiveGeneration++;
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
    this.lastPassiveAt = -Infinity;
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
          // Charted facility targets remain available when the host is faint; verify their carrier on observation.
          const chartedCarrier =
            capabilities.equipmentClass > 0 &&
            (Boolean(cell.system.stationKind) || !!this.infrastructure?.at(address).length);
          if (distanceLy / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS > detection.statusRadius && !chartedCarrier)
            continue;
          const architecture = this.generator.getSystemProperties(cell.worldX, cell.worldY).architecture;
          contacts.push({
            ...address,
            id: observatoryContactId(address),
            name: cell.system.name,
            kind: 'system',
            distanceLy,
            system: cell.system,
            phenomenon: null,
            multiplicity: observedMultiplicity(architecture, distanceLy, capabilities.equipmentClass),
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
    this.infrastructure?.materialize(system, this.bulkEpoch());
    this.physicalCache.set(contact.id, system);
    if (this.physicalCache.size > 48) this.physicalCache.delete(this.physicalCache.keys().next().value!);
    return system;
  }

  /** Sweeps unmeasured contacts first, including registered carriers beyond atmospheric reach. */
  selectPreliminaryTargets(
    contacts: readonly ObservatoryContact[],
    capabilities: ObservatoryCapabilities,
    mediumEfficiency: number
  ): ObservatoryContact[] {
    if (!capabilities.equipmentClass) return [];
    const reach = capabilities.atmosphericRadiusLy * mediumEfficiency;
    /** Ranks only acquired measurement state, never generated planets or hidden biology. */
    const sampled = (contact: ObservatoryContact): number => {
      const record = this.snapshot.observations[contact.id];
      return record && record.biology !== 'unmeasured' ? 1 : 0;
    };
    return contacts
      .filter(
        (contact) =>
          contact.kind === 'signal' ||
          contact.system?.stationKind ||
          this.infrastructure?.at(contact).length ||
          (contact.system?.objectKind === 'stellar' && contact.distanceLy <= reach)
      )
      .sort((a, b) => sampled(a) - sampled(b) || a.distanceLy - b.distanceLy || a.id.localeCompare(b.id))
      .slice(0, capabilities.passiveTargets);
  }

  /** Retains the best evidence; passive revisits cannot downgrade a deliberate exposure. */
  retain(contact: ObservatoryContact, observation: ObservatoryObservation): void {
    const previous = this.snapshot.observations[contact.id];
    if (this.infrastructure?.at(contact).length) {
      observation = {
        ...observation,
        technology: 'registered',
        features: ['Registered player-delivered infrastructure.', ...observation.features].slice(0, 24),
      };
      if (previous) previous.technology = 'registered';
    }
    if (previous?.biology === 'catalogued') {
      observation = {
        ...observation,
        biology: 'catalogued',
        origin: previous.origin,
        bodyName: previous.bodyName,
        bodyPath: previous.bodyPath,
        features: [
          ...observation.features,
          previous.origin === 'native'
            ? 'Prior surface evidence establishes a native biosphere.'
            : 'Registry or surface evidence establishes a managed biosphere.',
        ].slice(0, 24),
      };
    }
    // Registry knowledge can improve even when its current spectrum is weaker than a saved exposure.
    if (
      previous &&
      previous.biology !== 'catalogued' &&
      observation.biology === 'catalogued' &&
      (previous.quality > observation.quality ||
        (previous.quality === observation.quality && previous.exposure >= observation.exposure))
    ) {
      this.snapshot.observations[contact.id] = {
        ...previous,
        biology: 'catalogued',
        origin: observation.origin,
        technology: observation.technology === 'registered' ? 'registered' : previous.technology,
        bodyName: observation.bodyName,
        bodyPath: observation.bodyPath,
        features: [
          ...new Set([
            ...previous.features,
            ...observation.features.filter((feature) => feature.startsWith('Registry')),
          ]),
        ].slice(0, 24),
      };
      return;
    }
    if (
      !previous ||
      observation.quality > previous.quality ||
      (observation.quality === previous.quality && observation.exposure > previous.exposure)
    ) {
      this.snapshot.observations[contact.id] = structuredClone(observation);
      this.trimCatalogue();
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

  /** Marks a contract's verified stellar address without requiring a prior observatory contact or scan. */
  markSystemDestination(address: ObservatoryAddress, name: string): void {
    this.snapshot.destination = { ...address, name, kind: 'system' };
  }

  /** Imports confirmed surface provenance, never the hidden contents of an unvisited generated biosphere. */
  recordKnownBiosphere(contact: ObservatoryContact, origin: BiologyOrigin, native: boolean): void {
    const record =
      this.snapshot.observations[contact.id] ??
      ({
        address: { worldX: contact.worldX, worldY: contact.worldY, systemSlot: contact.systemSlot },
        quality: 0,
        biology: 'unmeasured',
        technology: 'unmeasured',
        origin: 'unknown',
        features: [],
        bodyName: null,
        bodyPath: null,
        observedFromX: origin.worldX,
        observedFromY: origin.worldY,
        rangeLy: 0,
        equipmentClass: 0,
        exposure: 0,
      } satisfies ObservatoryObservation);
    // Keep native evidence in a mixed system even when a later entry describes introduced life.
    if (record.origin === 'native' && !native) return;
    this.snapshot.observations[contact.id] = {
      ...record,
      biology: 'catalogued',
      origin: native ? 'native' : 'managed',
      bodyName: origin.bodyName,
      bodyPath: origin.bodyPath,
      features: [
        ...record.features.filter((feature) => !feature.startsWith('Prior surface evidence')),
        `Prior surface evidence establishes a ${native ? 'native' : 'managed'} biosphere.`,
      ].slice(0, 24),
    };
    this.trimCatalogue();
  }

  /** Applies the same save bound to both remote readings and imported surface evidence. */
  private trimCatalogue(): void {
    const keys = Object.keys(this.snapshot.observations);
    if (keys.length > 4096) delete this.snapshot.observations[keys[0]];
  }

  /** Samples two nearby visible targets between frames, never widening the renderer's physical search. */
  async sampleWhileTravelling(
    cells: readonly HyperspaceSurveyCell[],
    capabilities: ObservatoryCapabilities,
    x: number,
    y: number
  ): Promise<void> {
    const now = performance.now();
    if (!capabilities.equipmentClass || now - this.lastPassiveAt < 750) return;
    this.lastPassiveAt = now;
    const generation = ++this.passiveGeneration;
    const medium = this.generator.getInterstellarMediumProperties(x, y);
    const targets = cells
      .filter(
        (cell) =>
          cell.system.exists &&
          cell.system.objectKind === 'stellar' &&
          cell.rangeCells * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS <=
            capabilities.atmosphericRadiusLy * medium.sensorRangeMultiplier
      )
      .sort((a, b) => a.rangeCells - b.rangeCells)
      .slice(0, 2);
    for (const cell of targets) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (generation !== this.passiveGeneration) return;
      const address = { worldX: cell.worldX, worldY: cell.worldY, systemSlot: 0 };
      const architecture = this.generator.getSystemProperties(cell.worldX, cell.worldY).architecture;
      const contact: ObservatoryContact = {
        ...address,
        id: observatoryContactId(address),
        name: cell.system.name ?? 'Unclassified contact',
        kind: 'system',
        distanceLy: observatoryDistanceLy(x, y, address),
        system: cell.system,
        phenomenon: null,
        multiplicity: observedMultiplicity(
          architecture,
          observatoryDistanceLy(x, y, address),
          capabilities.equipmentClass
        ),
      };
      this.observe(contact, capabilities, x, y, false);
    }
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
    this.onMeasurement?.(contact, record);
    return {
      record: this.snapshot.observations[contact.id] ?? record,
      seconds: deliberate && capabilities.equipmentClass > 0 && used < 3 ? 300 : 0,
    };
  }
}

/** Resolves actual companions only above the instrument's angular threshold, not projected cell overlaps. */
function observedMultiplicity(
  architecture: StellarArchitecture | null,
  distanceLy: number,
  equipmentClass: number
): ObservatoryContact['multiplicity'] {
  if (!architecture || architecture.kind === 'starless') return 'unresolved';
  if (architecture.kind === 'single') return 'single';
  const angularThreshold = [0.1, 0.025, 0.008, 0.003][equipmentClass];
  const separationAu = architecture.binarySeparation / AU_IN_METERS;
  const angularSeparationArcsec = separationAu / Math.max(0.01, distanceLy / 3.26156);
  return angularSeparationArcsec >= angularThreshold ? architecture.kind : 'unresolved';
}
