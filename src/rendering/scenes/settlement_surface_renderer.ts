import {
  SETTLEMENT_APPEARANCES,
  type SettlementArchetype,
  type SurfaceSettlementLayer,
  type SurfaceSettlementSite,
} from '../../entities/planet/surface_settlements';
import { isLiquidCovered, type SurfaceLiquidOverlay } from '../../entities/planet/surface_liquid';
import { getSurfaceDisplayColour, type SurfaceMaterialMap } from '../../entities/planet/surface_material';
import { GLYPHS } from '../../constants/visual';
import { adjustBrightness, hexToRgb, interpolateColour, rgbToHex } from '../colour';
import type { ScreenBuffer } from '../screen_buffer';

type Motif = readonly string[];
type SettlementPalette = readonly [string, string, string, string];

interface SettlementVisualCell {
  readonly palette: SettlementPalette;
  readonly motif: Motif;
  readonly mediumMotif: Motif;
}

export interface PreparedSettlementVisuals {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly longitudePeriod: number;
  readonly sites: readonly SurfaceSettlementSite[];
  readonly cells: ReadonlyMap<number, SettlementVisualCell>;
}

interface SettlementVisualCache {
  readonly version: number;
  readonly map: number[][];
  readonly colours: string[];
  readonly liquid: SurfaceLiquidOverlay | null;
  readonly materials: SurfaceMaterialMap | null;
  readonly visuals: PreparedSettlementVisuals | null;
}

// These are regional symbols, not streets measured in metres. Transparent
// pixels retain natural terrain; four colours suggest roofs, pads and short links.
const MOTIFS: Record<SettlementArchetype, { small: Motif; medium: Motif; large: Motif }> = {
  urban: {
    small: ['12.', '11.', '.03'],
    medium: ['12.1', '11.3', '..00', '221.'],
    large: ['.1122.', '.1222.', '00..00', '..00..', '221.1.', '211.3.'],
  },
  sealed: {
    small: ['121', '1.1', '131'],
    medium: ['.11.', '1221', '1231', '.11.'],
    large: ['.1111.', '122221', '12..21', '12..21', '122231', '.1111.'],
  },
  industrial: {
    small: ['11.', '22.', '.03'],
    medium: ['..33', '1122', '1122', '..00'],
    large: ['1122..', '1122.3', '..00..', '221100', '2211..', '...33.'],
  },
};
const COMPACT_MOTIF: Motif = ['12', '13'];
const MAP_MOTIFS: Record<SettlementArchetype, Motif> = {
  urban: ['.2.', '121', '1.1'],
  sealed: ['111', '121', '111'],
  industrial: ['12.', '111', '.21'],
};

/** Wraps a longitude index without joining the two latitude boundaries. */
function wrapLongitude(x: number, period: number): number {
  return ((x % period) + period) % period;
}

/** Matches the landing cursor's integer native coordinates and duplicated longitude endpoint. */
export function projectSettlementLandingSite(
  site: Pick<SurfaceSettlementSite, 'x' | 'y'>,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number
): { x: number; y: number } {
  const nativeX = wrapLongitude(Math.floor(site.x), sourceWidth - 1);
  return {
    x: Math.floor((nativeX / sourceWidth) * width),
    y: Math.round((Math.floor(site.y) / (sourceHeight - 1)) * (height - 1)),
  };
}

/** Rotates a library motif once during preparation, keeping its orientation fixed to the ground. */
function rotateMotif(motif: Motif, turns: number): Motif {
  let result = [...motif];
  for (let turn = 0; turn < turns; turn++) {
    result = result.map((_, y) =>
      result
        .map((row) => row[y])
        .reverse()
        .join('')
    );
  }
  return result;
}

/** Blends structures into their existing local material, retaining four restrained pixel colours. */
function settlementPalette(terrainColour: string, archetype: SettlementArchetype): SettlementPalette {
  const terrain = hexToRgb(terrainColour);
  const appearance = SETTLEMENT_APPEARANCES[archetype];
  const roof = interpolateColour(terrain, hexToRgb(appearance.albedoColour), 0.65);
  const road = adjustBrightness(interpolateColour(terrain, roof, 0.4), 0.55);
  const shadow = adjustBrightness(roof, 0.65);
  const signal = interpolateColour(roof, hexToRgb(appearance.lightColour), 0.55);
  const palette = [road, shadow, roof, signal].map((colour) => rgbToHex(colour.r, colour.g, colour.b));
  return [palette[0], palette[1], palette[2], palette[3]];
}

/** Caches regional artwork and projects shared city sites onto the existing terrain views. */
export class SettlementSurfaceRenderer {
  private readonly cache = new WeakMap<SurfaceSettlementLayer, SettlementVisualCache>();

  /** Prepares sparse decoration outside drawing loops; terrain and generated settlement data stay immutable. */
  prepare(
    layer: SurfaceSettlementLayer | null,
    map: number[][],
    colours: string[],
    liquid: SurfaceLiquidOverlay | null,
    materials: SurfaceMaterialMap | null = null
  ): PreparedSettlementVisuals | null {
    if (!layer) return null;
    const previous = this.cache.get(layer);
    if (
      previous?.version === layer.version &&
      previous.map === map &&
      previous.colours === colours &&
      previous.liquid === liquid &&
      previous.materials === materials
    )
      return previous.visuals;

    const width = map[0]?.length ?? 0;
    const height = map.length;
    let visuals: PreparedSettlementVisuals | null = null;
    if (
      width > 2 &&
      height > 2 &&
      layer.sourceWidth === width &&
      layer.sourceHeight === height &&
      layer.longitudePeriod === width - 1
    ) {
      const validSites = new Set<number>();
      const sites = layer.sites.filter((site, index) => {
        if (!Number.isFinite(site.x) || !Number.isFinite(site.y)) return false;
        const x = wrapLongitude(Math.floor(site.x), layer.longitudePeriod);
        const ground = map[Math.floor(site.y)]?.[x];
        if (ground === undefined || !Number.isFinite(ground) || isLiquidCovered(ground, liquid)) return false;
        validSites.add(index);
        return true;
      });
      const cells = new Map<number, SettlementVisualCell>();
      for (const cell of layer.cells) {
        if (
          !validSites.has(cell.siteIndex) ||
          !(cell.coverage > 0) ||
          !Number.isInteger(cell.x) ||
          !Number.isInteger(cell.y) ||
          cell.x < 0 ||
          cell.x >= layer.longitudePeriod
        )
          continue;
        const ground = map[cell.y]?.[cell.x];
        if (ground === undefined || !Number.isFinite(ground) || isLiquidCovered(ground, liquid)) continue;
        const site = layer.sites[cell.siteIndex];
        const core =
          cell.x === wrapLongitude(Math.floor(site.x), layer.longitudePeriod) &&
          cell.y === Math.floor(site.y);
        if (!core && cell.coverage < 0.02) continue;
        const motifs = MOTIFS[site.archetype];
        // Stable coordinates select library orientations without touching any world PRNG.
        const turns = (cell.x * 13 + cell.y * 7 + cell.siteIndex * 11) % 4;
        const motif =
          cell.coverage >= 0.6 ? motifs.large : core || cell.coverage >= 0.15 ? motifs.medium : motifs.small;
        cells.set(cell.y * layer.longitudePeriod + cell.x, {
          palette: settlementPalette(
            getSurfaceDisplayColour(ground, colours, liquid, materials, cell.x, cell.y),
            site.archetype
          ),
          motif: rotateMotif(motif, turns),
          mediumMotif: rotateMotif(motifs.medium, turns),
        });
      }
      if (cells.size)
        visuals = {
          sourceWidth: width,
          sourceHeight: height,
          longitudePeriod: layer.longitudePeriod,
          sites,
          cells,
        };
    }
    this.cache.set(layer, { version: layer.version, map, colours, liquid, materials, visuals });
    return visuals;
  }

  /** Adds navigation-scale settlement symbols only when the cached landing raster is rebuilt. */
  paintLandingMap(visuals: PreparedSettlementVisuals, raster: string[], width: number, height: number): void {
    if (width < 1 || height < 1) return;
    const centres = new Set<number>();
    for (const site of visuals.sites) {
      const centre = projectSettlementLandingSite(
        site,
        visuals.sourceWidth,
        visuals.sourceHeight,
        width,
        height
      );
      const key = centre.y * width + centre.x;
      // Co-located sites at this resolution share one marker; do not shift their coordinates.
      if (centres.has(key)) continue;
      centres.add(key);
      const appearance = SETTLEMENT_APPEARANCES[site.archetype];
      const motif = width < 3 || height < 3 ? ['2'] : MAP_MOTIFS[site.archetype];
      const half = Math.floor(motif.length / 2);
      for (let dy = 0; dy < motif.length; dy++) {
        const y = centre.y + dy - half;
        if (y < 0 || y >= height) continue;
        for (let dx = 0; dx < motif[dy].length; dx++) {
          const pixel = motif[dy][dx];
          if (pixel === '.') continue;
          const x = wrapLongitude(centre.x + dx - half, width);
          raster[y * width + x] = pixel === '2' ? appearance.lightColour : appearance.albedoColour;
        }
      }
    }
  }

  /** Draws prepared half-cell motifs within their native terrain cells and the travel viewport. */
  drawSurface(
    buffer: ScreenBuffer,
    visuals: PreparedSettlementVisuals,
    viewport: { x: number; y: number; width: number; height: number },
    startMapX: number,
    startMapY: number,
    cellScale: number
  ): void {
    const pixelsPerCell = Math.max(2, Math.floor(cellScale * 2));
    for (let row = 0; row * cellScale < viewport.height; row++) {
      const y = startMapY + row;
      if (y < 0 || y >= visuals.sourceHeight) continue;
      for (let col = 0; col * cellScale < viewport.width; col++) {
        // Surface movement wraps the full map width, including its duplicated last column.
        const mapX = wrapLongitude(startMapX + col, visuals.sourceWidth);
        const x = mapX === visuals.longitudePeriod ? 0 : mapX;
        const cell = visuals.cells.get(y * visuals.longitudePeriod + x);
        if (!cell) continue;
        const motif =
          pixelsPerCell < 4
            ? COMPACT_MOTIF
            : pixelsPerCell < cell.motif.length
              ? cell.mediumMotif
              : cell.motif;
        const inset = Math.floor((pixelsPerCell - motif.length) / 2) * 0.5;
        for (let dy = 0; dy < motif.length; dy++) {
          const screenY = viewport.y + row * cellScale + inset + dy * 0.5;
          if (screenY + 0.5 > viewport.y + viewport.height) continue;
          for (let dx = 0; dx < motif[dy].length; dx++) {
            const pixel = motif[dy][dx];
            if (pixel === '.') continue;
            const screenX = viewport.x + col * cellScale + inset + dx * 0.5;
            if (screenX + 0.5 > viewport.x + viewport.width) continue;
            const colour = cell.palette[Number(pixel)];
            buffer.drawScaledChar(GLYPHS.BLOCK, screenX, screenY, colour, colour, 0.5, 0.5);
          }
        }
      }
    }
  }
}
