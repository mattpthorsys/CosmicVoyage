import { PRNG } from '../../utils/prng';
import type { Planet } from '../planet';
import type { SolarSystem } from '../solar_system';
import { getManagedSurfaceWaterPhase, getSurfaceLiquidProfile } from '../planet/surface_liquid';
import { readReadySurfaceData } from '../planet/surface_data';
import {
  BIOLOGY_VERSION,
  type BiologySite,
  type BiosphereDefinition,
  type SpeciesDefinition,
} from './biology_types';
import { classifyHabitat } from './habitat';
import { generateNativeSpecies } from './native_biosphere';
import { supportsPressureCommunity, generatePressureCommunity } from './pressure_biosphere';
import { selectBiosphereComplexity } from './biosphere_complexity';
import { generateMicrobialCommunity, microbialPigmentCover } from './microbial_biosphere';

export interface BiologyEnvironment {
  readonly bodyId: string;
  readonly bodyName: string;
  readonly seed: string;
  readonly origin: 'native' | 'introduced';
  readonly temperatureK: number;
  readonly pressureBar: number;
  readonly oxygenBar: number;
  readonly gravity: number;
  readonly ageGyr: number;
  readonly waterCoverage: number;
  readonly humanIntensity: number;
  readonly distanceLy: number;
  readonly landable: boolean;
  readonly stellarFluxWm2?: number;
  readonly carbonDioxideBar?: number;
}

export type BiosphereExclusion =
  | 'invalid-environment'
  | 'unlandable'
  | 'no-surface-water'
  | 'too-cold'
  | 'too-hot'
  | 'pressure-too-low'
  | 'pressure-too-high'
  | 'gravity-too-high'
  | 'too-young'
  | 'water-not-liquid';

export interface BiosphereEligibility {
  readonly eligible: boolean;
  readonly pressureCommunity: boolean;
  readonly exclusions: readonly BiosphereExclusion[];
}

/** Shares the surface-life screen with diagnostics without sampling occurrence or consuming a PRNG. */
export function assessBiosphereEligibility(e: BiologyEnvironment): BiosphereEligibility {
  if (
    ![e.temperatureK, e.pressureBar, e.gravity, e.ageGyr, e.waterCoverage].every(Number.isFinite) ||
    e.gravity < 0 ||
    e.waterCoverage < 0 ||
    e.waterCoverage > 1
  )
    return { eligible: false, pressureCommunity: false, exclusions: ['invalid-environment'] };
  const pressureCommunity = supportsPressureCommunity(e);
  const exclusions: BiosphereExclusion[] = [];
  if (!e.landable) exclusions.push('unlandable');
  if (e.waterCoverage <= 0) exclusions.push('no-surface-water');
  if (e.temperatureK < 273.15) exclusions.push('too-cold');
  if (e.temperatureK > 345) exclusions.push('too-hot');
  if (e.pressureBar < 0.04) exclusions.push('pressure-too-low');
  if (e.pressureBar > 15 && !pressureCommunity) exclusions.push('pressure-too-high');
  if (e.gravity > 3) exclusions.push('gravity-too-high');
  if (e.ageGyr < 0.3) exclusions.push('too-young');
  if (getManagedSurfaceWaterPhase(e.temperatureK, e.pressureBar) !== 'liquid')
    exclusions.push('water-not-liquid');
  return { eligible: exclusions.length === 0, pressureCommunity, exclusions };
}

/** Reads canonical physical inputs without advancing orbits or consuming generation streams. */
export function createBiologyEnvironment(
  planet: Planet,
  system: SolarSystem,
  bodyPath: string
): BiologyEnvironment {
  const atmosphere = planet.effectiveAtmosphere;
  const water = getSurfaceLiquidProfile({
    planetType: planet.type,
    hydrosphere: planet.effectiveHydrosphere,
    surfaceTemp: planet.effectiveSurfaceTemp,
    atmosphere,
    managedWaterFraction: planet.terraforming?.hydrosphereFraction,
  });
  return {
    bodyId: `${system.starX},${system.starY},${system.systemSlot}/${bodyPath}/bio${BIOLOGY_VERSION}`,
    bodyName: planet.name,
    seed: planet.mapSeed,
    origin: planet.terraforming?.stage === 'complete' ? 'introduced' : 'native',
    temperatureK: planet.effectiveSurfaceTemp,
    pressureBar: atmosphere.pressure,
    oxygenBar: (atmosphere.pressure * (atmosphere.composition.Oxygen ?? 0)) / 100,
    gravity: planet.gravity,
    ageGyr: system.ageGyr,
    waterCoverage:
      water &&
      (water.kind === 'water' || water.kind === 'brine') &&
      getManagedSurfaceWaterPhase(planet.effectiveSurfaceTemp, atmosphere.pressure) === 'liquid'
        ? water.coverage
        : 0,
    humanIntensity:
      system.galacticContext?.human.settlementIntensity ??
      Math.max(0, 1 - Math.hypot(system.starX, system.starY) / 4500),
    distanceLy: system.galacticContext?.human.distanceFromSolLy ?? Math.hypot(system.starX, system.starY),
    landable: !['GasGiant', 'IceGiant', 'Molten', 'Hycean'].includes(planet.type),
    stellarFluxWm2: planet.referenceStellarFluxWm2,
    carbonDioxideBar: (atmosphere.pressure * (atmosphere.composition['Carbon Dioxide'] ?? 0)) / 100,
  };
}

/** Generates a small inherited biosphere; probability coefficients are explicit gameplay priors. */
export function generateBiosphere(environment: BiologyEnvironment): BiosphereDefinition | null {
  const e = environment;
  const { eligible, pressureCommunity } = assessBiosphereEligibility(e);
  if (!eligible) return null;
  const prng = new PRNG(e.origin === 'introduced' ? 'managed-carbon-water' : e.seed).seedNew(
    'biology',
    e.origin === 'introduced' ? 1 : BIOLOGY_VERSION
  );
  const temperate = Math.max(0.15, 1 - Math.abs(e.temperatureK - 294) / 65);
  if (e.origin === 'native' && prng.random() > 0.34 * temperate * Math.min(1, e.ageGyr / 2)) return null;
  if (pressureCommunity)
    return {
      id: e.bodyId,
      bodyName: e.bodyName,
      origin: 'native',
      complexity: 'microbial-only',
      pigmentCover: microbialPigmentCover(e, prng),
      species: generatePressureCommunity(e, prng),
      sites: [],
    };
  if (e.origin === 'native') {
    const complexity = selectBiosphereComplexity(e);
    const microbes = generateMicrobialCommunity(e, prng);
    return {
      id: e.bodyId,
      bodyName: e.bodyName,
      origin: e.origin,
      complexity,
      pigmentCover:
        complexity === 'microbial-only'
          ? microbialPigmentCover(e, prng)
          : Math.min(0.8, 0.15 + e.waterCoverage * 0.5),
      species:
        complexity === 'microbial-only'
          ? microbes
          : [...generateNativeSpecies(e, prng, complexity), ...microbes],
      sites: [],
    };
  }
  const aerobic = e.origin === 'introduced' || e.oxygenBar >= 0.035;
  const species: SpeciesDefinition[] = [];
  // Keep the original six identities and inherited streams; new content uses additional indices.
  for (let index = 0; index < 10; index++) {
    const lineage = Math.floor(index / 2);
    const ancestor = prng.seedNew('ancestor', lineage);
    const individual = prng.seedNew('species', index);
    const producer = index % 2 === 0;
    const symmetry =
      ancestor.choice<SpeciesDefinition['symmetry']>(['bilateral', 'radial', 'trilateral']) ?? 'radial';
    const sampledBehaviour = producer
      ? 'sessile'
      : (individual.choice<SpeciesDefinition['behaviour']>([
          'passive',
          'skittish',
          'territorial',
          'ambush',
        ]) ?? 'passive');
    // A grazing lineage retreats together; detritus consumers are not generated as predators.
    const behaviour =
      index === 1 && aerobic
        ? 'skittish'
        : (index === 3 || index === 7 || index === 9 || !aerobic) && sampledBehaviour === 'ambush'
          ? 'passive'
          : sampledBehaviour;
    const massKg = Number(
      (producer
        ? individual.random(0.1, 3)
        : individual.random(0.2, aerobic ? 65 / (e.origin === 'introduced' ? 1 : Math.max(1, e.gravity)) : 3)
      ).toFixed(2)
    );
    const recognised = e.origin === 'introduced' || individual.random() < 0.08 + e.humanIntensity * 0.84;
    const covering =
      ancestor.choice(['flexible mineral shell', 'silica-reinforced cuticle', 'hydrated organic sheath']) ??
      'hydrated organic sheath';
    const organisation =
      ancestor.choice(['segmented multicellular', 'unsegmented multicellular']) ?? 'segmented multicellular';
    const senses =
      ancestor.choice([
        'chemical and vibration sensing',
        'distributed light receptors',
        'paired light and chemical receptors',
      ]) ?? 'chemical sensing';
    species.push({
      id: e.origin === 'introduced' ? `managed-carbon-water:${index}` : `${e.bodyId}/species:${index}`,
      bodyId: e.bodyId,
      bodyForm: producer
        ? (['mat', 'colony', 'frond', 'fan', 'rosette'] as const)[lineage]
        : behaviour === 'ambush'
          ? 'ambush'
          : lineage === 1 || lineage >= 3
            ? 'burrower'
            : symmetry === 'radial'
              ? 'radial'
              : symmetry === 'trilateral'
                ? 'tripod'
                : 'walker',
      name:
        e.origin === 'introduced'
          ? `Managed ${['mat', 'grazer', 'colony', 'crawler', 'frond', 'burrower', 'fan', 'crevice feeder', 'rosette', 'upland crawler'][index]}`
          : `${['Veil mat', 'Margin grazer', 'Substrate colony', 'Litter crawler', 'Ribbon frond', 'Shelter forager', 'Crevice fan', 'Rock detritivore', 'Upland rosette', 'Crust browser'][index]} ${lineage + 1}.${(index % 2) + 1}`,
      lineage: `Clade ${lineage + 1}`,
      origin: e.origin,
      cellularity: producer ? 'simple-multicellular' : 'complex-multicellular',
      contactRepresentation: 'individual',
      energySource: producer ? 'light' : 'organic',
      symmetry,
      organisation: producer ? 'modular colonial' : organisation,
      covering,
      structuralMaterial:
        covering === 'flexible mineral shell'
          ? 'mineral'
          : covering === 'silica-reinforced cuticle'
            ? 'silica'
            : 'organic',
      senses,
      metabolism: producer ? (lineage === 2 ? 'mixotroph' : 'autotroph') : 'heterotroph',
      respiration: aerobic ? 'aerobic' : 'anaerobic',
      role: producer
        ? 'primary producer'
        : behaviour === 'ambush'
          ? 'small prey predator'
          : lineage === 1 || lineage >= 3
            ? 'decomposer / scavenger'
            : 'grazer',
      locomotion: producer
        ? 'rooted / sessile'
        : lineage === 1 || lineage >= 3
          ? 'substrate creeping'
          : symmetry === 'radial'
            ? 'muscular creeping'
            : symmetry === 'trilateral'
              ? 'three-armed walking'
              : 'articulated walking',
      behaviour,
      massKg,
      sizeM: Number(Math.cbrt(massKg / 60).toFixed(2)),
      glyph: producer ? 'Y' : behaviour === 'ambush' ? 'a' : behaviour === 'territorial' ? 't' : 'c',
      susceptibility: producer ? 0 : individual.random(0.6, 1.35),
      armour: covering.includes('shell') ? 0.35 : 0.12,
      temperatureK: e.temperatureK,
      pressureBar: e.pressureBar,
      chemistry: aerobic ? 'carbon-water / oxygen respiration' : 'carbon-water / anaerobic redox metabolism',
      rarity: individual.random(0.7, 1.3),
      recognised,
      baselineSamples: recognised ? individual.randomInt(0, e.origin === 'introduced' ? 12 : 6) : 0,
      remoteness: e.origin === 'introduced' ? 0 : Math.min(1, e.distanceLy / 5000),
      habitatAffinity:
        index <= 1
          ? ['moist-margin']
          : index === 2
            ? ['sheltered-ground']
            : index === 3
              ? ['moist-margin', 'sheltered-ground', 'exposed-ground']
              : index === 4
                ? ['exposed-ground']
                : index === 5
                  ? ['sheltered-ground', 'exposed-ground', 'upland-ground']
                  : index <= 7
                    ? ['rocky-margin']
                    : ['upland-ground'],
      socialBehaviour: index === 1 && aerobic ? 'group-retreat' : undefined,
      foragingGuild:
        producer || behaviour === 'ambush'
          ? undefined
          : lineage === 1 || lineage >= 3
            ? 'detritivore'
            : 'grazer',
      seeksShelter: !producer && behaviour !== 'ambush' && (lineage === 1 || lineage >= 3),
      reproduction: index === 0 ? { kind: 'dormant-buds', baselineSamples: 2 } : undefined,
    });
  }
  return {
    id: e.bodyId,
    bodyName: e.bodyName,
    origin: e.origin,
    complexity: 'complex-multicellular',
    species,
    sites: [],
  };
}

/** Resolves a bounded set of reproducible accessible sites from already-prepared terrain. */
export function prepareBiosphere(
  planet: Planet,
  system: SolarSystem,
  bodyPath: string
): BiosphereDefinition | null {
  const environment = createBiologyEnvironment(planet, system, bodyPath);
  const biosphere = generateBiosphere(environment);
  const surface = readReadySurfaceData(planet);
  if (!biosphere || !surface?.heightmap) return biosphere;
  const map = surface.heightmap;
  const prng = new PRNG(environment.seed).seedNew('biology-sites', BIOLOGY_VERSION);
  const sites: BiologySite[] = [];
  const siteLimit = biosphere.complexity === 'microbial-only' ? 4 : 6;
  const used = new Set<string>();
  const habitatTarget = Math.min(
    3,
    new Set(
      biosphere.species
        .filter((species) => species.metabolism !== 'heterotroph')
        .flatMap((species) => species.habitatAffinity ?? [])
    ).size || 3
  );
  for (
    let attempt = 0;
    attempt < 768 &&
    (sites.length < siteLimit ||
      new Set(sites.map((site) => site.habitat?.kind)).size < habitatTarget ||
      !sites.some((site) => site.habitat?.waterDistanceCells !== null));
    attempt++
  ) {
    const x = prng.randomInt(0, map.length - 1);
    const y = prng.randomInt(Math.floor(map.length * 0.25), Math.floor(map.length * 0.75));
    const height = map[y]?.[x] ?? 0;
    if (height <= (surface.liquidOverlay?.seaLevel ?? -1) || used.has(`${x},${y}`)) continue;
    const habitat = classifyHabitat(surface, x, y, environment.waterCoverage > 0);
    if (!habitat) continue;
    if (
      !biosphere.species.some(
        (species) => species.metabolism !== 'heterotroph' && species.habitatAffinity?.includes(habitat.kind)
      )
    )
      continue;
    // Retain representative habitats when they actually occur in the prepared regional terrain.
    if (sites.length === siteLimit && sites.some((site) => site.habitat?.kind === habitat.kind)) continue;
    used.add(`${x},${y}`);
    const site: BiologySite = {
      id: `${biosphere.id}/site:${x},${y}`,
      x,
      y,
      habitat,
      label: `${{ 'moist-margin': 'Water margin', 'rocky-margin': 'Rocky water margin', 'sheltered-ground': 'Sheltered outcrops', 'exposed-ground': 'Open substrate', 'upland-ground': 'Elevated substrate' }[habitat.kind]} ${Math.min(siteLimit, sites.length + 1)}`,
    };
    if (sites.length === siteLimit) {
      const duplicate = sites.findIndex((entry, index) =>
        sites.some((other, otherIndex) => index !== otherIndex && other.habitat?.kind === entry.habitat?.kind)
      );
      if (duplicate >= 0) sites[duplicate] = site;
    } else sites.push(site);
  }
  return { ...biosphere, sites };
}
