import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../../config';
import { AU_IN_METERS } from '../../../constants/physics';
import { Game } from '../../../core/game';
import { OrbitModeController, OrbitInteractionContext } from '../../../core/modes/orbit_mode_controller';
import { Planet } from '../../../entities/planet';
import { PRNG } from '../../../utils/prng';

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
  };
}

describe('orbital interaction controller', () => {
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
    expect(animated.description).toBe(first.description);
    expect(animated.illuminationPhase).toBeCloseTo(40 * 0.06);
    expect(orbit.getRotationPhase({ rotationPeriodHours: 24 }, TIME_SCALE)).toBeCloseTo(
      (40 * TIME_SCALE) / 86400
    );
    expect(orbit.getRotationPhase({ rotationPeriodHours: NaN }, TIME_SCALE)).toBeCloseTo(40 * 0.006);
    orbit.handleInput(input(['PRIMARY_ACTION']), context);
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).mode).toBe('landing');
    orbit.invalidateScreen();
    expect(orbit.createScreen(parent, [], '', TIME_SCALE).description).not.toBe(animated.description);
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
});
