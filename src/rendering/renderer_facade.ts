import { RenderStats, ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { getNebulaColourProvider } from './nebula_colour_provider';
import { HyperspaceRenderStats, SceneRenderer, SurfaceVehicleOverlayModel } from './scene_renderer';
import { StatusBarUpdater as ImportedStatusBarUpdater } from './status_bar_updater'; // Keep alias
import { CommandStripUpdater } from './command_strip_updater';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { logger } from '../utils/logger';
import { CONFIG } from '../config';
import {
  CommandStripUpdateEvent,
  eventManager,
  GameEvents,
  StatusUpdateEvent,
  Unsubscribe,
} from '../core/event_manager';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { StarbaseScreenModel } from '../core/starbase_ui';
import { OrbitScreenModel } from '../core/orbit_ui';
import { HyperspaceSurveyService } from '../core/hyperspace_survey';
import { TextModalTableModel } from '../core/text_ui';
import { TEXT_PALETTE } from './text_palette';
import { createPlayerViewSnapshot, SceneViewModel } from './scene_view_model';

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
  private readonly eventUnsubscribers: Unsubscribe[];

  /** Initializes RendererFacade. */
  constructor(
    canvasId: string,
    statusBarId: string,
    systemDataGenerator: SystemDataGenerator,
    hyperspaceSurveyService: HyperspaceSurveyService | null = null
  ) {
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
    this.nebulaRenderer = new NebulaRenderer(getNebulaColourProvider());
    this.statusBarUpdater = new ImportedStatusBarUpdater(statusBarElement); // Use alias
    this.commandStripUpdater = commandStripElement ? new CommandStripUpdater(commandStripElement) : null;
    this.sceneRenderer = new SceneRenderer(
      this.screenBuffer,
      this.drawingContext,
      this.nebulaRenderer,
      systemDataGenerator,
      hyperspaceSurveyService
    );

    this.eventUnsubscribers = [
      eventManager.subscribe(GameEvents.STATUS_UPDATE_NEEDED, (data) => {
        this._handleStatusUpdate(data);
      }),
      eventManager.subscribe(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, (data) => {
        this._handleCommandStripUpdate(data);
      }),
    ];

    logger.info('[RendererFacade] All components instantiated.');
    this.fitToScreen(); // Initial size calculation
    logger.info('[RendererFacade] Construction complete.');
  }

  /** Returns canvas. */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Returns context. */
  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /** Returns char width px. */
  public getCharWidthPx(): number {
    return this.screenBuffer.getCharWidthPx();
  }

  /** Returns char height px. */
  public getCharHeightPx(): number {
    return this.screenBuffer.getCharHeightPx();
  }

  /** Returns grid cols. */
  public getGridCols(): number {
    return this.screenBuffer.getCols();
  }

  /** Returns grid rows. */
  public getGridRows(): number {
    return this.screenBuffer.getRows();
  }

  /** Handler for the statusUpdateNeeded event. */
  private _handleStatusUpdate(data: StatusUpdateEvent): void {
    logger.debug(
      `[RendererFacade:_handleStatusUpdate] Received STATUS_UPDATE_NEEDED with message: "${data.message}"`
    );
    this.statusBarUpdater.updateStatus(data.message, data.hasStarbase);
  }

  /** Handles command strip update. */
  private _handleCommandStripUpdate(data: CommandStripUpdateEvent): void {
    if (!this.commandStripUpdater) return;
    if (data.commandBar) {
      this.commandStripUpdater.update(data.commandBar);
    } else {
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
    const roughCommandStripHeightPx =
      this.commandStripUpdater?.getElement().offsetHeight || baseCharHeight * 1.45 + 8;

    const availableHeight = Math.max(
      100,
      window.innerHeight - roughStatusBarHeightPx - roughCommandStripHeightPx
    ); // Subtract UI chrome
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
    const finalStatusBarHeightPx =
      this.statusBarUpdater.getStatusBarElement().offsetHeight || roughStatusBarHeightPx;
    const finalCommandStripHeightPx =
      this.commandStripUpdater?.getElement().offsetHeight || roughCommandStripHeightPx;

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

  /** Returns last render stats. */
  getLastRenderStats(): RenderStats {
    return this.screenBuffer.getLastRenderStats();
  }

  /** Returns last hyperspace render stats. */
  getLastHyperspaceRenderStats(): HyperspaceRenderStats {
    return this.sceneRenderer.getLastHyperspaceRenderStats();
  }

  /** Updates the text content of the status bar element. (This method is now primarily called internally via event) */
  // updateStatus(message: string, hasStarbase: boolean): void {
  //   this.statusBarUpdater.updateStatus(message, hasStarbase);
  // }
  // Keep the method if direct calls might still be needed, but Game should use events now.

  /** Draws a string horizontally starting at (x, y) using ScreenBuffer's drawString. */
  drawString(text: string, x: number, y: number, fgColor?: string | null, bgColor?: string | null): void {
    // Delegate directly to screenBuffer for basic string drawing
    this.screenBuffer.drawString(
      text,
      x,
      y,
      fgColor ?? null,
      bgColor ?? this.screenBuffer.getDefaultBgColor()
    );
  }

  /** Draws char. */
  drawChar(
    char: string | null,
    x: number,
    y: number,
    fgColor?: string | null,
    bgColor?: string | null
  ): void {
    this.screenBuffer.drawChar(char, x, y, fgColor ?? null, bgColor ?? this.screenBuffer.getDefaultBgColor());
  }

  /** Draws scene. */
  drawScene(scene: SceneViewModel): void {
    switch (scene.kind) {
      case 'hyperspace':
        this.sceneRenderer.drawHyperspace(scene.player);
        return;
      case 'system':
        this.sceneRenderer.drawSolarSystem(scene.player, scene.system, scene.viewScale);
        return;
      case 'orbit':
        this.sceneRenderer.drawOrbitInterface(scene.model);
        return;
      case 'surface':
        this.sceneRenderer.drawPlanetSurface(scene.player, scene.body, scene.overlay);
        return;
      case 'starbase':
        this.sceneRenderer.drawStarbaseInterface(scene.player, scene.starbase, scene.model);
        return;
    }
  }

  // --- Scene Drawing Method Delegation (Remains the same) ---
  /** Draws hyperspace. */
  drawHyperspace(player: Player): void {
    this.sceneRenderer.drawHyperspace(createPlayerViewSnapshot(player));
  }
  /** Draws solar system. */
  drawSolarSystem(player: Player, system: SolarSystem, currentViewScale: number): void {
    //const currentViewScale = CONFIG.DEFAULT_VIEW_SCALE; // Use the newly added property
    this.sceneRenderer.drawSolarSystem(createPlayerViewSnapshot(player), system, currentViewScale);
  }
  /** Draws planet surface. */
  drawPlanetSurface(
    player: Player,
    landedObject: Planet | Starbase,
    surfaceOverlay?: SurfaceVehicleOverlayModel
  ): void {
    this.sceneRenderer.drawPlanetSurface(createPlayerViewSnapshot(player), landedObject, surfaceOverlay);
  }
  /** Draws starbase interface. */
  drawStarbaseInterface(player: Player, starbase: Starbase, model: StarbaseScreenModel): void {
    this.sceneRenderer.drawStarbaseInterface(createPlayerViewSnapshot(player), starbase, model);
  }
  /** Draws orbit interface. */
  drawOrbitInterface(model: OrbitScreenModel): void {
    this.sceneRenderer.drawOrbitInterface(model);
  }
  /** Draws text modal table. */
  drawTextModalTable(model: TextModalTableModel): void {
    this.sceneRenderer.drawTextModalTable(model);
  }
  // --- Popup Drawing Method ---
  /** Draws a popup window with animations and typing text effect. */
  drawPopup(
    lines: string[] | null,
    state: 'inactive' | 'opening' | 'active' | 'closing',
    openCloseProgress: number,
    textProgress: number
  ): void {
    // Animate the popup dimensions before revealing its typed text.
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
        TEXT_PALETTE.cyanBorder, // Border colour
        TEXT_PALETTE.panelBackground, // Background for the border chars themselves
        ' ', // Fill character
        TEXT_PALETTE.text, // FG for fill char (doesn't matter)
        TEXT_PALETTE.panelBackground // Background colour for the inside area
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
        const textStartX = isCloseLine
          ? startX + Math.floor((currentWidth - line.length) / 2)
          : textStartXBase;

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
              isCloseLine ? TEXT_PALETTE.amber : TEXT_PALETTE.text, // Text colour
              TEXT_PALETTE.panelBackground // Background *behind* the text
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
  /** Releases resources owned by. */
  destroy(): void {
    logger.info('[RendererFacade] Destroying instance and cleaning up listeners...');
    this.eventUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }
} // End RendererFacade class
