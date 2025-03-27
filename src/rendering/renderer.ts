// src/rendering/renderer.ts

import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, MineralRichness } from '../constants'; // Import necessary constants
import { Player } from '../core/player'; // Import Player type
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { Perlin } from '../generation/perlin';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour, adjustBrightness } from './colour'; // Use Australian spelling


/** Represents the state of a single character cell on the screen buffer. */
interface CellState {
    char: string | null;
    fg: string | null; // Hex colour string or null for default
    bg: string | null; // Hex colour string or null for transparent/default
    isTransparentBg: boolean;
}

// Type for the nebula colour cache (maps "x,y" string to hex colour string)
type NebulaColourCache = Record<string, string>;

export class Renderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly statusBar: HTMLElement;

    private charWidthPx: number = 0;
    private charHeightPx: number = 0;
    private cols: number = 0;
    private rows: number = 0;
    private statusBarMaxChars: number = 80 * 3; // Default fallback

    // Screen buffers
    private screenBuffer: CellState[] = []; // What's currently drawn
    private newBuffer: CellState[] = [];    // What needs to be drawn
    private readonly defaultCellState: Readonly<CellState>;

    // Default drawing colours
    private bgColor: string;
    private fgColor: string;

    // Nebula cache (for hyperspace background)
    private nebulaColourCache: NebulaColourCache = {};
    private nebulaCacheSize: number = 0;
    private readonly maxNebulaCacheSize: number = 10000; // Limit cache size

    constructor(canvasId: string, statusBarId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
        const statusBar = document.getElementById(statusBarId) as HTMLElement | null;

        if (!canvas || typeof canvas.getContext !== 'function') {
            throw new Error(`Canvas element with id "${canvasId}" not found or not supported.`);
        }
        if (!statusBar) {
            throw new Error(`Status bar element with id "${statusBarId}" not found.`);
        }

        const ctx = canvas.getContext('2d', { alpha: false }); // alpha: false for potential performance boost
        if (!ctx) {
            throw new Error("Failed to get 2D rendering context from canvas.");
        }

        this.canvas = canvas;
        this.ctx = ctx;
        this.statusBar = statusBar;

        // Initialize default cell state as readonly
        this.defaultCellState = Object.freeze({
            char: null,
            fg: null,
            bg: null,
            isTransparentBg: false,
        });

        this.bgColor = CONFIG.DEFAULT_BG_COLOR;
        this.fgColor = CONFIG.DEFAULT_FG_COLOR;

        // Configure status bar styles from CONFIG
        this.statusBar.style.fontFamily = CONFIG.FONT_FAMILY;
        this.statusBar.style.color = CONFIG.STATUS_BAR_FG_COLOR;
        this.statusBar.style.backgroundColor = CONFIG.STATUS_BAR_BG_COLOR;
        this.statusBar.style.whiteSpace = 'pre-wrap'; // Ensure wrapping works
        this.statusBar.style.lineHeight = '1.4'; // Match CSS

        // Perform initial screen setup
        this.fitToScreen(); // This will also call _initBuffers
        console.log("Renderer initialized.");
    }

    /** Initializes or re-initializes the screen buffers based on current dimensions. */
    private _initBuffers(): void {
        const size = this.cols * this.rows;
        if (size <= 0) {
            console.warn(`Attempting to initialize buffers with invalid dimensions: ${this.cols}x${this.rows}`);
            this.screenBuffer = [];
            this.newBuffer = [];
            return;
        }
        console.log(`Initializing buffers for ${this.cols}x${this.rows} (${size} cells)`);

        // Avoid creating huge arrays if dimensions are somehow faulty
        if (size > 1000000) { // Safety limit (e.g., > 1000x1000)
             console.error(`Buffer size calculation resulted in excessively large size: ${size}. Aborting buffer init.`);
             this.screenBuffer = [];
             this.newBuffer = [];
             this.cols = 0; // Reset dimensions
             this.rows = 0;
             return;
        }

        // Fill buffers with the default state reference
        this.screenBuffer = new Array(size).fill(this.defaultCellState);
        this.newBuffer = new Array(size).fill(this.defaultCellState);
    }

    /** Adjusts canvas size and rendering parameters to fit the window. */
    fitToScreen(): void {
        const baseCharHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
        const baseCharWidth = baseCharHeight * CONFIG.CHAR_ASPECT_RATIO;

        // Estimate status bar height based on font size for available height calc
        // Use calc from CSS: 1.5em base font * 1.4 line height * 3 lines + 10px padding
        const roughStatusBarHeightPx = (baseCharHeight * 0.85 * 1.4 * 3) + 10; // Approx based on status bar CSS calc

        const availableHeight = window.innerHeight - roughStatusBarHeightPx;
        const availableWidth = window.innerWidth;

        const oldCols = this.cols;
        const oldRows = this.rows;

        // Calculate new grid dimensions based on character size
        this.cols = Math.max(1, Math.floor(availableWidth / baseCharWidth));
        this.rows = Math.max(1, Math.floor(availableHeight / baseCharHeight));

        // Store actual pixel dimensions used for characters
        this.charWidthPx = baseCharWidth;
        this.charHeightPx = baseCharHeight;

        // Resize canvas
        this.canvas.width = this.cols * this.charWidthPx;
        this.canvas.height = this.rows * this.charHeightPx;

        // Set canvas font properties AFTER resizing
        this.ctx.font = `${this.charHeightPx}px ${CONFIG.FONT_FAMILY}`;
        this.ctx.textBaseline = 'top'; // Consistent baseline

        // Center canvas horizontally and vertically above the status bar
        const finalStatusBarHeightPx = (this.charHeightPx * 0.85 * 1.4 * 3) + 10; // Recalc with final char height
        this.canvas.style.marginLeft = `${Math.max(0, (window.innerWidth - this.canvas.width) / 2)}px`;
        this.canvas.style.marginTop = `${Math.max(0, (window.innerHeight - finalStatusBarHeightPx - this.canvas.height) / 2)}px`;

        // Adjust status bar font size and dimensions based on character size
        const sbFontSize = this.charHeightPx * 0.85; // Slightly smaller than canvas font
        this.statusBar.style.fontSize = `${sbFontSize}px`;
        // Use calc directly matching CSS for height
        this.statusBar.style.height = `calc(${sbFontSize * 1.4 * 3}px + 10px)`;
        // Adjust padding based on actual char width for alignment
        this.statusBar.style.padding = `5px ${this.charWidthPx}px`;

        // Estimate max characters in status bar (approximate)
        try {
            // Character width in status bar might differ slightly due to font size change
             const approxCharWidthInBar = this.charWidthPx * 0.85; // Matching font size factor
             const availableBarWidth = (this.statusBar.offsetWidth || window.innerWidth) - (parseFloat(this.statusBar.style.paddingLeft || '0') * 2);
             // Calculate chars per line * number of lines (3)
             this.statusBarMaxChars = Math.max(20, Math.floor(availableBarWidth / approxCharWidthInBar)) * 3;
        } catch (e) {
            console.warn("Could not calculate status bar width accurately.", e);
            this.statusBarMaxChars = 240; // Fallback
        }


        // Reinitialize buffers if dimensions changed
        if (this.cols !== oldCols || this.rows !== oldRows) {
            this._initBuffers();
        }

        // Clear nebula cache and reseed Perlin noise on resize as world coords change relative to screen
        this.nebulaColourCache = {};
        this.nebulaCacheSize = 0;
        Perlin.seed(); // Reseed to potentially recalculate visible noise patterns

        console.log(`Grid size: ${this.cols}x${this.rows}, Char size: ${this.charWidthPx.toFixed(1)}x${this.charHeightPx.toFixed(1)}, Status Max Chars: ${this.statusBarMaxChars}`);
    }

    /** Resets the drawing buffers and optionally clears the physical canvas. */
    clear(physicalClear: boolean = true): void {
        if (physicalClear) {
            this.ctx.fillStyle = this.bgColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            console.log("Physical canvas clear performed.");
        }
        // Reset buffers to default state
        for (let i = 0; i < this.screenBuffer.length; i++) {
            this.screenBuffer[i] = this.defaultCellState;
            this.newBuffer[i] = this.defaultCellState;
        }
        console.log("Drawing buffers reset.");
    }

    /** Sets a character in the new drawing buffer at (x, y). */
    drawChar(
        char: string | null,
        x: number,
        y: number,
        fgColor: string | null = this.fgColor,
        bgColor: string | null = this.bgColor // Use null for transparency
    ): void {
        // Ensure coordinates are integers and within bounds
        x = Math.floor(x);
        y = Math.floor(y);
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return;
        }

        const index = y * this.cols + x;
        if(index < 0 || index >= this.newBuffer.length) {
             console.warn(`Attempted to draw out of buffer bounds at [${x}, ${y}] index ${index}`);
             return;
        }

        const isTransparent = (bgColor === null);
        const finalBgColor = isTransparent ? null : (bgColor || CONFIG.DEFAULT_BG_COLOR);

        // Create a new state object for the buffer
        this.newBuffer[index] = {
            char: char || ' ', // Use space for null char
            fg: fgColor || CONFIG.DEFAULT_FG_COLOR,
            bg: finalBgColor,
            isTransparentBg: isTransparent
        };
    }

    /** Draws a string horizontally starting at (x, y). */
    drawString(
        text: string,
        x: number,
        y: number,
        fgColor: string | null = this.fgColor,
        bgColor: string | null = 'transparent' // Default to transparent background for strings
    ): void {
        for (let i = 0; i < text.length; i++) {
            this.drawChar(text[i], x + i, y, fgColor, bgColor);
        }
    }

    /** Draws a box with borders and optional fill. */
     drawBox(
        x: number,
        y: number,
        width: number,
        height: number,
        fgColor: string | null = this.fgColor,
        bgColor: string | null = 'transparent', // Box background (behind border)
        fillChar: string | null = null, // Character for filling the inside
        fillFg: string | null = fgColor, // Colour for the fill character
        fillBg: string | null = bgColor // Background colour for the filled area
    ): void {
        x = Math.floor(x);
        y = Math.floor(y);
        width = Math.max(0, Math.floor(width));
        height = Math.max(0, Math.floor(height));

        if (width === 0 || height === 0) return;

        const endX = x + width;
        const endY = y + height;

        for (let row = y; row < endY; row++) {
            for (let col = x; col < endX; col++) {
                let char: string | null = ' ';
                let currentFg = fgColor;
                let currentBg = bgColor;
                let isBorder = (row === y || row === endY - 1 || col === x || col === endX - 1);

                if (isBorder) {
                    currentFg = fgColor; // Border always uses the box fgColor
                    currentBg = bgColor; // Border uses the box bgColor
                    if (row === y) { // Top edge
                        char = (col === x) ? GLYPHS.BOX.TL : (col === endX - 1) ? GLYPHS.BOX.TR : GLYPHS.BOX.H;
                    } else if (row === endY - 1) { // Bottom edge
                        char = (col === x) ? GLYPHS.BOX.BL : (col === endX - 1) ? GLYPHS.BOX.BR : GLYPHS.BOX.H;
                    } else { // Vertical edges
                        char = (col === x || col === endX - 1) ? GLYPHS.BOX.V : ' '; // Should be space if not corner? Handled below.
                    }
                    // Special case for 1-width or 1-height boxes
                     if (width === 1 && height === 1) char = GLYPHS.BOX.H; // Single point box
                     else if (width === 1) char = (row === y) ? GLYPHS.BOX.TL : (row === endY - 1) ? GLYPHS.BOX.BL : GLYPHS.BOX.V; // Vertical line
                     else if (height === 1) char = (col === x) ? GLYPHS.BOX.TL : (col === endX - 1) ? GLYPHS.BOX.TR : GLYPHS.BOX.H; // Horizontal line

                } else { // Inside the border
                    if (fillChar) {
                        char = fillChar;
                        currentFg = fillFg;
                        currentBg = fillBg;
                    } else {
                         // If no fill char, draw background only if it's not transparent
                         if (fillBg !== null) { // Use the specified fill background
                              char = ' ';
                              currentFg = null; // No foreground char needed
                              currentBg = fillBg;
                         } else if (bgColor !== null) { // Fallback to box background if fillBg is transparent
                              char = ' ';
                              currentFg = null;
                              currentBg = bgColor;
                         } else {
                              // Both fillBg and bgColor are transparent, do nothing for this cell
                              continue;
                         }
                    }
                }

                this.drawChar(char, col, row, currentFg, currentBg);
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
        bg: string | null = fg // Default background to fg for solid fill
    ): void {
        cx = Math.round(cx);
        cy = Math.round(cy);
        radius = Math.max(0, Math.round(radius));
        const radSq = radius * radius;

        // Bounding box, clamped to screen edges
        const startY = Math.max(0, Math.floor(cy - radius));
        const endY = Math.min(this.rows - 1, Math.ceil(cy + radius));
        const startX = Math.max(0, Math.floor(cx - radius));
        const endX = Math.min(this.cols - 1, Math.ceil(cx + radius));

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                // Use distance from cell center for smoother circles
                const dx = x - cx + 0.5;
                const dy = y - cy + 0.5;
                const distSq = dx * dx + dy * dy;

                if (distSq <= radSq) {
                    this.drawChar(char, x, y, fg, bg);
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
        color: string | null,
        minX: number = 0,
        minY: number = 0,
        maxX: number = this.cols - 1,
        maxY: number = this.rows - 1
    ): void {
        cx = Math.round(cx);
        cy = Math.round(cy);
        radius = Math.max(0, Math.round(radius));

        if (radius <= 0) { // Draw single point if radius is 0 or less
            if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
                 this.drawChar(char, cx, cy, color, null); // Transparent background for orbits
            }
            return;
        }

        let x = radius;
        let y = 0;
        let err = 1 - radius; // Initial error

        // Helper to plot points and their reflections, checking bounds and existing cell content
        const plot = (px: number, py: number) => {
            // Round final coordinates
            px = Math.round(px);
            py = Math.round(py);

            if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                const index = py * this.cols + px;
                // Ensure index is valid (should be if bounds check passes, but safety first)
                 if (index >= 0 && index < this.newBuffer.length) {
                     const currentCell = this.newBuffer[index];
                     // Only draw orbit char if the cell is empty or just default background
                     // Avoid overwriting stars, planets, player etc.
                     if (currentCell === this.defaultCellState || currentCell.char === ' ' || currentCell.bg === CONFIG.DEFAULT_BG_COLOR) {
                         this.drawChar(char, px, py, color, null); // Null bg for transparency
                     }
                 }
            }
        };

        // Midpoint circle algorithm iterations
        while (x >= y) {
            // Plot points in all 8 octants
            plot(cx + x, cy + y); plot(cx - x, cy + y);
            plot(cx + x, cy - y); plot(cx - x, cy - y);
            plot(cx + y, cy + x); plot(cx - y, cy + x);
            plot(cx + y, cy - x); plot(cx - y, cy - x);

            y++;
            if (err <= 0) {
                err += 2 * y + 1;
            } else {
                x--;
                err += 2 * (y - x) + 1;
            }
        }
    }

    /** Physically draws a single character to the canvas context. */
    private _physicalDrawChar(
        char: string | null,
        x: number, // Grid column
        y: number, // Grid row
        fgColor: string | null,
        bgColor: string | null,
        isTransparentBg: boolean,
        oldBgColor: string | null // Background colour currently on screen
    ): void {
        const drawX = x * this.charWidthPx;
        const drawY = y * this.charHeightPx;

        let fillStyle: string;

        // Determine background fill colour
        if (isTransparentBg) {
            // If transparent, clear with the *previous* background colour (or default)
            fillStyle = oldBgColor || CONFIG.DEFAULT_BG_COLOR;
        } else {
            // If solid background, use the new background colour (or default)
            fillStyle = bgColor || CONFIG.DEFAULT_BG_COLOR;
        }

        // Special case for full block character: fill with foreground colour if background isn't transparent
        if (char === GLYPHS.BLOCK && !isTransparentBg) {
             fillStyle = fgColor || CONFIG.DEFAULT_FG_COLOR; // Use FG colour for the fill
        }

        // Fill the background rectangle
        this.ctx.fillStyle = fillStyle;
        this.ctx.fillRect(drawX, drawY, this.charWidthPx, this.charHeightPx);

        // Draw the foreground character if needed (and not a block character already drawn)
        if (char && char !== ' ' && char !== GLYPHS.BLOCK && fgColor) {
            this.ctx.fillStyle = fgColor;
            // Slight Y offset can improve appearance for some fonts/sizes
            const yOffset = this.charHeightPx * 0.05;
            this.ctx.fillText(char, drawX, drawY + yOffset);
        } else if (char === GLYPHS.BLOCK && isTransparentBg && fgColor) {
             // Handle transparent background block char - fill with foreground
             this.ctx.fillStyle = fgColor;
             this.ctx.fillRect(drawX, drawY, this.charWidthPx, this.charHeightPx);
        }
    }

    /** Compares the new buffer to the screen buffer and draws only the changed cells. */
    renderDiff(): void {
        let cellsDrawn = 0;
        const size = this.cols * this.rows;
        if (size !== this.newBuffer.length || size !== this.screenBuffer.length) {
             console.error("Buffer size mismatch! Halting renderDiff.");
             // Attempt recovery?
             this.fitToScreen(); // Resize might fix buffer sizes
             return;
        }


        for (let i = 0; i < size; i++) {
            const oldState = this.screenBuffer[i];
            const newState = this.newBuffer[i];

            // Optimization: Skip if both are default (avoids property checks)
            if (oldState === this.defaultCellState && newState === this.defaultCellState) {
                continue;
            }

            // Optimization: Skip if states are identical
            if (
                oldState.char === newState.char &&
                oldState.fg === newState.fg &&
                oldState.bg === newState.bg &&
                oldState.isTransparentBg === newState.isTransparentBg
            ) {
                continue;
            }

            // If changed, draw the new state physically
            const y = Math.floor(i / this.cols);
            const x = i % this.cols;
            this._physicalDrawChar(newState.char, x, y, newState.fg, newState.bg, newState.isTransparentBg, oldState.bg);
            cellsDrawn++;

            // Update the screen buffer to reflect the newly drawn state
            this.screenBuffer[i] = newState;
             // Optimization: Reset new buffer cell to default *after* processing
             // This avoids needing a separate clear loop before the next frame's draw calls.
             this.newBuffer[i] = this.defaultCellState;
        }
        // Optional: Log number of cells drawn for performance monitoring
        // if (cellsDrawn > 0) console.log(`Rendered ${cellsDrawn} cells.`);
    }

    /** Updates the text content of the status bar element. */
    updateStatus(message: string): void {
        if (!this.statusBar) return;

        // Truncate message if it exceeds the estimated max characters
        const maxChars = this.statusBarMaxChars > 0 ? this.statusBarMaxChars : 240; // Use fallback if calculation failed
        const truncatedMessage = message.length > maxChars
            ? message.substring(0, maxChars - 3) + '...'
            : message;

        // Only update DOM if text content has actually changed
        if (this.statusBar.textContent !== truncatedMessage) {
            this.statusBar.textContent = truncatedMessage;
        }
    }


    // --- Scene Drawing Methods ---

    /** Draws the hyperspace view centered on the player. */
    drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
        const BLOCK_SIZE = Math.max(1, CONFIG.CELL_BLOCK_SIZE || 1);
        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);

        // Calculate top-left world coordinates based on player position and view center
        const startWorldX = player.worldX - viewCenterX;
        const startWorldY = player.worldY - viewCenterY;

        // Local refs for performance inside loops
        const localNebulaCache = this.nebulaColourCache;
        const maxCache = this.maxNebulaCacheSize;
        const cachePrecision = CONFIG.NEBULA_CACHE_PRECISION;
        const nebulaScale = CONFIG.NEBULA_SCALE;
        const nebulaIntensity = CONFIG.NEBULA_INTENSITY;
        const nebulaBaseColours = CONFIG.NEBULA_COLORS;
        const defaultBgRgb = hexToRgb(CONFIG.DEFAULT_BG_COLOR);

        // Per-frame cache to avoid redundant lookups within this frame
        const frameNebulaCache: NebulaColourCache = {};

        const getNebulaColour = (wx: number, wy: number): string => {
            const cacheKey = `${wx.toFixed(cachePrecision)},${wy.toFixed(cachePrecision)}`;

            // Check per-frame cache first
            if (frameNebulaCache.hasOwnProperty(cacheKey)) return frameNebulaCache[cacheKey];
            // Check persistent cache
            if (localNebulaCache.hasOwnProperty(cacheKey)) {
                frameNebulaCache[cacheKey] = localNebulaCache[cacheKey]; // Promote to frame cache
                return localNebulaCache[cacheKey];
            }

            // --- Calculate colour if not cached ---
            const noiseVal = Perlin.get(wx * nebulaScale, wy * nebulaScale);
            // Normalize noise roughly to 0-1 range
            const normalizedNoise = Math.max(0, Math.min(1, (noiseVal + 0.7) / 1.4));

            // Select base nebula colours for interpolation
            const colorIndexFloat = normalizedNoise * (nebulaBaseColours.length - 1);
            const index1 = Math.max(0, Math.min(nebulaBaseColours.length - 1, Math.floor(colorIndexFloat)));
            const index2 = Math.min(nebulaBaseColours.length - 1, index1 + 1); // Clamp index2
            const factor = colorIndexFloat - index1;

            let baseNebColour = nebulaBaseColours[index1]; // Fallback if indices are bad
             if(index1 < nebulaBaseColours.length && index2 < nebulaBaseColours.length && index1 !== index2) {
                  baseNebColour = interpolateColour(nebulaBaseColours[index1], nebulaBaseColours[index2], factor);
             } else if (index1 < nebulaBaseColours.length) {
                  baseNebColour = nebulaBaseColours[index1];
             }


            let finalHexColour: string;
            if (nebulaIntensity > 0) {
                // Interpolate between default background and the calculated nebula colour
                const finalRgb = interpolateColour(
                    defaultBgRgb,
                    baseNebColour, // Already an RgbColour object
                    normalizedNoise * nebulaIntensity // Intensity scaled by noise value
                );
                finalHexColour = rgbToHex(finalRgb.r, finalRgb.g, finalRgb.b);
            } else {
                // If intensity is 0, just use default background
                finalHexColour = CONFIG.DEFAULT_BG_COLOR;
            }

            // --- Add to caches ---
            // Add to persistent cache if space allows or via replacement
            if (this.nebulaCacheSize < maxCache) {
                localNebulaCache[cacheKey] = finalHexColour;
                this.nebulaCacheSize++;
            } else if (Math.random() < 0.005) { // Randomly replace an old entry sometimes
                const randomKeyIndex = Math.floor(Math.random() * this.nebulaCacheSize);
                const randomKey = Object.keys(localNebulaCache)[randomKeyIndex];
                if (randomKey) { // Ensure key exists
                    delete localNebulaCache[randomKey];
                    localNebulaCache[cacheKey] = finalHexColour;
                }
            }
            // Add to frame cache regardless
            frameNebulaCache[cacheKey] = finalHexColour;
            return finalHexColour;
        };

        // --- Star generation helpers ---
        const baseSeedInt = gameSeedPRNG.seed; // Use integer seed state
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const getStarPRNG = (wx: number, wy: number): PRNG => {
            const starSeed = `star_${wx},${wy}`;
            // Create a new PRNG seeded from the main game PRNG for this specific star location
            return gameSeedPRNG.seedNew(starSeed);
        };


        // --- Main Drawing Loop ---
        for (let y = 0; y < this.rows; y += BLOCK_SIZE) {
            for (let x = 0; x < this.cols; x += BLOCK_SIZE) {
                // Calculate world coordinates for the top-left of the block
                const blockWorldX = startWorldX + x;
                const blockWorldY = startWorldY + y;

                // Get background colour for the whole block (optimization)
                const blockBgColor = getNebulaColour(blockWorldX, blockWorldY);

                // Draw cells within the block
                for (let subY = 0; subY < BLOCK_SIZE; subY++) {
                    const currentY = y + subY;
                    if (currentY >= this.rows) continue; // Stay within screen bounds

                    const cellWorldY = startWorldY + currentY;

                    for (let subX = 0; subX < BLOCK_SIZE; subX++) {
                        const currentX = x + subX;
                        if (currentX >= this.cols) continue; // Stay within screen bounds

                        const cellWorldX = startWorldX + currentX;

                        let fgColor: string | null = CONFIG.DEFAULT_FG_COLOR;
                        let char: string | null = ' ';

                        // Check for star presence using fast hash
                        const hash = fastHash(cellWorldX, cellWorldY, baseSeedInt);
                        if ((hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold) {
                            // Star exists here, determine its properties
                            const starPRNG = getStarPRNG(cellWorldX, cellWorldY);
                            const spectralClass = starPRNG.choice(SPECTRAL_DISTRIBUTION);
                            const starData = spectralClass ? SPECTRAL_TYPES[spectralClass] : null;

                            if (starData) {
                                const baseRgb = hexToRgb(starData.color);
                                // Adjust brightness based on spectral type
                                const finalColorRGB = adjustBrightness(baseRgb, starData.brightness);
                                fgColor = rgbToHex(finalColorRGB.r, finalColorRGB.g, finalColorRGB.b);
                                char = starData.char;
                            } else {
                                fgColor = '#FF00FF'; // Magenta for error/unknown star type
                                char = '?';
                            }
                        }

                        // Draw background cell first
                        this.drawChar(' ', currentX, currentY, null, blockBgColor);
                        // Draw star character on top if one exists (transparent background)
                        if (char !== ' ') {
                            this.drawChar(char, currentX, currentY, fgColor, null); // Null bg = transparent
                        }
                    }
                }
            }
        }

        // --- Draw Player ---
        // Draw player last, potentially over a star
         // Get background colour at player's exact location
        const playerBgColor = getNebulaColour(player.worldX, player.worldY);
        this.drawChar(' ', viewCenterX, viewCenterY, null, playerBgColor); // Draw background first
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Draw player transparently
    }

    /** Draws the solar system view centered on the player. */
    drawSolarSystem(player: Player, system: SolarSystem, gameSeedPRNG: PRNG): void {
        // Clear buffer with default background
        for (let i = 0; i < this.newBuffer.length; i++) {
            this.newBuffer[i] = { ...this.defaultCellState, bg: CONFIG.DEFAULT_BG_COLOR }; // Start fresh
        }

        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);
        const systemScale = CONFIG.SYSTEM_VIEW_SCALE; // World units per cell

        // --- Calculate Star Position Relative to Player ---
        // Star is at (0,0) in system coords
        const relStarX = 0 - player.systemX;
        const relStarY = 0 - player.systemY;
        const starScreenX = viewCenterX + Math.round(relStarX / systemScale);
        const starScreenY = viewCenterY + Math.round(relStarY / systemScale);

        // Determine max screen dimension for orbit culling
        const maxScreenDim = Math.max(this.cols, this.rows);

        // --- Draw Orbits ---
        system.planets.forEach((planet) => {
            if (!planet) return;
            const orbitRadiusScreen = planet.orbitDistance / systemScale;
            // Cull orbits significantly outside the view
            if (orbitRadiusScreen < maxScreenDim * 1.5) {
                this.drawOrbit(starScreenX, starScreenY, orbitRadiusScreen, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOR_MAIN);
            }
        });
        if (system.starbase) {
            const orbitRadiusScreen = system.starbase.orbitDistance / systemScale;
            if (orbitRadiusScreen < maxScreenDim * 1.5) {
                this.drawOrbit(starScreenX, starScreenY, orbitRadiusScreen, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOR); // Use distinct colour
            }
        }

        // --- Draw Star ---
        const starData = SPECTRAL_TYPES[system.starType];
        if (starData && starScreenX >= 0 && starScreenX < this.cols && starScreenY >= 0 && starScreenY < this.rows) {
            // Slightly dim the star in system view compared to hyperspace view
            const finalColorRGB = adjustBrightness(hexToRgb(starData.color), starData.brightness * 0.8);
            // Draw star char with transparent background over potential orbits
            this.drawChar(starData.char, starScreenX, starScreenY, rgbToHex(finalColorRGB.r, finalColorRGB.g, finalColorRGB.b), null);
        }

        // --- Draw Planets ---
        system.planets.forEach((planet) => {
            if (!planet) return;
            const relPlanetX = planet.systemX - player.systemX;
            const relPlanetY = planet.systemY - player.systemY;
            const screenX = viewCenterX + Math.round(relPlanetX / systemScale);
            const screenY = viewCenterY + Math.round(relPlanetY / systemScale);
            const planetRadiusScreen = CONFIG.PLANET_MAIN_VIEW_RADIUS;

            // Basic culling
            if (screenX + planetRadiusScreen >= 0 && screenX - planetRadiusScreen < this.cols &&
                screenY + planetRadiusScreen >= 0 && screenY - planetRadiusScreen < this.rows)
            {
                const planetPalette = PLANET_TYPES[planet.type]?.colors;
                // Use a representative colour (e.g., middle of the palette)
                const planetColor = planetPalette ? planetPalette[Math.floor(planetPalette.length / 2)] : '#FFFFFF';
                // Draw filled circle for planet body
                 this.drawCircle(screenX, screenY, planetRadiusScreen, GLYPHS.BLOCK, planetColor, planetColor);
            }
        });

        // --- Draw Starbase ---
        if (system.starbase) {
            const relBaseX = system.starbase.systemX - player.systemX;
            const relBaseY = system.starbase.systemY - player.systemY;
            const screenX = viewCenterX + Math.round(relBaseX / systemScale);
            const screenY = viewCenterY + Math.round(relBaseY / systemScale);
            const baseRadiusScreen = CONFIG.PLANET_MAIN_VIEW_RADIUS; // Same size as planets

            // Basic culling
            if (screenX + baseRadiusScreen >= 0 && screenX - baseRadiusScreen < this.cols &&
                screenY + baseRadiusScreen >= 0 && screenY - baseRadiusScreen < this.rows)
            {
                // Draw starbase icon - use drawCircle for consistency, maybe with different char/bg
                 // Using a darker background to differentiate
                 const starbaseBg = '#222266'; // Dark blue/purple maybe?
                 this.drawCircle(screenX, screenY, baseRadiusScreen, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOR, starbaseBg);
            }
        }

        // --- Draw Player ---
        // Draw player last, ensuring it's on top
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Transparent background

        // --- Draw Minimap ---
        this.drawSystemMinimap(system, player);
    }

    /** Draws the minimap overlay for the system view. */
    private drawSystemMinimap(system: SolarSystem, player: Player): void {
        // Calculate minimap dimensions and position (top-right corner)
        const mapWidth = Math.max(10, Math.floor(this.cols * CONFIG.MINIMAP_SIZE_FACTOR));
        const mapHeight = mapWidth; // Keep it square
        const mapX = this.cols - mapWidth - 1; // X position of map area
        const mapY = 1;                       // Y position of map area
        const mapMaxX = mapX + mapWidth - 1;  // Right edge
        const mapMaxY = mapY + mapHeight - 1; // Bottom edge

        // Draw border box - ensure background is cleared
         this.drawBox(
             mapX - 1, mapY - 1,             // Position of border top-left
             mapWidth + 2, mapHeight + 2,    // Size of border
             CONFIG.STATUS_BAR_FG_COLOR,     // Border colour
             null,                           // Border background (transparent)
             ' ',                            // Fill character (space)
             null,                           // Fill foreground (none)
             CONFIG.DEFAULT_BG_COLOR         // Fill background (clear inside map area)
         );


        // --- Map Scaling ---
        const maxDist = system.edgeRadius; // Use system's edge radius for scale
        if (maxDist <= 0) return; // Avoid division by zero

        // Fit the edgeRadius within the map's drawing area radius
        const mapDrawableRadius = Math.min(mapWidth, mapHeight) / 2 * 0.95; // Leave a small margin
        const mapScale = maxDist / mapDrawableRadius; // World units per minimap cell radius
        if (mapScale <= 0) return;

        const mapCenterX = mapX + Math.floor(mapWidth / 2);
        const mapCenterY = mapY + Math.floor(mapHeight / 2);

        // --- Draw Minimap Contents ---
        // Draw orbits first
        system.planets.forEach((planet) => {
            if (!planet) return;
            const orbitMapRadius = planet.orbitDistance / mapScale;
            this.drawOrbit(mapCenterX, mapCenterY, orbitMapRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOR_MINIMAP, mapX, mapY, mapMaxX, mapMaxY);
        });
        if (system.starbase) {
            const orbitMapRadius = system.starbase.orbitDistance / mapScale;
            this.drawOrbit(mapCenterX, mapCenterY, orbitMapRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOR, mapX, mapY, mapMaxX, mapMaxY); // Highlight starbase orbit
        }

        // Draw star at center
        const starData = SPECTRAL_TYPES[system.starType];
        if (starData) {
            this.drawChar(starData.char, mapCenterX, mapCenterY, starData.color, null);
        }

        // Draw planets
        system.planets.forEach((planet) => {
            if (!planet) return;
            const pMapX = mapCenterX + Math.round(planet.systemX / mapScale);
            const pMapY = mapCenterY + Math.round(planet.systemY / mapScale);

            // Check if within map bounds
            if (pMapX >= mapX && pMapX <= mapMaxX && pMapY >= mapY && pMapY <= mapMaxY) {
                const planetPalette = PLANET_TYPES[planet.type]?.colors;
                const planetColor = planetPalette ? planetPalette[Math.floor(planetPalette.length / 2)] : '#FFFFFF';
                 // Avoid drawing over the central star character
                if (pMapX !== mapCenterX || pMapY !== mapCenterY) {
                    // Use a simple dot or specific icon for planets on minimap
                    this.drawChar('.', pMapX, pMapY, planetColor, null);
                }
            }
        });

        // Draw starbase
        if (system.starbase) {
            const bMapX = mapCenterX + Math.round(system.starbase.systemX / mapScale);
            const bMapY = mapCenterY + Math.round(system.starbase.systemY / mapScale);
             if (bMapX >= mapX && bMapX <= mapMaxX && bMapY >= mapY && bMapY <= mapMaxY) {
                 if (bMapX !== mapCenterX || bMapY !== mapCenterY) { // Avoid star overlap
                      this.drawChar(GLYPHS.STARBASE_ICON, bMapX, bMapY, CONFIG.STARBASE_COLOR, null);
                 }
             }
        }

        // Draw player position indicator
        const plMapX = mapCenterX + Math.round(player.systemX / mapScale);
        const plMapY = mapCenterY + Math.round(player.systemY / mapScale);
         if (plMapX >= mapX && plMapX <= mapMaxX && plMapY >= mapY && plMapY <= mapMaxY) {
             // Use a distinct character for the player, ensuring it draws over orbits/planets
             this.drawChar('+', plMapX, plMapY, CONFIG.PLAYER_COLOR, null);
         }
    }


    /** Draws the surface view of a planet or the interior of a starbase. */
    drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
        // --- Type-Specific Rendering ---
        if (landedObject instanceof Planet && (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant')) {
            this.drawGasGiantSurface(player, landedObject);
            return;
        }
        if (landedObject instanceof Starbase || landedObject.type === 'Starbase') { // Check instance and type defensively
             // Ensure landedObject is treated as Starbase type if possible
            this.drawStarbaseInterior(player, landedObject as Starbase);
            return;
        }

        // --- Standard Solid Planet Surface Rendering ---
        const planet = landedObject as Planet; // Now we know it should be a solid Planet

        // Ensure surface data is ready (might throw error if generation fails)
        try {
            // This should have been called before entering 'planet' state, but check again
            planet.ensureSurfaceReady();
            // Validate that data exists after ensureSurfaceReady completes
             if (!planet.heightmap || !planet.heightLevelColors) {
                  throw new Error("Surface data (heightmap or colours) still missing after ensureSurfaceReady.");
             }
        } catch (error) {
            console.error(`Error preparing surface for ${planet.name}:`, error);
            // Display error state on screen
            this.updateStatus(`Error rendering surface: ${error instanceof Error ? error.message : String(error)}`);
            for (let i = 0; i < this.newBuffer.length; i++) {
                 this.newBuffer[i] = { char: '!', fg: '#FF0000', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false };
            }
            return; // Stop rendering this frame
        }

        const map = planet.heightmap!; // Assert non-null after check/try-catch
        const heightColors = planet.heightLevelColors!; // Assert non-null
        const mapSize = map.length;

        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);

        // Calculate top-left map coordinates based on player position and view center
        // Player surface coordinates are the center of the view
        const startMapX = Math.floor(player.surfaceX - viewCenterX);
        const startMapY = Math.floor(player.surfaceY - viewCenterY);

        // Draw terrain
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const mapX = startMapX + x;
                const mapY = startMapY + y;

                // Wrap coordinates around the map edges
                const wrappedMapX = (mapX % mapSize + mapSize) % mapSize;
                const wrappedMapY = (mapY % mapSize + mapSize) % mapSize;

                let height = map[wrappedMapY]?.[wrappedMapX] ?? 0; // Use optional chaining and default value
                height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, height)); // Clamp height

                // Get colour for the height level
                const terrainColor = heightColors[height] || '#FF00FF'; // Use magenta for invalid height index

                // Draw using solid block character, colour represents terrain
                this.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor);
            }
        }

        // Draw Player over the terrain
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Transparent background

        // Draw Altitude Legend
        this.drawHeightmapLegend(planet);
    }


    /** Draws the swirling clouds of a gas giant. */
    private drawGasGiantSurface(player: Player, planet: Planet): void {
        // Ensure colour data is ready
        if (!planet.rgbPaletteCache) {
            try {
                 planet.ensureSurfaceReady(); // This should populate rgbPaletteCache for gas giants
                 if (!planet.rgbPaletteCache) throw new Error("RGB Palette cache missing after ensureSurfaceReady");
            } catch (error) {
                 console.error(`Error preparing gas giant visuals for ${planet.name}:`, error);
                 // Display error state
                 this.updateStatus(`Error rendering gas giant: ${error instanceof Error ? error.message : String(error)}`);
                 for (let i = 0; i < this.newBuffer.length; i++) {
                      this.newBuffer[i] = { char: '!', fg: '#FF00FF', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false };
                 }
                 return;
            }
        }
        const rgbPalette = planet.rgbPaletteCache!; // Assert non-null
        const numColors = rgbPalette.length;
        if (numColors < 1) return; // Cannot draw if palette is empty

        // --- Cloud Generation Parameters (use planet's PRNG for consistency) ---
        const cloudPRNG = planet.systemPRNG.seedNew('clouds');
        const bandScaleY = 0.02 + cloudPRNG.random(-0.01, 0.01); // Vertical scale of bands
        const bandFrequency = 0.05 + cloudPRNG.random(-0.02, 0.02); // How many bands
        const bandWobble = cloudPRNG.random(2, 10); // How much bands distort horizontally
        const detailScale = 0.15; // Scale for smaller swirls/details

        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);

        // Use player surface X/Y as offsets into a virtual 'cloud map'
        const startMapX = Math.floor(player.surfaceX - viewCenterX);
        const startMapY = Math.floor(player.surfaceY - viewCenterY);

        for (let y = 0; y < this.rows; y++) {
            const mapY = startMapY + y;
            // Use large modulus for pseudo-infinite wrapping
            const wrappedMapY = (mapY % 1024 + 1024) % 1024;

            for (let x = 0; x < this.cols; x++) {
                const mapX = startMapX + x;
                const wrappedMapX = (mapX % 1024 + 1024) % 1024;

                // --- Noise Calculation ---
                // Horizontal band modulation based on Y coordinate
                const bandModulation = Math.sin(wrappedMapY * bandFrequency) * bandWobble;
                // Large scale noise for bands, incorporating modulation
                const bandNoise = Perlin.get(wrappedMapX * 0.005, wrappedMapY * bandScaleY + bandModulation);
                // Finer scale noise for details
                const detailNoise = Perlin.get(wrappedMapX * detailScale, wrappedMapY * detailScale);

                // Combine noise values (adjust weights as needed)
                let finalNoise = bandNoise * 0.7 + detailNoise * 0.3;
                // Normalize noise roughly to 0-1
                finalNoise = (finalNoise + 0.7) / 1.4; // Adjust normalization based on Perlin output range if needed
                finalNoise = Math.max(0, Math.min(1, finalNoise));

                // --- Colour Selection ---
                const colorIndexFloat = finalNoise * (numColors - 1);
                const index1 = Math.max(0, Math.min(numColors - 1, Math.floor(colorIndexFloat)));
                const index2 = Math.min(numColors - 1, index1 + 1);
                const factor = colorIndexFloat - index1;

                let cloudRgb: RgbColour;
                 if (index1 === index2 || numColors < 2) {
                     cloudRgb = rgbPalette[index1];
                 } else {
                     cloudRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor);
                 }

                const cloudColor = rgbToHex(cloudRgb.r, cloudRgb.g, cloudRgb.b);

                // Draw cloud cell
                this.drawChar(GLYPHS.BLOCK, x, y, cloudColor, cloudColor);
            }
        }

        // Draw Player over the clouds
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null); // Transparent background
    }


    /** Draws the generic interior of a starbase. */
    private drawStarbaseInterior(player: Player, starbase: Starbase): void {
        // Simple procedural background for starbase interior
        const bgColor = '#222233'; // Dark blue/grey base
        const detailColor = '#555577'; // Lighter details
        const highlightColor = CONFIG.STARBASE_COLOR; // Use configured starbase colour

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                // Base background
                let char: string = GLYPHS.SHADE_LIGHT;
                let fg = detailColor;
                let bg = bgColor;

                // Add some variation based on coordinates (e.g., floor panels, wall details)
                if (x % 10 < 2 || y % 6 < 1) { // Floor/wall panels
                    bg = '#282840'; // Slightly different bg colour
                    char = '.';
                }
                if (x % 20 == 5 || y % 12 == 3) { // Random blinking lights?
                    fg = highlightColor;
                    char = '+';
                }
                // Central area (docking bay?)
                if (Math.abs(x - this.cols / 2) < 5 && Math.abs(y - this.rows / 2) < 3) {
                    bg = '#444455'; // Different floor/area colour
                    fg = '#9999AA';
                    char = GLYPHS.SHADE_MEDIUM;
                }

                this.drawChar(char, x, y, fg, bg);
            }
        }

        // Draw player in the center docking area
        const viewCenterX = Math.floor(this.cols / 2);
        const viewCenterY = Math.floor(this.rows / 2);
         // Ensure player bg matches the central area background
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, '#444455');

        // Draw available actions at the bottom
         // Position actions relative to bottom edge
         const actionYBase = this.rows - 3;
         this.drawString("[T] Trade", 5, actionYBase, CONFIG.STATUS_BAR_FG_COLOR, bgColor);
         this.drawString("[R] Refuel", 5, actionYBase + 1, CONFIG.STATUS_BAR_FG_COLOR, bgColor);
         this.drawString("[L] Liftoff", 5, actionYBase + 2, CONFIG.STATUS_BAR_FG_COLOR, bgColor);
    }

     /** Draws the altitude legend for solid planet surfaces. */
     private drawHeightmapLegend(planet: Planet): void {
        // Ensure data exists and it's not a gas giant/starbase
        if (!planet.heightLevelColors || planet.type === 'GasGiant' || planet.type === 'IceGiant' || planet.type === 'Starbase') {
            return;
        }

        const legendWidth = 2; // Width of the colour bar
        const legendHeight = Math.min(16, Math.floor(this.rows * 0.5)); // Height, max 16 or 50% of screen
        const legendX = this.cols - legendWidth - 2; // Position near right edge
        const legendY = Math.floor((this.rows - legendHeight) / 2); // Center vertically

        const heightColors = planet.heightLevelColors!; // Assert non-null

        // Draw border box around the legend, clearing background
         this.drawBox(
             legendX - 1, legendY - 1,             // Border position
             legendWidth + 2, legendHeight + 2,    // Border size
             CONFIG.STATUS_BAR_FG_COLOR,     // Border colour
             null,                           // Transparent border background
             ' ',                            // Fill char (space)
             null,                           // Fill fg (none)
             CONFIG.DEFAULT_BG_COLOR         // Fill bg (clear inside)
         );

        // Draw "Alt" label above
        this.drawString("Alt", legendX, legendY - 2, CONFIG.STATUS_BAR_FG_COLOR, null);

        // Draw the colour scale bar
        for (let i = 0; i < legendHeight; i++) {
            // Map legend row index (0 to height-1) to normalized height (1 to 0)
            const normHeight = (legendHeight > 1) ? 1 - (i / (legendHeight - 1)) : 1;
            // Map normalized height to heightmap level index
            const heightIndex = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(normHeight * (CONFIG.PLANET_HEIGHT_LEVELS - 1))));

            const legendColor = heightColors[heightIndex] || '#FF00FF'; // Get colour, fallback magenta

            // Draw a segment of the colour bar
            for (let w = 0; w < legendWidth; w++) {
                this.drawChar(GLYPHS.BLOCK, legendX + w, legendY + i, legendColor, legendColor);
            }
        }

        // Draw Max/Min labels
         this.drawString("Max", legendX + legendWidth + 1, legendY, CONFIG.STATUS_BAR_FG_COLOR, null);
         this.drawString("Min", legendX + legendWidth + 1, legendY + legendHeight - 1, CONFIG.STATUS_BAR_FG_COLOR, null);
    }
}