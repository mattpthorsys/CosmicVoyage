import { describe, expect, it } from 'vitest';
import { createHelpReferenceLines } from '../../../core/help_reference';
import { createAvailableActions } from '../../../core/available_actions';
import { Player } from '../../../core/player';

describe('help reference', () => {
  it('includes contextual actions and major mode references', () => {
    const player = new Player();
    const actions = createAvailableActions({
      state: 'hyperspace',
      player,
      system: null,
      planet: null,
      starbase: null,
      isNearHyperspaceSystem: true,
      nearbySystemName: 'Test-1A',
    });

    const lines = createHelpReferenceLines('hyperspace', actions);

    expect(lines).toContain('COSMIC VOYAGE REFERENCE');
    expect(lines).toContain('CURRENT MODE: Hyperspace');
    expect(lines.some((line) => line.includes('Enter System: Test-1A'))).toBe(true);
    expect(lines).toContain('ORBIT / SURFACE / STARBASE');
  });
});
