import {
  ENCOUNTER_HEIGHT,
  ENCOUNTER_WIDTH,
  HABITAT_VERSION,
  type HabitatProfile,
  type SpeciesDefinition,
  type SpecimenContainer,
  type XenobiologySnapshot,
} from './biology_types';
import { canShareRoverCell, individualPhysicalProfile } from './biology_rules';

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

/** Validates numeric habitat metadata without assuming colour implies moisture or shelter. */
export function validateHabitat(value: unknown): asserts value is HabitatProfile {
  record(value);
  if (value.version !== HABITAT_VERSION) throw new Error('Unsupported habitat version.');
  choice(value.kind, ['moist-margin', 'sheltered-ground', 'exposed-ground', 'rocky-margin', 'upland-ground']);
  text(value.description);
  number(value.relief, 0, 1);
  if (value.waterDistanceCells !== null) number(value.waterDistanceCells, 1, 2, true);
  if (['moist-margin', 'rocky-margin'].includes(value.kind as string) !== (value.waterDistanceCells !== null))
    throw new Error('Invalid habitat water proximity.');
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
  if (value.habitatAffinity !== undefined) {
    if (
      !Array.isArray(value.habitatAffinity) ||
      !value.habitatAffinity.length ||
      new Set(value.habitatAffinity).size !== value.habitatAffinity.length
    )
      throw new Error('Invalid habitat affinity.');
    value.habitatAffinity.forEach((kind) =>
      choice(kind, ['moist-margin', 'sheltered-ground', 'exposed-ground', 'rocky-margin', 'upland-ground'])
    );
  }
  if (value.socialBehaviour !== undefined) choice(value.socialBehaviour, ['group-retreat']);
  if (value.relativeAbundance !== undefined) number(value.relativeAbundance, 0.05, 1);
  if (value.structuralMaterial !== undefined)
    choice(value.structuralMaterial, ['organic', 'silica', 'mineral']);
  if (value.anatomy !== undefined) {
    record(value.anatomy);
    number(value.anatomy.appendages, 0, 12, true);
    number(value.anatomy.segments, 1, 4, true);
    choice(value.anatomy.profile, ['low', 'raised']);
    choice(value.anatomy.pigment, ['green', 'blue', 'ochre', 'red', 'violet', 'pale']);
  }
  if (value.bodyForm !== undefined)
    choice(value.bodyForm, [
      'mat',
      'frond',
      'colony',
      'fan',
      'rosette',
      'walker',
      'tripod',
      'radial',
      'burrower',
      'ambush',
    ]);
}

/** Validates a complete biological container, never interpreting it as a divisible trade lot. */
export function validateSpecimen(value: unknown): asserts value is SpecimenContainer {
  record(value);
  for (const key of ['id', 'sourceId', 'siteId']) text(value[key]);
  validateSpecies(value.species);
  choice(value.kind, ['live', 'dead', 'tissue']);
  number(value.quality, 0, 1);
  number(value.volumeM3, 0.1, 100);
  if (value.sizeScale !== undefined) number(value.sizeScale, 0.3, 1.8);
  if (value.mineralisation !== undefined) {
    choice(value.mineralisation, ['standard', 'reinforced']);
    if (!['silica', 'mineral'].includes(value.species.structuralMaterial ?? 'organic'))
      throw new Error('Mineral covering on an incompatible specimen.');
  }
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
    if (evidence.origins !== undefined) {
      if (!Array.isArray(evidence.origins) || evidence.origins.length > 32)
        throw new Error('Invalid discovery origins.');
      const sites = new Set<string>();
      for (const origin of evidence.origins) {
        record(origin);
        for (const key of ['systemName', 'bodyPath', 'bodyName']) text(origin[key]);
        if (typeof origin.bodyPath !== 'string' || !/^planet:\d+(?:\/moon:\d+)*$/.test(origin.bodyPath))
          throw new Error('Invalid discovery body path.');
        number(origin.worldX, -Number.MAX_SAFE_INTEGER);
        number(origin.worldY, -Number.MAX_SAFE_INTEGER);
        number(origin.systemSlot, 0, 1000, true);
        if (origin.level !== undefined) number(origin.level, 0, evidence.level as number, true);
        record(origin.surface);
        text(origin.surface.siteId);
        text(origin.surface.label);
        number(origin.surface.x, 0, 4096, true);
        number(origin.surface.y, 0, 4096, true);
        if (sites.has(origin.surface.siteId as string)) throw new Error('Duplicate discovery origin.');
        sites.add(origin.surface.siteId as string);
      }
    }
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
    if (field.site.habitat !== undefined) validateHabitat(field.site.habitat);
    if (
      field.patches !== undefined &&
      (!Array.isArray(field.patches) ||
        field.patches.length !== ENCOUNTER_HEIGHT ||
        field.patches.some(
          (row) => typeof row !== 'string' || row.length !== ENCOUNTER_WIDTH || !/^[mos]+$/.test(row)
        ))
    )
      throw new Error('Invalid habitat patches.');
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
    const groupSpecies = new Map<string, string>();
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
      if (individual.sizeScale !== undefined) number(individual.sizeScale, 0.3, 1.8);
      if (individual.mineralisation !== undefined) {
        choice(individual.mineralisation, ['standard', 'reinforced']);
        const species = field.species.find((entry) => entry.id === individual.speciesId)!;
        if (!['silica', 'mineral'].includes(species.structuralMaterial ?? 'organic'))
          throw new Error('Mineral covering on an incompatible organism.');
      }
      if (individual.activity !== undefined)
        choice(individual.activity, [
          'attached',
          'resting',
          'foraging',
          'withdrawing',
          'displaying',
          'defending',
          'returning',
        ]);
      if (individual.displayUntil !== undefined) {
        number(individual.displayUntil, 0);
        const species = field.species.find((entry) => entry.id === individual.speciesId)!;
        if (!['territorial', 'ambush'].includes(species.behaviour))
          throw new Error('Defensive timer on a benign organism.');
      }
      if (individual.groupId !== undefined) {
        text(individual.groupId);
        number(individual.retreatUntil, 0);
        const species = field.species.find((entry) => entry.id === individual.speciesId)!;
        const groupId = individual.groupId as string;
        if (
          species.socialBehaviour !== 'group-retreat' ||
          (groupSpecies.has(groupId) && groupSpecies.get(groupId) !== individual.speciesId)
        )
          throw new Error('Invalid biological group.');
        groupSpecies.set(groupId, individual.speciesId as string);
      } else if (individual.retreatUntil !== undefined) throw new Error('Retreat timer without group.');
      if (typeof individual.sampled !== 'boolean' || typeof individual.alerted !== 'boolean')
        throw new Error('Invalid individual history.');
      const position = `${individual.x},${individual.y}`;
      if (individual.state !== 'collected') {
        if (
          positions.has(position) ||
          (individual.x === field.roverX &&
            individual.y === field.roverY &&
            !canShareRoverCell(
              individualPhysicalProfile(
                field.species.find((species) => species.id === individual.speciesId)!,
                individual.sizeScale as number | undefined,
                individual.mineralisation as 'standard' | 'reinforced' | undefined
              )
            )) ||
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
    if (container.sizeScale !== individual.sizeScale)
      throw new Error('Specimen size does not match its source.');
    if (container.mineralisation !== individual.mineralisation)
      throw new Error('Specimen covering does not match its source.');
  }
}
