// src/entities/starbase.ts (Enhanced Logging + Mutable Orbit Properties)

import { CONFIG } from '../config';
import { MineralRichness } from '../constants';
import { PRNG } from '../utils/prng';
import { logger } from '../utils/logger'; // Import the logger

export class Starbase {
    readonly name: string;
    readonly type: string = 'Starbase'; // Type identifier for game logic

    // Orbital Properties - Made MUTABLE to allow SolarSystem to update them
    orbitDistance: number; // Made mutable (removed readonly)
    orbitAngle: number; // Made mutable (removed readonly)
    systemX: number; // Made mutable (removed readonly)
    systemY: number; // Made mutable (removed readonly)

    readonly systemPRNG: PRNG; // PRNG specific to this starbase instance

    // --- Properties required for compatibility with landing/rendering ---
    // Starbases don't have minerals, heightmaps, etc., but need placeholders
    readonly mineralRichness: MineralRichness = MineralRichness.NONE; //
    heightmap: number[][] | null = null; // Basic map for rendering (placeholder)
    heightLevelColors: string[] | null = null; // Single colour for rendering

    constructor(baseNameSeed: string, systemPRNG: PRNG, systemName: string) {
        // Seed a PRNG specifically for this starbase
        this.systemPRNG = systemPRNG.seedNew("starbase_" + baseNameSeed); //
        this.name = `${systemName} Starbase Delta`; // Example naming convention

        // Calculate orbital parameters using the starbase's PRNG
        this.orbitDistance = CONFIG.STARBASE_ORBIT_DISTANCE * this.systemPRNG.random(0.9, 1.1); //
        this.orbitAngle = this.systemPRNG.random(0, Math.PI * 2); //
        // Calculate initial position
        this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance; //
        this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance; //

        logger.info(`[Starbase:${this.name}] Created starbase. Orbit Distance: ${this.orbitDistance.toFixed(0)}, Initial Angle: ${this.orbitAngle.toFixed(2)}rad, Initial Pos: [${this.systemX.toFixed(0)}, ${this.systemY.toFixed(0)}]`);

        // Initialize renderer-related properties needed for landing/display
        this.ensureSurfaceReady(); // Logs internally
    }

    /** Returns scan information for the starbase. */
    getScanInfo(): string[] {
        logger.debug(`[Starbase:${this.name}] getScanInfo called.`); // Add basic log
        return [
            `--- SCAN REPORT: ${this.name} ---`, //
            `Type: Orbital Starbase`,
            `Services: Trading Post, Refueling Depot`,
            `Status: Operational`,
            `Mineral Scan: N/A`, // Starbases don't have minerals
        ]; //
    }

    /** Sets up minimal data needed for the renderer to treat this as a landable surface. */
    ensureSurfaceReady(): void {
        logger.debug(`[Starbase:${this.name}] ensureSurfaceReady called. Setting up placeholder render data.`); // Add log
        // Define a single colour for the 'surface' if not already set
        if (!this.heightLevelColors) {
            this.heightLevelColors = [CONFIG.STARBASE_COLOR]; //
            logger.debug(`[Starbase:${this.name}] HeightLevelColors initialized.`);
        }
        // Define a minimal heightmap (e.g., a single cell) if not already set
        if (!this.heightmap) {
            this.heightmap = [[0]]; // Represents a single flat surface point
            logger.debug(`[Starbase:${this.name}] Heightmap initialized.`);
        }
        // No complex generation needed, just placeholder data for rendering functions
    }

    /* NOTE: If Starbase needed independent updates or more complex behaviour,
       it might have its own update() method. For now, its position is updated
       by the SolarSystem's updateOrbits method. */

} // End Starbase class