// src/core/player.ts (Enhanced Logging)

import { CONFIG } from '../config';
import { GLYPHS } from '../constants';
import { logger } from '../utils/logger'; // Import the logger

export class Player {
    // Coordinates
    worldX: number; // Hyperspace grid
    worldY: number; // Hyperspace grid
    systemX: number; // Relative within a solar system (large scale)
    systemY: number; // Relative within a solar system (large scale)
    surfaceX: number; // Grid position on a planet/starbase surface
    surfaceY: number; // Grid position on a planet/starbase surface

    // Representation
    char: string; // Current character representation (e.g., '@', '^', 'v', '<', '>')
    shipDirection: string; // Visual orientation in system view

    // Resources & Stats
    credits: number;
    fuel: number;
    maxFuel: number;
    cargoCapacity: number;
    mineralUnits: number; // Current cargo

    constructor(
        startX: number = CONFIG.PLAYER_START_X,
        startY: number = CONFIG.PLAYER_START_Y,
        char: string = CONFIG.PLAYER_CHAR
    ) {
        this.worldX = startX;
        this.worldY = startY;
        this.systemX = 0; // Reset when entering system
        this.systemY = 0; // Reset when entering system
        this.surfaceX = 0; // Reset upon landing
        this.surfaceY = 0; // Reset upon landing
        this.char = char;
        this.shipDirection = GLYPHS.SHIP_NORTH; // Default visual direction (system view)
        this.credits = CONFIG.INITIAL_CREDITS;
        this.fuel = CONFIG.INITIAL_FUEL;
        this.maxFuel = CONFIG.MAX_FUEL;
        this.cargoCapacity = CONFIG.INITIAL_CARGO_CAPACITY;
        this.mineralUnits = 0;

        // Log initial state comprehensively
        logger.info(`Player initialized. Start World: [${this.worldX}, ${this.worldY}], Char: ${this.char}, Credits: ${this.credits}, Fuel: ${this.fuel}/${this.maxFuel}, Cargo Cap: ${this.cargoCapacity}`); //
    }

    /** Moves the player in the hyperspace world grid. */
    moveWorld(dx: number, dy: number): void {
        const oldX = this.worldX;
        const oldY = this.worldY;
        this.worldX += dx;
        this.worldY += dy;
        // Character is always '@' in hyperspace, ensure it's set
        this.char = CONFIG.PLAYER_CHAR; // [cite: 33]
        logger.debug(`Player moved HYPERSPACE: [${oldX},${oldY}] -> [${this.worldX},${this.worldY}] (Delta: ${dx},${dy})`); // [cite: 33]
    }

    /** Moves the player within the solar system coordinate space. */
    moveSystem(dx: number, dy: number, isFineControl: boolean = false): void {
        const oldX = this.systemX;
        const oldY = this.systemY;
        let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT; // [cite: 36] Units per base input step
        if (isFineControl) {
            moveScale *= CONFIG.FINE_CONTROL_FACTOR; // [cite: 36]
            logger.debug(`Fine control active, move scale: ${moveScale.toFixed(1)}`); // [cite: 37]
        }

        // dx and dy represent direction (-1, 0, or 1)
        const moveX = dx * moveScale;
        const moveY = dy * moveScale;
        this.systemX += moveX;
        this.systemY += moveY;

        const oldShipDirection = this.shipDirection;
        // Update visual direction based on movement vector
        if (dx !== 0 || dy !== 0) { // [cite: 39]
            if (Math.abs(dx) > Math.abs(dy)) { // Horizontal movement dominant
                this.shipDirection = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST; // [cite: 40]
            } else { // Vertical movement dominant or equal
                this.shipDirection = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH; // [cite: 41]
            }
        }
        // Update visible character to match orientation
        this.char = this.shipDirection; // [cite: 42]

        logger.debug(`Player moved SYSTEM: [${oldX.toFixed(0)},${oldY.toFixed(0)}] -> [${this.systemX.toFixed(0)},${this.systemY.toFixed(0)}] (Delta: ${moveX.toFixed(0)},${moveY.toFixed(0)}, Scale: ${moveScale.toFixed(0)})`); // [cite: 42]
        if (oldShipDirection !== this.shipDirection) {
            logger.debug(`Player direction changed: ${oldShipDirection} -> ${this.shipDirection}`); // [cite: 43]
        }
    }

    /** Moves the player on a planet's surface grid, handling wrapping. */
    moveSurface(dx: number, dy: number, mapSize: number): void {
        if (mapSize <= 0) {
            // Use logger for warnings or errors now
            logger.error(`Attempted surface move with invalid mapSize: ${mapSize}`); // Changed to error
            return; // [cite: 46]
        }
        const oldX = this.surfaceX;
        const oldY = this.surfaceY;

        this.surfaceX += dx; // [cite: 47]
        this.surfaceY += dy; // [cite: 47]

        // Wrap around map edges using modulo
        this.surfaceX = (this.surfaceX % mapSize + mapSize) % mapSize; // [cite: 48]
        this.surfaceY = (this.surfaceY % mapSize + mapSize) % mapSize; // [cite: 48]

        // Character is always '@' on surface, ensure it's set
        this.char = CONFIG.PLAYER_CHAR; // [cite: 49]
        logger.debug(`Player moved SURFACE: [${oldX},${oldY}] -> [${this.surfaceX},${this.surfaceY}] (Delta: ${dx},${dy}, MapSize: ${mapSize})`); // [cite: 49]
    }

    /** Calculates the squared distance from the player to target system coordinates. */
    distanceSqToSystemCoords(targetX: number, targetY: number): number {
        const dx = targetX - this.systemX; // [cite: 51]
        const dy = targetY - this.systemY; // [cite: 52]
        // Logging this would likely be too noisy as it's called frequently in updates
        return dx * dx + dy * dy; // [cite: 53]
    }

    /** Adds fuel, ensuring it doesn't exceed maxFuel. */
    addFuel(amount: number): void {
        // Handle non-positive amounts first
        if (amount <= 0) {
            if (amount < 0) { // Only warn for negative, not zero
                 logger.warn(`Attempted to add non-positive fuel amount: ${amount.toFixed(0)}`);
            }
             // Do nothing further if amount is zero or negative
             return;
        }

        // Proceed with adding positive fuel
        const oldFuel = this.fuel;
        const added = Math.min(amount, this.maxFuel - oldFuel); // Calculate actual fuel added
        this.fuel += added;
        // Use Math.min again just to be safe against floating point issues
        this.fuel = Math.min(this.maxFuel, this.fuel);

        if (added > 0) { // This will now only be true if amount > 0 initially
            logger.info(`Fuel added: ${added.toFixed(0)}. Total: ${this.fuel.toFixed(0)}/${this.maxFuel} (was ${oldFuel.toFixed(0)})`);
        } else { // This condition means amount > 0 but the tank was full
            logger.info(`Attempted to add ${amount.toFixed(0)} fuel, but tank is full (${this.fuel.toFixed(0)}/${this.maxFuel}).`);
        }
    }

    /** Adds minerals to cargo, ensuring it doesn't exceed cargoCapacity. Returns true if successful. */
    addCargo(amount: number): boolean {
        const oldCargo = this.mineralUnits;
        if (amount <= 0) {
             logger.warn(`Attempted to add non-positive cargo amount: ${amount}`);
             return false;
        }
        if (this.mineralUnits + amount <= this.cargoCapacity) { // [cite: 56]
            this.mineralUnits += amount; // [cite: 57]
            logger.info(`Cargo added: ${amount}. Total: ${this.mineralUnits}/${this.cargoCapacity} (was ${oldCargo})`); // [cite: 57]
            return true;
        } else {
            const canAdd = this.cargoCapacity - this.mineralUnits;
            if (canAdd > 0) {
                 this.mineralUnits += canAdd;
                 logger.warn(`Could only add ${canAdd} cargo (requested ${amount}). Cargo full. Total: ${this.mineralUnits}/${this.cargoCapacity} (was ${oldCargo})`);
                 return true; // Partially successful, still return true as *some* was added
            } else {
                 logger.warn(`Failed to add ${amount} cargo. Cargo already full. Capacity: ${this.cargoCapacity}, Current: ${this.mineralUnits}`); // [cite: 57]
                 return false; // [cite: 58]
            }
        }
    }

    // --- Maybe add methods for spending credits, using fuel later ---
    // spendCredits(amount: number): boolean { ... logger.info/warn ... }
    // consumeFuel(amount: number): boolean { ... logger.info/warn ... }

} // End Player class