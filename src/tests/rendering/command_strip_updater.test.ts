import { describe, expect, it, vi } from 'vitest';
import { commandButton } from '../../core/command_bar';
import { eventManager, GameEvents } from '../../core/event_manager';
import { CommandStripUpdater } from '../../rendering/command_strip_updater';
import { TEXT_PALETTE } from '../../rendering/text_palette';

describe('CommandStripUpdater command bar', () => {
  it('renders themed command bar buttons and publishes selected actions', () => {
    const element = document.createElement('div');
    const updater = new CommandStripUpdater(element);
    const publish = vi.spyOn(eventManager, 'publish').mockImplementation(() => undefined);

    updater.update({
      context: 'interstellar',
      targetName: 'Rho N 2.0c',
      primaryButtonId: 'enter',
      selectedButtonId: 'scan',
      leftButtons: [commandButton('enter', 'Enter System', 'ENTER_SYSTEM', { tone: 'green', key: 'Enter' })],
      buttons: [commandButton('scan', 'Scan', 'SCAN_SYSTEM_OBJECT', { key: 's' })],
      rightButtons: [commandButton('alert', 'Alert', 'RED_RESERVED', { tone: 'red', enabled: false })],
    });

    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual([
      '[ENTER] Enter System *',
      '[S] Scan',
      'Alert',
    ]);
    expect(buttons[0].style.backgroundColor).not.toBe('');
    expect(buttons[1].style.backgroundColor).toBe(TEXT_PALETTE.text);
    expect(buttons[1].style.color).toBe(TEXT_PALETTE.inverseText);
    expect(buttons[0].classList.contains('cosmic-command-button-green')).toBe(true);
    expect(document.getElementById('cosmic-command-bar-styles')?.textContent).toContain(
      'cosmic-command-green-flash'
    );

    buttons[0].click();
    buttons[2].click();

    expect(publish).toHaveBeenCalledWith(GameEvents.COMMAND_BAR_ACTION_SELECTED, {
      id: 'enter',
      action: 'ENTER_SYSTEM',
    });
    expect(publish).toHaveBeenCalledTimes(1);
    publish.mockRestore();
  });
});
