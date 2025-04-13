// FILE: src/systems/movement_system.ts
// Ensure event subscription and handler logic are correct

import { Player } from '../core/player';
import { GameState } from '../core/game_state_manager';
import { PositionComponent, RenderComponent } from '../core/components'; // Import components needed
import { CONFIG } from '../config';
import { GLYPHS } from '../constants';
import { logger } from '../utils/logger';
import { eventManager, GameEvents } from '../core/event_manager'; // Import event manager

// Define the event data structure (ensure this matches what Game._processInput publishes)
interface MoveRequestData {
    dx: number;
    dy: number;
    isFineControl: boolean;
    isBoost: boolean;
    context: GameState;
    surfaceContext?: { mapSize: number };
}


export class MovementSystem {
    private player: Player;

    constructor(player: Player) {
        this.player = player;
        logger.info('[MovementSystem] Initialized.');
        // *** ENSURE THIS SUBSCRIPTION IS PRESENT AND CORRECT ***
        eventManager.subscribe(GameEvents.MOVE_REQUESTED, this.handleMoveRequest.bind(this));
        logger.debug('[MovementSystem] Subscribed to MOVE_REQUESTED event.');
         // *** END ENSURE ***
    }

    /** Handles MOVE_REQUESTED events */
    handleMoveRequest(data: MoveRequestData): void {
         // Check if data is valid (optional but good practice)
         if (!data || typeof data.dx !== 'number' || typeof data.dy !== 'number') {
              logger.warn('[MovementSystem] Received invalid move request data:', data);
              return;
         }

        logger.debug(`[MovementSystem] Handling move request in context: ${data.context} (dx: ${data.dx}, dy: ${data.dy})`);
        const position = this.player.position; // Get position component
        const render = this.player.render;     // Get render component

        try {
            switch (data.context) {
                case 'hyperspace':
                    this._moveWorld(position, render, data.dx, data.dy);
                    break;
                case 'system':
                    this._moveSystem(position, render, data.dx, data.dy, data.isFineControl);
                    break;
                case 'planet':
                    if (data.surfaceContext?.mapSize && data.surfaceContext.mapSize > 0) { // Check mapSize validity
                       this._moveSurface(position, render, data.dx, data.dy, data.surfaceContext.mapSize);
                    } else {
                         logger.warn(`[MovementSystem] Cannot move on surface without valid mapSize in event data.`);
                         // Optionally publish an ACTION_FAILED event here?
                    }
                    break;
                case 'starbase':
                    // Movement explicitly disabled in starbase
                    logger.debug('[MovementSystem] Movement ignored in starbase state.');
                    break;
                default:
                     logger.warn(`[MovementSystem] Unknown move context received: ${data.context}`);
            }
        } catch (error) {
             logger.error(`[MovementSystem] Error during move handling for context ${data.context}: ${error}`);
             // Potentially publish an ACTION_FAILED event here too
        }
    }

    // --- Private Helper Methods (Copied logic, operating on components) ---

    private _moveWorld(position: PositionComponent, render: RenderComponent, dx: number, dy: number): void {
        const oldX = position.worldX;
        const oldY = position.worldY;
        position.worldX += dx;
        position.worldY += dy;
        render.char = CONFIG.PLAYER_CHAR; // Still update render component here for now
        logger.debug(`[MovementSystem] Player moved HYPERSPACE: [${oldX},${oldY}] -> [${position.worldX},${position.worldY}] (Delta: ${dx},${dy})`);
    }

    private _moveSystem(position: PositionComponent, render: RenderComponent, dx: number, dy: number, isFineControl: boolean): void {
       const oldX = position.systemX;
       const oldY = position.systemY;
       let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT * (isFineControl ? CONFIG.FINE_CONTROL_FACTOR : 1);
       position.systemX += dx * moveScale;
       position.systemY += dy * moveScale;

       // Update direction glyph based on movement
       const oldShipDirection = render.directionGlyph;
       if (dx !== 0 || dy !== 0) {
           if (Math.abs(dx) > Math.abs(dy)) {
               render.directionGlyph = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
           } else {
               render.directionGlyph = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
           }
       }
       render.char = render.directionGlyph; // Update character to match direction

       logger.debug(`[MovementSystem] Player moved SYSTEM: [${oldX.toFixed(0)},${oldY.toFixed(0)}] -> [${position.systemX.toFixed(0)},${position.systemY.toFixed(0)}]`);
       if (oldShipDirection !== render.directionGlyph) {
           logger.debug(`[MovementSystem] Player direction changed: ${oldShipDirection} -> ${render.directionGlyph}`);
       }
    }

     private _moveSurface(position: PositionComponent, render: RenderComponent, dx: number, dy: number, mapSize: number): void {
        // mapSize check is done in handleMoveRequest now
        const oldX = position.surfaceX;
        const oldY = position.surfaceY;
        // Ensure wrapping works correctly with modulo on potentially negative results
        position.surfaceX = (position.surfaceX + dx % mapSize + mapSize) % mapSize;
        position.surfaceY = (position.surfaceY + dy % mapSize + mapSize) % mapSize;
        render.char = CONFIG.PLAYER_CHAR; // Update render component
        logger.debug(`[MovementSystem] Player moved SURFACE: [${oldX},${oldY}] -> [${position.surfaceX},${position.surfaceY}]`);
    }

     destroy(): void {
        // *** ENSURE THIS UNSUBSCRIPTION IS PRESENT AND CORRECT ***
        eventManager.unsubscribe(GameEvents.MOVE_REQUESTED, this.handleMoveRequest.bind(this));
        logger.info('[MovementSystem] Destroyed and unsubscribed.');
     }

} // End MovementSystem class