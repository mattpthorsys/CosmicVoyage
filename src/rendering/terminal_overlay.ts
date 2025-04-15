/* FILE: src/rendering/terminal_overlay.ts */
// src/rendering/terminal_overlay.ts (Added setTheme method)

import { CONFIG } from '../config';
import { logger } from '../utils/logger';

// -- Marker Definitions -- (remain the same)
const MARKERS = {
  HEADING_START: '<h>', HEADING_END: '</h>',
  HIGHLIGHT_START: '<hl>', HIGHLIGHT_END: '</hl>',
  WARNING_START: '[-W-]', WARNING_END: '</w>',
  EMERGENCY_START: '<e>', EMERGENCY_END: '</e>',
} as const;
type MarkerKey = keyof typeof MARKERS;

// -- Type for coloured text segments -- (remains the same)
interface TextSegment {
  text: string;
  color: string;
}

// -- Type for a message composed of segments -- (remains the same)
interface TerminalMessage {
  segments: TextSegment[];
  fullText: string;
  addedTimestamp: number;
  typingCompleteTimestamp: number | null;
  alpha: number;
  isTyping: boolean;
}

export class TerminalOverlay {
  // --- Configuration --- (remain the same)
  private maxMessages: number = CONFIG.TRM_MAX_MESSAGES;
  private messageDurationMs: number = CONFIG.TRM_MSG_DURATION;
  private fadeDurationMs: number = CONFIG.TRM_FADE_DURATION;
  private typingSpeedCharsPerSec: number = CONFIG.TRM_TYPE_SPEED_SEC;
  private font: string;
  private charHeight: number = 16;
  private cursorChar: string = CONFIG.TRM_CURSOR_CHAR;
  private cursorBlinkRateMs: number = CONFIG.TRM_CURSOR_RATE_MS;

  // --- Color Map & Default (Initialized based on theme) ---
  private colorMap: Record<string, string>;
  private fgColorDefault: string;

  // --- State --- (remain the same)
  private displayMessages: TerminalMessage[] = [];
  private messageQueue: string[] = [];
  private isCurrentlyTyping: boolean = false;
  private currentTypingProgressChars: number = 0;

  // --- Constructor ---
  constructor(initialTheme: 'dark' | 'light' = 'dark') {
    this.font = `${CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE * 0.9}px ${CONFIG.THIN_FONT_FAMILY}`;
    // Initialize colors using the new setTheme method
    this.colorMap = {}; // Initialize as empty, setTheme will populate
    this.fgColorDefault = ''; // Initialize as empty, setTheme will populate
    this.setTheme(initialTheme); // Call setTheme to set initial colors
    logger.debug(`[TerminalOverlay] Initialized.`); // Simplified log
  }

  // --- NEW: setTheme Method ---
  /**
   * Sets the active color theme for the terminal overlay.
   * @param theme The theme to activate ('dark' or 'light').
   */
  setTheme(theme: 'dark' | 'light'): void {
      logger.info(`[TerminalOverlay] Setting theme to: ${theme}`);
      if (theme === 'light') {
          this.fgColorDefault = CONFIG.TRM_FG_COLOUR_LIGHT;
          this.colorMap = {
              [MARKERS.HEADING_START]: CONFIG.TRM_COLOR_HEADING_LIGHT,
              [MARKERS.HIGHLIGHT_START]: CONFIG.TRM_COLOR_HIGHLIGHT_LIGHT,
              [MARKERS.WARNING_START]: CONFIG.TRM_COLOR_WARNING_LIGHT,
              [MARKERS.EMERGENCY_START]: CONFIG.TRM_COLOR_EMERGENCY_LIGHT,
          };
      } else { // Default to dark
          this.fgColorDefault = CONFIG.TRM_FG_COLOUR_DARK;
          this.colorMap = {
              [MARKERS.HEADING_START]: CONFIG.TRM_COLOR_HEADING_DARK,
              [MARKERS.HIGHLIGHT_START]: CONFIG.TRM_COLOR_HIGHLIGHT_DARK,
              [MARKERS.WARNING_START]: CONFIG.TRM_COLOR_WARNING_DARK,
              [MARKERS.EMERGENCY_START]: CONFIG.TRM_COLOR_EMERGENCY_DARK,
          };
      }
      // Optional: Force a re-render if messages are currently displayed
      // This might require coordination with the main game loop or renderer facade.
  }
  // --- END NEW Method ---

  /** Sets character dimensions (call on resize) */ // (remains the same)
  updateCharDimensions(charHeight: number): void {
    this.charHeight = charHeight > 0 ? charHeight : 16;
    this.font = `${this.charHeight * 0.9}px ${CONFIG.THIN_FONT_FAMILY}`;
  }

  /** Adds a raw message text (with markers) to the waiting queue */ // (remains the same)
  addMessage(rawText: string): void {
    if (!rawText) return;
    this.messageQueue.push(rawText);
    // logger.debug(`[TerminalOverlay] Queued message: "${rawText}" (Queue size: ${this.messageQueue.length})`); // Can be noisy
  }

  /** Clears all current and queued messages from the overlay. */ // (remains the same)
  clear(): void {
      logger.info('[TerminalOverlay] Clearing all messages.');
      this.displayMessages = [];
      this.messageQueue = [];
      this.isCurrentlyTyping = false;
      this.currentTypingProgressChars = 0;
  }

  /** Starts displaying the next message from the queue */ // (remains the same)
  private _startNextMessage(): void {
    if (this.isCurrentlyTyping || this.messageQueue.length === 0) return;
    const nextMessageText = this.messageQueue.shift();
    if (!nextMessageText) return;

    // logger.debug(`[TerminalOverlay] Starting to display message: "${nextMessageText}"`); // Can be noisy
    const newMessage: TerminalMessage = {
      segments: [],
      fullText: nextMessageText,
      addedTimestamp: performance.now(),
      typingCompleteTimestamp: null,
      alpha: 1.0,
      isTyping: true,
    };
    this.displayMessages.push(newMessage);
    if (this.displayMessages.length > this.maxMessages) {
      this.displayMessages.shift();
    }

    this.isCurrentlyTyping = true;
    this.currentTypingProgressChars = 0;
  }

  /** Updates message states (typing, fading, queue processing) */ // (remains the same)
  update(deltaTime: number): void {
    const now = performance.now();
    // --- 1. Process Queue ---
    if (!this.isCurrentlyTyping && this.messageQueue.length > 0) {
      this._startNextMessage();
    }

    // --- 2. Update the currently typing message (if any) ---
    if (this.isCurrentlyTyping) {
      const typingMsg = this.displayMessages[this.displayMessages.length - 1];
      if (typingMsg && typingMsg.isTyping) {
        this.currentTypingProgressChars += this.typingSpeedCharsPerSec * deltaTime;
        const targetChars = Math.floor(this.currentTypingProgressChars);
        typingMsg.segments = this._parseTextToSegments(typingMsg.fullText, targetChars);
         const totalDisplayableChars = this._getDisplayableLength(typingMsg.fullText);
        if (targetChars >= totalDisplayableChars) {
             typingMsg.segments = this._parseTextToSegments(typingMsg.fullText);
             // logger.debug(`[TerminalOverlay] Message completed typing: "${typingMsg.fullText}"`); // Can be noisy
             typingMsg.isTyping = false;
             typingMsg.typingCompleteTimestamp = now;
             this.isCurrentlyTyping = false;
             this.currentTypingProgressChars = 0;
        }
      } else {
        logger.warn("[TerminalOverlay] State mismatch: isCurrentlyTyping true, but no message is typing.");
        this.isCurrentlyTyping = false;
        this.currentTypingProgressChars = 0;
      }
    }

    // --- 3. Update Fading/Aging for all *visible* messages ---
    this.displayMessages = this.displayMessages.filter((msg) => {
      if (!msg.isTyping && msg.typingCompleteTimestamp) {
        const timeSinceComplete = now - msg.typingCompleteTimestamp;
        if (timeSinceComplete > this.messageDurationMs) {
          const fadeProgress = (timeSinceComplete - this.messageDurationMs) / this.fadeDurationMs;
          msg.alpha = Math.max(0, 1.0 - fadeProgress);
        }
      }
      return msg.isTyping || msg.alpha > 0;
    });
  }

  /** Parses text with markers into colored segments */ // (Uses themed colors)
  private _parseTextToSegments(rawText: string, maxChars?: number): TextSegment[] {
    const segments: TextSegment[] = [];
    let currentText = '';
    let currentColor = this.fgColorDefault; // Use the currently set themed default
    let i = 0;
    let displayedChars = 0;
    const max = maxChars === undefined ? rawText.length : Infinity;

    while (i < rawText.length) {
        if (maxChars !== undefined && displayedChars >= maxChars) {
            break;
        }

        let markerFound = false;
        for (const [markerKey, markerValue] of Object.entries(MARKERS)) {
            if (rawText.startsWith(markerValue, i)) {
                if (currentText.length > 0) {
                    segments.push({ text: currentText, color: currentColor });
                }
                currentText = '';

                if (markerKey.endsWith('_END')) {
                    currentColor = this.fgColorDefault; // Revert to themed default
                } else {
                    // Use the currently set themed color map
                    currentColor = this.colorMap[markerValue] || this.fgColorDefault;
                }

                i += markerValue.length;
                markerFound = true;
                break;
            }
        }

        if (!markerFound) {
            currentText += rawText[i];
            displayedChars++;
            i++;
        }
    }

    if (currentText.length > 0) {
         if (maxChars !== undefined && displayedChars > maxChars) {
             currentText = currentText.substring(0, currentText.length - (displayedChars - maxChars));
        }
        segments.push({ text: currentText, color: currentColor });
    }

    return segments;
  }

  /** Calculates the number of displayable characters (excluding markers) */ // (remains the same)
   private _getDisplayableLength(rawText: string): number {
       let length = 0;
       let i = 0;
       while (i < rawText.length) {
           let markerFound = false;
           for (const marker of Object.values(MARKERS)) {
               if (rawText.startsWith(marker, i)) {
                   i += marker.length;
                   markerFound = true;
                   break;
               }
           }
           if (!markerFound) {
               length++;
               i++;
           }
       }
       return length;
   }

  /** Renders the terminal messages onto the provided context */ // (Uses themed colors)
  render(ctx: CanvasRenderingContext2D, bufferWidthPx: number, bufferHeightPx: number): void {
    ctx.save();
    ctx.font = this.font;
    ctx.textBaseline = 'bottom';

    const now = performance.now();
    const lineHeight = this.charHeight * 1.1;
    const startY = bufferHeightPx - lineHeight;
    const startX = this.charHeight;
    let typingMessage: TerminalMessage | null = null;

    for (let i = this.displayMessages.length - 1; i >= 0; i--) {
      const msg = this.displayMessages[i];
      const yPos = startY - (this.displayMessages.length - 1 - i) * lineHeight;

      if (yPos + this.charHeight < 0) break;

      ctx.globalAlpha = msg.alpha;
      let currentX = startX;
      for (const segment of msg.segments) {
          if (segment.text.length === 0) continue;
          ctx.fillStyle = segment.color; // Use segment's calculated color
          ctx.fillText(segment.text, currentX, yPos);
          currentX += ctx.measureText(segment.text).width;
      }

      if (msg.isTyping) {
          typingMessage = msg;
      }
    }

    // --- Draw Cursor ---
    if (typingMessage) {
        const typingMsgYPos = startY;
        if (typingMsgYPos >= 0) {
             if (Math.floor(now / this.cursorBlinkRateMs) % 2 === 0) {
                 let cursorX = startX;
                 for (const segment of typingMessage.segments) {
                     cursorX += ctx.measureText(segment.text).width;
                 }
                 cursorX += 2;
                 ctx.globalAlpha = typingMessage.alpha;
                 ctx.fillStyle = this.fgColorDefault; // Use themed default for cursor
                 ctx.fillText(this.cursorChar, cursorX, typingMsgYPos);
             }
        }
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }
}