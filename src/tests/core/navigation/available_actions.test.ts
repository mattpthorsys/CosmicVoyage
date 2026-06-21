import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../config';
import { MineralRichness } from '../../../constants';
import { createAvailableActions, formatAvailableActions } from '../../../core/available_actions';
import { Player } from '../../../core/player';
import { Planet } from '../../../entities/planet';
import { Starbase } from '../../../entities/starbase';

/** Creates the default action-discovery context used by each test. */
function baseContext() {
  return {
    player: new Player(),
    system: null,
    planet: null,
    starbase: null,
  };
}

describe('available actions', () => {
  it('offers enter and scan near a hyperspace system', () => {
    const actions = createAvailableActions({
      ...baseContext(),
      state: 'hyperspace',
      isNearHyperspaceSystem: true,
      nearbySystemName: 'Test-1A',
    });

    expect(actions.map((action) => action.id)).toContain('enter-system');
    expect(actions.map((action) => action.id)).toContain('scan-system');
    expect(formatAvailableActions(actions)).toContain(
      `[${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter System`
    );
  });

  it('surfaces hyperspace drift controls for discoverability', () => {
    const actions = createAvailableActions({
      ...baseContext(),
      state: 'hyperspace',
      isNearHyperspaceSystem: false,
    });

    expect(actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['boost', 'fine-control', 'profiler'])
    );
  });

  it('offers landing and scanning near a system object', () => {
    const starbase = Object.create(Starbase.prototype) as Starbase;
    Object.defineProperties(starbase, {
      name: { value: 'Test Starbase' },
      systemX: { value: 0 },
      systemY: { value: 0 },
    });

    const actions = createAvailableActions({
      ...baseContext(),
      state: 'system',
      nearbyObject: starbase,
      isNearSystemEdge: false,
    });

    expect(actions.map((action) => action.id)).toEqual(expect.arrayContaining(['land-dock', 'scan-object']));
    expect(actions.find((action) => action.id === 'land-dock')?.label).toBe('Dock');
  });

  it('offers mining only after a rich scanned planet has an unmined tile', () => {
    const planet = Object.create(Planet.prototype) as Planet;
    Object.defineProperties(planet, {
      name: { value: 'Test I' },
      type: { value: 'Rock' },
      discovery: {
        value: {
          level: 'mapped',
          confidence: 100,
          observations: 2,
          lastMethod: 'surface-map',
        },
      },
      mineralRichness: { value: MineralRichness.RICH },
      isMined: { value: () => false },
    });

    const actions = createAvailableActions({
      ...baseContext(),
      state: 'planet',
      planet,
    });

    expect(actions.map((action) => action.id)).toEqual(expect.arrayContaining(['ship-menu', 'mine']));
    expect(actions.map((action) => action.id)).not.toContain('liftoff');
  });
});
