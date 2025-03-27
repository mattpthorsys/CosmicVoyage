// src/entities/starbase.ts

import { CONFIG } from '../config';
import { MineralRichness } from '../constants';
import { PRNG } from '../utils/prng';

export class Starbase {
    readonly name: string;
    readonly type: string = 'Starbase'; // Type identifier
    readonly orbitDistance: number;
    readonly orbitAngle: number;
    readonly systemX: number;
    readonly systemY: number;
    readonly systemPRNG: PRNG; // PRNG specific to this starbase instance

    // Properties required to act like a "landable" object for the renderer/game logic
    readonly mineralRichness: MineralRichness = MineralRichness.NONE;
    heightmap: number[][] | null = null; // Basic map for rendering
    heightLevelColors: string[] | null = null; // Single colour for rendering

    constructor(baseNameSeed: string, systemPRNG: PRNG, systemName: string) {
        this.systemPRNG = systemPRNG.seedNew("starbase_" + baseNameSeed); // Use provided PRNG to seed a new one
        this.name = `${systemName} Starbase Delta`; // Example naming convention
        this.orbitDistance = CONFIG.STARBASE_ORBIT_DISTANCE * this.systemPRNG.random(0.9, 1.1);
        this.orbitAngle = this.systemPRNG.random(0, Math.PI * 2);
        this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance;
        this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance;

        // Initialize renderer-related properties needed for landing/display
        this.ensureSurfaceReady();
    }

    /** Returns scan information for the starbase. */
    getScanInfo(): string[] {
        return [
            `--- SCAN REPORT: ${this.name} ---`,
            `Type: Orbital Starbase`,
            `Services: Trading Post, Refueling Depot`,
            `Status: Operational`,
            `Mineral Scan: N/A`, // Starbases don't have minerals
        ];
    }

    /** Sets up minimal data needed for the renderer to treat this as a landable surface. */
    ensureSurfaceReady(): void {
        // Define a single colour for the 'surface'
        if (!this.heightLevelColors) {
            this.heightLevelColors = [CONFIG.STARBASE_COLOR];
        }
        // Define a minimal heightmap (e.g., a single cell)
        if (!this.heightmap) {
            this.heightmap = [[0]]; // Represents a single flat surface point
        }
        // No complex generation needed, just placeholder data for rendering functions
    }
}