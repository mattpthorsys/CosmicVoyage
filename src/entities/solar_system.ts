// src/entities/solar_system.ts

import { CONFIG } from '../config';
// Make sure SPECTRAL_TYPES is imported if needed by determinePlanetType
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

        // Decide if a starbase exists *before* generating planets
        this.starbase = (this.systemPRNG.random() < CONFIG.STARBASE_PROBABILITY)
            ? new Starbase(this.name, this.systemPRNG, this.name)
            : null;
        if (this.starbase) {
            console.log(`Starbase generated in ${this.name} at orbit ${this.starbase.orbitDistance.toFixed(0)}`);
        }

        this.generatePlanets(); // Now generate planets, avoiding starbase orbit

        // Determine the furthest object (planet or starbase) for edge radius calculation
        let maxOrbit = 0;
        this.planets.forEach(p => { if (p) maxOrbit = Math.max(maxOrbit, p.orbitDistance); });
        if (this.starbase) { maxOrbit = Math.max(maxOrbit, this.starbase.orbitDistance); }

        // Set edge radius significantly beyond the outermost object
        this.edgeRadius = Math.max(50000, maxOrbit * CONFIG.SYSTEM_EDGE_RADIUS_FACTOR);
    }

    /** Generates a procedural name for the system. */
    private generateSystemName(): string { /* ... unchanged ... */
         const prefixes = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega','Proxima','Cygnus','Kepler','Gliese','HD','Trappist','Luyten','Wolf','Ross','Barnard'];
         const number = this.systemPRNG.randomInt(1, 999);
         const suffix = String.fromCharCode(65 + this.systemPRNG.randomInt(0, 25));
         return `${this.systemPRNG.choice(prefixes)}-${number}${suffix}`;
    }

    /** Populates the planets array for the system. */
    private generatePlanets(): void { /* ... unchanged (logic for avoiding starbase orbit included) ... */
        let lastOrbitDistance = this.systemPRNG.random(5000, 20000);
        const orbitFactorBase = this.systemPRNG.random(1.4, 1.9);
        for (let i = 0; i < CONFIG.MAX_PLANETS_PER_SYSTEM; i++) {
            let currentOrbitDistance = lastOrbitDistance * (orbitFactorBase + this.systemPRNG.random(-0.1, 0.1)) + this.systemPRNG.random(1000, 5000) * (i + 1);
            currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance);
            if (this.starbase && Math.abs(currentOrbitDistance - this.starbase.orbitDistance) < 5000) {
                 currentOrbitDistance = this.starbase.orbitDistance + 5000 * (currentOrbitDistance > this.starbase.orbitDistance ? 1 : -1);
                 currentOrbitDistance = Math.max(lastOrbitDistance + 5000, currentOrbitDistance);
            }
            const formationChance = 0.9 - (i * 0.03);
            if (this.systemPRNG.random() < formationChance) {
                const planetType = this.determinePlanetType(currentOrbitDistance);
                const angle = this.systemPRNG.random(0, Math.PI * 2);
                const planetName = `${this.name} ${this.getRomanNumeral(i + 1)}`;
                this.planets[i] = new Planet(planetName, planetType, currentOrbitDistance, angle, this.systemPRNG, this.starType);
            } else { this.planets[i] = null; }
            if(this.planets[i]) { lastOrbitDistance = this.planets[i]!.orbitDistance; }
            else { lastOrbitDistance = currentOrbitDistance; }
        }
    }

    /** Converts a number to a Roman numeral string (simplified). */
    private getRomanNumeral(num: number): string { /* ... unchanged ... */
         if (num < 1 || num > 20) return num.toString();
         const romanMap: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
         let result = '';
         for (const key of Object.keys(romanMap)) { const count = Math.floor(num / romanMap[key]); num -= count * romanMap[key]; result += key.repeat(count); }
         return result || '?';
    }

    /** Determines the likely planet type based on orbit distance and star type. */
    private determinePlanetType(orbitDistance: number): string { /* ... unchanged ... */
         const typePRNG = this.systemPRNG.seedNew("type_" + orbitDistance);
         const starTemp = SPECTRAL_TYPES[this.starType]?.temp ?? SPECTRAL_TYPES['G'].temp; // Use fallback
         const starLum = (starTemp / SPECTRAL_TYPES['G'].temp) ** 4;
         const effectiveTemp = (starLum / (orbitDistance / 50000) ** 2) ** 0.25 * 280;
         const innerHabitable = 260; const outerHabitable = 390; const frostLineApprox = 150; const hotZone = 800;
         if (effectiveTemp > hotZone) return typePRNG.choice(['Molten', 'Molten', 'Rock'])!;
         if (effectiveTemp > outerHabitable) return typePRNG.choice(['Rock', 'Rock', 'Lunar', 'Molten'])!;
         if (effectiveTemp > innerHabitable) return typePRNG.choice(['Rock', 'Oceanic', 'Oceanic', 'Rock', 'Lunar'])!;
         if (effectiveTemp > frostLineApprox) return typePRNG.choice(['Rock', 'Frozen', 'GasGiant', 'IceGiant', 'Lunar'])!;
         return typePRNG.choice(['GasGiant', 'IceGiant', 'Frozen', 'Frozen', 'Lunar'])!;
    }

    /** Finds a planet or starbase near the given system coordinates. */
    getObjectNear(x: number, y: number): Planet | Starbase | null { /* ... unchanged ... */
        const checkRadius = CONFIG.SYSTEM_VIEW_SCALE * (CONFIG.PLANET_MAIN_VIEW_RADIUS + 0.5);
        const checkRadiusSq = checkRadius * checkRadius;
        for (const planet of this.planets) {
            if (!planet) continue; const dx = planet.systemX - x; const dy = planet.systemY - y;
            if ((dx * dx + dy * dy) < checkRadiusSq) { return planet; }
        }
        if (this.starbase) {
            const dx = this.starbase.systemX - x; const dy = this.starbase.systemY - y;
            if ((dx * dx + dy * dy) < checkRadiusSq) { return this.starbase; }
        }
        return null;
    }

    /** Checks if the given coordinates are beyond the system's edge radius. */
    isAtEdge(x: number, y: number): boolean { /* ... unchanged ... */
        const distSq = x * x + y * y;
        const edgeCheckRadiusSq = (this.edgeRadius * 1.1) ** 2;
        return distSq > edgeCheckRadiusSq;
    }

    /** Updates the orbital positions of planets and starbases. (Added Method) */
    updateOrbits(deltaTime: number): void {
        // Use a base speed factor related to distance scale
        const baseOrbitSpeed = 1.0 / (50000); // Adjust as needed for visual speed
        const timeScaledSpeedFactor = deltaTime * CONFIG.SYSTEM_ORBIT_SPEED_FACTOR * 10000; // Combine factors

        this.planets.forEach(planet => {
            if (!planet) return;
            // Approximate orbital speed decrease with distance (~1/sqrt(r))
            const angularSpeed = (baseOrbitSpeed / Math.sqrt(Math.max(1000, planet.orbitDistance) / 50000)) * timeScaledSpeedFactor;
            // Update angle and recalculate position
            planet.orbitAngle = (planet.orbitAngle + angularSpeed) % (Math.PI * 2);
            planet.systemX = Math.cos(planet.orbitAngle) * planet.orbitDistance;
            planet.systemY = Math.sin(planet.orbitAngle) * planet.orbitDistance;
        });

        if (this.starbase) {
            const angularSpeed = (baseOrbitSpeed / Math.sqrt(Math.max(1000, this.starbase.orbitDistance) / 50000)) * timeScaledSpeedFactor;
            // Update angle and recalculate position - Make Starbase properties mutable or add update method
            (this.starbase as any).orbitAngle = (this.starbase.orbitAngle + angularSpeed) % (Math.PI * 2);
            (this.starbase as any).systemX = Math.cos(this.starbase.orbitAngle) * this.starbase.orbitDistance;
            (this.starbase as any).systemY = Math.sin(this.starbase.orbitAngle) * this.starbase.orbitDistance;
            /* Note: Casting to 'any' bypasses readonly. Better to make these properties
               mutable in Starbase if they need to be updated by the system. */
        }
    }
}