// src/core/player.ts (Complete File with Modifications)

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
    credits: number; //
    fuel: number; //
    maxFuel: number; //
    cargoCapacity: number; // Total units of space
    cargo: Record<string, number>; // NEW: Stores quantity of each element key (e.g., { 'IRON': 50, 'GOLD': 2 })

    constructor(
        startX: number = CONFIG.PLAYER_START_X, //
        startY: number = CONFIG.PLAYER_START_Y, //
        char: string = CONFIG.PLAYER_CHAR //
    ) {
        this.worldX = startX; //
        this.worldY = startY; //
        this.systemX = 0; // Reset when entering system
        this.systemY = 0; // Reset when entering system
        this.surfaceX = 0; // Reset upon landing
        this.surfaceY = 0; // Reset upon landing
        this.char = char; //
        this.shipDirection = GLYPHS.SHIP_NORTH; // Default visual direction (system view)
        this.credits = CONFIG.INITIAL_CREDITS; //
        this.fuel = CONFIG.INITIAL_FUEL; //
        this.maxFuel = CONFIG.MAX_FUEL; //
        this.cargoCapacity = CONFIG.INITIAL_CARGO_CAPACITY; //
        this.cargo = {}; // Initialize cargo as an empty object

        // Log initial state comprehensively
        logger.info(`Player initialized. Start World: [${this.worldX}, ${this.worldY}], Char: ${this.char}, Credits: ${this.credits}, Fuel: ${this.fuel}/${this.maxFuel}, Cargo Cap: ${this.cargoCapacity}`); //
    }

    /** Moves the player in the hyperspace world grid. */
    moveWorld(dx: number, dy: number): void { //
        const oldX = this.worldX; //
        const oldY = this.worldY; //
        this.worldX += dx; //
        this.worldY += dy; //
        // Character is always '@' in hyperspace, ensure it's set
        this.char = CONFIG.PLAYER_CHAR; //
        logger.debug(`Player moved HYPERSPACE: [${oldX},${oldY}] -> [${this.worldX},${this.worldY}] (Delta: ${dx},${dy})`); //
    }

    /** Moves the player within the solar system coordinate space. */
    moveSystem(dx: number, dy: number, isFineControl: boolean = false): void { //
        const oldX = this.systemX; //
        const oldY = this.systemY; //
        let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT; // Units per base input step
        if (isFineControl) { //
            moveScale *= CONFIG.FINE_CONTROL_FACTOR; //
            logger.debug(`Fine control active, move scale: ${moveScale.toFixed(1)}`); //
        }

        // dx and dy represent direction (-1, 0, or 1)
        const moveX = dx * moveScale; //
        const moveY = dy * moveScale; //
        this.systemX += moveX; //
        this.systemY += moveY; //

        const oldShipDirection = this.shipDirection; //
        // Update visual direction based on movement vector
        if (dx !== 0 || dy !== 0) { //
            if (Math.abs(dx) > Math.abs(dy)) { // Horizontal movement dominant
                this.shipDirection = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST; //
            } else { // Vertical movement dominant or equal
                this.shipDirection = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH; //
            }
        }
        // Update visible character to match orientation
        this.char = this.shipDirection; //

        logger.debug(`Player moved SYSTEM: [${oldX.toFixed(0)},${oldY.toFixed(0)}] -> [${this.systemX.toFixed(0)},${this.systemY.toFixed(0)}] (Delta: ${moveX.toFixed(0)},${moveY.toFixed(0)}, Scale: ${moveScale.toFixed(0)})`); //
        if (oldShipDirection !== this.shipDirection) { //
            logger.debug(`Player direction changed: ${oldShipDirection} -> ${this.shipDirection}`); //
        }
    }

    /** Moves the player on a planet's surface grid, handling wrapping. */
    moveSurface(dx: number, dy: number, mapSize: number): void { //
        if (mapSize <= 0) { //
            // Use logger for warnings or errors now
            logger.error(`Attempted surface move with invalid mapSize: ${mapSize}`); //
            return; //
        }
        const oldX = this.surfaceX; //
        const oldY = this.surfaceY; //

        this.surfaceX += dx; //
        this.surfaceY += dy; //

        // Wrap around map edges using modulo
        this.surfaceX = (this.surfaceX % mapSize + mapSize) % mapSize; //
        this.surfaceY = (this.surfaceY % mapSize + mapSize) % mapSize; //

        // Character is always '@' on surface, ensure it's set
        this.char = CONFIG.PLAYER_CHAR; //
        logger.debug(`Player moved SURFACE: [${oldX},${oldY}] -> [${this.surfaceX},${this.surfaceY}] (Delta: ${dx},${dy}, MapSize: ${mapSize})`); //
    }

    /** Calculates the squared distance from the player to target system coordinates. */
    distanceSqToSystemCoords(targetX: number, targetY: number): number { //
        const dx = targetX - this.systemX; //
        const dy = targetY - this.systemY; //
        // Logging this would likely be too noisy as it's called frequently in updates
        return dx * dx + dy * dy; //
    }

    /** Adds fuel, ensuring it doesn't exceed maxFuel. */
    addFuel(amount: number): void { //
        // Handle non-positive amounts first
        if (amount <= 0) { //
            if (amount < 0) { // Only warn for negative, not zero
                 logger.warn(`Attempted to add non-positive fuel amount: ${amount.toFixed(0)}`); //
            }
             // Do nothing further if amount is zero or negative
             return; //
        }

        // Proceed with adding positive fuel
        const oldFuel = this.fuel; //
        const added = Math.min(amount, this.maxFuel - oldFuel); // Calculate actual fuel added
        this.fuel += added; //
        // Use Math.min again just to be safe against floating point issues
        this.fuel = Math.min(this.maxFuel, this.fuel); //
        if (added > 0) { // This will now only be true if amount > 0 initially
            logger.info(`Fuel added: ${added.toFixed(0)}. Total: ${this.fuel.toFixed(0)}/${this.maxFuel} (was ${oldFuel.toFixed(0)})`); //
        } else { // This condition means amount > 0 but the tank was full
            logger.info(`Attempted to add ${amount.toFixed(0)} fuel, but tank is full (${this.fuel.toFixed(0)}/${this.maxFuel}).`); //
        }
    }

    /** Calculates the current total units of cargo held. */
    getCurrentCargoTotal(): number {
        return Object.values(this.cargo).reduce((sum, quantity) => sum + quantity, 0);
    }

    /**
     * Adds a specific amount of an element to the cargo hold.
     * Returns the amount actually added (can be less than requested if full).
     */
    addCargo(elementKey: string, amount: number): number { // Modified signature
        if (amount <= 0) {
             logger.warn(`Attempted to add non-positive cargo amount: ${amount} of ${elementKey}`);
             return 0; // Nothing added
        }

        const currentTotal = this.getCurrentCargoTotal();
        const availableCapacity = this.cargoCapacity - currentTotal;

        if (availableCapacity <= 0) {
            logger.warn(`Failed to add ${amount} ${elementKey}: Cargo already full (${currentTotal}/${this.cargoCapacity}).`);
            return 0; // Nothing added
        }

        const amountToAdd = Math.min(amount, availableCapacity); // Can only add up to available space
        const oldElementAmount = this.cargo[elementKey] || 0;
        this.cargo[elementKey] = oldElementAmount + amountToAdd; // Add to existing or initialize

        logger.info(`Cargo Added: ${amountToAdd} units of ${elementKey}. Total Cargo: ${currentTotal + amountToAdd}/${this.cargoCapacity}. (${elementKey}: ${this.cargo[elementKey]})`);

        if (amountToAdd < amount) {
             logger.warn(`Could only add ${amountToAdd} units of ${elementKey} (requested ${amount}). Cargo hold now full.`);
        }

        return amountToAdd; // Return the amount actually added
    }

    /** Removes all cargo of a specific element. Returns the amount removed. */
    removeCargoType(elementKey: string): number {
        const amount = this.cargo[elementKey] || 0;
        if (amount > 0) {
            delete this.cargo[elementKey];
            logger.info(`Removed all ${amount} units of ${elementKey} from cargo.`);
            return amount;
        }
        return 0;
    }

    /** Removes all cargo. Returns a record of the cargo removed. */
    clearCargo(): Record<string, number> {
        const removedCargo = { ...this.cargo };
        this.cargo = {};
        const totalRemoved = Object.values(removedCargo).reduce((s, q) => s + q, 0);
        if (totalRemoved > 0) {
             logger.info(`Cleared all cargo (${totalRemoved} units). Contents: ${JSON.stringify(removedCargo)}`);
        } else {
             logger.info(`Cleared cargo (was already empty).`);
        }
        return removedCargo;
    }

} // End Player class //