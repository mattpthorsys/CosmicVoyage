// src/entities/solar_system.ts (Incorporates Star Mass into Orbit Calculation)

import { CONFIG } from '../config';
// Import SPECTRAL_TYPES which now includes mass
import { SPECTRAL_DISTRIBUTION, SPECTRAL_TYPES } from '../constants';
import { PRNG } from '../utils/prng';
import { Planet } from './planet';
import { Starbase } from './starbase';
import { logger } from '../utils/logger';

export class SolarSystem {
  // --- Constant for Base Orbital Speed Control ---
  // This acts as the proportionality constant, adjusted by sqrt(StarMass)
  // Adjusted based on user feedback.
  private static readonly BASE_ORBITAL_CONSTANT = 5e2;

  readonly starX: number;
  readonly starY: number;
  readonly systemPRNG: PRNG;
  readonly starType: string;
  readonly name: string;
  readonly planets: (Planet | null)[];
  readonly starbase: Starbase | null;
  readonly edgeRadius: number;

  constructor(starX: number, starY: number, gameSeedPRNG: PRNG) {
    this.starX = starX;
    this.starY = starY;
    const starSeed = `star_${starX},${starY}`;
    this.systemPRNG = gameSeedPRNG.seedNew(starSeed);
    logger.debug(`[System:${starX},${starY}] Initialized PRNG with seed: ${this.systemPRNG.getInitialSeed()}`);
    this.starType = this.systemPRNG.choice(SPECTRAL_DISTRIBUTION)!;
    this.name = this.generateSystemName();
    logger.info(
      `[System:${this.name}] Created system at world [${this.starX},${this.starY}]. Star Type: ${this.starType}.`
    );
    this.planets = new Array(CONFIG.MAX_PLANETS_PER_SYSTEM).fill(null);

    this.starbase =
      this.systemPRNG.random() < CONFIG.STARBASE_PROBABILITY
        ? new Starbase(this.name, this.systemPRNG, this.name)
        : null;
    if (this.starbase) {
      logger.info(
        `[System:${this.name}] Starbase generated at orbit distance ${this.starbase.orbitDistance.toFixed(0)}.`
      );
    }

    this.generatePlanets();

    let maxOrbit = 0;
    this.planets.forEach((p) => {
      if (p) maxOrbit = Math.max(maxOrbit, p.orbitDistance);
    });
    if (this.starbase) {
      maxOrbit = Math.max(maxOrbit, this.starbase.orbitDistance);
    }
    logger.debug(`[System:${this.name}] Furthest object orbit distance: ${maxOrbit.toFixed(0)}`);
    this.edgeRadius = Math.max(50000, maxOrbit * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR);
    logger.debug(
      `[System:${this.name}] System edge radius calculated: ${this.edgeRadius.toFixed(0)} (Factor: ${
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
    const suffix = String.fromCharCode(65 + this.systemPRNG.randomInt(0, 25));
    const name = `${this.systemPRNG.choice(prefixes)}-${number}${suffix}`;
    logger.debug(`[System] Generated name: ${name}`);
    return name;
  }

  /** Populates the planets array for the system using meter-based distances. */
  private generatePlanets(): void {
    logger.info(`[System:${this.name}] Generating planets (using meters)...`);

    // Use the constant defined in Step 1
    const AU_IN_METERS = 1.495978707e11; // meters

    // Define realistic distance ranges in METERS (e.g., 0.2 AU to 50+ AU)
    const MIN_INNER_ORBIT_M = 0.2 * AU_IN_METERS; // e.g., ~3e10 meters
    const MAX_INNER_ORBIT_M = 0.7 * AU_IN_METERS; // e.g., ~1e11 meters
    const MIN_OUTER_ORBIT_M = 50 * AU_IN_METERS; // Example outer limit (adjust as needed)

    // Use a power law or similar for spacing (e.g., distance approx R * a^n)
    // Pick a scaling base 'a' (e.g., 1.5 to 2.0) and add randomness
    const orbitScaleBase = this.systemPRNG.random(1.5, 2.0);
    let lastOrbitDistance = this.systemPRNG.random(MIN_INNER_ORBIT_M, MAX_INNER_ORBIT_M);
    // Adjust minimum separation between planets (in meters)
    const MIN_PLANET_SEPARATION_M = 0.1 * AU_IN_METERS; // e.g., 0.1 AU separation minimum

    let planetsGenerated = 0;
    for (let i = 0; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
      logger.debug(`[System:${this.name}] Considering planet slot ${i + 1}...`);

      // Calculate next orbit distance based on scaling factor and randomness
      // Example: last * base^(1 + rand) + some_linear_random
      let currentOrbitDistance =
        lastOrbitDistance * Math.pow(orbitScaleBase, 1 + this.systemPRNG.random(-0.2, 0.2)) +
        this.systemPRNG.random(0.01 * AU_IN_METERS, 0.1 * AU_IN_METERS);

      // Ensure minimum separation and increasing distance
      currentOrbitDistance = Math.max(lastOrbitDistance + MIN_PLANET_SEPARATION_M, currentOrbitDistance);

      // Ensure it doesn't exceed outer limit (optional)
      currentOrbitDistance = Math.min(MIN_OUTER_ORBIT_M, currentOrbitDistance);

      logger.debug(
        `[System:${this.name}] Slot ${i + 1}: Calculated potential orbit distance ${currentOrbitDistance.toExponential(
          2
        )}m (last was ${lastOrbitDistance.toExponential(2)}m)`
      );

      // Check for starbase collision (using meter-based distance)
      // Make sure CONFIG.STARBASE_ORBIT_DISTANCE was updated in Step 1 to METERS!
      // And that starbase.orbitDistance is also in meters.
      if (
        this.starbase &&
        Math.abs(currentOrbitDistance - this.starbase.orbitDistance) < MIN_PLANET_SEPARATION_M * 0.5
      ) {
        // Use half separation for check
        const oldOrbit = currentOrbitDistance;
        // Adjust by slightly more than half separation, ensuring it increases
        currentOrbitDistance =
          this.starbase.orbitDistance +
          MIN_PLANET_SEPARATION_M * 0.6 * (currentOrbitDistance > this.starbase.orbitDistance ? 1 : -1);
        currentOrbitDistance = Math.max(lastOrbitDistance + MIN_PLANET_SEPARATION_M, currentOrbitDistance); // Ensure still further than last
        currentOrbitDistance = Math.min(MIN_OUTER_ORBIT_M, currentOrbitDistance); // Clamp again
        logger.debug(
          `[System:${this.name}] Slot ${i + 1}: Adjusted orbit from ${oldOrbit.toExponential(
            2
          )}m to ${currentOrbitDistance.toExponential(2)}m to avoid starbase.`
        );
      }

      // Same formation chance logic
      const formationChance = 0.9 - i * 0.03;
      if (this.systemPRNG.random() < formationChance) {
        logger.debug(`[System:${this.name}] Slot ${i + 1}: Planet formation roll success.`);
        // Pass distance in meters to determinePlanetType
        const planetType = this.determinePlanetType(currentOrbitDistance);
        const angle = this.systemPRNG.random(0, Math.PI * 2);
        const planetName = `${this.name} ${this.getRomanNumeral(i + 1)}`;
        // Planet constructor now receives orbit distance in meters
        this.planets[i] = new Planet(
          planetName,
          planetType,
          currentOrbitDistance,
          angle,
          this.systemPRNG,
          this.starType
        );
        planetsGenerated++;
      } else {
        logger.debug(
          `[System:${this.name}] Slot ${i + 1}: Planet formation roll failed (Chance: ${formationChance.toFixed(
            2
          )}). Empty slot.`
        );
        this.planets[i] = null;
      }

      // Update lastOrbitDistance for the next iteration
      if (this.planets[i]) {
        lastOrbitDistance = this.planets[i]!.orbitDistance; // Use the actual planet's distance
      } else {
        // If slot is empty, still advance the distance marker for the next potential planet
        lastOrbitDistance = currentOrbitDistance;
      }

      // Stop generating if orbits get too large (optional)
      if (lastOrbitDistance >= MIN_OUTER_ORBIT_M) {
        logger.info(`[System:${this.name}] Stopping planet generation early, reached outer orbit limit.`);
        break;
      }
    }
    logger.info(`[System:${this.name}] Planet generation complete. ${planetsGenerated} planets created.`);
  }

  /** Determines the likely planet type based on orbit distance (in meters) and star properties. */
  private determinePlanetType(orbitDistance_m: number): string {
    logger.debug(`[System:${this.name}] Determining planet type for orbit ${orbitDistance_m.toExponential(2)}m...`);
    const typePRNG = this.systemPRNG.seedNew('type_' + orbitDistance_m.toFixed(0));
    const starInfo = SPECTRAL_TYPES[this.starType];
    if (!starInfo || !starInfo.radius || !starInfo.temp) {
      logger.warn(
        `[System:${this.name}] Unknown star type '${this.starType}' or missing radius/temp data for planet type determination. Defaulting to G type properties.`
      );
    }
    // Use G type as fallback if info is missing
    const starTemp = starInfo?.temp ?? SPECTRAL_TYPES['G'].temp;
    const starRadius_m = starInfo?.radius ?? 1.0 * 6.957e8; // Use Sun's radius as fallback

    // --- Temperature Calculation (Simplified for Type Selection) ---
    // Convert orbit distance to AU for easier zone comparison
    const AU_IN_METERS = 1.495978707e11;
    const orbitDistance_AU = orbitDistance_m / AU_IN_METERS;

    // Effective temperature calculation using star luminosity relative to Sun (L = (T/T_sun)^4 * (R/R_sun)^2)
    const SUN_TEMP = SPECTRAL_TYPES['G'].temp; // Approx. 5770K
    const SUN_RADIUS_M = 6.957e8; // Approx Sun radius in meters

    // Calculate luminosity relative to the Sun
    const relativeLuminosity = Math.pow(starTemp / SUN_TEMP, 4) * Math.pow(starRadius_m / SUN_RADIUS_M, 2);

    // Calculate effective temperature at planet's distance (approximate, ignoring albedo)
    // T_eff = T_star * sqrt(R_star / (2 * D_orbit)) * (1 - albedo)^0.25
    // Simpler version relative to Earth: T_eff ~ 278.3 * (L_star / L_sun)^0.25 / sqrt(D_orbit_AU)
    // Using 255K as zero-albedo temp at 1AU for Sun-like star
    const effectiveTemp = (278.3 * Math.pow(relativeLuminosity, 0.25)) / Math.sqrt(orbitDistance_AU);

    // Ensure temp is a valid number
    if (!Number.isFinite(effectiveTemp)) {
      logger.error(
        `[System:${
          this.name
        }] Calculated non-finite effective temperature (${effectiveTemp}) for orbit ${orbitDistance_AU.toFixed(
          2
        )} AU. Defaulting type.`
      );
      return 'Rock'; // Default fallback type
    }

    logger.debug(
      `[System:${this.name}] Effective temp at orbit ${orbitDistance_AU.toFixed(2)} AU: ${effectiveTemp.toFixed(
        1
      )}K (RelLum: ${relativeLuminosity.toFixed(2)})`
    );

    // Define temperature zones (adjust boundaries as needed)
    const innerHabitable = 260; // K
    const outerHabitable = 390; // K
    const frostLineApprox = 150; // K
    const hotZone = 800; // K

    let chosenType: string;
    // Determine type based on effective temperature zone
    if (effectiveTemp > hotZone) {
      chosenType = typePRNG.choice(['Molten', 'Molten', 'Rock'])!;
    } else if (effectiveTemp > outerHabitable) {
      chosenType = typePRNG.choice(['Rock', 'Rock', 'Lunar', 'Molten'])!;
    } else if (effectiveTemp > innerHabitable) {
      // Habitable Zone
      chosenType = typePRNG.choice(['Rock', 'Oceanic', 'Oceanic', 'Rock', 'Lunar'])!;
    } else if (effectiveTemp > frostLineApprox) {
      // Cool Zone
      chosenType = typePRNG.choice(['Rock', 'Frozen', 'GasGiant', 'IceGiant', 'Lunar'])!;
    } else {
      // Cold/Outer Zone
      chosenType = typePRNG.choice(['GasGiant', 'IceGiant', 'Frozen', 'Frozen', 'Lunar'])!;
    }
    logger.debug(
      `[System:${this.name}] Determined planet type: ${chosenType} for orbit ${orbitDistance_AU.toFixed(2)} AU.`
    );
    return chosenType;
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

  /** Finds a planet or starbase near the given system coordinates. */
  getObjectNear(x: number, y: number): Planet | Starbase | null {
    const checkRadius = CONFIG.LANDING_DISTANCE;
    const checkRadiusSq = checkRadius * checkRadius;
    let closestObject: Planet | Starbase | null = null;
    let minDistanceSq = checkRadiusSq;

    const objectsToCheck: (Planet | Starbase | null)[] = [...this.planets];
    if (this.starbase) {
      objectsToCheck.push(this.starbase);
    }

    for (const obj of objectsToCheck) {
      if (!obj) continue;
      const dx = obj.systemX - x;
      const dy = obj.systemY - y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestObject = obj;
      }
    }
    return closestObject;
  }

  /** Checks if the given coordinates are beyond the system's edge radius (with buffer). */
  isAtEdge(x: number, y: number): boolean {
    const distSq = x * x + y * y;
    const edgeCheckRadiusSq = (this.edgeRadius * 1.1) ** 2;
    const result = distSq > edgeCheckRadiusSq;
    return result;
  }

  /** Updates the orbital positions of planets and starbases based on elapsed time using Keplerian mechanics and a fixed time scale. */
  updateOrbits(deltaTime: number): void {
    // --- Constants and Time Scale ---
    // Ensure GRAVITATIONAL_CONSTANT_G is defined in src/constants.ts (from Step 1)
    const G = 6.6743e-11; // m^3 kg^-1 s^-2
    const SECONDS_PER_SIMULATED_YEAR = 4 * 60 * 60; // 4 hours = 1 year

    // Get star mass in KG (ensure SPECTRAL_TYPES was updated in Step 1)
    const starInfo = SPECTRAL_TYPES[this.starType];
    const starMassKg = starInfo?.mass; // Should be in KG now

    if (!starMassKg || starMassKg <= 0) {
      logger.error(
        `[System:${this.name}] Cannot update orbits: Invalid or missing star mass (${starMassKg} kg) for type ${this.starType}.`
      );
      return;
    }

    // --- Calculate Angular Change Per Real Second based on Time Scale ---
    // One full orbit (2*PI radians) takes SECONDS_PER_SIMULATED_YEAR real seconds.
    const baseAngularSpeedRadPerSec = (2 * Math.PI) / SECONDS_PER_SIMULATED_YEAR;

    // --- Update Function (for Planets and Starbases) ---
    const updateOrbitalObject = (obj: Planet | Starbase) => {
      // Use orbitDistance in METERS (ensure it was generated correctly in Step 2)
      const r = obj.orbitDistance; // meters

      // Basic validation for distance
      if (!Number.isFinite(r) || r <= 0) {
        logger.warn(`[System:${this.name}] Invalid orbit distance (${r}m) for ${obj.name}. Skipping orbit update.`);
        // Optionally reset position to 0,0?
        obj.systemX = 0;
        obj.systemY = 0;
        return;
      }

      // Calculate the change in angle for this frame based on the fixed time scale
      const deltaAngle = baseAngularSpeedRadPerSec * deltaTime;

      // --- Update Angle and Position ---
      obj.orbitAngle = (obj.orbitAngle + deltaAngle) % (Math.PI * 2);

      // Validate angle before using trigonometric functions
      if (!Number.isFinite(obj.orbitAngle)) {
        logger.warn(
          `[System:${this.name}] Invalid orbitAngle (${obj.orbitAngle}) calculated for ${obj.name}. Resetting to 0.`
        );
        obj.orbitAngle = 0;
      }

      obj.systemX = Math.cos(obj.orbitAngle) * r; // r is already in meters
      obj.systemY = Math.sin(obj.orbitAngle) * r; // r is already in meters

      // Final position validation
      if (!Number.isFinite(obj.systemX) || !Number.isFinite(obj.systemY)) {
        logger.error(
          `[System:${this.name}] CRITICAL: Non-finite position calculated for ${obj.name}. Resetting position. Angle: ${obj.orbitAngle}, Dist: ${r}`
        );
        obj.systemX = 0;
        obj.systemY = 0;
      }
    };

    // --- Apply Update to Planets ---
    this.planets.forEach((planet) => {
      if (planet) {
        updateOrbitalObject(planet);
      }
    });

    // --- Apply Update to Starbase ---
    if (this.starbase) {
      updateOrbitalObject(this.starbase);
    }
  }
} // End SolarSystem class
