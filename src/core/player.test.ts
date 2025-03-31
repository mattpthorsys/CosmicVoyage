// src/core/player.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from './player';
import { CONFIG } from '../config'; // Import CONFIG for defaults and factors
import { GLYPHS } from '../constants'; // Import GLYPHS for direction checks

describe('Player', () => {
    let player: Player;

    // Re-create a fresh player instance before each test
    beforeEach(() => {
        // Reset CONFIG values potentially modified by tests (if any were)
        // If CONFIG is complex or might be changed, consider deep cloning it here.
        player = new Player(); // Use default starting values from CONFIG
    });

    it('should initialize with default values from CONFIG', () => {
        expect(player.worldX).toBe(CONFIG.PLAYER_START_X);
        expect(player.worldY).toBe(CONFIG.PLAYER_START_Y);
        expect(player.systemX).toBe(0);
        expect(player.systemY).toBe(0);
        expect(player.surfaceX).toBe(0);
        expect(player.surfaceY).toBe(0);
        expect(player.char).toBe(CONFIG.PLAYER_CHAR);
        expect(player.shipDirection).toBe(GLYPHS.SHIP_NORTH);
        expect(player.credits).toBe(CONFIG.INITIAL_CREDITS);
        expect(player.fuel).toBe(CONFIG.INITIAL_FUEL);
        expect(player.maxFuel).toBe(CONFIG.MAX_FUEL);
        expect(player.cargoCapacity).toBe(CONFIG.INITIAL_CARGO_CAPACITY);
        expect(player.mineralUnits).toBe(0);
    });

    it('should allow initialization with custom start values', () => {
        const customPlayer = new Player(10, -20, 'X');
        expect(customPlayer.worldX).toBe(10);
        expect(customPlayer.worldY).toBe(-20);
        expect(customPlayer.char).toBe('X'); // Initial char can be set
    });

    describe('moveWorld', () => {
        it('should update worldX and worldY coordinates', () => {
            player.moveWorld(1, 0); // Move right
            expect(player.worldX).toBe(CONFIG.PLAYER_START_X + 1);
            expect(player.worldY).toBe(CONFIG.PLAYER_START_Y);

            player.moveWorld(0, -2); // Move up twice
            expect(player.worldX).toBe(CONFIG.PLAYER_START_X + 1);
            expect(player.worldY).toBe(CONFIG.PLAYER_START_Y - 2);
        });

        it('should set char to PLAYER_CHAR', () => {
            player.char = '>'; // Change char temporarily
            player.moveWorld(1, 1);
            expect(player.char).toBe(CONFIG.PLAYER_CHAR);
        });
    });

    describe('moveSystem', () => {
        const moveInc = CONFIG.SYSTEM_MOVE_INCREMENT;
        const fineFactor = CONFIG.FINE_CONTROL_FACTOR;

        it('should update systemX/Y by SYSTEM_MOVE_INCREMENT', () => {
            player.moveSystem(1, 0); // Move right
            expect(player.systemX).toBe(moveInc);
            expect(player.systemY).toBe(0);
            player.moveSystem(0, -1); // Move up
            expect(player.systemX).toBe(moveInc);
            expect(player.systemY).toBe(-moveInc);
        });

        it('should update systemX/Y by a fraction with fine control', () => {
            player.moveSystem(1, 0, true); // Fine move right
            expect(player.systemX).toBeCloseTo(moveInc * fineFactor);
            expect(player.systemY).toBe(0);
            player.moveSystem(0, 1, true); // Fine move down
            expect(player.systemX).toBeCloseTo(moveInc * fineFactor);
            expect(player.systemY).toBeCloseTo(moveInc * fineFactor);
        });

        it('should update shipDirection and char based on movement', () => {
            player.moveSystem(1, 0); // Right
            expect(player.shipDirection).toBe(GLYPHS.SHIP_EAST);
            expect(player.char).toBe(GLYPHS.SHIP_EAST);

            player.moveSystem(-1, 0); // Left
            expect(player.shipDirection).toBe(GLYPHS.SHIP_WEST);
            expect(player.char).toBe(GLYPHS.SHIP_WEST);

            player.moveSystem(0, 1); // Down
            expect(player.shipDirection).toBe(GLYPHS.SHIP_SOUTH);
            expect(player.char).toBe(GLYPHS.SHIP_SOUTH);

            player.moveSystem(0, -1); // Up
            expect(player.shipDirection).toBe(GLYPHS.SHIP_NORTH);
            expect(player.char).toBe(GLYPHS.SHIP_NORTH);

             // Diagonal (vertical dominant)
             player.moveSystem(1, -1);
             expect(player.shipDirection).toBe(GLYPHS.SHIP_NORTH);
             expect(player.char).toBe(GLYPHS.SHIP_NORTH);
        });
    });

    describe('moveSurface', () => {
        const mapSize = 10; // Example map size

        it('should update surfaceX and surfaceY coordinates', () => {
            player.surfaceX = 5; player.surfaceY = 5;
            player.moveSurface(1, -1, mapSize);
            expect(player.surfaceX).toBe(6);
            expect(player.surfaceY).toBe(4);
        });

        it('should wrap coordinates around the map edges', () => {
            player.surfaceX = mapSize - 1; player.surfaceY = 0;
            player.moveSurface(1, 0, mapSize); // Move right off edge
            expect(player.surfaceX).toBe(0);
            expect(player.surfaceY).toBe(0);

            player.moveSurface(-1, 0, mapSize); // Move left off edge
            expect(player.surfaceX).toBe(mapSize - 1);
            expect(player.surfaceY).toBe(0);

            player.surfaceX = 5; player.surfaceY = mapSize - 1;
            player.moveSurface(0, 1, mapSize); // Move down off edge
            expect(player.surfaceX).toBe(5);
            expect(player.surfaceY).toBe(0);

            player.moveSurface(0, -1, mapSize); // Move up off edge
            expect(player.surfaceX).toBe(5);
            expect(player.surfaceY).toBe(mapSize - 1);
        });

        it('should set char to PLAYER_CHAR', () => {
            player.char = '>';
            player.moveSurface(1, 0, mapSize);
            expect(player.char).toBe(CONFIG.PLAYER_CHAR);
        });

        it('should not move if mapSize is invalid (<= 0)', () => {
            player.surfaceX = 5; player.surfaceY = 5;
            player.moveSurface(1, 0, 0);
            expect(player.surfaceX).toBe(5);
            expect(player.surfaceY).toBe(5);
            player.moveSurface(1, 0, -10);
             expect(player.surfaceX).toBe(5);
            expect(player.surfaceY).toBe(5);
        });
    });

     describe('distanceSqToSystemCoords', () => {
        it('should calculate the squared distance correctly', () => {
            player.systemX = 3000;
            player.systemY = 4000;
            // Target at (6000, 8000) -> dx=3000, dy=4000
            // distSq = 3000^2 + 4000^2 = 9,000,000 + 16,000,000 = 25,000,000
            expect(player.distanceSqToSystemCoords(6000, 8000)).toBe(25000000);
            // Target at origin (0,0)
            expect(player.distanceSqToSystemCoords(0, 0)).toBe(25000000);
            // Target at same location
            expect(player.distanceSqToSystemCoords(3000, 4000)).toBe(0);
        });
    });

    describe('addFuel', () => {
        it('should add fuel correctly when below max', () => {
            player.fuel = 100;
            player.addFuel(50);
            expect(player.fuel).toBe(150);
        });

        it('should not exceed maxFuel', () => {
            player.fuel = player.maxFuel - 20;
            player.addFuel(50); // Try to add more than capacity allows
            expect(player.fuel).toBe(player.maxFuel);
        });

         it('should not add fuel if already full', () => {
            player.fuel = player.maxFuel;
            player.addFuel(10);
            expect(player.fuel).toBe(player.maxFuel);
        });

        it('should handle adding zero or negative fuel', () => {
            player.fuel = 100;
            player.addFuel(0);
            expect(player.fuel).toBe(100);
            player.addFuel(-50); // Should ideally log a warning but not change fuel
            expect(player.fuel).toBe(100);
        });
    });

    describe('addCargo', () => {
        it('should add cargo correctly when below capacity', () => {
            player.mineralUnits = 10;
            const result = player.addCargo(20);
            expect(player.mineralUnits).toBe(30);
            expect(result).toBe(true);
        });

        it('should not exceed cargoCapacity', () => {
            player.mineralUnits = player.cargoCapacity - 10;
            const result = player.addCargo(30); // Try to add more than capacity
            expect(player.mineralUnits).toBe(player.cargoCapacity);
            expect(result).toBe(true); // Partially successful is still true
        });

         it('should return false if already full', () => {
            player.mineralUnits = player.cargoCapacity;
            const result = player.addCargo(10);
            expect(player.mineralUnits).toBe(player.cargoCapacity);
            expect(result).toBe(false);
        });

        it('should handle adding zero or negative cargo', () => {
             player.mineralUnits = 50;
            const resultZero = player.addCargo(0);
            expect(player.mineralUnits).toBe(50);
            expect(resultZero).toBe(false); // Adding zero is not considered successful

            const resultNegative = player.addCargo(-10);
            expect(player.mineralUnits).toBe(50);
            expect(resultNegative).toBe(false);
        });
    });
});