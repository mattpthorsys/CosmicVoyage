import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { InfrastructureRegistry } from '../../../core/infrastructure_registry';
import { createHaulResultDialog, type MissionDialogIntent } from '../../../core/mission_dialogs';
import { prepareHomeboundJourney, type PreparedHomeboundJourney } from '../../../core/homebound_journey';
import { parseGameSave, type GameSave } from '../../../core/save_game';
import type { ScreenTransition } from '../../../core/screen_transition';
import type { TerminalDialog, TerminalDialogResult } from '../../../core/terminal_dialog';
import type { TextTableRow } from '../../../core/text_ui';
import { homeboundJourneyFixture } from '../../fixtures/homebound_journeys';
import { heavyHaulMissionFixture } from '../../fixtures/heavy_haul_contracts';

interface ReturnHarness {
  terminalDialog: TerminalDialog<MissionDialogIntent>;
  screenTransition: ScreenTransition<unknown>;
  shipMenuOpen: boolean;
  gameClockElapsedSeconds: number;
  sleepingHaulCrew: number;
  activateShipMenuSelection(row: TextTableRow): void;
  finishTerminalDialog(result: TerminalDialogResult<MissionDialogIntent>): void;
  _update(deltaTime: number): void;
  _processInput(): void;
  isGameClockPaused(): boolean;
}

/** Exercises real return preparation and presentation, isolating only live world installation. */
function returnHarness(failCheckpoint = false, longReturn = false) {
  const fixture = homeboundJourneyFixture();
  let liveSave = parseGameSave(JSON.stringify(fixture.save));
  if (longReturn) {
    liveSave.location = { kind: 'hyperspace', worldX: 2000, worldY: 0, systemSlot: 0 };
    liveSave.systemOrbit = null;
    liveSave.player.position.worldX = 2000;
  }
  const state = {
    state: longReturn ? 'hyperspace' : 'system',
    currentSystem: longReturn ? null : fixture.source,
  };
  const prepared = prepareHomeboundJourney(liveSave, state.currentSystem, fixture.assetId, fixture.world);
  if (!prepared.ok) throw new Error(prepared.message);
  const registry = new InfrastructureRegistry();
  registry.restore(liveSave.infrastructure);
  const checkpoint = vi.fn((_save: GameSave) => {
    if (failCheckpoint) throw new Error('storage full');
  });
  const selectPort = vi.fn();
  const game = Object.assign(Object.create(Game.prototype) as ReturnHarness, {
    stateManager: state,
    player: structuredClone(liveSave.player),
    _infrastructureRegistry: registry,
    createSaveGame: () => structuredClone(liveSave),
    journeyCheckpointWriter: checkpoint,
    inputManager: {
      clearState: vi.fn(),
      wasActionJustPressed: () => false,
      wasKeyJustPressed: () => false,
      wasAnyKeyJustPressed: () => false,
    },
    renderer: { getGridCols: () => 100, getGridRows: () => 50 },
    terminalOverlay: { clear: vi.fn() },
    astrometricOverlay: { clear: vi.fn() },
    _publishStatusUpdate: vi.fn(),
    currentVisualDeltaSeconds: 0,
    gameClockElapsedSeconds: liveSave.gameClockElapsedSeconds,
    selectNavigationTarget: selectPort,
  });
  Object.defineProperty(game, 'haulJourneyWorld', { get: () => fixture.world });
  const apply = vi.fn((journey: PreparedHomeboundJourney) => {
    liveSave = structuredClone(journey.save);
    state.currentSystem = journey.system;
    state.state = 'system';
    registry.restore(liveSave.infrastructure);
    game.gameClockElapsedSeconds = liveSave.gameClockElapsedSeconds;
  });
  Object.assign(game, { applyHaulArrival: apply });
  game.shipMenuOpen = true;
  return { game, checkpoint, apply, selectPort, prepared, state, fixture, live: () => liveSave };
}

/** Sends an explicit Yes/No through the same dialog-result dispatcher as player input. */
function choose(game: ReturnHarness, yes: boolean): void {
  const model = game.terminalDialog.createModel(100, 50);
  const result = game.terminalDialog.action(yes ? 'DIALOG_YES' : 'DIALOG_NO', model);
  if (!result) throw new Error('Expected an actionable return choice.');
  game.finishTerminalDialog(result);
}

/** Reads visible terminal text without coupling expectations to colour or line wrapping. */
function reportText(game: ReturnHarness): string {
  return game.terminalDialog
    .createModel(100, 50)
    .lines.flatMap((line) => line.segments)
    .map((span) => span.text)
    .join(' ');
}

describe('automatic homebound presentation', () => {
  it('offers a return after deployment, preserves cancellation, and reopens it through Operations after reload', () => {
    const fixture = returnHarness();
    const before = structuredClone(fixture.live());
    fixture.game.terminalDialog.open(
      createHaulResultDialog(heavyHaulMissionFixture(), 'deploy', {
        ok: true,
        message: 'Commissioned.',
      })
    );
    expect(fixture.game.terminalDialog.selectedYes).toBe(false);
    choose(fixture.game, false);
    expect(fixture.live()).toEqual(before);
    expect(fixture.game.shipMenuOpen).toBe(true);
    const deferred = returnHarness();
    const deferredBefore = structuredClone(deferred.live());
    deferred.game.activateShipMenuSelection({ id: 'homebound', cells: ['Homebound Travel'] });
    expect(deferred.game.terminalDialog.createModel(100, 50).kind).toBe('confirmation');
    expect(reportText(deferred.game)).toContain('Reactor fuel');
    expect(reportText(deferred.game)).toContain('Crew remain on duty');
    choose(deferred.game, false);
    expect(deferred.game.shipMenuOpen).toBe(true);
    expect(deferred.game.screenTransition.isActive).toBe(false);
    expect(deferred.checkpoint).not.toHaveBeenCalled();
    expect(deferred.live()).toEqual(deferredBefore);

    fixture.game.terminalDialog.open(
      createHaulResultDialog(heavyHaulMissionFixture(), 'deploy', {
        ok: true,
        message: 'Commissioned.',
      })
    );
    choose(fixture.game, true);
    expect(reportText(fixture.game)).toContain('Begin automatic return now?');
    expect(fixture.checkpoint).not.toHaveBeenCalled();
    choose(fixture.game, false);
    expect(fixture.live()).toEqual(before);
  });

  it.each([false, true])(
    'commits fuel/time once, selects the real port and pauses for arrival (long return: %s)',
    (longReturn) => {
      const fixture = returnHarness(false, longReturn);
      const before = structuredClone(fixture.live());
      fixture.game.activateShipMenuSelection({ id: 'homebound', cells: ['Homebound Travel'] });
      choose(fixture.game, true);
      expect(fixture.game.screenTransition.phase).toBe('prelude');
      expect(fixture.game.isGameClockPaused()).toBe(true);
      expect(reportText(fixture.game)).toContain(longReturn ? 'crew entering hypersleep' : 'Crew on duty');
      expect(fixture.game.shipMenuOpen).toBe(false);
      fixture.game._update(0.1);
      expect(fixture.live()).toEqual(before);
      expect(fixture.checkpoint).not.toHaveBeenCalled();
      fixture.game.screenTransition.skip();
      fixture.game._update(0.1);
      expect(fixture.checkpoint).toHaveBeenCalledOnce();
      expect(fixture.apply).toHaveBeenCalledOnce();
      expect(fixture.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.apply.mock.invocationCallOrder[0]
      );
      expect(fixture.live().player.resources.fuel).toBeCloseTo(
        before.player.resources.fuel - fixture.prepared.journey.quote.fuelUnits
      );
      expect(fixture.live().gameClockElapsedSeconds).toBe(
        before.gameClockElapsedSeconds + fixture.prepared.journey.quote.durationSeconds
      );
      expect(fixture.live().player.resources.credits).toBe(before.player.resources.credits);
      expect(fixture.selectPort).toHaveBeenCalledWith(
        expect.objectContaining({ id: fixture.prepared.journey.stationId }),
        false
      );
      fixture.game._update(0.1);
      expect(fixture.game.screenTransition.isActive).toBe(false);
      expect(fixture.game.sleepingHaulCrew).toBe(0);
      expect(fixture.game.terminalDialog.createModel(100, 50).kind).toBe('message');
      expect(reportText(fixture.game)).toContain('Automatic return complete');
      expect(reportText(fixture.game)).toContain('Reactor fuel used');
      expect(reportText(fixture.game)).toContain(longReturn ? 'crew awakened' : 'Crew remained on duty');
      fixture.game._processInput();
      fixture.game._update(100);
      expect(fixture.checkpoint).toHaveBeenCalledOnce();
      expect(fixture.game.terminalDialog.isOpen).toBe(true);
      expect(fixture.game.gameClockElapsedSeconds).toBe(fixture.live().gameClockElapsedSeconds);
    }
  );

  it('leaves the vessel and deferred route unchanged on a failed checkpoint', () => {
    const fixture = returnHarness(true);
    const before = structuredClone(fixture.live());
    fixture.game.activateShipMenuSelection({ id: 'homebound', cells: ['Homebound Travel'] });
    choose(fixture.game, true);
    fixture.game.screenTransition.skip();
    fixture.game._update(0.1);
    expect(fixture.game.screenTransition.isActive).toBe(false);
    expect(fixture.game.sleepingHaulCrew).toBe(0);
    expect(fixture.apply).not.toHaveBeenCalled();
    expect(fixture.selectPort).not.toHaveBeenCalled();
    expect(fixture.live()).toEqual(before);
    expect(fixture.state.currentSystem).toBe(fixture.fixture.source);
    expect(reportText(fixture.game)).toContain('storage full');
    expect(fixture.game.terminalDialog.createModel(100, 50).caution).toBe(true);
  });
});
