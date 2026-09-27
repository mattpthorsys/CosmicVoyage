import { PerlinNoise } from '../../generation/perlin';
import { hexToRgb, interpolateColour, rgbToHex } from '../../rendering/colour';
import { getCoastalVegetationColour, SurfaceLiquidOverlay } from './surface_liquid';

/** Indexed dry-surface albedo, shared by orbit, landing maps, and surface travel. */
export interface SurfaceMaterialMap {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  indices: Uint8Array;
  palette: string[];
  strength: number;
}

interface MaterialProfile {
  dark: string;
  light: string;
  elevationBias: number;
  strength: number;
}

/** Combines three Cartesian projections into a continuous field on a sphere. */
function sampleSphericalField(noise: PerlinNoise, x: number, y: number, z: number, scale: number): number {
  return (
    (noise.get(y * scale + 17, z * scale + 31) +
      noise.get(z * scale + 43, x * scale + 59) +
      noise.get(x * scale + 71, y * scale + 89)) /
    3
  );
}

/** Smoothly maps a bounded transition interval to zero through one. */
function smoothstep(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

// Representative material mixtures, not mineral identifications or calibrated
// spectra. In particular, atmospheric colour does not belong in surface albedo.
const ROCK: MaterialProfile = { dark: '#62615D', light: '#B7ACA0', elevationBias: 0.2, strength: 0.32 };
const ICE: MaterialProfile = { dark: '#969D9D', light: '#E4E9E6', elevationBias: -0.12, strength: 0.28 };
const MAX_MATERIAL_MAP_DIMENSION = 257;
const MATERIALS: Record<string, MaterialProfile> = {
  Lunar: { dark: '#646361', light: '#BBB8B1', elevationBias: 0.3, strength: 0.28 },
  Rock: ROCK,
  Oceanic: { ...ROCK, strength: 0.18 },
  Hycean: { ...ROCK, strength: 0.18 },
  Greenhouse: { dark: '#66605A', light: '#B8AA95', elevationBias: 0.2, strength: 0.3 },
  CarbonRich: { dark: '#403D39', light: '#8D8474', elevationBias: 0.15, strength: 0.28 },
  Chthonian: { dark: '#655957', light: '#B49B88', elevationBias: 0.22, strength: 0.3 },
  Frozen: ICE,
  Cryovolcanic: ICE,
  DwarfIce: { dark: '#77736E', light: '#D6DBD8', elevationBias: -0.18, strength: 0.28 },
};

/** Generates seamless material provinces without changing terrain, liquids, or resource RNG. */
export function createSurfaceMaterialMap(
  planetType: string,
  mapSeed: string,
  heightmap: number[][],
  surfaceTemp = 160
): SurfaceMaterialMap | null {
  const icy = planetType === 'Frozen' || planetType === 'Cryovolcanic' || planetType === 'DwarfIce';
  const profile = icy && surfaceTemp > 273.15 ? ROCK : MATERIALS[planetType];
  const sourceHeight = heightmap.length;
  const sourceWidth = heightmap[0]?.length ?? 0;
  // Molten worlds retain their existing thermal palette; giants have no solid map.
  if (!profile || !sourceWidth || !sourceHeight) return null;
  const width = Math.min(sourceWidth, MAX_MATERIAL_MAP_DIMENSION);
  const height = Math.min(sourceHeight, MAX_MATERIAL_MAP_DIMENSION);
  // This full map is always sampled in row-major order, so seeded cached gradients
  // are deterministic here without hashing every Perlin lattice corner.
  const noise = new PerlinNoise(`${mapSeed}:material-boundaries:v1`);
  const dark = hexToRgb(profile.dark);
  const light = hexToRgb(profile.light);
  const palette = Array.from({ length: 256 }, (_, index) => {
    const colour = interpolateColour(dark, light, index / 255);
    return rgbToHex(colour.r, colour.g, colour.b);
  });
  const indices = new Uint8Array(width * height);
  const longitudeCos = new Float64Array(width);
  const longitudeSin = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const angle = (x / Math.max(1, width - 1)) * Math.PI * 2;
    longitudeCos[x] = Math.cos(angle);
    longitudeSin[x] = Math.sin(angle);
  }

  for (let y = 0; y < height; y++) {
    // Inverse of the orbital renderer's Mercator coordinate, not linear latitude.
    const mercator = (0.5 - y / Math.max(1, height - 1)) * Math.PI * 2;
    const latitudeSin = Math.tanh(mercator);
    const latitudeCos = 1 / Math.cosh(mercator);
    const sourceY = Math.round((y / Math.max(1, height - 1)) * (sourceHeight - 1));
    for (let x = 0; x < width; x++) {
      const nx = latitudeCos * longitudeCos[x];
      const ny = latitudeSin;
      const nz = latitudeCos * longitudeSin[x];
      // Warp a broad field with lower-amplitude regional structure. Sampling in
      // Cartesian coordinates keeps patterns continuous around poles and seams.
      const wx = nx + noise.get(ny * 2.4 + 17, nz * 2.4 + 31) * 0.22;
      const wy = ny + noise.get(nz * 2.4 + 43, nx * 2.4 + 59) * 0.22;
      const wz = nz + noise.get(nx * 2.4 + 71, ny * 2.4 + 89) * 0.22;
      const broad = sampleSphericalField(noise, wx, wy, wz, 3.2);
      const regional = sampleSphericalField(noise, wx, wy, wz, 8.5);
      const fine = sampleSphericalField(noise, wx, wy, wz, 19);
      const sourceX = Math.round((x / Math.max(1, width - 1)) * (sourceWidth - 1));
      const elevation = Math.max(0, Math.min(255, heightmap[sourceY][sourceX])) / 255;
      const geology = broad * 0.68 + regional * 0.24 + fine * 0.08;
      const geologyWithRelief = geology + (elevation - 0.5) * profile.elevationBias * 0.18;
      const material = smoothstep(-0.075, 0.075, geologyWithRelief);
      indices[y * width + x] = Math.round(Math.max(0, Math.min(1, material)) * 255);
    }
    // Generated heightmaps duplicate the longitude endpoint; mirror it exactly.
    indices[y * width + width - 1] = indices[y * width];
  }
  return { width, height, sourceWidth, sourceHeight, indices, palette, strength: profile.strength };
}

/** Returns the map index for a native terrain cell, wrapping longitude and clamping latitude. */
export function getSurfaceMaterialIndex(materials: SurfaceMaterialMap, x: number, y: number): number {
  const sourceWidth = materials.sourceWidth || materials.width;
  const sourceHeight = materials.sourceHeight || materials.height;
  const sourceX = ((Math.floor(x) % sourceWidth) + sourceWidth) % sourceWidth;
  const sourceY = Math.max(0, Math.min(sourceHeight - 1, Math.floor(y)));
  const col = Math.min(
    materials.width - 1,
    Math.floor((sourceX / Math.max(1, sourceWidth - 1)) * (materials.width - 1))
  );
  const row = Math.min(
    materials.height - 1,
    Math.floor((sourceY / Math.max(1, sourceHeight - 1)) * (materials.height - 1))
  );
  return materials.indices[row * materials.width + col];
}

/** Returns a body's dry material colour at a native map cell. */
export function getSurfaceMaterialColour(
  materials: SurfaceMaterialMap | null | undefined,
  x: number,
  y: number
): string | null {
  if (!materials) return null;
  return materials.palette[getSurfaceMaterialIndex(materials, x, y)] ?? null;
}

/** Resolves covering liquids and vegetation before the dry surface material. */
export function getSurfaceDisplayColour(
  height: number,
  heightColours: string[],
  liquid: SurfaceLiquidOverlay | null,
  materials: SurfaceMaterialMap | null | undefined,
  x: number,
  y: number
): string {
  const level = Math.max(0, Math.min(heightColours.length - 1, Math.round(height)));
  if (liquid && level <= liquid.seaLevel) return liquid.colour;
  const vegetation = getCoastalVegetationColour(level, liquid);
  if (vegetation) return vegetation;
  const terrain = heightColours[level] ?? '#88BBBB';
  const material = getSurfaceMaterialColour(materials, x, y);
  if (!material || !materials || materials.strength <= 0) return terrain;
  const blended = interpolateColour(hexToRgb(terrain), hexToRgb(material), materials.strength);
  return rgbToHex(blended.r, blended.g, blended.b);
}
