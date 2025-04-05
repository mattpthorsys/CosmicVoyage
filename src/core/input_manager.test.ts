// src/core/input_manager.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager } from './input_manager';
import { CONFIG } from '../config'; // Import actual config

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to simulate key events
function simulateKeyEvent(type: 'keydown' | 'keyup', key: string, shiftKey: boolean = false) {
    const event = new KeyboardEvent(type, { key: key, shiftKey: shiftKey, bubbles: true, cancelable: true });
    // Mock preventDefault
    vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    return event; // Return event to check preventDefault
}

describe('InputManager (Refactored)', () => {
  let inputManager: InputManager;
  let addEventListenerSpy: vi.SpyInstance;
  let removeEventListenerSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on window methods
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    inputManager = new InputManager();

    // Clear spies potentially called by constructor (though it shouldn't)
    addEventListenerSpy.mockClear();
    removeEventListenerSpy.mockClear();
  });

  afterEach(() => {
    inputManager.stopListening(); // Ensure listeners are cleaned up
    vi.restoreAllMocks();
  });

  it('constructor should build the key-to-action map', () => {
      const map = (inputManager as any).keyToActionMap as Map<string, string>;
      expect(map.size).toBeGreaterThan(0);
      // Check a few key bindings
      expect(map.get(CONFIG.KEY_BINDINGS.MOVE_UP.toLowerCase())).toBe('MOVE_UP');
      expect(map.get(CONFIG.KEY_BINDINGS.LAND.toLowerCase())).toBe('LAND');
      expect(map.get('shift')).toBe('FINE_CONTROL'); // Check shift mapping
  });

  it('startListening should add listeners', () => {
    inputManager.startListening();
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    expect((inputManager as any).isListening).toBe(true);
  });

  it('stopListening should remove listeners and clear state', () => {
    inputManager.startListening();
    simulateKeyEvent('keydown', CONFIG.KEY_BINDINGS.MOVE_UP); // Press a key
    simulateKeyEvent('keydown', 'Shift'); // Press shift

    expect((inputManager as any).keysPressed.size).toBe(2);
    expect((inputManager as any).activeActions.size).toBe(2); // MOVE_UP and FINE_CONTROL

    inputManager.stopListening();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    expect((inputManager as any).isListening).toBe(false);
    expect((inputManager as any).keysPressed.size).toBe(0);
    expect((inputManager as any).activeActions.size).toBe(0);
    expect((inputManager as any).justPressedActions.size).toBe(0);
  });

  it('should track active actions based on held keys', () => {
    inputManager.startListening();
    simulateKeyEvent('keydown', CONFIG.KEY_BINDINGS.MOVE_LEFT);
    simulateKeyEvent('keydown', 'Shift');

    expect(inputManager.isActionActive('MOVE_LEFT')).toBe(true);
    expect(inputManager.isActionActive('FINE_CONTROL')).toBe(true);
    expect(inputManager.isActionActive('MOVE_UP')).toBe(false);

    simulateKeyEvent('keyup', CONFIG.KEY_BINDINGS.MOVE_LEFT);
    expect(inputManager.isActionActive('MOVE_LEFT')).toBe(false);
    expect(inputManager.isActionActive('FINE_CONTROL')).toBe(true); // Shift still held

    simulateKeyEvent('keyup', 'Shift');
    expect(inputManager.isActionActive('FINE_CONTROL')).toBe(false);
  });

   it('should track just pressed actions only for the current frame', () => {
    inputManager.startListening();

    // Frame 1
    simulateKeyEvent('keydown', CONFIG.KEY_BINDINGS.SCAN);
    simulateKeyEvent('keydown', 'Shift');
    expect(inputManager.wasActionJustPressed('SCAN')).toBe(true);
    expect(inputManager.wasActionJustPressed('FINE_CONTROL')).toBe(true);
    expect(inputManager.wasActionJustPressed('MOVE_UP')).toBe(false);
    expect(inputManager.isActionActive('SCAN')).toBe(true); // Also active
    expect(inputManager.isActionActive('FINE_CONTROL')).toBe(true);

    // Frame 2 (after update)
    inputManager.update();
    expect(inputManager.wasActionJustPressed('SCAN')).toBe(false); // Cleared by update
    expect(inputManager.wasActionJustPressed('FINE_CONTROL')).toBe(false); // Cleared by update
    expect(inputManager.isActionActive('SCAN')).toBe(true); // Still active (key held)
    expect(inputManager.isActionActive('FINE_CONTROL')).toBe(true); // Still active (key held)

    // Frame 3 (key released)
    simulateKeyEvent('keyup', CONFIG.KEY_BINDINGS.SCAN);
    inputManager.update();
    expect(inputManager.isActionActive('SCAN')).toBe(false);
    expect(inputManager.wasActionJustPressed('SCAN')).toBe(false);
  });

   it('should ignore keydown repeats for held keys', () => {
      inputManager.startListening();
      const key = CONFIG.KEY_BINDINGS.MOVE_DOWN;
      const action = 'MOVE_DOWN';

      // First press
      simulateKeyEvent('keydown', key);
      expect((inputManager as any).justPressedActions.has(action)).toBe(true);
      expect((inputManager as any).activeActions.has(action)).toBe(true);

      inputManager.update(); // Simulate frame end

      expect((inputManager as any).justPressedActions.has(action)).toBe(false);

      // Second press (simulating hold repeat)
      simulateKeyEvent('keydown', key);
      // Should NOT be added to justPressed again, but should remain active
      expect((inputManager as any).justPressedActions.has(action)).toBe(false);
      expect((inputManager as any).activeActions.has(action)).toBe(true);
   });

    it('should prevent default browser action for bound keys', () => {
        inputManager.startListening();
        const moveEvent = simulateKeyEvent('keydown', CONFIG.KEY_BINDINGS.MOVE_RIGHT);
        expect(moveEvent.preventDefault).toHaveBeenCalled();

        const landEvent = simulateKeyEvent('keydown', CONFIG.KEY_BINDINGS.LAND);
        expect(landEvent.preventDefault).toHaveBeenCalled();

        const shiftEvent = simulateKeyEvent('keydown', 'Shift'); // Assuming Shift is used for FINE_CONTROL
        // Only prevent default if Shift itself is explicitly bound or handled as FINE_CONTROL trigger
        // In this refactor, Shift directly triggers FINE_CONTROL action add/remove,
        // but might not be in KEY_BINDINGS directly. Let's assume it should be prevented.
         // Check if the keymapping includes 'shift' to decide if preventDefault should be called
        if ((inputManager as any).keyToActionMap.has('shift')) {
             expect(shiftEvent.preventDefault).toHaveBeenCalled();
        }


        const unboundEvent = simulateKeyEvent('keydown', 'UnboundKey');
        expect(unboundEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('clearState should reset all sets', () => {
        inputManager.startListening();
        simulateKeyEvent('keydown', CONFIG.KEY_BINDINGS.MOVE_UP);
        simulateKeyEvent('keydown', 'Shift');
        inputManager.update(); // Clear justPressed

        inputManager.clearState();

        expect((inputManager as any).keysPressed.size).toBe(0);
        expect((inputManager as any).activeActions.size).toBe(0);
        expect((inputManager as any).justPressedActions.size).toBe(0);
    });

});