import { describe, expect, it } from 'vitest';
import { Player } from './player';
import { CONFIG } from '../config';

describe('Player', () => {
  it('initializes component state from config', () => {
    const player = new Player(4, -2);

    expect(player.position.worldX).toBe(4);
    expect(player.position.worldY).toBe(-2);
    expect(player.render.char).toBe(CONFIG.PLAYER_CHAR);
    expect(player.resources.fuel).toBe(CONFIG.INITIAL_FUEL);
    expect(player.resources.credits).toBe(CONFIG.INITIAL_CREDITS);
    expect(player.cargoHold.capacity).toBe(CONFIG.INITIAL_CARGO_CAPACITY);
  });

  it('measures squared distance in system coordinates', () => {
    const player = new Player();
    player.position.systemX = 3;
    player.position.systemY = 4;

    expect(player.distanceSqToSystemCoords(0, 0)).toBe(25);
  });

  it('adds fuel without exceeding the tank', () => {
    const player = new Player();
    player.resources.fuel = player.resources.maxFuel - 5;

    player.addFuel(50);

    expect(player.resources.fuel).toBe(player.resources.maxFuel);
  });
});
