import {
  createXenobiologySnapshot,
  type EvidenceLevel,
  type SpeciesDefinition,
  type SpecimenContainer,
  type ResearchDemandRecord,
  type SpeciesEvidence,
  type XenobiologySnapshot,
  type BiologyOrigin,
  type BehaviourWitness,
  type BehaviourObservationKind,
  BEHAVIOUR_OBSERVATION_KINDS,
} from '../entities/biology/biology_types';
import { supportsPropagules } from '../entities/biology/propagules';

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

  /** Retains one witnessed episode per site/type after identification, without changing scan grade or price. */
  recordBehaviour(witness: BehaviourWitness, origin?: BiologyOrigin): boolean {
    const { species, observation } = witness;
    const evidence = this.evidence(species.id);
    const field = this.state.fields[observation.siteId];
    if (
      !evidence ||
      evidence.level < 2 ||
      !field ||
      !BEHAVIOUR_OBSERVATION_KINDS.includes(observation.kind) ||
      !Number.isFinite(observation.elapsedSeconds) ||
      observation.elapsedSeconds < 0 ||
      observation.elapsedSeconds > field.elapsedSeconds ||
      !observation.individualIds.length ||
      observation.individualIds.length > 24 ||
      new Set(observation.individualIds).size !== observation.individualIds.length ||
      (observation.kind === 'group-retreat' && observation.individualIds.length < 2) ||
      observation.individualIds.some(
        (id) => !field.individuals.some((actor) => actor.id === id && actor.speciesId === species.id)
      ) ||
      !field.species.some((entry) => entry.id === species.id && entry.bodyId === species.bodyId) ||
      (evidence.behaviourObservations?.length ?? 0) >= 128 ||
      evidence.behaviourObservations?.some(
        (entry) => entry.siteId === observation.siteId && entry.kind === observation.kind
      )
    )
      return false;
    if (observation.kind === 'group-retreat') {
      const sources = observation.individualIds.map(
        (id) => field.individuals.find((actor) => actor.id === id)!
      );
      if (!sources[0].groupId || sources.some((actor) => actor.groupId !== sources[0].groupId)) return false;
    }
    if (origin) this.observe(species, 2, origin);
    const observations = (evidence.behaviourObservations ??= []);
    // Historical records can back accepted contracts: never evict them to admit a new episode.
    observations.push(structuredClone(observation));
    return true;
  }

  /** Checks a specific field episode, independently of general physiology or analysis evidence. */
  hasBehaviour(speciesId: string, siteId: string, kind: BehaviourObservationKind): boolean {
    return (
      this.evidence(speciesId)?.behaviourObservations?.some(
        (entry) => entry.siteId === siteId && entry.kind === kind
      ) ?? false
    );
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
    if (container?.kind === 'propagule' && !supportsPropagules(species))
      return { credits: 0, entitlement: 0, contribution: '' };
    const ledger = this.state.demand[species.id];
    const level = container ? 3 : evidence.level;
    const contribution = container
      ? `${container.sourceId}:${container.kind}`
      : `data:${species.id}:${level}`;
    if (ledger?.contributions.includes(contribution) || (!container && evidence.submittedLevel >= level))
      return { credits: 0, entitlement: ledger?.entitlementPaid ?? 0, contribution };
    const grade = container
      ? { tissue: 0.32, dead: 0.6, live: 1, propagule: 0.75 }[container.kind] * container.quality
      : level === 3
        ? 0.2
        : 0.08;
    const value = Math.round(4500 * species.rarity * (1 + species.remoteness * 0.25));
    const entitlement = species.recognised ? 0 : Math.round(value * grade);
    const novelty = Math.max(0, entitlement - (ledger?.entitlementPaid ?? 0));
    // Reproductive references answer a different question from adult/tissue samples. The first-discovery cap remains shared.
    const samples =
      container?.kind === 'propagule'
        ? (species.reproduction?.baselineSamples ?? 0) + (ledger?.propaguleSamples ?? 0)
        : species.baselineSamples + (ledger?.samples ?? 0);
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
    if (container?.kind === 'propagule') ledger.propaguleSamples = (ledger.propaguleSamples ?? 0) + 1;
    else if (container) ledger.samples++;
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
