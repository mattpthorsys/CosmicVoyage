// src/systems/movement_system.ts
// Full file updated to handle speedMultiplier based on zoom level.

import { Player } from '../core/player';
import { GameState } from '../core/game_state_manager'; // Assuming GameState type is defined/imported here
import { PositionComponent, RenderComponent } from '../core/components';
import { CONFIG } from '../config';
import { GLYPHS } from '../constants';
import { logger } from '../utils/logger';
import { eventManager, GameEvents } from '../core/event_manager';

// Define or import the event data structure expected by handleMoveRequest
interface MoveRequestData {
    dx: number;
    dy: number;
    isFineControl: boolean;
    isBoost: boolean; // Keep if using boost feature
    context: GameState;
    surfaceContext?: { mapSize: number };
    speedMultiplier?: number; // Optional speed multiplier from zoom
}

export class MovementSystem {
    private player: Player;

    constructor(player: Player) {
        this.player = player;
        logger.info('[MovementSystem] Initialized.');
        // Subscribe to the move request event
        eventManager.subscribe(GameEvents.MOVE_REQUESTED, this.handleMoveRequest.bind(this));
        logger.debug('[MovementSystem] Subscribed to MOVE_REQUESTED event.');
    }

    /** Handles MOVE_REQUESTED events from the event manager. */
    handleMoveRequest(data: MoveRequestData): void {
        // Basic validation of received data
        if (!data || typeof data.dx !== 'number' || typeof data.dy !== 'number' || !data.context) {
            logger.warn('[MovementSystem] Received invalid or incomplete move request data:', data);
            return;
        }

        // Extract speed multiplier, defaulting to 1.0 if not provided
        const speedMultiplier = data.speedMultiplier ?? 1.0;
        logger.debug(`[MovementSystem] Handling move request in context: ${data.context} (dx: ${data.dx}, dy: ${data.dy}, SpeedMult: ${speedMultiplier.toFixed(3)})`);

        // Get player components needed for movement
        const position = this.player.position;
        const render = this.player.render;

        try {
            // Process movement based on the game state context provided in the event data
            switch (data.context) {
                case 'hyperspace':
                    // Hyperspace movement is typically 1 unit per step, not affected by zoom
                    this._moveWorld(position, render, data.dx, data.dy);
                    break;
                case 'system':
                    // System movement IS affected by zoom speed multiplier
                    this._moveSystem(position, render, data.dx, data.dy, data.isFineControl, speedMultiplier);
                    break;
                case 'planet':
                    // Planet surface movement is typically 1 unit per step, not affected by zoom
                    if (data.surfaceContext?.mapSize && data.surfaceContext.mapSize > 0) {
                       this._moveSurface(position, render, data.dx, data.dy, data.surfaceContext.mapSize);
                    } else {
                         logger.warn(`[MovementSystem] Cannot move on surface: Missing or invalid mapSize in event data.`);
                         // Optionally publish an ACTION_FAILED event here?
                    }
                    break;
                case 'starbase':
                    // Movement is disabled when docked
                    logger.debug('[MovementSystem] Movement ignored in starbase state.');
                    break;
                default:
                     // Handle unknown context
                     logger.warn(`[MovementSystem] Unknown move context received: ${data.context}`);
            }
        } catch (error) {
             // Catch any unexpected errors during movement calculation
             logger.error(`[MovementSystem] Error during move handling for context ${data.context}: ${error}`);
             // Optionally publish an ACTION_FAILED event here too
        }
    }

    // --- Private Helper Methods for Movement Logic ---

    /** Updates player position in hyperspace (world coordinates). */
    private _moveWorld(position: PositionComponent, render: RenderComponent, dx: number, dy: number): void {
        const oldX = position.worldX;
        const oldY = position.worldY;
        position.worldX += dx; // Simple integer addition
        position.worldY += dy;
        render.char = CONFIG.PLAYER_CHAR; // Ensure player char is used
        logger.debug(`[MovementSystem] Player moved HYPERSPACE: [${oldX},${oldY}] -> [${position.worldX},${position.worldY}] (Delta: ${dx},${dy})`);
    }

    /** Updates player position in system view (meter coordinates), applying zoom speed multiplier. */
    private _moveSystem(position: PositionComponent, render: RenderComponent, dx: number, dy: number, isFineControl: boolean, speedMultiplier: number): void {
       const oldX = position.systemX;
       const oldY = position.systemY;

       // Calculate move scale in meters per tick
       let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT // Base meters per tick from config
                     * (isFineControl ? CONFIG.FINE_CONTROL_FACTOR : 1) // Apply fine control factor
                     * speedMultiplier; // <<< Apply zoom speed factor >>>

       // Optional: Clamp moveScale to prevent excessively large jumps per frame
       // const maxMovePerTick = CONFIG.SYSTEM_VIEW_SCALE * 10; // Example: Max 10 cells worth of movement
       // moveScale = Math.min(moveScale, maxMovePerTick);

       // Update position (meters)
       position.systemX += dx * moveScale;
       position.systemY += dy * moveScale;

       // Update direction glyph based on movement vector
       const oldShipDirection = render.directionGlyph;
       if (dx !== 0 || dy !== 0) {
           if (Math.abs(dx) > Math.abs(dy)) {
               render.directionGlyph = dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
           } else {
               render.directionGlyph = dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
           }
       }
       render.char = render.directionGlyph; // Update display character to match direction

       // Log using exponential notation for large meter values
       logger.debug(`[MovementSystem] Player moved SYSTEM: [${oldX.toExponential(2)},${oldY.toExponential(2)}] -> [${position.systemX.toExponential(2)},${position.systemY.toExponential(2)}] (Scale: ${moveScale.toExponential(1)} m/tick)`);
       if (oldShipDirection !== render.directionGlyph) {
           logger.debug(`[MovementSystem] Player direction changed: ${oldShipDirection} -> ${render.directionGlyph}`);
       }
    }

    /** Updates player position on a planet surface (grid coordinates with wrapping). */
     private _moveSurface(position: PositionComponent, render: RenderComponent, dx: number, dy: number, mapSize: number): void {
        if (mapSize <= 0) {
            logger.error(`[MovementSystem] Invalid mapSize (${mapSize}) for surface movement.`);
            return;
        }
        const oldX = position.surfaceX;
        const oldY = position.surfaceY;
        // Ensure wrapping works correctly using modulo
        position.surfaceX = (position.surfaceX + dx % mapSize + mapSize) % mapSize;
        position.surfaceY = (position.surfaceY + dy % mapSize + mapSize) % mapSize;
        render.char = CONFIG.PLAYER_CHAR; // Ensure player char is used
        logger.debug(`[MovementSystem] Player moved SURFACE: [${oldX},${oldY}] -> [${position.surfaceX},${position.surfaceY}]`);
    }

     /** Cleans up event listeners when the system is no longer needed. */
     destroy(): void {
        logger.info('[MovementSystem] Destroying and unsubscribing...');
        eventManager.unsubscribe(GameEvents.MOVE_REQUESTED, this.handleMoveRequest.bind(this));
     }

} // End MovementSystem class
