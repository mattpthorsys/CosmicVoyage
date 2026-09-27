import { CONFIG } from '../config';
import type { GalacticPopulation } from './milky_way_model';

/** Young thin-disk stars are more concentrated towards the midplane than old stars. */
export function projectedYoungFraction(armInfluence: number): number {
  const young = 0.08 + Math.max(0, Math.min(1, armInfluence)) * 0.22;
  return (
    (young * projectedDepthPc(60)) / (young * projectedDepthPc(60) + (1 - young) * projectedDepthPc(300))
  );
}

/** Returns effective depths for the same population mixture used by count and age sampling. */
function populationDepths(armInfluence: number): Record<GalacticPopulation, number> {
  const young = 0.08 + Math.max(0, Math.min(1, armInfluence)) * 0.22;
  return {
    'thin-disk': young * projectedDepthPc(60) + (1 - young) * projectedDepthPc(300),
    'thick-disk': projectedDepthPc(900),
    bulge: projectedDepthPc(500),
    halo: projectedDepthPc(3000),
  };
}

/** Reweights midplane population fractions by the number of systems in the projected slab. */
export function projectedPopulationWeights(
  weights: Readonly<Record<GalacticPopulation, number>>,
  armInfluence: number
): Record<GalacticPopulation, number> {
  const depths = populationDepths(armInfluence);
  const total = Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + weight * depths[key as GalacticPopulation],
    0
  );
  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [
      key,
      (weight * depths[key as GalacticPopulation]) / total,
    ])
  ) as Record<GalacticPopulation, number>;
}

/** Integrates exp(-|z|/h) through a finite slab; the result is an effective depth in parsecs. */
export function projectedDepthPc(
  scaleHeightPc: number,
  halfDepthPc = CONFIG.GALACTIC_PROJECTION_HALF_DEPTH_PC
): number {
  return 2 * scaleHeightPc * -Math.expm1(-halfDepthPc / scaleHeightPc);
}

/** Converts local number density to a sparse projected catalogue, preserving square-cell area scaling. */
export function projectedSystemMean(
  relativeDensity: number,
  weights: Readonly<Record<GalacticPopulation, number>>,
  armInfluence: number,
  cellWidthLy = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS
): number {
  const depths = populationDepths(armInfluence);
  const depth = Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + weight * depths[key as GalacticPopulation],
    0
  );
  return (
    CONFIG.GALACTIC_LOCAL_SYSTEM_DENSITY_PC3 *
    relativeDensity *
    depth *
    (cellWidthLy / 3.26156) ** 2 *
    CONFIG.GALACTIC_NAVIGABLE_SAMPLE_FRACTION
  );
}
