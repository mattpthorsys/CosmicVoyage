import { describe, expect, it } from 'vitest';
import { Player } from '../../core/player';
import { PRNG } from '../../utils/prng';
import { CargoSystem } from '../../systems/cargo_systems';
import { MiningSystem } from '../../systems/mining_system';

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
    expect(estimate.maxAmount).toBeGreaterThanOrEqual(0.1);
    expect(estimate.maxAmount).toBeLessThanOrEqual(15);

    mining.mine(0.2);

    expect(player.cargoHold.items.IRON).toBe(0.2);
    expect(planet.minedAmount).toBe(0.2);
    expect(planet.depleted).toBe(false);
  });

  it('loads mined material into the deployed terrain vehicle hold', () => {
    const { mining, player } = createMiningHarness();
    player.terrainVehicle.deployed = true;

    mining.mine(0.3);

    expect(player.cargoHold.items.IRON).toBeUndefined();
    expect(player.terrainVehicle.cargoHold.items.IRON).toBe(0.3);
  });

  it('mines sparse deuterium deposits as fuel feedstock', () => {
    const { mining, player, planet } = createMiningHarness();
    planet.surfaceElementMap = [['DEUTERIUM']];
    planet.elementAbundance = { DEUTERIUM: 100 };

    mining.mine(0.4);

    expect(player.cargoHold.items.DEUTERIUM).toBe(0.4);
  });

  it('refuses submerged deposits until future equipment exists', () => {
    const { mining, planet } = createMiningHarness();
    planet.isSubmergedSurface = () => true;

    const estimate = mining.getMiningEstimate();

    expect(estimate.canMine).toBe(false);
    expect(estimate.message).toContain('Submerged mining requires future ship equipment');
  });
});
