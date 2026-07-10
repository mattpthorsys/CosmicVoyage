import { CONFIG } from '../config';
import { MineralRichness } from '../constants/planetary';
import { PRNG } from '../utils/prng';
import { logger } from '../utils/logger'; // Import the logger

export type StationKind = 'starbase' | 'automated-depot';

export interface StationCapabilities {
  readonly trade: boolean;
  readonly fuel: boolean;
  readonly repairs: 'basic' | 'full';
  readonly missions: boolean;
  readonly crew: boolean;
  readonly equipment: 'minimal' | 'full';
  readonly shipyard: boolean;
}

const STARBASE_CAPABILITIES: StationCapabilities = Object.freeze({
  trade: true,
  fuel: true,
  repairs: 'full',
  missions: true,
  crew: true,
  equipment: 'full',
  shipyard: true,
});

const DEPOT_CAPABILITIES: StationCapabilities = Object.freeze({
  trade: true,
  fuel: true,
  repairs: 'basic',
  missions: false,
  crew: false,
  equipment: 'minimal',
  shipyard: false,
});

export class Starbase {
  readonly id: string;
  readonly name: string;
  readonly type: string = 'Starbase'; // Type identifier for game logic
  readonly kind: StationKind;
  readonly capabilities: StationCapabilities;
  readonly colonyWorldName: string | null;

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
  tradeDisplayRows: string[] = [];
  selectedTradeIndex: number = 0;

  /** Initializes Starbase. */
  constructor(
    baseNameSeed: string,
    systemPRNG: PRNG,
    systemName: string,
    kind: StationKind = 'starbase',
    colonyWorldName: string | null = null,
    preferredOrbitDistance?: number
  ) {
    // The address-derived identifier remains unique even when two stations receive the same display name.
    this.id = `station:${CONFIG.GALAXY_MODEL_VERSION}:${kind}:${baseNameSeed}`;
    // Seed a PRNG specifically for this starbase
    this.systemPRNG = systemPRNG.seedNew('starbase_' + baseNameSeed); //
    this.kind = kind;
    this.capabilities = kind === 'automated-depot' ? DEPOT_CAPABILITIES : STARBASE_CAPABILITIES;
    this.colonyWorldName = colonyWorldName;
    this.name = kind === 'automated-depot' ? `${systemName} Automated Depot` : `${systemName} Starbase Delta`;

    // Calculate orbital parameters using the starbase's PRNG
    this.orbitDistance =
      (preferredOrbitDistance ?? CONFIG.STARBASE_ORBIT_DISTANCE) * this.systemPRNG.random(0.97, 1.03); //
    this.orbitAngle = this.systemPRNG.random(0, Math.PI * 2); //
    // Calculate initial position
    this.systemX = Math.cos(this.orbitAngle) * this.orbitDistance; //
    this.systemY = Math.sin(this.orbitAngle) * this.orbitDistance; //

    logger.info(
      `[Starbase:${this.name}] Created starbase. Orbit Distance: ${this.orbitDistance.toFixed(0)}, Initial Angle: ${this.orbitAngle.toFixed(2)}rad, Initial Pos: [${this.systemX.toFixed(0)}, ${this.systemY.toFixed(0)}]`
    );

    // Initialize renderer-related properties needed for landing/display
    this.ensureSurfaceReady(); // Logs internally
  }

  /** Returns scan information for the starbase. */
  getScanInfo(): string[] {
    logger.debug(`[Starbase:${this.name}] getScanInfo called.`); // Add basic log
    const services = [
      this.capabilities.trade ? 'Trade' : null,
      this.capabilities.fuel ? 'Fuel' : null,
      `${this.capabilities.repairs === 'full' ? 'Full' : 'Basic'} Repair`,
      this.capabilities.missions ? 'Mission Office' : null,
      this.capabilities.shipyard ? 'Shipyard' : null,
    ].filter((service): service is string => Boolean(service));
    return [
      `<h>--- SCAN REPORT: ${this.name} ---</h>`, //
      `Type: <hl>${this.kind === 'automated-depot' ? 'Uncrewed Automated Depot' : 'Orbital Starbase'}</hl>`,
      `Services: <hl>${services.join(', ')}</hl>`,
      ...(this.colonyWorldName ? [`Colony World: <hl>${this.colonyWorldName}</hl>`] : []),
      `Status: <hl>Operational</hl>`,
      `Mineral Scan: <hl>N/A</hl>`, // Starbases don't have minerals
      '<h>--- SCAN COMPLETE ---</h>',
    ]; //
  }

  /** Sets up minimal data needed for the renderer to treat this as a landable surface. */
  ensureSurfaceReady(): void {
    logger.debug(`[Starbase:${this.name}] ensureSurfaceReady called. Setting up placeholder render data.`); // Add log
    // Define a single colour for the 'surface' if not already set
    if (!this.heightLevelColors) {
      this.heightLevelColors = [CONFIG.STARBASE_COLOUR]; //
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
