import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { DepotCommunications } from '../../../core/depot_communications';
import { FrontierCatalogue } from '../../../core/frontier_catalogue';
import { FrontierTerminal } from '../../../core/frontier_terminal';
import { InfrastructureRegistry } from '../../../core/infrastructure_registry';
import { InterfaceModeController } from '../../../core/modes/game_mode_controllers';
import { TerminalDialog } from '../../../core/terminal_dialog';
import type { TextModalTableModel } from '../../../core/text_ui';
import type { CommandBarModel } from '../../../core/command_bar';
import { depotContractFixture } from '../../fixtures/depot_contracts';

interface CommunicationsHarness {
  _handleCommandBarAction(data: { action: string }): void;
  openCommunications(): void;
  handleFrontierTerminalInput(): boolean;
  createFrontierTerminalModel(): TextModalTableModel;
  shouldSuppressHudForeground(): boolean;
  isGameClockPaused(): boolean;
  createHyperspaceCommandBar(actions: [], includeSelection: boolean): CommandBarModel;
  createSystemCommandBar(actions: [], includeSelection: boolean): CommandBarModel;
  createSurfaceCommandBar(): CommandBarModel;
}

/** Runs actual foreground owners with canvas and navigation effects replaced by observable boundaries. */
function harness(parent: 'none' | 'ship-menu' = 'none') {
  const f = depotContractFixture();
  const mode = new InterfaceModeController<never, never, never>();
  if (parent !== 'none') mode.open(parent);
  const terminal = new FrontierTerminal();
  const catalogue = {
    search: vi.fn(async () => []),
    verifyDepot: vi.fn(() => null),
  } as unknown as FrontierCatalogue;
  const communications = new DepotCommunications(
    catalogue,
    new InfrastructureRegistry(),
    f.depots,
    f.commerce,
    f.progress
  );
  communications.receive([{ stationId: f.station.id, name: f.station.name, address: f.address }], 0);
  const keys = new Set<string>();
  const mark = vi.fn();
  const operations = { section: 'main', selection: 7, offset: 2 };
  const stateManager = {
    state: 'hyperspace',
    currentSystem: f.system,
    currentStarbase: null,
    currentPlanet: null,
  };
  const game = Object.assign(Object.create(Game.prototype) as CommunicationsHarness, {
    _communications: communications,
    _frontierTerminal: terminal,
    _interfaceMode: mode,
    _shipOperations: operations,
    _terminalDialog: new TerminalDialog(),
    _observatoryService: { markSystemDestination: mark },
    player: f.player,
    stateManager,
    cargoSystem: f.cargo,
    getCommandStripTargetName: () => undefined,
    isAtParkedShip: () => false,
    renderer: { getGridCols: () => 40, getGridRows: () => 20 },
    _screenTransition: { isActive: false },
    _publishStatusUpdate: vi.fn(),
    inputManager: {
      justPressedActions: keys,
      wasAnyKeyJustPressed: () => keys.size > 0,
      wasActionJustPressed: (action: string) => keys.has(action),
      clearState: () => keys.clear(),
    },
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    popupState: 'inactive',
    gameClockElapsedSeconds: 0,
    frontierSearchSerial: 0,
  });
  return { f, game, mode, terminal, communications, keys, mark, operations, stateManager };
}

describe('communications foreground integration', () => {
  it('consumes a mouse command solely to finish terminal writing before navigating', () => {
    const h = harness();
    h.game.openCommunications();
    h.game._handleCommandBarAction({ action: 'ENTER_SYSTEM' });
    expect(h.terminal.reveal.isActive).toBe(false);
    expect(h.mark).not.toHaveBeenCalled();
    h.game._handleCommandBarAction({ action: 'ENTER_SYSTEM' });
    expect(h.mark).toHaveBeenCalledOnce();
  });
  it('pauses time, suppresses background raster/HUD and consumes the reveal key without marking a route', () => {
    const h = harness();
    h.game.openCommunications();
    expect(h.mode.kind).toBe('communications');
    expect(h.game.shouldSuppressHudForeground()).toBe(true);
    expect(h.game.isGameClockPaused()).toBe(true);
    expect(h.communications.list(0)[0].read).toBe(true);
    h.keys.add('ENTER_SYSTEM');
    h.game.handleFrontierTerminalInput();
    expect(h.mark).not.toHaveBeenCalled();
    h.game.handleFrontierTerminalInput();
    expect(h.mark).toHaveBeenCalledWith(h.f.address, h.f.station.name);
  });

  it('returns to the unchanged Operations selection and supports long readable narrow reports', () => {
    const h = harness('ship-menu');
    h.game.openCommunications();
    h.terminal.reveal.complete();
    const before = { ...h.operations };
    h.keys.add('PAGE_DOWN');
    h.game.handleFrontierTerminalInput();
    expect(h.game.createFrontierTerminalModel().viewOffset).toBeGreaterThan(0);
    h.keys.clear();
    h.keys.add('QUIT');
    h.game.handleFrontierTerminalInput();
    expect(h.mode.kind).toBe('ship-menu');
    expect(h.operations).toEqual(before);
    expect(h.keys.size).toBe(0);
  });

  it('exposes the matching H command in hyperspace, local space and landed travel bars', () => {
    const h = harness();
    const bars = [h.game.createHyperspaceCommandBar([], false), h.game.createSystemCommandBar([], false)];
    h.stateManager.state = 'planet';
    bars.push(h.game.createSurfaceCommandBar());
    for (const bar of bars)
      expect(bar.buttons.find((button) => button.id === 'communications')).toMatchObject({
        action: 'COMMUNICATIONS',
        key: 'h',
      });
  });
});
