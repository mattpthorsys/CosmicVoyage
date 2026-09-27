import { describe, expect, it, vi } from 'vitest';
import { SOLAR_MASS_KG, AU_IN_METERS } from '../../constants/physics';
import { SolarSystem } from '../../entities/solar_system';
import { isOrbitWithinStableRange } from '../../entities/orbital_stability';
import { isMainSequenceStar } from '../../entities/stellar_environment';
import { getStellarPopulationDistribution } from '../../generation/stellar_population';
import { SystemDataGenerator, SystemMapProperties } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';

describe('evolved stellar systems', () => {
  it.each(['G5IV', 'K1III', 'M3III', 'B5III', 'B1Ia', 'M2Iab', 'O5III', 'WN', 'DA2', 'DA5', 'DC'])(
    'preserves %s from map descriptor through a navigable local system',
    (starType) => {
      const seed = new PRNG('evolved-local-integration');
      const generator = new SystemDataGenerator(seed);
      const context = { ...generator.getGalacticContext(0, 0), cluster: null };
      const population = { population: 'thin-disk' as const, ageGyr: 4.6, metallicityFeH: 0 };
      const phase = getStellarPopulationDistribution(context, population).find(
        (option) => option.starType === starType
      )!;
      expect(phase).toBeDefined();
      const descriptor: SystemMapProperties = {
        exists: true,
        starType,
        name: `Rare ${starType}`,
        objectKind: 'stellar',
        hasStarbase: false,
        stellarEvolution: { ...phase.evolution },
        stellarPopulation: { ...population, ageGyr: (phase.minAgeGyr + phase.maxAgeGyr) / 2 },
        stationKind: null,
        settlementStage: 'none',
      };
      vi.spyOn(generator, 'getSystemMapProperties').mockReturnValue(descriptor);
      for (const x of [100, 101, 102]) {
        const properties = generator.getNavigableSystemProperties(x, 100);
        const system = new SolarSystem(properties, x, 100, seed);
        const primary = system.stars[0];
        expect(primary.starType).toBe(starType);
        expect(primary.massKg).toBeCloseTo(phase.evolution.massSolar * SOLAR_MASS_KG, -18);
        expect(primary.radiusM).toBe(phase.evolution.radiusM);
        expect(primary.environment.evolution).toEqual(phase.evolution);
        expect(primary.environment.evolution).not.toBe(
          properties.architecture!.stars[0].environment.evolution
        );
        expect(primary.luminosityW).toBeGreaterThan(0);
        expect(system.colonyWorld).toBeNull();
        expect(Number.isFinite(system.edgeRadius)).toBe(true);
        if (system.stars.length > 1) {
          expect(system.architecture.binarySeparation).toBeGreaterThan(
            3 * (primary.radiusM + system.stars[1].radiusM)
          );
        }
        for (const companion of system.stars.slice(1)) {
          expect(isMainSequenceStar(companion.starType)).toBe(true);
          expect(companion.massKg).toBeLessThanOrEqual(primary.massKg);
          expect(companion.environment.ageGyr).toBe(primary.environment.ageGyr);
        }
        for (const planet of system.planets) {
          if (!planet) continue;
          expect(isOrbitWithinStableRange(system.architecture, planet.orbitHost, planet.orbitDistance)).toBe(
            true
          );
          if (system.stars.length === 1 && phase.evolution.stage === 'white-dwarf') {
            expect(planet.orbitDistance).toBeGreaterThanOrEqual(
              (2 * AU_IN_METERS * phase.evolution.initialMassSolar) / phase.evolution.massSolar
            );
          }
        }
      }
    }
  );
});
