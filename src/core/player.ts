// FILE: src/core/player.ts
// MODIFIED: To use Component data structures

import { CONFIG } from '../config';
import { logger } from '../utils/logger';
// *** ADD: Import Component interfaces and helper functions ***
import {
  PositionComponent,
  RenderComponent,
  ResourceComponent,
  CargoComponent,
  createDefaultPosition,
  createDefaultRender,
  createDefaultResource,
  createDefaultCargo,
} from './components'; // Assuming components.ts is in the same directory

export class Player {
  // --- ADD Component Properties ---
  public position: PositionComponent;
  public render: RenderComponent;
  public resources: ResourceComponent;
  public cargoHold: CargoComponent;

  // Constructor: Initializes components with default values
  constructor(
    // Optional: Keep startX/startY if needed for initial position setup, otherwise remove
    startX: number = CONFIG.PLAYER_START_X,
    startY: number = CONFIG.PLAYER_START_Y,
    startChar: string = CONFIG.PLAYER_CHAR
  ) {
    // --- Initialize Components ---
    this.position = createDefaultPosition();
    // Set initial world position from constructor args or defaults
    this.position.worldX = startX;
    this.position.worldY = startY;
    // System/Surface positions remain 0 initially

    this.render = createDefaultRender(startChar, CONFIG.PLAYER_COLOUR /*, GLYPHS.SHIP_NORTH */);
    if (this.render.directionGlyph === undefined) {
      // Ensure default if not set
      this.render.directionGlyph = '^'; // Or import GLYPHS just for this default
    }

    this.resources = createDefaultResource(CONFIG.INITIAL_CREDITS, CONFIG.INITIAL_FUEL, CONFIG.MAX_FUEL);

    this.cargoHold = createDefaultCargo(CONFIG.INITIAL_CARGO_CAPACITY);

    logger.info(
      `Player components initialized. Start World: [${this.position.worldX}, ${this.position.worldY}], Char: ${this.render.char}, Credits: ${this.resources.credits}, Fuel: ${this.resources.fuel}/${this.resources.maxFuel}, Cargo Cap: ${this.cargoHold.capacity}`
    );
  }

  /** Calculates the squared distance from the player to target system coordinates. (NEEDS UPDATE) */
  distanceSqToSystemCoords(targetX: number, targetY: number): number {
    const dx = targetX - this.position.systemX; // Access via component
    const dy = targetY - this.position.systemY; // Access via component
    return dx * dx + dy * dy;
  }

  /** Adds fuel, ensuring it doesn't exceed maxFuel. (NEEDS UPDATE) */
  addFuel(amount: number): void {
    if (amount <= 0) {
      if (amount < 0) logger.warn(`Attempted to add non-positive fuel amount: ${amount.toFixed(0)}`);
      return;
    }
    const oldFuel = this.resources.fuel;
    const added = Math.min(amount, this.resources.maxFuel - oldFuel);
    this.resources.fuel += added; // Modify component data
    this.resources.fuel = Math.min(this.resources.maxFuel, this.resources.fuel);
    if (added > 0) {
      logger.info(
        `Fuel added: ${added.toFixed(0)}. Total: ${this.resources.fuel.toFixed(0)}/${
          this.resources.maxFuel
        } (was ${oldFuel.toFixed(0)})`
      );
    } else {
      logger.info(
        `Attempted to add ${amount.toFixed(0)} fuel, but tank is full (${this.resources.fuel.toFixed(0)}/${
          this.resources.maxFuel
        }).`
      );
    }
  }
} // End Player class
