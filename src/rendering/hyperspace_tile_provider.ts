import { CONFIG } from '../config';
import { SPECTRAL_TYPES } from '../constants';
import { HyperspaceSurveyCell } from '../core/hyperspace_survey';
import {
  DeepSpacePhenomenonProperties,
  SystemDataGenerator,
  SystemMapProperties,
} from '../generation/system_data_generator';
import { logger } from '../utils/logger';
import { NebulaRenderer } from './nebula_renderer';
import { dimHexColour, getRenderedStarCell } from './starfield';

export interface HyperspaceTile {
  bg: string;
  starChar: string | null;
  starColor: string | null;
}

type TileSystemProps = Pick<SystemMapProperties, 'exists' | 'starType' | 'objectKind'>;
type TilePhenomenonProps = Pick<DeepSpacePhenomenonProperties, 'exists' | 'char' | 'colour' | 'type'>;

/** Builds and caches complete hyperspace cells from survey, nebula, and starfield data. */
export class HyperspaceTileProvider {
  private readonly tileCache: Map<string, HyperspaceTile> = new Map();
  private readonly maxTileCacheSize = 60000;

  constructor(
    private readonly nebulaRenderer: NebulaRenderer,
    private readonly systemDataGenerator: SystemDataGenerator
  ) {}

  clearCache(): void {
    this.tileCache.clear();
  }

  prefetchBackgroundRegion(startWorldX: number, startWorldY: number, cols: number, rows: number, margin = 0): void {
    this.nebulaRenderer.prefetchRegion(startWorldX, startWorldY, cols, rows, margin);
  }

  getTile(worldX: number, worldY: number, rangeCells: number): HyperspaceTile {
    const key = this.getTileKey(worldX, worldY, rangeCells);
    const cached = this.tileCache.get(key);
    if (cached) return cached;

    const bg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);
    const system = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
    const phenomenon = system.exists
      ? null
      : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
    return this.cacheTile(key, this.createTile(bg, system, phenomenon, worldX, worldY, rangeCells));
  }

  getTileFromSurveyCell(cell: HyperspaceSurveyCell): HyperspaceTile {
    const key = this.getTileKey(cell.worldX, cell.worldY, cell.rangeCells);
    const cached = this.tileCache.get(key);
    if (cached) return cached;

    const bg = this.nebulaRenderer.getBackgroundColor(cell.worldX, cell.worldY);
    return this.cacheTile(
      key,
      this.createTile(bg, cell.system, cell.phenomenon, cell.worldX, cell.worldY, cell.rangeCells)
    );
  }

  private createTile(
    bg: string,
    systemProps: TileSystemProps,
    phenomenon: TilePhenomenonProps | null,
    worldX: number,
    worldY: number,
    rangeCells: number
  ): HyperspaceTile {
    if (systemProps.exists) {
      const starInfo = SPECTRAL_TYPES[systemProps.starType!];
      if (!starInfo) {
        logger.error(`[HyperspaceTileProvider] Could not find star info for "${systemProps.starType}" at [${worldX}, ${worldY}].`);
        return { bg, starChar: '?', starColor: '#FF00FF' };
      }

      const isBrownDwarf = systemProps.objectKind === 'brown-dwarf';
      if (isBrownDwarf && rangeCells > CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS) {
        return { bg, starChar: null, starColor: null };
      }

      const star = getRenderedStarCell(systemProps.starType!, worldX, worldY);
      return {
        bg,
        starChar: star.char,
        starColor: isBrownDwarf ? dimHexColour(star.color, rangeCells <= 12 ? 0.75 : 0.42) : star.color,
      };
    }

    if (
      phenomenon?.exists &&
      phenomenon.char &&
      phenomenon.colour &&
      rangeCells <= CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS
    ) {
      const dimFactor = phenomenon.type === 'ancient-signal' ? 0.62 : phenomenon.type === 'neutron-star' ? 0.85 : 0.45;
      return { bg, starChar: phenomenon.char, starColor: dimHexColour(phenomenon.colour, dimFactor) };
    }

    return { bg, starChar: null, starColor: null };
  }

  private cacheTile(key: string, tile: HyperspaceTile): HyperspaceTile {
    if (this.tileCache.size >= this.maxTileCacheSize) {
      const firstKey = this.tileCache.keys().next().value;
      if (firstKey !== undefined) this.tileCache.delete(firstKey);
    }
    this.tileCache.set(key, tile);
    return tile;
  }

  private getTileKey(worldX: number, worldY: number, rangeCells: number): string {
    return `${worldX},${worldY}|${Math.floor(rangeCells)}`;
  }
}

