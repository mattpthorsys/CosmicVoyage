import { describe, expect, it } from 'vitest';
import { Starbase } from '../../../entities/starbase';
import { CargoSystem } from '../../../systems/cargo_systems';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';
import { PRNG } from '../../../utils/prng';

function createShipMenuHarness(state: string = 'hyperspace'): any {
  const player = new Player();
  const cargoSystem = new CargoSystem();
  return Object.assign(Object.create(Game.prototype), {
    player,
    cargoSystem,
    stateManager: {
      state,
      currentPlanet: null,
      currentSystem: null,
      currentStarbase: null,
    },
    renderer: {
      getCanvas: () => ({ height: 600 }),
      getCharHeightPx: () => 12,
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
    roverMenuSelection: 0,
    roverCargoOpen: false,
    roverCargoSelection: 0,
    roverCargoOffset: 0,
    surfaceMapExpanded: false,
    surfaceLegendOpen: false,
    surfaceLegendSelection: 0,
    surfaceLegendOffset: 0,
    surfaceNotifications: [],
    starbaseSectionId: 'overview',
    starbaseSelectionBySection: {},
    starbaseOffsetBySection: {},
    starbaseAlert: '',
    activeMissions: {},
    currentTargetIndex: 0,
    currentTargetSignature: '',
    approachTargetSignature: null,
    statusMessage: '',
    forceFullRender: false,
    gameSeedPRNG: new PRNG('ship-menu-test'),
    _publishStatusUpdate: () => undefined,
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

  it('keeps root ship and starbase summaries beneath two-column selectors', () => {
    const game = createShipMenuHarness();

    const ship = game.createShipMenuModel();
    expect(ship.columns).toEqual(['SHIP AREA', 'STATE']);
    expect(ship.detailLineCount).toBe(2);
    expect(ship.rows.every((row: any) => row.cells.length === 2)).toBe(true);
    expect(ship.rows.find((row: any) => row.id === 'cargo')?.detail).toContain('Ship hold');

    game.stateManager.state = 'starbase';
    game.stateManager.currentStarbase = { name: 'Quiet Dock' };
    const starbase = game.createCurrentStarbaseScreen();
    expect(starbase.columns).toEqual(['PORT SECTION', 'STATUS']);
    expect(starbase.detailLineCount).toBe(2);
    expect(starbase.rows.every((row: any) => row.cells.length === 2)).toBe(true);
    expect(starbase.rows.find((row: any) => row.id === 'buy')?.detail).toContain('Enter opens Buy');
  });

  it('shows rover cargo under its own manifest heading and transfers what fits when docking', () => {
    const game = createShipMenuHarness('planet');
    game.player.cargoHold.capacity = 5;
    game.player.terrainVehicle.shipSurfaceX = 0;
    game.player.terrainVehicle.shipSurfaceY = 0;
    game.cargoSystem.addItem(game.player.cargoHold, 'COPPER', 4);
    game.cargoSystem.addItem(game.player.terrainVehicle.cargoHold, 'IRON', 4);
    game.player.terrainVehicle.deployed = true;

    game.shipMenuSection = 'cargo';
    const cargo = game.createShipMenuModel();
    expect(cargo.rows.some((row: any) => row.id === 'rover-heading')).toBe(true);
    expect(cargo.rows.some((row: any) => String(row.cells[0]).includes('Rover Iron'))).toBe(true);

    game.dockTerrainVehicle();

    expect(game.player.cargoHold.items.IRON).toBe(1);
    expect(game.player.terrainVehicle.cargoHold.items.IRON).toBe(3);
    expect(game.player.terrainVehicle.deployed).toBe(false);
    expect(game.statusMessage).toContain('remains aboard rover');
  });

  it('offers terrain vehicle deployment from ship operations only while planetside', () => {
    const game = createShipMenuHarness('planet');

    const main = game.createShipMenuModel();
    expect(main.rows.some((row: any) => row.id === 'rover')).toBe(true);

    game.shipMenuSection = 'rover';
    const rover = game.createShipMenuModel();
    expect(rover.title).toBe('Terrain Vehicle');
    expect(rover.rows[0].id).toBe('rover:deploy');

    game.activateShipMenuSelection(rover.rows[0]);
    expect(game.player.terrainVehicle.deployed).toBe(true);
    expect(game.player.terrainVehicle.fuel).toBe(game.player.terrainVehicle.maxFuel);
    expect(game.shipMenuOpen).toBe(false);
    expect(game.roverMenuSelection).toBe(1);
  });

  it('requires returning to the parked ship before embarking', () => {
    const game = createShipMenuHarness('planet');
    game.player.terrainVehicle.deployed = true;
    game.player.terrainVehicle.shipSurfaceX = 4;
    game.player.terrainVehicle.shipSurfaceY = 4;
    game.player.position.surfaceX = 8;
    game.player.position.surfaceY = 4;

    game.dockTerrainVehicle();
    expect(game.player.terrainVehicle.deployed).toBe(true);
    expect(game.statusMessage).toContain('parked ship');

    game.player.position.surfaceX = 4;
    game.dockTerrainVehicle();
    expect(game.player.terrainVehicle.deployed).toBe(false);
    expect(game.shipMenuOpen).toBe(true);
    expect(game.shipMenuSection).toBe('main');
    expect(game.createShipMenuModel().rows[game.shipMenuSelection].id).toBe('rover');
    expect(game.statusMessage).toContain('Embarked');
  });

  it('opens planet landing operations at Terrain Vehicle and exposes root launch', () => {
    const game = createShipMenuHarness('planet');
    game.player.terrainVehicle.shipSurfaceX = 0;
    game.player.terrainVehicle.shipSurfaceY = 0;
    game.player.position.surfaceX = 0;
    game.player.position.surfaceY = 0;

    game.openSurfaceLandingOperationsMenu();
    const main = game.createShipMenuModel();

    expect(game.shipMenuOpen).toBe(true);
    expect(main.rows[game.shipMenuSelection].id).toBe('rover');
    expect(main.rows.find((row: any) => row.id === 'launch')).toMatchObject({ disabled: false });
  });

  it('creates a scrollable surface icon legend model', () => {
    const game = createShipMenuHarness('planet');

    const model = game.createSurfaceLegendModel();

    expect(model.title).toBe('Surface Icon Legend');
    expect(model.rows.map((row: any) => row.id)).toEqual(expect.arrayContaining(['ship', 'resource', 'scanner']));
    expect(model.footer[0]).toContain('PageUp/PageDown');
  });

  it('opens rover-only cargo and drops selected cargo on the surface', () => {
    const game = createShipMenuHarness('planet');
    game.cargoSystem.addItem(game.player.cargoHold, 'COPPER', 4);
    game.cargoSystem.addItem(game.player.terrainVehicle.cargoHold, 'IRON', 3);

    game.openRoverCargo();
    const model = game.createRoverCargoModel();
    expect(model.rows.map((row: any) => row.id)).toEqual(['IRON']);

    game.dropSelectedRoverCargo(model.rows[0]);
    expect(game.player.terrainVehicle.cargoHold.items.IRON).toBeUndefined();
    expect(game.player.cargoHold.items.COPPER).toBe(4);
    expect(game.statusMessage).toContain('Dropped 3');
  });

  it('buys D/He3 fuel mix as separate cargo canisters', () => {
    const game = createShipMenuHarness('starbase');
    game.stateManager.currentStarbase = { name: 'Fuel Dock' };
    game.player.resources.credits = 1000;

    const message = game.buyDepotItem('FUSION_FUEL_MIX', 10);

    expect(message).toContain('Helium-3');
    expect(game.player.cargoHold.items.HELIUM_3).toBe(5);
    expect(game.player.cargoHold.items.DEUTERIUM_PELLETS).toBe(5);
    expect(game.player.cargoHold.items.FUSION_FUEL_MIX).toBeUndefined();
  });

  it('loads carried helium-3 and deuterium into the reactor when refuelling', () => {
    const game = createShipMenuHarness('starbase');
    game.stateManager.currentStarbase = { name: 'Fuel Dock' };
    game.player.resources.fuel = game.player.resources.maxFuel - 80;
    game.player.resources.credits = 0;
    game.cargoSystem.addItem(game.player.cargoHold, 'HELIUM_3', 2);
    game.cargoSystem.addItem(game.player.cargoHold, 'DEUTERIUM', 1);
    game.cargoSystem.addItem(game.player.cargoHold, 'DEUTERIUM_PELLETS', 1);

    game._handleRefuelRequest();

    expect(game.player.resources.fuel).toBe(game.player.resources.maxFuel);
    expect(game.player.cargoHold.items.HELIUM_3).toBeUndefined();
    expect(game.player.cargoHold.items.DEUTERIUM).toBeUndefined();
    expect(game.player.cargoHold.items.DEUTERIUM_PELLETS).toBeUndefined();
    expect(game.statusMessage).toContain('Tank full');
  });

  it('treats the ship as compartments and crewed stations', () => {
    const game = createShipMenuHarness();

    const main = game.createShipMenuModel();
    expect(main.rows.map((row: any) => row.id)).toEqual(expect.arrayContaining(['deck', 'stations', 'cargo', 'crew', 'status', 'log']));

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

  it('presents the ship log as a polished watch record', () => {
    const game = createShipMenuHarness('hyperspace');
    game.statusMessage = 'Approach complete.';
    game.shipMenuSection = 'log';

    const log = game.createShipMenuModel();

    expect(log.title).toBe('Ship Log');
    expect(log.columns).toEqual(['LOG', 'CHANNEL', 'STATE', 'ENTRY']);
    expect(log.rows.map((row: any) => row.cells[1])).toEqual(expect.arrayContaining(['NAV', 'SHIP', 'CREW', 'SURVEY', 'ALERT']));
    expect(log.rows[0].cells[3]).toContain('Interstellar grid');
    expect(log.footer[0]).toContain('PageUp/PageDown');
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
