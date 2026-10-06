import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { MissionProgressService } from '../../../core/mission_progress';
import { TerminalDialog, type TerminalDialogResult } from '../../../core/terminal_dialog';
import type { MissionDialogIntent } from '../../../core/mission_dialogs';
import type { StarbaseMission } from '../../../core/mission_board';
import type { StarbaseTableRow } from '../../../core/starbase_ui';
import type { Starbase } from '../../../entities/starbase';
import { haulJourneyFixture } from '../../fixtures/heavy_haul_journeys';

interface MissionHarness {
  terminalDialog: TerminalDialog<MissionDialogIntent>;
  activateMissionSelection(station: Starbase, row: StarbaseTableRow): void;
  finishTerminalDialog(result: TerminalDialogResult<MissionDialogIntent>): void;
  _processInput(): void;
  _update(deltaTime: number): void;
  isGameClockPaused(): boolean;
  shouldSuppressHudForeground(): boolean;
  gameClockElapsedSeconds: number;
}

/** Exercises actual mission acceptance and modal ownership without a canvas or frame timer. */
function missionHarness() {
  const fixture = haulJourneyFixture('local');
  const station = fixture.source.starbase!;
  const mission: StarbaseMission = {
    id: 'dialog-survey',
    title: 'Survey a nearby world',
    type: 'survey',
    issuer: 'Survey office',
    summary: 'Return an orbital survey.',
    detail: 'Observe the local target and return.',
    rewardCredits: 700,
    risk: 'Low',
    originStarbaseId: station.id,
    originStarbaseName: station.name,
    systemName: fixture.source.name,
    objectives: [
      {
        id: 'scan',
        kind: 'scan',
        targetName: 'Survey world',
        targetLabel: 'Survey world',
        targetType: 'planet',
        requiredDiscoveryLevel: 'surveyed',
      },
    ],
  };
  const progress = new MissionProgressService();
  const capture = vi.fn();
  const getOffers = vi.fn(() => [mission]);
  const game = Object.assign(Object.create(Game.prototype) as MissionHarness, {
    player: fixture.player,
    stateManager: { state: 'starbase', currentStarbase: station, currentSystem: fixture.source },
    _missionProgress: progress,
    getCurrentStarbaseMissions: getOffers,
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    inputManager: {
      clearState: vi.fn(),
      wasActionJustPressed: () => false,
      wasKeyJustPressed: () => false,
      wasAnyKeyJustPressed: () => false,
    },
    renderer: { getGridCols: () => 80, getGridRows: () => 32 },
    _publishStatusUpdate: vi.fn(),
    captureCurrentPlanetMutations: capture,
    gameClockElapsedSeconds: 100,
  });
  /** Resolves the displayed choice through the same handler as actual keyboard/click input. */
  const choose = (action: string): void => {
    const result = game.terminalDialog.action(action, game.terminalDialog.createModel(80, 32));
    if (result) game.finishTerminalDialog(result);
  };
  return { game, progress, station, mission, capture, getOffers, choose, player: fixture.player };
}

describe('mission confirmation integration', () => {
  it('does not accept on selection, pauses the world, and returns intact after No', () => {
    const f = missionHarness();
    f.game.activateMissionSelection(f.station, { id: f.mission.id, cells: [] });
    expect(f.progress.getStatus(f.mission)).toBe('AVAILABLE');
    expect(f.game.terminalDialog.isOpen).toBe(true);
    expect(f.game.isGameClockPaused()).toBe(true);
    expect(f.game.shouldSuppressHudForeground()).toBe(true);
    f.game._processInput();
    f.game._update(100);
    expect(f.game.gameClockElapsedSeconds).toBe(100);
    expect(f.capture).not.toHaveBeenCalled();
    f.choose('DIALOG_NO');
    expect(f.progress.getStatus(f.mission)).toBe('AVAILABLE');
    expect(f.game.terminalDialog.isOpen).toBe(false);
  });

  it('accepts after Yes without paying early, and shows a persistent acknowledgement', () => {
    const f = missionHarness();
    const credits = f.player.resources.credits;
    f.game.activateMissionSelection(f.station, { id: f.mission.id, cells: [] });
    f.choose('DIALOG_YES');
    expect(f.progress.getStatus(f.mission)).toBe('ACTIVE');
    expect(f.player.resources.credits).toBe(credits);
    expect(f.game.terminalDialog.createModel(80, 32).kind).toBe('message');
    f.game._update(100);
    expect(f.game.gameClockElapsedSeconds).toBe(100);
    f.choose('ENTER_SYSTEM');
    expect(f.game.terminalDialog.isOpen).toBe(false);
    expect(f.progress.createSnapshot().acceptedMissionIds).toEqual([f.mission.id]);
  });

  it('rechecks that the same issuer still offers the contract before accepting', () => {
    const f = missionHarness();
    f.game.activateMissionSelection(f.station, { id: f.mission.id, cells: [] });
    f.getOffers.mockReturnValue([]);
    f.choose('DIALOG_YES');
    expect(f.progress.getStatus(f.mission)).toBe('AVAILABLE');
    expect(f.game.terminalDialog.createModel(80, 32).caution).toBe(true);
  });
});
