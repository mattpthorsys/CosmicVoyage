/* FILE: src/rendering/screen_buffer.ts */
// src/rendering/screen_buffer.ts (Added copyBufferFrom method)

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

  private isTransparent: boolean = false; // Flag for the buffer itself

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, isTransparent: boolean = false) {
    this.canvas = canvas;
    this.ctx = context;
    this.isTransparent = isTransparent; // Store if this buffer expects transparency

    this.defaultCellState = Object.freeze({
      char: null,
      fg: null,
      // Default background depends on whether the buffer is transparent
      bg: isTransparent ? CONFIG.TRANSPARENT_COLOUR : CONFIG.DEFAULT_BG_COLOUR,
      isTransparentBg: isTransparent, // Default transparency matches buffer type
    });
    this.defaultFgColor = CONFIG.DEFAULT_FG_COLOUR;
    // defaultBgColor also depends on the buffer's transparency setting
    this.defaultBgColor = isTransparent ? CONFIG.TRANSPARENT_COLOUR : CONFIG.DEFAULT_BG_COLOUR;

    logger.debug(`[ScreenBuffer] Instance created. isTransparent: ${this.isTransparent}, Default BG: ${this.defaultBgColor}`);
  }


  getCols(): number { return this.cols; }
  getRows(): number { return this.rows; }
  getCharWidthPx(): number { return this.charWidthPx; }
  getCharHeightPx(): number { return this.charHeightPx; }
  getDefaultFgColor(): string { return this.defaultFgColor; }
  getDefaultBgColor(): string { return this.defaultBgColor; }

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
    if (size > 2000000) { // Safety limit
      logger.error(
        `[ScreenBuffer.initBuffers] Excessive buffer size calculated: ${size}. Aborting buffer initialization.`
      );
      this.screenBuffer = [];
      this.newBuffer = [];
      this.cols = 0; // Reset dims
      this.rows = 0;
      return;
    }

    // Fill buffers with the appropriate default state (transparent or solid)
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

  /**
   * Resets the drawing buffers and optionally clears the physical canvas.
   * MODIFIED: Respects physicalClear flag better.
   */
  clear(physicalClear: boolean = true): void {
    logger.debug(
      `[ScreenBuffer.clear] Clearing buffers (Physical Clear: ${physicalClear})...`
    );
    if (physicalClear && this.canvas.width > 0 && this.canvas.height > 0) {
      // Clear the entire physical canvas area this buffer controls
      logger.debug(`[ScreenBuffer.clear] Physically clearing canvas area ${this.canvas.width}x${this.canvas.height}`);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Always reset both internal buffers to the default state
    const size = this.cols * this.rows;
    for (let i = 0; i < size; i++) {
       // Ensure index is within bounds, though size should match buffer lengths if initBuffers worked
       if (i < this.screenBuffer.length) {
           this.screenBuffer[i] = this.defaultCellState;
       }
       if (i < this.newBuffer.length) {
           this.newBuffer[i] = this.defaultCellState;
       }
    }
    if (this.newBuffer.length !== size || this.screenBuffer.length !== size) {
        logger.warn(`[ScreenBuffer.clear] Buffer length mismatch after clear. Grid: ${size}, Screen: ${this.screenBuffer.length}, New: ${this.newBuffer.length}`);
    }

    logger.debug('[ScreenBuffer.clear] Internal buffers reset to default state.');
  }


  /**
   * Sets a character in the new drawing buffer ('newBuffer') at grid position (x, y).
   * This stages the change; 'renderDiff' or 'renderFull' actually draws it to the canvas.
   */
  drawChar(
    char: string | null,
    x: number,
    y: number,
    fgColor: string | null = this.defaultFgColor,
    bgColor: string | null = this.defaultBgColor // Use buffer's default BG
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

    // Determine if the provided background implies transparency
    const isTransparentUpdate = (bgColor === null || bgColor === CONFIG.TRANSPARENT_COLOUR);
    // Use the provided background color, or fall back to the buffer's default background
    const finalBgColor = isTransparentUpdate ? CONFIG.TRANSPARENT_COLOUR : (bgColor || this.defaultBgColor);

    this.newBuffer[index] = {
      char: char || ' ', // Use space if char is null
      fg: fgColor || this.defaultFgColor, // Use default if fg is null
      bg: finalBgColor,
      isTransparentBg: isTransparentUpdate,
    };
  }

  /** Draws a string horizontally starting at (x, y) using drawChar. */
  drawString(
    text: string,
    x: number,
    y: number,
    fgColor: string | null = this.defaultFgColor,
    bgColor: string | null = this.defaultBgColor // Default to buffer's background
  ): void {
    // logger.debug(`[ScreenBuffer.drawString] Drawing "${text}" at [${x},${y}]`); // Can be noisy
    for (let i = 0; i < text.length; i++) {
      this.drawChar(text[i], x + i, y, fgColor, bgColor);
    }
  }

  /**
   * *** NEW METHOD ***
   * Copies the content of another ScreenBuffer's *rendered* state (screenBuffer)
   * into this buffer's *drawing* state (newBuffer).
   * Assumes dimensions match. Used for compositing layers.
   */
  copyBufferFrom(sourceBuffer: ScreenBuffer): void {
      if (this.cols !== sourceBuffer.getCols() || this.rows !== sourceBuffer.getRows()) {
          logger.error(`[ScreenBuffer.copyBufferFrom] Buffer dimension mismatch! Cannot copy. Target: ${this.cols}x${this.rows}, Source: ${sourceBuffer.getCols()}x${sourceBuffer.getRows()}`);
          return;
      }

      const size = this.cols * this.rows;
      const sourceScreen = sourceBuffer.screenBuffer; // Access internal array directly

      if (sourceScreen.length !== size || this.newBuffer.length !== size) {
           logger.error(`[ScreenBuffer.copyBufferFrom] Internal buffer length mismatch! Target: ${this.newBuffer.length}, Source: ${sourceScreen.length}, Expected: ${size}`);
           return;
      }

      logger.debug(`[ScreenBuffer.copyBufferFrom] Copying ${size} cells from source buffer.`);
      for (let i = 0; i < size; i++) {
          // Copy the state directly into the newBuffer for drawing
          // We copy the source's *screenBuffer* (last rendered state)
          this.newBuffer[i] = sourceScreen[i] || this.defaultCellState;
      }
  }


  /** Renders the entire content of the newBuffer to the canvas. */
  renderFull(): void {
      const startTime = performance.now();
      const size = this.cols * this.rows;
      if (size !== this.newBuffer.length || size === 0) {
          logger.error(
              `[ScreenBuffer.renderFull] Buffer size mismatch or zero size! Grid: ${size}, NewBuffer: ${this.newBuffer.length}. Cannot render full.`
          );
          return;
      }

      let cellsDrawn = 0;
      for (let i = 0; i < size; i++) {
          const newState = this.newBuffer[i];
          // No need to compare with old state, just draw what's in newBuffer
          const y = Math.floor(i / this.cols);
          const x = i % this.cols;

          // Draw the cell state
          this._physicalDrawChar(
              newState.char,
              x,
              y,
              newState.fg,
              newState.bg,
              newState.isTransparentBg,
              // When doing full render, the 'old' background concept is less relevant,
              // but provide the default buffer background for consistency if needed by transparency logic.
              this.defaultBgColor
          );
          cellsDrawn++;

          // Update screenBuffer to match what was just drawn
          this.screenBuffer[i] = newState;
          // Reset newBuffer cell ready for the next frame's drawing operations
          this.newBuffer[i] = this.defaultCellState;
      }

      const endTime = performance.now();
      // Reduce logging frequency if needed
      // if (cellsDrawn > 0) {
      //   logger.debug(
      //       `[ScreenBuffer.renderFull] Completed: ${cellsDrawn} cells drawn (full render) in ${(endTime - startTime).toFixed(2)} ms`
      //   );
      // }
  }


  /** Compares the new buffer to the screen buffer and draws only the changed cells to the canvas. */
  renderDiff(): void {
    // logger.debug('[ScreenBuffer.renderDiff] Comparing buffers and drawing changes...'); // Noisy
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
      ) {
           // Ensure newBuffer is still reset even if we skip drawing
           if (this.newBuffer[i] !== this.defaultCellState) {
               this.newBuffer[i] = this.defaultCellState;
           }
           continue;
      }

      // Check if cell state has actually changed
      if (
        oldState.char === newState.char &&
        oldState.fg === newState.fg &&
        oldState.bg === newState.bg &&
        oldState.isTransparentBg === newState.isTransparentBg
      ) {
        // State unchanged, just reset newBuffer cell for next frame's draw ops
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
        oldState.bg // Pass old background for transparency handling in _physicalDrawChar
      );
      cellsDrawn++;

      // Update screenBuffer to reflect the drawn state
      this.screenBuffer[i] = newState;
      // Reset newBuffer cell ready for the next frame
      this.newBuffer[i] = this.defaultCellState;
    }

    const endTime = performance.now();
    if (cellsDrawn > 0) {
      // logger.debug( // Can be noisy
      //   `[ScreenBuffer.renderDiff] Completed: ${cellsDrawn} cells drawn in ${(
      //     endTime - startTime
      //   ).toFixed(2)} ms`
      // );
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
    _oldBgColor: string | null // Keep param for signature compatibility
  ): void {
    const px = x * this.charWidthPx;
    const py = y * this.charHeightPx;

    // Determine the background colour to draw for this cell
    const drawBgColor = isTransparentBg ? CONFIG.TRANSPARENT_COLOUR : (bgColor || this.defaultBgColor);

    // Optimization: Only clearRect or fillRect if the background is NOT transparent *or* if there's a non-space foreground char.
    const charToDraw = char || ' '; // Treat null as space

    if (drawBgColor !== CONFIG.TRANSPARENT_COLOUR) {
        // Fill background rectangle first if it's not transparent
        this.ctx.fillStyle = drawBgColor;
        this.ctx.fillRect(px, py, this.charWidthPx, this.charHeightPx);
    } else if (charToDraw !== ' ') {
        // If background IS transparent, but we have a char, clear the area first
        this.ctx.clearRect(px, py, this.charWidthPx, this.charHeightPx);
    }
    // Else (transparent bg AND no char), do nothing for background.

    // If there's a non-space character to draw
    if (charToDraw !== ' ') {
      this.ctx.fillStyle = fgColor || this.defaultFgColor; // Set foreground colour
      // Draw the character
      this.ctx.fillText(charToDraw, px, py);
      // logger.debug(`Drew char '${char}' at px [${px}, ${py}]`); // Extremely noisy
    }
  }
}