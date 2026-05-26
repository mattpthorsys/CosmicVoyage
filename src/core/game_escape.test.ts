import { describe, expect, it, vi } from 'vitest';
import { Game } from './game';

describe('Game Escape handling', () => {
  it('does not stop the game when Escape has no active interface to cancel', () => {
    const stopGame = vi.fn();
    const game = Object.assign(Object.create(Game.prototype), {
      inputManager: {
        wasActionJustPressed: (action: string) => action === 'QUIT',
      },
      stateManager: {
        state: 'hyperspace',
        statusMessage: '',
      },
      terminalOverlay: {
        clear: vi.fn(),
        addMessage: vi.fn(),
      },
      stopGame,
      statusMessage: '',
    });

    const consumed = game._handleDiscreteActions();

    expect(consumed).toBe(true);
    expect(stopGame).not.toHaveBeenCalled();
    expect(game.statusMessage).toBe('Nothing to cancel.');
  });
});
