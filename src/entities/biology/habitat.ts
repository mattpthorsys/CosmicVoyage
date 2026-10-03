import { PRNG } from '../../utils/prng';
import type { SurfaceData } from '../planet/surface_generator';
import {
  ENCOUNTER_HEIGHT,
  ENCOUNTER_WIDTH,
  HABITAT_VERSION,
  type BiosphereDefinition,
  type HabitatKind,
  type HabitatProfile,
  type SpeciesDefinition,
} from './biology_types';

/** Classifies accessible regional land from numeric relief and verified liquid-water proximity. */
export function classifyHabitat(
  surface: SurfaceData,
  x: number,
  y: number,
  hasLiquidWater: boolean
): HabitatProfile | null {
  const map = surface.heightmap;
  const height = map?.[y]?.[x];
  const seaLevel = surface.liquidOverlay?.seaLevel;
  if (!map || height === undefined || (seaLevel !== undefined && height <= seaLevel)) return null;
  const width = map[0].length;
  let waterDistanceCells: number | null = null;
  let relief = 0;
  for (let dy = -2; dy <= 2; dy++) {
    const row = map[Math.max(0, Math.min(map.length - 1, y + dy))];
    for (let dx = -2; dx <= 2; dx++) {
      const neighbour = row[(((x + dx) % width) + width) % width];
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)
        relief = Math.max(relief, Math.abs(neighbour - height) / 255);
      if (hasLiquidWater && seaLevel !== undefined && neighbour <= seaLevel) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        waterDistanceCells = Math.min(waterDistanceCells ?? distance, distance);
      }
    }
  }
  // These are coarse habitat priors, not measured moisture or a new local climate simulation.
  const elevation = (height - (seaLevel ?? 0)) / 255;
  const kind: HabitatKind =
    waterDistanceCells !== null
      ? relief >= 0.12
        ? 'rocky-margin'
        : 'moist-margin'
      : elevation >= 0.32
        ? 'upland-ground'
        : relief >= 0.035
          ? 'sheltered-ground'
          : 'exposed-ground';
  return {
    version: HABITAT_VERSION,
    kind,
    relief,
    waterDistanceCells,
    description: {
      'moist-margin': 'Water-adjacent land; broad producer mats with grazing and detritus communities.',
      'rocky-margin': 'Water-adjacent broken rock; attached fan colonies and crevice consumers.',
      'sheltered-ground': 'Broken relief; substrate colonies and shelter-associated consumers.',
      'exposed-ground': 'Exposed land; sparse fronds and mobile foragers.',
      'upland-ground': 'Elevated exposed substrate; compact producer rosettes and small detritus consumers.',
    }[kind],
  };
}

/** Selects a small habitat community without requiring every planetary species at every site. */
export function habitatCommunity(biosphere: BiosphereDefinition, kind: HabitatKind): SpeciesDefinition[] {
  return biosphere.species.filter((species) => species.habitatAffinity?.includes(kind));
}

/** Generates illustrative metre-scale ecological patches without resampling regional geology. */
export function createHabitatPatches(seed: string, kind: HabitatKind): string[] {
  const prng = new PRNG(seed).seedNew('habitat-patches', HABITAT_VERSION);
  const centreX = prng.randomInt(7, 12),
    centreY = prng.randomInt(8, 13);
  const shelterX = prng.randomInt(22, 26),
    shelterY = prng.randomInt(7, 13);
  return Array.from({ length: ENCOUNTER_HEIGHT }, (_, y) =>
    Array.from({ length: ENCOUNTER_WIDTH }, (_, x) => {
      if (
        (kind === 'moist-margin' || kind === 'rocky-margin') &&
        Math.hypot((x - centreX) / 1.4, y - centreY) <= (kind === 'rocky-margin' ? 4 : 6)
      )
        return 'm';
      if (
        Math.hypot(x - shelterX, y - shelterY) <=
        (kind === 'sheltered-ground' || kind === 'rocky-margin' ? 8 : 4)
      )
        return 's';
      return 'o';
    }).join('')
  );
}
