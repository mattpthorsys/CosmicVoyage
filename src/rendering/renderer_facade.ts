// src/rendering/renderer_facade.ts (Subscribe to status events)

import { RenderStats, ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { SceneRenderer } from './scene_renderer';
import { StatusBarUpdater as ImportedStatusBarUpdater } from './status_bar_updater'; // Keep alias
import { CommandStripUpdater } from './command_strip_updater';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { logger } from '../utils/logger';
import { CONFIG } from '../config';
import { eventManager, GameEvents } from '../core/event_manager'; // Import Event Manager
import { SystemDataGenerator } from '../generation/system_data_generator';
import { StarbaseScreenModel } from '../core/starbase_ui';
import { OrbitScreenModel } from '../core/orbit_ui';

/**
 * Facade class for the rendering system.
 * Initializes and coordinates the different rendering components.
 * Provides the main interface for the Game class to interact with rendering.
 */
export class RendererFacade {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenBuffer: ScreenBuffer; // Main buffer
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;
  private sceneRenderer: SceneRenderer;
  private statusBarUpdater: ImportedStatusBarUpdater; // Use imported alias
  private commandStripUpdater: CommandStripUpdater | null = null;

  constructor(canvasId: string, statusBarId: string, systemDataGenerator: SystemDataGenerator) {
    logger.info('[RendererFacade] Constructing instance...');
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    const statusBarElement = document.getElementById(statusBarId) as HTMLElement | null;
    const commandStripElement = document.getElementById('commandStrip') as HTMLElement | null;

    // Validate canvas and context (same as before)
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
    const ctx = canvas.getContext('2d', { alpha: true }); // Ensure alpha for transparency between layers
    if (!ctx) {
      const msg = 'Failed to get 2D rendering context from canvas.';
      logger.error(`[RendererFacade] ${msg}`);
      throw new Error(msg);
    }

    this.canvas = canvas;
    this.ctx = ctx;

    // Initialize components (same as before)
    this.screenBuffer = new ScreenBuffer(this.canvas, this.ctx, false);
    this.drawingContext = new DrawingContext(this.screenBuffer);
    this.nebulaRenderer = new NebulaRenderer();
    this.statusBarUpdater = new ImportedStatusBarUpdater(statusBarElement); // Use alias
    this.commandStripUpdater = commandStripElement ? new CommandStripUpdater(commandStripElement) : null;
    this.sceneRenderer = new SceneRenderer(this.screenBuffer, this.drawingContext, this.nebulaRenderer, systemDataGenerator);

    // *** Subscribe to Status Updates ***
    eventManager.subscribe(GameEvents.STATUS_UPDATE_NEEDED, this._handleStatusUpdate.bind(this));
    eventManager.subscribe(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, this._handleCommandStripUpdate.bind(this));

    logger.info('[RendererFacade] All components instantiated.');
    this.fitToScreen(); // Initial size calculation
    logger.info('[RendererFacade] Construction complete.');
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public getCharWidthPx(): number {
    return this.screenBuffer.getCharWidthPx();
  }

  public getCharHeightPx(): number {
    return this.screenBuffer.getCharHeightPx();
  }

  /** Handler for the statusUpdateNeeded event. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handleStatusUpdate(data: any): void {
    logger.debug(`[RendererFacade:_handleStatusUpdate] Received STATUS_UPDATE_NEEDED with message: "${data?.message}"`);
    if (data && typeof data.message === 'string' && typeof data.hasStarbase === 'boolean') {
      // Directly call the StatusBarUpdater's method
      this.statusBarUpdater.updateStatus(data.message, data.hasStarbase);
    } else {
      logger.warn('[RendererFacade] Received invalid data for statusUpdateNeeded event:', data);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handleCommandStripUpdate(data: any): void {
    if (!this.commandStripUpdater) return;
    if (data && Array.isArray(data.actions)) {
      this.commandStripUpdater.update(data.actions, data.primaryActionId, data.targetName);
    }
  }

  /** Adjusts canvas size and rendering parameters to fit the window or container. */
  fitToScreen(): void {
    logger.debug('[RendererFacade.fitToScreen] Adjusting...');
    const baseCharHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
    const baseCharWidth = baseCharHeight * CONFIG.CHAR_ASPECT_RATIO;

    // Estimate status bar height based on character size BEFORE setting final canvas size
    const roughStatusBarHeightPx =
      this.statusBarUpdater.getStatusBarElement().offsetHeight || baseCharHeight * 0.85 * 1.4 * 3 + 10; // Fallback estimate
    const roughCommandStripHeightPx = this.commandStripUpdater?.getElement().offsetHeight || baseCharHeight * 1.45 + 8;

    const availableHeight = Math.max(100, window.innerHeight - roughStatusBarHeightPx - roughCommandStripHeightPx); // Subtract UI chrome
    const availableWidth = Math.max(100, window.innerWidth);

    const cols = Math.max(1, Math.floor(availableWidth / baseCharWidth));
    const rows = Math.max(1, Math.floor(availableHeight / baseCharHeight));

    const charWidthPx = baseCharWidth; // Use calculated char width
    const charHeightPx = baseCharHeight; // Use calculated char height

    // Set canvas physical pixel dimensions
    this.canvas.width = cols * charWidthPx;
    this.canvas.height = rows * charHeightPx;

    // Update internal buffers and context settings
    this.screenBuffer.updateDimensions(cols, rows, charWidthPx, charHeightPx);

    // Update status bar internal calculations AFTER setting its font size etc.
    this.statusBarUpdater.updateMaxChars(charWidthPx, charHeightPx);
    this.commandStripUpdater?.updateMaxChars(charWidthPx, charHeightPx);

    // Recalculate final status bar height AFTER updateMaxChars applied styles
    const finalStatusBarHeightPx = this.statusBarUpdater.getStatusBarElement().offsetHeight || roughStatusBarHeightPx;
    const finalCommandStripHeightPx = this.commandStripUpdater?.getElement().offsetHeight || roughCommandStripHeightPx;

    // Center the canvas dynamically using margins
    this.canvas.style.marginLeft = `${Math.max(0, (window.innerWidth - this.canvas.width) / 2)}px`;
    this.canvas.style.marginTop = `${Math.max(
      0,
      // Calculate top margin based on available space minus canvas and FINAL status bar height
      (window.innerHeight - finalStatusBarHeightPx - finalCommandStripHeightPx - this.canvas.height) / 2
    )}px`;

    this.nebulaRenderer.clearCache(); // Clear nebula cache on resize
    this.sceneRenderer.clearCaches();
    this.screenBuffer.clear(false);

    logger.info(
      `[RendererFacade.fitToScreen] Resized complete. Grid: ${cols}x${rows}, Canvas: ${this.canvas.width}x${this.canvas.height}px, Avail: ${availableWidth}x${availableHeight}px`
    );
  }

  /** Resets internal buffers and optionally clears the physical canvas. */
  clear(physicalClear: boolean = true): void {
    this.screenBuffer.clear(physicalClear);
  }

  /** Renders the entire main scene buffer. */
  renderBufferFull(): void {
    this.screenBuffer.renderFull();
  }

  getLastRenderStats(): RenderStats {
    return this.screenBuffer.getLastRenderStats();
  }

  /** Updates the text content of the status bar element. (This method is now primarily called internally via event) */
  // updateStatus(message: string, hasStarbase: boolean): void {
  //   this.statusBarUpdater.updateStatus(message, hasStarbase);
  // }
  // Keep the method if direct calls might still be needed, but Game should use events now.

  /** Draws a string horizontally starting at (x, y) using ScreenBuffer's drawString. */
  drawString(text: string, x: number, y: number, fgColor?: string | null, bgColor?: string | null): void {
    // Delegate directly to screenBuffer for basic string drawing
    this.screenBuffer.drawString(text, x, y, fgColor ?? null, bgColor ?? this.screenBuffer.getDefaultBgColor());
  }

  // --- Scene Drawing Method Delegation (Remains the same) ---
  drawHyperspace(player: Player): void {
    this.sceneRenderer.drawHyperspace(player);
  }
  drawSolarSystem(player: Player, system: SolarSystem, currentViewScale: number): void {
    //const currentViewScale = CONFIG.DEFAULT_VIEW_SCALE; // Use the newly added property
    this.sceneRenderer.drawSolarSystem(player, system, currentViewScale);
  }
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    this.sceneRenderer.drawPlanetSurface(player, landedObject);
  }
  drawStarbaseInterface(player: Player, starbase: Starbase, model: StarbaseScreenModel): void {
    this.sceneRenderer.drawStarbaseInterface(player, starbase, model);
  }
  drawOrbitInterface(model: OrbitScreenModel): void {
    this.sceneRenderer.drawOrbitInterface(model);
  }
  // --- Popup Drawing Method ---
  /** Draws a popup window with animations and typing text effect. */
  drawPopup(
    lines: string[] | null,
    state: 'inactive' | 'opening' | 'active' | 'closing',
    openCloseProgress: number,
    textProgress: number
  ): void {
    // (Popup drawing logic remains the same as previous version)
    if (state === 'inactive' || !lines || lines.length === 0) {
      return;
    }

    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();

    // Calculate Target Dimensions (based on full content)
    const closeText = CONFIG.POPUP_CLOSE_TEXT;
    const contentHeight = lines.length;
    const contentWidth = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const finalPopupWidth = Math.max(contentWidth, closeText.length) + CONFIG.POPUP_PADDING_X * 2;
    const finalPopupHeight = contentHeight + CONFIG.POPUP_PADDING_Y * 2;
    const clampedWidth = Math.min(cols - 2, finalPopupWidth); // Ensure fits on screen slightly
    const clampedHeight = Math.min(rows - 2, finalPopupHeight);

    // Calculate Current Dimensions based on Animation Progress
    let currentWidth: number;
    let currentHeight: number;

    if (state === 'opening' || state === 'closing') {
      // Use a smooth easing function (e.g., ease-out cubic) for progress
      const easedProgress = 1 - Math.pow(1 - openCloseProgress, 3);
      currentWidth = Math.max(1, Math.floor(clampedWidth * easedProgress));
      currentHeight = Math.max(1, Math.floor(clampedHeight * easedProgress));
    } else {
      // 'active' state
      currentWidth = clampedWidth;
      currentHeight = clampedHeight;
    }

    // Ensure odd dimensions for centering (optional)
    // currentWidth = currentWidth % 2 === 0 ? currentWidth + 1 : currentWidth;
    // currentHeight = currentHeight % 2 === 0 ? currentHeight + 1 : currentHeight;
    currentWidth = Math.min(cols, currentWidth); // Clamp again
    currentHeight = Math.min(rows, currentHeight);

    // Calculate Centered Top-Left Corner
    const startX = Math.floor((cols - currentWidth) / 2);
    const startY = Math.floor((rows - currentHeight) / 2);

    // Draw the Box
    if (currentWidth > 0 && currentHeight > 0) {
      this.drawingContext.drawBox(
        startX,
        startY,
        currentWidth,
        currentHeight,
        CONFIG.POPUP_BORDER_COLOUR, // Border Colour (fg)
        CONFIG.POPUP_BG_COLOUR, // Background for the border chars themselves
        ' ', // Fill character
        CONFIG.POPUP_FG_COLOUR, // FG for fill char (doesn't matter)
        CONFIG.POPUP_BG_COLOUR // Background colour for the inside area
      );
    }

    // Draw Text (Only when 'active' and fully open)
    if (state === 'active' && currentWidth === clampedWidth && currentHeight === clampedHeight) {
      const textStartXBase = startX + CONFIG.POPUP_PADDING_X;
      const textStartY = startY + CONFIG.POPUP_PADDING_Y;
      let charactersDrawn = 0;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const isCloseLine = line === '← Close →'; // Check if it's the special close line

        // Calculate starting X for centering the close line
        let textStartX = isCloseLine ? startX + Math.floor((currentWidth - line.length) / 2) : textStartXBase;

        for (let charIndex = 0; charIndex < line.length; charIndex++) {
          if (charactersDrawn >= textProgress) break; // Stop drawing characters for this frame

          const char = line[charIndex];
          const drawX = textStartX + charIndex;
          const drawY = textStartY + lineIndex;

          // Check if within the *current* box bounds before drawing character
          if (
            drawX >= startX + 1 &&
            drawX < startX + currentWidth - 1 &&
            drawY >= startY + 1 &&
            drawY < startY + currentHeight - 1
          ) {
            this.screenBuffer.drawChar(
              char,
              drawX,
              drawY,
              CONFIG.POPUP_FG_COLOUR, // Text colour
              CONFIG.POPUP_BG_COLOUR // Background *behind* the text
            );
          }
          charactersDrawn++;
        }
        if (charactersDrawn >= textProgress) break; // Stop drawing lines for this frame
        // Add a newline character count between lines for textProgress calculation
        if (lineIndex < lines.length - 1) {
          charactersDrawn++;
        }
      }
    }
  }

  /** Renders only the changed cells of the main screen buffer to the canvas. */
  renderDiff(): void {
    // Delegate the call to the main screen buffer's renderDiff method
    this.screenBuffer.renderDiff();
  }

  // Optional: Method to clean up listeners if the facade is ever destroyed
  destroy(): void {
    logger.info('[RendererFacade] Destroying instance and cleaning up listeners...');
    eventManager.unsubscribe(GameEvents.STATUS_UPDATE_NEEDED, this._handleStatusUpdate.bind(this));
    eventManager.unsubscribe(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, this._handleCommandStripUpdate.bind(this));
    // Unsubscribe from any other events if necessary
  }
} // End RendererFacade class
