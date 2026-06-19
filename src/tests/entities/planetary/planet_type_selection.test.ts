import { describe, expect, it } from 'vitest';
import { AU_IN_METERS } from '../../../constants';
import { SolarSystem } from '../../../entities/solar_system';
import { PRNG } from '../../../utils/prng';

/** Chooses types. */
function chooseTypes(options: {
  effectiveTemp: number;
  orbitAu: number;
  starType: string;
  metallicityFeH: number;
  samples?: number;
}): Set<string> {
  const results = new Set<string>();
  for (let index = 0; index < (options.samples ?? 260); index++) {
    const system = Object.create(SolarSystem.prototype) as any;
    Object.assign(system, {
      name: `selection-${index}`,
      starType: options.starType,
      metallicityFeH: options.metallicityFeH,
      systemPRNG: new PRNG(`planet-type-selection-${options.effectiveTemp}-${index}`),
      calculateFluxAt: () => 1,
      getEffectiveTemperature: () => options.effectiveTemp,
      getDefaultPlanetOrbitHost: () => ({ kind: 'barycentric' }),
    });
    results.add(system.determinePlanetType(options.orbitAu * AU_IN_METERS, 1));
  }
  return results;
}

describe('planet type selection', () => {
  it('admits scientifically distinct hot, temperate, and cold planet classes in plausible regimes', () => {
    expect(
      chooseTypes({ effectiveTemp: 960, orbitAu: 0.04, starType: 'G2V', metallicityFeH: 0.45 })
    ).toContain('Chthonian');
    expect(
      chooseTypes({ effectiveTemp: 430, orbitAu: 0.38, starType: 'G2V', metallicityFeH: 0.1 })
    ).toContain('Greenhouse');
    expect(
      chooseTypes({ effectiveTemp: 285, orbitAu: 0.18, starType: 'K5V', metallicityFeH: 0.35 })
    ).toContain('Hycean');
    expect(chooseTypes({ effectiveTemp: 285, orbitAu: 0.7, starType: 'K5V', metallicityFeH: 0.5 })).toContain(
      'CarbonRich'
    );
    expect(chooseTypes({ effectiveTemp: 125, orbitAu: 5.4, starType: 'G2V', metallicityFeH: 0.2 })).toContain(
      'DwarfIce'
    );
    expect(
      chooseTypes({ effectiveTemp: 175, orbitAu: 3.2, starType: 'K5V', metallicityFeH: 0.25 })
    ).toContain('Cryovolcanic');
  });
});
