// src/rendering/renderer.ts (With Logging)

import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, SPECTRAL_DISTRIBUTION } from '../constants';
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
        logger.info("Constructing Renderer..."); // Log start
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
        const statusBar = document.getElementById(statusBarId) as HTMLElement | null;

        if (!canvas || typeof canvas.getContext !== 'function') {
            const msg = `Canvas element "#${canvasId}" not found or not supported.`;
            logger.error(msg); // Use logger
            throw new Error(msg);
        }
        if (!statusBar) {
            const msg = `Status bar element "#${statusBarId}" not found.`;
            logger.error(msg); // Use logger
            throw new Error(msg);
        }
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
            const msg = "Failed to get 2D rendering context from canvas.";
            logger.error(msg); // Use logger
            throw new Error(msg);
        }

        this.canvas = canvas;
        this.ctx = ctx;
        this.statusBar = statusBar;
        this.defaultCellState = Object.freeze({ char: null, fg: null, bg: null, isTransparentBg: false });
        this.bgColor = CONFIG.DEFAULT_BG_COLOR;
        this.fgColor = CONFIG.DEFAULT_FG_COLOR;
        this.statusBar.style.fontFamily = CONFIG.FONT_FAMILY;
        this.statusBar.style.color = CONFIG.STATUS_BAR_FG_COLOR;
        this.statusBar.style.backgroundColor = CONFIG.STATUS_BAR_BG_COLOR;
        this.statusBar.style.whiteSpace = 'pre-wrap';
        this.statusBar.style.lineHeight = '1.4';
        this.fitToScreen(); // This calls _initBuffers and logs internally
        logger.info("Renderer constructed successfully."); // Log success
    }

    /** Initializes or re-initializes the screen buffers based on current dimensions. */
    private _initBuffers(): void {
         const size = this.cols * this.rows;
         if (size <= 0) {
              logger.warn(`_initBuffers called with invalid dimensions: ${this.cols}x${this.rows}`); // Use logger
              this.screenBuffer = []; this.newBuffer = []; return;
         }
         logger.info(`Initializing buffers for ${this.cols}x${this.rows} (${size} cells)`); // Use info for major events
         if (size > 1000000) { // Safety limit
              logger.error(`Excessive buffer size calculated: ${size}. Aborting buffer init.`); // Use logger
              this.screenBuffer = []; this.newBuffer = []; this.cols = 0; this.rows = 0; return;
         }
         this.screenBuffer = new Array(size).fill(this.defaultCellState);
         this.newBuffer = new Array(size).fill(this.defaultCellState);
         logger.debug("Buffers initialized with default cell state."); // Use debug for details
     }

    /** Adjusts canvas size and rendering parameters to fit the window. */
    fitToScreen(): void {
        logger.debug("Renderer fitToScreen called."); // Log start
        const baseCharHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
        const baseCharWidth = baseCharHeight * CONFIG.CHAR_ASPECT_RATIO;
        const roughStatusBarHeightPx = (baseCharHeight * 0.85 * 1.4 * 3) + 10;
        const availableHeight = window.innerHeight - roughStatusBarHeightPx;
        const availableWidth = window.innerWidth;
        const oldCols = this.cols; const oldRows = this.rows;

        this.cols = Math.max(1, Math.floor(availableWidth / baseCharWidth));
        this.rows = Math.max(1, Math.floor(availableHeight / baseCharHeight));
        this.charWidthPx = baseCharWidth; this.charHeightPx = baseCharHeight;

        this.canvas.width = this.cols * this.charWidthPx; this.canvas.height = this.rows * this.charHeightPx;
        this.ctx.font = `${this.charHeightPx}px ${CONFIG.FONT_FAMILY}`; this.ctx.textBaseline = 'top';

        const finalStatusBarHeightPx = (this.charHeightPx * 0.85 * 1.4 * 3) + 10;
        this.canvas.style.marginLeft = `${Math.max(0, (window.innerWidth - this.canvas.width) / 2)}px`;
        this.canvas.style.marginTop = `${Math.max(0, (window.innerHeight - finalStatusBarHeightPx - this.canvas.height) / 2)}px`;

        const sbFontSize = this.charHeightPx * 0.85;
        this.statusBar.style.fontSize = `${sbFontSize}px`;
        this.statusBar.style.height = `calc(${sbFontSize * 1.4 * 3}px + 10px)`;
        this.statusBar.style.padding = `5px ${this.charWidthPx}px`;

        try {
            const approxCharWidthInBar = this.charWidthPx * 0.85;
            const availableBarWidth = (this.statusBar.offsetWidth || window.innerWidth) - (parseFloat(this.statusBar.style.paddingLeft || '0') * 2);
            this.statusBarMaxChars = Math.max(20, Math.floor(availableBarWidth / approxCharWidthInBar)) * 3;
        } catch (e) { logger.warn("Could not calculate status bar width.", e); this.statusBarMaxChars = 240; } // Use logger

        if (this.cols !== oldCols || this.rows !== oldRows) {
             logger.info(`Screen resized to ${this.cols}x${this.rows} grid.`);
             this._initBuffers(); // This logs internally
        }

        this.nebulaColourCache = {}; this.nebulaCacheSize = 0;
        logger.debug("Reseeding Perlin noise due to resize.");
        Perlin.seed(); // Perlin logs internally

        // Log final dimensions
        logger.info(`Grid size: ${this.cols}x${this.rows}, Char size: ${this.charWidthPx.toFixed(1)}x${this.charHeightPx.toFixed(1)}, Status Max Chars: ${this.statusBarMaxChars}`);
     }

    /** Resets the drawing buffers and optionally clears the physical canvas. */
    clear(physicalClear: boolean = true): void {
         if (physicalClear) {
             this.ctx.fillStyle = this.bgColor;
             this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
             logger.info("Physical canvas clear performed."); // Use logger
         }
         for (let i = 0; i < this.screenBuffer.length; i++) { this.screenBuffer[i] = this.defaultCellState; this.newBuffer[i] = this.defaultCellState; }
         logger.info("Drawing buffers reset."); // Use logger
     }

    /** Sets a character in the new drawing buffer at (x, y). */
    drawChar( char: string | null, x: number, y: number, fgColor: string | null = this.fgColor, bgColor: string | null = this.bgColor): void {
         x = Math.floor(x); y = Math.floor(y);
         if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
              // logger.debug(`Attempted drawChar out of bounds: [${x}, ${y}]`); // Can be noisy
              return;
         }
         const index = y * this.cols + x;
         if(index < 0 || index >= this.newBuffer.length) {
              logger.warn(`Drawchar buffer index out of bounds: [${x}, ${y}] -> ${index}`); // Use logger
              return;
         }
         const isTransparent = (bgColor === null);
         const finalBgColor = isTransparent ? null : (bgColor || CONFIG.DEFAULT_BG_COLOR);
         this.newBuffer[index] = { char: char || ' ', fg: fgColor || CONFIG.DEFAULT_FG_COLOR, bg: finalBgColor, isTransparentBg: isTransparent };
     }

    /** Draws a string horizontally starting at (x, y). */
    drawString( text: string, x: number, y: number, fgColor: string | null = this.fgColor, bgColor: string | null = null ): void { /* unchanged */ }
    /** Draws a box with borders and optional fill. */
    drawBox( x: number, y: number, width: number, height: number, fgColor: string | null = this.fgColor, bgColor: string | null = null, fillChar: string | null = null, fillFg: string | null = fgColor, fillBg: string | null = bgColor): void { /* unchanged */ }
    /** Draws a filled circle using a specified character. */
    drawCircle( cx: number, cy: number, radius: number, char: string, fg: string | null, bg: string | null = fg ): void { /* unchanged */ }
    /** Draws an orbit outline using Midpoint Circle Algorithm, respecting bounds. */
    drawOrbit( cx: number, cy: number, radius: number, char: string, color: string | null, minX?: number, minY?: number, maxX?: number, maxY?: number): void { /* unchanged */ }
    /** Physically draws a single character to the canvas context. */
    private _physicalDrawChar( char: string | null, x: number, y: number, fgColor: string | null, bgColor: string | null, isTransparentBg: boolean, oldBgColor: string | null): void { /* unchanged */ }

    /** Compares the new buffer to the screen buffer and draws only the changed cells. */
    renderDiff(): void {
         logger.debug("renderDiff starting..."); // Log start (debug level)
         let cellsDrawn = 0; const size = this.cols * this.rows;
         if (size !== this.newBuffer.length || size !== this.screenBuffer.length) {
              logger.error("Buffer size mismatch! Screen/New length:", this.screenBuffer.length, this.newBuffer.length, "Expected:", size); // Use logger
              this.fitToScreen(); // Attempt recovery
              return;
         }
         const startTime = performance.now(); // Optional: time the diff

         for (let i = 0; i < size; i++) {
             const oldState = this.screenBuffer[i]; const newState = this.newBuffer[i];
             if (oldState === this.defaultCellState && newState === this.defaultCellState) continue;
             if (oldState.char === newState.char && oldState.fg === newState.fg && oldState.bg === newState.bg && oldState.isTransparentBg === newState.isTransparentBg) continue;
             const y = Math.floor(i / this.cols); const x = i % this.cols;
             this._physicalDrawChar(newState.char, x, y, newState.fg, newState.bg, newState.isTransparentBg, oldState.bg);
             cellsDrawn++; this.screenBuffer[i] = newState; this.newBuffer[i] = this.defaultCellState;
         }

         const endTime = performance.now();
         if (cellsDrawn > 0) {
              logger.debug(`renderDiff completed: ${cellsDrawn} cells drawn in ${(endTime - startTime).toFixed(2)} ms`); // Log cells drawn and time
         } else {
              logger.debug(`renderDiff completed: No cells changed.`);
         }
     }

    /** Updates the text content of the status bar element. */
    updateStatus(message: string): void {
         if (!this.statusBar) { logger.warn("updateStatus called but statusBar element is missing."); return; } // Add check/log
         const maxChars = this.statusBarMaxChars > 0 ? this.statusBarMaxChars : 240;
         const truncatedMessage = message.length > maxChars ? message.substring(0, maxChars - 3) + '...' : message;
         if (this.statusBar.textContent !== truncatedMessage) {
              logger.debug("Updating status bar text."); // Log when update actually happens
              this.statusBar.textContent = truncatedMessage;
         }
     }

    // --- Scene Drawing Methods ---

    drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
         logger.debug("drawHyperspace called"); // Log start
         /* ... unchanged hyperspace drawing logic ... */
    }

    drawSolarSystem(player: Player, system: SolarSystem): void {
         logger.debug(`drawSolarSystem called for system: ${system.name}`); // Log start
         /* ... unchanged solar system drawing logic ... */
    }

    private drawSystemMinimap(system: SolarSystem, player: Player): void {
         logger.debug("drawSystemMinimap called"); // Log start (debug)
         /* ... unchanged minimap drawing logic ... */
     }

    drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
        // Handle type-specific rendering first
        if (landedObject instanceof Planet && (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant')) {
             logger.debug(`Rendering Gas Giant surface for ${landedObject.name}`);
             this.drawGasGiantSurface(player, landedObject); return;
        }
        if (landedObject instanceof Starbase) {
             logger.debug(`Rendering Starbase interior for ${landedObject.name}`);
             this.drawStarbaseInterior(player); return;
        }

        // Must be a solid Planet
        const planet = landedObject as Planet;
        logger.debug(`Rendering solid planet surface for ${planet.name}`);
        try {
            // Planet's ensureSurfaceReady should log its own details/errors
            logger.debug(`Renderer calling ensureSurfaceReady for solid planet: ${planet.name}`);
            planet.ensureSurfaceReady();
            if (!planet.heightmap || !planet.heightLevelColors) { throw new Error("Surface data missing post ensureSurfaceReady."); }
        } catch (error) {
            // Log render-side failure as well
            logger.error(`Renderer failed prepare surface for ${planet.name}:`, error);
            this.updateStatus(`Render Error: ${error instanceof Error ? error.message : String(error)}`);
            // Fill screen with error indicator
            for (let i = 0; i < this.newBuffer.length; i++) { this.newBuffer[i] = { char: '!', fg: '#FF0000', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false }; }
            return; // Stop rendering this frame
        }

        // --- Standard Solid Planet Surface Rendering --- (unchanged logic)
        const map = planet.heightmap!; const heightColors = planet.heightLevelColors!; const mapSize = map.length;
        const viewCenterX = Math.floor(this.cols / 2); const viewCenterY = Math.floor(this.rows / 2);
        const startMapX = Math.floor(player.surfaceX - viewCenterX); const startMapY = Math.floor(player.surfaceY - viewCenterY);
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const mapX = startMapX + x; const mapY = startMapY + y; const wrappedMapX = (mapX % mapSize + mapSize) % mapSize; const wrappedMapY = (mapY % mapSize + mapSize) % mapSize;
                let height = map[wrappedMapY]?.[wrappedMapX] ?? 0; height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, height));
                const terrainColor = heightColors[height] || '#FF00FF';
                this.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor);
            }
        }
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null);
        this.drawHeightmapLegend(planet);
    }

    private drawGasGiantSurface(player: Player, planet: Planet): void {
         logger.debug(`Drawing gas giant surface for ${planet.name}`); // Log start
         if (!planet.rgbPaletteCache) {
             try {
                 logger.debug(`Gas giant ${planet.name} cache miss, calling ensureSurfaceReady...`);
                 planet.ensureSurfaceReady(); // Planet logs details
                 if (!planet.rgbPaletteCache) throw new Error("RGB Palette cache still missing");
             } catch (error) {
                 logger.error(`Error preparing gas giant visuals ${planet.name}:`, error);
                 this.updateStatus(`Render Error: ${error instanceof Error ? error.message : String(error)}`);
                 for (let i = 0; i < this.newBuffer.length; i++) { this.newBuffer[i] = { char: '!', fg: '#FF00FF', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false }; }
                 return;
             }
         }
         /* ... unchanged gas giant drawing logic ... */
    }

    private drawStarbaseInterior(player: Player): void {
         logger.debug("Drawing starbase interior"); // Log start
         /* ... unchanged starbase interior drawing logic ... */
    }
    private drawHeightmapLegend(planet: Planet): void {
         // This is small, logging might be noisy, add DEBUG if needed
         /* ... unchanged legend drawing logic ... */
     }
} // End Renderer Class