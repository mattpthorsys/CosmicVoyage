import { describe, expect, it } from 'vitest';
import { AU_IN_METERS, SOLAR_LUMINOSITY_W } from '../../../constants/physics';
import { SPECTRAL_TYPES } from '../../../constants/stellar';
import { getPlanetOrbitSamplingScale } from '../../../entities/planet/orbit_sampling';
import {
  calculateStellarLuminosityW,
  type StellarArchitecture,
  type StellarBody,
} from '../../../entities/stellar_body';
import { getDefaultStellarEnvironment } from '../../../entities/stellar_environment';
import { SolarSystem } from '../../../entities/solar_system';
import { isOrbitWithinStableRange } from '../../../entities/orbital_stability';
import { PRNG } from '../../../utils/prng';

/** Supplies independently controlled source luminosity without replacing production orbital generation. */
function source(id: StellarBody['id'], starType: string, luminositySolar?: number): StellarBody {
  return {
    id,
    name: id,
    starType,
    massKg: SPECTRAL_TYPES[starType].mass,
    radiusM: SPECTRAL_TYPES[starType].radius,
    luminosityW:
      luminositySolar === undefined
        ? calculateStellarLuminosityW(starType)
        : luminositySolar * SOLAR_LUMINOSITY_W,
    systemX: 0,
    systemY: 0,
    orbit: null,
    environment: getDefaultStellarEnvironment(starType),
  };
}

/** Supplies a hierarchy for isolated sampling-prior checks; stability is tested on generated systems below. */
function architecture(stars: StellarBody[]): StellarArchitecture {
  return {
    kind: stars.length === 1 ? 'single' : stars.length === 2 ? 'binary' : 'triple',
    stars,
    primaryStarId: 'A',
    binarySeparation: AU_IN_METERS,
    outerSeparation: 40 * AU_IN_METERS,
    habitableLabel: 'Test',
  };
}

/** Generates uninhabited systems without injecting water, atmospheres or a habitable orbit. */
function generate(starType: string, index: number): SolarSystem {
  const environment = getDefaultStellarEnvironment(starType);
  return new SolarSystem(
    {
      exists: true,
      name: `Compact ${starType} ${index}`,
      starType,
      architecture: architecture([source('A', starType)]),
      ageGyr: environment.ageGyr,
      metallicityFeH: 0,
      hasStarbase: false,
      settlementStage: 'none',
      objectKind: 'stellar',
    },
    index,
    -23,
    new PRNG(`compact-orbits-${starType}-${index}`)
  );
}

describe('host-aware planet orbit sampling', () => {
  it('scales dim hosts by illumination while retaining the solar and evolved-host baseline', () => {
    expect(
      getPlanetOrbitSamplingScale(architecture([source('A', 'K5V', 0.04)]), {
        kind: 'circumstellar',
        starId: 'A',
      })
    ).toBeCloseTo(0.2);
    for (const [starType, luminositySolar] of [
      ['G2V', 1],
      ['A', 20],
      ['DA5', 0.001],
      ['M3III', 100],
    ] as const)
      expect(
        getPlanetOrbitSamplingScale(architecture([source('A', starType, luminositySolar)]), {
          kind: 'circumstellar',
          starId: 'A',
        })
      ).toBe(1);
  });

  it('uses only the orbit host sources, excluding the outer companion from AB layout scaling', () => {
    const value = architecture([source('A', 'M3V', 0.01), source('B', 'M3V', 0.03), source('C', 'G2V', 1)]);
    expect(getPlanetOrbitSamplingScale(value, { kind: 'circumstellar', starId: 'A' })).toBeCloseTo(0.1);
    expect(getPlanetOrbitSamplingScale(value, { kind: 'circumbinary' })).toBeCloseTo(0.2);
    expect(getPlanetOrbitSamplingScale(value, { kind: 'barycentric' })).toBe(1);
  });

  it.each(['K5V', 'M3V', 'M8V'])(
    'allows warm and cold orbits around %s with stable spacing and no surface-life guarantee',
    (starType) => {
      let warm = 0;
      let cold = 0;
      let subTenthAuPairs = 0;
      let adjacentPairs = 0;
      let airless = 0;
      for (let index = 0; index < 24; index++) {
        const value = generate(starType, index);
        const minimumSampledGap =
          0.1 *
          getPlanetOrbitSamplingScale(value.architecture, { kind: 'circumstellar', starId: 'A' }) *
          AU_IN_METERS;
        const planets = value.planets.filter((planet) => planet !== null);
        const ordered = [...planets].sort((a, b) => a.orbitDistance - b.orbitDistance);
        for (const [slot, planet] of ordered.entries()) {
          expect(isOrbitWithinStableRange(value.architecture, planet.orbitHost, planet.orbitDistance)).toBe(
            true
          );
          if (planet.referenceStellarFluxWm2 >= 600 && planet.referenceStellarFluxWm2 <= 2300) warm++;
          if (planet.referenceStellarFluxWm2 < 300) cold++;
          if (planet.atmosphere.pressure === 0) airless++;
          if (slot > 0) {
            const gap = planet.orbitDistance - ordered[slot - 1].orbitDistance;
            expect(gap).toBeGreaterThanOrEqual(minimumSampledGap);
            adjacentPairs++;
            if (gap < 0.1 * AU_IN_METERS) subTenthAuPairs++;
          }
          expect(planet.terraforming).toBeNull();
          expect(planet.isSurfaceReady()).toBe(false);
        }
      }
      expect(warm).toBeGreaterThan(0);
      expect(cold).toBeGreaterThan(0);
      expect(adjacentPairs).toBeGreaterThan(0);
      // K5 planets may need wider gaps to remain outside one another's mutual Hill spheres.
      if (starType.startsWith('M')) expect(subTenthAuPairs).toBeGreaterThan(0);
      expect(airless).toBeGreaterThan(0);
      const first = generate(starType, 0);
      expect(generate(starType, 0).planets.map((planet) => planet?.orbitDistance)).toEqual(
        first.planets.map((planet) => planet?.orbitDistance)
      );
    }
  );
});
