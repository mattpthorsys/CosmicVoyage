/* FILE: src/rendering/status_bar_updater.ts */
// src/rendering/status_bar_updater.ts (Corrected Parsing Logic & DOM Update)

import { logger } from '../utils/logger';
import { CONFIG } from '../config';

// Define Markers (Ensure these match the tags you use in status messages)
const MARKERS = {
  HEADING_START: '<h>', HEADING_END: '</h>',
  HIGHLIGHT_START: '<hl>', HIGHLIGHT_END: '</hl>',
  WARNING_START: '[-W-]', WARNING_END: '</w>',
  EMERGENCY_START: '<e>', EMERGENCY_END: '</e>',
} as const;

// Define which markers are "end" markers to revert color
// Type the Set to accept any value from the MARKERS object initially
const END_MARKERS: Set<(typeof MARKERS)[keyof typeof MARKERS]> = new Set([
    MARKERS.HEADING_END,
    MARKERS.HIGHLIGHT_END,
    MARKERS.WARNING_END,
    MARKERS.EMERGENCY_END,
] as const);

// Type for colored text segments
interface TextSegment {
  text: string;
  color: string;
}

/** Handles updates to the status bar DOM element, supporting colored tags. */
export class StatusBarUpdater {
  private readonly statusBarElement: HTMLElement;
  private statusBarMaxChars: number = 240;
  private currentTheme: 'default' | 'tan' = 'default';
  private colorMap: Record<string, string> = {};
  private fgColorDefault: string = CONFIG.SB_FG_COLOUR_DEFAULT;

  constructor(statusBarElement: HTMLElement, initialTheme: 'default' | 'tan' = 'default') {
    if (!statusBarElement) {
      const msg = 'Status bar element not provided to StatusBarUpdater.';
      logger.error(msg);
      throw new Error(msg);
    }
    this.statusBarElement = statusBarElement;
    // Apply base styling
    this.statusBarElement.style.fontFamily = CONFIG.FONT_FAMILY;
    this.statusBarElement.style.backgroundColor = CONFIG.STATUS_BAR_BG_COLOUR;
    this.statusBarElement.style.whiteSpace = 'pre-wrap';
    this.statusBarElement.style.lineHeight = '1.4';
    this.statusBarElement.style.overflow = 'hidden';
    this.statusBarElement.style.boxSizing = 'border-box';

    // Set initial theme
    this.setTheme(initialTheme); // This also sets initial colors and updates display

    logger.debug(`[StatusBarUpdater] Instance created with theme: ${this.currentTheme}.`);
    this.updateMaxChars(0, 0); // Initial calculation
  }

  setTheme(theme: 'default' | 'tan'): void {
    logger.info(`[StatusBarUpdater] Setting theme to: ${theme}`);
    this.currentTheme = theme;

    if (theme === 'tan') {
      this.fgColorDefault = CONFIG.SB_FG_COLOUR_TAN;
      this.colorMap = {
          [MARKERS.HEADING_START]: CONFIG.SB_COLOR_HEADING_TAN,
          [MARKERS.HIGHLIGHT_START]: CONFIG.SB_COLOR_HIGHLIGHT_TAN,
          [MARKERS.WARNING_START]: CONFIG.SB_COLOR_WARNING_TAN,
          [MARKERS.EMERGENCY_START]: CONFIG.SB_COLOR_EMERGENCY_TAN,
      };
    } else { // Default (Amber)
      this.fgColorDefault = CONFIG.SB_FG_COLOUR_DEFAULT;
      this.colorMap = {
          [MARKERS.HEADING_START]: CONFIG.SB_COLOR_HEADING_DEFAULT,
          [MARKERS.HIGHLIGHT_START]: CONFIG.SB_COLOR_HIGHLIGHT_DEFAULT,
          [MARKERS.WARNING_START]: CONFIG.SB_COLOR_WARNING_DEFAULT,
          [MARKERS.EMERGENCY_START]: CONFIG.SB_COLOR_EMERGENCY_DEFAULT,
      };
    }
    // Update the base text color immediately
    this.statusBarElement.style.color = this.fgColorDefault;
    // Re-render current text with the new theme
    this.updateStatus(this.statusBarElement.textContent || '', false); // Assume no starbase on theme change redraw
  }

  public getStatusBarElement(): HTMLElement {
    return this.statusBarElement;
  }

  updateMaxChars(charWidthPx: number, charHeightPx: number): void {
    if (!this.statusBarElement) return;
    const sbFontSize = charHeightPx > 0 ? charHeightPx * 0.85 : 16 * 0.85; // Fallback font size
    this.statusBarElement.style.fontSize = `${sbFontSize}px`;
    this.statusBarElement.style.height = `calc(${sbFontSize * 1.4 * 3}px + 10px)`; // ~3 lines + padding
    const paddingLR = charWidthPx > 0 ? charWidthPx : 10; // Fallback padding
    this.statusBarElement.style.padding = `5px ${paddingLR}px`;

    // Estimate max characters for truncation
    try {
      const approxCharWidthInBar = sbFontSize * 0.6; // Courier New is ~0.6 * height
      const availableBarWidth = (this.statusBarElement.offsetWidth || window.innerWidth) - paddingLR * 2;
      if (approxCharWidthInBar > 0 && availableBarWidth > 0) {
        // Calculate max chars per line * 3 lines
        this.statusBarMaxChars = Math.max(20, Math.floor(availableBarWidth / approxCharWidthInBar)) * 3;
      } else {
        throw new Error('Invalid dimensions for calculation.');
      }
    } catch (e) {
      logger.warn(`[StatusBarUpdater.updateMaxChars] Failed calculation. ${e}`);
      this.statusBarMaxChars = 240; // Fallback
    }
    // logger.debug(`[StatusBarUpdater.updateMaxChars] Status bar max chars: ${this.statusBarMaxChars}`); // Can be noisy
  }

  /** Parses message with markers into colored segments */
  private _parseMessageToSegments(rawText: string): TextSegment[] {
    const segments: TextSegment[] = [];
    let currentText = '';
    let currentColor = this.fgColorDefault;
    let i = 0;

    while (i < rawText.length) {
      let markerFound = false;
      // Check for known markers (both start and end tags)
      for (const markerValue of Object.values(MARKERS)) {
        if (rawText.startsWith(markerValue, i)) {
          // Finalize previous segment if it has text
          if (currentText.length > 0) {
            segments.push({ text: currentText, color: currentColor });
          }
          currentText = ''; // Reset text for the new segment

          // Check if the found marker is an end marker
          // This check now works without a TypeScript error due to the Set's type
          if (END_MARKERS.has(markerValue)) {
            currentColor = this.fgColorDefault; // Revert to theme default
          } else {
            // It's a start marker, find its color in the map
            currentColor = this.colorMap[markerValue] || this.fgColorDefault;
          }

          i += markerValue.length; // Move index past the marker
          markerFound = true;
          break; // Stop checking other markers once one is found
        }
      }

      // If no marker was found at the current position, append the character
      if (!markerFound) {
        currentText += rawText[i];
        i++;
      }
    }
    // Add any remaining text after the loop finishes
    if (currentText.length > 0) {
      segments.push({ text: currentText, color: currentColor });
    }
    return segments;
  }

  /** Updates the status bar content, applying colors based on tags and theme. */
  updateStatus(rawMessage: string, hasStarbase: boolean): void {
    if (!this.statusBarElement) {
      logger.warn('[StatusBarUpdater.updateStatus] Called but statusBarElement is missing.');
      return;
    }

    let fullMessage = rawMessage;
    // Append starbase indicator *with tags* so it gets parsed for color
    if (hasStarbase) {
      fullMessage += ' <hl>(STARBASE)</hl>';
    }

    // --- Truncation (Simplified - applied BEFORE parsing) ---
    let displayableLength = 0;
    let tempIndex = 0;
    while (tempIndex < fullMessage.length) {
      let markerFound = false;
      for (const marker of Object.values(MARKERS)) {
        if (fullMessage.startsWith(marker, tempIndex)) {
          tempIndex += marker.length;
          markerFound = true;
          break;
        }
      }
      if (!markerFound) {
        displayableLength++;
        tempIndex++;
      }
    }

    let messageToParse = fullMessage;
    if (displayableLength > this.statusBarMaxChars && this.statusBarMaxChars > 3) {
      // Basic truncation - find rough character limit, may cut tags badly.
      let charCount = 0;
      let cutIndex = 0;
      while (cutIndex < fullMessage.length && charCount < (this.statusBarMaxChars - 3)) {
        let markerFound = false;
        for (const marker of Object.values(MARKERS)) {
          if (fullMessage.startsWith(marker, cutIndex)) {
            cutIndex += marker.length;
            markerFound = true;
            break;
          }
        }
        if (!markerFound) {
          charCount++;
          cutIndex++;
        }
      }
      messageToParse = fullMessage.substring(0, cutIndex) + '...';
      logger.warn(`[StatusBarUpdater] Status message truncated (Displayable: ${displayableLength}, Max: ${this.statusBarMaxChars}). Tags might be broken.`);
    }
    // --- End Truncation ---

    // Parse the potentially truncated message into colored segments
    const segments = this._parseMessageToSegments(messageToParse);

    // --- Corrected DOM Update ---
    // Clear existing content safely
    while (this.statusBarElement.firstChild) {
      this.statusBarElement.removeChild(this.statusBarElement.firstChild);
    }

    // Append new styled spans
    segments.forEach(segment => {
      if (segment.text.length === 0) return;
      const span = document.createElement('span');
      span.textContent = segment.text;
      // Ensure color is applied, default to the theme's default if segment color is somehow null/undefined
      span.style.color = segment.color || this.fgColorDefault;
      this.statusBarElement.appendChild(span);
    });
    // --- End Correction ---
  }
}