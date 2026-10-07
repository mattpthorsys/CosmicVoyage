import type { TerraformingProfile } from '../../entities/habitability';
import type { SurfaceLiquidOverlay } from '../../entities/planet/surface_liquid';

export type SettlementTerrainFixture = 'coast' | 'island' | 'seam' | 'dry' | 'flooded' | 'rough';

// Diagnostic interventions on real generated worlds, not changes to colony frequency.
export const SETTLEMENT_VISUAL_PRESETS = [
  { id: 'starting-colony', type: 'Rock', distanceAu: 1, stage: null },
  { id: 'colony-complete', type: 'Rock', distanceAu: 1, stage: 'complete' },
  { id: 'colony-partial', type: 'Rock', distanceAu: 1, stage: 'partial' },
  { id: 'uninhabited', type: 'Rock', distanceAu: 1, stage: null },
  { id: 'depot-only', type: 'Rock', distanceAu: 1, stage: null },
] as const;

/** Supplies a controlled colony environment without changing natural geology or generation seeds. */
export function settlementTerraformingFixture(stage: 'partial' | 'complete'): TerraformingProfile {
  const complete = stage === 'complete';
  return {
    stage,
    atmosphere: {
      density: complete ? 'Earth-like' : 'Thin',
      pressure: complete ? 1 : 0.55,
      composition: complete
        ? { Nitrogen: 78.96, Oxygen: 21, 'Carbon Dioxide': 0.04 }
        : { Nitrogen: 89.8, Oxygen: 10, 'Carbon Dioxide': 0.2 },
    },
    meanTemperatureK: complete ? 288 : 278,
    minTemperatureK: complete ? 245 : 235,
    maxTemperatureK: complete ? 320 : 310,
    hydrosphereFraction: complete ? 0.63 : 0.3,
    biosphereStage: complete ? 'managed temperate biosphere' : 'protected pioneer biosphere',
    engineeringSupport: complete ? ['climate monitoring'] : ['sealed settlements'],
    habitabilityScore: complete ? 90 : 65,
    climate: {
      minStellarFluxWm2: 1361,
      maxStellarFluxWm2: 1361,
      bondAlbedo: 0.3,
      greenhouseWarmingK: complete ? 33 : 23,
      radiativeControlWm2: 0,
    },
  };
}

/** Builds small dry/liquid/rough maps with the generated heightmap's duplicated longitude endpoint. */
export function settlementTerrainFixture(
  kind: SettlementTerrainFixture = 'coast',
  size = 65
): { heightmap: number[][]; liquid: SurfaceLiquidOverlay | null } {
  const period = size - 1;
  const heightmap = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, sourceX) => {
      const x = sourceX % period;
      if (kind === 'flooded') return 80;
      if (kind === 'rough') return (x + y) % 2 === 0 ? 100 : 220;
      if (kind === 'dry') return 108;
      if (kind === 'coast') return x < period / 3 ? 80 : 105;
      if (kind === 'island') return Math.abs(x - period / 2) < 5 && Math.abs(y - period / 2) < 5 ? 105 : 80;
      return (x < 6 || x >= period - 6) && y > size / 3 && y < (size * 2) / 3 ? 105 : 80;
    })
  );
  const liquid: SurfaceLiquidOverlay | null =
    kind === 'dry' || kind === 'rough'
      ? null
      : {
          kind: 'water',
          label: 'Water',
          seaLevel: 90,
          coverage: kind === 'flooded' ? 1 : 0.4,
          colour: '#193849',
          reflectiveColour: '#87B4C3',
          coastalVegetation: null,
        };
  return { heightmap, liquid };
}
