// src/entities/solar_system.ts

import { CONFIG } from '../config';
import { SPECTRAL_DISTRIBUTION, SPECTRAL_TYPES } from '../constants';
import { PRNG } from '../utils/prng';
import { Planet } from './planet';
import { Starbase } from './starbase';

export class SolarSystem {
    readonly starX: number; // World coordinate
    readonly starY: number; // World coordinate
    readonly systemPRNG: PRNG; // PRNG seeded for this system
    readonly starType: string; // e.g., 'G', 'M'
    readonly name: string;
    readonly planets: (Planet | null)[]; // Array, potentially with null slots
    readonly starbase: Starbase | null;
    readonly edgeRadius: number; // Furthest extent for rendering/exit checks

    constructor(starX: number, starY: number, gameSeedPRNG: PRNG) {
        this.starX = starX;
        this.starY = starY;
        const starSeed = `star_${starX},${starY}`;
        this.systemPRNG = gameSeedPRNG.seedNew(starSeed); // Seed specifically for this system

        this.starType = this.systemPRNG.choice(SPECTRAL_DISTRIBUTION)!; // Assumes distribution is not empty
        this.name = this.generateSystemName();

        this.planets = new Array(CONFIG.MAX_PLANETS_PER_SYSTEM).fill(null);

        // Decide if a starbase exists *before* generating planets to avoid collisions
        this.starbase = (this.systemPRNG.random() < CONFIG.STARBASE_PROBABILITY)
            ? new Starbase(this.name, this.systemPRNG, this.name) // Pass system PRNG
            : null;
        if (this.starbase) {
            console.log(`Starbase generated in ${this.name} at orbit ${this.starbase.orbitDistance.toFixed(0)}`);
        }


        this.generatePlanets();

        // Determine the furthest object (planet or starbase) for edge radius calculation
        let maxOrbit = 0;
        this.planets.forEach(p => {
            if (p) maxOrbit = Math.max(maxOrbit, p.orbitDistance);
        });
        if (this.starbase) {
            maxOrbit = Math.max(maxOrbit, this.starbase.orbitDistance);
        }

        // Set edge radius significantly beyond the outermost object
        this.edgeRadius = Math.max(50000, maxOrbit * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR);
    }

    /** Generates a procedural name for the system. */
    private generateSystemName(): string {
        // Simple procedural name generator
        const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega', 'Proxima', 'Cygnus', 'Kepler', 'Gliese', 'HD', 'Trappist', 'Luyten', 'Wolf', 'Ross', 'Barnard'];
        const number = this.systemPRNG.randomInt(1, 999);
        const suffix = String.fromCharCode(65 + this.systemPRNG.randomInt(0, 25)); // A-Z
        return `${this.systemPRNG.choice(prefixes)}-${number}${suffix}`;
    }

    /** Populates the planets array for the system. */
    private generatePlanets(): void {
        // Use Titius-Bode like progression, but with randomness
        let lastOrbitDistance = this.systemPRNG.random(5000, 20000); // Initial distance range for first planet
        const orbitFactorBase = this.systemPRNG.random(1.4, 1.9); // Base multiplier for next orbit

        for (let i = 0; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
            // Calculate next orbit distance
            let currentOrbitDistance = lastOrbitDistance * (orbitFactorBase + this.systemPRNG.random(-0.1, 0.1))
                + this.systemPRNG.random(1000, 5000) * (i + 1); // Add increasing random factor

            // Ensure minimum separation from last planet
            currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance);

            // Ensure minimum separation from starbase if it exists
            if (this.starbase && Math.abs(currentOrbitDistance - this.starbase.orbitDistance) < 5000) {
                // Push planet orbit further away from starbase
                 currentOrbitDistance = this.starbase.orbitDistance + 5000 * (currentOrbitDistance > this.starbase.orbitDistance ? 1 : -1);
                 // Ensure it's still further than the previous planet
                 currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance);
            }


            // Decreasing chance of planet formation further out
            const formationChance = 0.9 - (i * 0.03);
            if (this.systemPRNG.random() < formationChance) {
                const planetType = this.determinePlanetType(currentOrbitDistance);
                const angle = this.systemPRNG.random(0, Math.PI * 2); // Random position in orbit
                const planetName = `${this.name} ${this.getRomanNumeral(i + 1)}`;
                this.planets[i] = new Planet(planetName, planetType, currentOrbitDistance, angle, this.systemPRNG, this.starType);
            } else {
                this.planets[i] = null; // No planet formed in this slot
            }

            // Update last orbit distance for next iteration
            if(this.planets[i]) {
                lastOrbitDistance = this.planets[i]!.orbitDistance;
            } else {
                // If no planet formed, still advance the distance roughly
                lastOrbitDistance = currentOrbitDistance;
            }
        }
    }

    /** Converts a number to a Roman numeral string (simplified). */
    private getRomanNumeral(num: number): string {
        if (num < 1 || num > 20) return num.toString(); // Handle only reasonable numbers for planets
        const romanMap: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
        let result = '';
        for (const key of Object.keys(romanMap)) {
            const count = Math.floor(num / romanMap[key]);
            num -= count * romanMap[key];
            result += key.repeat(count);
        }
        return result || '?';
    }

    /** Determines the likely planet type based on orbit distance and star type. */
    private determinePlanetType(orbitDistance: number): string {
        const typePRNG = this.systemPRNG.seedNew("type_" + orbitDistance); // Seed based on distance

        const starTemp = SPECTRAL_TYPES[this.starType]?.temp || SPECTRAL_TYPES['G'].temp;
        const starLum = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4; // Luminosity relative to Sol

        // Calculate effective temperature based on luminosity and distance (simplified)
        // Teff ~ (L/d^2)^0.25 * T_earth_ref
        const effectiveTemp = (starLum / (orbitDistance / 50000) ** 2) ** 0.25 * 280; // Using 50k as reference distance unit, 280K as ref temp

        // Define temperature zones (simplified)
        const innerHabitable = 260; // Lower bound for liquid water (optimistic)
        const outerHabitable = 390; // Upper bound for liquid water (optimistic)
        const frostLineApprox = 150; // Where ices become common
        const hotZone = 800; // Too hot for rocks? Molten likely

        // Choose type based on zone and randomness
        if (effectiveTemp > hotZone) return typePRNG.choice(['Molten', 'Molten', 'Rock'])!;
        if (effectiveTemp > outerHabitable) return typePRNG.choice(['Rock', 'Rock', 'Lunar', 'Molten'])!;
        if (effectiveTemp > innerHabitable) return typePRNG.choice(['Rock', 'Oceanic', 'Oceanic', 'Rock', 'Lunar'])!; // Habitable zone
        if (effectiveTemp > frostLineApprox) return typePRNG.choice(['Rock', 'Frozen', 'GasGiant', 'IceGiant', 'Lunar'])!;
        // Beyond frost line
        return typePRNG.choice(['GasGiant', 'IceGiant', 'Frozen', 'Frozen', 'Lunar'])!;

    }

    /** Finds a planet or starbase near the given system coordinates. */
    getObjectNear(x: number, y: number): Planet | Starbase | null {
        // Check radius based on the visual size of planets in the main view scale
        const checkRadius = CONFIG.SYSTEM_VIEW_SCALE * (CONFIG.PLANET_MAIN_VIEW_RADIUS + 0.5);
        const checkRadiusSq = checkRadius * checkRadius;

        // Check planets
        for (const planet of this.planets) {
            if (!planet) continue;
            const dx = planet.systemX - x;
            const dy = planet.systemY - y;
            if ((dx * dx + dy * dy) < checkRadiusSq) {
                return planet;
            }
        }

        // Check starbase
        if (this.starbase) {
            const dx = this.starbase.systemX - x;
            const dy = this.starbase.systemY - y;
            if ((dx * dx + dy * dy) < checkRadiusSq) {
                return this.starbase;
            }
        }

        return null; // Nothing found nearby
    }

    /** Checks if the given coordinates are beyond the system's edge radius. */
    isAtEdge(x: number, y: number): boolean {
        const distSq = x * x + y * y;
        // Use a slightly larger radius for the check to give some buffer
        const edgeCheckRadiusSq = (this.edgeRadius * 1.1) ** 2;
        return distSq > edgeCheckRadiusSq;
    }

    /** Updates the orbital positions of planets and starbases. */
    updateOrbits(deltaTime: number): void {
        // Simple orbital update - assumes constant angular velocity derived from distance maybe?
        // A more realistic simulation would use Kepler's laws.
        // For now, let's use a speed inversely related to sqrt(distance) approximation.
        const baseOrbitSpeed = 1.0 / (50000); // Arbitrary base speed factor related to distance unit

        this.planets.forEach(planet => {
            if (!planet) return;
            // Speed decreases with distance (approx ~1/sqrt(r))
            const angularSpeed = baseOrbitSpeed / Math.sqrt(Math.max(1000, planet.orbitDistance) / 50000) * deltaTime;
                // This cast is needed because orbitAngle is readonly by default declaration
                (planet as any).orbitAngle = (planet.orbitAngle + angularSpeed) % (Math.PI * 2);
                (planet as any).systemX = Math.cos(planet.orbitAngle) * planet.orbitDistance;
                (planet as any).systemY = Math.sin(planet.orbitAngle) * planet.orbitDistance;
        });

        if (this.starbase) {
            const angularSpeed = baseOrbitSpeed / Math.sqrt(Math.max(1000, this.starbase.orbitDistance) / 50000) * deltaTime;
            // Need to cast to 'any' or make orbitAngle mutable in Starbase if we update it
                (this.starbase as any).orbitAngle = (this.starbase.orbitAngle + angularSpeed) % (Math.PI * 2);
                (this.starbase as any).systemX = Math.cos(this.starbase.orbitAngle) * this.starbase.orbitDistance;
                (this.starbase as any).systemY = Math.sin(this.starbase.orbitAngle) * this.starbase.orbitDistance;
        }
        /* Note: Making properties like orbitAngle readonly and then casting to 'any'
            to modify them isn't ideal TypeScript practice. A better approach would be:
            1. Make orbitAngle, systemX, systemY mutable (remove readonly).
            2. OR: Create an `updatePosition(newAngle)` method within Planet/Starbase.
            For this quick fix, the 'any' cast works but consider refactoring later. */
    }    
}