// src/entities/solar_system.ts (Moved ORBITAL_CONSTANT to class level and reduced value)

import { CONFIG } from '../config';
import { SPECTRAL_DISTRIBUTION, SPECTRAL_TYPES } from '../constants';
import { PRNG } from '../utils/prng';
import { Planet } from './planet';
import { Starbase } from './starbase';
import { logger } from '../utils/logger';

export class SolarSystem {
    // Adjust this value to globally speed up or slow down orbital mechanics.
    // Smaller value = slower orbits, larger value = faster orbits.
    private static readonly REALISTIC_ORBIT_SPEED_CONSTANT = 5e3; // Tunable constant

    readonly starX: number; // World coordinate X where this system is centered
    readonly starY: number; // World coordinate Y
    readonly systemPRNG: PRNG; // PRNG seeded specifically for this system's generation
    readonly starType: string; // Spectral type (e.g., 'G', 'M')
    readonly name: string; // Procedurally generated name
    readonly planets: (Planet | null)[]; // Array holding planets, null slots for empty orbits
    readonly starbase: Starbase | null; // Optional starbase in the system
    readonly edgeRadius: number; // Approx radius encompassing the outermost object for rendering/exit checks

    constructor(starX: number, starY: number, gameSeedPRNG: PRNG) {
        this.starX = starX;
        this.starY = starY;
        const starSeed = `star_${starX},${starY}`;
        this.systemPRNG = gameSeedPRNG.seedNew(starSeed);
        logger.debug(`[System:${starX},${starY}] Initialized PRNG with seed: ${this.systemPRNG.getInitialSeed()}`);
        this.starType = this.systemPRNG.choice(SPECTRAL_DISTRIBUTION)!;
        this.name = this.generateSystemName();
        logger.info(`[System:${this.name}] Created system at world [${this.starX},${this.starY}]. Star Type: ${this.starType}.`);
        this.planets = new Array(CONFIG.MAX_PLANETS_PER_SYSTEM).fill(null);

        this.starbase = (this.systemPRNG.random() < CONFIG.STARBASE_PROBABILITY)
            ? new Starbase(this.name, this.systemPRNG, this.name)
            : null;
        if (this.starbase) {
            logger.info(`[System:${this.name}] Starbase generated at orbit distance ${this.starbase.orbitDistance.toFixed(0)}.`);
        }

        this.generatePlanets();

        let maxOrbit = 0;
        this.planets.forEach(p => {
            if (p) maxOrbit = Math.max(maxOrbit, p.orbitDistance);
        });
        if (this.starbase) {
            maxOrbit = Math.max(maxOrbit, this.starbase.orbitDistance);
        }
        logger.debug(`[System:${this.name}] Furthest object orbit distance: ${maxOrbit.toFixed(0)}`);
        this.edgeRadius = Math.max(50000, maxOrbit * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR);
        logger.debug(`[System:${this.name}] System edge radius calculated: ${this.edgeRadius.toFixed(0)} (Factor: ${CONFIG.SYSTEM_EDGE_RADIUS_FACTOR})`);
    }

    /** Generates a procedural name for the system. */
    private generateSystemName(): string {
        logger.debug(`[System] Generating system name...`);
        const prefixes = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega','Proxima','Cygnus','Kepler','Gliese','HD','Trappist','Luyten','Wolf','Ross','Barnard', 'Benfblunk', 'Harwoe', 'Smerg', 'Hiss'];
        const number = this.systemPRNG.randomInt(1, 999);
        const suffix = String.fromCharCode(65 + this.systemPRNG.randomInt(0, 25));
        const name = `${this.systemPRNG.choice(prefixes)}-${number}${suffix}`;
        logger.debug(`[System] Generated name: ${name}`);
        return name;
    }

    /** Populates the planets array for the system. */
    private generatePlanets(): void {
        logger.info(`[System:${this.name}] Generating planets...`);
        let lastOrbitDistance = this.systemPRNG.random(5000, 20000);
        const orbitFactorBase = this.systemPRNG.random(1.4, 1.9);
        let planetsGenerated = 0;
        for (let i = 0; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
             logger.debug(`[System:${this.name}] Considering planet slot ${i + 1}...`);
            let currentOrbitDistance = lastOrbitDistance * (orbitFactorBase + this.systemPRNG.random(-0.1, 0.1))
                                     + this.systemPRNG.random(1000, 5000) * (i + 1);
            currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance);
            logger.debug(`[System:${this.name}] Slot ${i + 1}: Calculated potential orbit distance ${currentOrbitDistance.toFixed(0)} (last was ${lastOrbitDistance.toFixed(0)})`);
            if (this.starbase && Math.abs(currentOrbitDistance - this.starbase.orbitDistance) < 5000) {
                 const oldOrbit = currentOrbitDistance;
                 currentOrbitDistance = this.starbase.orbitDistance + 5000 * (currentOrbitDistance > this.starbase.orbitDistance ? 1 : -1);
                 currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance);
                 logger.debug(`[System:${this.name}] Slot ${i + 1}: Adjusted orbit from ${oldOrbit.toFixed(0)} to ${currentOrbitDistance.toFixed(0)} to avoid starbase.`);
            }

            const formationChance = 0.9 - (i * 0.03);
            if (this.systemPRNG.random() < formationChance) {
                logger.debug(`[System:${this.name}] Slot ${i + 1}: Planet formation roll success.`);
                const planetType = this.determinePlanetType(currentOrbitDistance);
                const angle = this.systemPRNG.random(0, Math.PI * 2);
                const planetName = `${this.name} ${this.getRomanNumeral(i + 1)}`;
                this.planets[i] = new Planet(planetName, planetType, currentOrbitDistance, angle, this.systemPRNG, this.starType);
                planetsGenerated++;
            } else {
                 logger.debug(`[System:${this.name}] Slot ${i + 1}: Planet formation roll failed (Chance: ${formationChance.toFixed(2)}). Empty slot.`);
                 this.planets[i] = null;
            }

            if(this.planets[i]) {
                 lastOrbitDistance = this.planets[i]!.orbitDistance;
            } else {
                 lastOrbitDistance = currentOrbitDistance;
            }
        }
        logger.info(`[System:${this.name}] Planet generation complete. ${planetsGenerated} planets created.`);
    }

    /** Converts a number to a Roman numeral string (simplified). */
    private getRomanNumeral(num: number): string {
         if (num < 1 || num > 20) return num.toString();
         const romanMap: Record<number, string> = {
             1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X',
             11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV', 15: 'XV', 16: 'XVI', 17: 'XVII', 18: 'XVIII', 19: 'XIX', 20: 'XX'
         };
         return romanMap[num] || num.toString();
     }


    /** Determines the likely planet type based on orbit distance and star type. */
    private determinePlanetType(orbitDistance: number): string {
        logger.debug(`[System:${this.name}] Determining planet type for orbit ${orbitDistance.toFixed(0)}...`);
        const typePRNG = this.systemPRNG.seedNew("type_" + orbitDistance.toFixed(0));
        const starInfo = SPECTRAL_TYPES[this.starType];
        if (!starInfo) {
             logger.warn(`[System:${this.name}] Unknown star type '${this.starType}' for planet type determination. Defaulting to G type.`);
        }
        const starTemp = starInfo?.temp ?? SPECTRAL_TYPES['G'].temp;

        const starLum = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4;
        const effectiveTemp = (starLum / (orbitDistance / 50000) ** 2) ** 0.25 * 280;
        logger.debug(`[System:${this.name}] Effective temp at orbit ${orbitDistance.toFixed(0)}: ${effectiveTemp.toFixed(1)}K`);
        const innerHabitable = 260;
        const outerHabitable = 390;
        const frostLineApprox = 150;
        const hotZone = 800;

        let chosenType: string;
        if (effectiveTemp > hotZone) {
             chosenType = typePRNG.choice(['Molten', 'Molten', 'Rock'])!;
        } else if (effectiveTemp > outerHabitable) {
             chosenType = typePRNG.choice(['Rock', 'Rock', 'Lunar', 'Molten'])!;
        } else if (effectiveTemp > innerHabitable) {
             chosenType = typePRNG.choice(['Rock', 'Oceanic', 'Oceanic', 'Rock', 'Lunar'])!;
        } else if (effectiveTemp > frostLineApprox) {
             chosenType = typePRNG.choice(['Rock', 'Frozen', 'GasGiant', 'IceGiant', 'Lunar'])!;
        } else {
             chosenType = typePRNG.choice(['GasGiant', 'IceGiant', 'Frozen', 'Frozen', 'Lunar'])!;
        }
        logger.debug(`[System:${this.name}] Determined planet type: ${chosenType} for orbit ${orbitDistance.toFixed(0)}.`);
        return chosenType;
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


    /** Updates the orbital positions of planets and starbases based on elapsed time. */
    updateOrbits(deltaTime: number): void {

        // Used to scale the constant based on deltaTime
        // Keep existing scaling? Or adjust/remove if REALISTIC_ORBIT_SPEED_CONSTANT handles it all? Let's keep it for now.
        const timeScaledSpeedFactor = deltaTime * CONFIG.SYSTEM_ORBIT_SPEED_FACTOR * 10000;

        // --- Update Planets ---
        this.planets.forEach((planet) => {
            if (!planet) return;

            const safeOrbitDistance = Math.max(1000, planet.orbitDistance); // Ensure positive distance

            // --- Realistic Angular Speed Calculation ---
            // Use the class constant REALISTIC_ORBIT_SPEED_CONSTANT
            let angularSpeed = (SolarSystem.REALISTIC_ORBIT_SPEED_CONSTANT / (safeOrbitDistance ** 1.5)) * timeScaledSpeedFactor;

            // Safety check for calculated speed
            if (!Number.isFinite(angularSpeed)) {
                logger.warn(`[System:${this.name}] Invalid angularSpeed (${angularSpeed}) calculated for ${planet.name}. Resetting angle.`);
                angularSpeed = 0; // Prevent NaN angle
            }

            // --- Update Angle and Position ---
            planet.orbitAngle = (planet.orbitAngle + angularSpeed) % (Math.PI * 2);

            // Ensure angle is valid before trig functions
            if (!Number.isFinite(planet.orbitAngle)) {
                logger.warn(`[System:${this.name}] Invalid orbitAngle (${planet.orbitAngle}) for ${planet.name}. Resetting to 0.`);
                planet.orbitAngle = 0;
            }
            // Ensure orbit distance is valid before multiplication
            const validOrbitDist = Number.isFinite(planet.orbitDistance) ? planet.orbitDistance : 0;

            planet.systemX = Math.cos(planet.orbitAngle) * validOrbitDist;
            planet.systemY = Math.sin(planet.orbitAngle) * validOrbitDist;

            // Final Check for position
            if (!Number.isFinite(planet.systemX) || !Number.isFinite(planet.systemY)) {
                logger.error(`[System:${this.name}] CRITICAL: Non-finite position calculated for ${planet.name}. Resetting position. Angle: ${planet.orbitAngle}, Dist: ${validOrbitDist}`);
                planet.systemX = 0;
                planet.systemY = 0;
            }
        });

        // --- Update Starbase (Apply the same realistic physics) ---
        if (this.starbase) {
            const sb = this.starbase as Starbase; // Assuming mutable properties
            const safeOrbitDistance = Math.max(1000, sb.orbitDistance);

            // --- Realistic Angular Speed Calculation ---
            // Use the class constant REALISTIC_ORBIT_SPEED_CONSTANT
            let angularSpeed = (SolarSystem.REALISTIC_ORBIT_SPEED_CONSTANT / (safeOrbitDistance ** 1.5)) * timeScaledSpeedFactor;

            // Safety check
            if (!Number.isFinite(angularSpeed)) {
                 logger.warn(`[System:${this.name}] Invalid angularSpeed (${angularSpeed}) calculated for ${sb.name}. Resetting angle.`);
                 angularSpeed = 0;
             }

            // --- Update Angle and Position ---
            try {
                sb.orbitAngle = (sb.orbitAngle + angularSpeed) % (Math.PI * 2);
                if (!Number.isFinite(sb.orbitAngle)) sb.orbitAngle = 0;

                const validOrbitDist = Number.isFinite(sb.orbitDistance) ? sb.orbitDistance : 0;
                sb.systemX = Math.cos(sb.orbitAngle) * validOrbitDist;
                sb.systemY = Math.sin(sb.orbitAngle) * validOrbitDist;

                // Final check
                if (!Number.isFinite(sb.systemX) || !Number.isFinite(sb.systemY)) {
                   logger.error(`[System:${this.name}] CRITICAL: Non-finite position calculated for ${sb.name}. Resetting position.`);
                   sb.systemX = 0; sb.systemY = 0;
               }
            } catch(e) {
                logger.error(`[System:${this.name}] Error updating starbase orbit: ${e}`);
             }
        }
      }

} // End SolarSystem class