import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { SurveyDataService } from '../../../core/survey_data_service';
import { FrontierTerminal } from '../../../core/frontier_terminal';
import { TerminalDialog } from '../../../core/terminal_dialog';
import { InterfaceModeController } from '../../../core/modes/game_mode_controllers';
import { recordLocalSurvey } from '../../../core/survey_observations';
import { createDiscoveryRecord } from '../../../core/discovery';
import type { TextModalTableModel } from '../../../core/text_ui';
import type { SurveyDialogIntent } from '../../../core/survey_exchange_console';
import type { GameSave } from '../../../core/save_game';
import { depotContractFixture, depotContractSave } from '../../fixtures/depot_contracts';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';
import { readReadySurfaceData } from '../../../entities/planet/surface_data';

interface ExchangeHarness {
  openSurveyExchange(): void;
  handleFrontierTerminalInput(): boolean;
  handleTerminalDialogInput(): boolean;
  createFrontierTerminalModel(): TextModalTableModel;
  shouldSuppressHudForeground(): boolean;
  isGameClockPaused(): boolean;
}

/** Wires actual domain and foreground owners while mocking only canvas, clocks and durable storage. */
function exchangeHarness() {
  const fixture = depotContractFixture();
  const service = new SurveyDataService();
  service.ensureBuyer(fixture.station.id, fixture.address);
  service.record(fixture.address, 'system', fixture.system.name, 1, 'local-scan', 0);
  const terminal = new FrontierTerminal();
  const dialog = new TerminalDialog<SurveyDialogIntent>();
  const mode = new InterfaceModeController<never, never, never>();
  const keys = new Set<string>();
  const checkpoint = vi.fn((_save: GameSave) => {});
  const game = Object.assign(Object.create(Game.prototype) as ExchangeHarness, {
    _surveyData: service,
    _frontierTerminal: terminal,
    _terminalDialog: dialog,
    _interfaceMode: mode,
    _frontierCatalogue: { search: vi.fn(async () => []) },
    player: fixture.player,
    stateManager: { state: 'starbase', currentStarbase: fixture.station, currentSystem: fixture.system },
    renderer: { getGridCols: () => 80, getGridRows: () => 36 },
    inputManager: {
      wasAnyKeyJustPressed: () => keys.size > 0,
      wasActionJustPressed: (action: string) => keys.has(action),
      wasKeyJustPressed: (key: string) => keys.has(key),
      clearState: () => keys.clear(),
    },
    prepareSystemDepots: vi.fn(),
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    _publishStatusUpdate: vi.fn(),
    _starbaseMode: { alert: '' },
    createSaveGame: () => depotContractSave(fixture),
    journeyCheckpointWriter: checkpoint,
    popupState: 'inactive',
    gameClockElapsedSeconds: 0,
    frontierSearchSerial: 0,
  });
  return { fixture, service, terminal, dialog, mode, keys, checkpoint, game };
}

describe('survey exchange integration', () => {
  it('pauses time, hides foreground graphics and consumes reveal skipping before opening a confirmation', () => {
    const { game, mode, keys, dialog } = exchangeHarness();
    game.openSurveyExchange();
    expect(mode.kind).toBe('survey-exchange');
    expect(game.shouldSuppressHudForeground()).toBe(true);
    expect(game.isGameClockPaused()).toBe(true);
    keys.add('ENTER_SYSTEM');
    game.handleFrontierTerminalInput();
    expect(dialog.isOpen).toBe(false);
    game.handleFrontierTerminalInput();
    expect(dialog.isOpen).toBe(true);
    expect(dialog.selectedYes).toBe(false);
  });

  it('checkpoints exact funds and account state on explicit acceptance, leaving the chosen record selected', () => {
    const { game, keys, terminal, fixture, checkpoint, service } = exchangeHarness();
    game.openSurveyExchange();
    terminal.reveal.complete();
    keys.add('ENTER_SYSTEM');
    game.handleFrontierTerminalInput();
    const selected = terminal.selectedId;
    const before = fixture.player.resources.credits;
    keys.add('y');
    game.handleTerminalDialogInput();
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(checkpoint.mock.calls[0][0].surveyData).toEqual(service.createSnapshot());
    expect(fixture.player.resources.credits).toBeGreaterThan(before);
    expect(terminal.selectedId).toBe(selected);
    expect(
      game
        .createFrontierTerminalModel()
        .dashboard!.flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('already been paid');
  });

  it('leaves all money and receipts untouched on a failed durable write', () => {
    const { game, keys, terminal, fixture, checkpoint, service } = exchangeHarness();
    checkpoint.mockImplementation(() => {
      throw new Error('quota');
    });
    game.openSurveyExchange();
    terminal.reveal.complete();
    const before = fixture.player.resources.credits;
    keys.add('ENTER_SYSTEM');
    game.handleFrontierTerminalInput();
    keys.add('y');
    game.handleTerminalDialogInput();
    expect(fixture.player.resources.credits).toBe(before);
    expect(service.createSnapshot().paid).toEqual({});
  });

  it('publishes orbital evidence for the actual body path, never a similarly named body in another system', () => {
    const { fixture, service } = exchangeHarness();
    const planet = fixture.system.planets.find((entry) => entry !== null)!;
    planet.discovery = createDiscoveryRecord('surveyed', 98, 1, 'orbital-survey');
    recordLocalSurvey(service, planet, fixture.system, 'surveyed', 0);
    expect(
      service
        .listEvidence()
        .some((entry) => entry.key.endsWith(`|planet:${fixture.system.planets.indexOf(planet)}`))
    ).toBe(true);
    const other = haulSystemFixture({ worldX: 5, worldY: 0, systemSlot: 0 }).planets.find(
      (entry) => entry !== null
    )!;
    other.name = planet.name;
    other.discovery = { ...planet.discovery };
    const before = service.listEvidence().length;
    recordLocalSurvey(service, other, fixture.system, 'surveyed', 0);
    expect(service.listEvidence()).toHaveLength(before);
    expect(readReadySurfaceData(planet)).toBeNull();
  });
});
