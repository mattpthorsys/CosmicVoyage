import type {
  EncounterField,
  EncounterIndividual,
  SpeciesDefinition,
  SpecimenContainer,
  StunPower,
} from '../entities/biology/biology_types';
import { estimateStun } from '../entities/biology/stun_model';
import { encounterVisible, individualSpecies } from '../systems/surface_encounter_system';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import { wrapDashboardLines, type TextDashboardLine, type TextTableRow, type TextTone } from './text_ui';
import type { XenobiologyService } from './xenobiology_service';
import type { CrewMember } from './crew';
import type { EncounterSurface } from './encounter_surface';
import { createOrganismSprite, type PixelSprite } from '../rendering/encounter_sprites';

export interface EncounterPresentation {
  readonly power: StunPower;
  readonly stasisClass: number;
  readonly integrity: number;
  readonly cargo: Readonly<{ usedM3: number; capacityM3: number }>;
  readonly message: string;
  readonly fuel?: number;
  readonly maxFuel?: number;
  readonly crew?: readonly Pick<CrewMember, 'name' | 'hitPoints' | 'maxHitPoints'>[];
  readonly surface?: EncounterSurface;
  readonly bodyName?: string;
  readonly menuActive?: boolean;
  readonly requests?: readonly string[];
}

export interface EncounterViewModel {
  readonly title: string;
  readonly terrain: readonly string[];
  readonly surface?: EncounterSurface;
  readonly turn: number;
  readonly rover: Readonly<{ x: number; y: number }>;
  readonly actors: readonly Readonly<{
    id: string;
    x: number;
    y: number;
    glyph: string;
    state: string;
    dangerous: boolean;
    selected: boolean;
    sprite: PixelSprite;
  }>[];
  readonly scanner: readonly string[];
  readonly status: readonly string[];
  readonly message: string;
  readonly brief: string;
  readonly targetName: string;
  readonly targetStatus: string;
  readonly targetRange: string;
  readonly targetMass: string;
  readonly targetSprite?: PixelSprite;
  readonly cargo: Readonly<{ usedM3: number; capacityM3: number; percent: number }>;
  readonly integrity: number;
  readonly fuelPercent: number;
  readonly crew: readonly Pick<CrewMember, 'name' | 'hitPoints' | 'maxHitPoints'>[];
  readonly menuActive: boolean;
  readonly requests: readonly string[];
}

const spriteCache = new WeakMap<SpeciesDefinition, PixelSprite>();

/** Keeps procedural sprite baking outside the frame drawing loop. */
function organismSprite(species: SpeciesDefinition): PixelSprite {
  const prior = spriteCache.get(species);
  if (prior) return prior;
  const sprite = createOrganismSprite(species);
  spriteCache.set(species, sprite);
  return sprite;
}

/** Summarises only observed ecology, without exposing an unknown organism's hidden physiology. */
export function organismBrief(species: SpeciesDefinition, level: number): string {
  if (level < 1) return 'Unresolved biological contact. Observe to establish movement and ecology.';
  if (level < 2) return `${species.locomotion}. Probable ${species.metabolism}; catalogue match unresolved.`;
  const movement = species.behaviour === 'sessile' ? 'anchored to the substrate' : species.locomotion;
  const social = species.socialBehaviour ? ' Withdraws with nearby group members.' : '';
  return `${species.behaviour.charAt(0).toUpperCase() + species.behaviour.slice(1)} ${species.role}; ${movement}. ${species.metabolism.charAt(0).toUpperCase() + species.metabolism.slice(1)}.${social}`;
}

/** Projects only acquired evidence; raw hidden traits never enter distant scanner text. */
export function speciesDescription(species: SpeciesDefinition, service: XenobiologyService): string[] {
  const level = service.evidence(species.id)?.level ?? 0;
  const mass = `${Math.max(0.1, species.massKg * 0.8).toFixed(1)}-${(species.massKg * 1.2).toFixed(1)} kg`;
  const lines = [
    level >= 2 ? species.name : 'Unresolved organism',
    `${species.symmetry}; ${mass}`,
    service.status(species),
  ];
  if (level >= 1) lines.push(`${species.locomotion}; ${species.metabolism}`);
  if (level >= 2) lines.push(`${species.behaviour}; ${species.role}`, species.chemistry);
  if (level >= 3)
    lines.push(
      `${species.lineage}; ${species.organisation}`,
      species.covering,
      species.senses,
      `${species.sizeM.toFixed(2)} m; ${species.temperatureK.toFixed(0)} K; ${species.pressureBar.toFixed(2)} bar`
    );
  return lines;
}

/** Returns structured specimen estimates using the same quality assumptions as actual collection. */
function specimenEstimates(
  field: EncounterField,
  target: EncounterIndividual,
  service: XenobiologyService
): { kind: 'tissue' | 'dead' | 'live'; credits: number }[] {
  const species = individualSpecies(field, target);
  return (['tissue', 'dead', 'live'] as const).map((kind) => ({
    kind,
    credits: service.quote(species, {
      id: `${target.id}/${kind}`,
      sourceId: target.id,
      siteId: field.site.id,
      species,
      kind,
      quality: Math.max(0.2, 1 - (kind === 'dead' && target.state !== 'dead' ? 1 : target.injury) * 0.35),
      volumeM3: 0.1,
    }).credits,
  }));
}

/** Provides comparable pre-pursuit quotes for a particular source individual. */
export function targetQuotes(
  field: EncounterField,
  target: EncounterIndividual,
  service: XenobiologyService
): string {
  const species = individualSpecies(field, target);
  if ((service.evidence(species.id)?.level ?? 0) < 2) return 'Value unresolved: observe within 40 m';
  return `Cr data ${service.quote(species).credits} / ${specimenEstimates(field, target, service)
    .map((quote) => `${quote.kind} ${quote.credits}`)
    .join(' / ')} (est.)`;
}

/** Builds a detached rendering snapshot, excluding occluded or collected contacts. */
export function createEncounterView(
  field: EncounterField,
  targetId: string | null,
  service: XenobiologyService,
  presentation: EncounterPresentation
): EncounterViewModel {
  const { power, stasisClass, integrity, cargo, message } = presentation;
  const visible = field.individuals.filter((individual) => encounterVisible(field, individual));
  const target = visible.find((individual) => individual.id === targetId);
  const scanner: string[] = [];
  if (target) {
    const species = individualSpecies(field, target);
    const level = service.evidence(species.id)?.level ?? 0;
    scanner.push(...speciesDescription(species, service).slice(0, 3));
    const range = Math.hypot(target.x - field.roverX, target.y - field.roverY) * 5;
    scanner.push(
      `${range.toFixed(0)} m / ${target.state}${target.sampled ? ' / sampled' : ''}`,
      targetQuotes(field, target, service)
    );
    if (target.state === 'stunned')
      scanner.push(`Recovery in ${Math.max(0, target.recoveryAt - field.elapsedSeconds).toFixed(0)} s`);
    if (species.susceptibility > 0) {
      const estimate = estimateStun(species, power, level, target.exposure, target.injury, range);
      scanner.push(
        `Stun ${['LOW', 'STANDARD', 'HIGH'][power]}: ${estimate.stun}`,
        `Mortality ${estimate.mortality} / ${estimate.recovery}`
      );
    }
    scanner.push(`Stasis: ${stasisCompatibility(species, stasisClass) ?? 'compatible'}`);
    if (target.groupId && (target.retreatUntil ?? 0) > field.elapsedSeconds)
      scanner.push('Observed activity: coordinated group withdrawal');
  } else scanner.push('No contact selected', `${visible.length} visible biological contacts`);
  const species = target ? individualSpecies(field, target) : undefined;
  const level = species ? (service.evidence(species.id)?.level ?? 0) : 0;
  return {
    title: `${presentation.bodyName ?? 'SURFACE'} / ${field.site.label.toUpperCase()}`,
    terrain: [...field.terrain],
    surface: presentation.surface,
    turn: field.turn,
    rover: { x: field.roverX, y: field.roverY },
    actors: visible.map((individual) => {
      const species = individualSpecies(field, individual);
      return {
        id: individual.id,
        x: individual.x,
        y: individual.y,
        glyph: species.glyph,
        state: individual.state,
        dangerous:
          (service.evidence(species.id)?.level ?? 0) >= 2 &&
          ['territorial', 'ambush'].includes(species.behaviour),
        selected: individual.id === targetId,
        sprite: organismSprite(species),
      };
    }),
    scanner,
    status: [
      `LOCAL ${field.elapsedSeconds.toFixed(0)} s / 5 m per cell`,
      `ENTRY 16,21 / X${field.roverX} Y${field.roverY}`,
    ],
    message,
    requests: [...(presentation.requests ?? [])],
    brief: species ? organismBrief(species, level) : 'No contact acquired. TAB cycles visible organisms.',
    targetName: species && level >= 2 ? species.name : 'Unresolved organism',
    targetStatus: species ? service.status(species) : 'NO CONTACT',
    targetRange: target
      ? `${(Math.hypot(target.x - field.roverX, target.y - field.roverY) * 5).toFixed(0)} m / ${target.groupId && (target.retreatUntil ?? 0) > field.elapsedSeconds && target.state === 'active' ? 'withdrawing' : target.state}`
      : '--',
    targetMass: species
      ? `${(species.massKg * 0.8).toFixed(1)}-${(species.massKg * 1.2).toFixed(1)} kg / ${species.symmetry}`
      : '',
    targetSprite: species ? organismSprite(species) : undefined,
    cargo: {
      ...cargo,
      percent: cargo.capacityM3 > 0 ? Math.round((100 * cargo.usedM3) / cargo.capacityM3) : 0,
    },
    integrity,
    fuelPercent: presentation.maxFuel
      ? Math.round((100 * (presentation.fuel ?? 0)) / presentation.maxFuel)
      : 100,
    crew: (presentation.crew ?? []).map((member) => ({ ...member })),
    menuActive: presentation.menuActive ?? false,
  };
}

/** Wraps a dossier's text at cell boundaries, retaining every word on narrow displays. */
export function biologyDashboard(lines: readonly string[], width: number): TextDashboardLine[] {
  return wrapDashboardLines(
    lines.map((text, index) => ({
      segments: [
        {
          text,
          tone: index === 0 ? 'cyan' : 'normal',
          font: index === 0 ? 'thick' : 'thin',
        },
      ],
    })),
    width
  );
}

/** Builds a colour-coded biological report with stable sections and evidence-gated fields. */
export function createBiologicalDossier(
  species: SpeciesDefinition,
  service: XenobiologyService,
  width: number,
  contact?: {
    field: EncounterField;
    target: EncounterIndividual;
    power: StunPower;
    stasisClass: number;
    requests?: readonly string[];
  }
): TextDashboardLine[] {
  const level = service.evidence(species.id)?.level ?? 0;
  const lines: TextDashboardLine[] = [];
  /** Separates report topics with a display-face heading and a restrained rule. */
  const section = (text: string): void => {
    lines.push(
      { segments: [] },
      {
        segments: [
          { text: text.toUpperCase(), tone: 'cyan', font: 'thick' },
          { text: ` ${'-'.repeat(Math.max(0, width - text.length - 1))}`, tone: 'muted' },
        ],
      }
    );
  };
  /** Aligns labels on wide reports, retaining readable wrapped values on smaller displays. */
  const entry = (label: string, value: string, tone: TextTone = 'normal'): void => {
    lines.push({
      segments: [
        { text: width >= 42 ? `${label.padEnd(16)} ` : `${label}: `, tone: 'muted', font: 'thin' },
        { text: value, tone, font: 'thin' },
      ],
    });
  };
  lines.push({
    segments: [
      {
        text: level >= 2 ? species.name.toUpperCase() : 'UNRESOLVED BIOLOGICAL CONTACT',
        tone: 'bright',
        font: 'thick',
      },
    ],
  });
  const status = service.status(species);
  entry('Catalogue', status, status.includes('UNKNOWN') ? 'amber' : 'green');
  entry(
    'Evidence',
    ['CONTACT ONLY', 'PRELIMINARY', 'OBSERVED', 'BIOCHEMICAL ANALYSIS'][level],
    level >= 2 ? 'green' : 'amber'
  );
  section('Field Identification');
  lines.push({ segments: [{ text: organismBrief(species, level), tone: 'normal', font: 'thin' }] });
  entry(
    'Mass estimate',
    `${Math.max(0.1, species.massKg * 0.8).toFixed(1)}-${(species.massKg * 1.2).toFixed(1)} kg`,
    'amber'
  );
  entry('Body plan', species.symmetry);
  if (level >= 1 && species.bodyForm) entry('External form', species.bodyForm, 'cyan');
  if (contact)
    entry(
      'Contact',
      `${contact.target.state.toUpperCase()} / ${Math.round(Math.hypot(contact.target.x - contact.field.roverX, contact.target.y - contact.field.roverY) * 5)} m`,
      contact.target.state === 'dead' ? 'red' : 'normal'
    );
  section('Ecology & Chemistry');
  if (contact?.field.site.habitat) {
    entry('Habitat', contact.field.site.label, 'cyan');
    entry('Substrate', contact.field.site.habitat.description);
  }
  if (level >= 2) {
    entry('Trophic role', `${species.metabolism} / ${species.role}`, 'green');
    entry(
      'Behaviour',
      species.behaviour,
      ['territorial', 'ambush'].includes(species.behaviour) ? 'amber' : 'normal'
    );
    entry('Locomotion', species.locomotion);
    if (species.socialBehaviour)
      entry('Social response', 'Loose group; local disturbance triggers coordinated retreat.', 'cyan');
    entry('Biochemistry', species.chemistry, 'green');
  } else entry('Assessment', 'Observe at <=40 m to resolve ecology and catalogue identity.', 'amber');
  section('Structure & Lineage');
  if (level >= 3) {
    entry(
      'Ancestry',
      `${species.lineage} / ${species.origin === 'introduced' ? 'managed introduction' : 'native biosphere'}`,
      'cyan'
    );
    entry('Organisation', species.organisation);
    entry('Covering', species.covering);
    entry('Senses', species.senses);
    entry('Length', `${species.sizeM.toFixed(2)} m`, 'amber');
    entry(
      'Environment',
      `${species.temperatureK.toFixed(0)} K / ${species.pressureBar.toFixed(2)} bar`,
      'amber'
    );
  } else
    entry('Assessment', 'Close analysis or a specimen is needed to resolve structural details.', 'muted');
  section('Scientific Demand');
  if (level >= 2) {
    entry('Scan data', `${service.quote(species).credits.toLocaleString()} Cr`, 'amber');
    if (contact) {
      for (const quote of specimenEstimates(contact.field, contact.target, service))
        entry(
          `${quote.kind.charAt(0).toUpperCase() + quote.kind.slice(1)} specimen`,
          `${quote.credits.toLocaleString()} Cr (est.)`,
          'amber'
        );
      entry(
        'Stasis',
        stasisCompatibility(species, contact.stasisClass) ?? 'COMPATIBLE',
        stasisCompatibility(species, contact.stasisClass) ? 'amber' : 'green'
      );
    }
    lines.push({
      segments: [
        {
          text: 'Awards reflect remaining demand, specimen quality and prior submissions. Quotes are estimates.',
          tone: 'muted',
          font: 'thin',
        },
      ],
    });
  } else entry('Value', 'Unresolved until a reliable observation establishes identification.', 'amber');
  if (level >= 2 && contact?.requests?.length) {
    section('Accepted Research Request');
    for (const request of contact.requests) entry('Live delivery', request, 'amber');
    entry(
      'Settlement',
      'Deliver through Research or Missions at the issuer. Ordinary sale does not fulfil the contract.',
      'muted'
    );
  }
  if (contact && species.susceptibility > 0 && contact.target.state !== 'dead') {
    section('Capture Assessment');
    const estimate = estimateStun(
      species,
      contact.power,
      level,
      contact.target.exposure,
      contact.target.injury,
      Math.hypot(contact.target.x - contact.field.roverX, contact.target.y - contact.field.roverY) * 5
    );
    entry('Stun dose', ['LOW', 'STANDARD', 'HIGH'][contact.power], 'cyan');
    entry('Incapacitation', estimate.stun, 'green');
    entry('Mortality risk', estimate.mortality, 'red');
    entry('Recovery', estimate.recovery, 'amber');
    entry(
      'Confidence',
      level >= 3
        ? 'Analysed profile; estimates remain probabilistic.'
        : 'Incomplete physiology; probability ranges are broad.',
      'muted'
    );
  }
  return wrapDashboardLines(lines, width);
}

/** Builds an inspectable specimen manifest with independent scientific quotes. */
export function specimenRows(
  containers: readonly SpecimenContainer[],
  service: XenobiologyService,
  prefix = 'specimen:'
): TextTableRow[] {
  return containers.map((container) => ({
    id: `${prefix}${container.id}`,
    cells: [
      container.species.name,
      container.volumeM3.toFixed(1),
      `${service.quote(container.species, container).credits}`,
      container.kind,
    ],
    detail: `${container.kind.toUpperCase()} / quality ${Math.round(container.quality * 100)}% / ${service.status(container.species)}. Whole sealed container; disposal is irreversible.`,
    tone: container.kind === 'live' ? 'green' : 'normal',
  }));
}

/** Lists indivisible specimens in Sell without turning them into bulk commodities or hiding zero demand. */
export function specimenSaleRows(
  containers: readonly SpecimenContainer[],
  service: XenobiologyService,
  receivesResearch: boolean,
  carrier: 'ship' | 'rover' = 'ship'
): TextTableRow[] {
  return containers.map((container) => {
    const credits = receivesResearch ? service.quote(container.species, container).credits : 0;
    const availability = !receivesResearch
      ? 'No scientific receiving staff here; visit an inhabited port.'
      : credits > 0
        ? 'Enter submits the whole container at the same award as Research.'
        : 'No additional scientific demand. Specimen stays aboard; nothing is discarded.';
    return {
      id: `sample:${container.id}`,
      cells: [container.species.name, '1', String(credits), `${container.kind} specimen`],
      detail: `${availability} ${container.kind.toUpperCase()} / ${carrier === 'rover' ? 'stowed rover' : 'ship hold'} / ${container.volumeM3.toFixed(1)} m^3 / quality ${Math.round(container.quality * 100)}%.`,
      disabled: credits <= 0,
      tone: credits > 0 ? 'green' : 'normal',
      cellTones: ['normal', 'normal', 'amber', 'cyan'],
      detailTone: credits > 0 ? 'cyan' : 'amber',
    };
  });
}

/** Lists data upgrades and physical contributions; ownership is rechecked when selected. */
export function researchRows(
  service: XenobiologyService,
  containers: readonly SpecimenContainer[]
): TextTableRow[] {
  const data = Object.values(service.snapshot.evidence)
    .filter((evidence) => evidence.level >= 2)
    .map((evidence) => {
      const credits = service.quote(evidence.species).credits;
      return {
        id: `data:${evidence.species.id}`,
        cells: [
          evidence.species.name,
          evidence.level === 3 ? 'ANALYSIS' : 'OBSERVATION',
          `${credits} Cr`,
          service.status(evidence.species),
        ],
        detail: 'Evidence retained. Improved data only; demand is shared by all ports.',
        disabled: credits <= 0,
      };
    });
  return [
    ...data,
    ...containers.map((container) => ({
      id: `sample:${container.id}`,
      cells: [
        container.species.name,
        container.kind.toUpperCase(),
        `${service.quote(container.species, container).credits} Cr`,
        service.status(container.species),
      ],
      detail: `Whole ${container.kind} specimen / quality ${Math.round(container.quality * 100)}% / campaign-wide demand.`,
      disabled: service.quote(container.species, container).credits <= 0,
    })),
  ];
}
