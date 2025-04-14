// src/rendering/terminal_overlay.ts (Sequential Typing with Inline Colours)

import { CONFIG } from '../config';
import { logger } from '../utils/logger';

// -- Marker Definitions --
const MARKERS = {
  HEADING_START: '[-H-]', HEADING_END: '[-h-]',
  HIGHLIGHT_START: '[-HL-]', HIGHLIGHT_END: '[-hl-]',
  WARNING_START: '[-W-]', WARNING_END: '[-w-]',
  EMERGENCY_START: '[-E-]', EMERGENCY_END: '[-e-]',
  // Add a default marker if explicitly switching back is needed, otherwise closing tags revert
  // DEFAULT_START: '[-D-]', DEFAULT_END: '[-d-]',
} as const;
type MarkerKey = keyof typeof MARKERS;

// -- Type for coloured text segments --
interface TextSegment {
  text: string;
  color: string;
}

// -- Type for a message composed of segments --
interface TerminalMessage {
  segments: TextSegment[]; // Array of coloured segments
  fullText: string;        // The original, raw text with markers
  addedTimestamp: number;
  typingCompleteTimestamp: number | null;
  alpha: number;
  isTyping: boolean;
}

export class TerminalOverlay {
  // --- Configuration ---
  private maxMessages: number = CONFIG.TRM_MAX_MESSAGES;
  private messageDurationMs: number = CONFIG.TRM_MSG_DURATION;
  private fadeDurationMs: number = CONFIG.TRM_FADE_DURATION;
  private typingSpeedCharsPerSec: number = CONFIG.TRM_TYPE_SPEED_SEC;
  private font: string;
  private charHeight: number = 16;
  private fgColorDefault: string = CONFIG.TRM_FG_COLOUR; // Default color
  private cursorChar: string = CONFIG.TRM_CURSOR_CHAR;
  private cursorBlinkRateMs: number = CONFIG.TRM_CURSOR_RATE_MS;
  // --- Color Map ---
  private colorMap: Record<string, string>;

  // --- State ---
  private displayMessages: TerminalMessage[] = [];
  private messageQueue: string[] = [];
  private isCurrentlyTyping: boolean = false;
  private currentTypingProgressChars: number = 0; // Track progress in *displayable* characters

  constructor() {
    // Use the main font family configured globally
    this.font = `${CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE * 0.9}px ${CONFIG.THIN_FONT_FAMILY}`;
    // Map marker starts to configured colors
    this.colorMap = {
        [MARKERS.HEADING_START]: CONFIG.TRM_COLOR_HEADING,
        [MARKERS.HIGHLIGHT_START]: CONFIG.TRM_COLOR_HIGHLIGHT,
        [MARKERS.WARNING_START]: CONFIG.TRM_COLOR_WARNING,
        [MARKERS.EMERGENCY_START]: CONFIG.TRM_COLOR_EMERGENCY,
        // Add default marker if needed
    };
    logger.debug('[TerminalOverlay] Initialized (Sequential Queue + Color Markers).');
  }

  /** Sets character dimensions (call on resize) */
  updateCharDimensions(charHeight: number): void {
    this.charHeight = charHeight > 0 ? charHeight : 16;
    // Use the main font family configured globally
    this.font = `${this.charHeight * 0.9}px ${CONFIG.THIN_FONT_FAMILY}`;
  }

  /** Adds a raw message text (with markers) to the waiting queue */
  addMessage(rawText: string): void {
    if (!rawText) return;
    this.messageQueue.push(rawText);
    logger.debug(`[TerminalOverlay] Queued message: "${rawText}" (Queue size: ${this.messageQueue.length})`);
  }

  /** Starts displaying the next message from the queue */
  private _startNextMessage(): void {
    if (this.isCurrentlyTyping || this.messageQueue.length === 0) return;
    const nextMessageText = this.messageQueue.shift();
    if (!nextMessageText) return;

    logger.debug(`[TerminalOverlay] Starting to display message: "${nextMessageText}"`);

    const newMessage: TerminalMessage = {
      segments: [], // Start with empty segments
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
    this.currentTypingProgressChars = 0; // Reset character progress
  }

  /** Updates message states (typing, fading, queue processing) */
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
        // Increment progress based on time
        this.currentTypingProgressChars += this.typingSpeedCharsPerSec * deltaTime;
        const targetChars = Math.floor(this.currentTypingProgressChars);

        // Re-parse the fullText up to the target number of *displayable* characters
        typingMsg.segments = this._parseTextToSegments(typingMsg.fullText, targetChars);

        // Check if typing is complete by comparing parsed length to full displayable length
         const totalDisplayableChars = this._getDisplayableLength(typingMsg.fullText);
         if (targetChars >= totalDisplayableChars) {
             // Ensure final segments match full text exactly
             typingMsg.segments = this._parseTextToSegments(typingMsg.fullText); // Parse all
             logger.debug(`[TerminalOverlay] Message completed typing: "${typingMsg.fullText}"`);
             typingMsg.isTyping = false;
             typingMsg.typingCompleteTimestamp = now;
             this.isCurrentlyTyping = false;
             this.currentTypingProgressChars = 0;
         }
      } else {
        // Safeguard reset
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
      return msg.isTyping || msg.alpha > 0; // Keep if typing or not fully faded
    });
  }

  /** Parses text with markers into colored segments */
  private _parseTextToSegments(rawText: string, maxChars?: number): TextSegment[] {
    const segments: TextSegment[] = [];
    let currentText = '';
    let currentColor = this.fgColorDefault;
    let i = 0;
    let displayedChars = 0;
    const max = maxChars === undefined ? rawText.length : Infinity; // Use Infinity if no limit

    while (i < rawText.length) {
        if (maxChars !== undefined && displayedChars >= maxChars) {
            break; // Stop parsing if character limit reached
        }

        let markerFound = false;
        // Check for start markers
        for (const marker of Object.values(MARKERS)) {
            if (rawText.startsWith(marker, i)) {
                // Finalize previous segment
                if (currentText.length > 0) {
                    segments.push({ text: currentText, color: currentColor });
                }
                currentText = ''; // Reset text

                // Set new color or revert to default
                currentColor = this.colorMap[marker] || this.fgColorDefault;
                if (marker.endsWith('END: string')) { // Check if it's an end marker (simple check)
                     currentColor = this.fgColorDefault;
                 }

                i += marker.length; // Skip marker
                markerFound = true;
                break;
            }
        }

        if (!markerFound) {
            // Append character to current segment
            currentText += rawText[i];
            displayedChars++; // Only increment for non-marker characters
            i++;
        }
    }

    // Add any remaining text
    if (currentText.length > 0) {
         // If maxChars was hit mid-segment, truncate the last segment
         if (maxChars !== undefined && displayedChars > maxChars) {
             currentText = currentText.substring(0, currentText.length - (displayedChars - maxChars));
         }
        segments.push({ text: currentText, color: currentColor });
    }

    return segments;
  }

  /** Calculates the number of displayable characters (excluding markers) */
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


  /** Renders the terminal messages onto the provided context */
  render(ctx: CanvasRenderingContext2D, bufferWidthPx: number, bufferHeightPx: number): void {
    ctx.save();
    ctx.font = this.font;
    ctx.textBaseline = 'bottom';

    const now = performance.now();
    const lineHeight = this.charHeight * 1.1;
    const startY = bufferHeightPx - lineHeight; // Adjusted for baseline='bottom'
    const startX = this.charHeight;

    let typingMessage: TerminalMessage | null = null;

    for (let i = this.displayMessages.length - 1; i >= 0; i--) {
      const msg = this.displayMessages[i];
      const yPos = startY - (this.displayMessages.length - 1 - i) * lineHeight;

      if (yPos + this.charHeight < 0) break; // Stop rendering if fully off-screen top

      ctx.globalAlpha = msg.alpha;
      let currentX = startX;

      // Draw segments
      for (const segment of msg.segments) {
          if (segment.text.length === 0) continue;
          ctx.fillStyle = segment.color;
          ctx.fillText(segment.text, currentX, yPos);
          currentX += ctx.measureText(segment.text).width;
      }

      // Check if this is the typing message for cursor
      if (msg.isTyping) {
          typingMessage = msg;
      }
    }

    // --- Draw Cursor ---
    if (typingMessage) {
        const typingMsgYPos = startY; // Typing message is always at the bottom
        if (typingMsgYPos >= 0) {
             if (Math.floor(now / this.cursorBlinkRateMs) % 2 === 0) {
                 // Calculate cursor position based on rendered segments
                 let cursorX = startX;
                 for (const segment of typingMessage.segments) {
                     cursorX += ctx.measureText(segment.text).width;
                 }
                 cursorX += 2; // Small offset

                 ctx.globalAlpha = typingMessage.alpha; // Use message alpha
                 ctx.fillStyle = this.fgColorDefault; // Cursor is default color? Or last segment color? Let's use default.
                 ctx.fillText(this.cursorChar, cursorX, typingMsgYPos);
            }
        }
    }

    ctx.globalAlpha = 1.0; // Reset global alpha just in case
    ctx.restore();
  }
}