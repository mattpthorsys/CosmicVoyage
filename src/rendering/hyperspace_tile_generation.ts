import { CONFIG } from '../config';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { DeepSpacePhenomenonProperties, SystemMapProperties } from '../generation/system_data_generator';
import { dimHexColour, getRenderedStarCell } from './starfield';

export interface HyperspaceTile {
  bg: string;
  starChar: string | null;
  starColor: string | null;
}

export interface HyperspaceTileRequest {
  worldX: number;
  worldY: number;
  rangeCells: number;
}

export interface HyperspaceTileSample extends HyperspaceTileRequest {
  tile: HyperspaceTile;
}

type TileSystemProps = Pick<SystemMapProperties, 'exists' | 'starType' | 'objectKind'>;
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
    const dimFactor =
      phenomenon.type === 'ancient-signal' ? 0.62 : phenomenon.type === 'neutron-star' ? 0.85 : 0.45;
    return { bg, starChar: phenomenon.char, starColor: dimHexColour(phenomenon.colour, dimFactor) };
  }

  return { bg, starChar: null, starColor: null };
}
