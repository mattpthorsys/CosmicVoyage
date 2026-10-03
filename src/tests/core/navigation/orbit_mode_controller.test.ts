import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../../config';
import { AU_IN_METERS } from '../../../constants/physics';
import { Game } from '../../../core/game';
import { OrbitModeController, OrbitInteractionContext } from '../../../core/modes/orbit_mode_controller';
import { Planet } from '../../../entities/planet';
import { PRNG } from '../../../utils/prng';
import type { StellarBody } from '../../../entities/stellar_body';

const TIME_SCALE = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);

/** Creates a real domain object while keeping surface generation outside controller tests. */
function createBody(name: string, type = 'Rock'): Planet {
  const body = new Planet(name, type, AU_IN_METERS, 0, new PRNG(name), 'G');
  vi.spyOn(body, 'isSurfaceReady').mockReturnValue(true);
  return body;
}

/** Creates the controller's application effects with a mutable live-location flag. */
function createContext(parentPlanet: Planet) {
  const location = { active: true };
  const context = {
    parentPlanet,
    stars: [],
    viewportCols: 110,
    viewportRows: 40,
    isActive: () => location.active,
    survey: vi.fn(),
    prefetch: vi.fn(),
    leave: vi.fn(),
    land: vi.fn(),
    invalidate: vi.fn(),
  } satisfies OrbitInteractionContext;
  return { context, location };
}

/** Represents one input frame with separate pressed and held keys. */
function input(pressed: string[] = [], held: string[] = []) {
  return {
    wasActionJustPressed: (action: string) => pressed.includes(action),
    isActionActive: (action: string) => held.includes(action),
    wasAnyKeyJustPressed: () => pressed.length > 0,
  };
}

describe('orbital interaction controller', () => {
  it('selects an exact mission habitat on a moon without landing until a separate confirmation', () => {
    const parent = createBody('Mission parent');
    const moon = createBody('Mission moon');
    parent.moons.push(moon);
    const orbit = new OrbitModeController();
    const { context } = createContext(parent);
    expect(orbit.selectLandingSite(parent, moon, 123, 456, 'Sheltered habitat')).toBe(true);
    expect(orbit.getSelectedBody(parent)).toBe(moon);
    expect(orbit.mode).toBe('landing');
    expect(orbit.landingX).toBe(123);
    expect(orbit.landingY).toBe(456);
    expect(context.land).not.toHaveBeenCalled();
    orbit.handleInput(input(['ENTER_SYSTEM']), context);
    expect(context.land).toHaveBeenCalledWith(moon, 123, 456);
  });

  it('rejects unprepared, distant, gaseous or invalid mission landing selections without altering the cursor', () => {
    const parent = createBody('Guarded habitat');
    const other = createBody('Distant planet');
    const giant = createBody('Giant', 'GasGiant');
    parent.moons.push(giant);
    const orbit = new OrbitModeController();
    const start = { x: orbit.landingX, y: orbit.landingY };
    expect(orbit.selectLandingSite(parent, other, 1, 1, 'Invalid')).toBe(false);
    expect(orbit.selectLandingSite(parent, giant, 1, 1, 'Invalid')).toBe(false);
    for (const [x, y] of [
      [-1, 1],
      [1, -1],
      [0.5, 1],
      [1, Infinity],
      [9999, 1],
    ])
      expect(orbit.selectLandingSite(parent, parent, x, y, 'Invalid')).toBe(false);
    vi.mocked(parent.isSurfaceReady).mockReturnValue(false);
    expect(orbit.selectLandingSite(parent, parent, 1, 1, 'Loading')).toBe(false);
    expect(orbit.mode).toBe('overview');
    expect(orbit.landingX).toBe(start.x);
    expect(orbit.landingY).toBe(start.y);
    expect(orbit.selectedBodyIndex).toBe(0);
  });

  it('refreshes physical light data without rebuilding cached descriptions', () => {
    const parent = createBody('Moving lights');
    parent.systemX = 0;
    parent.systemY = 0;
    const star: StellarBody = {
      id: 'A',
      name: 'A',
      starType: 'G',
      massKg: 1.989e30,
      radiusM: 6.957e8,
      luminosityW: 3.828e26,
      systemX: AU_IN_METERS,
      systemY: 0,
      orbit: null,
      environment: { starType: 'G', ageGyr: 4.6, metallicityFeH: 0 },
    };
    const orbit = new OrbitModeController();
    const first = orbit.createScreen(parent, [star], '', TIME_SCALE);
    star.systemX *= 2;
    const moved = orbit.createScreen(parent, [star], '', TIME_SCALE);
    expect(moved.summary).toBe(first.summary);
    expect(moved.stellarSources[0].irradianceWm2).toBeCloseTo(first.stellarSources[0].irradianceWm2! / 4, 8);
    expect(moved.stellarSources[0].angularRadius).toBeLessThan(first.stellarSources[0].angularRadius!);
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).stellarSources).toEqual([]);
    const sameNameDifferentBody = createBody(parent.name);
    const changed = orbit.createScreen(sameNameDifferentBody, [], '', TIME_SCALE);
    expect(changed.selectedBody).toBe(sameNameDifferentBody);
    expect(changed.summary).not.toBe(first.summary);
  });

  it('cycles planet and moons, surveys the selection, prepares neighbours, and redraws', () => {
    const parent = createBody('Parent');
    const moon = createBody('Moon');
    parent.moons.push(moon);
    const orbit = new OrbitModeController();
    const { context } = createContext(parent);

    expect(orbit.handleInput(input(['MOVE_LEFT']), context)).toBe(true);
    expect(orbit.getSelectedBody(parent)).toBe(moon);
    expect(context.survey).toHaveBeenCalledWith(moon);
    expect(context.prefetch).toHaveBeenCalledWith([moon, parent]);
    expect(context.invalidate).toHaveBeenCalledOnce();
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).selectedBody).toBe(moon);

    orbit.handleInput(input(['CYCLE_TARGET']), context);
    expect(orbit.getSelectedBody(parent)).toBe(parent);
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).selectedBody).toBe(parent);
  });

  it('wraps longitude, clamps latitude, and confirms the selected landing coordinates', () => {
    const parent = createBody('Landing');
    const orbit = new OrbitModeController();
    const { context } = createContext(parent);
    orbit.handleInput(input(['PRIMARY_ACTION']), context);
    expect(orbit.mode).toBe('landing');
    orbit.landingX = 0;
    orbit.landingY = 0;
    orbit.handleInput(input([], ['MOVE_LEFT', 'MOVE_UP']), context);
    expect(orbit.landingX).toBe(CONFIG.PLANET_MAP_BASE_SIZE - 1);
    expect(orbit.landingY).toBe(0);
    orbit.handleInput(input(['ENTER_SYSTEM']), context);
    expect(context.land).toHaveBeenCalledWith(parent, CONFIG.PLANET_MAP_BASE_SIZE - 1, 0);
    expect(context.leave).not.toHaveBeenCalled();
  });

  it('opens the dossier with D, pages and scrolls without moving the landing cursor, then closes with Escape', () => {
    const parent = createBody('Dossier');
    const orbit = new OrbitModeController();
    const { context } = createContext(parent);
    context.viewportRows = 22;
    orbit.handleInput(input(['PRIMARY_ACTION']), context);
    const oldX = orbit.landingX;
    const oldY = orbit.landingY;
    expect(orbit.handleInput(input(['ORBIT_DOSSIER']), context)).toBe(true);
    expect(orbit.dossier.isOpen).toBe(true);
    orbit.dossier.reveal.update(1.5);
    orbit.handleInput(input(['PAGE_DOWN']), context);
    const afterPage = orbit.dossier.viewOffset;
    expect(afterPage).toBeGreaterThan(0);
    orbit.handleInput(input(['MOVE_DOWN']), context);
    expect(orbit.dossier.viewOffset).toBe(afterPage + 1);
    orbit.handleInput(input(['MOVE_UP']), context);
    expect(orbit.dossier.viewOffset).toBe(afterPage);
    orbit.handleInput(input(['ENTER_SYSTEM']), context);
    expect(context.land).not.toHaveBeenCalled();
    expect(orbit.landingX).toBe(oldX);
    expect(orbit.landingY).toBe(oldY);
    orbit.handleInput(input(['QUIT']), context);
    expect(orbit.dossier.isOpen).toBe(false);
    expect(orbit.mode).toBe('landing');
    expect(context.leave).not.toHaveBeenCalled();
    orbit.reset();
    expect(orbit.dossier.isOpen).toBe(false);
  });

  it.each(['QUIT', 'ORBIT_DOSSIER', 'PAGE_DOWN', 'GALAXY_MAP', 'ENTER_SYSTEM', 'UNBOUND'])(
    'consumes %s to finish writing without closing, scrolling, or landing',
    (key) => {
      const parent = createBody('Fast terminal');
      const orbit = new OrbitModeController();
      const { context } = createContext(parent);
      orbit.handleInput(input(['ORBIT_DOSSIER']), context);
      expect(orbit.dossier.reveal.progress).toBe(0);
      expect(orbit.createDossier(parent, [], 110, 40).dashboardReveal).toBe(0);
      orbit.handleInput(input([], ['MOVE_DOWN']), context);
      expect(orbit.dossier.reveal.progress).toBe(0);
      context.invalidate.mockClear();
      orbit.handleInput(input([key]), context);
      expect(orbit.dossier.isOpen).toBe(true);
      expect(orbit.dossier.reveal.progress).toBe(1);
      expect(orbit.dossier.viewOffset).toBe(0);
      expect(context.land).not.toHaveBeenCalled();
      expect(context.leave).not.toHaveBeenCalled();
      expect(context.invalidate).toHaveBeenCalledOnce();
      orbit.handleInput(input(['QUIT']), context);
      expect(orbit.dossier.isOpen).toBe(false);
      orbit.handleInput(input(['ORBIT_DOSSIER']), context);
      expect(orbit.dossier.reveal.progress).toBe(0);
      orbit.reset();
      expect(orbit.dossier.reveal.isActive).toBe(false);
    }
  );

  it('gives the dossier priority over other global instrument shortcuts', () => {
    const parent = createBody('Modal priority');
    const orbit = new OrbitModeController();
    orbit.dossier.open();
    const galaxy = vi.fn(() => true);
    const game = Object.assign(Object.create(Game.prototype), {
      stateManager: { state: 'orbit', currentPlanet: parent, currentOrbitReferencePlanet: parent },
      _orbitModeState: orbit,
      inputManager: input(['GALAXY_MAP']),
      renderer: { getGridCols: () => 110, getGridRows: () => 40 },
      _handleJettisonConfirmationInput: () => false,
      _handleSurfaceExtractionSelectorInput: () => false,
      _handleQuantitySelectorInput: () => false,
      _handlePopupInput: () => false,
      _handleGalaxyMapInput: galaxy,
      _publishStatusUpdate: vi.fn(),
      forceFullRender: false,
    }) as { _processInput: () => void; forceFullRender: boolean };
    game._processInput();
    expect(orbit.dossier.reveal.progress).toBe(1);
    expect(orbit.dossier.isOpen).toBe(true);
    expect(galaxy).not.toHaveBeenCalled();
    expect(game.forceFullRender).toBe(true);
  });

  it('cancels landing before leaving orbit and refuses giant surface landings', () => {
    const orbit = new OrbitModeController();
    const { context } = createContext(createBody('Cancel'));
    orbit.handleInput(input(['PRIMARY_ACTION']), context);
    orbit.handleInput(input(['QUIT']), context);
    expect(orbit.mode).toBe('overview');
    expect(context.leave).not.toHaveBeenCalled();
    orbit.handleInput(input(['QUIT']), context);
    expect(context.leave).toHaveBeenCalledOnce();

    for (const type of ['GasGiant', 'IceGiant']) {
      const giant = createContext(createBody(type, type));
      orbit.handleInput(input(['PRIMARY_ACTION']), giant.context);
      expect(orbit.mode).toBe('overview');
      expect(orbit.alert).toContain('No solid landing solution');
      expect(giant.context.land).not.toHaveBeenCalled();
    }
  });

  it.each(['ready', 'departed', 'another-body'] as const)(
    'handles delayed landing preparation when %s',
    async (outcome) => {
      const parent = createBody('Pending');
      parent.moons.push(createBody('Pending Moon'));
      vi.mocked(parent.isSurfaceReady).mockReturnValue(false);
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      vi.spyOn(parent, 'prepareSurfaceReady').mockReturnValue(pending);
      const orbit = new OrbitModeController();
      const { context, location } = createContext(parent);
      orbit.handleInput(input(['PRIMARY_ACTION']), context);
      expect(orbit.mode).toBe('overview');
      if (outcome === 'departed') location.active = false;
      if (outcome === 'another-body') orbit.handleInput(input(['MOVE_RIGHT']), context);
      context.invalidate.mockClear();
      finish();
      await pending;
      expect(orbit.mode).toBe(outcome === 'ready' ? 'landing' : 'overview');
      expect(context.invalidate).toHaveBeenCalledTimes(outcome === 'ready' ? 1 : 0);
    }
  );

  it('reports a surface preparation failure and invalidates the visible alert', async () => {
    const parent = createBody('Failed');
    vi.mocked(parent.isSurfaceReady).mockReturnValue(false);
    vi.spyOn(parent, 'prepareSurfaceReady').mockRejectedValue(new Error('worker failed'));
    const orbit = new OrbitModeController();
    const { context } = createContext(parent);
    orbit.handleInput(input(['PRIMARY_ACTION']), context);
    await Promise.resolve();
    await Promise.resolve();
    expect(orbit.alert).toBe('Landing data unavailable: worker failed');
    expect(orbit.mode).toBe('overview');
    expect(context.invalidate).toHaveBeenCalledTimes(2);
  });

  it('reuses screen text during animation and invalidates it on landing and location changes', () => {
    const parent = createBody('Screen');
    const orbit = new OrbitModeController();
    const { context } = createContext(parent);
    const first = orbit.createScreen(parent, [], '', TIME_SCALE);
    orbit.update(parent, 40);
    const animated = orbit.createScreen(parent, [], '', TIME_SCALE);
    expect(animated.summary).toBe(first.summary);
    expect(animated.illuminationPhase).toBeCloseTo(40 * 0.06);
    expect(orbit.getRotationPhase({ rotationPeriodHours: 24 }, TIME_SCALE)).toBeCloseTo(
      (40 * TIME_SCALE) / 86400
    );
    expect(orbit.getRotationPhase({ rotationPeriodHours: NaN }, TIME_SCALE)).toBeCloseTo(40 * 0.006);
    orbit.handleInput(input(['PRIMARY_ACTION']), context);
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).mode).toBe('landing');
    orbit.invalidateScreen();
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).summary).not.toBe(animated.summary);
    orbit.reset(0, 96);
    expect(orbit.elapsedSeconds).toBe(0);
    expect(orbit.landingX).toBe(48);
    expect(orbit.mode).toBe('overview');
  });

  it('connects Game input to location transitions and forces a redraw', () => {
    const parent = createBody('Integration');
    const stateManager = {
      state: 'orbit',
      currentPlanet: parent,
      currentOrbitReferencePlanet: parent,
      statusMessage: '',
      leaveOrbit: vi.fn(() => {
        stateManager.state = 'system';
        stateManager.statusMessage = 'Orbit left.';
      }),
      landFromOrbit: vi.fn(),
    };
    const game = Object.assign(Object.create(Game.prototype), {
      stateManager,
      _orbitModeState: new OrbitModeController(),
      inputManager: input(['QUIT']),
      renderer: { getGridCols: () => 110, getGridRows: () => 40 },
      forceFullRender: false,
      statusMessage: '',
    }) as {
      _handleOrbitInput: () => boolean;
      forceFullRender: boolean;
      statusMessage: string;
    };
    expect(game._handleOrbitInput()).toBe(true);
    expect(stateManager.state).toBe('system');
    expect(game.statusMessage).toBe('Orbit left.');
    expect(stateManager.statusMessage).toBe('');
    expect(game.forceFullRender).toBe(true);
    expect(game._handleOrbitInput()).toBe(false);
  });

  it('pauses orbital updates and clock time while the dossier is open', () => {
    const orbit = new OrbitModeController();
    orbit.dossier.open();
    const dispatch = vi.fn(() => '');
    const game = Object.assign(Object.create(Game.prototype), {
      stateManager: { state: 'orbit', currentPlanet: createBody('Paused') },
      _orbitModeState: orbit,
      gameClockElapsedSeconds: 100,
      popupState: 'inactive',
      captureCurrentPlanetMutations: vi.fn(),
      terminalOverlay: { update: vi.fn() },
      astrometricOverlay: { update: vi.fn() },
      renderer: {
        getCanvas: () => ({ width: 100, height: 40 }),
        getCharWidthPx: () => 1,
        getCharHeightPx: () => 1,
      },
      getCurrentViewScale: () => 1,
      _modeDispatcher: { dispatch },
      _publishStatusUpdate: vi.fn(),
      forceFullRender: false,
      currentVisualDeltaSeconds: 0.75,
    }) as {
      _update: (delta: number) => void;
      gameClockElapsedSeconds: number;
      forceFullRender: boolean;
    };
    game._update(0.1);
    expect(orbit.dossier.reveal.progress).toBe(0.5);
    expect(orbit.elapsedSeconds).toBe(0);
    expect(game.forceFullRender).toBe(true);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(dispatch).not.toHaveBeenCalled();
    game.forceFullRender = false;
    game._update(0.1);
    expect(orbit.dossier.reveal.progress).toBe(1);
    expect(game.forceFullRender).toBe(true);
    game.forceFullRender = false;
    game._update(0.1);
    expect(game.forceFullRender).toBe(false);
    expect(game.gameClockElapsedSeconds).toBe(100);
    expect(dispatch).not.toHaveBeenCalled();
    orbit.dossier.close();
    game._update(1);
    expect(game.gameClockElapsedSeconds).toBeGreaterThan(100);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('keeps the orbital render signature fixed while reading the dossier', () => {
    const orbit = new OrbitModeController();
    orbit.dossier.open();
    const body = createBody('Static view');
    const game = Object.assign(Object.create(Game.prototype), {
      stateManager: { state: 'orbit' },
      _orbitModeState: orbit,
      getSelectedOrbitBody: () => body,
    }) as { getMainRenderSignature: (now: number) => string };
    const initial = game.getMainRenderSignature(0);
    expect(initial).toBe(game.getMainRenderSignature(5000));
    orbit.dossier.viewOffset = 1;
    expect(game.getMainRenderSignature(0)).not.toBe(initial);
    orbit.dossier.close();
    expect(game.getMainRenderSignature(0)).not.toBe(game.getMainRenderSignature(5000));
  });
});
