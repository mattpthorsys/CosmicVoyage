import { describe, expect, it } from 'vitest';
import { Player } from '../core/player';
import { PRNG } from '../utils/prng';
import { CargoSystem } from './cargo_systems';
import { MiningSystem } from './mining_system';

function createMiningHarness(): { mining: any; player: Player; planet: any } {
  const player = new Player();
  const cargoSystem = new CargoSystem();
  const planet = {
    type: 'Rock',
    ensureSurfaceReady: () => undefined,
    surfaceElementMap: [['IRON']],
    elementAbundance: { IRON: 100 },
    systemPRNG: new PRNG('partial-mining'),
    depleted: false,
    minedAmount: 0,
    isMined: () => planet.depleted,
    getMinedAmount: () => planet.minedAmount,
    recordMinedAmount: (_x: number, _y: number, amount: number, totalYield: number) => {
      planet.minedAmount += amount;
      if (planet.minedAmount >= totalYield) planet.depleted = true;
    },
    markMined: () => {
      planet.depleted = true;
    },
  };
  const mining = Object.assign(Object.create(MiningSystem.prototype), {
    player,
    cargoSystem,
    stateManager: { state: 'planet', currentPlanet: planet },
    terminalOverlay: { addMessage: () => undefined },
  });
  return { mining, player, planet };
}

describe('MiningSystem quantity extraction', () => {
  it('mines a requested partial amount without exhausting the location', () => {
    const { mining, player, planet } = createMiningHarness();
    const estimate = mining.getMiningEstimate();

    expect(estimate.canMine).toBe(true);
    expect(estimate.maxAmount).toBeGreaterThan(2);

    mining.mine(2);

    expect(player.cargoHold.items.IRON).toBe(2);
    expect(planet.minedAmount).toBe(2);
    expect(planet.depleted).toBe(false);
  });

  it('loads mined material into the deployed terrain vehicle hold', () => {
    const { mining, player } = createMiningHarness();
    player.terrainVehicle.deployed = true;

    mining.mine(3);

    expect(player.cargoHold.items.IRON).toBeUndefined();
    expect(player.terrainVehicle.cargoHold.items.IRON).toBe(3);
  });
});
