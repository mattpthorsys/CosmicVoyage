import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { MineralRichness } from '../constants';
import { createAvailableActions, formatAvailableActions } from './available_actions';
import { Player } from './player';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';

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
    expect(formatAvailableActions(actions)).toContain(`[${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter System`);
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
      scanned: { value: true },
      mineralRichness: { value: MineralRichness.RICH },
      isMined: { value: () => false },
    });

    const actions = createAvailableActions({
      ...baseContext(),
      state: 'planet',
      planet,
    });

    expect(actions.map((action) => action.id)).toEqual(expect.arrayContaining(['liftoff', 'mine']));
  });
});
