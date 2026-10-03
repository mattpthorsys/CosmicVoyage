import {
  ENCOUNTER_HEIGHT,
  ENCOUNTER_WIDTH,
  type SpeciesDefinition,
  type SpecimenContainer,
  type XenobiologySnapshot,
} from './biology_types';

/** Requires a structured save value without trusting a cast of imported JSON. */
function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid biology record.');
}

/** Requires a bounded numeric field; integral identities and counters are checked separately. */
function number(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER, integer = false): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error('Invalid biology number.');
}

/** Requires a nonempty finite-size description or identity string. */
function text(value: unknown): void {
  if (typeof value !== 'string' || !value.length || value.length > 1024)
    throw new Error('Invalid biology text.');
}

/** Requires one of the domain's closed enum values. */
function choice(value: unknown, choices: readonly unknown[]): void {
  if (!choices.includes(value)) throw new Error('Invalid biology classification.');
}

/** Validates authoritative species traits before any scanner, quote or actor can use them. */
export function validateSpecies(value: unknown): asserts value is SpeciesDefinition {
  record(value);
  for (const key of [
    'id',
    'bodyId',
    'name',
    'lineage',
    'organisation',
    'covering',
    'senses',
    'role',
    'locomotion',
    'chemistry',
  ])
    text(value[key]);
  choice(value.origin, ['native', 'introduced']);
  choice(value.symmetry, ['bilateral', 'radial', 'trilateral']);
  choice(value.metabolism, ['autotroph', 'heterotroph', 'mixotroph']);
  choice(value.respiration, ['aerobic', 'anaerobic']);
  choice(value.behaviour, ['sessile', 'passive', 'skittish', 'territorial', 'ambush']);
  if (typeof value.glyph !== 'string' || value.glyph.length !== 1 || typeof value.recognised !== 'boolean')
    throw new Error('Invalid biology symbol/recognition.');
  number(value.massKg, 0.01, 1000);
  number(value.sizeM, 0.01, 100);
  number(value.susceptibility, 0, 5);
  number(value.armour, 0, 5);
  number(value.temperatureK, 1, 1000);
  number(value.pressureBar, 0, 1000);
  number(value.rarity, 0.01, 10);
  number(value.baselineSamples, 0, 100, true);
  number(value.remoteness, 0, 1);
}

/** Validates a complete biological container, never interpreting it as a divisible trade lot. */
export function validateSpecimen(value: unknown): asserts value is SpecimenContainer {
  record(value);
  for (const key of ['id', 'sourceId', 'siteId']) text(value[key]);
  validateSpecies(value.species);
  choice(value.kind, ['live', 'dead', 'tissue']);
  number(value.quality, 0, 1);
  number(value.volumeM3, 0.1, 100);
}

/** Validates campaign records and cross-references physical ownership across both cargo carriers. */
export function validateXenobiology(
  value: unknown,
  containers: readonly SpecimenContainer[]
): asserts value is XenobiologySnapshot {
  record(value);
  record(value.evidence);
  record(value.demand);
  record(value.fields);
  for (const [id, evidence] of Object.entries(value.evidence)) {
    record(evidence);
    validateSpecies(evidence.species);
    if (evidence.species.id !== id || typeof evidence.collected !== 'boolean')
      throw new Error('Invalid biology evidence identity.');
    number(evidence.level, 0, 3, true);
    number(evidence.submittedLevel, 0, evidence.level as number, true);
  }
  for (const [id, demand] of Object.entries(value.demand)) {
    record(demand);
    if (!value.evidence[id]) throw new Error('Research demand has no species evidence.');
    number(demand.entitlementPaid, 0);
    number(demand.samples, 0, Number.MAX_SAFE_INTEGER, true);
    if (
      !Array.isArray(demand.contributions) ||
      demand.contributions.some((item) => typeof item !== 'string') ||
      new Set(demand.contributions).size !== demand.contributions.length
    )
      throw new Error('Invalid research contributions.');
  }
  for (const [id, field] of Object.entries(value.fields)) {
    record(field);
    record(field.site);
    text(field.bodyId);
    text(field.seed);
    if (field.site.id !== id) throw new Error('Invalid habitat identity.');
    text(field.site.label);
    number(field.site.x, 0, 4096, true);
    number(field.site.y, 0, 4096, true);
    if (
      !Array.isArray(field.terrain) ||
      field.terrain.length !== ENCOUNTER_HEIGHT ||
      field.terrain.some(
        (row) => typeof row !== 'string' || row.length !== ENCOUNTER_WIDTH || !/^[.#]+$/.test(row)
      )
    )
      throw new Error('Invalid encounter terrain.');
    number(field.roverX, 1, ENCOUNTER_WIDTH - 2, true);
    number(field.roverY, 1, ENCOUNTER_HEIGHT - 2, true);
    number(field.elapsedSeconds, 0);
    number(field.turn, 0, Number.MAX_SAFE_INTEGER, true);
    if (
      !Array.isArray(field.species) ||
      field.species.length < 1 ||
      field.species.length > 12 ||
      !Array.isArray(field.individuals) ||
      field.individuals.length > 24
    )
      throw new Error('Invalid encounter population.');
    field.species.forEach(validateSpecies);
    const speciesIds = new Set(field.species.map((species) => species.id));
    const individualIds = new Set<string>();
    const positions = new Set<string>();
    for (const individual of field.individuals) {
      record(individual);
      text(individual.id);
      if (!speciesIds.has(individual.speciesId as string) || individualIds.has(individual.id as string))
        throw new Error('Invalid individual identity.');
      individualIds.add(individual.id as string);
      for (const key of ['x', 'homeX']) number(individual[key], 1, ENCOUNTER_WIDTH - 2, true);
      for (const key of ['y', 'homeY']) number(individual[key], 1, ENCOUNTER_HEIGHT - 2, true);
      choice(individual.state, ['active', 'stunned', 'dead', 'collected']);
      number(individual.exposure, 0, Number.MAX_SAFE_INTEGER, true);
      number(individual.injury, 0);
      number(individual.recoveryAt, 0);
      if (typeof individual.sampled !== 'boolean' || typeof individual.alerted !== 'boolean')
        throw new Error('Invalid individual history.');
      const position = `${individual.x},${individual.y}`;
      if (individual.state !== 'collected') {
        if (
          positions.has(position) ||
          (individual.x === field.roverX && individual.y === field.roverY) ||
          field.terrain[individual.y as number][individual.x as number] !== '.'
        )
          throw new Error('Overlapping encounter actors.');
        positions.add(position);
      }
    }
    if (field.terrain[field.roverY as number][field.roverX as number] !== '.')
      throw new Error('Rover inside obstacle.');
  }
  if (
    value.activeSiteId !== null &&
    (typeof value.activeSiteId !== 'string' || !value.fields[value.activeSiteId])
  )
    throw new Error('Invalid active biological site.');
  const owned = new Set<string>();
  for (const container of containers) {
    validateSpecimen(container);
    if (owned.has(container.id)) throw new Error('Duplicate specimen ownership.');
    owned.add(container.id);
    const field = value.fields[container.siteId];
    record(field);
    const individual = (field.individuals as Record<string, unknown>[]).find(
      (item) => item.id === container.sourceId
    );
    if (
      !individual ||
      individual.speciesId !== container.species.id ||
      (container.kind === 'tissue' ? !individual.sampled : individual.state !== 'collected')
    )
      throw new Error('Specimen source lifecycle inconsistent.');
  }
}
