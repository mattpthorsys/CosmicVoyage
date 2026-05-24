import { describe, expect, it } from 'vitest';
import { Game } from './game';

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

    const massLine = lines.find((line) => line.startsWith('Mass: <hl>~'));

    expect(massLine).toMatch(/^Mass: <hl>~\d+\.\d{2} Solar Masses<\/hl>$/);
    expect(massLine).not.toMatch(/\d+\.\d Solar Masses/);
  });
});
