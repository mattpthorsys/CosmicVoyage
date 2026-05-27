import { describe, expect, it } from 'vitest';
import { InputManager } from '../../../core/input_manager';

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
});
