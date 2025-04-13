// FILE: src/core/player.ts
// MODIFIED: To use Component data structures

import { CONFIG } from '../config';
import { logger } from '../utils/logger';
// *** ADD: Import Component interfaces and helper functions ***
import {
    PositionComponent, RenderComponent, ResourceComponent, CargoComponent,
    createDefaultPosition, createDefaultRender, createDefaultResource, createDefaultCargo
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
        if (this.render.directionGlyph === undefined) { // Ensure default if not set
            this.render.directionGlyph = '^'; // Or import GLYPHS just for this default
        }

        this.resources = createDefaultResource(
            CONFIG.INITIAL_CREDITS,
            CONFIG.INITIAL_FUEL,
            CONFIG.MAX_FUEL
        );

        this.cargoHold = createDefaultCargo(CONFIG.INITIAL_CARGO_CAPACITY);

        logger.info(`Player components initialized. Start World: [${this.position.worldX}, ${this.position.worldY}], Char: ${this.render.char}, Credits: ${this.resources.credits}, Fuel: ${this.resources.fuel}/${this.resources.maxFuel}, Cargo Cap: ${this.cargoHold.capacity}`);
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
            logger.info(`Fuel added: ${added.toFixed(0)}. Total: ${this.resources.fuel.toFixed(0)}/${this.resources.maxFuel} (was ${oldFuel.toFixed(0)})`);
        } else {
            logger.info(`Attempted to add ${amount.toFixed(0)} fuel, but tank is full (${this.resources.fuel.toFixed(0)}/${this.resources.maxFuel}).`);
        }
    }

    /** Calculates the current total units of cargo held. (NEEDS UPDATE) */
    getCurrentCargoTotal(): number {
        return Object.values(this.cargoHold.items).reduce((sum, quantity) => sum + quantity, 0); // Access via component
    }

    /** Adds a specific amount of an element to the cargo hold. (NEEDS UPDATE) */
    addCargo(elementKey: string, amount: number): number {
        if (amount <= 0) {
            logger.warn(`Attempted to add non-positive cargo amount: ${amount} of ${elementKey}`);
            return 0;
        }
        const currentTotal = this.getCurrentCargoTotal();
        const availableCapacity = this.cargoHold.capacity - currentTotal; // Access via component
        if (availableCapacity <= 0) {
            logger.warn(`Failed to add ${amount} ${elementKey}: Cargo already full (${currentTotal}/${this.cargoHold.capacity}).`);
            return 0;
        }
        const amountToAdd = Math.min(amount, availableCapacity);
        const oldElementAmount = this.cargoHold.items[elementKey] || 0; // Access via component
        this.cargoHold.items[elementKey] = oldElementAmount + amountToAdd; // Modify component data

        logger.info(`Cargo Added: ${amountToAdd} units of ${elementKey}. Total Cargo: ${currentTotal + amountToAdd}/${this.cargoHold.capacity}. (${elementKey}: ${this.cargoHold.items[elementKey]})`);
        if (amountToAdd < amount) {
            logger.warn(`Could only add ${amountToAdd} units of ${elementKey} (requested ${amount}). Cargo hold now full.`);
        }
        return amountToAdd;
    }

    /** Removes all cargo of a specific element. (NEEDS UPDATE) */
    removeCargoType(elementKey: string): number {
        const amount = this.cargoHold.items[elementKey] || 0; // Access via component
        if (amount > 0) {
            delete this.cargoHold.items[elementKey]; // Modify component data
            logger.info(`Removed all ${amount} units of ${elementKey} from cargo.`);
            return amount;
        }
        return 0;
    }

    /** Removes all cargo. Returns a record of the cargo removed. (NEEDS UPDATE) */
    clearCargo(): Record<string, number> {
        const removedCargo = { ...this.cargoHold.items }; // Access via component
        this.cargoHold.items = {}; // Modify component data
        const totalRemoved = Object.values(removedCargo).reduce((s, q) => s + q, 0);
        if (totalRemoved > 0) {
            logger.info(`Cleared all cargo (${totalRemoved} units). Contents: ${JSON.stringify(removedCargo)}`);
        } else {
            logger.info(`Cleared cargo (was already empty).`);
        }
        return removedCargo;
    }

} // End Player class