// src/entities/solar_system.ts
// Complete file incorporating MKS units, meter distances, 4hr=1yr timescale, and moons.

import { CONFIG } from '../config';
// Import constants including G and updated SPECTRAL_TYPES
import { AU_IN_METERS, GRAVITATIONAL_CONSTANT_G, SOLAR_MASS_KG } from '../constants/physics';
import { MineralRichness } from '../constants/planetary';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { PRNG } from '../utils/prng';
import { Planet } from './planet'; // Assuming Planet class has mass, escapeVelocity, axialTilt, moons properties
import { Starbase } from './starbase';
import { logger } from '../utils/logger';
import { calculateGravity } from '../entities/planet/physical_generator';
import {
  generateRotationPeriodHours,
  generateAxialTiltRad,
  generatePlanetCharacteristics,
  PlanetCharacteristics,
} from '../entities/planet/planet_characteristics_generator';
import { createTemperatureProfileFromAverage } from '../entities/planet/temperature_calculator';
import { SystemBasicProperties } from '@/generation/system_data_generator';
import { StellarEnvironment, getDefaultStellarEnvironment } from './stellar_environment';
import {
  getHostLabel,
  getPrimaryStar,
  OrbitHost,
  StellarArchitecture,
  StellarBody,
} from './stellar_body';

export class SolarSystem {
  // --- Constants --- (No longer needed here if defined globally)
  // private static readonly BASE_ORBITAL_CONSTANT = 5e2; // Removed - using physics now

  readonly starX: number; // World coordinate X
  readonly starY: number; // World coordinate Y
  readonly systemPRNG: PRNG; // PRNG seeded specifically for this system
  readonly starType: string; // e.g., 'G', 'M', 'A'
  readonly architecture: StellarArchitecture;
  readonly stars: StellarBody[];
  readonly name: string; // Procedurally generated name
  readonly ageGyr: number;
  readonly metallicityFeH: number;
  readonly stellarEnvironment: StellarEnvironment;
  readonly planets: (Planet | null)[]; // Array for planets (includes moons nested)
  readonly starbase: Starbase | null; // Optional starbase
  readonly edgeRadius: number; // System boundary radius in meters
  readonly isStarless: boolean;
  private static readonly SIMULATED_SECONDS_PER_REAL_SECOND = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);

  constructor(basicProps: SystemBasicProperties, starX: number, starY: number, gameSeedPRNG: PRNG) {
    this.starX = starX;
    this.starY = starY;
    const starSeed = `star_${starX},${starY}`;
    this.systemPRNG = gameSeedPRNG.seedNew(starSeed);
    logger.debug(`[System:${starX},${starY}] Initialized PRNG with seed: ${this.systemPRNG.getInitialSeed()}`);

    this.architecture = basicProps.architecture ?? this.createFallbackArchitecture(basicProps);
    this.stars = this.architecture.stars;
    this.isStarless = this.architecture.kind === 'starless' || basicProps.objectKind === 'rogue-planet';
    if (!this.isStarless) {
      this.configureStellarOrbits();
      this.updateStarPositions(0);
    }
    const primaryStar = this.stars.length > 0 ? getPrimaryStar(this.architecture) : null;
    this.starType = primaryStar?.starType ?? 'ROGUE';
    this.name = basicProps.name!;
    const fallbackEnvironment = primaryStar?.environment ?? {
      starType: 'ROGUE',
      ageGyr: basicProps.ageGyr ?? 5.0,
      metallicityFeH: basicProps.metallicityFeH ?? 0,
    };
    this.ageGyr = basicProps.ageGyr ?? fallbackEnvironment.ageGyr;
    this.metallicityFeH = basicProps.metallicityFeH ?? fallbackEnvironment.metallicityFeH;
    this.stellarEnvironment = fallbackEnvironment;

    logger.info(
      `[System:${this.name}] Created ${this.architecture.kind} system at world [${this.starX},${this.starY}]. Primary: ${this.starType}, Age: ${this.ageGyr} Gyr, [Fe/H]: ${this.metallicityFeH}.`
    );

    this.planets = new Array(CONFIG.MAX_PLANETS_PER_SYSTEM).fill(null);

    // Generate starbase first (its orbit distance is fixed in config)
    this.starbase =
      basicProps.hasStarbase && !this.isStarless
        ? // Pass systemPRNG to Starbase constructor
          new Starbase(this.name, this.systemPRNG, this.name)
        : null;

    if (this.starbase) {
      // Ensure starbase orbitDistance is treated as meters
      logger.info(
        `[System:${this.name}] Starbase generated at orbit distance ${this.starbase.orbitDistance.toExponential(2)}m.`
      );
    }

    // Generate planets and their moons
    if (this.isStarless) {
      this.generateRoguePlanetaryMassObject();
    } else {
      this.generatePlanets(); // Uses meter-based distances now
    }

    // Calculate edge radius based on furthest object (planet or starbase)
    let maxOrbit_m = 0;
    this.planets.forEach((p) => {
      if (p) {
        maxOrbit_m = Math.max(maxOrbit_m, p.orbitDistance, Math.sqrt(p.systemX * p.systemX + p.systemY * p.systemY));
        // Also consider furthest moon orbit relative to star (approx)
        if (p.moons && p.moons.length > 0) {
          const furthestMoonOrbit = p.moons.reduce((max, moon) => Math.max(max, moon.orbitDistance), 0);
          maxOrbit_m = Math.max(maxOrbit_m, p.orbitDistance + furthestMoonOrbit); // Approximate max extent
        }
      }
    });
    if (this.starbase) {
      maxOrbit_m = Math.max(maxOrbit_m, this.starbase.orbitDistance);
    }
    this.stars.forEach((star) => {
      maxOrbit_m = Math.max(maxOrbit_m, Math.sqrt(star.systemX * star.systemX + star.systemY * star.systemY));
      if (star.orbit) maxOrbit_m = Math.max(maxOrbit_m, star.orbit.radius);
    });

    logger.debug(`[System:${this.name}] Furthest object orbit distance: ${maxOrbit_m.toExponential(2)}m`);
    // Ensure a minimum size even if no objects generated far out
    this.edgeRadius = this.isStarless
      ? Math.max(0.08 * AU_IN_METERS, maxOrbit_m * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR)
      : Math.max(5 * AU_IN_METERS, maxOrbit_m * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR); // Min edge 5 AU
    logger.debug(
      `[System:${this.name}] System edge radius calculated: ${this.edgeRadius.toExponential(2)}m (Factor: ${
        CONFIG.SYSTEM_EDGE_RADIUS_FACTOR
      })`
    );
  }

  /** Generates a procedural name for the system. */
  private generateSystemName(): string {
    logger.debug(`[System] Generating system name...`);
    const prefixes = [
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      'Epsilon',
      'Zeta',
      'Eta',
      'Theta',
      'Iota',
      'Kappa',
      'Lambda',
      'Mu',
      'Nu',
      'Xi',
      'Omicron',
      'Pi',
      'Rho',
      'Sigma',
      'Tau',
      'Upsilon',
      'Phi',
      'Chi',
      'Psi',
      'Omega',
      'Proxima',
      'Cygnus',
      'Kepler',
      'Gliese',
      'HD',
      'Trappist',
      'Luyten',
      'Wolf',
      'Ross',
      'Barnard',
      'Benfblunk',
      'Harwoe',
      'Smerg',
      'Hiss',
    ];
    const number = this.systemPRNG.randomInt(1, 999);
    const suffix = String.fromCharCode(65 + this.systemPRNG.randomInt(0, 25)); // A-Z
    const name = `${this.systemPRNG.choice(prefixes)}-${number}${suffix}`;
    logger.debug(`[System] Generated name: ${name}`);
    return name;
  }

  private createFallbackArchitecture(basicProps: SystemBasicProperties): StellarArchitecture {
    if (basicProps.objectKind === 'rogue-planet') {
      return {
        kind: 'starless',
        stars: [],
        primaryStarId: 'A',
        binarySeparation: 0,
        outerSeparation: 0,
        habitableLabel: 'none',
      };
    }
    const starType = basicProps.starType ?? 'G';
    const environment = {
      starType,
      ageGyr: basicProps.ageGyr ?? getDefaultStellarEnvironment(starType).ageGyr,
      metallicityFeH: basicProps.metallicityFeH ?? 0,
    };
    const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES.G;
    return {
      kind: 'single',
      stars: [
        {
          id: 'A',
          name: `${basicProps.name ?? 'Unnamed'} A`,
          starType,
          massKg: starInfo.mass,
          radiusM: starInfo.radius,
          luminosityW: this.calculateStarLuminosity(starType, environment),
          systemX: 0,
          systemY: 0,
          orbit: null,
          environment,
        },
      ],
      primaryStarId: 'A',
      binarySeparation: 0,
      outerSeparation: 0,
      habitableLabel: 'A',
    };
  }

  private calculateStarLuminosity(starType: string, _environment: StellarEnvironment): number {
    const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES.G;
    const sigma = 5.670374419e-8;
    return 4 * Math.PI * Math.pow(starInfo.radius, 2) * sigma * Math.pow(starInfo.temp, 4);
  }

  private configureStellarOrbits(): void {
    if (this.stars.length < 2) return;
    const primary = this.stars.find((star) => star.id === 'A');
    const secondary = this.stars.find((star) => star.id === 'B');
    if (!primary || !secondary) return;

    const separation = Math.max(0.05 * AU_IN_METERS, this.architecture.binarySeparation);
    const totalMass = primary.massKg + secondary.massKg;
    const baseAngle = secondary.orbit?.angle ?? 0;
    const periodSeconds = this.calculateKeplerPeriodSeconds(separation, totalMass);
    primary.orbit = {
      center: 'barycenter',
      radius: separation * (secondary.massKg / totalMass),
      angle: baseAngle + Math.PI,
      periodSeconds,
    };
    secondary.orbit = {
      center: 'barycenter',
      radius: separation * (primary.massKg / totalMass),
      angle: baseAngle,
      periodSeconds,
    };

    const tertiary = this.stars.find((star) => star.id === 'C');
    if (tertiary) {
      const outerSeparation = Math.max(separation * 5, this.architecture.outerSeparation);
      const outerTotalMass = totalMass + tertiary.massKg;
      tertiary.orbit = {
        center: 'barycenter',
        radius: outerSeparation * (totalMass / outerTotalMass),
        angle: tertiary.orbit?.angle ?? baseAngle + Math.PI / 2,
        periodSeconds: this.calculateKeplerPeriodSeconds(outerSeparation, outerTotalMass),
      };
    }
  }

  private updateStarPositions(deltaTime: number): void {
    const scaledDeltaTime = this.getScaledOrbitalDeltaTime(deltaTime);
    for (const star of this.stars) {
      if (!star.orbit) {
        star.systemX = 0;
        star.systemY = 0;
        continue;
      }
      if (scaledDeltaTime > 0 && star.orbit.periodSeconds > 0) {
        star.orbit.angle = (star.orbit.angle + (2 * Math.PI * scaledDeltaTime) / star.orbit.periodSeconds) % (Math.PI * 2);
      }
      star.systemX = Math.cos(star.orbit.angle) * star.orbit.radius;
      star.systemY = Math.sin(star.orbit.angle) * star.orbit.radius;
    }
  }

  private getScaledOrbitalDeltaTime(deltaTime: number): number {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return 0;
    return deltaTime * SolarSystem.SIMULATED_SECONDS_PER_REAL_SECOND;
  }

  private calculateKeplerPeriodSeconds(orbitRadius_m: number, centralMass_kg: number): number {
    if (!Number.isFinite(orbitRadius_m) || orbitRadius_m <= 0 || !Number.isFinite(centralMass_kg) || centralMass_kg <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return 2 * Math.PI * Math.sqrt(Math.pow(orbitRadius_m, 3) / (GRAVITATIONAL_CONSTANT_G * centralMass_kg));
  }

  private calculatePlanetTidalRotation(
    planetType: string,
    orbitDistance_m: number,
    hostMass_kg: number,
    ageGyr: number,
    prng: PRNG
  ): { tidallyLocked: boolean; rotationPeriodHours?: number } {
    if (!Number.isFinite(orbitDistance_m) || orbitDistance_m <= 0 || !Number.isFinite(hostMass_kg) || hostMass_kg <= 0) {
      return { tidallyLocked: false };
    }

    const orbitAU = orbitDistance_m / AU_IN_METERS;
    const hostMassSolar = hostMass_kg / SOLAR_MASS_KG;
    const bodyCoupling =
      planetType === 'GasGiant' || planetType === 'IceGiant' ? 0.35 :
      planetType === 'Lunar' || planetType === 'Molten' ? 1.35 :
      planetType === 'Oceanic' ? 1.15 :
      1;
    const ageFactor = Math.max(0.08, ageGyr) / 4.6;
    const tidalScore = ageFactor * Math.pow(hostMassSolar, 2) * Math.pow(0.12 / Math.max(0.015, orbitAU), 6) * bodyCoupling;
    const lockProbability = this.clamp((Math.log10(Math.max(1e-5, tidalScore)) + 1.0) / 2.4, 0, 0.98);
    const tidallyLocked = prng.random() < lockProbability;
    if (!tidallyLocked) return { tidallyLocked: false };

    const periodHours = this.calculateKeplerPeriodSeconds(orbitDistance_m, hostMass_kg) / 3600;
    return {
      tidallyLocked: true,
      rotationPeriodHours: Math.round(periodHours * 10) / 10,
    };
  }

  /** Populates the planets array for the system using meter-based distances and generates moons. */
  private generatePlanets(): void {
    logger.info(`[System:${this.name}] Generating planets (using meters)...`);

    // Use the constant defined in Step 1
    // const AU_IN_METERS = 1.495978707e11; // Defined globally in constants.ts now

    // Define realistic distance ranges in METERS (e.g., 0.2 AU to 50+ AU)
    const stabilityInnerLimit =
      this.architecture.kind === 'single' ? 0.2 * AU_IN_METERS : Math.max(0.7 * AU_IN_METERS, this.architecture.binarySeparation * 4.2);
    const MIN_INNER_ORBIT_M = stabilityInnerLimit; // e.g., ~3e10 meters
    const MAX_INNER_ORBIT_M = 0.7 * AU_IN_METERS; // e.g., ~1e11 meters
    const wideCompanionLimit =
      this.architecture.kind === 'triple' && this.architecture.outerSeparation > 0
        ? Math.max(MIN_INNER_ORBIT_M * 1.8, this.architecture.outerSeparation * 0.25)
        : 50 * AU_IN_METERS;
    const MIN_OUTER_ORBIT_M = Math.min(50 * AU_IN_METERS, wideCompanionLimit); // Example outer limit (adjust as needed)

    const orbitScaleBase = this.systemPRNG.random(1.5, 2.0);
    let lastOrbitDistance = this.systemPRNG.random(MIN_INNER_ORBIT_M, Math.max(MIN_INNER_ORBIT_M, MAX_INNER_ORBIT_M));
    const MIN_PLANET_SEPARATION_M = 0.1 * AU_IN_METERS; // e.g., 0.1 AU separation minimum
    const secondaryHosts = this.getSecondaryCircumstellarPlanetHosts();
    const reservedSecondarySlots = Math.min(3, secondaryHosts.length * 2);
    const primarySlotLimit = Math.max(1, CONFIG.MAX_PLANETS_PER_SYSTEM - reservedSecondarySlots);

    let planetsGenerated = 0;
    for (let i = 0; i < primarySlotLimit; i++) {
      logger.debug(`[System:${this.name}] Considering planet slot ${i + 1}...`);

      let currentOrbitDistance =
        lastOrbitDistance * Math.pow(orbitScaleBase, 1 + this.systemPRNG.random(-0.2, 0.2)) +
        this.systemPRNG.random(0.01 * AU_IN_METERS, 0.1 * AU_IN_METERS);
      currentOrbitDistance = Math.max(lastOrbitDistance + MIN_PLANET_SEPARATION_M, currentOrbitDistance);
      currentOrbitDistance = Math.min(MIN_OUTER_ORBIT_M, currentOrbitDistance);

      logger.debug(
        `[System:${this.name}] Slot ${i + 1}: Calculated potential orbit distance ${currentOrbitDistance.toExponential(
          2
        )}m (last was ${lastOrbitDistance.toExponential(2)}m)`
      );

      // Check for starbase collision (using meter-based distance)
      if (
        this.starbase &&
        Math.abs(currentOrbitDistance - this.starbase.orbitDistance) < MIN_PLANET_SEPARATION_M * 0.5
      ) {
        const oldOrbit = currentOrbitDistance;
        currentOrbitDistance =
          this.starbase.orbitDistance +
          MIN_PLANET_SEPARATION_M * 0.6 * (currentOrbitDistance > this.starbase.orbitDistance ? 1 : -1);
        currentOrbitDistance = Math.max(lastOrbitDistance + MIN_PLANET_SEPARATION_M, currentOrbitDistance);
        currentOrbitDistance = Math.min(MIN_OUTER_ORBIT_M, currentOrbitDistance);
        logger.debug(
          `[System:${this.name}] Slot ${i + 1}: Adjusted orbit from ${oldOrbit.toExponential(
            2
          )}m to ${currentOrbitDistance.toExponential(2)}m to avoid starbase.`
        );
      }

      const orbitHost = this.getDefaultPlanetOrbitHost();
      const orbitCenter = this.getOrbitCenter(orbitHost);
      const angle = this.systemPRNG.random(0, Math.PI * 2);
      const totalFlux = this.calculateFluxAt(
        orbitCenter.x + Math.cos(angle) * currentOrbitDistance,
        orbitCenter.y + Math.sin(angle) * currentOrbitDistance
      );
      const parentStar = this.getPlanetEnvironmentStar(orbitHost);
      const formationChance = this.getPlanetFormationChance(i, currentOrbitDistance, totalFlux, parentStar.starType, 0.08);
      if (this.systemPRNG.random() < formationChance) {
        logger.debug(`[System:${this.name}] Slot ${i + 1}: Planet formation roll success.`);
        const planetType = this.determinePlanetType(currentOrbitDistance, totalFlux, parentStar.starType, orbitHost);
        const planetName = `${this.name} ${this.getRomanNumeral(i + 1)}`;
        const parentStarType = parentStar.starType; // Pass star type to planet constructor
        const tidalRotation = this.calculatePlanetTidalRotation(
          planetType,
          currentOrbitDistance,
          this.getOrbitHostMassKg(orbitHost),
          parentStar.environment.ageGyr,
          this.systemPRNG.seedNew(`tidal_lock_${planetName}`)
        );

        // Create the planet (ensure constructor accepts meters)
        const planet = new Planet(
          planetName,
          planetType,
          currentOrbitDistance,
          angle,
          this.systemPRNG,
          parentStarType,
          undefined,
          parentStar.environment,
          orbitHost,
          orbitCenter.x,
          orbitCenter.y,
          totalFlux,
          tidalRotation
        );
        this.planets[i] = planet;
        planetsGenerated++;

        this.generateMoonsForPlanet(planet, planetName, parentStar, parentStarType, totalFlux);
      } else {
        logger.debug(
          `[System:${this.name}] Slot ${i + 1}: Planet formation roll failed (Chance: ${formationChance.toFixed(
            2
          )}). Empty slot.`
        );
        this.planets[i] = null;
      }

      if (this.planets[i]) {
        lastOrbitDistance = this.planets[i]!.orbitDistance;
      } else {
        lastOrbitDistance = currentOrbitDistance;
      }
      if (lastOrbitDistance >= MIN_OUTER_ORBIT_M) {
        logger.info(`[System:${this.name}] Stopping planet generation early, reached outer orbit limit.`);
        break;
      }
    }

    if (planetsGenerated === 0) {
      const fallbackOrbit = this.clamp(
        lastOrbitDistance,
        MIN_INNER_ORBIT_M,
        Math.max(MIN_INNER_ORBIT_M, MIN_OUTER_ORBIT_M * 0.7)
      );
      const orbitHost = this.getDefaultPlanetOrbitHost();
      const orbitCenter = this.getOrbitCenter(orbitHost);
      const angle = this.systemPRNG.random(0, Math.PI * 2);
      const totalFlux = this.calculateFluxAt(
        orbitCenter.x + Math.cos(angle) * fallbackOrbit,
        orbitCenter.y + Math.sin(angle) * fallbackOrbit
      );
      const planetType = this.determinePlanetType(fallbackOrbit, totalFlux);
      const planetName = `${this.name} ${this.getRomanNumeral(1)}`;
      const parentStar = this.getPlanetEnvironmentStar(orbitHost);
      const tidalRotation = this.calculatePlanetTidalRotation(
        planetType,
        fallbackOrbit,
        this.getOrbitHostMassKg(orbitHost),
        parentStar.environment.ageGyr,
        this.systemPRNG.seedNew(`tidal_lock_${planetName}`)
      );
      const planet = new Planet(
        planetName,
        planetType,
        fallbackOrbit,
        angle,
        this.systemPRNG,
        parentStar.starType,
        undefined,
        parentStar.environment,
        orbitHost,
        orbitCenter.x,
        orbitCenter.y,
        totalFlux,
        tidalRotation
      );
      this.planets[0] = planet;
      planetsGenerated = 1;
      this.generateMoonsForPlanet(planet, planetName, parentStar, parentStar.starType, totalFlux);
      logger.info(`[System:${this.name}] Added fallback planetary body for exploration pacing.`);
    }

    planetsGenerated += this.generateSecondaryCircumstellarPlanets(secondaryHosts);

    logger.info(`[System:${this.name}] Planet generation complete. ${planetsGenerated} planets created.`);
  }

  private getSecondaryCircumstellarPlanetHosts(): StellarBody[] {
    if (this.architecture.kind === 'single' || this.architecture.kind === 'starless') return [];
    return this.stars.filter((star) => {
      if (star.id === 'A') return false;
      const stableZone = this.getCircumstellarStableZone(star);
      return stableZone !== null && stableZone.maxOrbit_m / Math.max(stableZone.minOrbit_m, 1) >= 2.2;
    });
  }

  private getCircumstellarStableZone(star: StellarBody): { minOrbit_m: number; maxOrbit_m: number; nearestStarDistance_m: number } | null {
    const nearestStarDistance_m = this.getNearestOtherStarDistance(star);
    if (!Number.isFinite(nearestStarDistance_m) || nearestStarDistance_m < 5 * AU_IN_METERS) return null;

    const starClass = star.starType.match(/^[OBAFGKMLTY]/)?.[0] ?? 'G';
    const minByClassAu: Record<string, number> = { O: 0.9, B: 0.65, A: 0.35, F: 0.22, G: 0.16, K: 0.1, M: 0.055, L: 0.035, T: 0.025, Y: 0.02 };
    const minOrbit_m = Math.max(star.radiusM * 18, (minByClassAu[starClass] ?? 0.12) * AU_IN_METERS);
    const stabilityFraction = this.architecture.kind === 'triple' && star.id === 'C' ? 0.14 : 0.16;
    const maxOrbit_m = nearestStarDistance_m * stabilityFraction;
    if (maxOrbit_m <= minOrbit_m * 1.7) return null;
    return { minOrbit_m, maxOrbit_m, nearestStarDistance_m };
  }

  private getNearestOtherStarDistance(star: StellarBody): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of this.stars) {
      if (other.id === star.id) continue;
      const dx = star.systemX - other.systemX;
      const dy = star.systemY - other.systemY;
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    return nearest;
  }

  private generateSecondaryCircumstellarPlanets(hosts: StellarBody[]): number {
    if (hosts.length === 0) return 0;
    let generated = 0;
    for (const host of hosts) {
      const remainingSlots = CONFIG.MAX_PLANETS_PER_SYSTEM - this.planets.filter(Boolean).length;
      if (remainingSlots <= 0 || generated >= 3) break;
      const stableZone = this.getCircumstellarStableZone(host);
      if (!stableZone) continue;

      const hostPRNG = this.systemPRNG.seedNew(`circumstellar_${host.id}`);
      const maxForHost = Math.min(remainingSlots, 3 - generated, hostPRNG.random() < 0.72 ? 1 : 2);
      const spacing = hostPRNG.random(1.55, 2.25);
      let lastOrbit = hostPRNG.random(stableZone.minOrbit_m, Math.min(stableZone.maxOrbit_m, stableZone.minOrbit_m * 2.2));

      for (let localIndex = 0; localIndex < maxForHost; localIndex++) {
        const slot = this.planets.findIndex((planet) => planet === null);
        if (slot < 0) return generated;
        const orbitDistance = localIndex === 0
          ? lastOrbit
          : Math.min(stableZone.maxOrbit_m, lastOrbit * spacing + hostPRNG.random(0.03 * AU_IN_METERS, 0.12 * AU_IN_METERS));
        if (orbitDistance > stableZone.maxOrbit_m) break;

        const orbitHost: OrbitHost = { kind: 'circumstellar', starId: host.id };
        const angle = hostPRNG.random(0, Math.PI * 2);
        const x = host.systemX + Math.cos(angle) * orbitDistance;
        const y = host.systemY + Math.sin(angle) * orbitDistance;
        const totalFlux = this.calculateFluxAt(x, y);
        const formationChance = this.getPlanetFormationChance(localIndex, orbitDistance, totalFlux, host.starType, 0.0);
        if (hostPRNG.random() > formationChance) {
          lastOrbit = orbitDistance;
          continue;
        }

        const planetType = this.determinePlanetType(orbitDistance, totalFlux, host.starType, orbitHost);
        const planetName = `${this.name} ${host.id}-${this.getRomanNumeral(localIndex + 1)}`;
        const tidalRotation = this.calculatePlanetTidalRotation(
          planetType,
          orbitDistance,
          host.massKg,
          host.environment.ageGyr,
          this.systemPRNG.seedNew(`tidal_lock_${planetName}`)
        );
        const planet = new Planet(
          planetName,
          planetType,
          orbitDistance,
          angle,
          this.systemPRNG,
          host.starType,
          undefined,
          host.environment,
          orbitHost,
          host.systemX,
          host.systemY,
          totalFlux,
          tidalRotation
        );
        this.planets[slot] = planet;
        this.generateMoonsForPlanet(planet, planetName, host, host.starType, totalFlux);
        generated++;
        lastOrbit = orbitDistance;
        logger.info(
          `[System:${this.name}] Generated circumstellar planet ${planet.name} around star ${host.id} at ${(
            orbitDistance / AU_IN_METERS
          ).toFixed(2)} AU inside ${(stableZone.maxOrbit_m / AU_IN_METERS).toFixed(2)} AU stability limit.`
        );
      }
    }
    return generated;
  }

  private generateRoguePlanetaryMassObject(): void {
    const prng = this.systemPRNG.seedNew('rogue_planetary_mass_object');
    const planetType = this.weightedChoice(prng, [
      { item: 'GasGiant', weight: 5.5 },
      { item: 'IceGiant', weight: 3.2 },
      { item: 'Frozen', weight: 0.8 },
    ]);
    const planet = new Planet(
      this.name,
      planetType,
      0,
      0,
      this.systemPRNG,
      'ROGUE',
      this.generateRoguePlanetCharacteristics(planetType, prng),
      this.stellarEnvironment,
      { kind: 'barycentric' },
      0,
      0,
      0.0001
    );
    planet.systemX = 0;
    planet.systemY = 0;
    this.planets[0] = planet;
    this.generateMoonsForRoguePlanet(planet, this.name, prng);
    logger.info(`[System:${this.name}] Generated starless ${planet.type} with ${planet.moons.length} retained moon${planet.moons.length === 1 ? '' : 's'}.`);
  }

  private generateRoguePlanetCharacteristics(planetType: string, prng: PRNG): PlanetCharacteristics {
    const physical =
      planetType === 'GasGiant'
        ? { diameter: prng.randomInt(52000, 146000), density: prng.random(0.55, 1.75) }
        : planetType === 'IceGiant'
          ? { diameter: prng.randomInt(22000, 62000), density: prng.random(1.1, 2.05) }
          : { diameter: prng.randomInt(2600, 14500), density: prng.random(1.0, 3.2) };
    const radius_m = (physical.diameter * 1000) / 2;
    const mass = (4 / 3) * Math.PI * Math.pow(radius_m, 3) * physical.density * 1000;
    const escapeVelocity = Math.sqrt((2 * GRAVITATIONAL_CONSTANT_G * mass) / radius_m);
    const surfaceTemp =
      planetType === 'GasGiant'
        ? prng.randomInt(18, 95)
        : planetType === 'IceGiant'
          ? prng.randomInt(14, 70)
          : prng.randomInt(8, 45);
    const atmosphere: PlanetCharacteristics['atmosphere'] =
      planetType === 'GasGiant'
        ? { density: 'Superdense', pressure: prng.random(200, 1500), composition: { Hydrogen: 0.82, Helium: 0.16, Methane: 0.02 } }
        : planetType === 'IceGiant'
          ? { density: 'Superdense', pressure: prng.random(80, 700), composition: { Hydrogen: 0.52, Helium: 0.18, Methane: 0.18, Ammonia: 0.12 } }
          : { density: 'Trace', pressure: prng.random(0.001, 0.08), composition: { Nitrogen: 0.35, Methane: 0.28, 'Carbon Dioxide': 0.22, Argon: 0.15 } };
    const axialTilt = generateAxialTiltRad(prng, false);
    const temperatureProfile = createTemperatureProfileFromAverage(surfaceTemp, planetType, atmosphere, {
      diameterKm: physical.diameter,
      densityGcm3: physical.density,
      ageGyr: this.stellarEnvironment.ageGyr,
      axialTiltRad: axialTilt,
      tidallyLocked: false,
      tidalHeatingFactor: 0,
    });
    const volatileAbundance: Record<string, number> =
      planetType === 'GasGiant'
        ? { HYDROGEN: 0.62, HELIUM: 0.2, METHANE_ICE: 0.08, AMMONIA_ICE: 0.06, WATER_ICE: 0.04 }
        : planetType === 'IceGiant'
          ? { WATER_ICE: 0.34, METHANE_ICE: 0.22, AMMONIA_ICE: 0.18, HYDROGEN: 0.16, HELIUM: 0.1 }
          : { WATER_ICE: 0.38, METHANE_ICE: 0.22, AMMONIA_ICE: 0.14, SILICON: 0.14, IRON: 0.12 };

    return {
      diameter: physical.diameter,
      density: physical.density,
      gravity: calculateGravity(physical.diameter, physical.density),
      mass,
      escapeVelocity,
      atmosphere,
      surfaceTemp: temperatureProfile.average,
      surfaceTempMin: temperatureProfile.min,
      surfaceTempMax: temperatureProfile.max,
      hydrosphere: planetType === 'Frozen' ? 'Cryogenic surface volatiles' : 'Deep volatile atmosphere',
      lithosphere: planetType === 'Frozen' ? 'Ice-rock crust' : 'No solid surface',
      mineralRichness: planetType === 'Frozen' ? MineralRichness.POOR : MineralRichness.NONE,
      baseMinerals: planetType === 'Frozen' ? prng.randomInt(4, 16) : 0,
      elementAbundance: volatileAbundance,
      magneticFieldStrength: planetType === 'GasGiant' ? prng.random(120, 1800) : planetType === 'IceGiant' ? prng.random(60, 900) : prng.random(0, 3),
      axialTilt,
      tidallyLocked: false,
      rotationPeriodHours: generateRotationPeriodHours(prng, planetType, physical.diameter, physical.density, 0, false),
      orbitalInclination: 0,
    };
  }

  private generateMoonsForRoguePlanet(parent: Planet, planetName: string, prng: PRNG): void {
    if (!parent.mass || parent.mass <= 0 || !parent.diameter || parent.diameter <= 0) return;
    const parentRadius_m = (parent.diameter * 1000) / 2;
    const innerOrbit_m = parentRadius_m * (parent.type === 'GasGiant' || parent.type === 'IceGiant' ? 3.2 : 5.0);
    const outerStableOrbit_m = parentRadius_m * (parent.type === 'GasGiant' ? 520 : parent.type === 'IceGiant' ? 360 : 120);
    const targetMoonCount =
      parent.type === 'GasGiant'
        ? this.clamp(Math.round(prng.random(4, 16)), 0, 18)
        : parent.type === 'IceGiant'
          ? this.clamp(Math.round(prng.random(2, 9)), 0, 12)
          : this.clamp(Math.round(prng.random(0, 2)), 0, 3);

    let lastMoonOrbit_m = innerOrbit_m;
    for (let j = 0; j < targetMoonCount; j++) {
      const moonOrbit_m = lastMoonOrbit_m * prng.random(1.38, parent.type === 'Frozen' ? 2.7 : 1.85);
      if (moonOrbit_m > outerStableOrbit_m) break;
      const orbitFraction = this.clamp((moonOrbit_m - innerOrbit_m) / Math.max(outerStableOrbit_m - innerOrbit_m, 1), 0, 1);
      const moonType = orbitFraction < 0.25 && this.getMoonTidalHeatingFactor(parent, moonOrbit_m) > 0.18 && prng.random() < 0.45
        ? 'Lunar'
        : this.weightedChoice(prng, [
          { item: 'Frozen', weight: parent.type === 'Frozen' ? 2.2 : 5 },
          { item: 'Lunar', weight: orbitFraction > 0.65 ? 2.2 : 1.1 },
        ]);
      const moonCharacteristics = this.generateRogueMoonCharacteristics(
        moonType,
        moonOrbit_m,
        prng,
        parent,
        j,
        innerOrbit_m,
        outerStableOrbit_m
      );
      const moon = new Planet(
        `${planetName}.${j + 1}`,
        moonType,
        moonOrbit_m,
        prng.random(0, Math.PI * 2),
        this.systemPRNG,
        'ROGUE',
        moonCharacteristics,
        this.stellarEnvironment,
        { kind: 'barycentric' },
        parent.systemX,
        parent.systemY,
        0.0001
      );
      parent.moons.push(moon);
      lastMoonOrbit_m = moonOrbit_m;
    }
  }

  private generateRogueMoonCharacteristics(
    moonType: string,
    moonOrbit_m: number,
    prng: PRNG,
    parent: Planet,
    moonIndex: number,
    innerOrbit_m: number,
    outerStableOrbit_m: number
  ): PlanetCharacteristics {
    const orbitFraction = this.clamp((moonOrbit_m - innerOrbit_m) / Math.max(outerStableOrbit_m - innerOrbit_m, 1), 0, 1);
    const parentDiameterLimit = parent.diameter * (parent.type === 'GasGiant' || parent.type === 'IceGiant' ? 0.08 : 0.22);
    const maxDiameter = Math.max(420, Math.min(moonType === 'Frozen' ? 5200 : 3800, parentDiameterLimit) * Math.max(0.45, 1 - moonIndex * 0.055));
    const diameter = prng.random(moonType === 'Frozen' ? 520 : 420, maxDiameter);
    const density = moonType === 'Frozen' ? prng.random(1.15, 2.25) : prng.random(2.35, 3.7);
    const radius_m = (diameter * 1000) / 2;
    const mass = (4 / 3) * Math.PI * Math.pow(radius_m, 3) * density * 1000;
    const tidalHeat = this.getMoonTidalHeatingFactor(parent, moonOrbit_m);
    const surfaceTemp = Math.round((moonType === 'Frozen' ? prng.random(9, 34) : prng.random(12, 52)) + tidalHeat * prng.random(12, 95));
    const tidallyLocked = orbitFraction < 0.82 || tidalHeat > 0.12;
    const atmosphere: PlanetCharacteristics['atmosphere'] = {
      density: surfaceTemp > 35 && diameter > 2400 ? 'Trace' : 'None',
      pressure: surfaceTemp > 35 ? prng.random(0.001, 0.03) : 0,
      composition: { Nitrogen: 0.45, Methane: 0.35, Argon: 0.2 },
    };
    const axialTilt = tidallyLocked ? prng.random(0, Math.PI / 60) : generateAxialTiltRad(prng, false, 0.08);
    const rotationPeriodHours = tidallyLocked
      ? this.calculateKeplerPeriodSeconds(moonOrbit_m, parent.mass) / 3600
      : generateRotationPeriodHours(prng, moonType, diameter, density, moonOrbit_m, false);
    const temperatureProfile = createTemperatureProfileFromAverage(surfaceTemp, moonType, atmosphere, {
      diameterKm: diameter,
      densityGcm3: density,
      ageGyr: this.stellarEnvironment.ageGyr,
      axialTiltRad: axialTilt,
      tidallyLocked,
      tidalHeatingFactor: tidalHeat,
    });
    return {
      diameter,
      density,
      gravity: calculateGravity(diameter, density),
      mass,
      escapeVelocity: Math.sqrt((2 * GRAVITATIONAL_CONSTANT_G * mass) / radius_m),
      atmosphere,
      surfaceTemp: temperatureProfile.average,
      surfaceTempMin: temperatureProfile.min,
      surfaceTempMax: temperatureProfile.max,
      hydrosphere: 'Cryogenic ice deposits',
      lithosphere: moonType === 'Frozen' ? 'Ice-rock crust' : 'Cratered silicate crust',
      mineralRichness: prng.random() < 0.14 ? MineralRichness.AVERAGE : MineralRichness.POOR,
      baseMinerals: prng.randomInt(2, 18),
      elementAbundance: moonType === 'Frozen'
        ? { WATER_ICE: 0.34, METHANE_ICE: 0.2, AMMONIA_ICE: 0.14, SILICON: 0.18, IRON: 0.14 }
        : { SILICON: 0.34, IRON: 0.24, ALUMINIUM: 0.12, MAGNESIUM: 0.12, WATER_ICE: 0.18 },
      magneticFieldStrength: prng.random(0, 4) * (tidalHeat > 0.2 ? 1.4 : 0.45),
      axialTilt,
      tidallyLocked,
      rotationPeriodHours: Math.round(rotationPeriodHours * 10) / 10,
      orbitalInclination: orbitFraction < 0.55 ? prng.random(0, Math.PI / 140) : prng.random(Math.PI / 36, Math.PI / 2.8),
    };
  }

  /** Converts a number to a Roman numeral string (simplified). */
  private getRomanNumeral(num: number): string {
    if (num < 1 || num > 20) return num.toString();
    const romanMap: Record<number, string> = {
      1: 'I',
      2: 'II',
      3: 'III',
      4: 'IV',
      5: 'V',
      6: 'VI',
      7: 'VII',
      8: 'VIII',
      9: 'IX',
      10: 'X',
      11: 'XI',
      12: 'XII',
      13: 'XIII',
      14: 'XIV',
      15: 'XV',
      16: 'XVI',
      17: 'XVII',
      18: 'XVIII',
      19: 'XIX',
      20: 'XX',
    };
    return romanMap[num] || num.toString();
  }

  private getDefaultPlanetOrbitHost(): OrbitHost {
    if (this.isStarless) return { kind: 'barycentric' };
    if (this.architecture.kind === 'single') return { kind: 'circumstellar', starId: 'A' };
    return { kind: 'circumbinary' };
  }

  getOrbitCenter(host: OrbitHost): { x: number; y: number } {
    if (host.kind === 'circumstellar' && host.starId) {
      const star = this.stars.find((s) => s.id === host.starId);
      if (star) return { x: star.systemX, y: star.systemY };
    }
    return { x: 0, y: 0 };
  }

  private getPlanetEnvironmentStar(host: OrbitHost): StellarBody {
    if (host.kind === 'circumstellar' && host.starId) {
      return this.stars.find((star) => star.id === host.starId) ?? getPrimaryStar(this.architecture);
    }
    return getPrimaryStar(this.architecture);
  }

  private getOrbitHostMassKg(host: OrbitHost): number {
    if (this.isStarless) return 0;
    if (host.kind === 'circumstellar' && host.starId) {
      return this.stars.find((star) => star.id === host.starId)?.massKg ?? getPrimaryStar(this.architecture).massKg;
    }
    if (host.kind === 'circumbinary') {
      const innerPairMass = this.stars
        .filter((star) => star.id === 'A' || star.id === 'B')
        .reduce((sum, star) => sum + star.massKg, 0);
      return innerPairMass > 0 ? innerPairMass : this.stars.reduce((sum, star) => sum + star.massKg, 0);
    }
    return this.stars.reduce((sum, star) => sum + star.massKg, 0);
  }

  private calculateFluxAt(x_m: number, y_m: number): number {
    if (this.isStarless || this.stars.length === 0) return 0.0001;
    let flux = 0;
    for (const star of this.stars) {
      const dx = x_m - star.systemX;
      const dy = y_m - star.systemY;
      const distanceSq = Math.max(star.radiusM * star.radiusM, dx * dx + dy * dy);
      flux += star.luminosityW / (4 * Math.PI * distanceSq);
    }
    return Number.isFinite(flux) && flux > 0 ? flux : 1361;
  }

  private getPlanetFormationChance(
    slotIndex: number,
    orbitDistance_m: number,
    totalFlux_W_m2: number,
    hostStarType: string = this.starType,
    architecturePenalty: number = this.architecture.kind === 'single' ? 0 : 0.08
  ): number {
    const starClass = this.getSpectralClass(hostStarType);
    const baseByClass: Record<string, number> = {
      M: 0.82,
      K: 0.9,
      G: 0.88,
      F: 0.82,
      A: 0.58,
      B: 0.22,
      O: 0.08,
      L: 0.62,
      T: 0.48,
      Y: 0.32,
    };
    const effectiveTemp = this.getEffectiveTemperature(totalFlux_W_m2);
    const orbitAU = orbitDistance_m / AU_IN_METERS;
    const metallicityBoost = Math.max(-0.18, Math.min(0.12, this.metallicityFeH * 0.12));
    const compactSystemBoost = (starClass === 'M' || starClass === 'L' || starClass === 'T' || starClass === 'Y') && orbitAU < 2 ? 0.08 : 0;
    const hotStarPenalty = ['A', 'B', 'O'].includes(starClass) && effectiveTemp > 420 ? -0.18 : 0;
    const lateSlotPenalty = slotIndex * (starClass === 'M' || starClass === 'K' ? 0.035 : 0.055);
    return this.clamp(
      (baseByClass[starClass] ?? 0.75) + metallicityBoost + compactSystemBoost + hotStarPenalty - lateSlotPenalty - architecturePenalty,
      0.03,
      0.96
    );
  }

  /** Determines the likely planet type based on local stellar flux. */
  private determinePlanetType(
    orbitDistance_m: number,
    totalFlux_W_m2?: number,
    hostStarType: string = this.starType,
    orbitHost: OrbitHost = this.getDefaultPlanetOrbitHost()
  ): string {
    logger.debug(`[System:${this.name}] Determining planet type for orbit ${orbitDistance_m.toExponential(2)}m...`);
    const typePRNG = this.systemPRNG.seedNew(`type_${getHostLabel(orbitHost)}_${orbitDistance_m.toFixed(0)}`);
    const orbitDistance_AU = orbitDistance_m / AU_IN_METERS;
    const flux = totalFlux_W_m2 ?? this.calculateFluxAt(orbitDistance_m, 0);
    const effectiveTemp = this.getEffectiveTemperature(flux);

    if (!Number.isFinite(effectiveTemp)) {
      logger.error(
        `[System:${this.name}] Calculated non-finite effective temperature (${effectiveTemp}). Defaulting type.`
      );
      return 'Rock';
    }
    logger.debug(
      `[System:${this.name}] Effective temp at orbit ${orbitDistance_AU.toFixed(2)} AU: ${effectiveTemp.toFixed(
        1
      )}K (Flux: ${flux.toExponential(2)} W/m^2, Host: ${getHostLabel(orbitHost)})`
    );

    const starClass = this.getSpectralClass(hostStarType);
    const giantBiasByClass: Record<string, number> = { M: 0.42, K: 0.85, G: 1.0, F: 1.2, A: 1.45, B: 0.7, O: 0.25, L: 0.18, T: 0.1, Y: 0.05 };
    const giantBias = (giantBiasByClass[starClass] ?? 1) * Math.pow(10, Math.max(-0.6, Math.min(0.5, this.metallicityFeH)) * 0.75);
    const iceBias = starClass === 'M' ? 1.15 : starClass === 'A' || starClass === 'F' ? 0.85 : 1;
    const metalFactor = Math.pow(10, Math.max(-0.8, Math.min(0.6, this.metallicityFeH)));
    const closeInFactor = orbitDistance_AU < 0.12 ? 2.2 : orbitDistance_AU < 0.35 ? 1.25 : 0.45;
    const temperateHostFactor = starClass === 'M' || starClass === 'K' ? 1.25 : starClass === 'G' ? 1 : starClass === 'F' ? 0.75 : 0.35;
    const carbonWorldBias = Math.max(0.03, Math.min(0.28, 0.06 * metalFactor * (starClass === 'M' || starClass === 'K' ? 1.15 : 1)));
    const chthonianBias = Math.max(0.02, Math.min(0.55, 0.12 * metalFactor * closeInFactor));
    const hyceanBias = Math.max(0.02, Math.min(0.42, 0.11 * metalFactor * temperateHostFactor));
    const dwarfIceBias = starClass === 'A' || starClass === 'B' || starClass === 'O' ? 0.6 : 1.0;

    let choices: Array<{ item: string; weight: number }>;
    if (effectiveTemp > 800) {
      choices = [
        { item: 'Molten', weight: 7 },
        { item: 'Chthonian', weight: 1.5 * chthonianBias },
        { item: 'Rock', weight: 2 },
        { item: 'CarbonRich', weight: carbonWorldBias },
        { item: 'Lunar', weight: 1 },
      ];
    } else if (effectiveTemp > 390) {
      choices = [
        { item: 'Rock', weight: 5 },
        { item: 'Greenhouse', weight: 2.2 * (starClass === 'M' ? 0.65 : 1) },
        { item: 'Molten', weight: 2 },
        { item: 'Chthonian', weight: 0.85 * chthonianBias },
        { item: 'CarbonRich', weight: carbonWorldBias },
        { item: 'Lunar', weight: 2 },
        { item: 'GasGiant', weight: 0.15 * giantBias },
      ];
    } else if (effectiveTemp > 260) {
      choices = [
        { item: 'Rock', weight: 4 },
        { item: 'Oceanic', weight: starClass === 'M' ? 2 : 3 },
        { item: 'Hycean', weight: hyceanBias },
        { item: 'Greenhouse', weight: 0.35 * (starClass === 'F' || starClass === 'G' || starClass === 'K' ? 1 : 0.45) },
        { item: 'CarbonRich', weight: carbonWorldBias },
        { item: 'Lunar', weight: 1.2 },
        { item: 'GasGiant', weight: 0.2 * giantBias },
        { item: 'IceGiant', weight: 0.1 * giantBias },
      ];
    } else if (effectiveTemp > 150) {
      choices = [
        { item: 'Frozen', weight: 3 },
        { item: 'Cryovolcanic', weight: 0.55 * iceBias * metalFactor },
        { item: 'DwarfIce', weight: 0.35 * dwarfIceBias },
        { item: 'Rock', weight: 2 },
        { item: 'Hycean', weight: 0.35 * hyceanBias },
        { item: 'Lunar', weight: 1.6 },
        { item: 'GasGiant', weight: 1.4 * giantBias },
        { item: 'IceGiant', weight: 1.1 * giantBias * iceBias },
      ];
    } else {
      choices = [
        { item: 'Frozen', weight: 3.2 },
        { item: 'DwarfIce', weight: 1.25 * dwarfIceBias },
        { item: 'Cryovolcanic', weight: 0.35 * iceBias * metalFactor },
        { item: 'Lunar', weight: 1.4 },
        { item: 'GasGiant', weight: 1.8 * giantBias },
        { item: 'IceGiant', weight: 1.7 * giantBias * iceBias },
      ];
    }
    const chosenType = this.weightedChoice(typePRNG, choices);
    logger.debug(
      `[System:${this.name}] Determined planet type: ${chosenType} for orbit ${orbitDistance_AU.toFixed(2)} AU.`
    );
    return chosenType;
  }

  private generateMoonsForPlanet(
    planet: Planet,
    planetName: string,
    parentStar: StellarBody,
    parentStarType: string,
    totalFlux: number
  ): void {
    if (!['Rock', 'Oceanic', 'Frozen', 'GasGiant', 'IceGiant'].includes(planet.type)) return;
    if (!planet.mass || planet.mass <= 0 || !planet.diameter || planet.diameter <= 0) return;

    const moonPRNG = planet.systemPRNG.seedNew('moons');
    const effectiveTemp = Math.max(this.getEffectiveTemperature(totalFlux), planet.surfaceTemp);
    const parentRadius_m = (planet.diameter * 1000) / 2;
    const hostMass = parentStar.massKg || SOLAR_MASS_KG;
    const hillRadius_m = planet.orbitDistance * Math.pow(planet.mass / (3 * hostMass), 1 / 3);
    const outerStableOrbit_m = hillRadius_m * (planet.type === 'GasGiant' || planet.type === 'IceGiant' ? 0.42 : 0.32);
    const innerOrbit_m = parentRadius_m * (planet.type === 'GasGiant' || planet.type === 'IceGiant' ? 3.0 : 4.0);
    if (!Number.isFinite(outerStableOrbit_m) || outerStableOrbit_m <= innerOrbit_m * 1.8) return;

    const targetMoonCount = this.getMajorMoonTargetCount(planet, effectiveTemp, outerStableOrbit_m, innerOrbit_m, moonPRNG);
    if (targetMoonCount <= 0) return;
    logger.debug(
      `[Planet:${planet.name}] Generating up to ${targetMoonCount} major moons inside Hill sphere ${hillRadius_m.toExponential(2)}m.`
    );

    let lastMoonOrbit_m = innerOrbit_m;
    for (let j = 0; j < targetMoonCount; j++) {
      const spacing = moonPRNG.random(1.35, planet.type === 'GasGiant' || planet.type === 'IceGiant' ? 1.85 : 2.4);
      const moonOrbit_m = lastMoonOrbit_m * spacing;
      if (moonOrbit_m > outerStableOrbit_m) break;

      const moonAngle = moonPRNG.random(0, Math.PI * 2);
      const moonName = `${planetName}.${j + 1}`;
      const moonType = this.determineMoonType(planet, effectiveTemp, moonOrbit_m, innerOrbit_m, outerStableOrbit_m, moonPRNG);
      let moonCharacteristics: PlanetCharacteristics;
      try {
        moonCharacteristics = this.generateRealisticMoonCharacteristics(
          moonType,
          moonOrbit_m,
          moonPRNG,
          parentStarType,
          parentStar.environment,
          totalFlux,
          planet,
          j,
          innerOrbit_m,
          outerStableOrbit_m
        );
      } catch (charError) {
        logger.error(`[Planet:${planet.name}] Error generating characteristics for moon ${moonName}: ${charError}`);
        continue;
      }

      try {
        const moon = new Planet(
          moonName,
          moonType,
          moonOrbit_m,
          moonAngle,
          moonPRNG,
          parentStarType,
          moonCharacteristics,
          parentStar.environment,
          { kind: 'circumstellar', starId: parentStar.id },
          planet.systemX,
          planet.systemY,
          totalFlux
        );
        planet.moons.push(moon);
        logger.info(`[Planet:${planet.name}] Generated Moon: ${moonName} (Type: ${moonType}, Orbit: ${moonOrbit_m.toExponential(1)}m)`);
        lastMoonOrbit_m = moonOrbit_m;
      } catch (moonError) {
        logger.error(`[Planet:${planet.name}] Error constructing moon ${moonName} from characteristics: ${moonError}`);
      }
    }
  }

  private getMajorMoonTargetCount(
    planet: Planet,
    effectiveTemp: number,
    outerStableOrbit_m: number,
    innerOrbit_m: number,
    prng: PRNG
  ): number {
    const stableWidth = Math.max(0, Math.log(outerStableOrbit_m / innerOrbit_m));
    const heatPenalty = effectiveTemp > 650 ? 0.05 : effectiveTemp > 390 ? 0.15 : effectiveTemp > 300 ? 0.55 : effectiveTemp > 190 ? 0.85 : 1;
    const tidalPenalty = planet.orbitDistance < 0.35 * AU_IN_METERS ? 0.15 : planet.orbitDistance < 0.7 * AU_IN_METERS ? 0.45 : 1;
    const massFactor = this.clamp(Math.sqrt(planet.mass / 5.972e24), 0.2, 7);

    if (planet.type === 'GasGiant') {
      const expected = (6 + massFactor * 2.6 + stableWidth * 1.4) * heatPenalty * tidalPenalty;
      const thermalCap = effectiveTemp > 650 ? 2 : effectiveTemp > 390 ? 5 : 24;
      return this.clamp(Math.round(prng.random(expected * 0.65, expected * 1.25)), 0, thermalCap);
    }
    if (planet.type === 'IceGiant') {
      const expected = (3 + massFactor * 1.8 + stableWidth) * heatPenalty * tidalPenalty;
      const thermalCap = effectiveTemp > 650 ? 2 : effectiveTemp > 390 ? 5 : 14;
      return this.clamp(Math.round(prng.random(expected * 0.55, expected * 1.2)), 0, thermalCap);
    }
    if (planet.type === 'Frozen') {
      const expected = (0.35 + massFactor * 0.45) * heatPenalty * tidalPenalty;
      return this.clamp(Math.floor(prng.random(0, expected + 1.4)), 0, 3);
    }

    const impactMoonChance = this.clamp(0.1 + (massFactor - 0.4) * 0.16, 0.03, 0.45) * heatPenalty * tidalPenalty;
    if (prng.random() > impactMoonChance) return 0;
    return prng.random() < 0.82 ? 1 : 2;
  }

  private determineMoonType(
    parent: Planet,
    effectiveTemp: number,
    moonOrbit_m: number,
    innerOrbit_m: number,
    outerStableOrbit_m: number,
    prng: PRNG
  ): string {
    const isGiantParent = parent.type === 'GasGiant' || parent.type === 'IceGiant';
    const orbitFraction = this.clamp((moonOrbit_m - innerOrbit_m) / Math.max(outerStableOrbit_m - innerOrbit_m, 1), 0, 1);
    const tidalHeat = this.getMoonTidalHeatingFactor(parent, moonOrbit_m);

    if (isGiantParent && orbitFraction < 0.28 && tidalHeat > 0.22 && prng.random() < 0.55) {
      return prng.random() < 0.38 ? 'Cryovolcanic' : 'Lunar';
    }
    if (effectiveTemp < 170) {
      return this.weightedChoice(prng, [
        { item: 'Frozen', weight: isGiantParent ? 5 : 3 },
        { item: 'Cryovolcanic', weight: isGiantParent && tidalHeat > 0.08 ? 1.4 : 0.25 },
        { item: 'DwarfIce', weight: orbitFraction > 0.65 ? 1.1 : 0.3 },
        { item: 'Lunar', weight: isGiantParent && orbitFraction > 0.6 ? 1 : 2 },
      ]);
    }
    if (effectiveTemp > 320) return 'Lunar';
    return this.weightedChoice(prng, [
      { item: 'Lunar', weight: 3 },
      { item: 'Frozen', weight: 2 },
    ]);
  }

  private generateRealisticMoonCharacteristics(
    moonType: string,
    moonOrbit_m: number,
    prng: PRNG,
    parentStarType: string,
    environment: StellarEnvironment,
    totalFlux: number,
    parent: Planet,
    moonIndex: number,
    innerOrbit_m: number,
    outerStableOrbit_m: number
  ): PlanetCharacteristics {
    const characteristics = generatePlanetCharacteristics(moonType, moonOrbit_m, prng, parentStarType, environment, totalFlux);
    const isGiantParent = parent.type === 'GasGiant' || parent.type === 'IceGiant';
    const orbitFraction = this.clamp((moonOrbit_m - innerOrbit_m) / Math.max(outerStableOrbit_m - innerOrbit_m, 1), 0, 1);
    const distanceInParentRadii = moonOrbit_m / Math.max(1, (parent.diameter * 1000) / 2);
    const parentDiameterLimit = parent.diameter * (isGiantParent ? 0.09 : 0.32);
    const baseMax = isGiantParent ? 5600 : 3600;
    const isRegularGiantMoon = isGiantParent && (orbitFraction < 0.55 || distanceInParentRadii < 80);
    const capturedSizeFactor = isGiantParent && !isRegularGiantMoon ? 0.55 : 1;
    const indexFalloff = Math.max(0.35, 1 - moonIndex * 0.045);
    const minDiameter = moonType === 'Frozen' || moonType === 'Cryovolcanic' || moonType === 'DwarfIce' ? 450 : 350;
    const maxDiameter = Math.max(minDiameter + 50, Math.min(baseMax, parentDiameterLimit) * indexFalloff * capturedSizeFactor);
    const diameter = prng.random(minDiameter, maxDiameter);
    const density = moonType === 'Frozen' || moonType === 'Cryovolcanic' || moonType === 'DwarfIce'
      ? prng.random(moonType === 'DwarfIce' ? 0.9 : 1.2, moonType === 'Cryovolcanic' ? 2.8 : 2.4)
      : prng.random(2.4, 3.6);
    const radius_m = (diameter * 1000) / 2;
    const mass = (4 / 3) * Math.PI * Math.pow(radius_m, 3) * density * 1000;
    const gravity = calculateGravity(diameter, density);
    const escapeVelocity = Math.sqrt((2 * GRAVITATIONAL_CONSTANT_G * mass) / radius_m);
    const tidalHeat = this.getMoonTidalHeatingFactor(parent, moonOrbit_m);
    const tidallyLocked = isGiantParent ? isRegularGiantMoon || orbitFraction < 0.78 : tidalHeat > 0.16 || moonOrbit_m < parent.diameter * 1000 * 24;
    const axialTilt = isRegularGiantMoon
      ? prng.random(0, Math.PI / 90)
      : tidallyLocked
        ? prng.random(0, Math.PI / 45)
        : generateAxialTiltRad(prng, false, isGiantParent ? 0.16 : 0.1);
    const orbitalInclination = isRegularGiantMoon
      ? prng.random(0, Math.PI / 180)
      : isGiantParent
        ? prng.random(Math.PI / 36, Math.PI / 2.5)
        : prng.random(0, Math.PI / 18);
    const rotationPeriodHours = tidallyLocked
      ? this.calculateKeplerPeriodSeconds(moonOrbit_m, parent.mass) / 3600
      : generateRotationPeriodHours(prng, moonType, diameter, density, moonOrbit_m, false);
    const tidalTemperatureBoost = isGiantParent ? Math.round(tidalHeat * prng.random(20, 95)) : Math.round(tidalHeat * prng.random(8, 35));
    const boostedAverageTemp = characteristics.surfaceTemp + tidalTemperatureBoost;
    const temperatureProfile = createTemperatureProfileFromAverage(boostedAverageTemp, moonType, characteristics.atmosphere, {
      diameterKm: diameter,
      densityGcm3: density,
      ageGyr: environment.ageGyr,
      axialTiltRad: axialTilt,
      tidallyLocked,
      tidalHeatingFactor: tidalHeat,
    });
    return {
      ...characteristics,
      diameter,
      density,
      mass,
      gravity,
      escapeVelocity,
      surfaceTemp: temperatureProfile.average,
      surfaceTempMin: temperatureProfile.min,
      surfaceTempMax: temperatureProfile.max,
      magneticFieldStrength: characteristics.magneticFieldStrength * (isRegularGiantMoon ? 0.35 : 0.18),
      axialTilt,
      tidallyLocked,
      rotationPeriodHours: Math.round(rotationPeriodHours * 10) / 10,
      orbitalInclination,
    };
  }

  private getMoonTidalHeatingFactor(parent: Planet, moonOrbit_m: number): number {
    const parentRadius_m = Math.max(1, (parent.diameter * 1000) / 2);
    const distanceInRadii = moonOrbit_m / parentRadius_m;
    const massFactor = this.clamp(Math.sqrt(parent.mass / 1.898e27), 0.15, 2.6);
    const proximityFactor = Math.pow(this.clamp(18 / Math.max(distanceInRadii, 2.5), 0, 1), 2.4);
    const giantBoost = parent.type === 'GasGiant' ? 1.2 : parent.type === 'IceGiant' ? 0.75 : 0.35;
    return this.clamp(proximityFactor * massFactor * giantBoost, 0, 1);
  }

  private getEffectiveTemperature(totalFlux_W_m2: number): number {
    return 278.3 * Math.pow(Math.max(totalFlux_W_m2, 0.0001) / 1361, 0.25);
  }

  private getSpectralClass(starType: string = this.starType): string {
    return (starType.match(/^[OBAFGKMLTY]/)?.[0] ?? 'G') as string;
  }

  private weightedChoice<T>(prng: PRNG, choices: Array<{ item: T; weight: number }>): T {
    const total = choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);
    let roll = prng.random(0, total);
    for (const choice of choices) {
      roll -= Math.max(0, choice.weight);
      if (roll <= 0) return choice.item;
    }
    return choices[choices.length - 1].item;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** Finds a planet or starbase near the given system coordinates (in meters). */
  getObjectNear(x_m: number, y_m: number): Planet | Starbase | null {
    // Ensure LANDING_DISTANCE in config is now in meters
    const checkRadius_m = CONFIG.LANDING_DISTANCE;
    const checkRadiusSq_m2 = checkRadius_m * checkRadius_m;
    let closestObject: Planet | Starbase | null = null;
    let minDistanceSq_m2 = checkRadiusSq_m2;

    // Check planets and their moons
    const objectsToCheck: (Planet | Starbase | null)[] = [];
    this.planets.forEach((p) => {
      if (p) {
        objectsToCheck.push(p);
        if (p.moons) {
          objectsToCheck.push(...p.moons); // Add moons to the check list
        }
      }
    });
    if (this.starbase) {
      objectsToCheck.push(this.starbase);
    }

    for (const obj of objectsToCheck) {
      if (!obj) continue;
      // systemX/Y are now in meters
      const dx = obj.systemX - x_m;
      const dy = obj.systemY - y_m;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < minDistanceSq_m2) {
        minDistanceSq_m2 = distanceSq;
        closestObject = obj;
      }
    }
    if (closestObject) {
      logger.debug(
        `[System:${this.name}] Found nearby object: ${closestObject.name} (DistSq: ${minDistanceSq_m2.toExponential(
          1
        )} m^2)`
      );
    } else {
      logger.debug(
        `[System:${this.name}] No object found within landing distance (${checkRadius_m} m) of [${x_m.toExponential(
          1
        )}, ${y_m.toExponential(1)}]`
      );
    }
    return closestObject;
  }

  /** Finds the object to scan near the given coordinates. Moons resolve to their parent planet. */
  getScannableObjectNear(x_m: number, y_m: number): Planet | Starbase | null {
    const nearbyObject = this.getObjectNear(x_m, y_m);
    if (nearbyObject instanceof Planet) {
      return this.getOrbitParentFor(nearbyObject);
    }
    return nearbyObject;
  }

  /** Returns the parent planet for local orbital operations. Moons resolve to their primary. */
  getOrbitParentFor(body: Planet): Planet {
    for (const planet of this.planets) {
      if (!planet) continue;
      if (planet === body) return planet;
      if (planet.moons.includes(body)) return planet;
    }
    return body;
  }

  getStarNear(x_m: number, y_m: number, radius_m: number): StellarBody | null {
    let closestStar: StellarBody | null = null;
    let minDistanceSq = radius_m * radius_m;
    for (const star of this.stars) {
      const dx = star.systemX - x_m;
      const dy = star.systemY - y_m;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestStar = star;
      }
    }
    return closestStar;
  }

  getNearestStar(x_m: number, y_m: number): StellarBody {
    if (this.stars.length === 0) {
      throw new Error(`System ${this.name} has no stellar primary.`);
    }
    let closestStar = this.stars[0];
    let minDistanceSq = Number.POSITIVE_INFINITY;
    for (const star of this.stars) {
      const dx = star.systemX - x_m;
      const dy = star.systemY - y_m;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestStar = star;
      }
    }
    return closestStar;
  }

  /** Checks if the given coordinates (in meters) are beyond the system's edge radius. */
  isAtEdge(x_m: number, y_m: number): boolean {
    const distSq = x_m * x_m + y_m * y_m;
    // Use edgeRadius which is already in meters
    const edgeCheckRadiusSq = (this.edgeRadius * CONFIG.SYSTEM_EDGE_LEAVE_FACTOR) ** 2;
    return distSq > edgeCheckRadiusSq;
  }

  /** Updates the orbital positions of planets, moons, and starbases based on elapsed time using the fixed time scale. */
  updateOrbits(deltaTime: number): void {
    const G = GRAVITATIONAL_CONSTANT_G;
    const scaledDeltaTime = this.getScaledOrbitalDeltaTime(deltaTime);
    this.updateStarPositions(deltaTime);
    const starMassKg = this.stars.reduce((sum, star) => sum + star.massKg, 0);

    if (!this.isStarless && (!starMassKg || starMassKg <= 0)) {
      logger.error(`[System:${this.name}] Cannot update orbits: Invalid star mass.`);
      return;
    }

    // --- Update Planets AND their Moons ---
    this.planets.forEach((planet) => {
      if (!planet) return;

      // === Update Planet Orbit Around Star or hold central free planet at barycenter ===
      const planet_r = planet.orbitDistance;
      if (!Number.isFinite(planet_r) || planet_r < 0 || (!this.isStarless && planet_r <= 0)) {
        logger.warn(`[System:${this.name}] Invalid orbit distance for ${planet.name}. Skipping.`);
        return;
      }
      if (this.isStarless && planet_r === 0) {
        planet.systemX = 0;
        planet.systemY = 0;
      } else {
        const hostMassKg = this.getOrbitHostMassKg(planet.orbitHost ?? { kind: 'barycentric' });
        const planetPeriod_s = this.calculateKeplerPeriodSeconds(planet_r, hostMassKg);
        if (!Number.isFinite(planetPeriod_s) || planetPeriod_s <= 0) {
          logger.warn(`[System:${this.name}] Invalid orbital period for ${planet.name}. Skipping.`);
          return;
        }
        const planet_deltaAngle = (2 * Math.PI * scaledDeltaTime) / planetPeriod_s;
        planet.orbitAngle = (planet.orbitAngle + planet_deltaAngle) % (Math.PI * 2);
        if (!Number.isFinite(planet.orbitAngle)) planet.orbitAngle = 0;
        const orbitCenter = this.getOrbitCenter(planet.orbitHost ?? { kind: 'barycentric' });
        const planetX_abs = orbitCenter.x + Math.cos(planet.orbitAngle) * planet_r;
        const planetY_abs = orbitCenter.y + Math.sin(planet.orbitAngle) * planet_r;
        if (!Number.isFinite(planetX_abs) || !Number.isFinite(planetY_abs)) {
          logger.error(`[System:${this.name}] Non-finite position for ${planet.name}. Resetting.`);
          planet.systemX = 0;
          planet.systemY = 0;
          return;
        }
        planet.systemX = planetX_abs;
        planet.systemY = planetY_abs;
      }

      // === Update Moons Orbiting This Planet ===
      // Use physics-based period for moons relative to planet
      if (planet.moons && planet.moons.length > 0 && planet.mass && planet.mass > 0) {
        planet.moons.forEach((moon) => {
          const moon_r_rel = moon.orbitDistance; // Moon orbit distance from planet in meters
          if (!Number.isFinite(moon_r_rel) || moon_r_rel <= 0) {
            logger.warn(`[System:${this.name}] Invalid orbit distance for moon ${moon.name}. Skipping.`);
            moon.systemX = planet.systemX;
            moon.systemY = planet.systemY;
            return;
          }

          // Calculate moon's orbital period around the PLANET (seconds)
          const numerator = 4 * Math.PI ** 2 * Math.pow(moon_r_rel, 3);
          const denominator = G * planet.mass;
          if (denominator <= 0) {
            logger.warn(`[System:${this.name}] Invalid denominator for moon period calc for ${moon.name}. Skipping.`);
            return;
          }
          const moonPeriod_s = Math.sqrt(numerator / denominator);

          if (!Number.isFinite(moonPeriod_s) || moonPeriod_s <= 0) {
            logger.warn(
              `[System:${this.name}] Invalid orbital period (${moonPeriod_s}s) for moon ${moon.name}. Skipping.`
            );
            moon.systemX = planet.systemX;
            moon.systemY = planet.systemY;
            return;
          }

          // Calculate moon's true angular speed relative to planet (rad/s)
          const moonOmega_rad_per_s = (2 * Math.PI) / moonPeriod_s;
          // Calculate angle change for this frame based on real physics
          const moon_deltaAngle = moonOmega_rad_per_s * scaledDeltaTime;

          moon.orbitAngle = (moon.orbitAngle + moon_deltaAngle) % (Math.PI * 2);
          if (!Number.isFinite(moon.orbitAngle)) moon.orbitAngle = 0;

          const moonX_rel = Math.cos(moon.orbitAngle) * moon_r_rel;
          const moonY_rel = Math.sin(moon.orbitAngle) * moon_r_rel;

          moon.systemX = planet.systemX + moonX_rel;
          moon.systemY = planet.systemY + moonY_rel;

          if (!Number.isFinite(moon.systemX) || !Number.isFinite(moon.systemY)) {
            logger.error(`[System:${this.name}] Non-finite position for moon ${moon.name}. Resetting.`);
            moon.systemX = planet.systemX;
            moon.systemY = planet.systemY;
          }
        });
      }
    });

    // --- Update Starbase Orbit (uses fixed 4hr=1yr timescale) ---
    if (this.starbase) {
      const sb_r = this.starbase.orbitDistance;
      if (!Number.isFinite(sb_r) || sb_r <= 0) {
        logger.warn(`[System:${this.name}] Invalid orbit distance for starbase. Skipping.`);
        return;
      }
      const sbPeriod_s = this.calculateKeplerPeriodSeconds(sb_r, starMassKg);
      if (!Number.isFinite(sbPeriod_s) || sbPeriod_s <= 0) {
        logger.warn(`[System:${this.name}] Invalid orbital period for starbase. Skipping.`);
        return;
      }
      const sb_deltaAngle = (2 * Math.PI * scaledDeltaTime) / sbPeriod_s;
      this.starbase.orbitAngle = (this.starbase.orbitAngle + sb_deltaAngle) % (Math.PI * 2);
      if (!Number.isFinite(this.starbase.orbitAngle)) this.starbase.orbitAngle = 0;
      this.starbase.systemX = Math.cos(this.starbase.orbitAngle) * sb_r;
      this.starbase.systemY = Math.sin(this.starbase.orbitAngle) * sb_r;
      if (!Number.isFinite(this.starbase.systemX) || !Number.isFinite(this.starbase.systemY)) {
        logger.error(`[System:${this.name}] Non-finite position for starbase. Resetting.`);
        this.starbase.systemX = 0;
        this.starbase.systemY = 0;
      }
    }
  } // End updateOrbits method
} // End SolarSystem class
