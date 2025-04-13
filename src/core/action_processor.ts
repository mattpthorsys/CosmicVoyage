// src/core/action_processor.ts (Fixed hyperspace scan return type, added comments)

// Removed GameStateManager import
import { Player } from './player';
import { logger } from '../utils/logger';
import { MineralRichness, ELEMENTS } from '../constants';
import { CONFIG } from '../config';
import { PRNG } from '../utils/prng';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { SolarSystem } from '@/entities/solar_system';
import { eventManager, GameEvents } from './event_manager'; // Import Event Manager
import { GameState } from './game_state_manager'; // Import GameState for context
import { GameStateManager } from './game_state_manager'; // Still need this for peekAtSystem

// Define a type for the result of processAction
// It can return:
// - A string message for the status bar.
// - An object indicating a scan request, specifying the context ('system_object' or 'planet_surface').
// - null if the action resulted in no specific message or request (e.g., handled by event).
export type ActionProcessResult = string | { requestScan: 'system_object' | 'planet_surface' } | null;


export class ActionProcessor {
  private player: Player;
  // *** Dependency on stateManager is still needed for peekAtSystem during hyperspace scan ***
  // If further decoupling is desired, the peek logic could also move to Game or be event-based.
  private stateManager: GameStateManager;

  // Keep stateManager in constructor for now
  constructor(player: Player, stateManager: GameStateManager) {
    this.player = player;
    this.stateManager = stateManager; // Keep reference for peekAtSystem
    logger.debug('[ActionProcessor] Instance created.');
  }

  // Takes currentState as input
  processAction(action: string, currentState: GameState): ActionProcessResult {
    logger.debug(`[ActionProcessor] Processing initial actions [${action}] in state: ${currentState}`);

    let statusMessage: string | null = null; // Use null initially
    let scanRequestResult: { requestScan: 'system_object' | 'planet_surface' } | null = null; // Store scan request
    let effectiveAction = action;

    // Contextual logic for ACTIVATE_LAND_LIFTOFF
    if (action === 'ACTIVATE_LAND_LIFTOFF') {
        // Logic for LAND/LIFTOFF remains the same...
        if (currentState === 'system') {
            effectiveAction = 'LAND';
        } else if (currentState === 'planet' || currentState === 'starbase') {
            effectiveAction = 'LIFTOFF';
        } else {
            logger.warn(`[ActionProcessor] Action '${action}' triggered in unexpected state '${currentState}'. Ignoring.`);
            return `Cannot use that command (${action}) in ${currentState}.`;
        }
        logger.debug(`[ActionProcessor] Interpreting 'ACTIVATE_LAND_LIFTOFF' as '${effectiveAction}'.`);
    }

    logger.debug(`[ActionProcessor] Processing effective action '${effectiveAction}' in state '${currentState}'`);

    try {
      // Handle global actions
      if (effectiveAction === 'DOWNLOAD_LOG') {
          logger.downloadLogFile();
          statusMessage = 'Log file download initiated.';
          return statusMessage;
      }

      // State-specific actions
      switch (currentState) {
        case 'hyperspace':
          // Handle scan request specifically
          if (effectiveAction === 'SCAN_SYSTEM_OBJECT') {
                // Perform the check here
                const peekedSystem = this.stateManager.peekAtSystem(this.player.worldX, this.player.worldY);
                if (peekedSystem) {
                     logger.debug(`[ActionProcessor] SCAN_SYSTEM_OBJECT in hyperspace: Found system ${peekedSystem.name}. Requesting scan.`);
                     // *** FIX: Return the request signal, not the target ***
                     scanRequestResult = { requestScan: 'system_object' };
                } else {
                     logger.debug(`[ActionProcessor] SCAN_SYSTEM_OBJECT in hyperspace: No system found.`);
                     statusMessage = 'Nothing nearby to scan.';
                }
          } else {
              // Handle other hyperspace actions (like ENTER_SYSTEM)
              statusMessage = this._processHyperspaceAction(effectiveAction);
          }
          break;
        case 'system':
          const systemResult = this._processSystemAction(effectiveAction);
          if (typeof systemResult === 'string' || systemResult === null) {
              statusMessage = systemResult;
          } else if (systemResult?.requestScan === 'system_object') {
              scanRequestResult = systemResult;
              statusMessage = 'Scanning nearby object/star...'; // Generic message
          }
          break;
        case 'planet':
           const planetResult = this._processPlanetAction(effectiveAction);
            if (typeof planetResult === 'string' || planetResult === null) {
                statusMessage = planetResult;
            } else if (planetResult?.requestScan === 'planet_surface') {
                scanRequestResult = planetResult;
                statusMessage = 'Scanning local surface...'; // Generic message
            }
          break;
        case 'starbase':
          statusMessage = this._processStarbaseAction(effectiveAction);
          break;
        default:
          statusMessage = `Unknown game state: ${currentState}`;
          logger.warn(`[ActionProcessor] ${statusMessage}`);
          break;
      }
    } catch (error) {
      logger.error(`[ActionProcessor] Error processing effective action '${effectiveAction}' in state '${currentState}':`, error);
      statusMessage = `ACTION ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Return scan request object OR status message OR null
    return scanRequestResult || statusMessage;
  }

  // --- Private State-Specific Action Handlers ---

  private _processHyperspaceAction(action: string): string | null {
    // Note: SCAN_SYSTEM_OBJECT is handled directly in processAction now
    let message: string | null = null;
    switch (action) {
      case 'ENTER_SYSTEM': {
        eventManager.publish(GameEvents.ENTER_SYSTEM_REQUESTED);
        message = 'System entry sequence initiated...';
        break;
      }
    }
    return message;
  }

  private _processSystemAction(action: string): ActionProcessResult {
    let message: string | null = null;
    switch (action) {
      case 'LEAVE_SYSTEM':
        {
          eventManager.publish(GameEvents.LEAVE_SYSTEM_REQUESTED);
          message = 'Hyperspace jump sequence initiated...';
        }
        break;
      case 'LAND':
        {
           eventManager.publish(GameEvents.LAND_REQUESTED);
           message = 'Landing sequence initiated...';
        }
        break;
      case 'SCAN_SYSTEM_OBJECT':
        {
            // *** SCAN LOGIC MOVED TO Game class ***
            // ActionProcessor now only signals the *intent* to scan in this context.
            // Game._handleScanRequest will determine the actual target.
            logger.debug('[ActionProcessor] Received SCAN_SYSTEM_OBJECT in system state. Returning scan request.');
            return { requestScan: 'system_object' };
        }
        // break; // Not reachable due to return
    }
    return message; // Return string message or null if not scanning
  }

  // Return type includes scan request possibility
  private _processPlanetAction(action: string): ActionProcessResult {
    let message: string | null = null;
    switch (action) {
      case 'LIFTOFF':
        {
           eventManager.publish(GameEvents.LIFTOFF_REQUESTED);
           message = 'Liftoff sequence initiated...';
        }
        break;
      case 'SCAN':
          // *** SCAN LOGIC MOVED TO Game class ***
          // ActionProcessor only signals the *intent* to scan the planet surface.
           logger.debug('[ActionProcessor] Received SCAN in planet state. Returning scan request.');
           return { requestScan: 'planet_surface' };
        // break; // Not reachable due to return
      case 'MINE':
           // Publish event, Game or another system will handle context checks
           eventManager.publish('MINE_REQUESTED'); // Define this event if needed
           message = 'Attempting to mine...';
        break;
    }
    return message; // Return string message or null if not scanning/mining
  }

  private _processStarbaseAction(action: string): string | null {
    let message: string | null = null;
    switch (action) {
      case 'LIFTOFF':
        {
          eventManager.publish(GameEvents.LIFTOFF_REQUESTED);
          message = 'Departure sequence initiated...';
        }
        break;
      case 'TRADE':
        {
            eventManager.publish('TRADE_REQUESTED'); // Define event
            message = 'Accessing trade terminal...';
        }
        break;
      case 'REFUEL':
        {
             eventManager.publish('REFUEL_REQUESTED'); // Define event
             message = 'Requesting refueling service...';
        }
        break;
    }
    return message;
  }
} // End ActionProcessor class