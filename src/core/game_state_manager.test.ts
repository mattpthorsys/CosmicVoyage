import { describe, expect, it } from 'vitest';
import { MineralRichness } from '../constants';
import { Planet } from '../entities/planet';
import { PlanetCharacteristics } from '../entities/planet/planet_characteristics_generator';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import { GameStateManager } from './game_state_manager';
import { Player } from './player';

function createCharacteristics(): PlanetCharacteristics {
  return {
    diameter: 11200,
    density: 5.2,
    gravity: 1.02,
    mass: 6.8e24,
    escapeVelocity: 11400,
    atmosphere: {
      density: 'Standard',
      pressure: 1.1,
      composition: { Nitrogen: 74, Oxygen: 21, Argon: 5 },
    },
    surfaceTemp: 286,
    hydrosphere: 'Partial oceans',
    lithosphere: 'Silicate crust',
    mineralRichness: MineralRichness.AVERAGE,
    baseMinerals: 120,
    elementAbundance: { Iron: 22, Silicon: 18, Oxygen: 42 },
    magneticFieldStrength: 1.1,
    axialTilt: 0.18,
    tidallyLocked: false,
    orbitalInclination: 0.02,
  };
}

function createOrbitingPlanet(): Planet {
  return new Planet(
    'Moving Test',
    'Rock',
    1.2e11,
    0.5,
    new PRNG('moving-test-system'),
    'G2V',
    createCharacteristics(),
    { starType: 'G2V', ageGyr: 4.8, metallicityFeH: 0.02 }
  );
}

function createManager() {
  const player = new Player();
  const seed = new PRNG('state-manager-test');
  const manager = new GameStateManager(player, seed, new SystemDataGenerator(seed));
  const system = { name: 'Test System' };
  return { player, manager, system };
}

describe('GameStateManager orbital exits', () => {
  it('breaks orbit at the orbiting body current coordinates', () => {
    const { player, manager, system } = createManager();
    const planet = createOrbitingPlanet();
    (manager as any)._changeState('orbit', system, planet, null);

    planet.systemX = 8.4e10;
    planet.systemY = -3.1e10;
    player.position.systemX = 0;
    player.position.systemY = 0;

    expect(manager.leaveOrbit()).toBe(true);
    expect(player.position.systemX).toBe(planet.systemX);
    expect(player.position.systemY).toBe(planet.systemY);
  });

  it('lifts off at the landed body current coordinates', () => {
    const { player, manager, system } = createManager();
    const planet = createOrbitingPlanet();
    (manager as any)._changeState('planet', system, planet, null);

    planet.systemX = -5.6e10;
    planet.systemY = 2.7e10;
    player.position.systemX = 0;
    player.position.systemY = 0;

    expect(manager.liftOff()).toBe(true);
    expect(player.position.systemX).toBe(planet.systemX);
    expect(player.position.systemY).toBe(planet.systemY);
  });
});
