import type { BiologyEnvironment } from '../../entities/biology/biosphere_generator';
import type { BiosphereDefinition } from '../../entities/biology/biology_types';
import { generateMicrobialCommunity } from '../../entities/biology/microbial_biosphere';
import { PRNG } from '../../utils/prng';

/** Supplies a suitable managed fixture without changing production starting worlds. */
export function biologyFixture(overrides: Partial<BiologyEnvironment> = {}): BiologyEnvironment {
  return {
    bodyId: 'fixture/planet:0/bio1',
    bodyName: 'Fixture',
    seed: 'biology-fixture',
    origin: 'introduced',
    temperatureK: 294,
    pressureBar: 1,
    oxygenBar: 0.21,
    gravity: 1,
    ageGyr: 4,
    waterCoverage: 0.3,
    humanIntensity: 1,
    distanceLy: 0,
    landable: true,
    stellarFluxWm2: 1361,
    carbonDioxideBar: 0.0004,
    ...overrides,
  };
}

/** Supplies an explicit water-colony envelope, not a prediction of alien habitability or occurrence. */
export function pressureBiologyFixture(overrides: Partial<BiologyEnvironment> = {}): BiologyEnvironment {
  return biologyFixture({
    bodyId: '0,0,0/planet:0/bio3',
    bodyName: 'Pressure reference',
    seed: 'pressure-fixture',
    origin: 'native',
    temperatureK: 300,
    pressureBar: 10,
    oxygenBar: 0,
    stellarFluxWm2: 800,
    carbonDioxideBar: 0.0004,
    ...overrides,
  });
}

/** Supplies typed microbial contacts independently of probabilistic life occurrence for focused interaction tests. */
export function microbialBiosphereFixture(overrides: Partial<BiologyEnvironment> = {}): BiosphereDefinition {
  const e = biologyFixture({ origin: 'native', bodyId: '0,0,0/planet:0/bio4', ...overrides });
  return {
    id: e.bodyId,
    bodyName: e.bodyName,
    origin: 'native',
    complexity: 'microbial-only',
    species: generateMicrobialCommunity(e, new PRNG(e.seed)),
    sites: [
      {
        id: `${e.bodyId}/site:1,1`,
        x: 1,
        y: 1,
        label: 'Water margin',
        habitat: {
          version: 1,
          kind: 'moist-margin',
          relief: 0.01,
          waterDistanceCells: 1,
          description: 'Hydrated margin substrate',
        },
      },
    ],
  };
}
