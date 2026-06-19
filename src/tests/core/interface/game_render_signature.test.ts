import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import {
  OrbitModeController,
  ShipOperationsController,
  SurfaceModeController,
  TravelModeController,
} from '../../../core/modes/game_mode_controllers';
import { StarbaseController } from '../../../core/starbase_controller';

/** Creates render gate harness. */
function createRenderGateHarness(): any {
  return Object.assign(Object.create(Game.prototype), {
    forceFullRender: false,
    popupState: 'inactive',
    lastMainRenderSignature: '',
    lastOverlayRenderAt: Number.NEGATIVE_INFINITY,
    gameClockElapsedSeconds: 0,
    _travelMode: new TravelModeController(),
    _orbitModeState: new OrbitModeController(),
    _surfaceMode: new SurfaceModeController(),
    _starbaseMode: new StarbaseController(),
    _shipOperations: new ShipOperationsController(),
    stateManager: { state: 'hyperspace' },
    player: {
      position: {
        worldX: 12,
        worldY: -7,
      },
      render: {
        char: '@',
      },
    },
  });
}

describe('Game main render signatures', () => {
  it('uses stable hyperspace signatures while the player is stationary', () => {
    const game = createRenderGateHarness();

    const first = game.getMainRenderSignature();
    const second = game.getMainRenderSignature();

    expect(first).toBe('hyperspace|12|-7|@');
    expect(second).toBe(first);
  });

  it('does not invalidate the hyperspace scene when only the overlay clock changes', () => {
    const game = createRenderGateHarness();
    const first = game.getMainRenderSignature();

    game.gameClockElapsedSeconds = 90 * 60;

    expect(game.getMainRenderSignature()).toBe(first);
  });

  it('caps system and orbit scene animation at sixty frames per second', () => {
    const game = createRenderGateHarness();
    game.stateManager = {
      state: 'system',
      currentSystem: { name: 'Tau Test' },
    };
    game.player.position.systemX = 10;
    game.player.position.systemY = 20;
    game.currentZoomLevelIndex = 3;
    game.travelMode.currentTargetSignature = 'target';

    expect(game.getMainRenderSignature(1001)).toBe(game.getMainRenderSignature(1016));
    expect(game.getMainRenderSignature(1017)).not.toBe(game.getMainRenderSignature(1016));

    const beforeMovement = game.getMainRenderSignature(1017);
    game.player.position.systemX += 500;
    expect(game.getMainRenderSignature(1017)).toBe(beforeMovement);

    game.stateManager = { state: 'orbit' };
    game.getSelectedOrbitBody = () => ({ name: 'Test I' });
    expect(game.getMainRenderSignature(2001)).toBe(game.getMainRenderSignature(2016));
    expect(game.getMainRenderSignature(2017)).not.toBe(game.getMainRenderSignature(2016));
  });

  it('caps overlay drawing at sixty frames per second', () => {
    const game = createRenderGateHarness();

    game.lastOverlayRenderAt = 1000;
    expect(game.shouldRenderOverlay(1016)).toBe(false);
    expect(game.shouldRenderOverlay(1017)).toBe(true);

    game.forceFullRender = true;
    expect(game.shouldRenderOverlay(1020)).toBe(true);
  });

  it('changes hyperspace signatures when the player moves', () => {
    const game = createRenderGateHarness();
    const first = game.getMainRenderSignature();

    game.player.position.worldX += 1;

    expect(game.getMainRenderSignature()).not.toBe(first);
  });

  it('can skip unchanged hyperspace main renders while overlays use their own canvas', () => {
    const game = createRenderGateHarness();
    const signature = game.getMainRenderSignature();
    game.lastMainRenderSignature = signature;

    expect(game.canSkipMainRender('hyperspace', signature)).toBe(true);

    game.forceFullRender = true;
    expect(game.canSkipMainRender('hyperspace', signature)).toBe(false);
  });

  it('redraws overlays without repainting an unchanged main scene', () => {
    const game = createRenderGateHarness();
    const overlayContext = {} as CanvasRenderingContext2D;
    const clearMain = vi.fn();
    const clearOverlay = vi.fn();
    const renderAstrometric = vi.fn();
    const renderTerminal = vi.fn();

    Object.assign(game, {
      renderer: {
        clear: clearMain,
        clearOverlay,
        getOverlayContext: () => overlayContext,
        getOverlayCanvas: () => ({ width: 640, height: 480 }),
        getCharWidthPx: () => 8,
        getCharHeightPx: () => 16,
      },
      astrometricOverlay: { render: renderAstrometric },
      terminalOverlay: { render: renderTerminal },
      lastFrameProfile: { renderPrepMs: 12, overlayMs: 0 },
      renderTravelDateTimeHud: vi.fn(),
      renderPerformanceOverlay: vi.fn(),
      getMainRenderSignature: () => 'stable',
      canSkipMainRender: () => true,
      shouldRenderOverlay: () => true,
    });

    game._render();

    expect(clearMain).not.toHaveBeenCalled();
    expect(clearOverlay).toHaveBeenCalledOnce();
    expect(renderAstrometric).toHaveBeenCalledWith(overlayContext, 8, 16);
    expect(renderTerminal).toHaveBeenCalledWith(overlayContext, 640, 480);
    expect(game.lastFrameProfile.renderPrepMs).toBe(0);
  });

  it('formats the in-game clock from 3015 AD', () => {
    const game = createRenderGateHarness();
    expect(game.getGameDateTimeLabel()).toBe('01 Jan 3015 AD 00:00');

    game.gameClockElapsedSeconds = 90 * 60;
    expect(game.getGameDateTimeLabel()).toBe('01 Jan 3015 AD 01:30');
  });

  it('advances orbital globe phase by simulated time over body rotation period', () => {
    const game = createRenderGateHarness();
    game.orbitModeState.elapsedSeconds = 40;
    const body = { rotationPeriodHours: 24 };
    const simulatedSecondsPerRealSecond = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);

    expect(game.getOrbitGlobeRotationPhase(body)).toBeCloseTo(
      (40 * simulatedSecondsPerRealSecond) / (24 * 60 * 60)
    );
  });

  it('keeps orbital illumination cadence separate from physical globe rotation', () => {
    const game = createRenderGateHarness();
    game.orbitModeState.elapsedSeconds = 40;
    const body = { rotationPeriodHours: 24 };

    expect(game.getOrbitGlobeIlluminationPhase()).toBeCloseTo(40 * 0.06);
    expect(game.getOrbitGlobeRotationPhase(body)).not.toBeCloseTo(game.getOrbitGlobeIlluminationPhase());
  });

  it('suppresses HUD foreground while modal navigation menus are open', () => {
    const game = createRenderGateHarness();
    game.shipMenuOpen = false;
    game.targetMenuOpen = false;
    expect(game.shouldSuppressHudForeground()).toBe(false);

    game.targetMenuOpen = true;
    expect(game.shouldSuppressHudForeground()).toBe(true);

    game.targetMenuOpen = false;
    game.shipMenuOpen = true;
    expect(game.shouldSuppressHudForeground()).toBe(true);
  });

  it('shows the travel clock HUD only in unobstructed travel states', () => {
    const game = createRenderGateHarness();
    game.targetMenuOpen = false;
    game.shipMenuOpen = false;
    expect(game.isTravelDateTimeHudVisible()).toBe(true);

    game.stateManager.state = 'orbit';
    expect(game.isTravelDateTimeHudVisible()).toBe(true);

    game.stateManager.state = 'starbase';
    expect(game.isTravelDateTimeHudVisible()).toBe(true);

    game.targetMenuOpen = true;
    expect(game.isTravelDateTimeHudVisible()).toBe(false);

    game.targetMenuOpen = false;
    game.stateManager.state = 'planet';
    expect(game.isTravelDateTimeHudVisible()).toBe(false);
  });

  it('pauses the game clock in menus and starbase but not orbit', () => {
    const game = createRenderGateHarness();
    game.popupState = 'inactive';
    game.targetMenuOpen = false;
    game.shipMenuOpen = false;
    game.roverCargoOpen = false;
    game.surfaceLegendOpen = false;
    game.quantitySelector = null;
    game.surfaceExtractionSelector = null;
    game.jettisonConfirmation = null;

    game.stateManager.state = 'orbit';
    expect(game.isGameClockPaused()).toBe(false);

    game.stateManager.state = 'starbase';
    expect(game.isGameClockPaused()).toBe(true);

    game.stateManager.state = 'system';
    game.targetMenuOpen = true;
    expect(game.isGameClockPaused()).toBe(true);
  });
});
