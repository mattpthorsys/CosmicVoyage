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

/** Blends faint contacts into the real nebula background until they are close enough to resolve. */
function fadedContactColour(
  bg: string,
  source: string,
  rangeCells: number,
  radius: number,
  strength: number
): string {
  const proximity = Math.max(0, 1 - rangeCells / radius) ** 1.5;
  const colour = interpolateColour(hexToRgb(bg), hexToRgb(dimHexColour(source, strength)), proximity);
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
    const visibilityRadius = getStellarDetectionRadii(systemProps).statusRadius;
    if (rangeCells > visibilityRadius) {
      return {
        bg,
        starChar: null,
        starColor: null,
        visibilityRadius,
        ...(isBrownDwarf ? { rangeFaded: true } : {}),
      };
    }

    const star = getRenderedStarCell(systemProps.starType!, worldX, worldY);
    return {
      bg,
      starChar: star.char,
      starColor: isBrownDwarf
        ? fadedContactColour(bg, star.color, rangeCells, visibilityRadius, 0.75)
        : star.color,
      visibilityRadius,
      ...(isBrownDwarf ? { rangeFaded: true } : {}),
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
        ...(isRoguePlanet ? { rangeFaded: true } : {}),
      };
    const dimFactor =
      phenomenon.type === 'ancient-signal' ? 0.62 : phenomenon.type === 'neutron-star' ? 0.85 : 0.45;
    return {
      bg,
      starChar: phenomenon.char,
      starColor: isRoguePlanet
        ? fadedContactColour(bg, phenomenon.colour, rangeCells, visibilityRadius, dimFactor)
        : dimHexColour(phenomenon.colour, dimFactor),
      visibilityRadius,
      ...(isRoguePlanet ? { rangeFaded: true } : {}),
    };
  }

  return { bg, starChar: null, starColor: null };
}
