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

function createGridMiningHarness(surfaceElementMap: string[][]): { mining: any; player: Player; planet: any } {
  const harness = createMiningHarness();
  const minedAmounts = new Map<string, number>();
  const depletedSites = new Set<string>();
  harness.planet.surfaceElementMap = surfaceElementMap;
  harness.planet.elementAbundance = { IRON: 100, DEUTERIUM: 100 };
  harness.planet.lastMinedSite = '';
  harness.planet.isMined = (x: number, y: number) => depletedSites.has(`${x},${y}`);
  harness.planet.getMinedAmount = (x: number, y: number) => minedAmounts.get(`${x},${y}`) ?? 0;
  harness.planet.recordMinedAmount = (x: number, y: number, amount: number, totalYield: number) => {
    const key = `${x},${y}`;
    harness.planet.lastMinedSite = key;
    const nextAmount = (minedAmounts.get(key) ?? 0) + amount;
    minedAmounts.set(key, nextAmount);
    if (nextAmount >= totalYield) depletedSites.add(key);
  };
  harness.planet.markMined = (x: number, y: number) => depletedSites.add(`${x},${y}`);
  harness.player.position.surfaceX = 1;
  harness.player.position.surfaceY = 1;
  return harness;
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

  it('mines deposits in adjacent terrain cells', () => {
    const { mining, player, planet } = createGridMiningHarness([
      ['', '', ''],
      ['', '', 'IRON'],
      ['', '', ''],
    ]);

    mining.mine(0.2);

    expect(player.cargoHold.items.IRON).toBe(0.2);
    expect(planet.lastMinedSite).toBe('2,1');
  });

  it('prefers the current terrain cell before adjacent cells', () => {
    const { mining, player, planet } = createGridMiningHarness([
      ['', '', ''],
      ['', 'IRON', 'DEUTERIUM'],
      ['', '', ''],
    ]);

    mining.mine(0.2);

    expect(player.cargoHold.items.IRON).toBe(0.2);
    expect(player.cargoHold.items.DEUTERIUM).toBeUndefined();
    expect(planet.lastMinedSite).toBe('1,1');
  });

  it('reports all reachable adjacent mining options', () => {
    const { mining } = createGridMiningHarness([
      ['DEUTERIUM', '', ''],
      ['', 'IRON', 'DEUTERIUM'],
      ['', '', ''],
    ]);

    const options = mining.getMiningOptions();

    expect(options.map((option: any) => `${option.elementKey}@${option.x},${option.y}`)).toEqual([
      'IRON@1,1',
      'DEUTERIUM@0,0',
      'DEUTERIUM@2,1',
    ]);
  });
});
