// src/core/action_processor.ts - Modified processAction

import { GameStateManager } from './game_state_manager'; // Ensure GameState is imported if needed elsewhere
import { Player } from './player';
import { logger } from '../utils/logger';
import { MineralRichness } from '../constants';
import { CONFIG } from '../config';

export class ActionProcessor {
  private player: Player;
  private stateManager: GameStateManager;

  constructor(player: Player, stateManager: GameStateManager) {
    this.player = player;
    this.stateManager = stateManager;
    logger.debug('[ActionProcessor] Instance created.');
  }

  processAction(action: string): string {
    const currentState = this.stateManager.state; // deep copy
    logger.debug(`[ActionProcessor] Processing initial actions [${action}] in state: ${currentState}`);

    let statusMessage = '';
    let effectiveAction = action; // Start with the action received from InputManager

    // **** START CONTEXTUAL LOGIC ****
    // If the ambiguous 'l' key action was pressed, determine the real intent
    if (action === 'ACTIVATE_LAND_LIFTOFF') {
      // --- LOGGING STEP 1: Confirm this case is hit ---
      logger.info(`[ActionProcessor] Handling initial ACTIVATE_LAND_LIFTOFF.`);

      if (currentState === 'system') {
        effectiveAction = 'LAND'; // Interpret as LAND when in system view
        logger.info(`[ActionProcessor] In system, so effectiveAction should be LAND (and is ${effectiveAction})`);
        logger.debug(`[ActionProcessor] Interpreting 'ACTIVATE_LAND_LIFTOFF' as 'LAND' in state 'system'.`);
      } else if (currentState === 'planet' || currentState === 'starbase') {
        effectiveAction = 'LIFTOFF'; // Interpret as LIFTOFF when landed/docked
        logger.info(`[ActionProcessor] In system, so effectiveAction should be LIFTOFF (and is ${effectiveAction})`);
        logger.debug(`[ActionProcessor] Interpreting 'ACTIVATE_LAND_LIFTOFF' as 'LIFTOFF' in state '${currentState}'.`);
      } else {
        // Action 'l' doesn't make sense in other states (e.g., hyperspace)
        logger.warn(`[ActionProcessor] Action '${action}' triggered in unexpected state '${currentState}'. Ignoring.`);
        // Return an empty message or specific feedback if desired
        return `Cannot use that command (${action}) in ${currentState}.`;
      }
    }
    // **** END CONTEXTUAL LOGIC ****

    // Check for fine control only if the effective action is movement
    // (This check might be better placed in the Game loop before calling processAction,
    // but keeping it simple here for illustration based on previous code structure)
    let isFine = false;
    if (effectiveAction.startsWith('FINE_')) {
      isFine = true;
      effectiveAction = effectiveAction.substring(5);
    }

    logger.debug(`[ActionProcessor] Processing effective action '${effectiveAction}' in state '${this.stateManager.state}' (Fine: ${isFine})`);

    try {
      // --- Handle global actions ---
      // ... (e.g., DOWNLOAD_LOG, QUIT if handled here)

      // --- State-specific actions ---
      // Use the 'effectiveAction' in the switch
      switch (this.stateManager.state) {
        case 'hyperspace':
          // Pass effectiveAction, though LAND/LIFTOFF are ignored here anyway
          statusMessage = this._processHyperspaceAction(effectiveAction);
          break;
        case 'system':
          // Pass effectiveAction, _processSystemAction now correctly receives 'LAND'
          statusMessage = this._processSystemAction(effectiveAction, isFine);
          break;
        case 'planet':
          // Pass effectiveAction, _processPlanetAction now correctly receives 'LIFTOFF'
          statusMessage = this._processPlanetAction(effectiveAction);
          break;
        case 'starbase':
          // Pass effectiveAction, _processStarbaseAction now correctly receives 'LIFTOFF'
          statusMessage = this._processStarbaseAction(effectiveAction);
          break;
        default:
          statusMessage = `Unknown game state: ${this.stateManager.state}`;
          logger.warn(`[ActionProcessor] ${statusMessage}`);
          break;
      }
    } catch (error) {
      logger.error(`[ActionProcessor] Error processing effective action '${effectiveAction}' in state '${this.stateManager.state}':`, error);
      statusMessage = `ACTION ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }

    return statusMessage;
  }

  // --- Private State-Specific Action Handlers ---
  // These methods now receive the correctly interpreted action ('LAND' or 'LIFTOFF')
  // No changes are needed inside these methods for this specific 'l' key issue.

  private _processHyperspaceAction(action: string): string {
    let dx = 0, dy = 0, message = '';
    switch (action) {
      case 'MOVE_UP': dy = -1; break;
      case 'MOVE_DOWN': dy = 1; break;
      case 'MOVE_LEFT': dx = -1; break;
      case 'MOVE_RIGHT': dx = 1; break;
      case 'ENTER_SYSTEM': { // LAND/LIFTOFF ignored here
        const entered = this.stateManager.enterSystem();
        message = entered ? `Entering system: ${this.stateManager.currentSystem?.name}` : 'No star system detected at this location.';
      }
        break;
    }
    if (dx !== 0 || dy !== 0) this.player.moveWorld(dx, dy);
    return message;
  }

  private _processSystemAction(action: string, isFine: boolean): string {
    let dx = 0, dy = 0, message = '';
    switch (action) {
      case 'MOVE_UP': dy = -1; break;
      case 'MOVE_DOWN': dy = 1; break;
      case 'MOVE_LEFT': dx = -1; break;
      case 'MOVE_RIGHT': dx = 1; break;
      case 'LEAVE_SYSTEM': // LIFTOFF ignored here
        {
          const left = this.stateManager.leaveSystem();
          message = left ? 'Entered hyperspace.' : 'Must travel further from the star to leave the system.';
        }
        break;
      case 'LAND': // Correct action is received now
        logger.info(">>> ActionProcessor calling landOnNearbyObject for LAND action...");
        const landedObject = this.stateManager.landOnNearbyObject();
        message = landedObject ? `Approaching ${landedObject.name}...` : 'Nothing nearby to land on.';
        break;
    }
    if (dx !== 0 || dy !== 0) this.player.moveSystem(dx, dy, isFine);
    return message;
  }

  private _processPlanetAction(action: string): string {
    let dx = 0, dy = 0, message = '';
    const planet = this.stateManager.currentPlanet;
    if (!planet) return 'Error: Planet data missing!';
    switch (action) {
      case 'MOVE_UP': dy = -1; break;
      case 'MOVE_DOWN': dy = 1; break;
      case 'MOVE_LEFT': dx = -1; break;
      case 'MOVE_RIGHT': dx = 1; break;
      case 'LIFTOFF': // Correct action is received now
        {
          const lifted = this.stateManager.liftOff();
          message = lifted ? `Liftoff from ${planet.name} successful.` : 'Liftoff failed.';
        }
        break;
      case 'SCAN':
        if (planet.scanned) {
          message = `${planet.name} has already been scanned. (${planet.mineralRichness})`;
        } else {
          planet.scan(); // Scan logic moved to Planet
          message = `${planet.name} scan complete. Richness: ${planet.mineralRichness}, Resource: ${planet.primaryResource || 'N/A'}.`;
        }
        break;
      case 'MINE':
        if (planet.type === 'GasGiant' || planet.type === 'IceGiant') {
          message = `Cannot mine ${planet.type}.`;
        } else if (planet.mineralRichness === MineralRichness.NONE) {
          message = 'Scan detected no significant mineral deposits.';
        } else {
          // Calculate yield (logic could be moved to Planet or a MiningService)
          let yieldAmount = 0;
          switch (planet.mineralRichness) {
            case MineralRichness.POOR: yieldAmount = CONFIG.MINING_RATE_FACTOR * 1; break;
            case MineralRichness.AVERAGE: yieldAmount = CONFIG.MINING_RATE_FACTOR * 2; break;
            case MineralRichness.RICH: yieldAmount = CONFIG.MINING_RATE_FACTOR * 4; break;
            case MineralRichness.EXCEPTIONAL: yieldAmount = CONFIG.MINING_RATE_FACTOR * 8; break;
          }
          yieldAmount = Math.round(yieldAmount * planet.systemPRNG.random(0.8, 1.2));

          if (yieldAmount <= 0) {
            message = 'Mining yielded no results this time.';
          } else {
            const added = this.player.addCargo(yieldAmount); // Player logs details
            if (added) {
              const actuallyAdded = Math.min(yieldAmount, this.player.cargoCapacity - (this.player.mineralUnits - yieldAmount)); // Recalculate actual amount added
              message = `Mined ${actuallyAdded} units. (${this.player.mineralUnits}/${this.player.cargoCapacity})`;
              if (this.player.mineralUnits >= this.player.cargoCapacity) {
                message += ` Cargo hold full!`;
              }
            } else {
              message = `Mining failed: Cargo hold full. (${this.player.mineralUnits}/${this.player.cargoCapacity})`;
            }
          }
        }
        break;
    }

    if (dx !== 0 || dy !== 0) {
      try {
        planet.ensureSurfaceReady(); // Ensure map exists before getting size
        const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
        this.player.moveSurface(dx, dy, mapSize); // Player logs details
      } catch (surfaceError) {
        logger.error(`[ActionProcessor] Error preparing surface for movement on ${planet.name}:`, surfaceError);
        message = `Surface Error: ${surfaceError instanceof Error ? surfaceError.message : String(surfaceError)}`;
      }
    }
    return message;
  }

  private _processStarbaseAction(action: string): string {
    const starbase = this.stateManager.currentStarbase;
    let message = '';
    if (!starbase) return 'Error: Starbase data missing!';
    switch (action) {
      case 'LIFTOFF': // Correct action is received now
        {
          const lifted = this.stateManager.liftOff();
          message = lifted ? `Departing ${starbase.name}...` : 'Liftoff failed.';
        }
        break;
      case 'TRADE':
        // Basic Trade Logic (Sell all)
        {
          if (this.player.mineralUnits > 0) {
            const mineralsToSell = this.player.mineralUnits;
            const creditsEarned = mineralsToSell * CONFIG.MINERAL_SELL_PRICE;
            this.player.credits += creditsEarned;
            this.player.mineralUnits = 0; // Sell all
            message = `Sold ${mineralsToSell} units for ${creditsEarned} Cr.`;
            logger.info(`[ActionProcessor] Trade Complete: Sold ${mineralsToSell} minerals for ${creditsEarned} credits.`);
          } else {
            message = 'Cargo hold is empty. Nothing to sell.';
            logger.info('[ActionProcessor] Trade: No minerals to sell.');
          }
        }
        break;
      case 'REFUEL':
        {
          const fuelNeeded = this.player.maxFuel - this.player.fuel;
          if (fuelNeeded <= 0) {
            message = 'Fuel tank is already full.';
          } else {
            const creditsPerUnit = 1 / CONFIG.FUEL_PER_CREDIT;
            const maxAffordableFuel = this.player.credits * CONFIG.FUEL_PER_CREDIT;
            const fuelToBuy = Math.floor(Math.min(fuelNeeded, maxAffordableFuel)); // Buy whole units
            const cost = Math.ceil(fuelToBuy * creditsPerUnit);

            if (fuelToBuy <= 0 || cost <= 0 || this.player.credits < cost) {
              message = `Not enough credits for fuel (Need ${Math.ceil(creditsPerUnit)} Cr/unit).`;
            } else {
              this.player.credits -= cost;
              this.player.addFuel(fuelToBuy); // Player logs details
              message = `Purchased ${fuelToBuy} fuel for ${cost} Cr.`;
              if (this.player.fuel >= this.player.maxFuel) {
                message += ` Tank full!`;
              }
              logger.info(`[ActionProcessor] Refuel Complete: Bought ${fuelToBuy} fuel for ${cost} credits.`);
            }
          }
        }
        break;
    }
    return message;
  }
}