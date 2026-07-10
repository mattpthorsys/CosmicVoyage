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
