// src/rendering/status_bar_updater.ts

import { logger } from '../utils/logger';
import { CONFIG } from '../config'; // Needed for default styling?

/** Handles updates to the status bar DOM element. */
export class StatusBarUpdater {
  private readonly statusBarElement: HTMLElement;
  private statusBarMaxChars: number = 240; // Default max chars, updated by fitToScreen

  constructor(statusBarElement: HTMLElement) {
    if (!statusBarElement) {
      const msg = 'Status bar element not provided to StatusBarUpdater.';
      logger.error(msg);
      throw new Error(msg);
    }
    this.statusBarElement = statusBarElement;

    // Apply initial styling from config (can be moved to facade if preferred)
    this.statusBarElement.style.fontFamily = CONFIG.FONT_FAMILY;
    this.statusBarElement.style.color = CONFIG.STATUS_BAR_FG_COLOUR;
    this.statusBarElement.style.backgroundColor = CONFIG.STATUS_BAR_BG_COLOUR;
    this.statusBarElement.style.whiteSpace = 'pre-wrap';
    this.statusBarElement.style.lineHeight = '1.4';
    this.statusBarElement.style.overflow = 'hidden'; // Ensure overflow is hidden
    this.statusBarElement.style.boxSizing = 'border-box'; // Consistent sizing

    logger.debug('[StatusBarUpdater] Instance created.');
    this.updateMaxChars(0, 0); // Initial calculation based on defaults
  }

  public getStatusBarElement(): HTMLElement {
    return this.statusBarElement;
  }

  /** Updates the maximum character estimate based on calculated dimensions. */
  updateMaxChars(charWidthPx: number, charHeightPx: number): void {
    if (!this.statusBarElement) return;

    // Apply size-dependent styles that affect width calculation
    const sbFontSize = charHeightPx > 0 ? charHeightPx * 0.85 : 16 * 0.85; // Fallback font size
    this.statusBarElement.style.fontSize = `${sbFontSize}px`;
    this.statusBarElement.style.height = `calc(${sbFontSize * 1.4 * 3}px + 10px)`; // ~3 lines + padding
    const paddingLR = charWidthPx > 0 ? charWidthPx : 10; // Fallback padding
    this.statusBarElement.style.padding = `5px ${paddingLR}px`;

    // Estimate max characters for truncation
    try {
      // Approximate character width in status bar (Courier New is ~0.6 * height)
      const approxCharWidthInBar = sbFontSize * 0.6;
      const availableBarWidth =
        (this.statusBarElement.offsetWidth || window.innerWidth) - paddingLR * 2;

      if (approxCharWidthInBar > 0 && availableBarWidth > 0) {
        // Calculate max chars per line * 3 lines
        this.statusBarMaxChars =
          Math.max(20, Math.floor(availableBarWidth / approxCharWidthInBar)) * 3;
      } else {
        throw new Error('Invalid dimensions for calculation.');
      }
    } catch (e) {
      logger.warn(
        '[StatusBarUpdater.updateMaxChars] Could not accurately calculate status bar width for truncation.', e
      );
      this.statusBarMaxChars = 240; // Fallback
    }
    logger.debug(
      `[StatusBarUpdater.updateMaxChars] Status bar max chars estimated: ${this.statusBarMaxChars}`
    );
  }

  /** Updates the text content of the status bar element, handling truncation. */
  updateStatus(message: string, hasStarbase: boolean): void {
    if (!this.statusBarElement) {
      logger.warn(
        '[StatusBarUpdater.updateStatus] Called but statusBarElement is missing.'
      );
      return;
    }

    let updatedMessage = message;
    if (hasStarbase) {
      updatedMessage += ' (STARBASE)';
    }

    // Update DOM only if text content has actually changed to avoid unnecessary reflows
    this.statusBarElement.textContent = updatedMessage;
  }
}