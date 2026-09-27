import { Planet } from '../../entities/planet';
import { getCoastalVegetationColour, SurfaceLiquidOverlay } from '../../entities/planet/surface_liquid';
import { getSurfaceMaterialIndex, SurfaceMaterialMap } from '../../entities/planet/surface_material';
import { hexToRgb, interpolateColour, RgbColour } from '../colour';
import { ORBIT_CAMERA_DISTANCE, ORBIT_FOCAL_FACTOR } from './orbit_lighting';

interface SolidOrbitTextureLevel {
  width: number;
  height: number;
  colours: Uint8ClampedArray;
  liquidCoverage: Uint8ClampedArray;
}

interface SolidOrbitTexture {
  sourceHeightmap: number[][];
  sourceHeightColours: string[];
  sourceLiquid: SurfaceLiquidOverlay | null;
  sourceMaterials: SurfaceMaterialMap | null;
  reflectiveColour: RgbColour | null;
  levels: SolidOrbitTextureLevel[];
}

interface DisplayPalette {
  colours: RgbColour[];
  liquid: Uint8Array;
  material: Uint8Array;
}

interface FilteredLevelSample {
  r: number;
  g: number;
  b: number;
  liquidCoverage: number;
}

export interface SolidOrbitTextureSample {
  colour: RgbColour;
  liquidCoverage: number;
  reflectiveColour: RgbColour | null;
}

// Keep enough source detail for the largest 52-pixel globe and its changing
// projection; the mip chain removes only detail smaller than a display pixel.
const BASE_TEXTURE_WIDTH = 256;
const BASE_TEXTURE_HEIGHT = 128;
const MIN_TEXTURE_WIDTH = 8;
const MIN_TEXTURE_HEIGHT = 4;

/** Builds and samples temporally stable display textures for solid orbital bodies. */
export class SolidPlanetOrbitTextureRenderer {
  private readonly textureCache = new WeakMap<Planet, SolidOrbitTexture>();

  /** Prepares a body-fixed filtered texture outside the orbital frame loop. */
  prepareTexture(
    planet: Planet,
    heightmap: number[][],
    heightColours: string[],
    liquid: SurfaceLiquidOverlay | null,
    materials: SurfaceMaterialMap | null = null
  ): void {
    this.getOrCreateTexture(planet, heightmap, heightColours, liquid, materials);
  }

  /** Samples filtered albedo and liquid coverage without smoothing the final display pixel. */
  sample(
    planet: Planet,
    heightmap: number[][],
    heightColours: string[],
    liquid: SurfaceLiquidOverlay | null,
    u: number,
    v: number,
    projectedDiameter: number,
    viewNormalZ: number,
    materials: SurfaceMaterialMap | null = null
  ): SolidOrbitTextureSample {
    const texture = this.getOrCreateTexture(planet, heightmap, heightColours, liquid, materials);
    const lod = this.calculateLod(texture.levels, v, projectedDiameter, viewNormalZ);
    return this.sampleTexture(texture, u, v, lod);
  }

  /** Uses the same albedo and coastline filtering for a flat landing-map raster. */
  sampleMap(
    planet: Planet,
    heightmap: number[][],
    heightColours: string[],
    liquid: SurfaceLiquidOverlay | null,
    u: number,
    v: number,
    width: number,
    height: number,
    materials: SurfaceMaterialMap | null = null
  ): SolidOrbitTextureSample {
    const texture = this.getOrCreateTexture(planet, heightmap, heightColours, liquid, materials);
    const base = texture.levels[0];
    const footprint = Math.max(base.width / Math.max(1, width), base.height / Math.max(1, height));
    const lod = Math.min(texture.levels.length - 1, Math.log2(Math.max(1, footprint)));
    return this.sampleTexture(texture, u, v, lod);
  }

  /** Trilinearly filters a prepared surface without rebuilding or decoding source colours. */
  private sampleTexture(
    texture: SolidOrbitTexture,
    u: number,
    v: number,
    lod: number
  ): SolidOrbitTextureSample {
    const lowIndex = Math.floor(lod);
    const highIndex = Math.min(texture.levels.length - 1, lowIndex + 1);
    const mix = lod - lowIndex;
    const low = this.sampleLevel(texture.levels[lowIndex], u, v);

    if (mix <= 0 || lowIndex === highIndex) {
      return {
        colour: { r: low.r, g: low.g, b: low.b },
        liquidCoverage: low.liquidCoverage,
        reflectiveColour: texture.reflectiveColour,
      };
    }

    const high = this.sampleLevel(texture.levels[highIndex], u, v);
    return {
      colour: {
        r: low.r + (high.r - low.r) * mix,
        g: low.g + (high.g - low.g) * mix,
        b: low.b + (high.b - low.b) * mix,
      },
      liquidCoverage: low.liquidCoverage + (high.liquidCoverage - low.liquidCoverage) * mix,
      reflectiveColour: texture.reflectiveColour,
    };
  }

  /** Returns a matching cached texture or rebuilds it when prepared surface data changes. */
  private getOrCreateTexture(
    planet: Planet,
    heightmap: number[][],
    heightColours: string[],
    liquid: SurfaceLiquidOverlay | null,
    materials: SurfaceMaterialMap | null
  ): SolidOrbitTexture {
    const cached = this.textureCache.get(planet);
    if (
      cached &&
      cached.sourceHeightmap === heightmap &&
      cached.sourceHeightColours === heightColours &&
      cached.sourceLiquid === liquid &&
      cached.sourceMaterials === materials
    ) {
      return cached;
    }

    const base = this.buildBaseLevel(heightmap, heightColours, liquid, materials);
    const texture: SolidOrbitTexture = {
      sourceHeightmap: heightmap,
      sourceHeightColours: heightColours,
      sourceLiquid: liquid,
      sourceMaterials: materials,
      reflectiveColour: liquid ? hexToRgb(liquid.reflectiveColour) : null,
      levels: this.buildMipChain(base),
    };
    this.textureCache.set(planet, texture);
    return texture;
  }

  /** Area-filters generated surface cells into the highest orbital texture level. */
  private buildBaseLevel(
    heightmap: number[][],
    heightColours: string[],
    liquid: SurfaceLiquidOverlay | null,
    materials: SurfaceMaterialMap | null
  ): SolidOrbitTextureLevel {
    const sourceHeight = Math.max(1, heightmap.length);
    const sourceWidth = Math.max(1, heightmap[0]?.length ?? 0);
    const palette = this.buildDisplayPalette(heightColours, liquid);
    const materialSourceWidth = materials?.sourceWidth ?? materials?.width;
    const materialSourceHeight = materials?.sourceHeight ?? materials?.height;
    const materialPalette =
      materials && materialSourceWidth === sourceWidth && materialSourceHeight === sourceHeight
        ? materials.palette.map(hexToRgb)
        : null;
    const colours = new Uint8ClampedArray(BASE_TEXTURE_WIDTH * BASE_TEXTURE_HEIGHT * 3);
    const liquidCoverage = new Uint8ClampedArray(BASE_TEXTURE_WIDTH * BASE_TEXTURE_HEIGHT);

    for (let targetY = 0; targetY < BASE_TEXTURE_HEIGHT; targetY++) {
      const sourceTop = (targetY * sourceHeight) / BASE_TEXTURE_HEIGHT;
      const sourceBottom = ((targetY + 1) * sourceHeight) / BASE_TEXTURE_HEIGHT;
      const firstSourceY = Math.floor(sourceTop);
      const lastSourceY = Math.ceil(sourceBottom) - 1;

      for (let targetX = 0; targetX < BASE_TEXTURE_WIDTH; targetX++) {
        const sourceLeft = (targetX * sourceWidth) / BASE_TEXTURE_WIDTH;
        const sourceRight = ((targetX + 1) * sourceWidth) / BASE_TEXTURE_WIDTH;
        const firstSourceX = Math.floor(sourceLeft);
        const lastSourceX = Math.ceil(sourceRight) - 1;
        let red = 0;
        let green = 0;
        let blue = 0;
        let water = 0;
        let totalWeight = 0;

        // Exact box-overlap weights make downsampling independent of whether the
        // generated map dimensions divide evenly into the orbital texture.
        for (let sourceY = firstSourceY; sourceY <= lastSourceY; sourceY++) {
          const overlapY = Math.min(sourceBottom, sourceY + 1) - Math.max(sourceTop, sourceY);
          if (overlapY <= 0) continue;
          const row = heightmap[Math.min(heightmap.length - 1, Math.max(0, sourceY))] ?? [];

          for (let sourceX = firstSourceX; sourceX <= lastSourceX; sourceX++) {
            const overlapX = Math.min(sourceRight, sourceX + 1) - Math.max(sourceLeft, sourceX);
            if (overlapX <= 0) continue;
            const weight = overlapX * overlapY;
            const rawHeight = row[Math.min(row.length - 1, Math.max(0, sourceX))] ?? 0;
            const heightIndex = Math.max(0, Math.min(palette.colours.length - 1, Math.round(rawHeight)));
            const colour =
              materialPalette && materials && palette.material[heightIndex]
                ? interpolateColour(
                    palette.colours[heightIndex],
                    materialPalette[getSurfaceMaterialIndex(materials, sourceX, sourceY)] ??
                      palette.colours[heightIndex],
                    materials.strength
                  )
                : palette.colours[heightIndex];
            red += colour.r * weight;
            green += colour.g * weight;
            blue += colour.b * weight;
            water += palette.liquid[heightIndex] * weight;
            totalWeight += weight;
          }
        }

        const divisor = Math.max(Number.EPSILON, totalWeight);
        const pixelIndex = targetY * BASE_TEXTURE_WIDTH + targetX;
        const colourIndex = pixelIndex * 3;
        colours[colourIndex] = red / divisor;
        colours[colourIndex + 1] = green / divisor;
        colours[colourIndex + 2] = blue / divisor;
        liquidCoverage[pixelIndex] = (water / divisor) * 255;
      }
    }

    return {
      width: BASE_TEXTURE_WIDTH,
      height: BASE_TEXTURE_HEIGHT,
      colours,
      liquidCoverage,
    };
  }

  /** Resolves every generated height level to its body-fixed display colour and liquid class. */
  private buildDisplayPalette(heightColours: string[], liquid: SurfaceLiquidOverlay | null): DisplayPalette {
    const fallback = '#88BBBB';
    const levelCount = Math.max(1, heightColours.length);
    const colours = new Array<RgbColour>(levelCount);
    const liquidLevels = new Uint8Array(levelCount);
    const materialLevels = new Uint8Array(levelCount);

    for (let height = 0; height < levelCount; height++) {
      if (liquid && height <= liquid.seaLevel) {
        colours[height] = hexToRgb(liquid.colour);
        liquidLevels[height] = 1;
        continue;
      }

      const vegetationColour = getCoastalVegetationColour(height, liquid);
      colours[height] = hexToRgb(vegetationColour ?? heightColours[height] ?? fallback);
      materialLevels[height] = vegetationColour ? 0 : 1;
    }

    return { colours, liquid: liquidLevels, material: materialLevels };
  }

  /** Builds progressively area-filtered levels for stable texture minification. */
  private buildMipChain(base: SolidOrbitTextureLevel): SolidOrbitTextureLevel[] {
    const levels = [base];
    let current = base;
    while (current.width > MIN_TEXTURE_WIDTH && current.height > MIN_TEXTURE_HEIGHT) {
      current = this.downsampleLevel(current);
      levels.push(current);
    }
    return levels;
  }

  /** Averages each wrapped 2x2 source footprint into one lower-resolution texel. */
  private downsampleLevel(source: SolidOrbitTextureLevel): SolidOrbitTextureLevel {
    const width = Math.max(MIN_TEXTURE_WIDTH, Math.floor(source.width / 2));
    const height = Math.max(MIN_TEXTURE_HEIGHT, Math.floor(source.height / 2));
    const colours = new Uint8ClampedArray(width * height * 3);
    const liquidCoverage = new Uint8ClampedArray(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const targetIndex = y * width + x;
        let red = 0;
        let green = 0;
        let blue = 0;
        let water = 0;
        for (let offsetY = 0; offsetY < 2; offsetY++) {
          const sourceY = Math.min(source.height - 1, y * 2 + offsetY);
          for (let offsetX = 0; offsetX < 2; offsetX++) {
            const sourceX = (x * 2 + offsetX) % source.width;
            const sourceIndex = sourceY * source.width + sourceX;
            const colourIndex = sourceIndex * 3;
            red += source.colours[colourIndex];
            green += source.colours[colourIndex + 1];
            blue += source.colours[colourIndex + 2];
            water += source.liquidCoverage[sourceIndex];
          }
        }
        const targetColourIndex = targetIndex * 3;
        colours[targetColourIndex] = red / 4;
        colours[targetColourIndex + 1] = green / 4;
        colours[targetColourIndex + 2] = blue / 4;
        liquidCoverage[targetIndex] = water / 4;
      }
    }

    return { width, height, colours, liquidCoverage };
  }

  /** Estimates the source-texel footprint of one projected globe pixel. */
  private calculateLod(
    levels: readonly SolidOrbitTextureLevel[],
    v: number,
    projectedDiameter: number,
    viewNormalZ: number
  ): number {
    const base = levels[0];
    // At disc centre the pinhole camera maps one pixel to this many radians.
    // The old half-hemisphere estimate overfiltered the central globe by ~2x.
    const radiansPerPixel =
      (2 * (ORBIT_CAMERA_DISTANCE - 1)) / (ORBIT_FOCAL_FACTOR * Math.max(1, projectedDiameter));
    const centreFootprint = (base.width * radiansPerPixel) / (2 * Math.PI);
    // Longitude texels crowd together toward the Mercator poles; perspective
    // stretches the footprint toward the limb. Both are bounded at the edge.
    const latitudeStretch = Math.min(4, Math.cosh((0.5 - v) * 2 * Math.PI));
    const footprint = (centreFootprint * latitudeStretch) / Math.max(1 / ORBIT_CAMERA_DISTANCE, viewNormalZ);
    return Math.max(0, Math.min(levels.length - 1, Math.log2(Math.max(1, footprint))));
  }

  /** Bilinearly samples one body-fixed texture level with wrapped longitude. */
  private sampleLevel(level: SolidOrbitTextureLevel, u: number, v: number): FilteredLevelSample {
    const wrappedX = this.wrapUnit(u) * level.width;
    const clampedY = Math.max(0, Math.min(1, v)) * (level.height - 1);
    const x0 = Math.floor(wrappedX) % level.width;
    const x1 = (x0 + 1) % level.width;
    const y0 = Math.floor(clampedY);
    const y1 = Math.min(level.height - 1, y0 + 1);
    const tx = wrappedX - Math.floor(wrappedX);
    const ty = clampedY - y0;
    const index00 = y0 * level.width + x0;
    const index10 = y0 * level.width + x1;
    const index01 = y1 * level.width + x0;
    const index11 = y1 * level.width + x1;

    return {
      r: this.sampleBilinearChannel(
        level.colours,
        index00 * 3,
        index10 * 3,
        index01 * 3,
        index11 * 3,
        tx,
        ty
      ),
      g: this.sampleBilinearChannel(
        level.colours,
        index00 * 3 + 1,
        index10 * 3 + 1,
        index01 * 3 + 1,
        index11 * 3 + 1,
        tx,
        ty
      ),
      b: this.sampleBilinearChannel(
        level.colours,
        index00 * 3 + 2,
        index10 * 3 + 2,
        index01 * 3 + 2,
        index11 * 3 + 2,
        tx,
        ty
      ),
      liquidCoverage:
        this.sampleBilinearChannel(level.liquidCoverage, index00, index10, index01, index11, tx, ty) / 255,
    };
  }

  /** Interpolates one numeric channel from four neighbouring texture values. */
  private sampleBilinearChannel(
    values: ArrayLike<number>,
    index00: number,
    index10: number,
    index01: number,
    index11: number,
    tx: number,
    ty: number
  ): number {
    const top = values[index00] * (1 - tx) + values[index10] * tx;
    const bottom = values[index01] * (1 - tx) + values[index11] * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** Wraps a normalized longitude into the unit interval. */
  private wrapUnit(value: number): number {
    return ((value % 1) + 1) % 1;
  }
}
