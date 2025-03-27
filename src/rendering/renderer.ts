// src/rendering/renderer.ts

import { CONFIG } from '../config';
// Removed MineralRichness, Added SPECTRAL_DISTRIBUTION
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, SPECTRAL_DISTRIBUTION } from '../constants';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { Perlin } from '../generation/perlin';
import { RgbColour, hexToRgb, rgbToHex, interpolateColour, adjustBrightness } from './colour';

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
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) { throw new Error("Failed to get 2D rendering context from canvas."); }

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
        this.fitToScreen();
        console.log("Renderer initialized.");
    }

    /** Initializes or re-initializes the screen buffers based on current dimensions. */
    private _initBuffers(): void { /* ... unchanged ... */
         const size = this.cols * this.rows;
         if (size <= 0) { console.warn(`Invalid dimensions: ${this.cols}x${this.rows}`); this.screenBuffer = []; this.newBuffer = []; return; }
         console.log(`Initializing buffers for ${this.cols}x${this.rows} (${size} cells)`);
         if (size > 1000000) { console.error(`Excessive buffer size: ${size}.`); this.screenBuffer = []; this.newBuffer = []; this.cols = 0; this.rows = 0; return; }
         this.screenBuffer = new Array(size).fill(this.defaultCellState);
         this.newBuffer = new Array(size).fill(this.defaultCellState);
     }

    /** Adjusts canvas size and rendering parameters to fit the window. */
    fitToScreen(): void { /* ... unchanged ... */
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
        } catch (e) { console.warn("Could not calculate status bar width.", e); this.statusBarMaxChars = 240; }
        if (this.cols !== oldCols || this.rows !== oldRows) { this._initBuffers(); }
        this.nebulaColourCache = {}; this.nebulaCacheSize = 0; Perlin.seed();
        console.log(`Grid size: ${this.cols}x${this.rows}, Char size: ${this.charWidthPx.toFixed(1)}x${this.charHeightPx.toFixed(1)}, Status Max Chars: ${this.statusBarMaxChars}`);
     }

    /** Resets the drawing buffers and optionally clears the physical canvas. */
    clear(physicalClear: boolean = true): void { /* ... unchanged ... */
         if (physicalClear) { this.ctx.fillStyle = this.bgColor; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); console.log("Physical canvas clear."); }
         for (let i = 0; i < this.screenBuffer.length; i++) { this.screenBuffer[i] = this.defaultCellState; this.newBuffer[i] = this.defaultCellState; }
         console.log("Drawing buffers reset.");
     }

    /** Sets a character in the new drawing buffer at (x, y). */
    drawChar( char: string | null, x: number, y: number, fgColor: string | null = this.fgColor, bgColor: string | null = this.bgColor): void { /* ... unchanged ... */
         x = Math.floor(x); y = Math.floor(y);
         if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) { return; }
         const index = y * this.cols + x;
         if(index < 0 || index >= this.newBuffer.length) { console.warn(`Draw out of bounds [${x}, ${y}]`); return; }
         const isTransparent = (bgColor === null);
         const finalBgColor = isTransparent ? null : (bgColor || CONFIG.DEFAULT_BG_COLOR);
         this.newBuffer[index] = { char: char || ' ', fg: fgColor || CONFIG.DEFAULT_FG_COLOR, bg: finalBgColor, isTransparentBg: isTransparent };
     }

    /** Draws a string horizontally starting at (x, y). */
    drawString( text: string, x: number, y: number, fgColor: string | null = this.fgColor, bgColor: string | null = null ): void { /* Defaulted bgColor to null (transparent) */
        for (let i = 0; i < text.length; i++) { this.drawChar(text[i], x + i, y, fgColor, bgColor); }
     }

    /** Draws a box with borders and optional fill. */
     drawBox( x: number, y: number, width: number, height: number, fgColor: string | null = this.fgColor, bgColor: string | null = null, fillChar: string | null = null, fillFg: string | null = fgColor, fillBg: string | null = bgColor): void { /* ... unchanged ... */
         x = Math.floor(x); y = Math.floor(y); width = Math.max(0, Math.floor(width)); height = Math.max(0, Math.floor(height));
         if (width === 0 || height === 0) return;
         const endX = x + width; const endY = y + height;
         for (let row = y; row < endY; row++) {
             for (let col = x; col < endX; col++) {
                 let char: string | null = ' '; let currentFg = fgColor; let currentBg = bgColor;
                 let isBorder = (row === y || row === endY - 1 || col === x || col === endX - 1);
                 if (isBorder) {
                     currentFg = fgColor; currentBg = bgColor;
                     if (row === y) { char = (col === x) ? GLYPHS.BOX.TL : (col === endX - 1) ? GLYPHS.BOX.TR : GLYPHS.BOX.H; }
                     else if (row === endY - 1) { char = (col === x) ? GLYPHS.BOX.BL : (col === endX - 1) ? GLYPHS.BOX.BR : GLYPHS.BOX.H; }
                     else { char = (col === x || col === endX - 1) ? GLYPHS.BOX.V : ' '; }
                     if (width === 1 && height === 1) char = GLYPHS.BOX.H;
                     else if (width === 1) char = (row === y) ? GLYPHS.BOX.TL : (row === endY - 1) ? GLYPHS.BOX.BL : GLYPHS.BOX.V;
                     else if (height === 1) char = (col === x) ? GLYPHS.BOX.TL : (col === endX - 1) ? GLYPHS.BOX.TR : GLYPHS.BOX.H;
                 } else {
                     if (fillChar) { char = fillChar; currentFg = fillFg; currentBg = fillBg; }
                     else {
                          if (fillBg !== null) { char = ' '; currentFg = null; currentBg = fillBg; }
                          else if (bgColor !== null) { char = ' '; currentFg = null; currentBg = bgColor; }
                          else { continue; } // Skip if no fill and transparent bg
                     }
                 }
                 this.drawChar(char, col, row, currentFg, currentBg);
             }
         }
    }

    /** Draws a filled circle using a specified character. */
    drawCircle( cx: number, cy: number, radius: number, char: string, fg: string | null, bg: string | null = fg ): void { /* ... unchanged ... */
         cx = Math.round(cx); cy = Math.round(cy); radius = Math.max(0, Math.round(radius));
         const radSq = radius * radius;
         const startY = Math.max(0, Math.floor(cy - radius)); const endY = Math.min(this.rows - 1, Math.ceil(cy + radius));
         const startX = Math.max(0, Math.floor(cx - radius)); const endX = Math.min(this.cols - 1, Math.ceil(cx + radius));
         for (let y = startY; y <= endY; y++) {
             for (let x = startX; x <= endX; x++) {
                 const dx = x - cx + 0.5; const dy = y - cy + 0.5; const distSq = dx * dx + dy * dy;
                 if (distSq <= radSq) { this.drawChar(char, x, y, fg, bg); }
             }
         }
     }

    /** Draws an orbit outline using Midpoint Circle Algorithm, respecting bounds. */
    drawOrbit( cx: number, cy: number, radius: number, char: string, color: string | null, minX: number = 0, minY: number = 0, maxX: number = this.cols - 1, maxY: number = this.rows - 1): void { /* ... unchanged ... */
         cx = Math.round(cx); cy = Math.round(cy); radius = Math.max(0, Math.round(radius));
         if (radius <= 0) { if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) { this.drawChar(char, cx, cy, color, null); } return; }
         let x = radius; let y = 0; let err = 1 - radius;
         const plot = (px: number, py: number) => {
             px = Math.round(px); py = Math.round(py);
             if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                 const index = py * this.cols + px;
                  if (index >= 0 && index < this.newBuffer.length) {
                      const currentCell = this.newBuffer[index];
                      if (currentCell === this.defaultCellState || currentCell.char === ' ' || currentCell.bg === CONFIG.DEFAULT_BG_COLOR) { this.drawChar(char, px, py, color, null); }
                  }
             }
         };
         while (x >= y) {
             plot(cx + x, cy + y); plot(cx - x, cy + y); plot(cx + x, cy - y); plot(cx - x, cy - y);
             plot(cx + y, cy + x); plot(cx - y, cy + x); plot(cx + y, cy - x); plot(cx - y, cy - x);
             y++; if (err <= 0) { err += 2 * y + 1; } else { x--; err += 2 * (y - x) + 1; }
         }
     }

    /** Physically draws a single character to the canvas context. */
    private _physicalDrawChar( char: string | null, x: number, y: number, fgColor: string | null, bgColor: string | null, isTransparentBg: boolean, oldBgColor: string | null): void { /* ... unchanged ... */
         const drawX = x * this.charWidthPx; const drawY = y * this.charHeightPx;
         let fillStyle: string;
         if (isTransparentBg) { fillStyle = oldBgColor || CONFIG.DEFAULT_BG_COLOR; }
         else { fillStyle = bgColor || CONFIG.DEFAULT_BG_COLOR; }
         if (char === GLYPHS.BLOCK && !isTransparentBg) { fillStyle = fgColor || CONFIG.DEFAULT_FG_COLOR; }
         this.ctx.fillStyle = fillStyle; this.ctx.fillRect(drawX, drawY, this.charWidthPx, this.charHeightPx);
         if (char && char !== ' ' && char !== GLYPHS.BLOCK && fgColor) { this.ctx.fillStyle = fgColor; const yOffset = this.charHeightPx * 0.05; this.ctx.fillText(char, drawX, drawY + yOffset); }
         else if (char === GLYPHS.BLOCK && isTransparentBg && fgColor) { this.ctx.fillStyle = fgColor; this.ctx.fillRect(drawX, drawY, this.charWidthPx, this.charHeightPx); }
     }

    /** Compares the new buffer to the screen buffer and draws only the changed cells. */
    renderDiff(): void { /* ... unchanged ... */
         let cellsDrawn = 0; const size = this.cols * this.rows;
         if (size !== this.newBuffer.length || size !== this.screenBuffer.length) { console.error("Buffer size mismatch!"); this.fitToScreen(); return; }
         for (let i = 0; i < size; i++) {
             const oldState = this.screenBuffer[i]; const newState = this.newBuffer[i];
             if (oldState === this.defaultCellState && newState === this.defaultCellState) { continue; }
             if (oldState.char === newState.char && oldState.fg === newState.fg && oldState.bg === newState.bg && oldState.isTransparentBg === newState.isTransparentBg) { continue; }
             const y = Math.floor(i / this.cols); const x = i % this.cols;
             this._physicalDrawChar(newState.char, x, y, newState.fg, newState.bg, newState.isTransparentBg, oldState.bg);
             cellsDrawn++; this.screenBuffer[i] = newState; this.newBuffer[i] = this.defaultCellState; // Reset new buffer cell
         }
     }

    /** Updates the text content of the status bar element. */
    updateStatus(message: string): void { /* ... unchanged ... */
         if (!this.statusBar) return;
         const maxChars = this.statusBarMaxChars > 0 ? this.statusBarMaxChars : 240;
         const truncatedMessage = message.length > maxChars ? message.substring(0, maxChars - 3) + '...' : message;
         if (this.statusBar.textContent !== truncatedMessage) { this.statusBar.textContent = truncatedMessage; }
     }

    // --- Scene Drawing Methods ---

    /** Draws the hyperspace view centered on the player. */
    drawHyperspace(player: Player, gameSeedPRNG: PRNG): void { /* Added SPECTRAL_DISTRIBUTION import usage */
        const BLOCK_SIZE = Math.max(1, CONFIG.CELL_BLOCK_SIZE || 1);
        const viewCenterX = Math.floor(this.cols / 2); const viewCenterY = Math.floor(this.rows / 2);
        const startWorldX = player.worldX - viewCenterX; const startWorldY = player.worldY - viewCenterY;
        const localNebulaCache = this.nebulaColourCache; const maxCache = this.maxNebulaCacheSize;
        const cachePrecision = CONFIG.NEBULA_CACHE_PRECISION; const nebulaScale = CONFIG.NEBULA_SCALE;
        const nebulaIntensity = CONFIG.NEBULA_INTENSITY; const nebulaBaseColours = CONFIG.NEBULA_COLORS;
        const defaultBgRgb = hexToRgb(CONFIG.DEFAULT_BG_COLOR);
        const frameNebulaCache: NebulaColourCache = {};

        const getNebulaColour = (wx: number, wy: number): string => { /* ... unchanged ... */
             const cacheKey = `${wx.toFixed(cachePrecision)},${wy.toFixed(cachePrecision)}`;
             if (frameNebulaCache.hasOwnProperty(cacheKey)) return frameNebulaCache[cacheKey];
             if (localNebulaCache.hasOwnProperty(cacheKey)) { frameNebulaCache[cacheKey] = localNebulaCache[cacheKey]; return localNebulaCache[cacheKey]; }
             const noiseVal = Perlin.get(wx * nebulaScale, wy * nebulaScale); const normalizedNoise = Math.max(0, Math.min(1, (noiseVal + 0.7) / 1.4));
             const colorIndexFloat = normalizedNoise * (nebulaBaseColours.length - 1); const index1 = Math.max(0, Math.min(nebulaBaseColours.length - 1, Math.floor(colorIndexFloat)));
             const index2 = Math.min(nebulaBaseColours.length - 1, index1 + 1); const factor = colorIndexFloat - index1;
             let baseNebColour = nebulaBaseColours[index1];
              if(index1 < nebulaBaseColours.length && index2 < nebulaBaseColours.length && index1 !== index2) { baseNebColour = interpolateColour(nebulaBaseColours[index1], nebulaBaseColours[index2], factor); }
              else if (index1 < nebulaBaseColours.length) { baseNebColour = nebulaBaseColours[index1]; }
             let finalHexColour: string;
             if (nebulaIntensity > 0) { const finalRgb = interpolateColour(defaultBgRgb, baseNebColour, normalizedNoise * nebulaIntensity); finalHexColour = rgbToHex(finalRgb.r, finalRgb.g, finalRgb.b); }
             else { finalHexColour = CONFIG.DEFAULT_BG_COLOR; }
             if (this.nebulaCacheSize < maxCache) { localNebulaCache[cacheKey] = finalHexColour; this.nebulaCacheSize++; }
             else if (Math.random() < 0.005) { const randomKeyIndex = Math.floor(Math.random() * this.nebulaCacheSize); const randomKey = Object.keys(localNebulaCache)[randomKeyIndex]; if (randomKey) { delete localNebulaCache[randomKey]; localNebulaCache[cacheKey] = finalHexColour; } }
             frameNebulaCache[cacheKey] = finalHexColour; return finalHexColour;
         };

        const baseSeedInt = gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const getStarPRNG = (wx: number, wy: number): PRNG => gameSeedPRNG.seedNew(`star_${wx},${wy}`);

        for (let y = 0; y < this.rows; y += BLOCK_SIZE) {
            for (let x = 0; x < this.cols; x += BLOCK_SIZE) {
                const blockWorldX = startWorldX + x; const blockWorldY = startWorldY + y;
                const blockBgColor = getNebulaColour(blockWorldX, blockWorldY);
                for (let subY = 0; subY < BLOCK_SIZE; subY++) {
                    const currentY = y + subY; if (currentY >= this.rows) continue;
                    const cellWorldY = startWorldY + currentY;
                    for (let subX = 0; subX < BLOCK_SIZE; subX++) {
                        const currentX = x + subX; if (currentX >= this.cols) continue;
                        const cellWorldX = startWorldX + currentX;
                        let fgColor: string | null = CONFIG.DEFAULT_FG_COLOR; let char: string | null = ' ';
                        const hash = fastHash(cellWorldX, cellWorldY, baseSeedInt);
                        if ((hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold) {
                            const starPRNG = getStarPRNG(cellWorldX, cellWorldY);
                            // USE IMPORTED SPECTRAL_DISTRIBUTION
                            const spectralClass = starPRNG.choice(SPECTRAL_DISTRIBUTION);
                            // Indexing should work now
                            const starData = spectralClass ? SPECTRAL_TYPES[spectralClass] : null;
                            if (starData) { const baseRgb = hexToRgb(starData.color); const finalColorRGB = adjustBrightness(baseRgb, starData.brightness); fgColor = rgbToHex(finalColorRGB.r, finalColorRGB.g, finalColorRGB.b); char = starData.char; }
                            else { fgColor = '#FF00FF'; char = '?'; }
                        }
                        this.drawChar(' ', currentX, currentY, null, blockBgColor);
                        if (char !== ' ') { this.drawChar(char, currentX, currentY, fgColor, null); }
                    }
                }
            }
        }
        const playerBgColor = getNebulaColour(player.worldX, player.worldY);
        this.drawChar(' ', viewCenterX, viewCenterY, null, playerBgColor);
        this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null);
    }

    /** Draws the solar system view centered on the player. (Removed gameSeedPRNG param) */
    drawSolarSystem(player: Player, system: SolarSystem): void { /* ... unchanged logic inside, just removed param */
         for (let i = 0; i < this.newBuffer.length; i++) { this.newBuffer[i] = { ...this.defaultCellState, bg: CONFIG.DEFAULT_BG_COLOR }; }
         const viewCenterX = Math.floor(this.cols / 2); const viewCenterY = Math.floor(this.rows / 2); const systemScale = CONFIG.SYSTEM_VIEW_SCALE;
         const relStarX = 0 - player.systemX; const relStarY = 0 - player.systemY; const starScreenX = viewCenterX + Math.round(relStarX / systemScale); const starScreenY = viewCenterY + Math.round(relStarY / systemScale);
         const maxScreenDim = Math.max(this.cols, this.rows);
         system.planets.forEach((planet) => { if (!planet) return; const orbitRadiusScreen = planet.orbitDistance / systemScale; if (orbitRadiusScreen < maxScreenDim * 1.5) { this.drawOrbit(starScreenX, starScreenY, orbitRadiusScreen, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOR_MAIN); } });
         if (system.starbase) { const orbitRadiusScreen = system.starbase.orbitDistance / systemScale; if (orbitRadiusScreen < maxScreenDim * 1.5) { this.drawOrbit(starScreenX, starScreenY, orbitRadiusScreen, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOR); } }
         const starData = SPECTRAL_TYPES[system.starType];
         if (starData && starScreenX >= 0 && starScreenX < this.cols && starScreenY >= 0 && starScreenY < this.rows) { const finalColorRGB = adjustBrightness(hexToRgb(starData.color), starData.brightness * 0.8); this.drawChar(starData.char, starScreenX, starScreenY, rgbToHex(finalColorRGB.r, finalColorRGB.g, finalColorRGB.b), null); }
         system.planets.forEach((planet) => { if (!planet) return; const relPlanetX = planet.systemX - player.systemX; const relPlanetY = planet.systemY - player.systemY; const screenX = viewCenterX + Math.round(relPlanetX / systemScale); const screenY = viewCenterY + Math.round(relPlanetY / systemScale); const planetRadiusScreen = CONFIG.PLANET_MAIN_VIEW_RADIUS; if (screenX + planetRadiusScreen >= 0 && screenX - planetRadiusScreen < this.cols && screenY + planetRadiusScreen >= 0 && screenY - planetRadiusScreen < this.rows) { const planetPalette = PLANET_TYPES[planet.type]?.colors; const planetColor = planetPalette ? planetPalette[Math.floor(planetPalette.length / 2)] : '#FFFFFF'; this.drawCircle(screenX, screenY, planetRadiusScreen, GLYPHS.BLOCK, planetColor, planetColor); } });
         if (system.starbase) { const relBaseX = system.starbase.systemX - player.systemX; const relBaseY = system.starbase.systemY - player.systemY; const screenX = viewCenterX + Math.round(relBaseX / systemScale); const screenY = viewCenterY + Math.round(relBaseY / systemScale); const baseRadiusScreen = CONFIG.PLANET_MAIN_VIEW_RADIUS; if (screenX + baseRadiusScreen >= 0 && screenX - baseRadiusScreen < this.cols && screenY + baseRadiusScreen >= 0 && screenY - baseRadiusScreen < this.rows) { const starbaseBg = '#222266'; this.drawCircle(screenX, screenY, baseRadiusScreen, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOR, starbaseBg); } }
         this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null);
         this.drawSystemMinimap(system, player);
    }

    /** Draws the minimap overlay for the system view. */
    private drawSystemMinimap(system: SolarSystem, player: Player): void { /* ... unchanged ... */
        const mapWidth = Math.max(10, Math.floor(this.cols * CONFIG.MINIMAP_SIZE_FACTOR)); const mapHeight = mapWidth;
        const mapX = this.cols - mapWidth - 1; const mapY = 1; const mapMaxX = mapX + mapWidth - 1; const mapMaxY = mapY + mapHeight - 1;
        this.drawBox( mapX - 1, mapY - 1, mapWidth + 2, mapHeight + 2, CONFIG.STATUS_BAR_FG_COLOR, null, ' ', null, CONFIG.DEFAULT_BG_COLOR );
        const maxDist = system.edgeRadius; if (maxDist <= 0) return;
        const mapDrawableRadius = Math.min(mapWidth, mapHeight) / 2 * 0.95; const mapScale = maxDist / mapDrawableRadius; if (mapScale <= 0) return;
        const mapCenterX = mapX + Math.floor(mapWidth / 2); const mapCenterY = mapY + Math.floor(mapHeight / 2);
        system.planets.forEach((planet) => { if (!planet) return; const orbitMapRadius = planet.orbitDistance / mapScale; this.drawOrbit(mapCenterX, mapCenterY, orbitMapRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOR_MINIMAP, mapX, mapY, mapMaxX, mapMaxY); });
        if (system.starbase) { const orbitMapRadius = system.starbase.orbitDistance / mapScale; this.drawOrbit(mapCenterX, mapCenterY, orbitMapRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOR, mapX, mapY, mapMaxX, mapMaxY); }
        const starData = SPECTRAL_TYPES[system.starType]; if (starData) { this.drawChar(starData.char, mapCenterX, mapCenterY, starData.color, null); }
        system.planets.forEach((planet) => { if (!planet) return; const pMapX = mapCenterX + Math.round(planet.systemX / mapScale); const pMapY = mapCenterY + Math.round(planet.systemY / mapScale); if (pMapX >= mapX && pMapX <= mapMaxX && pMapY >= mapY && pMapY <= mapMaxY) { const planetPalette = PLANET_TYPES[planet.type]?.colors; const planetColor = planetPalette ? planetPalette[Math.floor(planetPalette.length / 2)] : '#FFFFFF'; if (pMapX !== mapCenterX || pMapY !== mapCenterY) { this.drawChar('.', pMapX, pMapY, planetColor, null); } } });
        if (system.starbase) { const bMapX = mapCenterX + Math.round(system.starbase.systemX / mapScale); const bMapY = mapCenterY + Math.round(system.starbase.systemY / mapScale); if (bMapX >= mapX && bMapX <= mapMaxX && bMapY >= mapY && bMapY <= mapMaxY) { if (bMapX !== mapCenterX || bMapY !== mapCenterY) { this.drawChar(GLYPHS.STARBASE_ICON, bMapX, bMapY, CONFIG.STARBASE_COLOR, null); } } }
        const plMapX = mapCenterX + Math.round(player.systemX / mapScale); const plMapY = mapCenterY + Math.round(player.systemY / mapScale); if (plMapX >= mapX && plMapX <= mapMaxX && plMapY >= mapY && plMapY <= mapMaxY) { this.drawChar('+', plMapX, plMapY, CONFIG.PLAYER_COLOR, null); }
     }

    /** Draws the surface view of a planet or the interior of a starbase. */
    drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void { /* ... unchanged ... */
         if (landedObject instanceof Planet && (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant')) { this.drawGasGiantSurface(player, landedObject); return; }
         if (landedObject instanceof Starbase) { this.drawStarbaseInterior(player); return; } // Pass only player now
         const planet = landedObject as Planet;
         try {
             planet.ensureSurfaceReady(); if (!planet.heightmap || !planet.heightLevelColors) { throw new Error("Surface data still missing."); }
         } catch (error) {
             console.error(`Error preparing surface for ${planet.name}:`, error); this.updateStatus(`Error rendering surface: ${error instanceof Error ? error.message : String(error)}`);
             for (let i = 0; i < this.newBuffer.length; i++) { this.newBuffer[i] = { char: '!', fg: '#FF0000', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false }; } return;
         }
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

    /** Draws the swirling clouds of a gas giant. */
    private drawGasGiantSurface(player: Player, planet: Planet): void { /* ... unchanged ... */
         if (!planet.rgbPaletteCache) {
             try { planet.ensureSurfaceReady(); if (!planet.rgbPaletteCache) throw new Error("RGB Palette cache missing"); }
             catch (error) { console.error(`Error preparing gas giant visuals ${planet.name}:`, error); this.updateStatus(`Error rendering gas giant: ${error instanceof Error ? error.message : String(error)}`); for (let i = 0; i < this.newBuffer.length; i++) { this.newBuffer[i] = { char: '!', fg: '#FF00FF', bg: CONFIG.DEFAULT_BG_COLOR, isTransparentBg: false }; } return; }
         }
         const rgbPalette = planet.rgbPaletteCache!; const numColors = rgbPalette.length; if (numColors < 1) return;
         const cloudPRNG = planet.systemPRNG.seedNew('clouds'); const bandScaleY = 0.02+cloudPRNG.random(-0.01,0.01); const bandFrequency = 0.05+cloudPRNG.random(-0.02,0.02); const bandWobble = cloudPRNG.random(2,10); const detailScale = 0.15;
         const viewCenterX = Math.floor(this.cols / 2); const viewCenterY = Math.floor(this.rows / 2);
         const startMapX = Math.floor(player.surfaceX - viewCenterX); const startMapY = Math.floor(player.surfaceY - viewCenterY);
         for (let y = 0; y < this.rows; y++) {
             const mapY = startMapY + y; const wrappedMapY = (mapY % 1024 + 1024) % 1024;
             for (let x = 0; x < this.cols; x++) {
                 const mapX = startMapX + x; const wrappedMapX = (mapX % 1024 + 1024) % 1024;
                 const bandModulation = Math.sin(wrappedMapY * bandFrequency) * bandWobble; const bandNoise = Perlin.get(wrappedMapX * 0.005, wrappedMapY * bandScaleY + bandModulation); const detailNoise = Perlin.get(wrappedMapX * detailScale, wrappedMapY * detailScale);
                 let finalNoise = bandNoise * 0.7 + detailNoise * 0.3; finalNoise = Math.max(0, Math.min(1, (finalNoise + 0.7) / 1.4));
                 const colorIndexFloat = finalNoise * (numColors - 1); const index1 = Math.max(0, Math.min(numColors - 1, Math.floor(colorIndexFloat))); const index2 = Math.min(numColors - 1, index1 + 1); const factor = colorIndexFloat - index1;
                 let cloudRgb: RgbColour; if (index1 === index2 || numColors < 2) { cloudRgb = rgbPalette[index1]; } else { cloudRgb = interpolateColour(rgbPalette[index1], rgbPalette[index2], factor); }
                 const cloudColor = rgbToHex(cloudRgb.r, cloudRgb.g, cloudRgb.b);
                 this.drawChar(GLYPHS.BLOCK, x, y, cloudColor, cloudColor);
             }
         }
         this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null);
    }

    /** Draws the generic interior of a starbase. (Removed starbase param) */
    private drawStarbaseInterior(player: Player): void { /* ... unchanged logic inside ... */
         const bgColor = '#222233'; const detailColor = '#555577'; const highlightColor = CONFIG.STARBASE_COLOR;
         for (let y = 0; y < this.rows; y++) {
             for (let x = 0; x < this.cols; x++) {
                 let char: string = GLYPHS.SHADE_LIGHT; let fg = detailColor; let bg = bgColor;
                 if (x % 10 < 2 || y % 6 < 1) { bg = '#282840'; char = '.'; } if (x % 20 == 5 || y % 12 == 3) { fg = highlightColor; char = '+'; }
                 if (Math.abs(x - this.cols / 2) < 5 && Math.abs(y - this.rows / 2) < 3) { bg = '#444455'; fg = '#9999AA'; char = GLYPHS.SHADE_MEDIUM; }
                 this.drawChar(char, x, y, fg, bg);
             }
         }
         const viewCenterX = Math.floor(this.cols / 2); const viewCenterY = Math.floor(this.rows / 2);
         this.drawChar(player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, '#444455'); // Use matching bg
         const actionYBase = this.rows - 3;
         this.drawString("[T] Trade", 5, actionYBase, CONFIG.STATUS_BAR_FG_COLOR, bgColor);
         this.drawString("[R] Refuel", 5, actionYBase + 1, CONFIG.STATUS_BAR_FG_COLOR, bgColor);
         this.drawString("[L] Liftoff", 5, actionYBase + 2, CONFIG.STATUS_BAR_FG_COLOR, bgColor);
    }

    /** Draws the altitude legend for solid planet surfaces. */
    private drawHeightmapLegend(planet: Planet): void { /* ... unchanged ... */
         if (!planet.heightLevelColors || planet.type === 'GasGiant' || planet.type === 'IceGiant' || planet.type === 'Starbase') { return; }
         const legendWidth = 2; const legendHeight = Math.min(16, Math.floor(this.rows * 0.5)); const legendX = this.cols - legendWidth - 2; const legendY = Math.floor((this.rows - legendHeight) / 2);
         const heightColors = planet.heightLevelColors!;
         this.drawBox( legendX - 1, legendY - 1, legendWidth + 2, legendHeight + 2, CONFIG.STATUS_BAR_FG_COLOR, null, ' ', null, CONFIG.DEFAULT_BG_COLOR );
         this.drawString("Alt", legendX, legendY - 2, CONFIG.STATUS_BAR_FG_COLOR, null);
         for (let i = 0; i < legendHeight; i++) {
             const normHeight = (legendHeight > 1) ? 1 - (i / (legendHeight - 1)) : 1; const heightIndex = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(normHeight * (CONFIG.PLANET_HEIGHT_LEVELS - 1))));
             const legendColor = heightColors[heightIndex] || '#FF00FF';
             for (let w = 0; w < legendWidth; w++) { this.drawChar(GLYPHS.BLOCK, legendX + w, legendY + i, legendColor, legendColor); }
         }
         this.drawString("Max", legendX + legendWidth + 1, legendY, CONFIG.STATUS_BAR_FG_COLOR, null);
         this.drawString("Min", legendX + legendWidth + 1, legendY + legendHeight - 1, CONFIG.STATUS_BAR_FG_COLOR, null);
     }
}