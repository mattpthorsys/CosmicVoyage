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
