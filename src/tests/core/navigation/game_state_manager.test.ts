import { describe, expect, it } from 'vitest';
import { GLYPHS, MineralRichness } from '../../../constants';
import { Planet } from '../../../entities/planet';
import { PlanetCharacteristics } from '../../../entities/planet/planet_characteristics_generator';
import { SystemDataGenerator } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';
import { GameStateManager } from '../../../core/game_state_manager';
import { Player } from '../../../core/player';

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
    surfaceTempMin: 252,
    surfaceTempMax: 318,
    hydrosphere: 'Partial oceans',
    lithosphere: 'Silicate crust',
    mineralRichness: MineralRichness.AVERAGE,
    baseMinerals: 120,
    elementAbundance: { Iron: 22, Silicon: 18, Oxygen: 42 },
    magneticFieldStrength: 1.1,
    axialTilt: 0.18,
    tidallyLocked: false,
    rotationPeriodHours: 24.6,
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

  it('relaunches from a moon while keeping the parent planet as the orbital reference', () => {
    const { player, manager } = createManager();
    const parent = createOrbitingPlanet();
    const moon = createOrbitingPlanet();
    parent.moons = [moon];
    moon.systemX = parent.systemX + 1.7e8;
    moon.systemY = parent.systemY - 2.4e8;
    const system = {
      name: 'Moon System',
      getOrbitParentFor: (body: Planet) => (body === moon ? parent : body),
    };
    (manager as any)._changeState('planet', system, moon, null);

    expect(manager.launchFromSurfaceToOrbit()).toBe(true);
    expect(manager.currentPlanet).toBe(moon);
    expect(manager.currentOrbitReferencePlanet).toBe(parent);
    expect(player.position.systemX).toBe(moon.systemX);
    expect(player.position.systemY).toBe(moon.systemY);
  });
});

describe('GameStateManager system entry', () => {
  it('enters from the bottom of a system after upward hyperspace travel', () => {
    const { player, manager } = createManager();
    const system = { edgeRadius: 1000 };
    player.position.lastWorldMoveDx = 0;
    player.position.lastWorldMoveDy = -1;

    (manager as any)._setPlayerStateForSystemEntry(system);

    expect(player.position.systemX).toBeCloseTo(0);
    expect(player.position.systemY).toBeCloseTo(850);
    expect(player.render.directionGlyph).toBe(GLYPHS.SHIP_NORTH);
  });

  it('enters from the right of a system after leftward hyperspace travel', () => {
    const { player, manager } = createManager();
    const system = { edgeRadius: 1000 };
    player.position.lastWorldMoveDx = -1;
    player.position.lastWorldMoveDy = 0;

    (manager as any)._setPlayerStateForSystemEntry(system);

    expect(player.position.systemX).toBeCloseTo(850);
    expect(player.position.systemY).toBeCloseTo(0);
    expect(player.render.directionGlyph).toBe(GLYPHS.SHIP_WEST);
  });

  it('normalizes diagonal hyperspace travel to the same entry distance', () => {
    const { player, manager } = createManager();
    const system = { edgeRadius: 1000 };
    const expectedAxis = -850 / Math.SQRT2;
    player.position.lastWorldMoveDx = 1;
    player.position.lastWorldMoveDy = 1;

    (manager as any)._setPlayerStateForSystemEntry(system);

    expect(player.position.systemX).toBeCloseTo(expectedAxis);
    expect(player.position.systemY).toBeCloseTo(expectedAxis);
    expect(Math.hypot(player.position.systemX, player.position.systemY)).toBeCloseTo(850);
  });
});
