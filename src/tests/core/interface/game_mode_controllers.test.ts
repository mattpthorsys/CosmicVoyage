import { describe, expect, it } from 'vitest';
import {
  GameModeDispatcher,
  OrbitModeController,
  ShipOperationsController,
  SurfaceModeController,
  TravelModeController,
} from '../../../core/modes/game_mode_controllers';

describe('game mode controllers', () => {
  it('resets travel and orbital interaction state at mode boundaries', () => {
    const travel = new TravelModeController();
    travel.currentTargetIndex = 4;
    travel.targetMenuOpen = true;
    travel.commandMoving = false;
    travel.resetForState('system');

    expect(travel.currentTargetIndex).toBe(0);
    expect(travel.targetMenuOpen).toBe(false);
    expect(travel.commandMoving).toBe(true);

    const orbit = new OrbitModeController();
    orbit.alert = 'stale';
    orbit.elapsedSeconds = 42;
    orbit.reset(2, 96);

    expect(orbit.selectedBodyIndex).toBe(2);
    expect(orbit.landingX).toBe(48);
    expect(orbit.landingY).toBe(48);
    expect(orbit.elapsedSeconds).toBe(0);
  });

  it('closes transient surface and ship interfaces as coherent units', () => {
    const surface = new SurfaceModeController();
    surface.roverCargoOpen = true;
    surface.legendOpen = true;
    surface.scanCursor = { dx: 2, dy: -1 };
    surface.closeTransientInterfaces();

    expect(surface.roverCargoOpen).toBe(false);
    expect(surface.legendOpen).toBe(false);
    expect(surface.scanCursor).toBeNull();

    const ship = new ShipOperationsController();
    ship.open = true;
    ship.section = 'cargo';
    ship.selectionBySection.cargo = 3;
    ship.close();

    expect(ship.open).toBe(false);
    expect(ship.section).toBe('main');
    expect(ship.selectionBySection).toEqual({});
  });

  it('dispatches update work through the active game mode only', () => {
    const dispatcher = new GameModeDispatcher();
    const visited: string[] = [];
    const result = dispatcher.dispatch('orbit', {
      hyperspace: () => visited.push('hyperspace'),
      system: () => visited.push('system'),
      orbit: () => {
        visited.push('orbit');
        return 7;
      },
      planet: () => visited.push('planet'),
      starbase: () => visited.push('starbase'),
    });

    expect(result).toBe(7);
    expect(visited).toEqual(['orbit']);
  });
});
