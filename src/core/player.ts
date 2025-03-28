// src/core/player.ts (With Logging)

import { CONFIG } from '../config';
import { GLYPHS } from '../constants';
import { logger } from '../utils/logger'; // Import the logger

export class Player {
    worldX: number;
    worldY: number;
    systemX: number;
    systemY: number;
    surfaceX: number;
    surfaceY: number;
    char: string;
    shipDirection: string; // Represents visual orientation
    credits: number;
    fuel: number;
    maxFuel: number;
    cargoCapacity: number;
    mineralUnits: number;

    constructor(
        startX: number = CONFIG.PLAYER_START_X, // Use CONFIG defaults
        startY: number = CONFIG.PLAYER_START_Y, // Use CONFIG defaults
        char: string = CONFIG.PLAYER_CHAR      // Use CONFIG defaults
    ) {
        this.worldX = startX;
        this.worldY = startY;
        this.systemX = 0; // System/Surface coords are relative, start at 0 unless placed differently
        this.systemY = 0;
        this.surfaceX = 0; // Usually reset upon landing
        this.surfaceY = 0;
        this.char = char;
        this.shipDirection = GLYPHS.SHIP_NORTH; // Default visual direction
        this.credits = CONFIG.INITIAL_CREDITS;
        this.fuel = CONFIG.INITIAL_FUEL;
        this.maxFuel = CONFIG.MAX_FUEL;
        this.cargoCapacity = CONFIG.INITIAL_CARGO_CAPACITY;
        this.mineralUnits = 0;

        logger.debug(`Player initialized at world [${this.worldX}, ${this.worldY}]. Credits: ${this.credits}, Fuel: ${this.fuel}`);
    }

    /** Moves the player in the hyperspace world grid. */
    moveWorld(dx: number, dy: number): void {
        const oldX = this.worldX;
        const oldY = this.worldY;
        this.worldX += dx;
        this.worldY += dy;
        this.char = CONFIG.PLAYER_CHAR; // Character is always '@' in hyperspace
        logger.debug(`Player moved world: [${oldX},${oldY}] -> [${this.worldX},${this.worldY}] (Delta: ${dx},${dy})`);
    }

    /** Moves the player within the solar system coordinate space. */
    moveSystem(dx: number, dy: number, isFineControl: boolean = false): void {
        const oldX = this.systemX;
        const oldY = this.systemY;
        let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT; // Units per base input step
        if (isFineControl) {
            moveScale *= CONFIG.FINE_CONTROL_FACTOR;
            logger.debug(`Fine control active, moveScale: ${moveScale.toFixed(1)}`);
        }

        // dx and dy represent direction (-1, 0, or 1)
        const moveX = dx * moveScale;
        const moveY = dy * moveScale;
        this.systemX += moveX;
        this.systemY += moveY;

        const oldShipDirection = this.shipDirection;
        // Update visual direction based on movement vector
        if (dx !== 0 || dy !== 0) {
            if (Math.abs(dx) > Math.abs(dy)) { // Horizontal movement dominant
                this.shipDirection = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
            } else { // Vertical movement dominant or equal
                this.shipDirection = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
            }
        }
        this.char = this.shipDirection; // Update visible character to match orientation

        logger.debug(`Player moved system: [${oldX.toFixed(0)},${oldY.toFixed(0)}] -> [${this.systemX.toFixed(0)},${this.systemY.toFixed(0)}] (Delta: ${moveX.toFixed(0)},${moveY.toFixed(0)}, Scale: ${moveScale.toFixed(0)})`);
        if (oldShipDirection !== this.shipDirection) {
            logger.debug(`Player direction changed: ${oldShipDirection} -> ${this.shipDirection}`);
        }
    }

    /** Moves the player on a planet's surface grid, handling wrapping. */
    moveSurface(dx: number, dy: number, mapSize: number): void {
        if (mapSize <= 0) {
            // Use logger for warnings now
            logger.warn("Attempted surface move with invalid mapSize:", mapSize);
            return;
        }
        const oldX = this.surfaceX;
        const oldY = this.surfaceY;

        this.surfaceX += dx;
        this.surfaceY += dy;

        // Wrap around map edges using modulo
        this.surfaceX = (this.surfaceX % mapSize + mapSize) % mapSize;
        this.surfaceY = (this.surfaceY % mapSize + mapSize) % mapSize;

        this.char = CONFIG.PLAYER_CHAR; // Character is always '@' on surface
        logger.debug(`Player moved surface: [${oldX},${oldY}] -> [${this.surfaceX},${this.surfaceY}] (Delta: ${dx},${dy}, MapSize: ${mapSize})`);
    }

    /** Calculates the squared distance from the player to target system coordinates. */
    distanceSqToSystemCoords(targetX: number, targetY: number): number {
        const dx = targetX - this.systemX;
        const dy = targetY - this.systemY;
        return dx * dx + dy * dy;
        // Logging this would likely be too noisy as it's called frequently in updates
    }

    addFuel(amount: number): void {
        const oldFuel = this.fuel;
        this.fuel = Math.min(this.maxFuel, this.fuel + amount);
        logger.info(`Added ${amount} fuel. Total: ${this.fuel.toFixed(0)}/${this.maxFuel}`);
    }

    addCargo(amount: number): boolean {
        const oldCargo = this.mineralUnits;
        if (this.mineralUnits + amount <= this.cargoCapacity) {
            this.mineralUnits += amount;
            logger.info(`Added ${amount} cargo. Total: ${this.mineralUnits}/${this.cargoCapacity}`);
            return true;
        } else {
            logger.warn(`Failed to add ${amount} cargo. Capacity: ${this.cargoCapacity}, Current: ${this.mineralUnits}`);
            return false;
        }
    }
}