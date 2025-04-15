/* FILE: src/core/input_manager.ts */
// Full file integrating Zoom key bindings and handling.

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
        const lowerBoundKey = boundKey.toLowerCase();

        // Map the primary bound key (lowercase)
        this.keyToActionMap.set(lowerBoundKey, actionName);

        // --- Special Handling for Zoom Keys --- <<< ADDED >>>
        // Check actionName first to avoid misinterpreting other keys like '=' if bound differently
        if (actionName === 'ZOOM_IN' && boundKey === '=') {
            this.keyToActionMap.set('+', actionName); // Also map '+' (Shift + '=')
        }
        // Numpad keys usually have distinct key values like "NumpadAdd"
        else if (actionName === 'ZOOM_IN_NUMPAD') {
             this.keyToActionMap.set('numpadadd', actionName); // Map lowercase "numpadadd"
        }
        else if (actionName === 'ZOOM_OUT_NUMPAD') {
             this.keyToActionMap.set('numpadsubtract', actionName); // Map lowercase "numpadsubtract"
        }
        // --- End Zoom Key Handling ---

        // Handle standard modifiers
        else if (boundKey === 'Shift') {
            // Ensure 'shift' maps to FINE_CONTROL, overriding potential other bindings for 'shift' key itself
            this.keyToActionMap.set('shift', 'FINE_CONTROL');
        }
        else if (boundKey === 'Control') {
             // Ensure 'control' maps to BOOST
             this.keyToActionMap.set('control', 'BOOST');
        }
    }
     // Add mappings for modifiers if they aren't explicitly in KEY_BINDINGS
     if (!this.keyToActionMap.has('shift')) {
         this.keyToActionMap.set('shift', 'FINE_CONTROL');
     }
     if (!this.keyToActionMap.has('control')) {
         this.keyToActionMap.set('control', 'BOOST');
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
    // Clear the 'just pressed' actions at the beginning of each frame update
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

    const key = e.key; // e.g., "ArrowUp", "Shift", "=", "+", "NumpadAdd"
    const lowerKey = key.toLowerCase(); // e.g., "arrowup", "shift", "=", "+", "numpadadd"

    // Ignore repeats for already held keys
    if (this.keysPressed.has(key)) {
      return;
    }
    this.keysPressed.add(key);
    logger.debug(`[InputManager] Keydown registered: ${key} (Shift: ${e.shiftKey}, Ctrl: ${e.ctrlKey})`);

    // --- Handle Modifiers Directly ---
    if (e.shiftKey && !this.activeActions.has('FINE_CONTROL')) {
        logger.debug(`[InputManager] FINE_CONTROL activated.`);
        this.activeActions.add('FINE_CONTROL');
        this.justPressedActions.add('FINE_CONTROL'); // Track initial press
    }
    if (e.ctrlKey && !this.activeActions.has('BOOST')) {
        logger.debug(`[InputManager] BOOST activated.`);
        this.activeActions.add('BOOST');
        this.justPressedActions.add('BOOST'); // Track initial press
    }

    // --- Handle Base Actions (including zoom keys mapped via lowercase) ---
    // Determine the action associated with the pressed key
    let action: string | undefined = undefined;
    // Check specific keys first if they have multiple mappings (like '+')
    if (key === '+') {
        action = this.keyToActionMap.get('+'); // Check '+' specifically
    }
    // Fallback to lowercase lookup
    if (!action) {
        action = this.keyToActionMap.get(lowerKey);
    }

    // If an action is found and it's not just a modifier key itself being pressed
    if (action && key !== 'Shift' && key !== 'Control') {
        // Check if the action is *already* active (for continuous actions like move)
        // Only add to justPressedActions if it wasn't already active
        if (!this.activeActions.has(action)) {
            this.justPressedActions.add(action);
            logger.debug(`[InputManager] Action '${action}' added to justPressedActions.`);
        }
        // Always add to activeActions on keydown (handles holds)
        this.activeActions.add(action);
        logger.debug(`[InputManager] Action '${action}' added/confirmed in activeActions.`);

        // Prevent default browser behavior for bound keys
        e.preventDefault();
    } else if (key === 'Shift' || key === 'Control') {
        // Prevent default for modifier keys if we handle them (prevents page scrolling etc.)
        e.preventDefault();
    }
  };

  /** Handles keyup events. Arrow function for correct 'this'. */
  private _handleKeyUp = (e: KeyboardEvent): void => {
    if (!this.isListening) return;

    const key = e.key;
    const lowerKey = key.toLowerCase();

    logger.debug(`[InputManager] Keyup: ${key} (Shift: ${e.shiftKey}, Ctrl: ${e.ctrlKey})`);
    this.keysPressed.delete(key);

    // --- Handle Modifier Releases ---
    // If Shift is released, deactivate FINE_CONTROL
    if (key === 'Shift') {
        logger.debug(`[InputManager] FINE_CONTROL deactivated.`);
        this.activeActions.delete('FINE_CONTROL');
    }
    // If Control is released, deactivate BOOST
    if (key === 'Control') {
        logger.debug(`[InputManager] BOOST deactivated.`);
        this.activeActions.delete('BOOST');
    }

    // --- Deactivate Base Actions ---
    // Find corresponding action(s) for the released key
    let action: string | undefined = undefined;
    if (key === '+') {
        action = this.keyToActionMap.get('+');
    }
    if (!action) {
        action = this.keyToActionMap.get(lowerKey);
    }

    // If an action is found and it's not a modifier action itself
    if (action && action !== 'FINE_CONTROL' && action !== 'BOOST') {
        logger.debug(`[InputManager] Action deactivated: ${action}`);
        this.activeActions.delete(action);
    }
  };

   /** Optional: Destroy method to ensure cleanup */
   destroy(): void {
     this.stopListening();
   }
} // End InputManager class
