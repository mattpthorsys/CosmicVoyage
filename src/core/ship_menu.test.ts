import { describe, expect, it } from 'vitest';
import { CargoSystem } from '../systems/cargo_systems';
import { Game } from './game';
import { Player } from './player';

function createShipMenuHarness(state: string = 'hyperspace'): any {
  const player = new Player();
  const cargoSystem = new CargoSystem();
  return Object.assign(Object.create(Game.prototype), {
    player,
    cargoSystem,
    stateManager: {
      state,
      currentPlanet: null,
    },
    popupState: 'inactive',
    targetMenuOpen: false,
    shipMenuOpen: false,
    shipMenuSection: 'main',
    shipMenuSelection: 0,
    shipMenuOffset: 0,
    shipMenuJettisonItemKey: null,
    statusMessage: '',
    forceFullRender: false,
  });
}

describe('ship menu', () => {
  it('is available in travel and surface states but not over active menus', () => {
    const game = createShipMenuHarness('hyperspace');

    expect(game.canOpenShipMenu()).toBe(true);
    game.stateManager.state = 'system';
    expect(game.canOpenShipMenu()).toBe(true);
    game.stateManager.state = 'planet';
    expect(game.canOpenShipMenu()).toBe(true);
    game.stateManager.state = 'orbit';
    expect(game.canOpenShipMenu()).toBe(false);
    game.stateManager.state = 'starbase';
    expect(game.canOpenShipMenu()).toBe(false);
    game.stateManager.state = 'hyperspace';
    game.targetMenuOpen = true;
    expect(game.canOpenShipMenu()).toBe(false);
  });

  it('jettisons confirmed cargo amounts through the confirmation menu', () => {
    const game = createShipMenuHarness();
    game.cargoSystem.addItem(game.player.cargoHold, 'IRON', 7);
    game.shipMenuJettisonItemKey = 'IRON';

    game.activateJettisonSelection({ id: 'all', cells: [] });

    expect(game.player.cargoHold.items.IRON).toBeUndefined();
    expect(game.shipMenuSection).toBe('cargo');
    expect(game.statusMessage).toContain('Jettisoned 7');
  });
});
