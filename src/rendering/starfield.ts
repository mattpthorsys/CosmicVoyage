import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_DISTRIBUTION, SPECTRAL_TYPES } from '../constants';
import { fastHash } from '../utils/hash';
import { PRNG } from '../utils/prng';
import { adjustBrightness, hexToRgb, rgbToHex } from './colour';

export interface StarfieldCell {
  x: number;
  y: number;
  char: string;
  color: string;
}

export function getRenderedStarCell(starType: string, worldX: number, worldY: number): { char: string; color: string } {
  const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES['G'];
  const hash = fastHash(worldX, worldY, 0);
  const brightnessFactor = 1.0 + ((hash % 100) / 500.0 - 0.1);
  const starBaseRgb = hexToRgb(starInfo.colour);
  const finalStarRgb = adjustBrightness(starBaseRgb, brightnessFactor);
  return {
    char: starInfo.char,
    color: rgbToHex(finalStarRgb.r, finalStarRgb.g, finalStarRgb.b),
  };
}

export function dimHexColour(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

export function createSystemTravelStarfield(
  cols: number,
  rows: number,
  systemX: number,
  systemY: number
): StarfieldCell[] {
  const cells: StarfieldCell[] = [];
  if (cols <= 0 || rows <= 0) return cells;

  const baseSeed = `${CONFIG.SEED}_star_background`;
  const basePrng = new PRNG(baseSeed);
  CONFIG.STAR_BACKGROUND_LAYERS.forEach((layer, layerIndex) => {
    const viewOffsetX = Math.floor((systemX * layer.factor) / layer.scale);
    const viewOffsetY = Math.floor((systemY * layer.factor) / layer.scale);
    const density = layer.density * 1.35;
    const dimFactor = layerIndex === 0 ? 0.26 : 0.18;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const fieldX = x + viewOffsetX;
        const fieldY = y + viewOffsetY;
        const cellPrng = basePrng.seedNew(`${baseSeed}_main_${layerIndex}_${fieldX}_${fieldY}`);
        if (cellPrng.random() < density) {
          const starType = cellPrng.choice(SPECTRAL_DISTRIBUTION)!;
          const star = getRenderedStarCell(starType, fieldX, fieldY);
          cells.push({ x, y, char: GLYPHS.STAR_DIM, color: dimHexColour(star.color, dimFactor) });
        }
      }
    }
  });

  return cells;
}
