// src/rendering/renderer.ts (Enhanced Logging)

import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES } from '../constants'; // Removed unused SPECTRAL_DISTRIBUTION
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { Perlin } from '../generation/perlin';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour, adjustBrightness } from './colour';
import { logger } from '../utils/logger'; // Import the logger

/** Represents the state of a single character cell on the screen buffer. */
interface CellState {
    char: string | null; // Character to display (' ' or null for empty)
    fg: string | null; // Hex colour string or null for default
    bg: string | null; // Hex colour string or null for transparent/default
    isTransparentBg: boolean; // Flag if background should be transparent
}

// Type for the nebula colour cache (maps "x,y" string to hex colour string)
type NebulaColourCache = Record<string, string>;

export class Renderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly statusBar: HTMLElement;

    // Character grid dimensions
    private charWidthPx: number = 0;
    private charHeightPx: number = 0;
    private cols: number = 0;
    private rows: number = 0;
    private statusBarMaxChars: number = 80 * 3; // Default fallback, updated in fitToScreen

    // Screen buffers: Double buffer strategy for efficient rendering
    private screenBuffer: CellState[] = []; // Represents what's currently drawn on the canvas
    private newBuffer: CellState[] = [];    // Represents the desired state for the next frame

    private readonly defaultCellState: Readonly<CellState>; // Template for empty/default cells
    private bgColor: string; // Default background color from config
    private fgColor: string; // Default foreground color from config

    // Caching for performance
    private nebulaColourCache: NebulaColourCache = {};
    private nebulaCacheSize: number = 0;
    private readonly maxNebulaCacheSize: number = 10000; // Limit cache size to prevent memory issues

    constructor(canvasId: string, statusBarId: string) {
        logger.info("Constructing Renderer..."); //
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null; //
        const statusBar = document.getElementById(statusBarId) as HTMLElement | null; //

        if (!canvas || typeof canvas.getContext !== 'function') {
            const msg = `Canvas element "#${canvasId}" not found or not supported. Game cannot render.`; //
            logger.error(msg); // Use logger
            throw new Error(msg); //
        }
        if (!statusBar) {
            const msg = `Status bar element "#${statusBarId}" not found. Status updates will fail.`; //
            logger.error(msg); // Use logger
            throw new Error(msg); //
        }
        // Get 2D context, disable alpha for potential performance improvement if not needed
        const ctx = canvas.getContext('2d', { alpha: false }); //
        if (!ctx) {
            const msg = "Failed to get 2D rendering context from canvas. Game cannot render."; //
            logger.error(msg); // Use logger
            throw new Error(msg); //
        }

        this.canvas = canvas;
        this.ctx = ctx;
        this.statusBar = statusBar;
        // Define the default state for cells (frozen to prevent accidental modification)
        this.defaultCellState = Object.freeze({ char: null, fg: null, bg: null, isTransparentBg: false }); //
        this.bgColor = CONFIG.DEFAULT_BG_COLOR; //
        this.fgColor = CONFIG.DEFAULT_FG_COLOR; //

        // Style the status bar element
        this.statusBar.style.fontFamily = CONFIG.FONT_FAMILY; //
        this.statusBar.style.color = CONFIG.STATUS_BAR_FG_COLOR; //
        this.statusBar.style.backgroundColor = CONFIG.STATUS_BAR_BG_COLOR; //
        this.statusBar.style.whiteSpace = 'pre-wrap'; // Allow text wrapping
        this.statusBar.style.lineHeight = '1.4'; // Adjust spacing

        this.fitToScreen(); // Initial setup of dimensions, buffers, font (logs internally)
        logger.info("Renderer constructed successfully."); //
    }

    /** Initializes or re-initializes the screen buffers based on current dimensions. */
    private _initBuffers(): void {
         const size = this.cols * this.rows; //
         if (size <= 0 || !Number.isFinite(size)) { // Add check for NaN/Infinity
              logger.warn(`[InitBuffers] Called with invalid dimensions: ${this.cols}x${this.rows}. Cannot initialize buffers.`); //
              this.screenBuffer = []; //
              this.newBuffer = []; return; //
         }
         logger.info(`[InitBuffers] Initializing buffers for ${this.cols}x${this.rows} grid (${size} cells)`); // Use info for major events

         if (size > 2000000) { // Increased safety limit slightly, adjust if needed
              logger.error(`[InitBuffers] Excessive buffer size calculated: ${size}. Aborting buffer initialization to prevent crash.`); //
              this.screenBuffer = []; //
              this.newBuffer = []; this.cols = 0; this.rows = 0; // Reset dims to prevent further issues
              return; //
         }

         // Create new arrays filled with the default cell state object
         // IMPORTANT: Use map or fill carefully if CellState was mutable. Since it's Readonly or deep cloned, fill is okay.
         this.screenBuffer = new Array(size).fill(this.defaultCellState); //
         this.newBuffer = new Array(size).fill(this.defaultCellState); //
         logger.debug("[InitBuffers] Buffers initialized with default cell state."); // Use debug for details
     }

    /** Adjusts canvas size and rendering parameters to fit the window or container. */
    fitToScreen(): void {
        logger.debug("[FitScreen] Adjusting renderer to screen size..."); //
        const oldCols = this.cols;
        const oldRows = this.rows;

        // Calculate character size based on config
        const baseCharHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE; //
        const baseCharWidth = baseCharHeight * CONFIG.CHAR_ASPECT_RATIO; //

        // Estimate status bar height (approx 3 lines + padding)
        const roughStatusBarHeightPx = (baseCharHeight * 0.85 * 1.4 * 3) + 10; // Assuming 0.85 font scale for status, 1.4 line height
        // Calculate available space for the main game canvas
        const availableHeight = window.innerHeight - roughStatusBarHeightPx; //
        const availableWidth = window.innerWidth;

        // Determine grid size based on available space and character size
        this.cols = Math.max(1, Math.floor(availableWidth / baseCharWidth)); //
        this.rows = Math.max(1, Math.floor(availableHeight / baseCharHeight)); //
        this.charWidthPx = baseCharWidth;
        this.charHeightPx = baseCharHeight;

        // Resize canvas and set context properties
        this.canvas.width = this.cols * this.charWidthPx;
        this.canvas.height = this.rows * this.charHeightPx;
        this.ctx.font = `${this.charHeightPx}px ${CONFIG.FONT_FAMILY}`; // Set font size and family
        this.ctx.textBaseline = 'top'; // Align text drawing to the top

        // Center canvas horizontally and vertically above status bar
        const finalStatusBarHeightPx = (this.charHeightPx * 0.85 * 1.4 * 3) + 10; // Recalculate with final char height
        this.canvas.style.marginLeft = `${Math.max(0, (window.innerWidth - this.canvas.width) / 2)}px`; //
        this.canvas.style.marginTop = `${Math.max(0, (window.innerHeight - finalStatusBarHeightPx - this.canvas.height) / 2)}px`; //

        // Adjust status bar styling based on character size
        const sbFontSize = this.charHeightPx * 0.85; // Slightly smaller font for status bar
        this.statusBar.style.fontSize = `${sbFontSize}px`; //
        this.statusBar.style.height = `calc(${sbFontSize * 1.4 * 3}px + 10px)`; // Height for ~3 lines + padding
        this.statusBar.style.padding = `5px ${this.charWidthPx}px`; // Padding top/bottom and left/right

        // Estimate max characters for status bar truncation
        try {
            // Approximate character width in status bar (adjust factor if needed)
            const approxCharWidthInBar = this.charWidthPx * 0.85 * 0.6; // Courier New is narrower than its height
            const availableBarWidth = (this.statusBar.offsetWidth || window.innerWidth) - (parseFloat(this.statusBar.style.paddingLeft || '0') * 2); // Usable width inside padding
            // Calculate max chars per line * 3 lines
            this.statusBarMaxChars = Math.max(20, Math.floor(availableBarWidth / approxCharWidthInBar)) * 3; //
        } catch (e) {
             logger.warn("[FitScreen] Could not accurately calculate status bar width for truncation.", e); // Use logger
             this.statusBarMaxChars = 240; // Fallback
        }

        // Re-initialize buffers only if grid size actually changed
        if (this.cols !== oldCols || this.rows !== oldRows) {
             logger.info(`[FitScreen] Screen resized to ${this.cols}x${this.rows} grid.`); //
             this._initBuffers(); // This logs internally
             // Clear nebula cache as background needs complete redraw
             this.nebulaColourCache = {}; //
             this.nebulaCacheSize = 0;
             logger.debug("[FitScreen] Nebula cache cleared due to resize.");
             // Reseed Perlin noise if desired on resize (optional, might change visuals jarringly)
             // Perlin.seed(); // Perlin logs internally
        }

        // Log final calculated dimensions
        logger.info(`[FitScreen] Grid: ${this.cols}x${this.rows}, Char Size: ${this.charWidthPx.toFixed(1)}x${this.charHeightPx.toFixed(1)}px, Status Max Chars: ${this.statusBarMaxChars}`); //
    }

    /** Resets the drawing buffers and optionally clears the physical canvas. */
    clear(physicalClear: boolean = true): void {
         logger.debug(`[Clear] Clearing buffers (Physical Clear: ${physicalClear})...`);
         if (physicalClear) {
             // Fill the entire canvas with the default background color
             this.ctx.fillStyle = this.bgColor; //
             this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); //
             logger.debug("[Clear] Physical canvas cleared with default background."); // Use logger
         }
         // Reset both buffers to the default state
         for (let i = 0; i < this.newBuffer.length; i++) { // Check newBuffer length as it's the target size
            // Check index validity just in case lengths mismatch somehow
            if (i < this.screenBuffer.length) {
                 this.screenBuffer[i] = this.defaultCellState; //
            }
            this.newBuffer[i] = this.defaultCellState; //
         }
         logger.info("[Clear] Drawing buffers reset to default state."); // Use logger
     }

    /**
     * Sets a character in the new drawing buffer ('newBuffer') at grid position (x, y).
     * This stages the change; 'renderDiff' actually draws it to the canvas.
     */
    drawChar(
        char: string | null,
        x: number,
        y: number,
        fgColor: string | null = this.fgColor, // Default to renderer's fgColor
        bgColor: string | null = this.bgColor  // Default to renderer's bgColor (null for transparent)
    ): void {
         // Ensure integer coordinates
         x = Math.floor(x); //
         y = Math.floor(y); //

         // Bounds check: Ignore draws outside the grid
         if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) { //
              // logger.debug(`[DrawChar] Attempted draw out of bounds: [${x}, ${y}]`); // Can be noisy
              return; //
         }

         const index = y * this.cols + x; // Calculate buffer index
         // Additional safety check for buffer index bounds
         if(index < 0 || index >= this.newBuffer.length) { //
              logger.warn(`[DrawChar] Buffer index out of bounds calculated: [${x}, ${y}] -> Index ${index} (Buffer Size: ${this.newBuffer.length})`); // Use logger
              return; //
         }

         // Determine background: null means transparent, otherwise use provided or default
         const isTransparent = (bgColor === null); //
         const finalBgColor = isTransparent ? null : (bgColor || CONFIG.DEFAULT_BG_COLOR); // Use config default if explicitly '' or undefined

         // Update the cell state in the 'newBuffer'
         this.newBuffer[index] = {
             char: char || ' ', // Use space if char is null/undefined
             fg: fgColor || CONFIG.DEFAULT_FG_COLOR, // Use config default if fg is null/undefined/''
             bg: finalBgColor,
             isTransparentBg: isTransparent
         }; //
     }

    /** Draws a string horizontally starting at (x, y). */
    drawString(
        text: string,
        x: number,
        y: number,
        fgColor: string | null = this.fgColor,
        bgColor: string | null = null // Often transparent for text overlays
    ): void {
        logger.debug(`[DrawString] Drawing "${text}" at [${x},${y}]`);
        for (let i = 0; i < text.length; i++) {
            this.drawChar(text[i], x + i, y, fgColor, bgColor);
        }
    }

    /** Draws a box with borders and optional fill. */
    drawBox(
        x: number, y: number, width: number, height: number,
        fgColor: string | null = this.fgColor,
        bgColor: string | null = null, // Background for the border characters
        fillChar: string | null = null, // Character to fill the inside with
        fillFg: string | null = fgColor, // FG color for the fill character
        fillBg: string | null = null   // BG color for the fill area (often null/transparent)
    ): void {
        logger.debug(`[DrawBox] Drawing box at [${x},${y}], size ${width}x${height}`);
        const ex = x + width - 1;
        const ey = y + height - 1;

        for (let j = y; j <= ey; j++) {
            for (let i = x; i <= ex; i++) {
                if (i === x && j === y) {
                    this.drawChar(GLYPHS.BOX.TL, i, j, fgColor, bgColor);
                } else if (i === ex && j === y) {
                    this.drawChar(GLYPHS.BOX.TR, i, j, fgColor, bgColor);
                } else if (i === x && j === ey) {
                    this.drawChar(GLYPHS.BOX.BL, i, j, fgColor, bgColor);
                } else if (i === ex && j === ey) {
                    this.drawChar(GLYPHS.BOX.BR, i, j, fgColor, bgColor);
                } else if (j === y || j === ey) {
                    this.drawChar(GLYPHS.BOX.H, i, j, fgColor, bgColor);
                } else if (i === x || i === ex) {
                    this.drawChar(GLYPHS.BOX.V, i, j, fgColor, bgColor);
                } else if (fillChar !== null) { // Check if fill is desired
                    this.drawChar(fillChar, i, j, fillFg, fillBg);
                }
                // If fillChar is null, the inside is left untouched (or default state)
            }
        }
    }

    /** Draws a filled circle using a specified character. Simple Bresenham/Midpoint variant. */
    drawCircle(
        cx: number, cy: number, radius: number,
        char: string, fg: string | null, bg: string | null = fg // Default bg = fg for solid circle
    ): void {
        logger.debug(`[DrawCircle] Drawing circle at [${cx},${cy}], radius ${radius}`);
        if (radius < 0) return;
        cx = Math.floor(cx);
        cy = Math.floor(cy);
        radius = Math.floor(radius);

        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                if (x * x + y * y <= radius * radius) {
                    this.drawChar(char, cx + x, cy + y, fg, bg);
                }
            }
        }
    }

    /** Draws an orbit outline using Midpoint Circle Algorithm, respecting bounds. */
    drawOrbit(
        cx: number, cy: number, radius: number,
        char: string, color: string | null,
        minX: number = 0, minY: number = 0, maxX: number = this.cols - 1, maxY: number = this.rows - 1
    ): void {
        // logger.debug(`[DrawOrbit] Drawing orbit at [${cx},${cy}], radius ${radius}`); // Can be noisy
        cx = Math.floor(cx); cy = Math.floor(cy); radius = Math.floor(radius);
        if (radius <= 0) return;

        let x = radius;
        let y = 0;
        let err = 1 - radius;

        const drawPoints = (px: number, py: number) => {
            const points = [
                { dx: px, dy: py }, { dx: -px, dy: py }, { dx: px, dy: -py }, { dx: -px, dy: -py },
                { dx: py, dy: px }, { dx: -py, dy: px }, { dx: py, dy: -px }, { dx: -py, dy: -px }
            ];
            points.forEach(p => {
                const screenX = cx + p.dx;
                const screenY = cy + p.dy;
                if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                    this.drawChar(char, screenX, screenY, color, null); // Transparent background for orbits
                }
            });
        };

        while (x >= y) {
            drawPoints(x, y);
            y++;
            if (err <= 0) {
                err += 2 * y + 1;
            } else {
                x--;
                err += 2 * (y - x) + 1;
            }
        }
    }

    /** Physically draws a single character to the canvas context. Internal helper. */
    private _physicalDrawChar(
        char: string | null,
        x: number, y: number, // Grid coordinates
        fgColor: string | null, bgColor: string | null,
        isTransparentBg: boolean,
        oldBgColor: string | null // Background color currently on canvas at this cell
    ): void {
        const px = x * this.charWidthPx; // Pixel coordinates
        const py = y * this.charHeightPx;

        // Determine the background color to draw
        // If new background is transparent, use the OLD background color to effectively clear ONLY the character
        // If new background is solid, use the new background color.
        const drawBgColor = isTransparentBg ? (oldBgColor || this.bgColor) : (bgColor || this.bgColor);

        // Fill background rectangle first
        this.ctx.fillStyle = drawBgColor;
        this.ctx.fillRect(px, py, this.charWidthPx, this.charHeightPx);

        // If there's a character to draw, draw it on top
        if (char && char !== ' ') {
             this.ctx.fillStyle = fgColor || this.fgColor; // Set foreground color
             // Use fillText to draw the character
             // Slight offset might be needed depending on font baseline/alignment - adjust if chars look off-center
             this.ctx.fillText(char, px, py);
             // logger.debug(`Drew char '${char}' at px [${px}, ${py}]`); // Extremely noisy
        }
    }


    /** Compares the new buffer to the screen buffer and draws only the changed cells. */
    renderDiff(): void {
         logger.debug("[RenderDiff] Comparing buffers and drawing changes..."); // Log start (debug level)
         let cellsDrawn = 0;
         const size = this.cols * this.rows;

         // Safety check: If buffer sizes don't match grid, log error and attempt recovery
         if (size !== this.newBuffer.length || size !== this.screenBuffer.length) {
              logger.error(`[RenderDiff] Buffer size mismatch! Grid: ${this.cols}x${this.rows} (${size}), ScreenBuffer: ${this.screenBuffer.length}, NewBuffer: ${this.newBuffer.length}. Attempting recovery.`); // Use logger
              this.fitToScreen(); // Attempt recovery by resizing/reinitializing buffers
              // Re-render everything next frame by clearing screen buffer? Or just retry diff?
              // Forcing a full redraw might be safer after resize. Clear screenBuffer.
              for(let i=0; i<this.screenBuffer.length; ++i) this.screenBuffer[i] = this.defaultCellState;
              logger.warn("[RenderDiff] Screen buffer cleared due to size mismatch, full redraw will occur.");
              // Continue with diff - it will now draw everything
              // return; // Alternatively, skip this frame's render after resize attempt
         }

         const startTime = performance.now(); // Optional: time the diff

         // Iterate through all cells
         for (let i = 0; i < size; i++) {
             const oldState = this.screenBuffer[i];
             const newState = this.newBuffer[i];

             // Optimization: Skip if both old and new are default (common case for empty space)
             if (oldState === this.defaultCellState && newState === this.defaultCellState) continue; //

             // Check if cell state has actually changed
             if (oldState.char === newState.char &&
                 oldState.fg === newState.fg &&
                 oldState.bg === newState.bg &&
                 oldState.isTransparentBg === newState.isTransparentBg)
             {
                  // State hasn't changed, but reset newBuffer cell for next frame
                  this.newBuffer[i] = this.defaultCellState; // Reset for next frame's drawing
                  continue; //
             }

             // State differs, draw the new state
             const y = Math.floor(i / this.cols); // Calculate grid coords from index
             const x = i % this.cols; //
             this._physicalDrawChar(newState.char, x, y, newState.fg, newState.bg, newState.isTransparentBg, oldState.bg);
             cellsDrawn++;

             // Update screenBuffer to reflect the drawn state
             this.screenBuffer[i] = newState; //
             // Reset newBuffer cell ready for the next frame's drawing operations
             this.newBuffer[i] = this.defaultCellState; //
         }

         const endTime = performance.now(); // Stop timing
         if (cellsDrawn > 0) {
              logger.debug(`[RenderDiff] Completed: ${cellsDrawn} cells drawn in ${(endTime - startTime).toFixed(2)} ms`); // Log cells drawn and time
         } else {
              // logger.debug(`[RenderDiff] Completed: No cells changed.`); // Can be noisy if nothing happens
         }
     }

    /** Updates the text content of the status bar element, handling truncation. */
    updateStatus(message: string): void {
         if (!this.statusBar) {
             logger.warn("[UpdateStatus] Called but statusBar element is missing."); // Add check/log
             return;
         }

         // Use calculated max chars, fallback if calculation failed
         const maxChars = this.statusBarMaxChars > 0 ? this.statusBarMaxChars : 240; //
         // Truncate message if it exceeds the limit
         const truncatedMessage = message.length > maxChars ? message.substring(0, maxChars - 3) + '...' : message; //

         // Update DOM only if text content has actually changed
         if (this.statusBar.textContent !== truncatedMessage) { //
              logger.debug(`[UpdateStatus] Updating status bar text (truncated: ${message.length > maxChars}).`); // Log when update actually happens
              // logger.debug(`[UpdateStatus] Full Msg: ${message}`); // Log full msg only if debugging truncation
              this.statusBar.textContent = truncatedMessage; //
         }
     }

    // --- Scene Drawing Methods ---

    /** Draws the hyperspace view (stars, nebulae). */
    drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
        logger.debug("[DrawHyperspace] Drawing hyperspace scene..."); //

        // Calculate view boundaries based on player position and screen size
        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);
        const startWorldX = player.worldX - viewCenterX;
        const startWorldY = player.worldY - viewCenterY;
        logger.debug(`[DrawHyperspace] View Center: [${viewCenterX}, ${viewCenterY}], World Start: [${startWorldX}, ${startWorldY}]`);

        const baseSeedInt = gameSeedPRNG.seed; // Use integer seed for hashing
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);

        // Loop through visible grid cells
        for (let viewY = 0; viewY < this.rows; viewY++) {
            for (let viewX = 0; viewX < this.cols; viewX++) {
                const worldX = startWorldX + viewX;
                const worldY = startWorldY + viewY;

                // --- Draw Nebula Background ---
                let finalBg = this.bgColor; // Start with default background
                try {
                    const noiseVal = Perlin.get(worldX * CONFIG.NEBULA_SCALE, worldY * CONFIG.NEBULA_SCALE);
                    const cacheKey = `${worldX.toFixed(CONFIG.NEBULA_CACHE_PRECISION)},${worldY.toFixed(CONFIG.NEBULA_CACHE_PRECISION)}`;

                    let nebulaRgb: RgbColour;
                    if (this.nebulaColourCache[cacheKey]) {
                        // logger.debug(`Nebula cache hit for ${cacheKey}`); // Very noisy
                        finalBg = this.nebulaColourCache[cacheKey];
                    } else {
                        const baseColor1 = CONFIG.NEBULA_COLORS[0];
                        const baseColor2 = CONFIG.NEBULA_COLORS[1];
                        const baseColor3 = CONFIG.NEBULA_COLORS[2];
                        // Interpolate between 3 colors based on noise - adjust logic as needed
                        const factor = (noiseVal + 1) / 2; // Normalize noise to 0-1
                        let interpColor: RgbColour;
                        if (factor < 0.5) {
                            interpColor = interpolateColour(baseColor1, baseColor2, factor * 2);
                        } else {
                            interpColor = interpolateColour(baseColor2, baseColor3, (factor - 0.5) * 2);
                        }
                        // Blend nebula color with default background based on intensity
                        const defaultBgRgb = hexToRgb(this.bgColor);
                        nebulaRgb = interpolateColour(defaultBgRgb, interpColor, CONFIG.NEBULA_INTENSITY);
                        finalBg = rgbToHex(nebulaRgb.r, nebulaRgb.g, nebulaRgb.b);

                        // Add to cache if not full
                        if (this.nebulaCacheSize < this.maxNebulaCacheSize) {
                            this.nebulaColourCache[cacheKey] = finalBg;
                            this.nebulaCacheSize++;
                        }
                    }
                } catch (perlinError) {
                    logger.warn(`[DrawHyperspace] Error getting Perlin noise at ${worldX},${worldY}: ${perlinError}`);
                    // Keep default background on error
                }

                // --- Draw Stars (on top of nebula) ---
                const hash = fastHash(worldX, worldY, baseSeedInt); //
                const isStarCell = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold; //

                if (isStarCell) {
                    // Generate star details using a PRNG seeded specifically for this star location
                    const starSeed = `star_${worldX},${worldY}`;
                    const starPRNG = gameSeedPRNG.seedNew(starSeed); // Use game's PRNG to seed star's PRNG
                    const starType = starPRNG.choice(Object.keys(SPECTRAL_TYPES))!; // Choose from available types
                    const starInfo = SPECTRAL_TYPES[starType];

                    if (starInfo) {
                        // Adjust brightness slightly based on hash for twinkling effect?
                        const brightnessFactor = 1.0 + (hash % 100) / 500.0 - 0.1; // Small variation
                        const starBaseRgb = hexToRgb(starInfo.color);
                        const finalStarRgb = adjustBrightness(starBaseRgb, brightnessFactor);
                        const finalStarHex = rgbToHex(finalStarRgb.r, finalStarRgb.g, finalStarRgb.b);

                        // Draw star character with transparent background over the nebula
                        this.drawChar(starInfo.char, viewX, viewY, finalStarHex, null); // null bg = transparent
                         // logger.debug(`Drew star ${starInfo.char} (${starType}) at world [${worldX}, ${worldY}] / view [${viewX}, ${viewY}]`); // Noisy
                    } else {
                        // Fallback if spectral type lookup fails (shouldn't happen)
                        this.drawChar('?', viewX, viewY, '#FF00FF', null);
                    }
                } else {
                    // Not a star cell, just draw the background (nebula or default)
                    // Draw with null char to just set the background in the buffer
                    this.drawChar(null, viewX, viewY, null, finalBg);
                }
            }
        }

        // Draw player character last, on top of everything
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Transparent background for player
        logger.debug("[DrawHyperspace] Hyperspace scene drawing complete.");
    }


    /** Draws the solar system view (star, planets, orbits, player ship, minimap). */
    drawSolarSystem(player: Player, system: SolarSystem): void {
         logger.debug(`[DrawSolarSystem] Drawing system: ${system.name} (${system.starType})`); //
         const viewScale = CONFIG.SYSTEM_VIEW_SCALE; // World units per character cell
         const viewCenterX = Math.floor(this.cols / 2);
         const viewCenterY = Math.floor(this.rows / 2);

         // Calculate world coordinates corresponding to the view's top-left corner
         const viewWorldStartX = player.systemX - (viewCenterX * viewScale);
         const viewWorldStartY = player.systemY - (viewCenterY * viewScale);
         logger.debug(`[DrawSolarSystem] Player Sys: [${player.systemX.toFixed(0)}, ${player.systemY.toFixed(0)}], View Scale: ${viewScale}, View World Start: [${viewWorldStartX.toFixed(0)}, ${viewWorldStartY.toFixed(0)}]`);


         // --- Clear background (optional, could be black or show faint nebula?) ---
         this.clear(false); // Clear buffers only, assume black background initially set or needed

         // --- Draw Star ---
         const starInfo = SPECTRAL_TYPES[system.starType];
         const starColor = starInfo?.color || '#FFFFFF';
         const starChar = starInfo?.char || '*';
         // Calculate star's position in view coordinates
         const starViewX = Math.floor((0 - viewWorldStartX) / viewScale); // Star is at world 0,0
         const starViewY = Math.floor((0 - viewWorldStartY) / viewScale);
         // Draw star (larger?)
         this.drawCircle(starViewX, starViewY, 1, starChar, starColor, starColor);
         // logger.debug(`[DrawSolarSystem] Star drawn at view [${starViewX}, ${starViewY}]`); // Noisy

         // --- Draw Orbits and Planets/Starbase ---
         system.planets.forEach((planet) => {
             if (!planet) return;
             // Calculate orbit center and radius in view coordinates
             const orbitViewCx = starViewX;
             const orbitViewCy = starViewY;
             const orbitViewRadius = Math.round(planet.orbitDistance / viewScale);
             if (orbitViewRadius > 1) { // Don't draw orbits too close to star
                 this.drawOrbit(orbitViewCx, orbitViewCy, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOR_MAIN);
             }

             // Calculate planet's position in view coordinates
             const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
             const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);
             const planetColor = PLANET_TYPES[planet.type]?.colors[4] || '#CCCCCC'; // Use mid-palette color or default
             this.drawCircle(planetViewX, planetViewY, 0, GLYPHS.PLANET_ICON, planetColor, planetColor); // Single cell planet icon
             // logger.debug(`[DrawSolarSystem] Planet ${planet.name} at view [${planetViewX}, ${planetViewY}]`); // Noisy
         });

         // Draw Starbase orbit and icon if it exists
         if (system.starbase) {
              const sb = system.starbase;
              const orbitViewCx = starViewX;
              const orbitViewCy = starViewY;
              const orbitViewRadius = Math.round(sb.orbitDistance / viewScale);
              if (orbitViewRadius > 1) {
                   this.drawOrbit(orbitViewCx, orbitViewCy, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOR); // Distinct orbit color
              }
              const sbViewX = Math.floor((sb.systemX - viewWorldStartX) / viewScale);
              const sbViewY = Math.floor((sb.systemY - viewWorldStartY) / viewScale);
              this.drawCircle(sbViewX, sbViewY, 0, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOR, CONFIG.STARBASE_COLOR);
              // logger.debug(`[DrawSolarSystem] Starbase ${sb.name} at view [${sbViewX}, ${sbViewY}]`); // Noisy
         }


         // --- Draw Player Ship ---
         // Player is always at the center of the view in this perspective
         this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Transparent background


         // --- Draw Minimap ---
         this.drawSystemMinimap(system, player); // Draws in top-right corner

         logger.debug(`[DrawSolarSystem] System scene drawing complete for ${system.name}.`);
     }

    /** Draws the minimap for the solar system view. */
    private drawSystemMinimap(system: SolarSystem, player: Player): void {
         logger.debug("[DrawMinimap] Drawing system minimap..."); //
         const mapWidth = Math.floor(this.cols * CONFIG.MINIMAP_SIZE_FACTOR);
         const mapHeight = mapWidth; // Keep it square
         const mapStartX = this.cols - mapWidth - 1; // Top-right corner
         const mapStartY = 1;

         // Calculate minimap scale: Fit the entire system edge-to-edge
         const worldRadius = system.edgeRadius;
         // Need to map world coordinates from -worldRadius to +worldRadius onto mapWidth/mapHeight
         const mapScale = (2 * worldRadius) / Math.min(mapWidth, mapHeight); // World units per minimap cell
         if (mapScale <= 0 || !Number.isFinite(mapScale)) {
             logger.warn(`[DrawMinimap] Invalid map scale calculated: ${mapScale}. Aborting minimap draw.`);
             return;
         }

         // Draw minimap border
         this.drawBox(mapStartX -1, mapStartY -1, mapWidth + 2, mapHeight + 2, '#888888', null);
         // Clear minimap background (optional - could leave transparent)
         for(let y = 0; y < mapHeight; ++y) {
             for(let x = 0; x < mapWidth; ++x) {
                 this.drawChar(null, mapStartX + x, mapStartY + y, null, this.bgColor); // Clear with default bg
             }
         }


         // Function to convert world coords to minimap coords
         const worldToMinimap = (worldX: number, worldY: number): { x: number; y: number } | null => {
             // Center world coords at 0,0 for scaling
             const mapX = Math.floor((worldX / mapScale) + mapWidth / 2);
             const mapY = Math.floor((worldY / mapScale) + mapHeight / 2);
             // Check bounds
             if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
                 return { x: mapStartX + mapX, y: mapStartY + mapY };
             }
             return null;
         };

         // Draw star at center
         const starPos = worldToMinimap(0, 0);
         if (starPos) {
             const starInfo = SPECTRAL_TYPES[system.starType];
             this.drawChar(starInfo?.char || '*', starPos.x, starPos.y, starInfo?.color || '#FFFFFF', null);
         }

         // Draw planets
         system.planets.forEach(p => {
             if (!p) return;
             const planetPos = worldToMinimap(p.systemX, p.systemY);
             if (planetPos) {
                  const planetColor = PLANET_TYPES[p.type]?.colors[4] || '#CCCCCC';
                 this.drawChar(GLYPHS.PLANET_ICON, planetPos.x, planetPos.y, planetColor, null);
             }
         });

         // Draw starbase
         if (system.starbase) {
             const sbPos = worldToMinimap(system.starbase.systemX, system.starbase.systemY);
             if (sbPos) {
                 this.drawChar(GLYPHS.STARBASE_ICON, sbPos.x, sbPos.y, CONFIG.STARBASE_COLOR, null);
             }
         }

         // Draw player
         const playerPos = worldToMinimap(player.systemX, player.systemY);
         if (playerPos) {
             this.drawChar(CONFIG.PLAYER_CHAR, playerPos.x, playerPos.y, CONFIG.PLAYER_COLOR, null);
         }
         logger.debug("[DrawMinimap] Minimap drawing complete.");
     }


    /** Draws the surface view when landed on a planet or docked at a starbase. */
    drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
        // Handle type-specific rendering first
        if (landedObject instanceof Planet && (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant')) {
             logger.debug(`[DrawSurface] Rendering Gas Giant surface view for ${landedObject.name}`); //
             this.drawGasGiantSurface(player, landedObject); return; //
        }
        if (landedObject instanceof Starbase) {
             logger.debug(`[DrawSurface] Rendering Starbase interior view for ${landedObject.name}`); //
             this.drawStarbaseInterior(player); return; //
        }

        // --- Standard Solid Planet Surface Rendering ---
        // Type assertion is safe here after the above checks
        const planet = landedObject as Planet; //
        logger.debug(`[DrawSurface] Rendering solid planet surface view for ${planet.name} (${planet.type})`); //

        try {
            // Planet's ensureSurfaceReady should log its own details/errors
            logger.debug(`[DrawSurface] Calling ensureSurfaceReady for solid planet: ${planet.name}`); //
            planet.ensureSurfaceReady(); // Generates heightmap/colors if needed
            // Check that data is now present
            if (!planet.heightmap || !planet.heightLevelColors) { //
                 // This indicates a failure within ensureSurfaceReady that wasn't caught
                 throw new Error(`Surface data (heightmap or colors) missing for ${planet.name} AFTER ensureSurfaceReady call.`); //
            }
        } catch (error) {
            // Log render-side failure as well
            logger.error(`[DrawSurface] Failed to prepare surface for ${planet.name}:`, error); //
            this.updateStatus(`Render Error: ${error instanceof Error ? error.message : String(error)}`); // Show error in status
            // Fill screen with error indicator
            this.clear(false); // Clear buffer
            for (let y = 0; y < this.rows; ++y) {
                for (let x = 0; x < this.cols; ++x) {
                     this.drawChar('!', x, y, '#FF0000', CONFIG.DEFAULT_BG_COLOR); //
                }
            }
            logger.error("[DrawSurface] Aborted surface rendering due to preparation error.");
            return; // Stop rendering this frame
        }

        // --- Render Heightmap ---
        const map = planet.heightmap!; // Non-null assertion safe after check
        const heightColors = planet.heightLevelColors!; // Non-null assertion safe after check
        const mapSize = map.length;
        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);
        // Calculate top-left map coordinate corresponding to view's top-left
        const startMapX = Math.floor(player.surfaceX - viewCenterX); //
        const startMapY = Math.floor(player.surfaceY - viewCenterY); //
        logger.debug(`[DrawSurface] Player Surface: [${player.surfaceX}, ${player.surfaceY}], Map Size: ${mapSize}, View Start Map Coords: [${startMapX}, ${startMapY}]`);

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const mapX = startMapX + x; //
                const mapY = startMapY + y; //
                // Wrap coordinates for toroidal map
                const wrappedMapX = (mapX % mapSize + mapSize) % mapSize; //
                const wrappedMapY = (mapY % mapSize + mapSize) % mapSize; //

                // Get height value, clamping to valid range
                let height = map[wrappedMapY]?.[wrappedMapX] ?? 0; // Default to 0 if somehow out of bounds
                height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height))); // Clamp and round

                // Get color for the height level
                const terrainColor = heightColors[height] || '#FF00FF'; // Use fallback pink for errors

                // Draw terrain block using the height color for both FG and BG
                this.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor); //
            }
        }

        // Draw player character at the center of the view
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Transparent background

        // Draw heightmap legend
        this.drawHeightmapLegend(planet); //

        logger.debug(`[DrawSurface] Solid planet surface rendering complete for ${planet.name}.`);
    }

    /** Draws the "surface" view for a gas giant (atmospheric layers). */
    private drawGasGiantSurface(player: Player, planet: Planet): void {
         logger.debug(`[DrawGasGiant] Drawing atmospheric view for ${planet.name}`); //
         // Ensure color palette is ready
         if (!planet.rgbPaletteCache) { //
             try {
                 logger.debug(`[DrawGasGiant] RGB Palette cache miss for ${planet.name}, calling ensureSurfaceReady...`); //
                 planet.ensureSurfaceReady(); // Planet logs details if it generates
                 if (!planet.rgbPaletteCache) throw new Error("RGB Palette cache still missing after ensureSurfaceReady."); //
             } catch (error) {
                 logger.error(`[DrawGasGiant] Error preparing gas giant visuals for ${planet.name}:`, error); //
                 this.updateStatus(`Render Error: ${error instanceof Error ? error.message : String(error)}`); //
                 this.clear(false);
                 for (let i = 0; i < this.newBuffer.length; i++) { this.newBuffer[i] = { char: '!', fg: '#FF00FF', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false }; } //
                 return; //
             }
         }

         const palette = planet.rgbPaletteCache!; // Safe after check
         const numColors = palette.length;
         const prng = planet.systemPRNG.seedNew("gas_surface_" + player.surfaceX + "_" + player.surfaceY); // Seed based on player surface pos? Or keep static? Static seems better.
         const staticPrng = planet.systemPRNG.seedNew("gas_surface_static"); // Use a static seed for consistent visuals

         // Draw swirling atmospheric bands
         for (let y = 0; y < this.rows; y++) {
             // Base color index determined by row (latitude)
             const baseColorIndex = Math.floor((y / this.rows) * numColors);
             const color1 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex))];
             const color2 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex + 1))]; // Color for interpolation

             for (let x = 0; x < this.cols; x++) {
                 // Add horizontal variation / turbulence using PRNG or simple waves
                 const interpFactor = (staticPrng.random() + Math.sin(x * 0.1 + y * 0.05 + staticPrng.random() * 5) * 0.3 + 0.5) % 1.0; // Combine noise and sine waves
                 const bandColor = interpolateColour(color1, color2, Math.max(0, Math.min(1, interpFactor)));

                 // Add brightness variation
                 const brightness = 0.8 + staticPrng.random() * 0.4;
                 const finalColorRgb = adjustBrightness(bandColor, brightness);
                 const finalColorHex = rgbToHex(finalColorRgb.r, finalColorRgb.g, finalColorRgb.b);

                 // Choose a character based on density/randomness
                 const char = staticPrng.choice([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK, ' '])!;

                 this.drawChar(char, x, y, finalColorHex, finalColorHex); // Use same color for FG/BG
             }
         }

         // Draw player - maybe slightly different char? Or just '@'
         this.drawChar(player.char, Math.floor(this.cols / 2), Math.floor(this.rows / 2), CONFIG.PLAYER_COLOR, null); // Transparent BG

         logger.debug(`[DrawGasGiant] Gas giant rendering complete for ${planet.name}.`);
     }


    /** Draws the view when docked inside a starbase. */
    private drawStarbaseInterior(player: Player): void {
         logger.debug("[DrawStarbase] Drawing starbase interior view..."); //
         this.clear(false); // Clear buffer

         // Draw a simple border or background pattern
         this.drawBox(0, 0, this.cols, this.rows, CONFIG.STARBASE_COLOR, null, ' ', null, '#111111'); // Dark grey fill

         // Draw some basic interior elements (text labels, decorative lines)
         this.drawString("== Starbase Docking Bay ==", 5, 3, CONFIG.STARBASE_COLOR, null);
         this.drawString("Services:", 5, 6, CONFIG.DEFAULT_FG_COLOR, null);
         this.drawString(`- [${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade Commodities`, 7, 8, CONFIG.DEFAULT_FG_COLOR, null);
         this.drawString(`- [${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel Ship`, 7, 9, CONFIG.DEFAULT_FG_COLOR, null);
         // Add more services? Repairs, upgrades?
         this.drawString(`Press [${CONFIG.KEY_BINDINGS.LIFTOFF.toUpperCase()}] to depart.`, 5, 12, CONFIG.DEFAULT_FG_COLOR, null);

         // Draw "player" position (static inside starbase)
         this.drawChar(player.char, Math.floor(this.cols / 2), Math.floor(this.rows / 2), CONFIG.PLAYER_COLOR, null);

         logger.debug("[DrawStarbase] Starbase interior rendering complete.");
    }

    /** Draws a legend for the heightmap colors on the planet surface view. */
    private drawHeightmapLegend(planet: Planet): void {
         // This is small, logging might be noisy, add DEBUG if needed
         if (!planet.heightLevelColors || planet.heightLevelColors.length === 0) return;

         const legendWidth = 1; // Width of the color swatch
         const legendHeight = Math.min(this.rows - 2, 20); // Max height or available rows
         const startX = this.cols - legendWidth - 1; // Position on the right edge
         const startY = Math.floor((this.rows - legendHeight) / 2); // Centered vertically

         const numColors = planet.heightLevelColors.length;

         for (let i = 0; i < legendHeight; i++) {
             // Map legend bar position (0 to legendHeight-1) to color index (0 to numColors-1)
             const colorIndex = Math.floor((i / (legendHeight - 1)) * (numColors - 1));
             const color = planet.heightLevelColors[colorIndex] || '#FF00FF'; // Fallback pink

             // Draw color swatch block
             for (let w = 0; w < legendWidth; ++w) {
                 this.drawChar(GLYPHS.BLOCK, startX + w, startY + i, color, color);
             }
         }
         // Optionally draw min/max height labels?
         this.drawString("High", startX - 4, startY, this.fgColor, null);
         this.drawString("Low", startX - 3, startY + legendHeight - 1, this.fgColor, null);
         // logger.debug("[DrawLegend] Heightmap legend drawn."); // Optional debug log
     }

} // End Renderer Class