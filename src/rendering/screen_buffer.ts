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

export interface RenderStats {
  mode: 'full' | 'diff';
  cellsDrawn: number;
  backgroundsDrawn: number;
  glyphsDrawn: number;
  durationMs: number;
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
  private lastRenderStats: RenderStats = {
    mode: 'full',
    cellsDrawn: 0,
    backgroundsDrawn: 0,
    glyphsDrawn: 0,
    durationMs: 0,
  };

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
  getLastRenderStats(): RenderStats { return { ...this.lastRenderStats }; }

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

  /** Resets staging state and optionally clears the rendered state and physical canvas. */
  clear(physicalClear: boolean = true): void {
    logger.debug(
      `[ScreenBuffer.clear] Clearing buffers (Physical Clear: ${physicalClear})...`
    );
    if (physicalClear && this.canvas.width > 0 && this.canvas.height > 0) {
      // Clear the entire physical canvas area this buffer controls
      logger.debug(`[ScreenBuffer.clear] Physically clearing canvas area ${this.canvas.width}x${this.canvas.height}`);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Reset the staging buffer every frame. Only reset the rendered-state buffer
    // when the physical canvas is also cleared, otherwise diff rendering loses its baseline.
    const size = this.cols * this.rows;
    for (let i = 0; i < size; i++) {
       if (physicalClear && i < this.screenBuffer.length) {
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

  /** Replaces the staged drawing buffer with a complete precomputed frame. */
  stageCells(cells: readonly CellState[]): void {
    const size = this.cols * this.rows;
    if (cells.length !== size || this.newBuffer.length !== size) {
      logger.error(
        `[ScreenBuffer.stageCells] Buffer size mismatch. Grid: ${size}, Cells: ${cells.length}, New: ${this.newBuffer.length}`
      );
      return;
    }
    for (let i = 0; i < size; i++) {
      this.newBuffer[i] = cells[i] || this.defaultCellState;
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
      let backgroundsDrawn = 0;
      let glyphsDrawn = 0;
      this.drawBackgroundRuns(this.newBuffer);
      for (let i = 0; i < size; i++) {
          const newState = this.newBuffer[i];
          const y = Math.floor(i / this.cols);
          const x = i % this.cols;
          cellsDrawn++;
          if (!newState.isTransparentBg) backgroundsDrawn++;
          if ((newState.char || ' ') !== ' ') {
              this._physicalDrawGlyph(newState.char, x, y, newState.fg);
              glyphsDrawn++;
          }

          // Update screenBuffer to match what was just drawn
          this.screenBuffer[i] = newState;
          // Reset newBuffer cell ready for the next frame's drawing operations
          this.newBuffer[i] = this.defaultCellState;
      }

      const endTime = performance.now();
      this.lastRenderStats = { mode: 'full', cellsDrawn, backgroundsDrawn, glyphsDrawn, durationMs: endTime - startTime };
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
    const dirtyIndices: number[] = [];

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
      dirtyIndices.push(i);
      cellsDrawn++;

      // Update screenBuffer to reflect the drawn state
      this.screenBuffer[i] = newState;
      // Reset newBuffer cell ready for the next frame
      this.newBuffer[i] = this.defaultCellState;
    }

    const backgroundsDrawn = this.drawBackgroundRunsForIndices(dirtyIndices, this.screenBuffer);
    let glyphsDrawn = 0;
    for (const i of dirtyIndices) {
      const state = this.screenBuffer[i];
      const charToDraw = state.char || ' ';
      if (state.isTransparentBg && charToDraw !== ' ') {
        const x = i % this.cols;
        const y = Math.floor(i / this.cols);
        this.ctx.clearRect(x * this.charWidthPx, y * this.charHeightPx, this.charWidthPx, this.charHeightPx);
      }
      if (charToDraw !== ' ') {
        const x = i % this.cols;
        const y = Math.floor(i / this.cols);
        this._physicalDrawGlyph(state.char, x, y, state.fg);
        glyphsDrawn++;
      }
    }

    const endTime = performance.now();
    this.lastRenderStats = { mode: 'diff', cellsDrawn, backgroundsDrawn, glyphsDrawn, durationMs: endTime - startTime };
    if (cellsDrawn > 0) {
      // logger.debug( // Can be noisy
      //   `[ScreenBuffer.renderDiff] Completed: ${cellsDrawn} cells drawn in ${(
      //     endTime - startTime
      //   ).toFixed(2)} ms`
      // );
    }
  }

  private drawBackgroundRuns(buffer: CellState[]): number {
    let backgroundsDrawn = 0;
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        const state = buffer[y * this.cols + x];
        if (state.isTransparentBg) {
          x++;
          continue;
        }
        const bg = state.bg || this.defaultBgColor;
        let runEnd = x + 1;
        while (runEnd < this.cols) {
          const next = buffer[y * this.cols + runEnd];
          if (next.isTransparentBg || (next.bg || this.defaultBgColor) !== bg) break;
          runEnd++;
        }
        this.ctx.fillStyle = bg;
        this.ctx.fillRect(x * this.charWidthPx, y * this.charHeightPx, (runEnd - x) * this.charWidthPx, this.charHeightPx);
        backgroundsDrawn += runEnd - x;
        x = runEnd;
      }
    }
    return backgroundsDrawn;
  }

  private drawBackgroundRunsForIndices(indices: number[], buffer: CellState[]): number {
    let backgroundsDrawn = 0;
    let cursor = 0;
    while (cursor < indices.length) {
      const startIndex = indices[cursor];
      const startState = buffer[startIndex];
      if (startState.isTransparentBg) {
        cursor++;
        continue;
      }
      const y = Math.floor(startIndex / this.cols);
      const startX = startIndex % this.cols;
      const bg = startState.bg || this.defaultBgColor;
      let endX = startX + 1;
      cursor++;
      while (cursor < indices.length) {
        const nextIndex = indices[cursor];
        const nextY = Math.floor(nextIndex / this.cols);
        const nextX = nextIndex % this.cols;
        const nextState = buffer[nextIndex];
        if (nextY !== y || nextX !== endX || nextState.isTransparentBg || (nextState.bg || this.defaultBgColor) !== bg) break;
        endX++;
        cursor++;
      }
      this.ctx.fillStyle = bg;
      this.ctx.fillRect(startX * this.charWidthPx, y * this.charHeightPx, (endX - startX) * this.charWidthPx, this.charHeightPx);
      backgroundsDrawn += endX - startX;
    }
    return backgroundsDrawn;
  }

  private _physicalDrawGlyph(char: string | null, x: number, y: number, fgColor: string | null): void {
    const charToDraw = char || ' ';
    if (charToDraw === ' ') return;
    this.ctx.fillStyle = fgColor || this.defaultFgColor;
    this.ctx.fillText(charToDraw, x * this.charWidthPx, y * this.charHeightPx);
  }

}
