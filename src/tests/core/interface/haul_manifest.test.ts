import { describe, expect, it, vi } from 'vitest';
import { HaulManifest, formatHaulDuration, type HaulManifestData } from '../../../core/haul_manifest';
import { quoteHeavyHaul } from '../../../core/tow_performance';
import { heavyHaulMissionFixture, heavyHaulContextFixture } from '../../fixtures/heavy_haul_contracts';
import { getHeavyHaulObjective } from '../../../core/mission_board';
import { Game } from '../../../core/game';
import { InterfaceModeController } from '../../../core/modes/game_mode_controllers';

/** Uses the real quote and packaged terms, but no canvas, random world search or in-game clock timer. */
function manifestFixture(stage: HaulManifestData['stage'] = 'available') {
  const mission = heavyHaulMissionFixture('local');
  const objective = getHeavyHaulObjective(mission)!;
  const controller = new HaulManifest();
  controller.open(
    {
      mission,
      stage,
      quote: quoteHeavyHaul(objective, heavyHaulContextFixture()),
      normalFuel: 450,
      maximumFuel: 500,
      remainingSupport: objective.package.supportFuelCapacityUnits,
      departureDate: '01 Jan 3015 AD 00:00',
      arrivalDate: '01 Jan 3015 AD 12:00',
      staging: 'Approach the pickup contact',
    },
    'ship-menu'
  );
  return controller;
}

/** Sends one fresh context-bound key to the terminal, including keys used to skip the reveal. */
function press(action: string) {
  return { wasActionJustPressed: (key: string) => key === action, wasAnyKeyJustPressed: () => true };
}

describe('paused haul manifest controls', () => {
  it('consumes reveal skipping without accepting, then confirms the selected stage in two steps', () => {
    const manifest = manifestFixture();
    const model = manifest.createModel(100, 40);
    expect(manifest.input(press('ENTER_SYSTEM'), model)).toBeUndefined();
    expect(manifest.reveal.isActive).toBe(false);
    expect(manifest.confirmation).toBeNull();
    expect(manifest.input(press('ENTER_SYSTEM'), model)).toBeUndefined();
    expect(manifest.confirmation).toBe('accept');
    expect(manifest.input(press('ENTER_SYSTEM'), model)).toBe('accept');
    expect(manifest.confirmation).toBeNull();
  });

  it.each([
    ['awaiting-pickup', 'couple'],
    ['attached', 'depart'],
    ['arrived', 'deploy'],
  ] as const)('exposes only the correct %s primary action', (stage, action) => {
    const manifest = manifestFixture(stage);
    expect(manifest.primary()).toBe(action);
    expect(manifest.createCommandBar().buttons.some((button) => button.action === 'TARGET_MENU')).toBe(true);
  });

  it('requires explicit recovery confirmation and supports cancellation without closing its parent', () => {
    const manifest = manifestFixture('attached');
    manifest.reveal.complete();
    const model = manifest.createModel(100, 40);
    expect(manifest.input(press('BIOLOGY_COLLECT'), model)).toBeUndefined();
    expect(manifest.confirmation).toBe('recover');
    expect(manifest.input(press('QUIT'), model)).toBeUndefined();
    expect(manifest.confirmation).toBeNull();
    manifest.input(press('BIOLOGY_COLLECT'), model);
    expect(manifest.input(press('ENTER_SYSTEM'), model)).toBe('recover');
    expect(manifest.returnTo).toBe('ship-menu');
  });

  it('brings confirmation warnings into view instead of leaving them above a scrolled dossier', () => {
    const manifest = manifestFixture('attached');
    manifest.reveal.complete();
    const model = manifest.createModel(40, 24);
    manifest.input(press('PAGE_DOWN'), model);
    expect(manifest.viewOffset).toBeGreaterThan(0);
    manifest.input(press('BIOLOGY_COLLECT'), model);
    expect(manifest.viewOffset).toBe(0);
    const confirmed = manifest.createModel(40, 24);
    expect(confirmed.dashboard?.[0].segments[0]).toMatchObject({ text: 'CONFIRM RECOVER', tone: 'red' });
    expect(manifest.createCommandBar().buttons.find((button) => button.id === 'confirm')?.tone).toBe('red');
  });

  it.each([
    [140, 50],
    [80, 30],
    [40, 24],
    [24, 16],
  ])('wraps the %i x %i readout without losing text or page controls', (cols, rows) => {
    const manifest = manifestFixture('arrived');
    manifest.reveal.complete();
    const model = manifest.createModel(cols, rows);
    const contentWidth = cols - (cols < 54 ? 8 : 12);
    expect(
      model.dashboard!.every(
        (line) =>
          line.segments.reduce((length, segment) => length + segment.text.length, 0) <=
          Math.max(1, contentWidth)
      )
    ).toBe(true);
    expect(model.dashboardFullWidth).toBe(cols < 54);
    expect(model.subtitle!.length).toBeLessThanOrEqual(cols - 6);
    expect(model.dashboard!.flatMap((line) => line.segments).some((segment) => segment.font === 'thin')).toBe(
      true
    );
    expect(
      model.dashboard!.flatMap((line) => line.segments).some((segment) => segment.font === 'thick')
    ).toBe(true);
    const text = model
      .dashboard!.map((line) => line.segments.map((segment) => segment.text).join(''))
      .join(' ');
    expect(text).toContain('READY TO DEPLOY');
    manifest.input(press('PAGE_DOWN'), model);
    expect(manifest.viewOffset > 0).toBe(model.dashboard!.length > model.visibleRowCount);
    manifest.input(press('PAGE_UP'), model);
    expect(manifest.viewOffset).toBe(0);
  });

  it('never offers another departure or payout after commissioning', () => {
    const manifest = manifestFixture('complete');
    expect(manifest.primary()).toBeNull();
    expect(manifest.createCommandBar().buttons.some((button) => button.action === 'ENTER_SYSTEM')).toBe(
      false
    );
  });

  it('pauses the real Game update path and suppresses foreground HUD for the terminal', () => {
    interface Harness {
      interfaceMode: InterfaceModeController<never, never, never>;
      gameClockElapsedSeconds: number;
      isGameClockPaused(): boolean;
      shouldSuppressHudForeground(): boolean;
      _update(delta: number): void;
      handleHaulManifestInput(): boolean;
      _processInput(): void;
    }
    const controller = manifestFixture();
    const interfaceMode = new InterfaceModeController<never, never, never>();
    interfaceMode.open('haul-manifest');
    const game = Object.assign(Object.create(Game.prototype) as Harness, {
      _haulManifest: controller,
      _interfaceMode: interfaceMode,
      renderer: { getGridCols: () => 100, getGridRows: () => 40 },
      inputManager: { wasActionJustPressed: () => false, wasAnyKeyJustPressed: () => false },
      captureCurrentPlanetMutations: vi.fn(),
      _publishStatusUpdate: vi.fn(),
      gameClockElapsedSeconds: 100,
      currentVisualDeltaSeconds: 0,
    });
    expect(game.isGameClockPaused()).toBe(true);
    expect(game.shouldSuppressHudForeground()).toBe(true);
    expect(game.handleHaulManifestInput()).toBe(true);
    game._processInput();
    game._update(0.1);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(controller.reveal.progress).toBeGreaterThan(0);
  });

  it('formats hours, days and years without erasing strategic duration', () => {
    expect(formatHaulDuration(90)).toBe('2 min');
    expect(formatHaulDuration(7200)).toBe('2.0 hours');
    expect(formatHaulDuration(86400 * 22)).toBe('22.0 days');
    expect(formatHaulDuration(365.25 * 86400 * 2)).toBe('2.00 years');
  });
});
