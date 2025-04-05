// src/core/input_manager.ts

import { CONFIG } from '../config';
import { logger } from '../utils/logger';

/**
 * Handles keyboard input, tracking currently held keys, active actions,
 * and actions that were just pressed. Supports continuous actions (like movement)
 * and discrete actions (like landing).
 */
export class InputManager {
  // Set of currently physically held down keys (e.g., "ArrowUp", "Shift")
  private keysPressed: Set<string> = new Set();
  // Set of actions currently active based on held keys (e.g., "MOVE_UP", "FINE_CONTROL")
  private activeActions: Set<string> = new Set();
  // Set of actions that became active *this frame* (cleared each update)
  private justPressedActions: Set<string> = new Set();

  private isListening: boolean = false;
  // Memoized mapping from key codes to action names for faster lookups
  private keyToActionMap: Map<string, string> = new Map();

  constructor() {
    logger.debug('[InputManager] Instance created.');
    this._buildKeyToActionMap();
    // Listeners are attached explicitly via startListening()
  }

  /** Pre-calculates the mapping from key codes to action names. */
  private _buildKeyToActionMap(): void {
    this.keyToActionMap.clear();
    for (const [actionName, boundKey] of Object.entries(CONFIG.KEY_BINDINGS)) {
        // Store lowercase key for case-insensitive matching during event handling
        this.keyToActionMap.set(boundKey.toLowerCase(), actionName);
        // Also handle Shift key mapping specifically if needed, though we check shiftKey directly
        if (boundKey === 'Shift') {
            this.keyToActionMap.set('shift', 'FINE_CONTROL'); // Map 'shift' (lowercase)
        }
    }
     logger.debug('[InputManager] Key to action map built:', this.keyToActionMap);
  }


  /** Starts listening for keyboard events. */
  startListening(): void {
    if (this.isListening) return;
    logger.info('[InputManager] Starting input listeners.');
    // Use arrow functions to maintain 'this' context without bind
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);
    this.isListening = true;
  }

  /** Stops listening for keyboard events. */
  stopListening(): void {
    if (!this.isListening) return;
    logger.info('[InputManager] Stopping input listeners.');
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup', this._handleKeyUp);
    this.clearState(); // Clear all sets
    this.isListening = false;
  }

  /**
   * Clears the internal state (pressed keys, active actions, just pressed).
   * Called when stopping listening or manually resetting state.
   */
  clearState(): void {
    logger.debug('[InputManager] Clearing keys pressed and action states.');
    this.keysPressed.clear();
    this.activeActions.clear();
    this.justPressedActions.clear();
  }


  /**
   * Updates the manager's state. Should be called once per game loop tick,
   * typically *before* processing input for the frame.
   * Clears the "just pressed" actions from the previous frame.
   */
  update(): void {
    this.justPressedActions.clear();
  }

  /**
   * Checks if a specific action is currently active (i.e., the corresponding key is held).
   * @param action The action name (e.g., "MOVE_UP", "FINE_CONTROL").
   * @returns True if the action is active, false otherwise.
   */
  isActionActive(action: string): boolean {
    return this.activeActions.has(action);
  }

   /**
   * Checks if a specific action was *just* activated in the current frame.
   * Useful for discrete actions that should only trigger once per key press.
   * @param action The action name (e.g., "LAND", "SCAN").
   * @returns True if the action was just pressed, false otherwise.
   */
  wasActionJustPressed(action: string): boolean {
    return this.justPressedActions.has(action);
  }

  // --- Private Event Handlers ---

  /** Handles keydown events. Arrow function for correct 'this'. */
  private _handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isListening) return;

    const key = e.key;
    const lowerKey = key.toLowerCase();

    if (this.keysPressed.has(key)) {
      return; // Ignore repeats
    }

    // Prevent default for bound keys
    if (Object.values(CONFIG.KEY_BINDINGS).includes(key) || key === 'Shift' || key === 'Control') {
       e.preventDefault();
    }


    logger.debug(`[InputManager] Keydown: ${key} (Shift: ${e.shiftKey}, Ctrl: ${e.ctrlKey})`); // Log Ctrl state
    this.keysPressed.add(key);

    // Handle Modifiers (Shift -> FINE_CONTROL, Ctrl -> BOOST)
    if (e.shiftKey && !this.activeActions.has('FINE_CONTROL')) {
        logger.debug(`[InputManager] FINE_CONTROL activated.`);
        this.activeActions.add('FINE_CONTROL');
        this.justPressedActions.add('FINE_CONTROL');
    }
    if (e.ctrlKey && !this.activeActions.has('BOOST')) { // <<< ADDED: Check for Ctrl
        logger.debug(`[InputManager] BOOST activated.`);
        this.activeActions.add('BOOST');
        this.justPressedActions.add('BOOST');
    }


    // Find corresponding base action from map (ignore modifiers here)
    if (key !== 'Shift' && key !== 'Control') { // Don't map modifiers themselves as actions here
        const action = this.keyToActionMap.get(lowerKey);
        if (action) {
            if (!this.activeActions.has(action)) {
                logger.debug(`[InputManager] Action activated: ${action}`);
                this.activeActions.add(action);
                this.justPressedActions.add(action);
            }
        }
    }
  };

  private _handleKeyUp = (e: KeyboardEvent): void => {
    if (!this.isListening) return;

    const key = e.key;
    const lowerKey = key.toLowerCase();

    logger.debug(`[InputManager] Keyup: ${key} (Shift: ${e.shiftKey}, Ctrl: ${e.ctrlKey})`); // Log Ctrl state
    this.keysPressed.delete(key);

    // Handle Modifier Releases
    if (key === 'Shift') {
        logger.debug(`[InputManager] FINE_CONTROL deactivated.`);
        this.activeActions.delete('FINE_CONTROL');
    }
    if (key === 'Control') { // <<< ADDED: Check for Ctrl release
        logger.debug(`[InputManager] BOOST deactivated.`);
        this.activeActions.delete('BOOST');
    }


    // Find corresponding base action from map (ignore modifiers)
    if (key !== 'Shift' && key !== 'Control') {
        const action = this.keyToActionMap.get(lowerKey);
        if (action) {
            logger.debug(`[InputManager] Action deactivated: ${action}`);
            this.activeActions.delete(action);
        }
    }
  };

   // Optional: Destroy method to ensure cleanup
   destroy(): void {
     this.stopListening();
   }
}