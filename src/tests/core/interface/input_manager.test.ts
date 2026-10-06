import { describe, expect, it } from 'vitest';
import { InputManager } from '../../../core/input_manager';

/** Creates a keyboard event with stable key and code values. */
function keyEvent(key: string, code: string): KeyboardEvent {
  return {
    key,
    code,
    shiftKey: false,
    ctrlKey: false,
    preventDefault: () => undefined,
  } as KeyboardEvent;
}

describe('InputManager', () => {
  it('exposes fresh Y/N keys without changing navigation bindings and clears them between frames', () => {
    const input = new InputManager();
    input.startListening();
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN' }));
      expect(input.wasKeyJustPressed('n')).toBe(true);
      expect(input.wasActionJustPressed('TARGET_MENU')).toBe(true);
      input.update();
      expect(input.wasKeyJustPressed('n')).toBe(false);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'n', code: 'KeyN' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Y', code: 'KeyY' }));
      expect(input.wasKeyJustPressed('y')).toBe(true);
      input.clearState();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Y', code: 'KeyY', repeat: true }));
      expect(input.wasKeyJustPressed('y')).toBe(false);
    } finally {
      input.stopListening();
    }
  });
  it.each([
    ['o', 'KeyO', 'SHIP_MENU'],
    ['O', 'KeyO', 'SHIP_MENU'],
    ['i', 'KeyI', 'ROVER_CARGO'],
    ['I', 'KeyI', 'ROVER_CARGO'],
    ['p', 'KeyP', 'DOWNLOAD_LOG'],
    ['F4', 'F4', 'INFO_TEST'],
  ])('maps %s/%s to %s without shadowing another shortcut', (key, code, action) => {
    const input = new InputManager() as any;
    input.isListening = true;
    input._handleKeyDown(keyEvent(key, code));
    expect([...input.justPressedActions]).toEqual([action]);
    input._handleKeyUp(keyEvent(key, code));
    expect(input.isActionActive(action)).toBe(false);
  });

  it('does not treat a repeated Enter as fresh confirmation after a modal clears input', () => {
    const input = new InputManager() as any;
    input.isListening = true;
    input._handleKeyDown(keyEvent('Enter', 'Enter'));
    input.clearState();
    input._handleKeyDown({ ...keyEvent('Enter', 'Enter'), repeat: true });
    expect(input.wasActionJustPressed('ENTER_SYSTEM')).toBe(false);
    expect(input.wasAnyKeyJustPressed()).toBe(false);
    input._handleKeyUp(keyEvent('Enter', 'Enter'));
    input._handleKeyDown(keyEvent('Enter', 'Enter'));
    expect(input.wasActionJustPressed('ENTER_SYSTEM')).toBe(true);
  });

  it('maps the mission journal without conflicting with the mining key', () => {
    const input = new InputManager() as any;
    input.isListening = true;
    input._handleKeyDown(keyEvent('j', 'KeyJ'));
    expect(input.wasActionJustPressed('MISSION_JOURNAL')).toBe(true);
    input._handleKeyUp(keyEvent('j', 'KeyJ'));
    input.update();
    input._handleKeyDown(keyEvent('m', 'KeyM'));
    expect(input.wasActionJustPressed('MINE')).toBe(true);
  });

  it('detects unbound fresh keys, ignores held repeats, and clears frame and session state', () => {
    const input = new InputManager() as any;
    input.isListening = true;
    input._handleKeyDown(keyEvent('F9', 'F9'));
    expect(input.wasAnyKeyJustPressed()).toBe(true);
    expect(input.justPressedActions.size).toBe(0);
    input.update();
    expect(input.wasAnyKeyJustPressed()).toBe(false);
    input._handleKeyDown(keyEvent('F9', 'F9'));
    expect(input.wasAnyKeyJustPressed()).toBe(false);
    input._handleKeyUp(keyEvent('F9', 'F9'));
    input._handleKeyDown(keyEvent('F9', 'F9'));
    expect(input.wasAnyKeyJustPressed()).toBe(true);
    input.clearState();
    expect(input.wasAnyKeyJustPressed()).toBe(false);
    input._handleKeyDown(keyEvent('Escape', 'Escape'));
    expect(input.wasAnyKeyJustPressed()).toBe(true);
    expect(input.wasActionJustPressed('QUIT')).toBe(true);
  });

  it('maps numpad diagonals by physical code when NumLock is off', () => {
    const input = new InputManager() as any;
    input.isListening = true;

    input._handleKeyDown(keyEvent('Home', 'Numpad7'));

    expect(input.isActionActive('MOVE_UP_LEFT')).toBe(true);

    input._handleKeyUp(keyEvent('Home', 'Numpad7'));

    expect(input.isActionActive('MOVE_UP_LEFT')).toBe(false);
  });

  it('maps the Galaxy instrument and dedicated Home recenter controls', () => {
    const input = new InputManager() as any;
    input.isListening = true;

    input._handleKeyDown(keyEvent('g', 'KeyG'));
    expect(input.wasActionJustPressed('GALAXY_MAP')).toBe(true);
    input._handleKeyUp(keyEvent('g', 'KeyG'));

    input.update();
    input._handleKeyDown(keyEvent('Home', 'Home'));
    expect(input.wasActionJustPressed('GALAXY_RECENTER')).toBe(true);
    expect(input.isActionActive('MOVE_UP_LEFT')).toBe(false);
  });
});
