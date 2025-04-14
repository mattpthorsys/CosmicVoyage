// src/core/action_processor.ts (Fixed hyperspace scan return type, added comments)

// Removed GameStateManager import
import { Player } from './player';
import { logger } from '../utils/logger';
import { MineralRichness, ELEMENTS, STATUS_MESSAGES } from '../constants';
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
export type ActionProcessResult =
  | string
  | { requestScan: 'system_object' | 'planet_surface' }
  | { requestSystemPeek: true }
  | null;


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
    // Keep scanRequestResult typed specifically for scan requests or null
    let scanRequestResult: { requestScan: 'system_object' | 'planet_surface' } | null = null;
    let effectiveAction = action;

    // Contextual logic for ACTIVATE_LAND_LIFTOFF (remains the same)
    if (action === 'ACTIVATE_LAND_LIFTOFF') {
      // ... (logic as before) ...
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
      // Handle global actions (remains the same)
      if (effectiveAction === 'DOWNLOAD_LOG') {
        logger.downloadLogFile();
        statusMessage = 'Log file download initiated.';
        return statusMessage;
      }

      // State-specific actions
      switch (currentState) {
        case 'hyperspace':
          // Handle scan request specifically (corrected in previous step)
          if (effectiveAction === 'SCAN_SYSTEM_OBJECT') {
            logger.debug(`[ActionProcessor] SCAN_SYSTEM_OBJECT in hyperspace: Returning system peek request.`);
            return { requestSystemPeek: true }; // This is now the correct return for this specific case
          } else {
            // Handle other hyperspace actions (like ENTER_SYSTEM)
            statusMessage = this._processHyperspaceAction(effectiveAction);
          }
          break; // Break from the hyperspace case

        case 'system':
          const systemResult = this._processSystemAction(effectiveAction);
          // *** FIX: Use Type Guard before accessing requestScan ***
          if (typeof systemResult === 'string' || systemResult === null) {
            statusMessage = systemResult;
          } else if (typeof systemResult === 'object' && 'requestScan' in systemResult && systemResult.requestScan === 'system_object') {
            // Type guard confirms it's the scan request object
            scanRequestResult = systemResult; // Now safe to assign
            statusMessage = 'Scanning nearby object/star...'; // Generic message
          }
          // Note: systemResult should not be { requestSystemPeek: true } here, but no explicit check needed now.
          // *** END FIX ***
          break;

        case 'planet':
          const planetResult = this._processPlanetAction(effectiveAction);
          // *** FIX: Use Type Guard before accessing requestScan ***
          if (typeof planetResult === 'string' || planetResult === null) {
            statusMessage = planetResult;
          } else if (typeof planetResult === 'object' && 'requestScan' in planetResult && planetResult.requestScan === 'planet_surface') {
            // Type guard confirms it's the scan request object
            scanRequestResult = planetResult; // Now safe to assign
            statusMessage = 'Scanning local surface...'; // Generic message
          }
          // *** END FIX ***
          break;

        case 'starbase': // (remains the same)
          statusMessage = this._processStarbaseAction(effectiveAction);
          break;

        default: // (remains the same)
          statusMessage = `Unknown game state: ${currentState}`;
          logger.warn(`[ActionProcessor] ${statusMessage}`);
          break;
      }
    } catch (error) { // (remains the same)
      logger.error(`[ActionProcessor] Error processing effective action '${effectiveAction}' in state '${currentState}':`, error);
      statusMessage = `ACTION ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Return scan request object OR status message OR null
    // This logic remains correct as scanRequestResult is still properly typed
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
        eventManager.publish(GameEvents.MINE_REQUESTED); // Define this event if needed
        //message = 'Attempting to mine...';
        message = null;
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