// src/core/event_manager.ts (Added Action Request Events)

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
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)!.push(callback);
    }

    /**
     * Unsubscribes a callback function from a specific event.
     * @param eventName The name of the event to unsubscribe from.
     * @param callback The specific callback function to remove.
     */
    unsubscribe(eventName: string, callback: ListenerCallback): void {
        if (!this.listeners.has(eventName)) return;
        const eventListeners = this.listeners.get(eventName)!;
        const index = eventListeners.indexOf(callback);
        if (index > -1) {
            eventListeners.splice(index, 1);
        }
    }

    /**
     * Publishes (emits) an event, calling all subscribed listeners.
     * @param eventName The name of the event to publish.
     * @param data Optional data to pass to the listeners.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publish(eventName: string, data?: any): void {
        if (!this.listeners.has(eventName)) return;
        const listenersToNotify = [...this.listeners.get(eventName)!];
        listenersToNotify.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventManager] Error in listener for event "${eventName}":`, error);
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

// Define common event names as constants
export const GameEvents = {
    // State Changes / Notifications (From GameStateManager -> Game)
    GAME_STATE_CHANGED: 'gameStateChanged', // data: GameState (new state)
    SYSTEM_ENTERED: 'systemEntered',       // data: SolarSystem (the system entered)
    SYSTEM_LEFT: 'systemLeft',           // data: null
    PLANET_LANDED: 'planetLanded',         // data: Planet (the planet landed on)
    STARBASE_DOCKED: 'starbaseDocked',     // data: Starbase (the starbase docked at)
    LIFT_OFF: 'liftOff',               // data: null (lifted off from planet/starbase)

    // Action Requests (From ActionProcessor -> GameStateManager)
    ENTER_SYSTEM_REQUESTED: 'enterSystemRequested', // data: null
    LEAVE_SYSTEM_REQUESTED: 'leaveSystemRequested', // data: null
    LAND_REQUESTED: 'landRequested',           // data: null
    LIFTOFF_REQUESTED: 'liftoffRequested',        // data: null
    TRADE_REQUESTED: 'tradeRequested',         // data: null -> Handled by Game
    REFUEL_REQUESTED: 'refuelRequested',       // data: null -> Handled by Game
    MINE_REQUESTED: 'mineRequested',           // data: null -> Handled by Game
    MOVE_REQUESTED: 'moveRequested', // data: MoveRequestData (defined in movement_system.ts)
    // Note: Scan requests are handled differently now (see Game/ActionProcessor)

    // Player Actions/Updates (From ActionProcessor/Player -> Game/UI)
    PLAYER_MOVED: 'playerMoved',           // data: { oldPos, newPos, context: 'world'|'system'|'surface' }
    PLAYER_CARGO_ADDED: 'playerCargoAdded', // data: { elementKey: string, amountAdded: number, newTotal: number }
    PLAYER_CARGO_REMOVED: 'playerCargoRemoved',// data: { elementKey: string, amountRemoved: number }
    PLAYER_CARGO_SOLD: 'playerCargoSold',   // data: { items: Record<string, number>, creditsEarned: number }
    PLAYER_FUEL_CHANGED: 'playerFuelChanged', // data: { newFuel: number, maxFuel: number, amountChanged: number }
    PLAYER_CREDITS_CHANGED: 'playerCreditsChanged',// data: { newCredits: number, amountChanged: number }
    ACTION_FAILED: 'actionFailed',             // data: { action: string, reason: string }

    // UI Updates (From Game -> Renderer/UI)
    STATUS_UPDATE_NEEDED: 'statusUpdateNeeded', // data: { message: string, hasStarbase: boolean }
    POPUP_STATE_CHANGED: 'popupStateChanged', // data: { newState: 'inactive'|'opening'|'active'|'closing', content?: string[] }

    // Other Game Events
    LOG_DOWNLOAD_REQUESTED: 'logDownloadRequested', // data: null
    GAME_QUIT: 'gameQuit',                 // data: null
    // SCAN_COMPLETE event might be useful later if scan takes time
    // SCAN_COMPLETE: 'scanComplete',         // data: { target: Planet | Starbase | SolarSystem, scanInfo: string[] }
};