// src/rendering/renderer_facade.ts

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { SceneRenderer } from './scene_renderer';
// Note: Using the aliased import name provided in your code
import { StatusBarUpdater as ImportedStatusBarUpdater } from './status_bar_updater';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { logger } from '../utils/logger';
import { CONFIG } from '../config';

/**
 * Facade class for the rendering system.
 * Initializes and coordinates the different rendering components.
 * Provides the main interface for the Game class to interact with rendering.
 */
export class RendererFacade {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenBuffer: ScreenBuffer;
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;
  private sceneRenderer: SceneRenderer;
  private statusBarUpdater: ImportedStatusBarUpdater; // Using the imported alias

  constructor(canvasId: string, statusBarId: string) {
    logger.info('[RendererFacade] Constructing...');

    // --- Get DOM Elements ---
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    const statusBarElement = document.getElementById(statusBarId) as HTMLElement | null;

    if (!canvas || typeof canvas.getContext !== 'function') {
      const msg = `Canvas element "#${canvasId}" not found or not supported.`;
      logger.error(`[RendererFacade] ${msg}`);
      throw new Error(msg);
    }
    if (!statusBarElement) {
      const msg = `Status bar element "#${statusBarId}" not found.`;
      logger.error(`[RendererFacade] ${msg}`);
      throw new Error(msg);
    }
    const ctx = canvas.getContext('2d', { alpha: false }); // Disable alpha for potential perf boost
    if (!ctx) {
      const msg = 'Failed to get 2D rendering context from canvas.';
      logger.error(`[RendererFacade] ${msg}`);
      throw new Error(msg);
    }

    this.canvas = canvas;
    this.ctx = ctx;

    // --- Instantiate Rendering Components ---
    // Order matters: ScreenBuffer needs canvas/context first.
    this.screenBuffer = new ScreenBuffer(this.canvas, this.ctx);
    this.drawingContext = new DrawingContext(this.screenBuffer);
    this.nebulaRenderer = new NebulaRenderer();
    // Use the aliased import name here
    this.statusBarUpdater = new ImportedStatusBarUpdater(statusBarElement);
    // SceneRenderer needs the others
    this.sceneRenderer = new SceneRenderer(
      this.screenBuffer,
      this.drawingContext,
      this.nebulaRenderer
    );

    logger.info('[RendererFacade] All components instantiated.');

    // Perform initial screen fit
    this.fitToScreen();
    logger.info('[RendererFacade] Construction complete.');
  }

  /** Adjusts canvas size and rendering parameters to fit the window or container. */
  fitToScreen(): void {
    logger.debug('[RendererFacade.fitToScreen] Adjusting...');

    // Calculate character size based on config
    const baseCharHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
    const baseCharWidth = baseCharHeight * CONFIG.CHAR_ASPECT_RATIO;

    // Estimate status bar height roughly first to calculate available space
    const roughStatusBarHeightPx = baseCharHeight * 0.85 * 1.4 * 3 + 10; // ~3 lines + padding
    const availableHeight = Math.max(100, window.innerHeight - roughStatusBarHeightPx); // Min height
    const availableWidth = Math.max(100, window.innerWidth); // Min width

    // Determine grid size
    const cols = Math.max(1, Math.floor(availableWidth / baseCharWidth));
    const rows = Math.max(1, Math.floor(availableHeight / baseCharHeight));
    const charWidthPx = baseCharWidth;
    const charHeightPx = baseCharHeight;

    // Update canvas dimensions
    this.canvas.width = cols * charWidthPx;
    this.canvas.height = rows * charHeightPx;

    // Update ScreenBuffer dimensions and context font
    this.screenBuffer.updateDimensions(cols, rows, charWidthPx, charHeightPx);

    // Update status bar (calculates max chars based on new dimensions)
    this.statusBarUpdater.updateMaxChars(charWidthPx, charHeightPx);

    // Center canvas horizontally and position vertically above status bar
    // Using your updated logic with getStatusBarElement()
    const finalStatusBarHeightPx = this.statusBarUpdater.getStatusBarElement().offsetHeight || roughStatusBarHeightPx;
    this.canvas.style.marginLeft = `${Math.max(0, (window.innerWidth - this.canvas.width) / 2)}px`;
    this.canvas.style.marginTop = `${Math.max(
      0,
      (window.innerHeight - finalStatusBarHeightPx - this.canvas.height) / 2
    )}px`;

    // Clear nebula cache on resize as background needs redraw
    this.nebulaRenderer.clearCache();

    logger.info(
      `[RendererFacade.fitToScreen] Resized complete. Grid: ${cols}x${rows}`
    );
  }

  /** Resets the drawing buffers and optionally clears the physical canvas. */
  clear(physicalClear: boolean = true): void {
    this.screenBuffer.clear(physicalClear);
  }

  /** Compares the new buffer to the screen buffer and draws only the changed cells. */
  renderDiff(): void {
    this.screenBuffer.renderDiff();
  }

  /** Updates the text content of the status bar element.  */
  updateStatus(message: string, hasStarbase: boolean): void {
    this.statusBarUpdater.updateStatus(message, hasStarbase);
  }

  // --- Basic Drawing Method Delegation ---

  /**
   * Draws a string horizontally starting at (x, y) onto the buffer.
   * Delegates to ScreenBuffer.
   */
  drawString(
    text: string,
    x: number,
    y: number,
    fgColor?: string | null, // Optional colors, defaults handled by ScreenBuffer
    bgColor?: string | null
  ): void {
    // Pass defaults as null if not provided, ScreenBuffer will use its own defaults
    this.screenBuffer.drawString(text, x, y, fgColor === undefined ? null : fgColor, bgColor === undefined ? null : bgColor);
  }

  // --- Scene Drawing Method Delegation ---

  drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
    this.sceneRenderer.drawHyperspace(player, gameSeedPRNG);
  }

  drawSolarSystem(player: Player, system: SolarSystem): void {
    this.sceneRenderer.drawSolarSystem(player, system);
  }

  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    this.sceneRenderer.drawPlanetSurface(player, landedObject);
  }

  // Add other potential methods if needed, e.g., drawing UI elements directly
}