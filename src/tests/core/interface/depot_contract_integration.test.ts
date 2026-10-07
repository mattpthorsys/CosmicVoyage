import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { PRNG } from '../../../utils/prng';
import { depotContractFixture } from '../../fixtures/depot_contracts';
import type { StarbaseMission } from '../../../core/mission_board';
import type { StarbaseTableRow } from '../../../core/starbase_ui';
import type { Starbase } from '../../../entities/starbase';
import type { DepotDialogIntent } from '../../../core/depot_types';
import type { MissionDialogIntent } from '../../../core/mission_dialogs';
import type { TerminalDialog, TerminalDialogResult } from '../../../core/terminal_dialog';
import { getStationSections } from '../../../core/starbase_ui';
import { MissionJournal } from '../../../core/mission_journal';

interface RobotHarness {
  getCurrentStarbaseMissions(station: Starbase): StarbaseMission[];
  activateMissionSelection(station: Starbase, row: StarbaseTableRow): void;
  reviewDepotCancellation(missionId: string): void;
  finishTerminalDialog(result: TerminalDialogResult<MissionDialogIntent | DepotDialogIntent>): void;
  terminalDialog: TerminalDialog<MissionDialogIntent | DepotDialogIntent>;
  isGameClockPaused(): boolean;
}

/** Exercises real Game confirmation/receipt orchestration with only the drawing and input boundary mocked. */
function robotHarness() {
  const fixture = depotContractFixture();
  const game = Object.assign(Object.create(Game.prototype), {
    player: fixture.player,
    cargoSystem: fixture.cargo,
    gameSeedPRNG: new PRNG(fixture.seed),
    _missionProgress: fixture.progress,
    _depotService: fixture.depots,
    _depotContracts: fixture.contracts,
    _starbaseCommerce: fixture.commerce,
    stateManager: { state: 'starbase', currentStarbase: fixture.station, currentSystem: fixture.system },
    renderer: { getGridCols: () => 80, getGridRows: () => 36 },
    inputManager: { clearState: vi.fn() },
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    _publishStatusUpdate: vi.fn(),
    gameClockElapsedSeconds: 0,
  }) as RobotHarness;
  const mission = game.getCurrentStarbaseMissions(fixture.station).find((entry) => entry.type === 'supply')!;
  const row = { id: mission.id, cells: [mission.title], detail: mission.detail };
  return { ...fixture, game, mission, row };
}

/** Sends a deliberate choice through the same typed foreground dispatch used by keyboard and clickable buttons. */
function choose(game: RobotHarness, action: string): void {
  const result = game.terminalDialog.action(action, game.terminalDialog.createModel(80, 36));
  if (!result) throw new Error('Expected explicit dialog choice.');
  game.finishTerminalDialog(result);
}

describe('robotic contract interface', () => {
  it('exposes only the robot board alongside existing depot panels', () => {
    const { station } = robotHarness();
    const sections = getStationSections(station).map((section) => section.id);
    expect(sections).toContain('missions');
    expect(sections).not.toContain('research');
    expect(sections).not.toContain('crew');
    expect(sections).not.toContain('shipyard');
  });

  it('requires explicit acceptance, pauses reading and keeps the resulting receipt visible', () => {
    const { game, station, mission, row, progress, depots } = robotHarness();
    game.activateMissionSelection(station, row);
    expect(game.terminalDialog.createModel(80, 36).kind).toBe('confirmation');
    expect(game.isGameClockPaused()).toBe(true);
    choose(game, 'DIALOG_NO');
    expect(progress.getStatus(mission)).toBe('AVAILABLE');
    game.activateMissionSelection(station, row);
    choose(game, 'DIALOG_YES');
    expect(progress.getStatus(mission)).toBe('ACTIVE');
    expect(depots.getRecord(station.id)!.jobs!.reservedCredits[mission.id]).toBe(mission.rewardCredits);
    expect(game.terminalDialog.createModel(80, 36).kind).toBe('message');
  });

  it('retains canonical accepted work and settles from the same mission row with an enduring receipt', () => {
    const { game, station, system, mission, row, player, cargo, contracts, progress } = robotHarness();
    const position = game.getCurrentStarbaseMissions(station).findIndex((entry) => entry.id === mission.id);
    contracts.accept(mission, station, system);
    expect(game.getCurrentStarbaseMissions(station).findIndex((entry) => entry.id === mission.id)).toBe(
      position
    );
    const objective = mission.objectives[0];
    if (objective.kind !== 'delivery') throw new Error('Expected supply objective.');
    cargo.addItem(player.cargoHold, objective.itemKey, objective.quantity);
    expect(game.getCurrentStarbaseMissions(station).find((entry) => entry.id === mission.id)).toEqual(
      mission
    );
    game.activateMissionSelection(station, row);
    expect(progress.getStatus(mission)).toBe('COMPLETE');
    const model = game.terminalDialog.createModel(80, 36);
    expect(model.kind).toBe('message');
    expect(model.title.flatMap((line) => line.segments.map((span) => span.text)).join('')).toContain(
      'SETTLED'
    );
    expect(model.lines.flatMap((line) => line.segments.map((span) => span.text)).join(' ')).toContain(
      'Payment'
    );
  });

  it('offers No-default cancellation and never cancels when the player dismisses it', () => {
    const { game, station, system, mission, contracts, progress } = robotHarness();
    contracts.accept(mission, station, system);
    game.reviewDepotCancellation(mission.id);
    expect(game.terminalDialog.createModel(80, 36).selectedYes).toBe(false);
    choose(game, 'ENTER_SYSTEM');
    expect(progress.getStatus(mission)).toBe('ACTIVE');
    game.reviewDepotCancellation(mission.id);
    choose(game, 'DIALOG_YES');
    expect(progress.getMission(mission.id)).toBeUndefined();
  });

  it.each([
    [120, 45],
    [40, 24],
    [24, 16],
  ])('wraps delivery coordinates, requirements and CLAIMABLE status on %i x %i grids', (cols, rows) => {
    const { mission } = robotHarness();
    const journal = new MissionJournal();
    const model = journal.createModel(
      [{ mission, status: 'READY', completed: 1, total: 1 }],
      cols,
      rows,
      false
    );
    const width = Math.max(16, Math.min(88, cols - 12));
    const text = model.dashboard!.flatMap((line) => line.segments.map((span) => span.text)).join(' ');
    expect(text).toContain('CLAIMABLE');
    expect(text).toContain('Ship hold required');
    expect(
      model.dashboard!.every(
        (line) => line.segments.reduce((length, span) => length + span.text.length, 0) <= width
      )
    ).toBe(true);
  });
});
