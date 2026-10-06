import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { HaulManifest, type HaulManifestData } from '../../../core/haul_manifest';
import type { StarbaseMission } from '../../../core/mission_board';
import type { MissionDialogIntent } from '../../../core/mission_dialogs';
import { TerminalDialog } from '../../../core/terminal_dialog';
import { ScreenTransition } from '../../../core/screen_transition';
import { prepareHaulJourney, type PreparedHaulJourney } from '../../../core/heavy_haul_journey';
import type { GameSave } from '../../../core/save_game';
import { haulJourneyFixture } from '../../fixtures/heavy_haul_journeys';

interface VoyageHarness {
  terminalDialog: TerminalDialog<MissionDialogIntent>;
  screenTransition: ScreenTransition<{ mission: StarbaseMission; journey: PreparedHaulJourney }>;
  beginHaulVoyage(mission: StarbaseMission): void;
  _update(deltaTime: number): void;
  _processInput(): void;
  gameClockElapsedSeconds: number;
  isGameClockPaused(): boolean;
}

/** Uses real journey preparation/checkpoint logic, isolating only application of its already-tested world effects. */
function voyageHarness(failCheckpoint = false) {
  const f = haulJourneyFixture('heavy');
  const prepared = prepareHaulJourney(f.save, f.source, f.request, f.world);
  if (!prepared.ok) throw new Error(prepared.message);
  const mission: StarbaseMission = {
    ...f.mission,
    objectives: [{ ...f.objective, resupply: f.request.resupply }],
  };
  let liveSave = structuredClone(f.save);
  const state = { state: 'system', currentSystem: f.source };
  /** Presents the exact receipt and current tow stage produced by the live checkpoint. */
  const data = (): HaulManifestData => ({
    mission,
    stage: liveSave.heavyHaul.activeTow!.stage,
    quote: { ok: true, quote: prepared.journey.quote, reasons: [] },
    normalFuel: liveSave.player.resources.fuel,
    maximumFuel: liveSave.player.resources.maxFuel,
    remainingSupport: liveSave.heavyHaul.activeTow!.remainingSupportFuelUnits,
    departureDate: '01 Jan 3015',
    arrivalDate: 'Voyage arrival',
    staging: 'Fixture contact',
    receipt: liveSave.heavyHaul.journeyReceipts[`${mission.id}:transit`],
  });
  const manifest = new HaulManifest();
  manifest.open(data(), 'none');
  const checkpoint = vi.fn((_save: GameSave) => {
    if (failCheckpoint) throw new Error('storage full');
  });
  const game = Object.assign(Object.create(Game.prototype) as VoyageHarness, {
    stateManager: state,
    player: f.player,
    _haulManifest: manifest,
    createSaveGame: () => structuredClone(liveSave),
    buildHaulManifestData: data,
    journeyCheckpointWriter: checkpoint,
    inputManager: {
      clearState: vi.fn(),
      wasActionJustPressed: () => false,
      wasAnyKeyJustPressed: () => false,
      wasKeyJustPressed: () => false,
    },
    renderer: { getGridCols: () => 100, getGridRows: () => 40 },
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    _publishStatusUpdate: vi.fn(),
    currentVisualDeltaSeconds: 0,
    gameClockElapsedSeconds: liveSave.gameClockElapsedSeconds,
  });
  Object.defineProperty(game, 'haulJourneyWorld', { get: () => f.world });
  const apply = vi.fn((journey: PreparedHaulJourney) => {
    liveSave = structuredClone(journey.save);
    state.currentSystem = journey.system;
    game.gameClockElapsedSeconds = journey.save.gameClockElapsedSeconds;
  });
  Object.assign(game, { applyHaulArrival: apply });
  return { game, mission, checkpoint, apply, state, prepared, source: f.source, live: () => liveSave };
}

describe('haul voyage presentation integration', () => {
  it('prepares without changing live time/fuel, commits once at blackout, and pauses for an arrival report', () => {
    const f = voyageHarness();
    const before = structuredClone(f.live());
    f.game.beginHaulVoyage(f.mission);
    expect(f.game.screenTransition.phase).toBe('prelude');
    expect(f.game.terminalDialog.createModel(100, 40).kind).toBe('progress');
    expect(f.game.isGameClockPaused()).toBe(true);
    f.game._update(0.5);
    expect(f.checkpoint).not.toHaveBeenCalled();
    expect(f.live()).toEqual(before);
    f.game.screenTransition.skip();
    f.game._update(0.1);
    expect(f.checkpoint).toHaveBeenCalledOnce();
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(f.apply.mock.invocationCallOrder[0]);
    expect(f.game.gameClockElapsedSeconds).toBe(100 + f.prepared.journey.quote.durationSeconds);
    expect(f.live().player.resources).toEqual(before.player.resources);
    f.game._update(0.1);
    expect(f.game.screenTransition.isActive).toBe(false);
    const report = f.game.terminalDialog.createModel(100, 40);
    expect(report.kind).toBe('message');
    expect(
      report.lines
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('crew awakened');
    f.game._processInput();
    f.game._update(100);
    expect(f.game.terminalDialog.isOpen).toBe(true);
    expect(f.checkpoint).toHaveBeenCalledOnce();
    expect(f.game.gameClockElapsedSeconds).toBe(100 + f.prepared.journey.quote.durationSeconds);
  });

  it('shows checkpoint failure rather than arrival and keeps the attached tow in the source', () => {
    const f = voyageHarness(true);
    const before = structuredClone(f.live());
    f.game.beginHaulVoyage(f.mission);
    f.game.screenTransition.skip();
    f.game._update(0.1);
    expect(f.game.screenTransition.isActive).toBe(false);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.state.currentSystem).toBe(f.source);
    expect(f.live()).toEqual(before);
    const report = f.game.terminalDialog.createModel(100, 40);
    expect(report.caution).toBe(true);
    expect(
      report.lines
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('storage full');
  });
});
