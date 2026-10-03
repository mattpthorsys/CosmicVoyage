import type { Planet } from '../entities/planet';
import type { EncounterField } from '../entities/biology/biology_types';
import { readReadySurfaceData } from '../entities/planet/surface_data';
import { getSurfaceDisplayColour } from '../entities/planet/surface_material';
import { PerlinNoise } from '../generation/perlin';
import { hexToRgb, rgbToHex } from '../rendering/colour';

export interface EncounterSurface {
  readonly colours: readonly (readonly string[])[];
  readonly groundColour: string;
}

const surfaceCache = new WeakMap<EncounterField, { source: unknown; appearance: EncounterSurface }>();

/** Derives local texture from the habitat's actual surface colour, without inventing a second biome. */
export function prepareEncounterSurface(field: EncounterField, planet?: Planet): EncounterSurface {
  const surface = planet ? readReadySurfaceData(planet) : null;
  const prior = surfaceCache.get(field);
  if (prior?.source === surface) return prior.appearance;
  const x = field.site.x,
    y = field.site.y;
  const height = surface?.heightmap?.[y]?.[x] ?? 0;
  const groundColour = surface?.heightLevelColors
    ? getSurfaceDisplayColour(
        height,
        surface.heightLevelColors,
        surface.liquidOverlay,
        surface.materialMap,
        x,
        y
      )
    : '#63856d';
  const rgb = hexToRgb(groundColour);
  const noise = new PerlinNoise(`${field.seed}:field-relief`);
  // Sub-regional texture is an illustrative detail layer, not new geology or changed passability.
  const colours = field.terrain.map((row, cy) =>
    [...row].map((_cell, cx) => {
      const variation = noise.get(cx / 8, cy / 8) * 0.24 + noise.get(cx / 2, cy / 2) * 0.07;
      const factor = cx === 16 && cy === 21 ? 1 : 1 + variation;
      return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
    })
  );
  const appearance = { colours, groundColour };
  surfaceCache.set(field, { source: surface, appearance });
  return appearance;
}
