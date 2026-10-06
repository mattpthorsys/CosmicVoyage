import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../../config';
import { eventManager, GameEvents } from '../../../core/event_manager';
import { Game } from '../../../core/game';
import type { GameState } from '../../../core/game_state_manager';
import { InputManager } from '../../../core/input_manager';
import { Player } from '../../../core/player';
import { StarbaseController } from '../../../core/starbase_controller';

/** Dispatches a fresh key press and release through the real window listeners. */
function pressKey(key: string, code: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, code, cancelable: true, ...modifiers });
  window.dispatchEvent(event);
  window.dispatchEvent(new KeyboardEvent('keyup', { key, code, ...modifiers }));
  return event;
}

/** Enters the complete credit sequence while Shift remains held. */
function enterCreditSequence(): void {
  for (const letter of ['K', 'Y', 'R']) {
    pressKey(letter, `Key${letter}`, { shiftKey: true });
  }
}

interface CreditGameHarness {
  player: Player;
  statusMessage: string;
  forceFullRender: boolean;
  _starbaseMode: StarbaseController;
  handleShipRepairInput: ReturnType<typeof vi.fn>;
  _publishStatusUpdate: ReturnType<typeof vi.fn>;
  _processInput(): void;
}

/** Tests the real frame input entry point without constructing canvas/world services. */
function createCreditGameHarness(inputManager: InputManager, state: GameState): CreditGameHarness {
  // Only the early credit branch and a blocking modal are exercised by this partial Game.
  return Object.assign(Object.create(Game.prototype), {
    inputManager,
    player: new Player(),
    stateManager: { state },
    statusMessage: '',
    forceFullRender: false,
    _starbaseMode: new StarbaseController(),
    handleShipRepairInput: vi.fn().mockReturnValue(true),
    _publishStatusUpdate: vi.fn(),
  });
}

describe('Playtest credit shortcut', () => {
  let input: InputManager;

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    input = new InputManager();
    input.startListening();
  });

  afterEach(() => {
    input.destroy();
    vi.restoreAllMocks();
  });

  it('consumes shifted letters across frames without firing, refuelling, or revealing popups', () => {
    for (const letter of ['K', 'Y']) {
      expect(pressKey(letter, `Key${letter}`, { shiftKey: true }).defaultPrevented).toBe(true);
      expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);
      expect(input.wasActionJustPressed('BIOLOGY_SHOOT')).toBe(false);
      expect(input.wasAnyKeyJustPressed()).toBe(false);
      input.update();
    }

    expect(pressKey('R', 'KeyR', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(true);
    expect(input.wasActionJustPressed('REFUEL')).toBe(false);
    expect(input.isActionActive('TEST_CREDITS')).toBe(false);
    expect(input.wasAnyKeyJustPressed()).toBe(false);
    expect(input.isActionActive('FINE_CONTROL')).toBe(true);
    input.update();
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);
  });

  it('allows repeated complete sequences but ignores held-key repeats', () => {
    pressKey('K', 'KeyK', { shiftKey: true });
    pressKey('Y', 'KeyY', { shiftKey: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', code: 'KeyR', shiftKey: true }));
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(true);
    input.update();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'R', code: 'KeyR', shiftKey: true, repeat: true })
    );
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'R', code: 'KeyR', shiftKey: true }));

    enterCreditSequence();
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(true);
  });

  it('cancels on Shift release and still recognizes keyup after the letter changes case', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', code: 'KeyK', shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'k', code: 'KeyK' }));
    pressKey('Y', 'KeyY', { shiftKey: true });
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);

    input.update();
    enterCreditSequence();
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(true);
  });

  it('cancels partial sequences on input reset or listening restart', () => {
    pressKey('K', 'KeyK', { shiftKey: true });
    input.clearState();
    pressKey('Y', 'KeyY', { shiftKey: true });
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);

    pressKey('K', 'KeyK', { shiftKey: true });
    input.stopListening();
    input.startListening();
    pressKey('Y', 'KeyY', { shiftKey: true });
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);
  });

  it('rejects wrong order and restarts when K is pressed again', () => {
    pressKey('K', 'KeyK', { shiftKey: true });
    pressKey('X', 'KeyX', { shiftKey: true });
    pressKey('Y', 'KeyY', { shiftKey: true });
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);

    input.update();
    pressKey('K', 'KeyK', { shiftKey: true });
    enterCreditSequence();
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(true);
  });

  it('expires after three seconds between letters', () => {
    pressKey('K', 'KeyK', { shiftKey: true });
    vi.mocked(performance.now).mockReturnValue(4001);
    pressKey('Y', 'KeyY', { shiftKey: true });
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);

    enterCreditSequence();
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(true);
  });

  it.each(['ctrlKey', 'altKey', 'metaKey'] as const)('rejects an extra %s modifier', (modifier) => {
    pressKey('K', 'KeyK', { shiftKey: true });
    pressKey('Y', 'KeyY', { shiftKey: true, [modifier]: true });
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);
  });

  it('preserves ordinary K and R bindings and standalone Shift+R', () => {
    pressKey('k', 'KeyK');
    expect(input.wasActionJustPressed('BIOLOGY_SHOOT')).toBe(true);
    input.update();
    pressKey('r', 'KeyR');
    expect(input.wasActionJustPressed('REFUEL')).toBe(true);
    input.update();
    pressKey('R', 'KeyR', { shiftKey: true });
    expect(input.wasActionJustPressed('REFUEL')).toBe(true);
    expect(input.wasActionJustPressed('TEST_CREDITS')).toBe(false);
  });

  it.each<GameState>(['hyperspace', 'system', 'orbit', 'planet', 'starbase'])(
    'grants funds once before modal handling in %s and publishes normal credit updates',
    (state) => {
      const game = createCreditGameHarness(input, state);
      const previousCredits = game.player.resources.credits;
      const publish = vi.spyOn(eventManager, 'publish');
      enterCreditSequence();
      game._processInput();

      expect(game.player.resources.credits).toBe(previousCredits + CONFIG.TEST_CREDIT_GRANT);
      expect(game.statusMessage).toBe(`Test funds: +${CONFIG.TEST_CREDIT_GRANT.toLocaleString()} Cr.`);
      expect(game.forceFullRender).toBe(true);
      expect(game.handleShipRepairInput).not.toHaveBeenCalled();
      expect(game._publishStatusUpdate).toHaveBeenCalledOnce();
      expect(publish).toHaveBeenCalledExactlyOnceWith(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: previousCredits + CONFIG.TEST_CREDIT_GRANT,
        amountChanged: CONFIG.TEST_CREDIT_GRANT,
      });
      if (state === 'starbase') expect(game._starbaseMode.alert).toBe(game.statusMessage);

      input.update();
      game._processInput();
      expect(game.player.resources.credits).toBe(previousCredits + CONFIG.TEST_CREDIT_GRANT);
      expect(publish).toHaveBeenCalledOnce();
      expect(game.handleShipRepairInput).toHaveBeenCalledOnce();

      enterCreditSequence();
      game._processInput();
      expect(game.player.resources.credits).toBe(previousCredits + CONFIG.TEST_CREDIT_GRANT * 2);
    }
  );
});
