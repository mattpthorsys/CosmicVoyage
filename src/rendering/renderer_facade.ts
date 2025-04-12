/* FILE: src/rendering/renderer_facade.ts */
// src/rendering/renderer_facade.ts (Removed Overlay Buffer)

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { SceneRenderer } from './scene_renderer';
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
  private screenBuffer: ScreenBuffer; // Main buffer
  private backgroundScreenBuffer: ScreenBuffer; // Star background buffer
  // REMOVED: private overlayScreenBuffer: ScreenBuffer;
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;
  private sceneRenderer: SceneRenderer;
  private statusBarUpdater: ImportedStatusBarUpdater;

  // Removed createTransparentBuffers parameter as overlay is gone
  constructor(canvasId: string, statusBarId: string) {
    logger.info('[RendererFacade] Constructing instance...');
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
    // Ensure alpha is true for potential future transparency needs (like hyperspace stars)
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      const msg = 'Failed to get 2D rendering context from canvas.';
      logger.error(`[RendererFacade] ${msg}`);
      throw new Error(msg);
    }

    this.canvas = canvas;
    this.ctx = ctx;
    // Instantiate Buffers
    this.screenBuffer = new ScreenBuffer(this.canvas, this.ctx, false); // Main buffer (solid default bg)
    this.backgroundScreenBuffer = new ScreenBuffer(this.canvas, this.ctx, true); // Background buffer (transparent default)
    // REMOVED: Overlay buffer instantiation

    // Instantiate other components
    this.drawingContext = new DrawingContext(this.screenBuffer); // Targets main buffer
    this.nebulaRenderer = new NebulaRenderer();
    this.statusBarUpdater = new ImportedStatusBarUpdater(statusBarElement);
    // SceneRenderer only needs main buffer components now
    this.sceneRenderer = new SceneRenderer(
      this.screenBuffer,
      this.drawingContext,
      this.nebulaRenderer
      // REMOVED: overlayScreenBuffer argument
    );
    logger.info('[RendererFacade] All components instantiated.');

    this.fitToScreen();
    logger.info('[RendererFacade] Construction complete.');
  }

  /** Adjusts canvas size and rendering parameters to fit the window or container. */
  fitToScreen(): void {
    logger.debug('[RendererFacade.fitToScreen] Adjusting...');
    const baseCharHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
    const baseCharWidth = baseCharHeight * CONFIG.CHAR_ASPECT_RATIO;
    const roughStatusBarHeightPx = baseCharHeight * 0.85 * 1.4 * 3 + 10;
    const availableHeight = Math.max(100, window.innerHeight - roughStatusBarHeightPx);
    const availableWidth = Math.max(100, window.innerWidth);
    const cols = Math.max(1, Math.floor(availableWidth / baseCharWidth));
    const rows = Math.max(1, Math.floor(availableHeight / baseCharHeight));
    const charWidthPx = baseCharWidth;
    const charHeightPx = baseCharHeight;

    this.canvas.width = cols * charWidthPx;
    this.canvas.height = rows * charHeightPx;

    // Update buffers that still exist
    this.screenBuffer.updateDimensions(cols, rows, charWidthPx, charHeightPx);
    this.backgroundScreenBuffer.updateDimensions(cols, rows, charWidthPx, charHeightPx);
    // REMOVED: overlayScreenBuffer.updateDimensions(...)

    this.statusBarUpdater.updateMaxChars(charWidthPx, charHeightPx);

    const finalStatusBarHeightPx = this.statusBarUpdater.getStatusBarElement().offsetHeight || roughStatusBarHeightPx;
    this.canvas.style.marginLeft = `${Math.max(0, (window.innerWidth - this.canvas.width) / 2)}px`;
    this.canvas.style.marginTop = `${Math.max(
      0,
      (window.innerHeight - finalStatusBarHeightPx - this.canvas.height) / 2
    )}px`;

    this.nebulaRenderer.clearCache();
    this.backgroundScreenBuffer.clear(false);
    this.screenBuffer.clear(false);
    // REMOVED: overlayScreenBuffer.clear(false);
    logger.info(
      `[RendererFacade.fitToScreen] Resized complete. Grid: ${cols}x${rows}`
    );
  }

  /**
   * Resets internal buffers and optionally clears the physical canvas.
   */
  clear(physicalClear: boolean = true): void {
    this.screenBuffer.clear(physicalClear);
    this.backgroundScreenBuffer.clear(false);
    // REMOVED: overlayScreenBuffer.clear(false);
  }


  /** Compares the main buffer to the screen buffer and draws only the changed cells. */
  renderDiff(): void {
    this.screenBuffer.renderDiff();
  }

  /** Renders the background buffer changes. */
  renderBackgroundDiff(): void {
    this.backgroundScreenBuffer.renderDiff();
  }

  /**
   * Renders the entire content of the specified buffer.
   */
    renderBufferFull(isBackground: boolean = false): void {
        if (isBackground) {
            this.backgroundScreenBuffer.renderFull();
        } else {
            this.screenBuffer.renderFull();
        }
    }

    // REMOVED: renderOverlayFull() method

  /** Updates the text content of the status bar element. */
  updateStatus(message: string, hasStarbase: boolean): void {
    this.statusBarUpdater.updateStatus(message, hasStarbase);
  }

  // --- Basic Drawing Method Delegation (targets MAIN buffer) ---
  drawString(
    text: string,
    x: number,
    y: number,
    fgColor?: string | null,
    bgColor?: string | null
  ): void {
    this.screenBuffer.drawString(text, x, y, fgColor ?? null, bgColor ?? this.screenBuffer.getDefaultBgColor());
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
  drawStarBackground(player: Player): void {
    this.sceneRenderer.drawStarBackground(player, this.backgroundScreenBuffer);
  }
}