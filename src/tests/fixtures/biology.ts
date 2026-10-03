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
    ...overrides,
  };
}
