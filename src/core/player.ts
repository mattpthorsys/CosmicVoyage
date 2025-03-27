// src/core/player.ts

import { CONFIG } from '../config';
import { GLYPHS } from '../constants';

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
    }

    /** Moves the player in the hyperspace world grid. */
    moveWorld(dx: number, dy: number): void {
        this.worldX += dx;
        this.worldY += dy;
        this.char = CONFIG.PLAYER_CHAR; // Character is always '@' in hyperspace
    }

    /** Moves the player within the solar system coordinate space. */
    moveSystem(dx: number, dy: number, isFineControl: boolean = false): void {
        let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT; // Units per base input step
        if (isFineControl) {
            moveScale *= CONFIG.FINE_CONTROL_FACTOR;
        }

        // dx and dy represent direction (-1, 0, or 1)
        this.systemX += dx * moveScale;
        this.systemY += dy * moveScale;

        // Update visual direction based on movement vector
        if (dx !== 0 || dy !== 0) {
            if (Math.abs(dx) > Math.abs(dy)) { // Horizontal movement dominant
                this.shipDirection = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
            } else { // Vertical movement dominant or equal
                this.shipDirection = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
            }
        }
        this.char = this.shipDirection; // Update visible character to match orientation
    }

    /** Moves the player on a planet's surface grid, handling wrapping. */
    moveSurface(dx: number, dy: number, mapSize: number): void {
        if (mapSize <= 0) {
            console.warn("Attempted surface move with invalid mapSize:", mapSize);
            return;
        }

        this.surfaceX += dx;
        this.surfaceY += dy;

        // Wrap around map edges using modulo
        this.surfaceX = (this.surfaceX % mapSize + mapSize) % mapSize;
        this.surfaceY = (this.surfaceY % mapSize + mapSize) % mapSize;

        this.char = CONFIG.PLAYER_CHAR; // Character is always '@' on surface
    }

    /** Calculates the squared distance from the player to target system coordinates. */
    distanceSqToSystemCoords(targetX: number, targetY: number): number {
        const dx = targetX - this.systemX;
        const dy = targetY - this.systemY;
        return dx * dx + dy * dy;
    }
}