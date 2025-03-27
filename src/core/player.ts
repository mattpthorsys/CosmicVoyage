// src/core/player.ts

import { CONFIG } from '../config';
import { GLYPHS } from '../constants';

// Define specific game states for clarity and type safety
export type GameState = 'hyperspace' | 'system' | 'planet';


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
        startX: number = 0,
        startY: number = 0,
        char: string = CONFIG.PLAYER_CHAR,
        color: string = CONFIG.PLAYER_COLOR // Color isn't stored on Player currently, but could be
    ) {
        this.worldX = startX;
        this.worldY = startY;
        this.systemX = 0; // System/Surface coords are relative, start at 0
        this.systemY = 0;
        this.surfaceX = 0;
        this.surfaceY = 0;
        this.char = char;
        this.shipDirection = GLYPHS.SHIP_NORTH; // Default visual direction
        this.credits = CONFIG.INITIAL_CREDITS;
        this.fuel = CONFIG.INITIAL_FUEL;
        this.maxFuel = CONFIG.MAX_FUEL;
        this.cargoCapacity = CONFIG.INITIAL_CARGO_CAPACITY;
        this.mineralUnits = 0;
    }

    /** Moves the player based on the current game state. */
    move(dx: number, dy: number, gameState: GameState, isFineControl: boolean = false): void {
        switch (gameState) {
            case 'hyperspace':
                this.worldX += dx;
                this.worldY += dy;
                this.char = CONFIG.PLAYER_CHAR; // Reset char in hyperspace
                break;
            case 'system':
                let moveScale = CONFIG.SYSTEM_VIEW_SCALE * (CONFIG.SYSTEM_MOVE_INCREMENT_FACTOR || 1);
                if (isFineControl) {
                    moveScale *= CONFIG.FINE_CONTROL_FACTOR;
                }
                this.systemX += dx * moveScale;
                this.systemY += dy * moveScale;

                // Update ship character based on direction, only if moved
                if (dx !== 0 || dy !== 0) {
                    // Determine dominant direction for diagonal moves
                    if (Math.abs(dx * moveScale) > Math.abs(dy * moveScale)) {
                        this.char = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
                    } else if (Math.abs(dy * moveScale) > Math.abs(dx * moveScale)) {
                        this.char = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
                    }
                    // Store the current direction character
                    this.shipDirection = this.char;
                } else {
                    // If no movement, maintain the last direction
                    this.char = this.shipDirection;
                }
                break;
            case 'planet':
                this.surfaceX += dx;
                this.surfaceY += dy;
                this.char = CONFIG.PLAYER_CHAR; // Reset char on surface
                break;
        }
    }

    /** Moves the player in the hyperspace world grid. */
    moveWorld(dx: number, dy: number): void {
        this.worldX += dx;
        this.worldY += dy;
        this.char = CONFIG.PLAYER_CHAR; // Character is always '@' in hyperspace
    }

    /** Moves the player within the solar system coordinate space. */
    moveSystem(dx: number, dy: number, isFineControl: boolean = false): void {
        let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT; // Units per input step
        if (isFineControl) {
            moveScale *= CONFIG.FINE_CONTROL_FACTOR;
        }

        // Apply movement scaled by input (dx/dy assumed to be +/- scale or 0)
        this.systemX += dx * moveScale;
        this.systemY += dy * moveScale;


        // Update visual direction based on movement vector
        if (dx !== 0 || dy !== 0) {
            if (Math.abs(dx) > Math.abs(dy)) {
                this.shipDirection = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
            } else { // dy is dominant or equal
                this.shipDirection = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
            }
        }
        this.char = this.shipDirection; // Update visible character
    }

    /** Moves the player on a planet's surface grid, handling wrapping. */
    moveSurface(dx: number, dy: number, mapSize: number): void {
        if (mapSize <= 0) return; // Cannot move if map size is invalid

        this.surfaceX += dx;
        this.surfaceY += dy;

        // Wrap around map edges
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