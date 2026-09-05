import { logger } from '../utils/logger';
import { CONFIG } from '../config';
import { TEXT_PALETTE } from './text_palette';
import type { TelemetryField, TravelTelemetryModel } from '../core/travel_telemetry';

// Define Markers (Ensure these match the tags you use in status messages)
const MARKERS = {
  HEADING_START: '<h>',
  HEADING_END: '</h>',
  HIGHLIGHT_START: '<hl>',
  HIGHLIGHT_END: '</hl>',
  WARNING_START: '[-W-]',
  WARNING_END: '</w>',
  EMERGENCY_START: '<e>',
  EMERGENCY_END: '</e>',
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
  private fgColorDefault: string = TEXT_PALETTE.text;
  private readonly telemetryGroups = new Map<string, HTMLElement>();
  private readonly telemetryFields = new Map<string, { root: HTMLElement; value: HTMLElement }>();
  private telemetryRoot: HTMLElement | null = null;
  private telemetryEvent: HTMLElement | null = null;

  /** Initializes StatusBarUpdater. */
  constructor(statusBarElement: HTMLElement, initialTheme: 'default' | 'tan' = 'default') {
    if (!statusBarElement) {
      const msg = 'Status bar element not provided to StatusBarUpdater.';
      logger.error(msg);
      throw new Error(msg);
    }
    this.statusBarElement = statusBarElement;
    // Apply base styling
    this.statusBarElement.style.fontFamily = CONFIG.FONT_FAMILY;
    this.statusBarElement.style.backgroundColor = TEXT_PALETTE.background;
    this.statusBarElement.style.whiteSpace = 'normal';
    this.statusBarElement.style.lineHeight = '1.2';
    this.statusBarElement.style.overflow = 'hidden';
    this.statusBarElement.style.boxSizing = 'border-box';

    // Set initial theme
    this.setTheme(initialTheme); // This also sets initial colors and updates display

    logger.debug(`[StatusBarUpdater] Instance created with theme: ${this.currentTheme}.`);
    this.updateMaxChars(0, 0); // Initial calculation
  }

  /** Updates theme. */
  setTheme(theme: 'default' | 'tan'): void {
    logger.info(`[StatusBarUpdater] Setting theme to: ${theme}`);
    this.currentTheme = theme;

    if (theme === 'tan') {
      this.fgColorDefault = TEXT_PALETTE.textSoft;
      this.colorMap = {
        [MARKERS.HEADING_START]: TEXT_PALETTE.cyanSoft,
        [MARKERS.HIGHLIGHT_START]: TEXT_PALETTE.amber,
        [MARKERS.WARNING_START]: TEXT_PALETTE.amber,
        [MARKERS.EMERGENCY_START]: TEXT_PALETTE.red,
      };
    } else {
      // Default (Amber)
      this.fgColorDefault = TEXT_PALETTE.text;
      this.colorMap = {
        [MARKERS.HEADING_START]: TEXT_PALETTE.cyanSignal,
        [MARKERS.HIGHLIGHT_START]: TEXT_PALETTE.greenBright,
        [MARKERS.WARNING_START]: TEXT_PALETTE.amber,
        [MARKERS.EMERGENCY_START]: TEXT_PALETTE.red,
      };
    }
    // Update the base text color immediately
    this.statusBarElement.style.color = this.fgColorDefault;
    // Re-render current text with the new theme
    this.updateStatus(this.statusBarElement.textContent || '', false); // Assume no starbase on theme change redraw
  }

  /** Returns status bar element. */
  public getStatusBarElement(): HTMLElement {
    return this.statusBarElement;
  }

  /** Updates max chars. */
  updateMaxChars(charWidthPx: number, charHeightPx: number): void {
    if (!this.statusBarElement) return;
    const sbFontSize = charHeightPx > 0 ? charHeightPx * 0.85 : 16 * 0.85; // Fallback font size
    this.statusBarElement.style.fontSize = `${sbFontSize}px`;
    this.statusBarElement.style.minHeight = `calc(${sbFontSize * 4.9}px + 14px)`;
    this.statusBarElement.style.height = 'auto';
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

  /** Renders fixed telemetry regions from named readings instead of a concatenated status sentence. */
  updateTelemetry(model: TravelTelemetryModel): void {
    this.ensureTelemetryLayout();
    this.statusBarElement.dataset.telemetryMode = model.mode.toLowerCase().replace(/\s+/g, '-');
    this.statusBarElement.dataset.telemetry = 'true';
    this.renderTelemetryGroup('navigation', model.navigation);
    this.renderTelemetryGroup('target', model.target);
    this.renderTelemetryGroup('environment', model.environment);
    this.renderTelemetryGroup('resources', model.resources);
    if (this.telemetryEvent) {
      this.telemetryEvent.textContent = model.notification || 'SYSTEMS NOMINAL';
      this.telemetryEvent.dataset.tone = model.notificationTone || 'muted';
    }
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
    this.statusBarElement.dataset.telemetry = 'false';
    this.telemetryRoot = null;
    this.telemetryEvent = null;
    this.telemetryGroups.clear();
    this.telemetryFields.clear();

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
      while (cutIndex < fullMessage.length && charCount < this.statusBarMaxChars - 3) {
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
      logger.warn(
        `[StatusBarUpdater] Status message truncated (Displayable: ${displayableLength}, Max: ${this.statusBarMaxChars}). Tags might be broken.`
      );
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
    segments.forEach((segment) => {
      if (segment.text.length === 0) return;
      const span = document.createElement('span');
      span.textContent = segment.text;
      // Ensure color is applied, default to the theme's default if segment color is somehow null/undefined
      span.style.color = segment.color || this.fgColorDefault;
      this.statusBarElement.appendChild(span);
    });
    // --- End Correction ---
  }

  /** Creates the stable panel regions once, retaining nodes through telemetry updates. */
  private ensureTelemetryLayout(): void {
    if (this.telemetryRoot && this.telemetryEvent) return;
    while (this.statusBarElement.firstChild)
      this.statusBarElement.removeChild(this.statusBarElement.firstChild);
    const root = document.createElement('div');
    root.className = 'cosmic-telemetry-grid';
    for (const groupId of ['navigation', 'target', 'environment', 'resources']) {
      const group = document.createElement('section');
      group.className = `cosmic-telemetry-group cosmic-telemetry-${groupId}`;
      group.dataset.group = groupId;
      root.appendChild(group);
      this.telemetryGroups.set(groupId, group);
    }
    const event = document.createElement('div');
    event.className = 'cosmic-telemetry-event';
    this.statusBarElement.appendChild(root);
    this.statusBarElement.appendChild(event);
    this.telemetryRoot = root;
    this.telemetryEvent = event;
    this.ensureTelemetryStyles();
  }

  /** Updates one stable region while preserving field nodes and their visual position. */
  private renderTelemetryGroup(groupId: string, fields: readonly TelemetryField[]): void {
    const group = this.telemetryGroups.get(groupId);
    if (!group) return;
    const activeKeys = new Set(fields.map((field) => `${groupId}:${field.id}`));
    for (const [key, entry] of this.telemetryFields) {
      if (key.startsWith(`${groupId}:`)) entry.root.hidden = !activeKeys.has(key);
    }
    for (const field of fields) {
      const key = `${groupId}:${field.id}`;
      let entry = this.telemetryFields.get(key);
      if (!entry) {
        const root = document.createElement('div');
        root.className = 'cosmic-telemetry-field';
        const label = document.createElement('span');
        label.className = 'cosmic-telemetry-label';
        const value = document.createElement('span');
        value.className = 'cosmic-telemetry-value';
        root.appendChild(label);
        root.appendChild(value);
        group.appendChild(root);
        entry = { root, value };
        this.telemetryFields.set(key, entry);
      }
      const label = entry.root.firstElementChild as HTMLElement;
      label.textContent = field.label;
      if (field.compactLabel) label.dataset.compactLabel = field.compactLabel;
      else delete label.dataset.compactLabel;
      entry.value.textContent = field.value;
      if (field.compactValue) entry.value.dataset.compactValue = field.compactValue;
      else delete entry.value.dataset.compactValue;
      entry.root.hidden = false;
      entry.root.dataset.tone = field.tone || 'default';
      entry.root.dataset.priority = field.priority || 'essential';
      entry.value.title = field.value;
    }
  }

  /** Installs responsive grid rules once for the persistent DOM panel. */
  private ensureTelemetryStyles(): void {
    if (document.getElementById('cosmic-telemetry-styles')) return;
    const style = document.createElement('style');
    style.id = 'cosmic-telemetry-styles';
    style.textContent = `
      #statusBar[data-telemetry='true'] { display: block; border-top-color: ${TEXT_PALETTE.cyanDeep}; }
      .cosmic-telemetry-grid { display: grid; grid-template-columns: minmax(18ch, .85fr) minmax(28ch, 1.65fr); grid-template-areas: 'navigation target' 'environment resources'; gap: 3px 14px; }
      .cosmic-telemetry-navigation { grid-area: navigation; }
      .cosmic-telemetry-target { grid-area: target; }
      .cosmic-telemetry-environment { grid-area: environment; }
      .cosmic-telemetry-resources { grid-area: resources; }
      .cosmic-telemetry-group { min-width: 0; display: flex; align-items: baseline; gap: 3px 9px; flex-wrap: wrap; }
      .cosmic-telemetry-field { min-width: 0; display: inline-flex; gap: .45ch; align-items: baseline; }
      .cosmic-telemetry-label { color: ${TEXT_PALETTE.textMuted}; }
      .cosmic-telemetry-value { min-width: 0; color: ${TEXT_PALETTE.text}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .cosmic-telemetry-target .cosmic-telemetry-field { flex: 1 1 auto; }
      .cosmic-telemetry-target .cosmic-telemetry-value { white-space: normal; }
      .cosmic-telemetry-field[data-tone='signal'] .cosmic-telemetry-value { color: ${TEXT_PALETTE.cyanSignal}; }
      .cosmic-telemetry-field[data-tone='warning'] .cosmic-telemetry-value { color: ${TEXT_PALETTE.amber}; }
      .cosmic-telemetry-field[data-tone='muted'] .cosmic-telemetry-value { color: ${TEXT_PALETTE.textDim}; }
      .cosmic-telemetry-resources { justify-content: flex-end; }
      .cosmic-telemetry-event { min-height: 1.2em; margin-top: 2px; padding-top: 2px; border-top: 1px solid ${TEXT_PALETTE.cyanDeep}; color: ${TEXT_PALETTE.textDim}; overflow-wrap: anywhere; white-space: normal; }
      .cosmic-telemetry-event[data-tone='signal'] { color: ${TEXT_PALETTE.cyanSignal}; }
      .cosmic-telemetry-event[data-tone='warning'] { color: ${TEXT_PALETTE.amber}; }
      @media (max-width: 900px) {
        .cosmic-telemetry-grid { grid-template-columns: minmax(12ch, .85fr) minmax(18ch, 1.35fr); gap: 3px 10px; }
        .cosmic-telemetry-resources { justify-content: flex-start; }
      }
      @media (max-width: 560px) {
        #statusBar[data-telemetry='true'] { font-size: 12px !important; }
        .cosmic-telemetry-grid { grid-template-columns: minmax(0, .7fr) minmax(0, 1.7fr); gap: 2px 8px; }
        .cosmic-telemetry-group { gap: 2px 5px; flex-wrap: nowrap; }
        .cosmic-telemetry-field[data-priority='secondary'], .cosmic-telemetry-field[data-priority='optional'] { display: none; }
        .cosmic-telemetry-label[data-compact-label] { font-size: 0; white-space: nowrap; }
        .cosmic-telemetry-label[data-compact-label]::after { content: attr(data-compact-label); font-size: 12px; }
        .cosmic-telemetry-value[data-compact-value] { font-size: 0; overflow-wrap: normal; white-space: nowrap; }
        .cosmic-telemetry-value[data-compact-value]::after { content: attr(data-compact-value); font-size: 12px; }
      }
    `;
    document.head.appendChild(style);
  }
}
