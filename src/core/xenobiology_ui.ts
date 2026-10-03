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
import type { TextDashboardLine, TextTableRow } from './text_ui';
import type { XenobiologyService } from './xenobiology_service';

export interface EncounterViewModel {
  readonly title: string;
  readonly terrain: readonly string[];
  readonly rover: Readonly<{ x: number; y: number }>;
  readonly actors: readonly Readonly<{
    id: string;
    x: number;
    y: number;
    glyph: string;
    state: string;
    dangerous: boolean;
    selected: boolean;
  }>[];
  readonly scanner: readonly string[];
  readonly status: readonly string[];
  readonly message: string;
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

/** Provides comparable pre-pursuit quotes for a particular source individual. */
export function targetQuotes(
  field: EncounterField,
  target: EncounterIndividual,
  service: XenobiologyService
): string {
  const species = individualSpecies(field, target);
  if ((service.evidence(species.id)?.level ?? 0) < 2) return 'Value unresolved: observe within 40 m';
  const prices = (['tissue', 'dead', 'live'] as const).map(
    (kind) =>
      service.quote(species, {
        id: `${target.id}/${kind}`,
        sourceId: target.id,
        siteId: field.site.id,
        species,
        kind,
        quality: 1,
        volumeM3: 0.1,
      }).credits
  );
  return `Cr tissue ${prices[0]} / dead ${prices[1]} / live ${prices[2]} (pristine)`;
}

/** Builds a detached rendering snapshot, excluding occluded or collected contacts. */
export function createEncounterView(
  field: EncounterField,
  targetId: string | null,
  service: XenobiologyService,
  power: StunPower,
  stasisClass: number,
  integrity: number,
  cargo: string,
  message: string
): EncounterViewModel {
  const visible = field.individuals.filter((individual) => encounterVisible(field, individual));
  const target = visible.find((individual) => individual.id === targetId);
  const scanner: string[] = [];
  if (target) {
    const species = individualSpecies(field, target);
    const level = service.evidence(species.id)?.level ?? 0;
    scanner.push(...speciesDescription(species, service).slice(0, 6));
    const range = Math.hypot(target.x - field.roverX, target.y - field.roverY) * 5;
    scanner.push(
      `${range.toFixed(0)} m / ${target.state}${target.sampled ? ' / sampled' : ''}`,
      targetQuotes(field, target, service)
    );
    if (target.state === 'stunned')
      scanner.push(`Recovery in ${Math.max(0, target.recoveryAt - field.elapsedSeconds).toFixed(0)} s`);
    if (species.susceptibility > 0) {
      const estimate = estimateStun(species, power, level, target.exposure);
      scanner.push(
        `Stun ${['LOW', 'STANDARD', 'HIGH'][power]}: ${estimate.stun}`,
        `Mortality ${estimate.mortality} / ${estimate.recovery}`
      );
    }
    scanner.push(`Stasis: ${stasisCompatibility(species, stasisClass) ?? 'compatible'}`);
  } else scanner.push('No contact selected', `${visible.length} visible biological contacts`);
  return {
    title: `FIELD SURVEY / ${field.site.label.toUpperCase()}`,
    terrain: [...field.terrain],
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
      };
    }),
    scanner,
    status: [
      `LOCAL ${field.elapsedSeconds.toFixed(0)} s / 5 m per cell`,
      `Rover integrity ${integrity}% / cargo ${cargo}`,
    ],
    message,
  };
}

/** Wraps a dossier's text at cell boundaries, retaining every word on narrow displays. */
export function biologyDashboard(lines: readonly string[], width: number): TextDashboardLine[] {
  const result: TextDashboardLine[] = [];
  const limit = Math.max(12, width);
  for (const line of lines) {
    let remainder = line;
    do {
      let end = Math.min(limit, remainder.length);
      if (end < remainder.length) {
        const space = remainder.lastIndexOf(' ', end);
        if (space > 0) end = space;
      }
      result.push({
        segments: [
          {
            text: remainder.slice(0, end),
            tone: result.length === 0 ? 'cyan' : 'green',
            font: result.length === 0 ? 'thick' : 'thin',
          },
        ],
      });
      remainder = remainder.slice(end).trimStart();
    } while (remainder);
  }
  return result;
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
        detail:
          'Campaign-wide research demand. Submission keeps your evidence; only improved data earns another award.',
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
      detail: `Submit one whole ${container.kind} specimen. Quality ${Math.round(container.quality * 100)}%. Scientific novelty is shared across every station.`,
      disabled: service.quote(container.species, container).credits <= 0,
    })),
  ];
}
