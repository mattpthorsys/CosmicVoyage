import { PRNG } from '../../utils/prng';
import type { BiologyEnvironment } from './biosphere_generator';
import type {
  BiologicalBehaviour,
  BiosphereComplexity,
  HabitatKind,
  OrganismAnatomy,
  OrganismBodyForm,
  SpeciesDefinition,
} from './biology_types';

type Guild = 'producer' | 'grazer' | 'detritivore' | 'predator';

interface Family {
  readonly name: string;
  readonly guild: Guild;
  readonly symmetry: SpeciesDefinition['symmetry'];
  readonly covering: string;
  readonly senses: string;
  readonly anatomy: OrganismAnatomy;
  readonly form: OrganismBodyForm;
}

const AFFINITIES: Record<Guild, readonly (readonly HabitatKind[])[]> = {
  producer: [
    ['moist-margin', 'rocky-margin'],
    ['sheltered-ground', 'exposed-ground', 'upland-ground'],
  ],
  grazer: [
    ['moist-margin', 'sheltered-ground'],
    ['rocky-margin', 'exposed-ground'],
  ],
  detritivore: [
    ['moist-margin', 'rocky-margin', 'sheltered-ground'],
    ['sheltered-ground', 'exposed-ground', 'upland-ground'],
  ],
  predator: [
    ['moist-margin', 'sheltered-ground'],
    ['rocky-margin', 'exposed-ground'],
  ],
};

/** Constructs a shallow inherited history; ecological and occurrence coefficients are gameplay priors. */
export function generateNativeSpecies(
  environment: BiologyEnvironment,
  prng: PRNG,
  complexity: Exclude<BiosphereComplexity, 'microbial-only'> = 'complex-multicellular'
): SpeciesDefinition[] {
  const simple = complexity === 'simple-multicellular';
  const aerobic = environment.oxygenBar >= 0.035;
  const guilds: Guild[] = ['producer', aerobic ? 'grazer' : 'detritivore', 'detritivore'];
  if (prng.seedNew('diversity').random() < 0.6) guilds.push('producer');
  if (
    !simple &&
    environment.oxygenBar >= 0.1 &&
    environment.ageGyr >= 1 &&
    prng.seedNew('predators').random() < 0.55
  )
    guilds.push('predator');
  const names = new Set<string>();
  return guilds.flatMap((guild, index) => {
    const generated = createFamily(guild, prng.seedNew('family', index), simple);
    const family = {
      ...generated,
      name: names.has(generated.name) ? `${generated.name}${index + 1}` : generated.name,
    };
    names.add(family.name);
    return [0, 1].map((variant) => createSpecies(environment, family, index, variant, prng, simple));
  });
}

/** Shares structural characters within each family while permitting multiple unrelated body plans. */
function createFamily(guild: Guild, prng: PRNG, simple: boolean): Family {
  const producer = guild === 'producer';
  const symmetry = producer
    ? 'radial'
    : prng.choice<SpeciesDefinition['symmetry']>(['bilateral', 'bilateral', 'trilateral', 'radial'])!;
  const appendages =
    simple || producer || guild === 'detritivore'
      ? 0
      : symmetry === 'trilateral'
        ? 3
        : symmetry === 'radial'
          ? 6
          : prng.choice([4, 6])!;
  const form: OrganismBodyForm = producer
    ? prng.choice<OrganismBodyForm>(
        simple ? ['mat', 'colony', 'frond'] : ['mat', 'colony', 'frond', 'fan', 'rosette']
      )!
    : simple || guild === 'detritivore'
      ? 'burrower'
      : guild === 'predator'
        ? 'ambush'
        : symmetry === 'trilateral'
          ? 'tripod'
          : symmetry === 'radial'
            ? 'radial'
            : 'walker';
  const name = `${prng.choice(['Sa', 'Ve', 'Tu', 'Ara', 'Iri', 'Ko'])}${prng.choice(['ru', 'len', 'vi', 'na', 'th', 'mi'])}`;
  return {
    name,
    guild,
    symmetry,
    covering: prng.choice(['hydrated organic sheath', 'silica-reinforced cuticle', 'thin mineral shell'])!,
    senses: simple
      ? 'distributed light and chemical response'
      : producer
        ? 'distributed light and chemical receptors'
        : prng.choice([
            'chemical and vibration sensing',
            'paired light and chemical receptors',
            'distributed light receptors',
          ])!,
    form,
    anatomy: {
      appendages,
      segments: simple || producer ? 1 : symmetry === 'bilateral' ? prng.randomInt(2, 4) : 1,
      profile: producer || !appendages ? 'low' : prng.choice(['low', 'raised'])!,
      pigment: prng.choice<OrganismAnatomy['pigment']>(['green', 'blue', 'ochre', 'red', 'violet', 'pale'])!,
    },
  };
}

/** Generates ecological specialisations inside one inherited plan without inventing a new ancestry per trait. */
function createSpecies(
  e: BiologyEnvironment,
  family: Family,
  familyIndex: number,
  variant: number,
  root: PRNG,
  simple: boolean
): SpeciesDefinition {
  const prng = root.seedNew('family-species', familyIndex, variant);
  const producer = family.guild === 'producer';
  const aerobic = e.oxygenBar >= 0.035;
  const oxygenBudget = Math.max(0.12, Math.min(1.2, e.oxygenBar / 0.18));
  const heatBudget = Math.max(0.25, 1 - Math.abs(e.temperatureK - 294) / 70);
  const maximumMass = simple
    ? 0.45
    : aerobic
      ? Math.min(65, (65 * oxygenBudget * heatBudget) / Math.max(1, e.gravity))
      : 1.7;
  const massKg = Number(
    (producer
      ? prng.random(0.12, simple ? 0.8 : 2.5)
      : prng.random(0.15, Math.max(0.16, maximumMass * (family.guild === 'detritivore' ? 0.12 : 1)))
    ).toFixed(2)
  );
  const behaviour: BiologicalBehaviour = producer
    ? 'sessile'
    : !aerobic || simple
      ? 'passive'
      : family.guild === 'predator'
        ? 'ambush'
        : family.guild === 'grazer'
          ? prng.choice(['passive', 'skittish', 'territorial'])!
          : prng.choice(['passive', 'skittish'])!;
  const recognised = prng.random() < 0.08 + Math.max(0, Math.min(1, e.humanIntensity)) * 0.84;
  const role = {
    producer: 'primary producer',
    grazer: 'grazer',
    detritivore: 'detritus feeder / scavenger',
    predator: 'small prey predator',
  }[family.guild];
  const locomotion = producer
    ? 'attached / sessile'
    : family.anatomy.appendages === 0
      ? 'peristaltic crawling'
      : `${family.anatomy.appendages}-limbed ${family.anatomy.profile === 'raised' ? 'walking' : 'crawling'}`;
  return {
    id: `${e.bodyId}/family:${familyIndex}/species:${variant}`,
    bodyId: e.bodyId,
    name: `${family.name} ${variant === 0 ? 'margin' : 'shelter'} ${producer ? family.form : family.guild === 'grazer' ? 'grazer' : family.guild === 'predator' ? 'stalker' : 'crawler'}`,
    lineage: `${family.name} structural group`,
    origin: 'native',
    cellularity: simple || producer ? 'simple-multicellular' : 'complex-multicellular',
    contactRepresentation: 'individual',
    energySource: producer ? 'light' : 'organic',
    symmetry: family.symmetry,
    organisation: simple
      ? 'simple multicellular tissue / distributed coordination'
      : producer
        ? 'modular colonial'
        : family.anatomy.segments > 1
          ? 'segmented multicellular'
          : 'unsegmented multicellular',
    covering: family.covering,
    structuralMaterial:
      family.covering === 'thin mineral shell'
        ? 'mineral'
        : family.covering === 'silica-reinforced cuticle'
          ? 'silica'
          : 'organic',
    senses: family.senses,
    metabolism: producer ? 'autotroph' : 'heterotroph',
    respiration: aerobic ? 'aerobic' : 'anaerobic',
    role,
    locomotion,
    behaviour,
    massKg,
    sizeM: Number(Math.max(0.02, Math.cbrt(massKg / 60)).toFixed(2)),
    glyph: producer ? 'Y' : behaviour === 'ambush' ? 'a' : behaviour === 'territorial' ? 't' : 'c',
    susceptibility: producer ? 0 : prng.random(0.6, 1.35),
    armour: family.covering.includes('shell') ? 0.35 : family.covering.includes('silica') ? 0.22 : 0.08,
    temperatureK: e.temperatureK,
    pressureBar: e.pressureBar,
    chemistry: aerobic ? 'carbon-water / oxygen respiration' : 'carbon-water / anaerobic redox metabolism',
    rarity: prng.random(0.7, 1.3),
    recognised,
    baselineSamples: recognised ? prng.randomInt(0, 6) : 0,
    remoteness: Math.max(0, Math.min(1, e.distanceLy / 5000)),
    habitatAffinity: AFFINITIES[family.guild][variant],
    socialBehaviour: family.guild === 'grazer' && behaviour === 'skittish' ? 'group-retreat' : undefined,
    foragingGuild: family.guild === 'grazer' || family.guild === 'detritivore' ? family.guild : undefined,
    seeksShelter: !producer && variant === 1 && family.guild !== 'predator',
    bodyForm: family.form,
    anatomy: family.anatomy,
    relativeAbundance: { producer: 1, grazer: 0.65, detritivore: 0.45, predator: 0.12 }[family.guild],
    reproduction:
      producer && family.form === 'mat'
        ? { kind: 'dormant-buds', baselineSamples: recognised ? 1 : 0 }
        : undefined,
  };
}
