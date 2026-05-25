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

  it('formats cargo, crew, and ship status as readable instrument panels', () => {
    const game = createShipMenuHarness();
    game.cargoSystem.addItem(game.player.cargoHold, 'IRON', 25);

    game.shipMenuSection = 'cargo';
    const cargo = game.createShipMenuModel();
    expect(cargo.columns).toEqual(['BAY / CARGO', 'QTY', 'VALUE', 'LOAD / ACTION']);
    expect(cargo.rows[0].cells[3]).toContain('[');
    expect(cargo.rows.some((row: any) => row.cells[3].includes('Enter to arm ejector'))).toBe(true);

    game.shipMenuSection = 'crew';
    const crew = game.createShipMenuModel();
    expect(crew.rows[0].cells[2]).toMatch(/green|wounded|Uncrewed/);
    expect(crew.rows[1].cells[3]).toContain('XP');

    game.shipMenuSection = 'status';
    const status = game.createShipMenuModel();
    expect(status.rows.some((row: any) => row.id === 'fuel' && row.cells[3].includes('['))).toBe(true);
    expect(status.rows.some((row: any) => row.id === 'navigation')).toBe(true);
  });
});
