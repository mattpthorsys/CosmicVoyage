import { CONFIG } from '../config';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { DeepSpacePhenomenonProperties, SystemMapProperties } from '../generation/system_data_generator';
import { dimHexColour, getRenderedStarCell } from './starfield';
import { getStellarDetectionRadii } from '../core/stellar_detection';
import { hexToRgb, interpolateColour, rgbToHex } from './colour';

export interface HyperspaceTile {
  bg: string;
  starChar: string | null;
  starColor: string | null;
  visibilityRadius?: number;
  rangeFaded?: boolean;
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

/** Blends range-limited contacts into the nebula with a flat slope at the detection boundary. */
function fadedContactColour(
  bg: string,
  source: string,
  rangeCells: number,
  radius: number,
  strength: number
): string {
  const proximity = Math.max(0, Math.min(1, 1 - rangeCells / radius));
  const opacity = proximity * proximity * (3 - 2 * proximity);
  const colour = interpolateColour(hexToRgb(bg), hexToRgb(dimHexColour(source, strength)), opacity);
  return rgbToHex(colour.r, colour.g, colour.b);
}

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
    const isPhotosphericStar =
      systemProps.objectKind === 'stellar' && /^[OBAFGKMW]/.test(systemProps.starType!);
    const star = getRenderedStarCell(systemProps.starType!, worldX, worldY);
    if (isPhotosphericStar) {
      return { bg, starChar: star.char, starColor: star.color };
    }

    const visibilityRadius = getStellarDetectionRadii(systemProps).statusRadius;
    if (rangeCells > visibilityRadius) {
      return {
        bg,
        starChar: null,
        starColor: null,
        visibilityRadius,
        rangeFaded: true,
      };
    }

    return {
      bg,
      starChar: star.char,
      starColor: fadedContactColour(bg, star.color, rangeCells, visibilityRadius, isBrownDwarf ? 0.75 : 1),
      visibilityRadius,
      rangeFaded: true,
    };
  }

  if (phenomenon?.exists && phenomenon.char && phenomenon.colour && phenomenon.type) {
    const isRoguePlanet = phenomenon.type === 'rogue-planet';
    const visibilityRadius = isRoguePlanet
      ? CONFIG.ROGUE_PLANET_VISIBILITY_RADIUS_CELLS
      : CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS;
    if (rangeCells > visibilityRadius)
      return {
        bg,
        starChar: null,
        starColor: null,
        visibilityRadius,
        rangeFaded: true,
      };
    const dimFactor =
      phenomenon.type === 'ancient-signal' ? 0.62 : phenomenon.type === 'neutron-star' ? 0.85 : 0.45;
    return {
      bg,
      starChar: phenomenon.char,
      starColor: fadedContactColour(bg, phenomenon.colour, rangeCells, visibilityRadius, dimFactor),
      visibilityRadius,
      rangeFaded: true,
    };
  }

  return { bg, starChar: null, starColor: null };
}
