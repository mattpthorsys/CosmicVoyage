// src/rendering/drawing_context.ts

import { ScreenBuffer } from './screen_buffer';
import { GLYPHS } from '../constants';
import { logger } from '../utils/logger';
import { CONFIG } from '@/config';

/** Provides higher-level drawing primitives using a ScreenBuffer. */
export class DrawingContext {
  private screenBuffer: ScreenBuffer;

  constructor(screenBuffer: ScreenBuffer) {
    this.screenBuffer = screenBuffer;
    logger.debug('[DrawingContext] Instance created.');
  }

  /** Draws a box with borders and optional fill. */
  drawBox(
    x: number,
    y: number,
    width: number,
    height: number,
    fgColor: string | null = this.screenBuffer.getDefaultBgColor(), // Use ScreenBuffer defaults
    bgColor: string | null = CONFIG.DEFAULT_BG_COLOUR, // Background for the border characters
    fillChar: string | null = ' ', // Character to fill the inside with
    fillFg: string | null = fgColor, // FG colour for the fill character
    fillBg: string | null = bgColor // BG colour for the fill area (often null/transparent)
  ): void {
    // logger.debug(`[DrawingContext.drawBox] Drawing box at [${x},${y}], size ${width}x${height}`); // Noisy
    const ex = x + width - 1;
    const ey = y + height - 1;

    for (let j = y; j <= ey; j++) {
      for (let i = x; i <= ex; i++) {
        if (i === x && j === y) {
          this.screenBuffer.drawChar(GLYPHS.BOX.TL, i, j, fgColor, bgColor);
        } else if (i === ex && j === y) {
          this.screenBuffer.drawChar(GLYPHS.BOX.TR, i, j, fgColor, bgColor);
        } else if (i === x && j === ey) {
          this.screenBuffer.drawChar(GLYPHS.BOX.BL, i, j, fgColor, bgColor);
        } else if (i === ex && j === ey) {
          this.screenBuffer.drawChar(GLYPHS.BOX.BR, i, j, fgColor, bgColor);
        } else if (j === y || j === ey) {
          this.screenBuffer.drawChar(GLYPHS.BOX.H, i, j, fgColor, bgColor);
        } else if (i === x || i === ex) {
          this.screenBuffer.drawChar(GLYPHS.BOX.V, i, j, fgColor, bgColor);
        } else if (fillChar !== null) {
          this.screenBuffer.drawChar(fillChar, i, j, fillFg, fillBg);
        }
      }
    }
  }

  /** Draws a filled circle using a specified character. */
  drawCircle(
    cx: number,
    cy: number,
    radius: number,
    char: string,
    fg: string | null,
    bg: string | null = fg // Default bg = fg for solid circle
  ): void {
    // logger.debug(`[DrawingContext.drawCircle] Drawing circle at [${cx},${cy}], radius ${radius}`); // Noisy
    if (radius < 0) return;
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    radius = Math.floor(radius);

    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        // Use <= for filled circle
        if (x * x + y * y <= radius * radius) {
          this.screenBuffer.drawChar(char, cx + x, cy + y, fg, bg);
        }
      }
    }
  }

  /** Draws an orbit outline using Midpoint Circle Algorithm, respecting bounds. */
  drawOrbit(
    cx: number,
    cy: number,
    radius: number,
    char: string,
    colour: string | null,
    minX: number = 0,
    minY: number = 0,
    maxX: number = this.screenBuffer.getCols() - 1,
    maxY: number = this.screenBuffer.getRows() - 1
  ): void {
    // logger.debug(`[DrawingContext.drawOrbit] Drawing orbit at [${cx},${cy}], radius ${radius}`); // Noisy
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    radius = Math.floor(radius);
    if (radius <= 0) return;

    let x = radius;
    let y = 0;
    let err = 1 - radius; // Initial error term

    // Helper to draw points symmetrically around the center
    const drawPoints = (px: number, py: number) => {
      const points = [
        { dx: px, dy: py }, { dx: -px, dy: py }, { dx: px, dy: -py }, { dx: -px, dy: -py },
        { dx: py, dy: px }, { dx: -py, dy: px }, { dx: py, dy: -px }, { dx: -py, dy: -px },
      ];
      points.forEach((p) => {
        const screenX = cx + p.dx;
        const screenY = cy + p.dy;
        // Check against provided bounds
        if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
          // Use null background for orbits to make them transparent overlays
          this.screenBuffer.drawChar(char, screenX, screenY, colour, '#000000');
        }
      });
    };

    // Midpoint circle algorithm iteration
    while (x >= y) {
      drawPoints(x, y);
      y++;
      if (err <= 0) {
        err += 2 * y + 1; // Move vertically
      } else {
        x--;
        err += 2 * (y - x) + 1; // Move diagonally
      }
    }
  }
}