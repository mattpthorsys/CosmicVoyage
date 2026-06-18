import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../config';
import { Game } from '../../../core/game';
import { Player } from '../../../core/player';

describe('Game star scan formatting', () => {
  it('reports stellar mass with two decimal places in solar masses', () => {
    const game = Object.create(Game.prototype) as any;

    const lines = game._formatStarScanPopup({
      id: 'A',
      name: 'Test Primary',
      starType: 'G2V',
      massKg: 1.98847e30,
      radiusM: 6.957e8,
      luminosityW: 3.828e26,
      systemX: 0,
      systemY: 0,
      orbit: null,
      environment: {
        starType: 'G2V',
        ageGyr: 4.6,
        metallicityFeH: 0,
      },
    });

    const massLine = lines.find((line: string) => line.startsWith('Mass: <hl>~'));

    expect(massLine).toMatch(/^Mass: <hl>~\d+\.\d{2} Solar Masses<\/hl>$/);
    expect(massLine).not.toMatch(/\d+\.\d Solar Masses/);
  });

  it('prioritizes a nearby star over a farther local planet scan contact', () => {
    const player = new Player();
    const star = { name: 'Close Primary', systemX: CONFIG.LANDING_DISTANCE * 0.9, systemY: 0 };
    const planet = { name: 'Outer Planet', systemX: CONFIG.LANDING_DISTANCE * 0.95, systemY: 0 };
    const game = Object.assign(Object.create(Game.prototype), {
      player,
      stateManager: {
        state: 'system',
        currentSystem: {
          getObjectNear: () => planet,
          getScannableObjectNear: () => planet,
          getStarNear: () => star,
        },
      },
    });

    expect(game.getLocalSystemScanTarget()).toBe(star);
  });
});
