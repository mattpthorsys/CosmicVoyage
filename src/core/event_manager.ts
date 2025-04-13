// src/core/event_manager.ts

// Define the type for listener callbacks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ListenerCallback = (data?: any) => void;

/**
 * Simple Event Bus/Mediator for decoupled communication.
 */
class EventManager {
    // Map to store event names and their corresponding listener callbacks
    private listeners: Map<string, ListenerCallback[]> = new Map();

    /**
     * Subscribes a callback function to a specific event.
     * @param eventName The name of the event to subscribe to.
     * @param callback The function to call when the event is published.
     */
    subscribe(eventName: string, callback: ListenerCallback): void {
        // Get the list of listeners for this event, or create it if it doesn't exist
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        // Add the callback to the list
        this.listeners.get(eventName)!.push(callback);
        // console.log(`[EventManager] Listener subscribed to: ${eventName}`); // Optional: log subscriptions
    }

    /**
     * Unsubscribes a callback function from a specific event.
     * @param eventName The name of the event to unsubscribe from.
     * @param callback The specific callback function to remove.
     */
    unsubscribe(eventName: string, callback: ListenerCallback): void {
        // Check if the event exists in the map
        if (!this.listeners.has(eventName)) return;

        // Get the list of listeners for this event
        const eventListeners = this.listeners.get(eventName)!;
        // Find the index of the callback to remove
        const index = eventListeners.indexOf(callback);
        // If found, remove it from the array
        if (index > -1) {
            eventListeners.splice(index, 1);
            // console.log(`[EventManager] Listener unsubscribed from: ${eventName}`); // Optional: log unsubscriptions
        }
    }

    /**
     * Publishes (emits) an event, calling all subscribed listeners.
     * @param eventName The name of the event to publish.
     * @param data Optional data to pass to the listeners.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publish(eventName: string, data?: any): void {
        // Check if any listeners are registered for this event
        if (!this.listeners.has(eventName)) return;

        // console.log(`[EventManager] Publishing event: ${eventName}`, data); // Optional: log publications

        // Create a copy of the listeners array before iterating.
        // This prevents issues if a listener unsubscribes itself during the loop.
        const listenersToNotify = [...this.listeners.get(eventName)!];

        // Call each listener with the provided data
        listenersToNotify.forEach(callback => {
            try {
                 // Call the listener function
                 callback(data);
            } catch (error) {
                 // Log any errors that occur within a listener to prevent halting execution
                 console.error(`[EventManager] Error in listener for event "${eventName}":`, error);
                 // Consider using your main logger here as well
                 // logger.error(`[EventManager] Error in listener for event "${eventName}":`, error);
            }
        });
    }

    /** Clears all listeners for all events. */
    clearAll(): void {
        this.listeners.clear();
        console.log('[EventManager] All listeners cleared.');
    }
}

// Export a singleton instance of the EventManager for global use
export const eventManager = new EventManager();

// Define common event names as constants (optional but recommended)
export const GameEvents = {
    // State Changes
    GAME_STATE_CHANGED: 'gameStateChanged', // data: GameState (new state)
    SYSTEM_ENTERED: 'systemEntered',       // data: SolarSystem (the system entered)
    SYSTEM_LEFT: 'systemLeft',           // data: null
    PLANET_LANDED: 'planetLanded',         // data: Planet (the planet landed on)
    STARBASE_DOCKED: 'starbaseDocked',     // data: Starbase (the starbase docked at)
    LIFT_OFF: 'liftOff',               // data: null (lifted off from planet/starbase)

    // Player Actions/Updates
    PLAYER_MOVED: 'playerMoved',           // data: { oldPos, newPos, context: 'world'|'system'|'surface' }
    PLAYER_CARGO_ADDED: 'playerCargoAdded', // data: { elementKey: string, amountAdded: number, newTotal: number }
    PLAYER_CARGO_REMOVED: 'playerCargoRemoved',// data: { elementKey: string, amountRemoved: number }
    PLAYER_CARGO_SOLD: 'playerCargoSold',   // data: { items: Record<string, number>, creditsEarned: number }
    PLAYER_FUEL_CHANGED: 'playerFuelChanged', // data: { newFuel: number, maxFuel: number, amountChanged: number }
    PLAYER_CREDITS_CHANGED: 'playerCreditsChanged',// data: { newCredits: number, amountChanged: number }

    // UI Updates
    STATUS_UPDATE_NEEDED: 'statusUpdateNeeded', // data: { message: string, hasStarbase: boolean }
    POPUP_STATE_CHANGED: 'popupStateChanged', // data: { newState: 'inactive'|'opening'|'active'|'closing', content?: string[] }

    // Other Game Events
    LOG_DOWNLOAD_REQUESTED: 'logDownloadRequested', // data: null
    GAME_QUIT: 'gameQuit',                 // data: null
    SCAN_COMPLETE: 'scanComplete',         // data: { target: Planet | Starbase | 'Star', scanInfo: string[] }

    // Input (less common to broadcast raw input, but possible)
    // ACTION_TRIGGERED: 'actionTriggered',   // data: { actionName: string, type: 'pressed' | 'released' | 'active' }
};