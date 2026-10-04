import type { BiologyEnvironment } from '../../entities/biology/biosphere_generator';

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
