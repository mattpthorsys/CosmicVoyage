import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../config';
import { COLONY_WORLD_NAMES } from '../../../constants/colony_names';
import { SPECTRAL_TYPES } from '../../../constants/stellar';
import { AU_IN_METERS } from '../../../constants/physics';
import {
  calculateStellarLuminosityW,
  StellarArchitecture,
  StellarBody,
} from '../../../entities/stellar_body';
import {
  assessStellarHost,
  calculateHabitableZone,
  isBreathableTerraformingProfile,
  isInsideHabitableFluxZone,
} from '../../../entities/habitability';
import { SolarSystem } from '../../../entities/solar_system';
import { SystemDataGenerator, SystemMapProperties } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';
import { sufficientlySeparated } from '../../../entities/satellite_physics';

/** Creates a single-star architecture for isolated host and HZ tests. */
function createSingleStarArchitecture(starType: string, ageGyr: number): StellarArchitecture {
  const info = SPECTRAL_TYPES[starType];
  const star: StellarBody = {
    id: 'A',
    name: `Test ${starType}`,
    starType,
    massKg: info.mass,
    radiusM: info.radius,
    luminosityW: calculateStellarLuminosityW(starType),
    systemX: 0,
    systemY: 0,
    orbit: null,
    environment: { starType, ageGyr, metallicityFeH: 0 },
  };
  return {
    kind: 'single',
    stars: [star],
    primaryStarId: 'A',
    binarySeparation: 0,
    outerSeparation: 0,
    habitableLabel: 'A',
  };
}

/** Finds a generated map contact matching a station predicate within a bounded rectangle. */
function findStation(
  generator: SystemDataGenerator,
  startX: number,
  endX: number,
  radiusY: number,
  predicate: (properties: SystemMapProperties) => boolean
): { x: number; y: number; properties: SystemMapProperties } {
  for (let x = startX; x <= endX; x++) {
    for (let y = -radiusY; y <= radiusY; y++) {
      const properties = generator.getSystemMapProperties(x, y);
      if (predicate(properties)) return { x, y, properties };
    }
  }
  throw new Error('No deterministic station candidate found inside the bounded test region.');
}

/** Converts a generation-two cell range into current scale-preserving map cells. */
function scaleReferenceCells(cells: number): number {
  return Math.round(cells * CONFIG.HYPERSPACE_CELL_LINEAR_SCALE);
}

describe('habitability and human settlement', () => {
  it('uses local companion distances instead of pretending a multiple system has one radial HZ', () => {
    const architecture = createSingleStarArchitecture('G2V', 4.6);
    architecture.kind = 'triple';
    const b = createSingleStarArchitecture('G2V', 4.6).stars[0];
    b.id = 'B';
    b.systemX = -0.1 * AU_IN_METERS;
    const c = createSingleStarArchitecture('K2V', 4.6).stars[0];
    c.id = 'C';
    c.systemX = 40 * AU_IN_METERS;
    architecture.stars.push(b, c);
    const cZone = calculateHabitableZone({ ...architecture, kind: 'single', stars: [c] })!;
    const position = { systemX: c.systemX + cZone.preferredAu * AU_IN_METERS, systemY: 0 };
    expect(calculateHabitableZone(architecture)).toBeNull();
    expect(isInsideHabitableFluxZone(position, architecture)).toBe(true);
    c.systemX += 20 * AU_IN_METERS;
    expect(isInsideHabitableFluxZone(position, architecture)).toBe(false);
    expect(assessStellarHost(architecture, { kind: 'circumstellar', starId: 'C' }).reasons).toContain(
      'quiet, long-lived K-class host'
    );
  });

  it('adds both stellar fluxes and rejects unsupported spectral fits rather than extrapolating', () => {
    const architecture = createSingleStarArchitecture('G2V', 4.6);
    const position = { systemX: 1.3 * AU_IN_METERS, systemY: 0 };
    expect(isInsideHabitableFluxZone(position, architecture)).toBe(true);
    architecture.kind = 'binary';
    const b = { ...architecture.stars[0], id: 'B' as const };
    architecture.stars.push(b);
    expect(isInsideHabitableFluxZone(position, architecture)).toBe(false);
    b.starType = 'O';
    expect(isInsideHabitableFluxZone({ systemX: 100 * AU_IN_METERS, systemY: 0 }, architecture)).toBe(false);
  });

  it('materializes the nearest starting hub with a named habitable colony and major starbase', () => {
    const seed = new PRNG('starting-hub-invariant');
    const generator = new SystemDataGenerator(seed);
    const hubX = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
    const hubY = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
    const properties = generator.getSystemProperties(hubX, hubY);
    const system = new SolarSystem(properties, hubX, hubY, seed);
    const zone = calculateHabitableZone(system.architecture)!;
    const orbitAu = system.colonyWorld!.orbitDistance / AU_IN_METERS;

    expect(system.starType).toBe('G2V');
    expect(system.architecture.kind).toBe('single');
    expect(system.colonyWorld?.terraforming?.stage).toBe('complete');
    expect(COLONY_WORLD_NAMES).toContain(system.colonyWorld?.name);
    expect(system.colonyWorld?.catalogueName).not.toBe(system.colonyWorld?.name);
    expect(system.starbase?.kind).toBe('starbase');
    expect(system.starbase?.colonyWorldName).toBe(system.colonyWorld?.name);
    const station = system.starbase!;
    const colony = system.colonyWorld!;
    expect(station.orbitHost).toEqual(colony.orbitHost);
    expect(station.orbitDistance).toBe(colony.orbitDistance);
    expect(Math.abs(station.coorbitalAngleOffset!)).toBeCloseTo(Math.PI / 3, 12);
    for (const elapsed of [1, 100, 1000]) {
      system.updateOrbits(elapsed);
      expect(station.orbitAngle).toBeCloseTo(
        (colony.orbitAngle + station.coorbitalAngleOffset! + 2 * Math.PI) % (2 * Math.PI),
        12
      );
      expect(
        Math.hypot(station.systemX - colony.systemX, station.systemY - colony.systemY) / AU_IN_METERS
      ).toBeCloseTo(colony.orbitDistance / AU_IN_METERS, 10);
    }
    expect(orbitAu).toBeGreaterThanOrEqual(zone.innerAu);
    expect(orbitAu).toBeLessThanOrEqual(zone.outerAu);
    for (const planet of system.planets) {
      if (!planet || planet === system.colonyWorld) continue;
      expect(sufficientlySeparated(planet, system.colonyWorld!, system.stars[0].massKg)).toBe(true);
    }
  });

  it('places a Solar analogue conservative HZ near one AU', () => {
    const zone = calculateHabitableZone(createSingleStarArchitecture('G2V', 4.6));

    expect(zone).not.toBeNull();
    expect(zone!.innerAu).toBeGreaterThan(0.9);
    expect(zone!.innerAu).toBeLessThan(1.15);
    expect(zone!.outerAu).toBeGreaterThan(1.5);
    expect(zone!.outerAu).toBeLessThan(1.9);
  });

  it('prefers stable K/G hosts and rejects short-lived A stars for complete terraforming', () => {
    const kHost = assessStellarHost(createSingleStarArchitecture('K2V', 5.2));
    const gHost = assessStellarHost(createSingleStarArchitecture('G8V', 4.8));
    const aHost = assessStellarHost(createSingleStarArchitecture('A', 0.7));

    expect(kHost.eligibleForCompleteTerraforming).toBe(true);
    expect(gHost.eligibleForCompleteTerraforming).toBe(true);
    expect(aHost.eligibleForCompleteTerraforming).toBe(false);
    expect(kHost.score).toBeGreaterThan(aHost.score);
  });

  it('never materializes a major starbase without a completed breathable colony world', () => {
    const seed = new PRNG('major-starbase-invariant');
    const generator = new SystemDataGenerator(seed);
    const located = findStation(
      generator,
      scaleReferenceCells(-90),
      scaleReferenceCells(90),
      scaleReferenceCells(90),
      (properties) => properties.stationKind === 'starbase'
    );
    const systemProperties = generator.getSystemProperties(located.x, located.y);
    const system = new SolarSystem(systemProperties, located.x, located.y, seed);

    expect(system.starbase?.kind).toBe('starbase');
    expect(system.colonyWorld?.terraforming?.stage).toBe('complete');
    expect(system.starbase?.colonyWorldName).toBe(system.colonyWorld?.name);
    expect(isBreathableTerraformingProfile(system.colonyWorld!.terraforming!)).toBe(true);
    expect(system.colonyWorld?.effectiveAtmosphere.density).toBe('Earth-like');
    expect(system.colonyWorld?.effectiveHydrosphere).toContain('managed surface water');
    const zone = calculateHabitableZone(system.architecture)!;
    const orbitAu = system.colonyWorld!.orbitDistance / AU_IN_METERS;
    expect(orbitAu).toBeGreaterThanOrEqual(zone.innerAu);
    expect(orbitAu).toBeLessThanOrEqual(zone.outerAu);
    expect(system.colonyWorld!.terraforming!.hydrosphereFraction).toBeGreaterThanOrEqual(0.48);
  });

  it('materializes frontier partial-terraforming projects without inventing a major starbase', () => {
    const seed = new PRNG('frontier-terraforming-invariant');
    const generator = new SystemDataGenerator(seed);
    const located = findStation(
      generator,
      scaleReferenceCells(980),
      scaleReferenceCells(1320),
      scaleReferenceCells(80),
      (properties) => properties.settlementStage === 'partial'
    );
    const systemProperties = generator.getSystemProperties(located.x, located.y);
    const system = new SolarSystem(systemProperties, located.x, located.y, seed);

    expect(system.settlementStage).toBe('partial');
    expect(system.colonyWorld?.terraforming?.stage).toBe('partial');
    expect(system.starbase).toBeNull();
    expect(system.colonyWorld?.terraforming?.engineeringSupport).toContain('sealed settlements');
    const zone = calculateHabitableZone(system.architecture)!;
    const orbitAu = system.colonyWorld!.orbitDistance / AU_IN_METERS;
    expect(orbitAu).toBeGreaterThanOrEqual(zone.innerAu);
    expect(orbitAu).toBeLessThanOrEqual(zone.outerAu);
    expect(system.colonyWorld!.terraforming!.hydrosphereFraction).toBeGreaterThanOrEqual(0.18);
  });

  it('creates sparse remote automated depots with deliberately limited services', () => {
    const seed = new PRNG('remote-depot-invariant');
    const generator = new SystemDataGenerator(seed);
    const located = findStation(
      generator,
      scaleReferenceCells(1850),
      scaleReferenceCells(2050),
      scaleReferenceCells(90),
      (properties) => properties.stationKind === 'automated-depot'
    );
    const systemProperties = generator.getSystemProperties(located.x, located.y);
    const system = new SolarSystem(systemProperties, located.x, located.y, seed);

    expect(system.starbase?.kind).toBe('automated-depot');
    expect(system.starbase?.capabilities.fuel).toBe(true);
    expect(system.starbase?.capabilities.repairs).toBe('basic');
    expect(system.starbase?.capabilities.missions).toBe(false);
    expect(system.starbase?.capabilities.crew).toBe(false);
    expect(system.starbase?.capabilities.shipyard).toBe(false);
    expect(system.colonyWorld).toBeNull();
  });
});
