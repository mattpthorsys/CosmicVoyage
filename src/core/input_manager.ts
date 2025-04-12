/* FILE: src/core/input_manager.ts */
// src/core/input_manager.ts (Changed 's' key action)

import { CONFIG } from '../config';
import { logger } from '../utils/logger';
/**
 * Handles keyboard input, tracking currently held keys, active actions,
 * and actions that were just pressed.
 * Supports continuous actions (like movement)
 * and discrete actions (like landing).
 */
export class InputManager {
  // Set of currently physically held down keys (e.g., "ArrowUp", "Shift")
  private keysPressed: Set<string> = new Set();
  // Set of actions currently active based on held keys (e.g., "MOVE_UP", "FINE_CONTROL")
  private activeActions: Set<string> = new Set();
  // Set of actions that became active *this frame* (cleared each update)
  public justPressedActions: Set<string> = new Set();
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
        // *** MODIFICATION: Map 's' to SCAN_SYSTEM_OBJECT instead of PEEK_SYSTEM ***
        // The actual value comes from CONFIG, so we just need to ensure CONFIG is updated
        // Assuming CONFIG.KEY_BINDINGS.PEEK_SYSTEM was changed to SCAN_SYSTEM_OBJECT externally
        // or that the key 's' is now mapped to SCAN_SYSTEM_OBJECT in config.ts
        this.keyToActionMap.set(boundKey.toLowerCase(), actionName);

        // Handle Shift key mapping specifically if needed, though we check shiftKey directly
        if (boundKey === 'Shift') {
            this.keyToActionMap.set('shift', 'FINE_CONTROL');
        }
        // Add similar handling for Control key if needed
        if (boundKey === 'Control') { // Example if Control is bound
             this.keyToActionMap.set('control', 'BOOST'); // Assuming BOOST action
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
   * Updates the manager's state.
   * Should be called once per game loop tick,
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
    // Log the raw event first
    // logger.debug(`--- Raw KeyDown Received: key='${e.key}' code='${e.code}' ---`); // Noisy

    if (!this.isListening) return;
    // logger.debug('--- isListening passed...'); // Noisy

    const key = e.key;
    const lowerKey = key.toLowerCase();

    // If key is already held (present in keysPressed), ignore the repeat event.
    if (this.keysPressed.has(key)) {
      // logger.debug(`>>> KeyDown '${key}' repeat ignored.`); // Noisy
      return; // Exit early if it's a repeat
    }

    // Add the raw key to the pressed set
    this.keysPressed.add(key);
    logger.debug(`[InputManager] Keydown registered: ${key} (Shift: ${e.shiftKey}, Ctrl: ${e.ctrlKey})`);

    // --- Handle Modifiers Directly ---
    if (e.shiftKey) {
        if (!this.activeActions.has('FINE_CONTROL')) {
             logger.debug(`[InputManager] FINE_CONTROL activated.`);
             this.activeActions.add('FINE_CONTROL');
             this.justPressedActions.add('FINE_CONTROL'); // Track initial press
        }
    }
    if (e.ctrlKey) {
        if (!this.activeActions.has('BOOST')) {
             logger.debug(`[InputManager] BOOST activated.`);
             this.activeActions.add('BOOST');
             this.justPressedActions.add('BOOST'); // Track initial press
        }
    }

    // --- Handle Base Actions (Non-Modifiers) ---
    if (key !== 'Shift' && key !== 'Control') {
        const action = this.keyToActionMap.get(lowerKey);
        // logger.debug(`>>> KeyDown Mapped Action for '${lowerKey}': ${action ?? 'NONE'}`); // Noisy

        if (action) {
            // logger.debug(`>>> KeyDown Activating Action: ${action}`); // Noisy
            this.activeActions.add(action);
            this.justPressedActions.add(action);
            // logger.debug(`>>> KeyDown: Added '${action}' to justPressedActions. Current justPressed: [${Array.from(this.justPressedActions).join(', ')}]`); // Noisy
            e.preventDefault();
            // logger.debug(`>>> KeyDown: Prevented default for mapped key '${key}'`); // Noisy
        }
    } else {
        // If it WAS a modifier key, prevent default anyway if we handle it
        if (key === 'Shift' || key === 'Control') {
            e.preventDefault();
            // logger.debug(`>>> KeyDown: Prevented default for modifier key '${key}'`); // Noisy
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
    if (key === 'Control') {
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