import { PRNG } from '../../utils/prng';
import type { BiologyEnvironment } from './biosphere_generator';
import type { HabitatKind, SpeciesDefinition } from './biology_types';

const HABITATS: readonly (readonly HabitatKind[])[] = [
  ['moist-margin', 'rocky-margin'],
  ['sheltered-ground', 'exposed-ground', 'upland-ground'],
];

/** Builds two inherited microbial lineages as finite sampling patches, not kilogram-sized single cells. */
export function generateMicrobialCommunity(
  e: BiologyEnvironment,
  root: PRNG,
  pressurePreserving = false
): SpeciesDefinition[] {
  // Chemical production represents a sparse, local water-rock redox niche, not a planetary energy budget.
  const phototrophic = (e.stellarFluxWm2 ?? 1361) >= 20 && (e.carbonDioxideBar ?? 0.0004) >= 1e-8;
  return Array.from({ length: 4 }, (_, index) => {
    const producer = index < 2;
    const variant = index % 2;
    const family = root.seedNew('microbial-family', producer ? 0 : 1);
    const prng = root.seedNew('microbial-species', index);
    const aerobic = !pressurePreserving && e.oxygenBar >= 0.035 && !producer;
    const lightFilm = producer && phototrophic;
    const prefix = `${family.choice(['Iri', 'Saru', 'Velen', 'Thami'])}`;
    const massKg = Number(prng.random(0.04, producer ? 0.45 : 0.18).toFixed(2));
    const recognised = prng.random() < 0.08 + Math.max(0, Math.min(1, e.humanIntensity)) * 0.84;
    return {
      id: `${e.bodyId}/${pressurePreserving ? 'pressure' : 'microbial'}-family:${producer ? 0 : 1}/species:${variant}`,
      bodyId: e.bodyId,
      name: `${prefix} ${lightFilm ? 'pigment film' : producer ? 'mineral film' : 'substrate recycler'} ${variant + 1}`,
      lineage: `${prefix} ${producer ? 'carbon-fixing' : 'recycling'} microbial group`,
      origin: 'native',
      cellularity: 'unicellular',
      contactRepresentation: 'colony-patch',
      energySource: producer ? (phototrophic ? 'light' : 'chemical') : 'organic',
      surfaceExpression: lightFilm ? 'pigmented-film' : 'subtle-colony',
      symmetry: 'radial',
      organisation: 'single-celled organisms in an attached biofilm',
      covering: 'hydrated extracellular matrix',
      structuralMaterial: 'organic',
      senses: producer ? 'cellular light and dissolved-chemical response' : 'dissolved-chemical response',
      metabolism: producer ? 'autotroph' : 'heterotroph',
      respiration: aerobic ? 'aerobic' : 'anaerobic',
      role: lightFilm
        ? 'phototrophic primary producer'
        : producer
          ? 'mineral-redox producer'
          : 'microbial detritus recycler',
      locomotion: 'attached biofilm / cellular dispersal unresolved',
      behaviour: 'sessile',
      massKg,
      sizeM: Number(prng.random(0.08, 0.4).toFixed(2)),
      glyph: 'Y',
      susceptibility: 0,
      armour: 0.04,
      temperatureK: e.temperatureK,
      pressureBar: e.pressureBar,
      chemistry: producer
        ? `carbon-water / ${phototrophic ? 'light-driven' : 'mineral-redox'} carbon fixation`
        : `carbon-water / ${aerobic ? 'aerobic organic recycling' : 'organic fermentation'}`,
      rarity: prng.random(0.8, 1.2),
      recognised,
      baselineSamples: recognised ? prng.randomInt(0, 4) : 0,
      remoteness: Math.max(0, Math.min(1, e.distanceLy / 5000)),
      habitatAffinity: pressurePreserving || !phototrophic ? HABITATS[0] : HABITATS[variant],
      bodyForm: producer ? 'mat' : 'colony',
      anatomy: {
        appendages: 0,
        segments: 1,
        profile: 'low',
        pigment: producer ? family.choice(['green', 'blue', 'red', 'violet'])! : 'ochre',
      },
      relativeAbundance: producer ? 1 : 0.35,
      preservation: { solvent: 'water', retainsSubstrate: pressurePreserving },
    };
  });
}

/** Exposed pigment cover varies independently of complexity; chemically fed films do not imply a pigment edge. */
export function microbialPigmentCover(e: BiologyEnvironment, root: PRNG): number {
  if ((e.stellarFluxWm2 ?? 1361) < 20 || (e.carbonDioxideBar ?? 0.0004) < 1e-8) return 0;
  return Math.min(0.8, root.seedNew('microbial-cover').random(0.08, 0.65) * (0.4 + e.waterCoverage));
}
