// src/rendering/screen_buffer.ts

import { CONFIG } from '../config';
import { logger } from '../utils/logger';

/** Represents the state of a single character cell on the screen buffer. */
export interface CellState {
  char: string | null; // Character to display (' ' or null for empty)
  fg: string | null; // Hex colour string or null for default
  bg: string | null; // Hex colour string or null for transparent/default
  isTransparentBg: boolean; // Flag if background should be transparent
}

/** Manages the character grid buffers and physical drawing to the canvas. */
export class ScreenBuffer {
  
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // Character grid dimensions
  private charWidthPx: number = 0;
  private charHeightPx: number = 0;
  private cols: number = 0;
  private rows: number = 0;

  // Screen buffers: Double buffer strategy for efficient rendering
  private screenBuffer: CellState[] = []; // Represents what's currently drawn on the canvas
  private newBuffer: CellState[] = []; // Represents the desired state for the next frame

  private readonly defaultCellState: Readonly<CellState>; // Template for empty/default cells
  private readonly defaultBgColor: string;
  private readonly defaultFgColor: string;

  private isTransparent = false;

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, isTransparent: boolean = false) {
    this.canvas = canvas;
    this.ctx = context;


    this.defaultCellState = Object.freeze({
      char: null,
      fg: null,
      bg: null, // Transparent by default
      isTransparentBg: true, // Transparent by default
    });

    if(isTransparent)
      this.isTransparent = true;

    this.defaultFgColor = CONFIG.DEFAULT_FG_COLOUR;
    this.defaultBgColor = this.isTransparent ? CONFIG.TRANSPARENT_COLOUR : CONFIG.DEFAULT_BG_COLOUR;

    logger.debug('[ScreenBuffer] Instance created.');
  }

  getCols(): number {
    return this.cols;
  }

  getRows(): number {
    return this.rows;
  }

  getCharWidthPx(): number {
    return this.charWidthPx;
  }

  getCharHeightPx(): number {
    return this.charHeightPx;
  }

  getDefaultFgColor() {
    return this.defaultFgColor;
  }

  getDefaultBgColor(): string {
    return this.defaultBgColor;
  }

  /** Initializes or re-initializes the screen buffers based on current dimensions. */
  initBuffers(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    const size = this.cols * this.rows;

    if (size <= 0 || !Number.isFinite(size)) {
      logger.warn(
        `[ScreenBuffer.initBuffers] Called with invalid dimensions: ${this.cols}x${this.rows}. Cannot initialize buffers.`
      );
      this.screenBuffer = [];
      this.newBuffer = [];
      return;
    }
    logger.info(
      `[ScreenBuffer.initBuffers] Initializing buffers for ${this.cols}x${this.rows} grid (${size} cells)`
    );

    if (size > 2000000) {
      // Safety limit
      logger.error(
        `[ScreenBuffer.initBuffers] Excessive buffer size calculated: ${size}. Aborting buffer initialization.`
      );
      this.screenBuffer = [];
      this.newBuffer = [];
      this.cols = 0; // Reset dims
      this.rows = 0;
      return;
    }

    this.screenBuffer = new Array(size).fill(this.defaultCellState);
    this.newBuffer = new Array(size).fill(this.defaultCellState);
    logger.debug('[ScreenBuffer.initBuffers] Buffers initialized.');
  }

  /** Updates the character grid dimensions and font settings. */
  updateDimensions(
    cols: number,
    rows: number,
    charWidth: number,
    charHeight: number
  ): void {
    const resized = this.cols !== cols || this.rows !== rows;
    this.cols = cols;
    this.rows = rows;
    this.charWidthPx = charWidth;
    this.charHeightPx = charHeight;

    // Update canvas context font settings
    this.ctx.font = `${this.charHeightPx}px ${CONFIG.FONT_FAMILY}`;
    this.ctx.textBaseline = 'top';

    if (resized) {
      logger.info(
        `[ScreenBuffer.updateDimensions] Dimensions updated: Grid=${this.cols}x${
          this.rows
        }, CharSize=${this.charWidthPx.toFixed(1)}x${this.charHeightPx.toFixed(
          1
        )}px`
      );
      this.initBuffers(this.cols, this.rows); // Reinitialize buffers if size changed
    } else {
      logger.debug(
        `[ScreenBuffer.updateDimensions] CharSize updated: ${this.charWidthPx.toFixed(
          1
        )}x${this.charHeightPx.toFixed(1)}px (Grid size unchanged)`
      );
    }
  }

  /** Resets the drawing buffers and optionally clears the physical canvas. */
  clear(physicalClear: boolean = true): void {
    logger.debug(
      `[ScreenBuffer.clear] Clearing buffers (Physical Clear: ${physicalClear})...`
    );
    // Reset both buffers to the default state
    for (let i = 0; i < this.newBuffer.length; i++) {
      if (i < this.screenBuffer.length) {
        this.screenBuffer[i] = this.defaultCellState;
      }
      this.newBuffer[i] = this.defaultCellState;
    }
    logger.info('[ScreenBuffer.clear] Drawing buffers reset to default state.');
  }

  /**
   * Sets a character in the new drawing buffer ('newBuffer') at grid position (x, y).
   * This stages the change; 'renderDiff' actually draws it to the canvas.
   */
  drawChar(
    char: string | null,
    x: number,
    y: number,
    fgColor: string | null = this.defaultFgColor,
    bgColor: string | null = null // null BG means transparent
  ): void {
    x = Math.floor(x);
    y = Math.floor(y);

    // Bounds check
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
      // logger.debug(`[ScreenBuffer.drawChar] Attempted draw out of bounds: [${x}, ${y}]`); // Noisy
      return;
    }

    const index = y * this.cols + x;
    if (index < 0 || index >= this.newBuffer.length) {
      logger.warn(
        `[ScreenBuffer.drawChar] Buffer index out of bounds: [${x}, ${y}] -> Index ${index} (Buffer Size: ${this.newBuffer.length})`
      );
      return;
    }

    const isTransparent = bgColor ? false : true;

    const finalBgColor = isTransparent ? CONFIG.TRANSPARENT_COLOUR : bgColor || this.defaultBgColor;

    this.newBuffer[index] = {
      char: char || ' ', // Use space if char is null
      fg: fgColor || this.defaultFgColor, // Use default if fg is null
      bg: finalBgColor,
      isTransparentBg: isTransparent,
    };
  }

  /** Draws a string horizontally starting at (x, y) using drawChar. */
  drawString(
    text: string,
    x: number,
    y: number,
    fgColor: string | null = this.defaultFgColor,
    bgColor: string | null = null // Default to transparent background for strings
  ): void {
    // logger.debug(`[ScreenBuffer.drawString] Drawing "${text}" at [${x},${y}]`); // Can be noisy
    for (let i = 0; i < text.length; i++) {
      this.drawChar(text[i], x + i, y, fgColor, bgColor);
    }
  }

  /** Compares the new buffer to the screen buffer and draws only the changed cells to the canvas. */
  renderDiff(): void {
    // logger.debug('[ScreenBuffer.renderDiff] Comparing buffers and drawing changes...'); // Noisy unless debugging render
    let cellsDrawn = 0;
    const size = this.cols * this.rows;

    if (
      size !== this.newBuffer.length ||
      size !== this.screenBuffer.length ||
      size === 0
    ) {
      logger.error(
        `[ScreenBuffer.renderDiff] Buffer size mismatch or zero size! Grid: ${this.cols}x${this.rows} (${size}), ScreenBuffer: ${this.screenBuffer.length}, NewBuffer: ${this.newBuffer.length}. Cannot render diff.`
      );
      // Attempting recovery by reinitializing might cause issues if called rapidly.
      // It's better to prevent rendering this frame and let fitToScreen handle recovery.
      return;
    }

    const startTime = performance.now();

    for (let i = 0; i < size; i++) {
      const oldState = this.screenBuffer[i];
      const newState = this.newBuffer[i];

      // Optimization: Skip if both are default state
      if (
        oldState === this.defaultCellState &&
        newState === this.defaultCellState
      )
        continue;

      // Check if cell state has actually changed
      if (
        oldState.char === newState.char &&
        oldState.fg === newState.fg &&
        oldState.bg === newState.bg &&
        oldState.isTransparentBg === newState.isTransparentBg
      ) {
        // State unchanged, reset newBuffer cell for next frame's draw ops
        this.newBuffer[i] = this.defaultCellState;
        continue;
      }

      // State differs, draw the new state
      const y = Math.floor(i / this.cols);
      const x = i % this.cols;
      this._physicalDrawChar(
        newState.char,
        x,
        y,
        newState.fg,
        newState.bg,
        newState.isTransparentBg,
        oldState.bg // Pass old background for transparency handling
      );
      cellsDrawn++;

      // Update screenBuffer to reflect the drawn state
      this.screenBuffer[i] = newState;
      // Reset newBuffer cell ready for the next frame
      this.newBuffer[i] = this.defaultCellState;
    }

    const endTime = performance.now();
    if (cellsDrawn > 0) {
      logger.debug(
        `[ScreenBuffer.renderDiff] Completed: ${cellsDrawn} cells drawn in ${(
          endTime - startTime
        ).toFixed(2)} ms`
      );
    }
  }

  /** Physically draws a single character to the canvas context. Internal helper. */
  private _physicalDrawChar(
    char: string | null,
    x: number, // Grid coordinates
    y: number, // Grid coordinates
    fgColor: string | null,
    bgColor: string | null,
    isTransparentBg: boolean,
    oldBgColor: string | null // Background colour currently on canvas at this cell
  ): void {
    const px = x * this.charWidthPx;
    const py = y * this.charHeightPx;

    // Determine the background colour to draw
    // If new background is transparent, use the OLD background colour (or default)
    // If new background is solid, use the new background colour (or default)
    const drawBgColor = isTransparentBg
      ? oldBgColor || this.defaultBgColor
      : bgColor || this.defaultBgColor;

    // Fill background rectangle first
    this.ctx.fillStyle = drawBgColor;
    this.ctx.fillRect(px, py, this.charWidthPx, this.charHeightPx);

    // If there's a character to draw (and it's not just a space for clearing)
    if (char && char !== ' ') {
      this.ctx.fillStyle = fgColor || this.defaultFgColor; // Set foreground colour
      // Draw the character
      // Adjustments might be needed based on font metrics if alignment looks off
      this.ctx.fillText(char, px, py);
      // logger.debug(`Drew char '${char}' at px [${px}, ${py}]`); // Extremely noisy
    }
  }
}