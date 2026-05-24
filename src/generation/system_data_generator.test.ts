import { describe, expect, it } from 'vitest';
import { PRNG } from '../utils/prng';
import { SystemDataGenerator } from './system_data_generator';
import { SolarSystem } from '../entities/solar_system';
import { CONFIG } from '../config';
import { Planet } from '../entities/planet';

function findGeneratedSystem(generator: SystemDataGenerator): { x: number; y: number } {
  for (let y = -80; y <= 80; y++) {
    for (let x = -80; x <= 80; x++) {
      const props = generator.getSystemProperties(x, y);
      if (props.exists) return { x, y };
    }
  }
  throw new Error('Expected at least one generated system in search window.');
}

function createSystem(seed: PRNG, x: number, y: number): SolarSystem {
  const generator = new SystemDataGenerator(seed);
  const props = generator.getSystemProperties(x, y);
  if (!props.exists) throw new Error(`Expected a generated system at ${x},${y}.`);
  return new SolarSystem(props, x, y, seed);
}

function getSystemFingerprint(system: SolarSystem): unknown {
  return {
    name: system.name,
    starType: system.starType,
    ageGyr: Number(system.ageGyr.toFixed(3)),
    metallicityFeH: Number(system.metallicityFeH.toFixed(3)),
    architecture: {
      kind: system.architecture.kind,
      primaryStarId: system.architecture.primaryStarId,
      stars: system.stars.map((star) => ({
        id: star.id,
        type: star.starType,
        mass: Math.round(star.massKg),
        radius: Math.round(star.radiusM),
        orbitRadius: star.orbit ? Math.round(star.orbit.radius) : 0,
      })),
    },
    starbase: system.starbase
      ? {
          name: system.starbase.name,
          orbitDistance: Math.round(system.starbase.orbitDistance),
          orbitAngle: Number(system.starbase.orbitAngle.toFixed(6)),
        }
      : null,
    planets: system.planets.map((planet) =>
      planet
        ? {
            name: planet.name,
            type: planet.type,
            orbitDistance: Math.round(planet.orbitDistance),
            orbitAngle: Number(planet.orbitAngle.toFixed(6)),
            diameter: Number(planet.diameter.toFixed(2)),
            density: Number(planet.density.toFixed(3)),
            gravity: Number(planet.gravity.toFixed(3)),
            surfaceTemp: Math.round(planet.surfaceTemp),
            atmosphere: planet.atmosphere.density,
            hydrosphere: planet.hydrosphere,
            lithosphere: planet.lithosphere,
            moons: planet.moons.map((moon) => ({
              name: moon.name,
              type: moon.type,
              orbitDistance: Math.round(moon.orbitDistance),
              diameter: Number(moon.diameter.toFixed(2)),
              density: Number(moon.density.toFixed(3)),
              gravity: Number(moon.gravity.toFixed(3)),
              surfaceTemp: Math.round(moon.surfaceTemp),
              tidallyLocked: moon.tidallyLocked,
            })),
          }
        : null
    ),
  };
}

function getSurfaceFingerprint(planet: Planet): unknown {
  planet.ensureSurfaceReady();
  const heightmap = planet.heightmap;
  const elementMap = planet.surfaceElementMap;
  if (!heightmap || !elementMap) throw new Error(`Expected solid surface data for ${planet.name}.`);

  const samplePoints = [
    [0, 0],
    [Math.floor(heightmap.length / 3), Math.floor(heightmap.length / 4)],
    [Math.floor(heightmap.length / 2), Math.floor(heightmap.length / 2)],
    [heightmap.length - 1, heightmap.length - 1],
  ];

  return {
    mapSeed: planet.mapSeed,
    heightSamples: samplePoints.map(([x, y]) => heightmap[y][x]),
    elementSamples: samplePoints.map(([x, y]) => elementMap[y][x]),
  };
}

describe('SystemDataGenerator', () => {
  it('returns stable cached system properties and can rebuild them after clearing cache', () => {
    const generator = new SystemDataGenerator(new PRNG('system-cache-regression'));
    const first = generator.getSystemProperties(12, -34);
    const cached = generator.getSystemProperties(12, -34);
    generator.clearCache();
    const rebuilt = generator.getSystemProperties(12, -34);

    expect(cached).toBe(first);
    expect(rebuilt).toEqual(first);
  });

  it('keeps lightweight map properties consistent with full system properties', () => {
    const generator = new SystemDataGenerator(new PRNG('map-properties-regression'));
    const { x, y } = findGeneratedSystem(generator);

    const mapProps = generator.getSystemMapProperties(x, y);
    const fullProps = generator.getSystemProperties(x, y);
    const emptyMap = generator.getSystemMapProperties(x + 1000, y - 1000);
    const emptyFull = generator.getSystemProperties(x + 1000, y - 1000);

    expect(mapProps).toEqual({
      exists: fullProps.exists,
      starType: fullProps.starType,
      name: fullProps.name,
      hasStarbase: fullProps.hasStarbase,
      objectKind: fullProps.objectKind,
    });
    expect(emptyMap.exists).toBe(emptyFull.exists);
    expect(emptyMap.starType).toBe(emptyFull.starType);
    expect(emptyMap.objectKind).toBe(emptyFull.objectKind);
  });

  it('keeps interstellar medium deterministic, cached, and physically bounded', () => {
    const generator = new SystemDataGenerator(new PRNG('medium-cache-regression'));
    const first = generator.getInterstellarMediumProperties(42, -17);
    const cached = generator.getInterstellarMediumProperties(42, -17);
    generator.clearCache();
    const rebuilt = generator.getInterstellarMediumProperties(42, -17);

    expect(cached).toBe(first);
    expect(rebuilt).toEqual(first);
    expect(first.density).toBeGreaterThanOrEqual(0.01);
    expect(first.electronDensity).toBeGreaterThanOrEqual(0.001);
    expect(first.dustExtinction).toBeGreaterThanOrEqual(0);
    expect(first.radiation).toBeGreaterThanOrEqual(0.02);
    expect(first.gravitationalShear).toBeGreaterThanOrEqual(0);
    expect(first.sensorRangeMultiplier).toBeGreaterThanOrEqual(0.58);
    expect(first.sensorRangeMultiplier).toBeLessThanOrEqual(1.18);
    expect(Math.abs(first.driftBiasX)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(first.driftBiasY)).toBeLessThanOrEqual(0.35);
  });

  it('generates varied interstellar medium without depending on visit order', () => {
    const seedLabel = 'haunting beauty';
    const generator = new SystemDataGenerator(new PRNG(seedLabel));
    const sampleCoords = [
      [-180, -120],
      [-80, -20],
      [0, 0],
      [65, 25],
      [140, 90],
      [220, -160],
    ];
    const samples = sampleCoords.map(([x, y]) => generator.getInterstellarMediumProperties(x, y));

    generator.getSystemProperties(4, 9);
    generator.getDeepSpacePhenomenonProperties(-7, 12);
    generator.clearCache();

    const rebuilt = sampleCoords.map(([x, y]) => generator.getInterstellarMediumProperties(x, y));
    expect(rebuilt).toEqual(samples);
    expect(new Set(samples.map((sample) => sample.kind)).size).toBeGreaterThan(1);
  });

  it('generates deterministic stellar evolution properties for systems', () => {
    const firstGenerator = new SystemDataGenerator(new PRNG('system-data-test'));
    const secondGenerator = new SystemDataGenerator(new PRNG('system-data-test'));
    const { x, y } = findGeneratedSystem(firstGenerator);

    const first = firstGenerator.getSystemProperties(x, y);
    const second = secondGenerator.getSystemProperties(x, y);

    expect(first).toEqual(second);
    expect(first.exists).toBe(true);
    expect(first.starType).toMatch(/^([OBAFGKM](\dV)?|[LTY]\d?)$/);
    expect(first.architecture).toBeTruthy();
    expect(first.architecture!.stars.length).toBeGreaterThanOrEqual(1);
    expect(first.architecture!.stars.length).toBeLessThanOrEqual(3);
    expect(first.architecture!.stars[0].starType).toBe(first.starType);
    expect(first.name).toBeTruthy();
    expect(first.ageGyr).toBeGreaterThan(0);
    expect(first.ageGyr).toBeLessThanOrEqual(13.2);
    expect(first.metallicityFeH).toBeGreaterThanOrEqual(-1.75);
    expect(first.metallicityFeH).toBeLessThanOrEqual(0.55);
  });

  it('keeps system generation independent from parent PRNG consumption and visit order', () => {
    const seedLabel = 'order-independent-sector';
    const locator = new SystemDataGenerator(new PRNG(seedLabel));
    const first = findGeneratedSystem(locator);
    let second = first;
    for (let y = first.y; y <= 90 && second.x === first.x && second.y === first.y; y++) {
      for (let x = -90; x <= 90; x++) {
        const props = locator.getSystemProperties(x, y);
        if (props.exists && (x !== first.x || y !== first.y)) {
          second = { x, y };
          break;
        }
      }
    }

    const cleanFirst = createSystem(new PRNG(seedLabel), first.x, first.y);
    const cleanSecond = createSystem(new PRNG(seedLabel), second.x, second.y);

    const gameplayAdvancedSeed = new PRNG(seedLabel);
    gameplayAdvancedSeed.random();
    gameplayAdvancedSeed.randomInt(1, 999);
    gameplayAdvancedSeed.choice(['scan', 'orbit', 'mine']);
    const advancedSecond = createSystem(gameplayAdvancedSeed, second.x, second.y);
    const advancedFirst = createSystem(gameplayAdvancedSeed, first.x, first.y);

    expect(getSystemFingerprint(advancedFirst)).toEqual(getSystemFingerprint(cleanFirst));
    expect(getSystemFingerprint(advancedSecond)).toEqual(getSystemFingerprint(cleanSecond));
  });

  it('keeps surface generation independent from scan/runtime order', () => {
    const seedLabel = 'surface-order-independent-sector';
    const seed = new PRNG(seedLabel);
    const generator = new SystemDataGenerator(seed);

    for (let y = -60; y <= 60; y++) {
      for (let x = -60; x <= 60; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);
        const planetIndex = system.planets.findIndex(
          (planet) => planet && planet.type !== 'GasGiant' && planet.type !== 'IceGiant'
        );
        if (planetIndex === -1) continue;

        const baseline = createSystem(new PRNG(seedLabel), x, y).planets[planetIndex]!;
        const scannedFirst = createSystem(new PRNG(seedLabel), x, y).planets[planetIndex]!;

        scannedFirst.scan();
        scannedFirst.systemPRNG.random();
        scannedFirst.systemPRNG.randomInt(1, 100);

        expect(getSurfaceFingerprint(scannedFirst)).toEqual(getSurfaceFingerprint(baseline));
        return;
      }
    }

    throw new Error('Expected at least one solid planet in representative sector.');
  });

  it('leaves stellar details empty when no system exists', () => {
    const generator = new SystemDataGenerator(new PRNG('system-data-empty-test'));
    let empty = generator.getSystemProperties(0, 0);
    for (let coordinate = 1; empty.exists && coordinate < 200; coordinate++) {
      empty = generator.getSystemProperties(coordinate, -coordinate);
    }

    expect(empty.exists).toBe(false);
    expect(empty.starType).toBeNull();
    expect(empty.architecture).toBeNull();
    expect(empty.ageGyr).toBeNull();
    expect(empty.metallicityFeH).toBeNull();
  });

  it('still produces Jovian worlds across a representative sector', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    const counts: Record<string, number> = {};
    let systems = 0;

    for (let y = -40; y <= 40; y++) {
      for (let x = -40; x <= 40; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        systems++;
        const system = new SolarSystem(props, x, y, seed);
        for (const planet of system.planets) {
          if (!planet) continue;
          counts[planet.type] = (counts[planet.type] ?? 0) + 1;
        }
      }
    }

    expect(systems).toBeGreaterThan(0);
    expect(counts.GasGiant ?? 0).toBeGreaterThan(0);
    expect((counts.GasGiant ?? 0) + (counts.IceGiant ?? 0)).toBeGreaterThan(5);
  });

  it('keeps sector-level discovery pacing within playable bounds', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let systems = 0;
    let ordinarySystems = 0;
    let brownDwarfSystems = 0;
    let starbases = 0;
    let systemsWithPlanets = 0;
    let planets = 0;
    let giants = 0;
    const sectorCells = 101 * 101;

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        systems++;
        if (props.objectKind === 'brown-dwarf') brownDwarfSystems++;
        else ordinarySystems++;
        if (props.hasStarbase) starbases++;
        const system = new SolarSystem(props, x, y, seed);
        const systemPlanets = system.planets.filter((planet) => planet !== null);
        if (systemPlanets.length > 0) systemsWithPlanets++;
        planets += systemPlanets.length;
        giants += systemPlanets.filter((planet) => planet.type === 'GasGiant' || planet.type === 'IceGiant').length;
      }
    }

    const ordinaryStarDensity = ordinarySystems / sectorCells;
    const brownDwarfDensity = brownDwarfSystems / sectorCells;
    const starbaseRate = starbases / ordinarySystems;
    const averagePlanets = planets / systems;
    const giantRate = giants / planets;

    expect(ordinaryStarDensity).toBeGreaterThan(CONFIG.STAR_DENSITY * 0.65);
    expect(ordinaryStarDensity).toBeLessThan(CONFIG.STAR_DENSITY * 1.35);
    expect(brownDwarfDensity).toBeGreaterThan(CONFIG.BROWN_DWARF_DENSITY * 0.45);
    expect(brownDwarfDensity).toBeLessThan(CONFIG.BROWN_DWARF_DENSITY * 1.55);
    expect(starbaseRate).toBeGreaterThan(0.005);
    expect(starbaseRate).toBeLessThan(0.075);
    expect(systemsWithPlanets).toBe(systems);
    expect(averagePlanets).toBeGreaterThan(2.5);
    expect(averagePlanets).toBeLessThan(7.5);
    expect(giantRate).toBeGreaterThan(0.08);
    expect(giantRate).toBeLessThan(0.45);
  });

  it('generates deterministic faint brown-dwarf systems with controlled local frequency', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let brownDwarfs = 0;
    let ordinaryStars = 0;

    for (let y = -60; y <= 60; y++) {
      for (let x = -60; x <= 60; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        if (props.objectKind === 'brown-dwarf') {
          brownDwarfs++;
          expect(props.starType).toMatch(/^[LTY]\d?$/);
          expect(props.hasStarbase).toBe(false);
          const rebuilt = new SystemDataGenerator(new PRNG('haunting beauty')).getSystemProperties(x, y);
          expect(rebuilt).toEqual(props);
        } else {
          ordinaryStars++;
        }
      }
    }

    expect(brownDwarfs).toBeGreaterThan(30);
    expect(brownDwarfs).toBeLessThan(120);
    expect(ordinaryStars).toBeGreaterThan(60);
  });

  it('keeps deep-space phenomena rare and visit-order deterministic', () => {
    const seedLabel = 'haunting beauty';
    const generator = new SystemDataGenerator(new PRNG(seedLabel));
    const counts: Record<string, number> = {};
    let total = 0;

    for (let y = -120; y <= 120; y++) {
      for (let x = -120; x <= 120; x++) {
        const phenomenon = generator.getDeepSpacePhenomenonProperties(x, y);
        if (!phenomenon.exists) continue;
        total++;
        counts[phenomenon.type!] = (counts[phenomenon.type!] ?? 0) + 1;
        const rebuilt = new SystemDataGenerator(new PRNG(seedLabel)).getDeepSpacePhenomenonProperties(x, y);
        expect(rebuilt).toEqual(phenomenon);
      }
    }

    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(45);
    expect(counts['ancient-signal'] ?? 0).toBeLessThanOrEqual(8);
    expect(counts['debris-field'] ?? 0).toBeLessThanOrEqual(3);
  });

  it('keeps moon systems plausible for parent type and stellar heating', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let giantWithMoons = false;

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);

        for (const planet of system.planets) {
          if (!planet) continue;
          const isGiant = planet.type === 'GasGiant' || planet.type === 'IceGiant';
          const maxMoons = planet.type === 'GasGiant' ? 24 : planet.type === 'IceGiant' ? 14 : 3;
          expect(planet.moons.length).toBeLessThanOrEqual(maxMoons);
          if (planet.surfaceTemp > 390 || planet.orbitDistance < 0.35 * 1.495978707e11) {
            expect(planet.moons.length).toBeLessThanOrEqual(isGiant ? 5 : 1);
          }
          if (isGiant && planet.moons.length >= 4) giantWithMoons = true;
          for (const moon of planet.moons) {
            expect(moon.diameter).toBeLessThan(planet.diameter * (isGiant ? 0.1 : 0.35));
          }
        }
      }
    }

    expect(giantWithMoons).toBe(true);
  });

  it('resolves moon orbital insertion to the parent planet context', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);
        const parent = system.planets.find((planet) => planet && planet.moons.length > 0);
        const moon = parent?.moons[0];
        if (!parent || !moon) continue;

        expect(system.getOrbitParentFor(parent)).toBe(parent);
        expect(system.getOrbitParentFor(moon)).toBe(parent);
        return;
      }
    }

    throw new Error('Expected at least one moon-bearing planet in representative sector.');
  });

  it('resolves moon proximity scans to the parent planet', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);

    for (let y = -50; y <= 50; y++) {
      for (let x = -50; x <= 50; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);
        const parent = system.planets.find((planet) => planet && planet.moons.length > 0);
        const moon = parent?.moons[0];
        if (!parent || !moon) continue;

        expect(system.getObjectNear(moon.systemX, moon.systemY)).toBe(moon);
        expect(system.getScannableObjectNear(moon.systemX, moon.systemY)).toBe(parent);
        return;
      }
    }

    throw new Error('Expected at least one moon-bearing planet in representative sector.');
  });

  it('generates regular giant-planet moons with tidal locking and low obliquity', () => {
    const seed = new PRNG('haunting beauty');
    const generator = new SystemDataGenerator(seed);
    let checkedRegularGiantMoon = false;
    let checkedCapturedLikeMoon = false;

    for (let y = -60; y <= 60; y++) {
      for (let x = -60; x <= 60; x++) {
        const props = generator.getSystemProperties(x, y);
        if (!props.exists) continue;
        const system = new SolarSystem(props, x, y, seed);

        for (const parent of system.planets) {
          if (!parent || (parent.type !== 'GasGiant' && parent.type !== 'IceGiant')) continue;
          const parentRadiusM = parent.diameter * 500;
          for (const moon of parent.moons) {
            const orbitInParentRadii = moon.orbitDistance / parentRadiusM;
            if (orbitInParentRadii < 80) {
              checkedRegularGiantMoon = true;
              expect(moon.tidallyLocked).toBe(true);
              expect((moon.axialTilt * 180) / Math.PI).toBeLessThanOrEqual(4);
              expect((moon.orbitalInclination * 180) / Math.PI).toBeLessThanOrEqual(3);
            } else if (orbitInParentRadii > 250) {
              checkedCapturedLikeMoon = true;
              expect(moon.diameter).toBeLessThan(parent.diameter * 0.1);
            }
          }
        }
      }
    }

    expect(checkedRegularGiantMoon).toBe(true);
    expect(checkedCapturedLikeMoon).toBe(true);
  });
});
