import { CONFIG } from '../config';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { DeepSpacePhenomenonProperties, SystemMapProperties } from '../generation/system_data_generator';
import { dimHexColour, getRenderedStarCell } from './starfield';
import { getStellarDetectionRadii } from '../core/stellar_detection';

export interface HyperspaceTile {
  bg: string;
  starChar: string | null;
  starColor: string | null;
  visibilityRadius?: number;
  detailRadius?: number;
}

export interface HyperspaceTileRequest {
  worldX: number;
  worldY: number;
  rangeCells: number;
}

export interface HyperspaceTileSample extends HyperspaceTileRequest {
  tile: HyperspaceTile;
}

type TileSystemProps = Pick<SystemMapProperties, 'exists' | 'starType' | 'objectKind' | 'stellarEvolution'>;
type TilePhenomenonProps = Pick<DeepSpacePhenomenonProperties, 'exists' | 'char' | 'colour' | 'type'>;

/** Composes final display data for one hyperspace cell from generated domain properties. */
export function createHyperspaceTile(
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
      return { bg, starChar: '?', starColor: '#FF00FF' };
    }

    const isBrownDwarf = systemProps.objectKind === 'brown-dwarf';
    const visibilityRadius = getStellarDetectionRadii(systemProps).statusRadius;
    const detailRadius = isBrownDwarf
      ? Math.min(CONFIG.HYPERSPACE_NEAR_DETAIL_RADIUS_CELLS, visibilityRadius * 0.5)
      : undefined;
    if (rangeCells > visibilityRadius) {
      return { bg, starChar: null, starColor: null, visibilityRadius, detailRadius };
    }

    const star = getRenderedStarCell(systemProps.starType!, worldX, worldY);
    return {
      bg,
      starChar: star.char,
      starColor: isBrownDwarf
        ? dimHexColour(star.color, rangeCells <= detailRadius! ? 0.75 : 0.42)
        : star.color,
      visibilityRadius,
      detailRadius,
    };
  }

  if (phenomenon?.exists && phenomenon.char && phenomenon.colour && phenomenon.type) {
    const visibilityRadius = CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS;
    if (rangeCells > visibilityRadius) return { bg, starChar: null, starColor: null, visibilityRadius };
    const dimFactor =
      phenomenon.type === 'ancient-signal' ? 0.62 : phenomenon.type === 'neutron-star' ? 0.85 : 0.45;
    return {
      bg,
      starChar: phenomenon.char,
      starColor: dimHexColour(phenomenon.colour, dimFactor),
      visibilityRadius,
    };
  }

  return { bg, starChar: null, starColor: null };
}
