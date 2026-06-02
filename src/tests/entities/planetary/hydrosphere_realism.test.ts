import { describe, expect, it } from 'vitest';
import { PRNG } from '../../../utils/prng';
import { generateHydrosphere, estimateSurfaceVolatileRetention } from '../../../entities/planet/surface_descriptor';
import { createSurfaceLiquidOverlay } from '../../../entities/planet/surface_liquid';

const heightmap = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => x + y));

describe('scientifically constrained hydrospheres', () => {
  it('does not assign surface oceans to hot greenhouse worlds', () => {
    const hydrosphere = generateHydrosphere(
      new PRNG('hot-greenhouse-hydro'),
      'Greenhouse',
      735,
      { density: 'Superdense', pressure: 75, composition: { 'Carbon Dioxide': 96, Nitrogen: 3, 'Water Vapor': 1 } },
      {
        surfaceTempMin: 710,
        surfaceTempMax: 760,
        gravity: 0.9,
        escapeVelocity: 10400,
        orbitDistanceM: 0.72 * 1.495978707e11,
        environment: { starType: 'G', ageGyr: 5.1, metallicityFeH: 0 },
      }
    );

    expect(hydrosphere.toLowerCase()).toContain('desiccated');
    expect(hydrosphere.toLowerCase()).not.toContain('ocean');
  });

  it('turns cold water-rich worlds into ice shells rather than exposed oceans', () => {
    const hydrosphere = generateHydrosphere(
      new PRNG('frozen-ocean-hydro'),
      'Oceanic',
      218,
      { density: 'Thick', pressure: 2.5, composition: { Nitrogen: 70, 'Carbon Dioxide': 20, 'Water Vapor': 10 } },
      {
        surfaceTempMin: 190,
        surfaceTempMax: 238,
        gravity: 1.1,
        escapeVelocity: 12500,
        orbitDistanceM: 2.4 * 1.495978707e11,
        environment: { starType: 'K', ageGyr: 3.8, metallicityFeH: 0.15 },
      }
    );
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'Oceanic',
      hydrosphere,
      surfaceTemp: 218,
      atmosphere: { density: 'Thick', pressure: 2.5, composition: { Nitrogen: 70 } },
      heightmap,
    });

    expect(hydrosphere).toContain('Global ice shell');
    expect(overlay).toBeNull();
  });

  it('allows hydrocarbon basins only in cryogenic methane-rich conditions', () => {
    const hydrosphere = generateHydrosphere(
      new PRNG('carbon-hydrocarbon-hydro'),
      'CarbonRich',
      118,
      { density: 'Thick', pressure: 2.2, composition: { Nitrogen: 70, Methane: 22, Ethane: 8 } },
      {
        surfaceTempMin: 92,
        surfaceTempMax: 142,
        gravity: 1.15,
        escapeVelocity: 13200,
        orbitDistanceM: 8.5 * 1.495978707e11,
        environment: { starType: 'K', ageGyr: 1.2, metallicityFeH: 0.45 },
      }
    );
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'CarbonRich',
      hydrosphere,
      surfaceTemp: 118,
      atmosphere: { density: 'Thick', pressure: 1.4, composition: { Methane: 18, Ethane: 6 } },
      heightmap,
    });

    expect(hydrosphere.toLowerCase()).toContain('hydrocarbon');
    expect(overlay?.kind).toBe('methane');
  });

  it('allows Titan-like exposed hydrocarbon lakes on frozen volatile-rich bodies', () => {
    const hydrosphere = generateHydrosphere(
      new PRNG('frozen-titan-like-hydro'),
      'Frozen',
      102,
      { density: 'Thin', pressure: 0.012, composition: { Nitrogen: 72, Methane: 21, Ethane: 3, Argon: 4 } },
      {
        surfaceTempMin: 78,
        surfaceTempMax: 126,
        gravity: 0.22,
        escapeVelocity: 3200,
        densityGcm3: 1.9,
        orbitDistanceM: 6.2 * 1.495978707e11,
        environment: { starType: 'K', ageGyr: 3.4, metallicityFeH: 0.18 },
      }
    );
    const overlay = createSurfaceLiquidOverlay({
      planetType: 'Frozen',
      hydrosphere,
      surfaceTemp: 102,
      atmosphere: { density: 'Thin', pressure: 0.012, composition: { Nitrogen: 72, Methane: 21, Ethane: 3 } },
      heightmap,
    });

    expect(hydrosphere).toContain('Methane/Ethane Lakes');
    expect(overlay?.kind).toBe('methane');
  });

  it('penalises old low-gravity airless bodies for volatile retention', () => {
    const retained = estimateSurfaceVolatileRetention(
      'Lunar',
      260,
      { density: 'None', pressure: 0, composition: { None: 100 } },
      {
        gravity: 0.12,
        escapeVelocity: 2100,
        orbitDistanceM: 1.0 * 1.495978707e11,
        environment: { starType: 'G', ageGyr: 9.8, metallicityFeH: -0.4 },
      }
    );

    expect(retained).toBeLessThan(0.1);
  });
});
