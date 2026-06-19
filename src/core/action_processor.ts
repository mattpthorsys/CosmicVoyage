import { Player } from './player';
import { logger } from '../utils/logger';
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
  // The state manager remains available for hyperspace system previews until
  // that query is extracted into a dedicated survey service.
  private stateManager: GameStateManager;

  // Keep stateManager in constructor for now
  /** Initializes ActionProcessor. */
  constructor(player: Player, stateManager: GameStateManager) {
    this.player = player;
    this.stateManager = stateManager; // Keep reference for peekAtSystem
    logger.debug('[ActionProcessor] Instance created.');
  }

  // Takes currentState as input
  /** Processes action. */
  processAction(action: string, currentState: GameState): ActionProcessResult {
    logger.debug(`[ActionProcessor] Processing initial actions [${action}] in state: ${currentState}`);

    let statusMessage: string | null = null; // Use null initially
    // Keep scanRequestResult typed specifically for scan requests or null
    let scanRequestResult: { requestScan: 'system_object' | 'planet_surface' } | null = null;
    let effectiveAction = action;

    // Resolve the shared land/liftoff input against the active location.
    if (action === 'ACTIVATE_LAND_LIFTOFF') {
      // ... (logic as before) ...
      if (currentState === 'system') {
        effectiveAction = 'LAND';
      } else if (currentState === 'orbit' || currentState === 'planet' || currentState === 'starbase') {
        effectiveAction = 'LIFTOFF';
      } else {
        logger.warn(
          `[ActionProcessor] Action '${action}' triggered in unexpected state '${currentState}'. Ignoring.`
        );
        return `Cannot use that command (${action}) in ${currentState}.`;
      }
      logger.debug(`[ActionProcessor] Interpreting 'ACTIVATE_LAND_LIFTOFF' as '${effectiveAction}'.`);
    }

    logger.debug(
      `[ActionProcessor] Processing effective action '${effectiveAction}' in state '${currentState}'`
    );

    try {
      // Handle actions that are independent of the active location.
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
            logger.debug(
              `[ActionProcessor] SCAN_SYSTEM_OBJECT in hyperspace: Returning system peek request.`
            );
            return { requestSystemPeek: true }; // This is now the correct return for this specific case
          } else {
            // Handle other hyperspace actions (like ENTER_SYSTEM)
            statusMessage = this._processHyperspaceAction(effectiveAction);
          }
          break; // Break from the hyperspace case

        case 'system':
          const systemResult = this._processSystemAction(effectiveAction);
          // Narrow the result before reading the state-specific scan request.
          if (typeof systemResult === 'string' || systemResult === null) {
            statusMessage = systemResult;
          } else if (
            typeof systemResult === 'object' &&
            'requestScan' in systemResult &&
            systemResult.requestScan === 'system_object'
          ) {
            // Type guard confirms it's the scan request object
            scanRequestResult = systemResult; // Now safe to assign
            statusMessage = 'Scanning nearby object/star...'; // Generic message
          }
          // Note: systemResult should not be { requestSystemPeek: true } here, but no explicit check needed now.

          break;

        case 'orbit':
          statusMessage = this._processOrbitAction(effectiveAction);
          break;

        case 'planet':
          const planetResult = this._processPlanetAction(effectiveAction);
          // Narrow the result before reading the state-specific scan request.
          if (typeof planetResult === 'string' || planetResult === null) {
            statusMessage = planetResult;
          } else if (
            typeof planetResult === 'object' &&
            'requestScan' in planetResult &&
            planetResult.requestScan === 'planet_surface'
          ) {
            // Type guard confirms it's the scan request object
            scanRequestResult = planetResult; // Now safe to assign
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
      logger.error(
        `[ActionProcessor] Error processing effective action '${effectiveAction}' in state '${currentState}':`,
        error
      );
      statusMessage = `ACTION ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Return scan request object OR status message OR null
    // This logic remains correct as scanRequestResult is still properly typed
    return scanRequestResult || statusMessage;
  }

  // --- Private State-Specific Action Handlers ---

  /** Processes hyperspace action. */
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

  /** Processes system action. */
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
      case 'SCAN_SYSTEM_OBJECT': {
        // Return scan intent; Game selects and presents the concrete target.
        // ActionProcessor now only signals the *intent* to scan in this context.
        // Game._handleScanRequest will determine the actual target.
        logger.debug(
          '[ActionProcessor] Received SCAN_SYSTEM_OBJECT in system state. Returning scan request.'
        );
        return { requestScan: 'system_object' };
      }
      // break; // Not reachable due to return
    }
    return message; // Return string message or null if not scanning
  }

  // Return type includes scan request possibility
  /** Processes planet action. */
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
        // Return scan intent; Game selects and presents the concrete target.
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

  /** Processes orbit action. */
  private _processOrbitAction(action: string): string | null {
    switch (action) {
      case 'LIFTOFF':
        eventManager.publish(GameEvents.LIFTOFF_REQUESTED);
        return 'Breaking orbit...';
    }
    return null;
  }

  /** Processes starbase action. */
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
          eventManager.publish(GameEvents.TRADE_REQUESTED);
          message = null;
        }
        break;
      case 'REFUEL':
        {
          eventManager.publish(GameEvents.REFUEL_REQUESTED);
          message = null;
        }
        break;
    }
    return message;
  }
} // End ActionProcessor class
