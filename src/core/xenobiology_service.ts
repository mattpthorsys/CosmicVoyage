import {
  createXenobiologySnapshot,
  type EvidenceLevel,
  type SpeciesDefinition,
  type SpecimenContainer,
  type ResearchDemandRecord,
  type SpeciesEvidence,
  type XenobiologySnapshot,
  type BiologyOrigin,
} from '../entities/biology/biology_types';

export interface ResearchQuote {
  readonly credits: number;
  readonly entitlement: number;
  readonly contribution: string;
}

/** Owns campaign-wide scientific evidence and diminishing research demand, independent of station markets. */
export class XenobiologyService {
  private state = createXenobiologySnapshot();

  /** Returns authoritative campaign records for encounter orchestration. */
  get snapshot(): XenobiologySnapshot {
    return this.state;
  }

  /** Records stronger evidence once; identical scans do not increase quality or reward. */
  observe(species: SpeciesDefinition, level: EvidenceLevel, origin?: BiologyOrigin): SpeciesEvidence {
    const existing = this.state.evidence[species.id];
    if (!existing) this.state.evidence[species.id] = { species, level, collected: false, submittedLevel: 0 };
    else existing.level = Math.max(existing.level, level) as EvidenceLevel;
    const evidence = this.state.evidence[species.id];
    const existingOrigin = evidence.origins?.find((entry) => entry.surface.siteId === origin?.surface.siteId);
    if (existingOrigin) existingOrigin.level = Math.max(existingOrigin.level ?? 0, level) as EvidenceLevel;
    else if (origin) {
      // Bound campaign log growth while retaining the earliest discovery and recent return sites.
      const origins = (evidence.origins ??= []);
      if (origins.length >= 32) origins.splice(1, 1);
      origins.push({ ...structuredClone(origin), level });
    }
    return this.state.evidence[species.id];
  }

  /** Returns only previously observed knowledge, without creating a catalogue entry. */
  evidence(speciesId: string): SpeciesEvidence | undefined {
    return this.state.evidence[speciesId];
  }

  /** Records personal sampling independently of scientific submission. */
  collected(species: SpeciesDefinition): void {
    this.observe(species, 3).collected = true;
  }

  /** Describes scientific recognition, personal history and shared sample sufficiency. */
  status(species: SpeciesDefinition): string {
    const evidence = this.evidence(species.id);
    if (!evidence || evidence.level < 2) return 'CATALOGUE MATCH UNRESOLVED';
    if (species.baselineSamples + (this.state.demand[species.id]?.samples ?? 0) >= 6)
      return 'WELL SAMPLED / LOW VALUE';
    if (evidence.collected) return 'PREVIOUSLY COLLECTED';
    // Confirmed submissions update catalogue knowledge, not the immutable pre-voyage baseline or reward cap.
    const catalogued =
      species.recognised || evidence.submittedLevel >= 2 || (this.state.demand[species.id]?.samples ?? 0) > 0;
    return catalogued ? 'KNOWN / NOT COLLECTED' : 'UNKNOWN TO SCIENCE';
  }

  /** Calculates bounded cumulative novelty and declining sample value without mutating demand. */
  quote(species: SpeciesDefinition, container?: SpecimenContainer): ResearchQuote {
    const evidence = this.evidence(species.id);
    if (!evidence || evidence.level < 2) return { credits: 0, entitlement: 0, contribution: '' };
    const ledger = this.state.demand[species.id];
    const level = container ? 3 : evidence.level;
    const contribution = container
      ? `${container.sourceId}:${container.kind}`
      : `data:${species.id}:${level}`;
    if (ledger?.contributions.includes(contribution) || (!container && evidence.submittedLevel >= level))
      return { credits: 0, entitlement: ledger?.entitlementPaid ?? 0, contribution };
    const grade = container
      ? { tissue: 0.32, dead: 0.6, live: 1 }[container.kind] * container.quality
      : level === 3
        ? 0.2
        : 0.08;
    const value = Math.round(4500 * species.rarity * (1 + species.remoteness * 0.25));
    const entitlement = species.recognised ? 0 : Math.round(value * grade);
    const novelty = Math.max(0, entitlement - (ledger?.entitlementPaid ?? 0));
    const samples = species.baselineSamples + (ledger?.samples ?? 0);
    const additional = container
      ? Math.round(400 * grade * species.rarity * Math.pow(0.25, samples))
      : species.recognised
        ? Math.round(70 * grade)
        : 0;
    return { credits: novelty + additional, entitlement, contribution };
  }

  /** Records an accepted contribution; only explicit contract delivery can accept zero-value material. */
  submit(species: SpeciesDefinition, container?: SpecimenContainer, acceptZeroValue = false): number {
    const quote = this.quote(species, container);
    if (
      !quote.contribution ||
      (quote.credits <= 0 && !acceptZeroValue) ||
      this.state.demand[species.id]?.contributions.includes(quote.contribution)
    )
      return 0;
    const ledger: ResearchDemandRecord = this.state.demand[species.id] ?? {
      entitlementPaid: 0,
      samples: 0,
      contributions: [],
    };
    ledger.entitlementPaid = Math.max(ledger.entitlementPaid, quote.entitlement);
    if (container) ledger.samples++;
    ledger.contributions.push(quote.contribution);
    this.state.demand[species.id] = ledger;
    if (!container) this.state.evidence[species.id].submittedLevel = this.state.evidence[species.id].level;
    return quote.credits;
  }

  /** Returns detached JSON-compatible records for save checkpoints. */
  createSnapshot(): XenobiologySnapshot {
    return structuredClone(this.state);
  }

  /** Restores a snapshot already checked at the save boundary. */
  restoreSnapshot(snapshot: XenobiologySnapshot): void {
    this.state = structuredClone(snapshot);
  }
}
