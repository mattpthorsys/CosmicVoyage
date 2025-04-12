/* FILE: src/rendering/renderer_facade.ts */
// src/rendering/renderer_facade.ts (Enhanced drawPopup for animations)

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
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;
  private sceneRenderer: SceneRenderer;
  private statusBarUpdater: ImportedStatusBarUpdater;

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
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      const msg = 'Failed to get 2D rendering context from canvas.';
      logger.error(`[RendererFacade] ${msg}`);
      throw new Error(msg);
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.screenBuffer = new ScreenBuffer(this.canvas, this.ctx, false);
    this.backgroundScreenBuffer = new ScreenBuffer(this.canvas, this.ctx, true);
    this.drawingContext = new DrawingContext(this.screenBuffer);
    this.nebulaRenderer = new NebulaRenderer();
    this.statusBarUpdater = new ImportedStatusBarUpdater(statusBarElement);
    this.sceneRenderer = new SceneRenderer(
      this.screenBuffer,
      this.drawingContext,
      this.nebulaRenderer
    );
    logger.info('[RendererFacade] All components instantiated.');
    this.fitToScreen();
    logger.info('[RendererFacade] Construction complete.');
  }

  /** Adjusts canvas size and rendering parameters to fit the window or container. */
  fitToScreen(): void {
    // ... (fitToScreen logic remains the same) ...
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

    this.screenBuffer.updateDimensions(cols, rows, charWidthPx, charHeightPx);
    this.backgroundScreenBuffer.updateDimensions(cols, rows, charWidthPx, charHeightPx);

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
    logger.info(
      `[RendererFacade.fitToScreen] Resized complete. Grid: ${cols}x${rows}`
    );
  }

  /** Resets internal buffers and optionally clears the physical canvas. */
  clear(physicalClear: boolean = true): void {
    this.screenBuffer.clear(physicalClear);
    this.backgroundScreenBuffer.clear(false);
  }

  /** Compares the main buffer to the screen buffer and draws only the changed cells. */
  renderDiff(): void {
    this.screenBuffer.renderDiff();
  }

  /** Renders the background buffer changes. */
  renderBackgroundDiff(): void {
    this.backgroundScreenBuffer.renderDiff();
  }

  /** Renders the entire content of the specified buffer. */
    renderBufferFull(isBackground: boolean = false): void {
        if (isBackground) {
            this.backgroundScreenBuffer.renderFull();
        } else {
            this.screenBuffer.renderFull();
        }
    }

  /** Updates the text content of the status bar element. */
  updateStatus(message: string, hasStarbase: boolean): void {
    this.statusBarUpdater.updateStatus(message, hasStarbase);
  }

  /** Draws a string horizontally starting at (x, y) using ScreenBuffer's drawString. */
  drawString(
    text: string,
    x: number,
    y: number,
    fgColor?: string | null,
    bgColor?: string | null
  ): void {
    // Delegate directly to screenBuffer for basic string drawing
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

  // --- *** UPDATED: Popup Drawing Method *** ---
  /**
   * Draws a popup window with animations and typing text effect.
   * @param lines An array of strings for the popup content.
   * @param state The current animation state ('inactive', 'opening', 'active', 'closing').
   * @param openCloseProgress A value from 0 to 1 indicating the open/close animation progress.
   * @param textProgress The number of characters to display for the typing effect.
   */
  drawPopup(
      lines: string[] | null,
      state: 'inactive' | 'opening' | 'active' | 'closing',
      openCloseProgress: number,
      textProgress: number
  ): void {
    if (state === 'inactive' || !lines || lines.length === 0) {
        return; // Don't draw if inactive or no content
    }

    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();

    // --- Calculate Target Dimensions (based on full content) ---
    const closeText = "← Close →"; // Use actual arrow characters
    const contentHeight = lines.length;
    // Ensure closeText is included in width calculation if it's longer
    const contentWidth = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const finalPopupWidth = Math.max(contentWidth, closeText.length) + CONFIG.POPUP_PADDING_X * 2;
    const finalPopupHeight = contentHeight + CONFIG.POPUP_PADDING_Y * 2;

    // Ensure dimensions don't exceed screen limits (optional, but good practice)
    const clampedWidth = Math.min(cols, finalPopupWidth);
    const clampedHeight = Math.min(rows, finalPopupHeight);

    // --- Calculate Current Dimensions based on Animation Progress ---
    let currentWidth: number;
    let currentHeight: number;

    if (state === 'opening') {
        // Grow from center outwards
        currentWidth = Math.max(1, Math.floor(clampedWidth * openCloseProgress));
        currentHeight = Math.max(1, Math.floor(clampedHeight * openCloseProgress));
    } else if (state === 'closing') {
        // Shrink towards center
        currentWidth = Math.max(1, Math.floor(clampedWidth * openCloseProgress));
        currentHeight = Math.max(1, Math.floor(clampedHeight * openCloseProgress));
    } else { // 'active' state
        currentWidth = clampedWidth;
        currentHeight = clampedHeight;
    }

    // Ensure odd dimensions for perfect centering during animation if desired
    // currentWidth = currentWidth % 2 === 0 ? currentWidth + 1 : currentWidth;
    // currentHeight = currentHeight % 2 === 0 ? currentHeight + 1 : currentHeight;
    currentWidth = Math.min(cols, currentWidth); // Clamp again after potential odd adjustment
    currentHeight = Math.min(rows, currentHeight);

    // --- Calculate Centered Top-Left Corner ---
    const startX = Math.floor((cols - currentWidth) / 2);
    const startY = Math.floor((rows - currentHeight) / 2);

    // --- Draw the Box ---
    // Only draw if dimensions are valid
    if (currentWidth > 0 && currentHeight > 0) {
        this.drawingContext.drawBox(
            startX,
            startY,
            currentWidth,
            currentHeight,
            CONFIG.POPUP_BORDER_COLOUR, // Border Colour (fg)
            CONFIG.POPUP_BG_COLOUR,     // Background for the border chars themselves
            ' ',                        // Fill character
            CONFIG.POPUP_FG_COLOUR,     // FG for fill char (doesn't matter)
            CONFIG.POPUP_BG_COLOUR      // Background colour for the inside area
        );
    }

    // --- Draw Text (Only when 'active' and fully open) ---
    if (state === 'active' && currentWidth === clampedWidth && currentHeight === clampedHeight) {
        const textStartX = startX + CONFIG.POPUP_PADDING_X;
        const textStartY = startY + CONFIG.POPUP_PADDING_Y;
        let charactersDrawn = 0;

        // Iterate through lines and characters for typing effect
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const isCloseLine = line.includes("<- Close ->"); // Check if it's the special close line

            // Calculate starting X for centering the close line
            let currentLineStartX = textStartX;
            if (isCloseLine) {
                currentLineStartX = startX + Math.floor((currentWidth - line.length) / 2);
            }


            for (let charIndex = 0; charIndex < line.length; charIndex++) {
                if (charactersDrawn >= textProgress) {
                    break; // Stop drawing characters for this frame
                }

                const char = line[charIndex];
                const drawX = currentLineStartX + charIndex;
                const drawY = textStartY + lineIndex;

                // Check if within the *current* box bounds before drawing character
                if (drawX >= startX + 1 && drawX < startX + currentWidth - 1 &&
                    drawY >= startY + 1 && drawY < startY + currentHeight - 1) {
                    this.screenBuffer.drawChar(
                        char,
                        drawX,
                        drawY,
                        CONFIG.POPUP_FG_COLOUR, // Text colour
                        CONFIG.POPUP_BG_COLOUR  // Background *behind* the text
                    );
                }
                charactersDrawn++;
            }
            if (charactersDrawn >= textProgress) {
                break; // Stop drawing lines for this frame
            }
             // Add a newline character count between lines for textProgress calculation
             if (lineIndex < lines.length -1) {
                charactersDrawn++;
             }
        }
    }
  }
}