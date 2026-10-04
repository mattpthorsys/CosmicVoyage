import { PRNG } from '../../utils/prng';
import { getManagedSurfaceWaterPhase } from '../planet/surface_liquid';
import type { BiologyEnvironment } from './biosphere_generator';
import type { SpeciesDefinition } from './biology_types';

/** Screens a narrow microbial analogue using phase, carbon inventory and reference stellar energy. */
export function supportsPressureCommunity(e: BiologyEnvironment): boolean {
  return (
    e.origin === 'native' &&
    e.landable &&
    e.waterCoverage > 0 &&
    e.temperatureK >= 280 &&
    e.temperatureK <= 330 &&
    e.pressureBar >= 8 &&
    e.pressureBar <= 30 &&
    getManagedSurfaceWaterPhase(e.temperatureK, e.pressureBar) === 'liquid' &&
    (e.stellarFluxWm2 ?? 0) >= 20 &&
    (e.stellarFluxWm2 ?? 0) <= 3000 &&
    (e.carbonDioxideBar ?? 0) >= 0.000001 &&
    (e.carbonDioxideBar ?? 0) <= 0.1
  );
}

/** Generates attached colonial material rather than large high-energy fauna in a speculative pressure habitat. */
export function generatePressureCommunity(e: BiologyEnvironment, root: PRNG): SpeciesDefinition[] {
  return Array.from({ length: 4 }, (_, index) => {
    const producer = index < 2;
    const family = root.seedNew('pressure-family', producer ? 0 : 1);
    const prng = root.seedNew('pressure-species', index);
    const name = `${family.choice(['Iri', 'Saru', 'Velen', 'Thami'])} ${producer ? 'light-film' : 'recycler'} ${(index % 2) + 1}`;
    const massKg = Number(prng.random(0.04, producer ? 0.45 : 0.18).toFixed(2));
    const recognised = prng.random() < 0.08 + Math.max(0, Math.min(1, e.humanIntensity)) * 0.84;
    return {
      id: `${e.bodyId}/pressure-family:${producer ? 0 : 1}/species:${index % 2}`,
      bodyId: e.bodyId,
      name,
      lineage: `${producer ? 'Phototrophic' : 'Fermentative'} colonial group`,
      origin: 'native',
      symmetry: 'radial',
      organisation: 'modular microbial colony',
      covering: 'hydrated organic sheath',
      structuralMaterial: 'organic',
      senses: 'distributed light and dissolved-chemical response',
      metabolism: producer ? 'autotroph' : 'heterotroph',
      respiration: 'anaerobic',
      role: producer ? 'primary producer' : 'fermentative detritus recycler',
      locomotion: 'attached / sessile',
      behaviour: 'sessile',
      massKg,
      sizeM: Number(Math.max(0.04, Math.cbrt(massKg / 60)).toFixed(2)),
      glyph: 'Y',
      susceptibility: 0,
      armour: 0.04,
      temperatureK: e.temperatureK,
      pressureBar: e.pressureBar,
      chemistry: producer
        ? 'carbon-water / light-driven carbon fixation'
        : 'carbon-water / organic fermentation',
      rarity: prng.random(0.8, 1.2),
      recognised,
      baselineSamples: recognised ? prng.randomInt(0, 4) : 0,
      remoteness: Math.max(0, Math.min(1, e.distanceLy / 5000)),
      habitatAffinity: ['moist-margin', 'rocky-margin'],
      bodyForm: producer ? 'mat' : 'colony',
      anatomy: { appendages: 0, segments: 1, profile: 'low', pigment: producer ? 'blue' : 'ochre' },
      relativeAbundance: producer ? 1 : 0.35,
      preservation: { solvent: 'water', retainsSubstrate: true },
    };
  });
}
