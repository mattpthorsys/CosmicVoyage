import { describe, expect, it, vi } from 'vitest';
import { Player } from '../../../core/player';
import { Game } from '../../../core/game';
import { Starbase } from '../../../entities/starbase';
import { PRNG } from '../../../utils/prng';
import {
  createDefaultShipModifications,
  createShipRepairOrders,
  getShipRepairCost,
  getStarbaseShipyardProfile,
} from '../../../core/ship_modifications';
import { ShipRepairConsole, createRepairQuotes, purchaseRepairs } from '../../../core/ship_repair_console';
import type { StarbaseController } from '../../../core/starbase_controller';
import type { InterfaceModeController } from '../../../core/modes/game_mode_controllers';
import type { TextModalTableModel, TextTableRow } from '../../../core/text_ui';

/** Creates damaged equipment with deterministic quotes and enough credit for all work. */
function damagedPlayer(): Player {
  const player = new Player();
  player.resources.credits = 10000;
  player.ship.damage.hullIntegrity = 80;
  player.ship.damage.subsystemDamage = { drive: 25, shield: 10 };
  player.terrainVehicle.integrity = 60;
  return player;
}

/** Creates one fresh keypress using the same input shape as the production terminal. */
function press(action: string) {
  return { wasActionJustPressed: (key: string) => key === action, wasAnyKeyJustPressed: () => true };
}

interface RepairGameHarness {
  player: Player;
  starbaseMode: StarbaseController;
  shipRepairConsole: ShipRepairConsole;
  interfaceMode: InterfaceModeController<never, never, never>;
  stateManager: { state: string; currentStarbase: Starbase };
  gameClockElapsedSeconds: number;
  getStarbaseRows(station: Starbase, section: 'shipyard'): TextTableRow[];
  activateStarbaseSelection(station: Starbase, row: TextTableRow): void;
  handleShipRepairInput(): boolean;
  createShipRepairModel(): TextModalTableModel;
  isGameClockPaused(): boolean;
  shouldSuppressHudForeground(): boolean;
  _update(delta: number): void;
  _processInput(): void;
  _handleStarbaseTradeInput: ReturnType<typeof vi.fn>;
}

/** Uses real Game orchestration with only the canvas and station market replaced by bounded fixtures. */
function repairGame() {
  const keys = new Set<string>();
  const station = new Starbase('Repair Dock', new PRNG('repair-dock'), 'Repair System');
  Object.assign(station, { capabilities: { ...station.capabilities, shipyard: true } });
  const game = Object.assign(Object.create(Game.prototype) as RepairGameHarness, {
    player: damagedPlayer(),
    stateManager: { state: 'starbase', currentStarbase: station, currentSystem: null },
    renderer: { getGridCols: () => 76, getGridRows: () => 36 },
    inputManager: {
      justPressedActions: keys,
      wasActionJustPressed: (action: string) => keys.has(action),
      wasAnyKeyJustPressed: () => keys.size > 0,
      clearState: () => keys.clear(),
    },
    getTradeDepotManifest: () => [],
    getStationPersistenceKey: () => 'Repair Dock',
    captureCurrentPlanetMutations: vi.fn(),
    _publishStatusUpdate: vi.fn(),
    _handleStarbaseTradeInput: vi.fn(),
    gameClockElapsedSeconds: 100,
    currentVisualDeltaSeconds: 0,
    statusMessage: '',
    forceFullRender: false,
  });
  game.starbaseMode.openSection('shipyard');
  return { game, keys, station };
}

describe('shipyard repair work orders', () => {
  it('uses itemised ship quotes for the complete total and excludes healthy equipment', () => {
    const player = damagedPlayer();
    const orders = createShipRepairOrders(player.ship);
    expect(orders.map((order) => order.target)).toEqual(['hull', 'drive', 'shield']);
    expect(orders.map((order) => order.cost)).toEqual([240, 450, 180]);
    expect(getShipRepairCost(player.ship)).toBe(870);
    const quotes = createRepairQuotes(player);
    expect(quotes.map((quote) => quote.target)).toEqual(['all', 'hull', 'drive', 'shield', 'rover']);
    expect(quotes[0].cost).toBe(1070);
    expect(quotes[0].cost).toBe(quotes.slice(1).reduce((sum, quote) => sum + quote.cost, 0));
  });
  it('repairs one subsystem without restoring the hull, rover or another subsystem', () => {
    const player = damagedPlayer();
    const cargo = structuredClone(player.cargoHold);
    expect(purchaseRepairs(player, 'drive')).toMatchObject({ ok: true, cost: 450 });
    expect(player.resources.credits).toBe(9550);
    expect(player.ship.damage).toEqual({
      hullIntegrity: 80,
      maxHullIntegrity: 100,
      subsystemDamage: { shield: 10 },
    });
    expect(player.terrainVehicle.integrity).toBe(60);
    expect(player.cargoHold).toEqual(cargo);
    expect(purchaseRepairs(player, 'drive').ok).toBe(false);
    expect(player.resources.credits).toBe(9550);
  });
  it('restores hull and rover separately at their respective established rates', () => {
    const player = damagedPlayer();
    expect(purchaseRepairs(player, 'hull')).toMatchObject({ ok: true, cost: 240 });
    expect(player.ship.damage.hullIntegrity).toBe(100);
    expect(player.ship.damage.subsystemDamage).toEqual({ drive: 25, shield: 10 });
    expect(player.terrainVehicle.integrity).toBe(60);
    expect(purchaseRepairs(player, 'rover')).toMatchObject({ ok: true, cost: 200 });
    expect(player.terrainVehicle.integrity).toBe(100);
    expect(player.resources.credits).toBe(9560);
  });
  it('refuses unaffordable work atomically and requotes changed damage before charging', () => {
    const player = damagedPlayer();
    player.resources.credits = 1069;
    const before = structuredClone(player);
    expect(purchaseRepairs(player, 'all')).toMatchObject({ ok: false, cost: 0 });
    expect(player).toEqual(before);
    player.ship.damage.hullIntegrity = 90;
    player.resources.credits = 10000;
    expect(purchaseRepairs(player, 'all')).toMatchObject({ ok: true, cost: 950 });
    expect(player.resources.credits).toBe(9050);
    expect(player.ship.damage).toEqual({ hullIntegrity: 100, maxHullIntegrity: 100, subsystemDamage: {} });
    expect(player.terrainVehicle.integrity).toBe(100);
    expect(purchaseRepairs(player, 'all').ok).toBe(false);
    expect(player.resources.credits).toBe(9050);
  });
  it('does not sell a repair for a missing rover or charge healthy equipment', () => {
    const player = damagedPlayer();
    player.ship = createDefaultShipModifications();
    player.terrainVehicle.available = false;
    expect(createRepairQuotes(player)).toEqual([expect.objectContaining({ target: 'all', cost: 0 })]);
    expect(purchaseRepairs(player, 'rover').ok).toBe(false);
    expect(purchaseRepairs(player, 'all').ok).toBe(false);
    expect(player.resources.credits).toBe(10000);
    expect(player.terrainVehicle.available).toBe(false);
  });
  it('skips the terminal reveal without buying work and retains armed selection through idle frames', () => {
    const console = new ShipRepairConsole();
    const quotes = createRepairQuotes(damagedPlayer());
    console.open();
    expect(console.input(press('ENTER_SYSTEM'), quotes, 20)).toBeUndefined();
    expect(console.reveal.isActive).toBe(false);
    console.input(press('MOVE_DOWN'), quotes, 20);
    expect(console.selectedTarget).toBe('hull');
    expect(
      console.input({ wasAnyKeyJustPressed: () => false, wasActionJustPressed: () => false }, quotes, 20)
    ).toBeUndefined();
    expect(console.input(press('ENTER_SYSTEM'), quotes, 20)).toEqual({ kind: 'repair', target: 'hull' });
    expect(console.input(press('APPROACH_TARGET'), quotes, 20)).toEqual({ kind: 'repair', target: 'all' });
    expect(console.input(press('QUIT'), quotes, 20)).toEqual({ kind: 'close' });
  });
  it.each([
    [120, 42],
    [76, 24],
    [30, 45],
    [48, 20],
  ])('wraps colour-coded work orders and retains the selected system in a %sx%s terminal', (cols, rows) => {
    const player = damagedPlayer();
    const console = new ShipRepairConsole();
    console.selectedTarget = 'rover';
    const model = console.createModel(
      player,
      'A long but legible station name',
      getStarbaseShipyardProfile('Repair Dock'),
      cols,
      rows
    );
    expect(
      model.dashboard!.every(
        (line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= Math.min(72, cols - 12)
      )
    ).toBe(true);
    const page = model.dashboard!.slice(model.viewOffset, model.viewOffset + model.visibleRowCount);
    const text = page.map((line) => line.segments.map((span) => span.text).join('')).join(' ');
    expect(text).toContain('Terrain vehicle');
    expect(text).toContain('200 Cr');
    expect(text).toContain('60% integrity');
    const spans = model.dashboard!.flatMap((line) => line.segments);
    expect(spans.some((span) => span.font === 'thick' && span.tone === 'cyan')).toBe(true);
    expect(spans.some((span) => span.font === 'thin' && span.tone === 'amber')).toBe(true);
    expect(model.footer!.every((line) => line.length <= Math.min(72, cols - 12))).toBe(true);
  });
});

describe('repair console Game integration', () => {
  it('puts one highlighted repair entry first in Shipyard and opens diagnostics without payment', () => {
    const { game, station } = repairGame();
    const rows = game.getStarbaseRows(station, 'shipyard');
    expect(rows[0]).toMatchObject({ id: 'shipyard:repair', tone: 'amber' });
    expect(rows.filter((row) => row.id === 'shipyard:repair')).toHaveLength(1);
    const before = structuredClone(game.player);
    game.activateStarbaseSelection(station, rows[0]);
    expect(game.interfaceMode.is('ship-repairs')).toBe(true);
    expect(game.player).toEqual(before);
    expect(game.isGameClockPaused()).toBe(true);
    expect(game.shouldSuppressHudForeground()).toBe(true);
    game._update(10);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(game.createShipRepairModel().title).toBe('REPAIR CONTROL');
  });
  it('settles selected work, consumes unrelated station hotkeys and returns to the same Shipyard tab', () => {
    const { game, keys, station } = repairGame();
    game.activateStarbaseSelection(station, game.getStarbaseRows(station, 'shipyard')[0]);
    game.shipRepairConsole.reveal.complete();
    keys.add('MOVE_DOWN');
    game.handleShipRepairInput();
    keys.clear();
    keys.add('ENTER_SYSTEM');
    game.handleShipRepairInput();
    expect(game.player.ship.damage.hullIntegrity).toBe(100);
    expect(game.player.ship.damage.subsystemDamage).toEqual({ drive: 25, shield: 10 });
    expect(game.player.resources.credits).toBe(9760);
    keys.clear();
    keys.add('ACTIVATE_LAND_LIFTOFF');
    game._processInput();
    expect(game._handleStarbaseTradeInput).not.toHaveBeenCalled();
    expect(game.stateManager.state).toBe('starbase');
    keys.clear();
    keys.add('QUIT');
    game.handleShipRepairInput();
    expect(game.interfaceMode.is('ship-repairs')).toBe(false);
    expect(game.starbaseMode.sectionId).toBe('shipyard');
    expect(game.starbaseMode.getSelection()).toBe(0);
    expect(keys.size).toBe(0);
  });
});
