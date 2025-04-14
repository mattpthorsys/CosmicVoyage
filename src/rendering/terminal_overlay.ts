// src/rendering/terminal_overlay.ts (Sequential Typing with Queue)

import { CONFIG } from '../config';
import { logger } from '../utils/logger';

interface TerminalMessage {
  text: string; // Current text being displayed (updates during typing)
  fullText: string; // The complete message text
  addedTimestamp: number; // When the message object was created and added to the display list
  typingCompleteTimestamp: number | null; // When typing finished for this message
  alpha: number; // For fading effect
  isTyping: boolean; // Is this message currently typing out?
}

export class TerminalOverlay {
  // --- Configuration ---
  private maxMessages: number = CONFIG.TRM_MAX_MESSAGES; // Max visible messages on screen
  private messageDurationMs: number = CONFIG.TRM_MSG_DURATION; // How long a *completed* message stays fully visible
  // Characters per second typing speed
  private fadeDurationMs: number = CONFIG.TRM_FADE_DURATION;
  private typingSpeedCharsPerSec: number = CONFIG.TRM_TYPE_SPEED_SEC;
  private font: string;
  private charHeight: number = 16; // Default/fallback character height
  private fgColor: string = CONFIG.TRM_FG_COLOUR; // Text color from config
  private cursorChar: string = CONFIG.TRM_CURSOR_CHAR; // Blinking cursor character
  private cursorBlinkRateMs: number = CONFIG.TRM_CURSOR_RATE_MS; // Cursor blink interval

  // --- State ---
  private displayMessages: TerminalMessage[] = []; // Messages currently visible/fading
  private messageQueue: string[] = []; // Queue for messages waiting to be typed
  private isCurrentlyTyping: boolean = false; // Flag: Is any message actively typing?
  private currentTypingProgress: number = 0; // Progress for the *currently* typing message

  constructor() {
    this.font = `${CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE * 0.9}px ${CONFIG.THIN_FONT_FAMILY}`;
    logger.debug('[TerminalOverlay] Initialized (Sequential Queue Mode).');
  }

  /** Sets character dimensions (call on resize) */
  updateCharDimensions(charHeight: number): void {
    this.charHeight = charHeight > 0 ? charHeight : 16;
    this.font = `${this.charHeight * 0.9}px ${CONFIG.THIN_FONT_FAMILY}`;
  }

  /**
   * Adds a new message text to the waiting queue.
   */
  addMessage(text: string): void {
    if (!text) return;
    this.messageQueue.push(text);
    logger.debug(`[TerminalOverlay] Queued message: "${text}" (Queue size: ${this.messageQueue.length})`);
  }

  /**
   * Starts displaying the next message from the queue if available and nothing else is typing.
   * Internal helper method.
   */
  private _startNextMessage(): void {
    if (this.isCurrentlyTyping || this.messageQueue.length === 0) {
      return; // Can't start if already typing or queue is empty
    }

    const nextMessageText = this.messageQueue.shift(); // Get the oldest message from queue
    if (!nextMessageText) return;

    logger.debug(`[TerminalOverlay] Starting to display message: "${nextMessageText}"`);

    const newMessage: TerminalMessage = {
      text: '', // Start empty
      fullText: nextMessageText,
      addedTimestamp: performance.now(), // Time it's added to display
      typingCompleteTimestamp: null, // Not complete yet
      alpha: 1.0,
      isTyping: true, // This message is now typing
    };

    // Add to display list and manage max messages
    this.displayMessages.push(newMessage);
    if (this.displayMessages.length > this.maxMessages) {
      this.displayMessages.shift(); // Remove the oldest visible message
    }

    // Reset typing state for the new message
    this.isCurrentlyTyping = true;
    this.currentTypingProgress = 0;
  }

  /**
   * Updates message states (typing, fading, queue processing).
   */
  update(deltaTime: number): void {
    const now = performance.now();

    // --- 1. Process Queue ---
    // Check if we can start the next message
    if (!this.isCurrentlyTyping && this.messageQueue.length > 0) {
      this._startNextMessage();
    }

    // --- 2. Update the currently typing message (if any) ---
    if (this.isCurrentlyTyping) {
      const typingMsg = this.displayMessages[this.displayMessages.length - 1]; // Assumes typing message is always last
      if (typingMsg && typingMsg.isTyping) {
        this.currentTypingProgress += this.typingSpeedCharsPerSec * deltaTime;
        const charsToShow = Math.min(typingMsg.fullText.length, Math.floor(this.currentTypingProgress));
        typingMsg.text = typingMsg.fullText.substring(0, charsToShow);

        // Check if typing completed this frame
        if (charsToShow >= typingMsg.fullText.length) {
          logger.debug(`[TerminalOverlay] Message completed typing: "${typingMsg.fullText}"`);
          typingMsg.isTyping = false; // Mark as no longer typing
          typingMsg.typingCompleteTimestamp = now; // Record completion time
          this.isCurrentlyTyping = false; // Allow next message to start
          this.currentTypingProgress = 0; // Reset progress
        }
      } else {
        // Should not happen if isCurrentlyTyping is true, but reset as a safeguard
        logger.warn(
          "[TerminalOverlay] State mismatch: isCurrentlyTyping true, but last message isn't marked as typing."
        );
        this.isCurrentlyTyping = false;
        this.currentTypingProgress = 0;
      }
    }

    // --- 3. Update Fading/Aging for all *visible* messages ---
    this.displayMessages = this.displayMessages.filter((msg) => {
      // Only start fading *after* typing is complete and duration has passed
      if (!msg.isTyping && msg.typingCompleteTimestamp) {
        const timeSinceComplete = now - msg.typingCompleteTimestamp;
        if (timeSinceComplete > this.messageDurationMs) {
          const fadeProgress = (timeSinceComplete - this.messageDurationMs) / this.fadeDurationMs;
          msg.alpha = Math.max(0, 1.0 - fadeProgress);
        }
      }
      // Keep the message if it's still typing OR hasn't fully faded
      return msg.isTyping || msg.alpha > 0;
    });
  }

  /**
   * Renders the terminal messages onto the provided context.
   */
  render(ctx: CanvasRenderingContext2D, bufferWidthPx: number, bufferHeightPx: number): void {
    ctx.save();
    ctx.font = this.font;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.fgColor;

    const now = performance.now();
    const lineHeight = this.charHeight * 1.1;
    const startY = bufferHeightPx - lineHeight;
    const startX = this.charHeight;

    // --- Render messages ---
    let typingMessageFound: TerminalMessage | null = null;
    for (let i = this.displayMessages.length - 1; i >= 0; i--) {
      const msg = this.displayMessages[i];
      const yPos = startY - (this.displayMessages.length - 1 - i) * lineHeight;

      if (yPos < 0) break; // Stop rendering if off-screen top

      ctx.globalAlpha = msg.alpha;
      ctx.fillText(msg.text, startX, yPos);

      // Identify the typing message for cursor logic
      if (msg.isTyping) {
        typingMessageFound = msg;
      }

      ctx.globalAlpha = 1.0; // Reset alpha for next loop iteration
    }

    // --- Draw Cursor (Only for the identified typing message) ---
    if (typingMessageFound) {
      const typingMsgYPos = startY; // Typing message is always at the bottom
      if (typingMsgYPos >= 0) {
        // Ensure it's on screen
        if (Math.floor(now / this.cursorBlinkRateMs) % 2 === 0) {
          const textMetrics = ctx.measureText(typingMessageFound.text);
          const cursorX = startX + textMetrics.width + 2;
          ctx.globalAlpha = typingMessageFound.alpha; // Use message alpha for cursor too
          ctx.fillText(this.cursorChar, cursorX, typingMsgYPos);
          ctx.globalAlpha = 1.0; // Reset alpha
        }
      }
    }

    ctx.restore();
  }
}
