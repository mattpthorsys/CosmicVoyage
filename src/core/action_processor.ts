// src/core/action_processor.ts

import { GameStateManager } from './game_state_manager';
import { Player } from './player';
import { logger } from '../utils/logger';
import { MineralRichness } from '../constants';
import { CONFIG } from '../config';

/** Processes actions based on the current game state. */
export class ActionProcessor {
  private player: Player;
  private stateManager: GameStateManager;
  // Add other dependencies if needed (e.g., TradeManager, CombatManager)

  constructor(player: Player, stateManager: GameStateManager) {
    this.player = player;
    this.stateManager = stateManager;
    logger.debug('[ActionProcessor] Instance created.');
  }

  /** Processes a single action based on the current game state. Returns status message. */
  processAction(action: string): string {
    let statusMessage = ''; // Default status
    let isFine = false;
    let baseAction = action;

    if (action.startsWith('FINE_')) {
      isFine = true;
      baseAction = action.substring(5);
    }

    logger.debug(`[ActionProcessor] Processing action '${baseAction}' in state '${this.stateManager.state}' (Fine: ${isFine})`);

    try {
      // --- Handle global actions (already handled in InputManager/Game loop - e.g., DOWNLOAD_LOG) ---
      // Could add global actions here if needed (pause, menu, etc.)

      // --- State-specific actions ---
      switch (this.stateManager.state) {
        case 'hyperspace':
          statusMessage = this._processHyperspaceAction(baseAction);
          break;
        case 'system':
          statusMessage = this._processSystemAction(baseAction, isFine);
          break;
        case 'planet':
          statusMessage = this._processPlanetAction(baseAction);
          break;
        case 'starbase':
          statusMessage = this._processStarbaseAction(baseAction);
          break;
        default:
          statusMessage = `Unknown game state: ${this.stateManager.state}`;
          logger.warn(`[ActionProcessor] ${statusMessage}`);
          break;
      }
    } catch (error) {
      logger.error(`[ActionProcessor] Error processing action '${baseAction}' in state '${this.stateManager.state}':`, error);
      statusMessage = `ACTION ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }

    return statusMessage; // Return status to be displayed by Game loop
  }

  // --- Private State-Specific Action Handlers ---

  private _processHyperspaceAction(action: string): string {
    let dx = 0;
    let dy = 0;
    let message = '';

    switch (action) {
      case 'MOVE_UP': dy = -1; break;
      case 'MOVE_DOWN': dy = 1; break;
      case 'MOVE_LEFT': dx = -1; break;
      case 'MOVE_RIGHT': dx = 1; break;
      case 'ENTER_SYSTEM':
        const entered = this.stateManager.enterSystem();
        message = entered
          ? `Entering system: ${this.stateManager.currentSystem?.name}`
          : 'No star system detected at this location.';
        break;
    }

    if (dx !== 0 || dy !== 0) {
      this.player.moveWorld(dx, dy); // Player method logs details
      // Hyperspace updates its own status in the main update loop
    }
    return message; // Return specific action status, main status handled by update
  }

  private _processSystemAction(action: string, isFine: boolean): string {
    let dx = 0;
    let dy = 0;
    let message = '';

    switch (action) {
      case 'MOVE_UP': dy = -1; break;
      case 'MOVE_DOWN': dy = 1; break;
      case 'MOVE_LEFT': dx = -1; break;
      case 'MOVE_RIGHT': dx = 1; break;
      case 'LEAVE_SYSTEM':
        const left = this.stateManager.leaveSystem();
        message = left ? 'Entered hyperspace.' : 'Must travel further from the star to leave the system.';
        break;
      case 'LAND':
        logger.info(">>> ActionProcessor calling landOnNearbyObject...");
        const landedObject = this.stateManager.landOnNearbyObject();
        message = landedObject
          ? `Approaching ${landedObject.name}...` // Landing success status handled in state update
          : 'Nothing nearby to land on.';
        break;
    }

    if (dx !== 0 || dy !== 0) {
      this.player.moveSystem(dx, dy, isFine); // Player method logs details
    }
    return message;
  }

  private _processPlanetAction(action: string): string {
    let dx = 0;
    let dy = 0;
    let message = '';
    const planet = this.stateManager.currentPlanet; // Get current planet context

    if (!planet) {
      logger.error('[ActionProcessor] Process Planet Action called but currentPlanet is null!');
      return 'Error: Planet data missing!';
    }

    switch (action) {
      case 'MOVE_UP': dy = -1; break;
      case 'MOVE_DOWN': dy = 1; break;
      case 'MOVE_LEFT': dx = -1; break;
      case 'MOVE_RIGHT': dx = 1; break;
      case 'LIFTOFF':
        const lifted = this.stateManager.liftOff();
        message = lifted ? `Liftoff from ${planet.name} successful.` : 'Liftoff failed.';
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

    if (!starbase) {
        logger.error('[ActionProcessor] Process Starbase Action called but currentStarbase is null!');
        return 'Error: Starbase data missing!';
    }

    switch (action) {
      case 'LIFTOFF':
        const lifted = this.stateManager.liftOff();
        message = lifted ? `Departing ${starbase.name}...` : 'Liftoff failed.';
        break;
      case 'TRADE':
        // Basic Trade Logic (Sell all)
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
        break;
      case 'REFUEL':
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
        break;
    }
    return message;
  }
}