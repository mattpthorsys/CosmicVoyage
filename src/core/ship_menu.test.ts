import { describe, expect, it } from 'vitest';
import { Starbase } from '../entities/starbase';
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
    currentShipCompartmentId: 'bridge',
    quantitySelector: null,
    jettisonConfirmation: null,
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

  it('requires a yes/no confirmation after selecting a jettison quantity', () => {
    const game = createShipMenuHarness();
    game.cargoSystem.addItem(game.player.cargoHold, 'IRON', 7);

    game.openJettisonQuantitySelector('IRON');
    expect(game.quantitySelector.unitLabel).toBe('m^3');
    game.quantitySelector.value = 3;
    game.confirmQuantitySelector();

    expect(game.player.cargoHold.items.IRON).toBe(7);
    expect(game.jettisonConfirmation).toMatchObject({ itemKey: 'IRON', amount: 3, selectedIndex: 1 });
    const model = game.createJettisonConfirmationModel();
    expect(model.subtitle).toContain('3 m^3');
    expect(model.rows.map((row: any) => row.id)).toEqual(['yes', 'no']);
  });

  it('formats cargo, crew, and ship status as readable instrument panels', () => {
    const game = createShipMenuHarness();
    game.cargoSystem.addItem(game.player.cargoHold, 'IRON', 25);

    game.shipMenuSection = 'cargo';
    const cargo = game.createShipMenuModel();
    expect(cargo.columns).toEqual(['BAY / CARGO', 'QTY', 'VALUE', 'LOAD / ACTION']);
    expect(cargo.rows[0].cells[3]).toContain('[');
    expect(cargo.rows[0].detail).toContain('m^3 free');
    expect(cargo.rows.some((row: any) => row.cells[3].includes('Enter to arm ejector'))).toBe(true);

    game.shipMenuSection = 'crew';
    const crew = game.createShipMenuModel();
    expect(crew.rows[0].cells[2]).toMatch(/green|wounded|Uncrewed/);
    expect(crew.rows[1].cells[3]).toContain('XP');

    game.shipMenuSection = 'status';
    const status = game.createShipMenuModel();
    expect(status.rows.find((row: any) => row.id === 'cargo')?.cells[1]).toContain('m^3');
    expect(status.rows.some((row: any) => row.id === 'fuel' && row.cells[3].includes('['))).toBe(true);
    expect(status.rows.some((row: any) => row.id === 'navigation')).toBe(true);
  });

  it('treats the ship as compartments and crewed stations', () => {
    const game = createShipMenuHarness();

    const main = game.createShipMenuModel();
    expect(main.rows.map((row: any) => row.id)).toEqual(expect.arrayContaining(['deck', 'stations', 'cargo', 'crew', 'status']));

    game.shipMenuSection = 'deck';
    const deck = game.createShipMenuModel();
    expect(deck.columns).toEqual(['DECK', 'COMPARTMENT', 'WATCH', 'STATE', 'READOUT']);
    expect(deck.rows.some((row: any) => row.id === 'deck:engineering')).toBe(true);

    game.activateShipMenuSelection(deck.rows.find((row: any) => row.id === 'deck:engineering'));
    expect(game.currentShipCompartmentId).toBe('engineering');
    expect(game.statusMessage).toContain('Engineering Trunk');

    game.shipMenuSection = 'stations';
    const stations = game.createShipMenuModel();
    expect(stations.columns).toEqual(['STATION', 'SKILL', 'BEST', 'STATE', 'READOUT']);
    expect(stations.rows.some((row: any) => row.id === 'station:navigation')).toBe(true);
  });

  it('keeps ship menu out of the primary dock and orbit action path', () => {
    const game = createShipMenuHarness();

    const selected = game.choosePrimaryAction([
      { id: 'primary', enabled: true },
      { id: 'ship-menu', enabled: true },
      { id: 'land-dock', enabled: true, action: 'ACTIVATE_LAND_LIFTOFF' },
    ]);

    expect(selected?.id).toBe('land-dock');
  });

  it('includes starbases in the system target menu without adding moons', () => {
    const game = createShipMenuHarness('system');
    const planet = { name: 'Aster', systemX: 100, systemY: 0, moons: [{ name: 'Aster I', systemX: 120, systemY: 0 }] };
    const starbase = Object.create(Starbase.prototype) as Starbase;
    Object.defineProperties(starbase, {
      name: { value: 'Aster Relay' },
      systemX: { value: 200 },
      systemY: { value: 0 },
    });
    game.stateManager.currentSystem = {
      stars: [{ name: 'Aster Primary', systemX: 0, systemY: 0 }],
      planets: [planet],
      starbase,
    };

    const targets = game.getTargetMenuTargets();

    expect(targets.map((target: any) => target.name)).toEqual(['Aster Primary', 'Aster', 'Aster Relay']);
  });
});
