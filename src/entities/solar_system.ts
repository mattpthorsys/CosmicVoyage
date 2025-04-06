// src/entities/solar_system.ts (Enhanced Logging)

import { CONFIG } from '../config';
// Make sure SPECTRAL_TYPES is imported if needed by determinePlanetType
import { SPECTRAL_DISTRIBUTION, SPECTRAL_TYPES } from '../constants'; // Added SPECTRAL_TYPES back
import { PRNG } from '../utils/prng';
import { Planet } from './planet';
import { Starbase } from './starbase';
import { logger } from '../utils/logger'; // Import the logger

export class SolarSystem {
    readonly starX: number; // World coordinate X where this system is centered
    readonly starY: number; // World coordinate Y
    readonly systemPRNG: PRNG; // PRNG seeded specifically for this system's generation
    readonly starType: string; // Spectral type (e.g., 'G', 'M')
    readonly name: string; // Procedurally generated name
    readonly planets: (Planet | null)[]; // Array holding planets, null slots for empty orbits
    readonly starbase: Starbase | null; // Optional starbase in the system
    readonly edgeRadius: number; // Approx radius encompassing the outermost object for rendering/exit checks

    constructor(starX: number, starY: number, gameSeedPRNG: PRNG) {
        this.starX = starX; //
        this.starY = starY; //
        const starSeed = `star_${starX},${starY}`; // Unique seed string based on coordinates
        // Seed a PRNG specifically for this system using the main game seed and the location seed
        this.systemPRNG = gameSeedPRNG.seedNew(starSeed); //
        logger.debug(`[System:${starX},${starY}] Initialized PRNG with seed: ${this.systemPRNG.getInitialSeed()}`);

        // Determine star type based on distribution constants
        this.starType = this.systemPRNG.choice(SPECTRAL_DISTRIBUTION)!; // Assumes distribution is not empty
        // Generate a name for the system
        this.name = this.generateSystemName(); // Logs internally
        logger.info(`[System:${this.name}] Created system at world [${this.starX},${this.starY}]. Star Type: ${this.starType}.`);

        // Initialize planet array
        this.planets = new Array(CONFIG.MAX_PLANETS_PER_SYSTEM).fill(null); //

        // Decide if a starbase exists *before* generating planets to reserve its orbit
        this.starbase = (this.systemPRNG.random() < CONFIG.STARBASE_PROBABILITY) // Check against config probability
            ? new Starbase(this.name, this.systemPRNG, this.name) // Create Starbase if check passes (Starbase constructor logs)
            : null; // Otherwise, no starbase
        if (this.starbase) {
            // Use logger instead of console.log
            logger.info(`[System:${this.name}] Starbase generated at orbit distance ${this.starbase.orbitDistance.toFixed(0)}.`); //
        }

        // Generate planets, avoiding the starbase orbit if applicable
        this.generatePlanets(); // Logs internally

        // Determine the furthest object (planet or starbase) for edge radius calculation
        let maxOrbit = 0;
        this.planets.forEach(p => { // Check all planets
            if (p) maxOrbit = Math.max(maxOrbit, p.orbitDistance); //
        });
        if (this.starbase) { // Check starbase if it exists
            maxOrbit = Math.max(maxOrbit, this.starbase.orbitDistance); //
        }
        logger.debug(`[System:${this.name}] Furthest object orbit distance: ${maxOrbit.toFixed(0)}`);

        // Set edge radius significantly beyond the outermost object, with a minimum size
        this.edgeRadius = Math.max(50000, maxOrbit * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR); //
        logger.debug(`[System:${this.name}] System edge radius calculated: ${this.edgeRadius.toFixed(0)} (Factor: ${CONFIG.SYSTEM_EDGE_RADIUS_FACTOR})`);
    }

    /** Generates a procedural name for the system. */
    private generateSystemName(): string {
        logger.debug(`[System] Generating system name...`);
        // Lists of prefixes and rules for naming
        const prefixes = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega','Proxima','Cygnus','Kepler','Gliese','HD','Trappist','Luyten','Wolf','Ross','Barnard']; //
        const number = this.systemPRNG.randomInt(1, 999); // Random number component
        const suffix = String.fromCharCode(65 + this.systemPRNG.randomInt(0, 25)); // Random capital letter suffix (A-Z)
        const name = `${this.systemPRNG.choice(prefixes)}-${number}${suffix}`; // Combine parts
        logger.debug(`[System] Generated name: ${name}`);
        return name; //
    }

    /** Populates the planets array for the system. */
    private generatePlanets(): void {
        logger.info(`[System:${this.name}] Generating planets...`);
        let lastOrbitDistance = this.systemPRNG.random(5000, 20000); // Start close to the star
        const orbitFactorBase = this.systemPRNG.random(1.4, 1.9); // Base for orbital spacing (like Titius-Bode law)
        let planetsGenerated = 0;

        for (let i = 0; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
             logger.debug(`[System:${this.name}] Considering planet slot ${i + 1}...`);
             // Calculate next orbit distance, increasing further out
            let currentOrbitDistance = lastOrbitDistance * (orbitFactorBase + this.systemPRNG.random(-0.1, 0.1)) // Apply base factor with randomness
                                     + this.systemPRNG.random(1000, 5000) * (i + 1); // Add some linear increase
            currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance); // Ensure minimum spacing
            logger.debug(`[System:${this.name}] Slot ${i + 1}: Calculated potential orbit distance ${currentOrbitDistance.toFixed(0)} (last was ${lastOrbitDistance.toFixed(0)})`);

            // Check for collision with starbase orbit
            if (this.starbase && Math.abs(currentOrbitDistance - this.starbase.orbitDistance) < 5000) {
                 const oldOrbit = currentOrbitDistance;
                 // Push planet orbit slightly outside or inside starbase orbit
                 currentOrbitDistance = this.starbase.orbitDistance + 5000 * (currentOrbitDistance > this.starbase.orbitDistance ? 1 : -1); //
                 currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance); // Ensure it's still further than last planet
                 logger.debug(`[System:${this.name}] Slot ${i + 1}: Adjusted orbit from ${oldOrbit.toFixed(0)} to ${currentOrbitDistance.toFixed(0)} to avoid starbase.`);
            }

            // Chance for a planet to form decreases slightly further out
            const formationChance = 0.9 - (i * 0.03); //
            if (this.systemPRNG.random() < formationChance) { // Roll for planet formation
                logger.debug(`[System:${this.name}] Slot ${i + 1}: Planet formation roll success.`);
                const planetType = this.determinePlanetType(currentOrbitDistance); // Determine type based on distance/star (logs internally)
                const angle = this.systemPRNG.random(0, Math.PI * 2); // Random starting angle in orbit
                const planetName = `${this.name} ${this.getRomanNumeral(i + 1)}`; // Name using Roman numeral
                // Create the new Planet instance (Planet constructor logs its details)
                this.planets[i] = new Planet(planetName, planetType, currentOrbitDistance, angle, this.systemPRNG, this.starType); //
                planetsGenerated++;
            } else {
                 logger.debug(`[System:${this.name}] Slot ${i + 1}: Planet formation roll failed (Chance: ${formationChance.toFixed(2)}). Empty slot.`);
                 this.planets[i] = null; //
            }

            // Update last orbit distance for next iteration
            if(this.planets[i]) {
                 lastOrbitDistance = this.planets[i]!.orbitDistance; // Use actual planet orbit if created
            } else {
                 lastOrbitDistance = currentOrbitDistance; // Use calculated distance if slot is empty
            }
        }
        logger.info(`[System:${this.name}] Planet generation complete. ${planetsGenerated} planets created.`);
    }

    /** Converts a number to a Roman numeral string (simplified). */
    private getRomanNumeral(num: number): string {
         // Simple implementation for small numbers
         if (num < 1 || num > 20) return num.toString(); // Fallback for larger numbers
         const romanMap: Record<number, string> = { // Map values to symbols
             1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X',
             11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV', 15: 'XV', 16: 'XVI', 17: 'XVII', 18: 'XVIII', 19: 'XIX', 20: 'XX'
         };
         // More complex logic needed for numbers > 20
         // const romanMap: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
         // let result = '';
         // for (const key of Object.keys(romanMap)) {
         //      const count = Math.floor(num / romanMap[key]);
         //      num -= count * romanMap[key];
         //      result += key.repeat(count);
         // }
         return romanMap[num] || num.toString(); // Use map or fallback to number string
     }


    /** Determines the likely planet type based on orbit distance and star type. */
    private determinePlanetType(orbitDistance: number): string {
        logger.debug(`[System:${this.name}] Determining planet type for orbit ${orbitDistance.toFixed(0)}...`);
        const typePRNG = this.systemPRNG.seedNew("type_" + orbitDistance.toFixed(0)); // Seed PRNG for type determination
        const starInfo = SPECTRAL_TYPES[this.starType];
        if (!starInfo) {
             logger.warn(`[System:${this.name}] Unknown star type '${this.starType}' for planet type determination. Defaulting to G type.`);
        }
        const starTemp = starInfo?.temp ?? SPECTRAL_TYPES['G'].temp; // Use fallback

        // Calculate approximate effective temperature at this orbit distance
        const starLum = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4; // Luminosity relative to Sol
        const effectiveTemp = (starLum / (orbitDistance / 50000) ** 2) ** 0.25 * 280; // Approx equilibrium temp in K (using 280K as Earth baseline at 50k units?)
        logger.debug(`[System:${this.name}] Effective temp at orbit ${orbitDistance.toFixed(0)}: ${effectiveTemp.toFixed(1)}K`);

        // Define temperature zones (adjust values as needed)
        const innerHabitable = 260; // Lower bound for liquid water (optimistic)
        const outerHabitable = 390; // Upper bound for liquid water (optimistic)
        const frostLineApprox = 150; // Where ices become common
        const hotZone = 800; // Too hot for complex geology?

        let chosenType: string;
        // Determine type based on temperature zone
        if (effectiveTemp > hotZone) {
             chosenType = typePRNG.choice(['Molten', 'Molten', 'Rock'])!; // Very hot: Molten or maybe resilient Rock
        } else if (effectiveTemp > outerHabitable) { // Hot zone
             chosenType = typePRNG.choice(['Rock', 'Rock', 'Lunar', 'Molten'])!; // Rock, Lunar, maybe still Molten
        } else if (effectiveTemp > innerHabitable) { // Habitable zone (liquid water possible)
             chosenType = typePRNG.choice(['Rock', 'Oceanic', 'Oceanic', 'Rock', 'Lunar'])!; // Higher chance of Oceanic
        } else if (effectiveTemp > frostLineApprox) { // Cold zone (between habitable and frost line)
             chosenType = typePRNG.choice(['Rock', 'Frozen', 'GasGiant', 'IceGiant', 'Lunar'])!; // Rock, Frozen, maybe gas giants start forming
        } else { // Very cold zone (beyond frost line)
             chosenType = typePRNG.choice(['GasGiant', 'IceGiant', 'Frozen', 'Frozen', 'Lunar'])!; // Gas/Ice Giants, Frozen worlds dominate
        }
        logger.debug(`[System:${this.name}] Determined planet type: ${chosenType} for orbit ${orbitDistance.toFixed(0)}.`);
        return chosenType; //
    }


    /** Finds a planet or starbase near the given system coordinates. */
    getObjectNear(x: number, y: number): Planet | Starbase | null {
        // logger.debug(`[System:${this.name}] Checking for object near system coords [${x.toFixed(0)}, ${y.toFixed(0)}]`);
    
        const checkRadius = CONFIG.LANDING_DISTANCE; // Use the updated landing distance
        const checkRadiusSq = checkRadius * checkRadius; // Use squared distance
    
        let closestObject: Planet | Starbase | null = null;
        let minDistanceSq = checkRadiusSq; // Start with max allowed distance squared
    
        // Combine planets and starbase (if exists) into one list to check
        const objectsToCheck: (Planet | Starbase | null)[] = [...this.planets];
        if (this.starbase) {
            objectsToCheck.push(this.starbase);
        }
    
        // Iterate through all potential objects
        for (const obj of objectsToCheck) {
            if (!obj) continue; // Skip empty slots
    
            const dx = obj.systemX - x;
            const dy = obj.systemY - y;
            const distanceSq = dx * dx + dy * dy;
    
            // Check if this object is within range AND closer than the current closest
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq; // Update minimum distance found
                closestObject = obj;       // Update closest object found
            }
        }
    
        // if (closestObject) {
        //     logger.debug(`[System:${this.name}] Found nearby object: ${closestObject.name} at distSq ${minDistanceSq.toFixed(0)}`);
        // }
    
        return closestObject; // Return the closest object found (or null if none were in range)
      }

    /** Checks if the given coordinates are beyond the system's edge radius (with buffer). */
    isAtEdge(x: number, y: number): boolean {
        const distSq = x * x + y * y; // Squared distance from star center (0,0)
        // Use a slightly larger radius for the check to provide a buffer zone
        const edgeCheckRadiusSq = (this.edgeRadius * 1.1) ** 2; // Check against 110% of edge radius squared
        const result = distSq > edgeCheckRadiusSq;
        // logger.debug(`[System:${this.name}] isAtEdge check at [${x.toFixed(0)}, ${y.toFixed(0)}]: DistSq=${distSq.toFixed(0)}, EdgeCheckSq=${edgeCheckRadiusSq.toFixed(0)} -> ${result}`); // Noisy
        return result; //
    }


    /** Updates the orbital positions of planets and starbases based on elapsed time. */
    updateOrbits(deltaTime: number): void {
        const baseOrbitSpeed = 1.0 / 50000;
        const timeScaledSpeedFactor = deltaTime * CONFIG.SYSTEM_ORBIT_SPEED_FACTOR * 10000;
    
        // --- Update Planets ---
        this.planets.forEach((planet) => {
          if (!planet) return;
    
          const safeOrbitDistance = Math.max(1000, planet.orbitDistance); // Ensure positive distance
    
          // **** START ADDED CHECKS ****
          let distanceScaleFactor = 1.0; // Default factor
          const scaleCalcValue = safeOrbitDistance / 50000;
          if (scaleCalcValue > 0) { // Avoid sqrt of zero or negative
            distanceScaleFactor = Math.sqrt(scaleCalcValue);
          } else {
              logger.warn(`[System:${this.name}] Invalid scaleCalcValue (${scaleCalcValue.toFixed(2)}) for distanceScaleFactor for ${planet.name}. Using default factor.`);
              distanceScaleFactor = 1.0; // Use a default if calculation is invalid
          }
    
          if (!Number.isFinite(distanceScaleFactor) || distanceScaleFactor <= 0) {
              logger.warn(`[System:${this.name}] Invalid distanceScaleFactor (${distanceScaleFactor}) calculated for ${planet.name}. Using default factor 1.0.`);
              distanceScaleFactor = 1.0; // Prevent division by zero/NaN/Infinity
          }
          // **** END ADDED CHECKS ****
    
          let angularSpeed = (baseOrbitSpeed / distanceScaleFactor) * timeScaledSpeedFactor;
    
          // **** START ADDED CHECKS ****
          if (!Number.isFinite(angularSpeed)) {
            logger.warn(`[System:${this.name}] Invalid angularSpeed (${angularSpeed}) calculated for ${planet.name}. Resetting angle.`);
            angularSpeed = 0; // Prevent NaN angle
          }
           // **** END ADDED CHECKS ****
    
          planet.orbitAngle = (planet.orbitAngle + angularSpeed) % (Math.PI * 2);
    
           // **** START ADDED CHECKS ****
          // Ensure angle is valid before trig functions
           if (!Number.isFinite(planet.orbitAngle)) {
             logger.warn(`[System:${this.name}] Invalid orbitAngle (${planet.orbitAngle}) for ${planet.name}. Resetting to 0.`);
             planet.orbitAngle = 0;
           }
           // Ensure orbit distance is valid before multiplication
           const validOrbitDist = Number.isFinite(planet.orbitDistance) ? planet.orbitDistance : 0;
           // **** END ADDED CHECKS ****
    
          planet.systemX = Math.cos(planet.orbitAngle) * validOrbitDist; // Use validOrbitDist
          planet.systemY = Math.sin(planet.orbitAngle) * validOrbitDist; // Use validOrbitDist
    
           // **** Final Check ****
           if (!Number.isFinite(planet.systemX) || !Number.isFinite(planet.systemY)) {
               logger.error(`[System:${this.name}] CRITICAL: Non-finite position calculated for ${planet.name}. Resetting position. Angle: ${planet.orbitAngle}, Dist: ${validOrbitDist}`);
               planet.systemX = 0;
               planet.systemY = 0;
           }
        });
    
        // --- Update Starbase (similar checks needed) ---
        if (this.starbase) {
            const safeOrbitDistance = Math.max(1000, this.starbase.orbitDistance);
            let distanceScaleFactor = 1.0;
            const scaleCalcValue = safeOrbitDistance / 50000;
            if (scaleCalcValue > 0) distanceScaleFactor = Math.sqrt(scaleCalcValue);
            else distanceScaleFactor = 1.0;
    
            if (!Number.isFinite(distanceScaleFactor) || distanceScaleFactor <= 0) distanceScaleFactor = 1.0;
    
            let angularSpeed = (baseOrbitSpeed / distanceScaleFactor) * timeScaledSpeedFactor;
            if (!Number.isFinite(angularSpeed)) angularSpeed = 0;
    
            // Assuming mutable properties in Starbase
            try {
                const sb = this.starbase as Starbase;
                sb.orbitAngle = (sb.orbitAngle + angularSpeed) % (Math.PI * 2);
                if (!Number.isFinite(sb.orbitAngle)) sb.orbitAngle = 0;
    
                const validOrbitDist = Number.isFinite(sb.orbitDistance) ? sb.orbitDistance : 0;
                sb.systemX = Math.cos(sb.orbitAngle) * validOrbitDist;
                sb.systemY = Math.sin(sb.orbitAngle) * validOrbitDist;
    
                if (!Number.isFinite(sb.systemX) || !Number.isFinite(sb.systemY)) {
                   logger.error(`[System:${this.name}] CRITICAL: Non-finite position calculated for ${sb.name}. Resetting position.`);
                   sb.systemX = 0; sb.systemY = 0;
               }
            } catch { /* already handled */ }
        }
      }

} // End SolarSystem class