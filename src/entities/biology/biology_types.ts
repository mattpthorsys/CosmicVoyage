export const BIOLOGY_VERSION = 3;
export const HABITAT_VERSION = 1;
export const ENCOUNTER_WIDTH = 32;
export const ENCOUNTER_HEIGHT = 24;
export const ENCOUNTER_CELL_METRES = 5;

export type BiologicalBehaviour = 'sessile' | 'passive' | 'skittish' | 'territorial' | 'ambush';
export const BEHAVIOUR_OBSERVATION_KINDS = [
  'feeding',
  'shelter-use',
  'group-retreat',
  'defensive-display',
] as const;
export type BehaviourObservationKind = (typeof BEHAVIOUR_OBSERVATION_KINDS)[number];

export interface BehaviourObservation {
  readonly kind: BehaviourObservationKind;
  readonly siteId: string;
  readonly individualIds: readonly string[];
  readonly elapsedSeconds: number;
}

export interface BehaviourWitness {
  readonly species: SpeciesDefinition;
  readonly observation: BehaviourObservation;
}
export type SpecimenKind = 'tissue' | 'dead' | 'live' | 'propagule';
export type IndividualSizeClass = 'small' | 'typical' | 'large';
export type IndividualMineralisation = 'standard' | 'reinforced';
export type BiologicalSolvent = 'water' | 'ammonia' | 'hydrocarbon';
export type EvidenceLevel = 0 | 1 | 2 | 3;
export type StunPower = 0 | 1 | 2;
export type BiologicalActivity =
  | 'attached'
  | 'resting'
  | 'foraging'
  | 'feeding'
  | 'sheltering'
  | 'withdrawing'
  | 'displaying'
  | 'defending'
  | 'returning';
export type HabitatKind =
  | 'moist-margin'
  | 'sheltered-ground'
  | 'exposed-ground'
  | 'rocky-margin'
  | 'upland-ground';
export type OrganismBodyForm =
  | 'mat'
  | 'frond'
  | 'colony'
  | 'fan'
  | 'rosette'
  | 'walker'
  | 'tripod'
  | 'radial'
  | 'burrower'
  | 'ambush';

/** External family traits, kept separate from inferred ancestry and internal physiology. */
export interface OrganismAnatomy {
  readonly appendages: number;
  readonly segments: number;
  readonly profile: 'low' | 'raised';
  readonly pigment: 'green' | 'blue' | 'ochre' | 'red' | 'violet' | 'pale';
}

export interface HabitatProfile {
  readonly version: number;
  readonly kind: HabitatKind;
  readonly description: string;
  readonly relief: number;
  readonly waterDistanceCells: number | null;
}

export interface SpeciesDefinition {
  /** A bounded prototype for detachable dormant buds; never inferred from appearance alone. */
  readonly reproduction?: { readonly kind: 'dormant-buds'; readonly baselineSamples: number };
  readonly id: string;
  readonly bodyId: string;
  readonly name: string;
  readonly lineage: string;
  readonly origin: 'native' | 'introduced';
  readonly symmetry: 'bilateral' | 'radial' | 'trilateral';
  readonly organisation: string;
  readonly covering: string;
  readonly senses: string;
  readonly metabolism: 'autotroph' | 'heterotroph' | 'mixotroph';
  readonly respiration: 'aerobic' | 'anaerobic';
  readonly role: string;
  readonly locomotion: string;
  readonly behaviour: BiologicalBehaviour;
  readonly massKg: number;
  readonly sizeM: number;
  readonly glyph: string;
  readonly susceptibility: number;
  readonly armour: number;
  readonly temperatureK: number;
  readonly pressureBar: number;
  readonly chemistry: string;
  readonly rarity: number;
  readonly recognised: boolean;
  readonly baselineSamples: number;
  readonly remoteness: number;
  readonly habitatAffinity?: readonly HabitatKind[];
  readonly socialBehaviour?: 'group-retreat';
  /** Typed resource preferences; descriptive role text is never parsed by the encounter AI. */
  readonly foragingGuild?: 'grazer' | 'detritivore';
  readonly seeksShelter?: boolean;
  /** Observed external anatomy; this also selects the constrained silhouette library. */
  readonly bodyForm?: OrganismBodyForm;
  readonly anatomy?: OrganismAnatomy;
  /** A bounded community-selection weight, not a simulated population count. */
  readonly relativeAbundance?: number;
  readonly structuralMaterial?: 'organic' | 'silica' | 'mineral';
  readonly preservation?: {
    readonly solvent: BiologicalSolvent;
    readonly retainsSubstrate: boolean;
  };
}

export interface BiologySite {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly habitat?: HabitatProfile;
}

export interface BiosphereDefinition {
  readonly id: string;
  readonly bodyName: string;
  readonly origin: 'native' | 'introduced';
  readonly species: readonly SpeciesDefinition[];
  readonly sites: readonly BiologySite[];
}

export interface SpeciesEvidence {
  species: SpeciesDefinition;
  level: EvidenceLevel;
  collected: boolean;
  submittedLevel: EvidenceLevel;
  /** Only visited sites are recorded; reading the log never generates new worlds. */
  origins?: BiologyOrigin[];
  /** Site-specific, witnessed episodes; inferred behaviour and scan strength do not supply these. */
  behaviourObservations?: BehaviourObservation[];
}

export interface BiologyOrigin {
  systemName: string;
  worldX: number;
  worldY: number;
  systemSlot: number;
  bodyPath: string;
  bodyName: string;
  surface: { x: number; y: number; siteId: string; label: string };
  /** Evidence actually acquired here, distinct from stronger knowledge of this species elsewhere. */
  level?: EvidenceLevel;
}

export interface ResearchDemandRecord {
  entitlementPaid: number;
  samples: number;
  /** Reproductive reference demand is independent of adult/tissue sampling, but shares novelty. */
  propaguleSamples?: number;
  contributions: string[];
}

export interface SpecimenContainer {
  id: string;
  sourceId: string;
  siteId: string;
  species: SpeciesDefinition;
  kind: SpecimenKind;
  quality: number;
  volumeM3: number;
  /** Mass relative to the canonical species profile; absent in pre-variation containers. */
  sizeScale?: number;
  mineralisation?: IndividualMineralisation;
}

export interface EncounterIndividual {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  state: 'active' | 'stunned' | 'dead' | 'collected';
  exposure: number;
  injury: number;
  recoveryAt: number;
  sampled: boolean;
  /** One finite viable batch per source, retained after sale, disposal and site re-entry. */
  propagulesHarvested?: boolean;
  alerted: boolean;
  groupId?: string;
  retreatUntil?: number;
  sizeScale?: number;
  mineralisation?: IndividualMineralisation;
  activity?: BiologicalActivity;
  /** Local action time, never wall time; a fresh warning protects the whole initiating command. */
  displayUntil?: number;
}

export interface EncounterField {
  site: BiologySite;
  bodyId: string;
  seed: string;
  species: SpeciesDefinition[];
  terrain: string[];
  /** Local ecological patches: moist substrate, sheltered substrate, and open ground. */
  patches?: string[];
  individuals: EncounterIndividual[];
  roverX: number;
  roverY: number;
  elapsedSeconds: number;
  turn: number;
}

export interface XenobiologySnapshot {
  evidence: Record<string, SpeciesEvidence>;
  demand: Record<string, ResearchDemandRecord>;
  fields: Record<string, EncounterField>;
  activeSiteId: string | null;
}

/** Creates independent empty campaign biology records. */
export function createXenobiologySnapshot(): XenobiologySnapshot {
  return { evidence: {}, demand: {}, fields: {}, activeSiteId: null };
}
