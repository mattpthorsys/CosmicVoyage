// FILE: src/systems/cargo_system.ts

import { Player } from '../core/player';
import { CargoComponent } from '../core/components'; // Import component
import { logger } from '../utils/logger';
import { ELEMENTS } from '../constants'; // Potentially needed for item info

export class CargoSystem {

    constructor() {
        logger.info('[CargoSystem] Initialized.');
        // No event subscriptions needed if Game calls methods directly
    }

    /** Calculates the current total units of cargo held in a cargo component. */
    getTotalUnits(cargoHold: CargoComponent): number {
        return Object.values(cargoHold.items).reduce((sum, quantity) => sum + quantity, 0);
    }

    /**
     * Adds a specific amount of an element to the cargo hold component.
     * Returns the amount actually added (can be less than requested if full).
     */
    addItem(cargoHold: CargoComponent, elementKey: string, amount: number): number {
        if (amount <= 0) {
            logger.warn(`[CargoSystem] Attempted to add non-positive cargo amount: ${amount} of ${elementKey}`);
            return 0;
        }
        const currentTotal = this.getTotalUnits(cargoHold);
        const availableCapacity = cargoHold.capacity - currentTotal;

        if (availableCapacity <= 0) {
             // Log is handled by the caller (_handleMineRequest) which knows the context better
            // logger.warn(`[CargoSystem] Failed to add ${amount} ${elementKey}: Cargo already full (${currentTotal}/${cargoHold.capacity}).`);
            return 0;
        }

        const amountToAdd = Math.min(amount, availableCapacity);
        const oldElementAmount = cargoHold.items[elementKey] || 0;
        cargoHold.items[elementKey] = oldElementAmount + amountToAdd; // Modify component data

        // Logging is better handled by the caller which has more context (e.g., mined vs bought)
        // logger.info(`[CargoSystem] Added: ${amountToAdd} units of ${elementKey}. New Total: ${currentTotal + amountToAdd}/${cargoHold.capacity}.`);

        return amountToAdd;
    }

    /** Removes all cargo of a specific element type from the component. Returns the amount removed. */
    removeItemType(cargoHold: CargoComponent, elementKey: string): number {
        const amount = cargoHold.items[elementKey] || 0;
        if (amount > 0) {
            delete cargoHold.items[elementKey]; // Modify component data
             // Logging handled by caller (e.g., _handleTradeRequest)
            // logger.info(`[CargoSystem] Removed all ${amount} units of ${elementKey}.`);
            return amount;
        }
        return 0;
    }

    /** Removes all cargo from the component. Returns a record of the cargo removed. */
    clearAllItems(cargoHold: CargoComponent): Record<string, number> {
        const removedCargo = { ...cargoHold.items }; // Copy before clearing
        cargoHold.items = {}; // Modify component data
        const totalRemoved = Object.values(removedCargo).reduce((s, q) => s + q, 0);
         // Logging handled by caller (e.g., _handleTradeRequest)
        // if (totalRemoved > 0) { logger.info(`[CargoSystem] Cleared ${totalRemoved} units.`); }
        return removedCargo;
    }

     // Optional: Method to clean up if needed
     destroy(): void {
        logger.info('[CargoSystem] Destroyed.');
     }

} // End CargoSystem class