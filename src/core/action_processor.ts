// src/core/action_processor.ts (Added SCAN_SYSTEM_OBJECT action)

import { GameStateManager } from './game_state_manager';
import { Player } from './player';
import { logger } from '../utils/logger';
import { MineralRichness, ELEMENTS } from '../constants';
// Import ELEMENTS
import { CONFIG } from '../config';
import { PRNG } from '../utils/prng';
// Import PRNG
import { Planet } from '../entities/planet'; // Import Planet
import { Starbase } from '../entities/starbase'; // Import Starbase

// Define a type for the result of processAction, which can include a scan target
export type ActionProcessResult = string | { scanTarget: Planet | Starbase | 'Star' } | null;


export class ActionProcessor {
  private player: Player;
  private stateManager: GameStateManager;

  constructor(player: Player, stateManager: GameStateManager) {
    this.player = player;
    this.stateManager = stateManager;
    logger.debug('[ActionProcessor] Instance created.');
  }

  // *** UPDATED Return Type ***
  processAction(action: string): ActionProcessResult {
    const currentState = this.stateManager.state;
    logger.debug(`[ActionProcessor] Processing initial actions [${action}] in state: ${currentState}`);

    let statusMessage: string = '';
    let scanTargetResult: { scanTarget: Planet | Starbase | 'Star' } | null = null; // Store scan target
    let effectiveAction = action;

    // Contextual logic for ACTIVATE_LAND_LIFTOFF
    if (action === 'ACTIVATE_LAND_LIFTOFF') {
      logger.info(`[ActionProcessor] Handling initial ACTIVATE_LAND_LIFTOFF.`);
      if (currentState === 'system') {
        effectiveAction = 'LAND';
        logger.info(`[ActionProcessor] In system, so effectiveAction should be LAND (and is ${effectiveAction})`);
        logger.debug(`[ActionProcessor] Interpreting 'ACTIVATE_LAND_LIFTOFF' as 'LAND' in state 'system'.`);
      } else if (currentState === 'planet' || currentState === 'starbase') {
        effectiveAction = 'LIFTOFF';
        logger.info(`[ActionProcessor] In ${currentState}, so effectiveAction should be LIFTOFF (and is ${effectiveAction})`);
        logger.debug(`[ActionProcessor] Interpreting 'ACTIVATE_LAND_LIFTOFF' as 'LIFTOFF' in state '${currentState}'.`);
      } else {
        logger.warn(`[ActionProcessor] Action '${action}' triggered in unexpected state '${currentState}'. Ignoring.`);
        return `Cannot use that command (${action}) in ${currentState}.`;
      }
    }

    logger.debug(`[ActionProcessor] Processing effective action '${effectiveAction}' in state '${this.stateManager.state}'`);
    try {
      // Handle global actions
      if (effectiveAction === 'DOWNLOAD_LOG') {
          logger.downloadLogFile();
          statusMessage = 'Log file download initiated.';
          return statusMessage;
      }

      // State-specific actions
      switch (this.stateManager.state) {
        case 'hyperspace':
          statusMessage = this._processHyperspaceAction(effectiveAction);
          break;
        case 'system':
          // *** MODIFIED: Handle scan target result ***
          const systemResult = this._processSystemAction(effectiveAction);
          if (typeof systemResult === 'string') {
            statusMessage = systemResult;
          } else if (systemResult && systemResult.scanTarget) {
            scanTargetResult = systemResult; // Store the scan target object
            statusMessage = `Scanning ${systemResult.scanTarget === 'Star' ? 'local star' : systemResult.scanTarget.name}...`;
          }
          break;
        case 'planet':
          statusMessage = this._processPlanetAction(effectiveAction);
          break;
        case 'starbase':
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

    // *** MODIFIED: Return scan target or status message ***
    return scanTargetResult || statusMessage;
  }

  // --- Private State-Specific Action Handlers ---

  private _processHyperspaceAction(action: string): string {
    let message = '';
    switch (action) {
      case 'ENTER_SYSTEM': {
        const entered = this.stateManager.enterSystem();
        message = entered ? `Entering system: ${this.stateManager.currentSystem?.name}` : 'No star system detected at this location.';
      }
        break;
      // PEEK_SYSTEM (now potentially unbound or used for something else)
      // case 'PEEK_SYSTEM': ...
      // Movement actions (like MOVE_UP etc.) don't return messages here as they are handled by Game loop
    }
    return message;
  }

  // *** UPDATED Return Type ***
  private _processSystemAction(action: string): ActionProcessResult {
    let message = '';
    switch (action) {
      case 'LEAVE_SYSTEM':
        {
          const left = this.stateManager.leaveSystem();
          message = left ? 'Entered hyperspace.' : 'Must travel further from the star to leave the system.';
        }
        break;
      case 'LAND':
        {
          logger.info(">>> ActionProcessor calling landOnNearbyObject for LAND action...");
          const landedObject = this.stateManager.landOnNearbyObject();
          message = landedObject ? `Approaching ${landedObject.name}...` : 'Nothing nearby to land on.';
        }
        break;
      // *** NEW: SCAN_SYSTEM_OBJECT Action ***
      case 'SCAN_SYSTEM_OBJECT':
        {
            const system = this.stateManager.currentSystem;
            if (!system) {
                return 'Scan Error: Not currently in a system.';
            }
            // Find nearest non-star object
            const nearbyObject = system.getObjectNear(this.player.systemX, this.player.systemY);
            const distSqToObject = nearbyObject
                ? this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY)
                : Infinity; // If no object, distance is infinite

            // Find distance to star
            const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);

            // Determine target: Scan star if it's closer OR if no other object is within double landing distance
            const scanThresholdSq = (CONFIG.LANDING_DISTANCE * 2) ** 2;

            if (distSqToStar < distSqToObject && distSqToStar < scanThresholdSq) {
                logger.debug(`[ActionProcessor] SCAN_SYSTEM_OBJECT: Star is closer (DistSq: ${distSqToStar.toFixed(0)}). Scanning star.`);
                return { scanTarget: 'Star' };
            } else if (nearbyObject && distSqToObject < scanThresholdSq) {
                logger.debug(`[ActionProcessor] SCAN_SYSTEM_OBJECT: Nearby object ${nearbyObject.name} found (DistSq: ${distSqToObject.toFixed(0)}). Scanning object.`);
                return { scanTarget: nearbyObject };
            } else {
                logger.debug(`[ActionProcessor] SCAN_SYSTEM_OBJECT: No object or star within scan range (${Math.sqrt(scanThresholdSq).toFixed(0)} units).`);
                message = 'Nothing close enough to scan.';
            }
        }
        break;
       // Movement actions (like MOVE_UP etc.) don't return messages here
    }
    return message; // Return string message if not scanning
  }

  private _processPlanetAction(action: string): string {
    let message = '';
    const planet = this.stateManager.currentPlanet;
    if (!planet) return 'Error: Planet data missing!';
    switch (action) {
      case 'LIFTOFF':
        {
          const lifted = this.stateManager.liftOff();
          message = lifted ? `Liftoff from ${planet.name} successful.` : 'Liftoff failed.';
        }
        break;
      case 'SCAN':
        if (planet.scanned) {
          message = `${planet.name} has already been scanned. (${planet.mineralRichness})`;
        } else {
          planet.scan();
          message = `${planet.name} scan complete. Primary: ${planet.primaryResource || 'N/A'}. Richness: ${planet.mineralRichness}.`;
        }
        break;
      case 'MINE':
        if (planet.type === 'GasGiant' || planet.type === 'IceGiant') {
          message = `Cannot mine surface of ${planet.type}.`;
        } else if (!planet.scanned) {
            message = `Scan required before mining. Richness potential: ${planet.mineralRichness}.`;
        } else {
             try {
                planet.ensureSurfaceReady(); // Ensure surface data is ready
                const elementMap = planet.surfaceElementMap; // Use the getter
                const currentX = this.player.surfaceX;
                const currentY = this.player.surfaceY;

                if (planet.isMined(currentX, currentY)) { // Check if mined
                    message = 'This location has already been depleted.';
                    break; // Exit MINE case
                }

                if (!elementMap) {
                     throw new Error("Surface element map data is missing after ensureSurfaceReady.");
                }

                if (currentY < 0 || currentY >= elementMap.length || currentX < 0 || currentX >= elementMap[0].length) {
                    logger.error(`[ActionProcessor] Player surface coordinates [${currentX}, ${currentY}] are out of bounds for element map [${elementMap[0].length}x${elementMap.length}].`);
                    throw new Error(`Player position [${currentX},${currentY}] out of map bounds.`);
                }
                const elementKey = elementMap[currentY][currentX]; // Get element key from map

                if (elementKey && elementKey !== '') { // Found a mineable element
                    const elementInfo = ELEMENTS[elementKey];
                    const baseAbundance = planet.elementAbundance[elementKey] || 0;

                    if (baseAbundance <= 0 && (!elementInfo || elementInfo.baseFrequency < 0.001)) {
                        message = `Trace amounts of ${elementInfo?.name || elementKey} found, but not enough to mine.`;
                        logger.warn(`[ActionProcessor] Mining ${elementKey} at [${currentX},${currentY}], but planet overall abundance is 0 or element is extremely rare.`);
                    } else {
                        // Calculate yield
                        const abundanceFactor = Math.max(0.1, Math.sqrt(baseAbundance / 100));
                        const locationSeed = `mine_${currentX}_${currentY}`;
                        const minePRNG = planet.systemPRNG.seedNew(locationSeed);
                        let yieldAmount = CONFIG.MINING_RATE_FACTOR * abundanceFactor * minePRNG.random(0.6, 1.4);
                        yieldAmount = Math.max(1, Math.round(yieldAmount));

                        // Add to cargo
                        const actuallyAdded = this.player.addCargo(elementKey, yieldAmount);
                        if (actuallyAdded > 0) {
                            message = `Mined ${actuallyAdded} units of ${elementInfo?.name || elementKey}. (${this.player.getCurrentCargoTotal()}/${this.player.cargoCapacity})`;
                            if (this.player.getCurrentCargoTotal() >= this.player.cargoCapacity) {
                                message += ` Cargo hold full!`;
                            }
                            planet.markMined(currentX, currentY); // Mark as mined
                        } else {
                            message = `Mining failed: Cargo hold full. (${this.player.getCurrentCargoTotal()}/${this.player.cargoCapacity})`;
                        }
                    }
                } else {
                    message = 'Found no mineable elements at this location.';
                }
             } catch(mineError) {
                 logger.error(`[ActionProcessor] Error during MINE action on ${planet.name}:`, mineError);
                 message = `Mining Error: ${mineError instanceof Error ? mineError.message : String(mineError)}`;
             }
        }
        break; // End MINE case
       // Movement actions (like MOVE_UP etc.) don't return messages here
    }
    return message;
  }

  private _processStarbaseAction(action: string): string {
    const starbase = this.stateManager.currentStarbase;
    let message = '';
    if (!starbase) return 'Error: Starbase data missing!';
    switch (action) {
      case 'LIFTOFF':
        {
          const lifted = this.stateManager.liftOff();
          message = lifted ? `Departing ${starbase.name}...` : 'Liftoff failed.';
        }
        break;
      case 'TRADE':
        {
          const currentCargo = this.player.cargo;
          const totalUnitsSold = this.player.getCurrentCargoTotal(); // Get total before clearing

          if (totalUnitsSold <= 0) {
             message = 'Cargo hold is empty. Nothing to sell.';
             logger.info('[ActionProcessor] Trade: No cargo to sell.');
          } else {
              let totalCreditsEarned = 0;
              let soldItemsLog: string[] = [];
              for (const elementKey in currentCargo) { // Iterate through player's cargo
                 const amount = currentCargo[elementKey];
                 const elementInfo = ELEMENTS[elementKey];
                 if (amount > 0 && elementInfo) {
                      const valuePerUnit = elementInfo.baseValue;
                      const creditsEarned = amount * valuePerUnit;
                      totalCreditsEarned += creditsEarned;
                      soldItemsLog.push(`${amount} ${elementInfo.name}`);
                 } else {
                      logger.warn(`[ActionProcessor] Trade: Skipping unknown or zero amount item in cargo: ${elementKey}`);
                 }
              }

              this.player.credits += totalCreditsEarned;
              this.player.clearCargo();

              message = `Sold ${soldItemsLog.join(', ')} (${totalUnitsSold} units) for ${totalCreditsEarned} Cr.`;
              logger.info(`[ActionProcessor] Trade Complete: Sold ${totalUnitsSold} units for ${totalCreditsEarned} credits.`);
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
            const fuelToBuy = Math.floor(Math.min(fuelNeeded, maxAffordableFuel));
            const cost = Math.ceil(fuelToBuy * creditsPerUnit);

            if (fuelToBuy <= 0 || this.player.credits < cost) {
              message = `Not enough credits for fuel (Need ${creditsPerUnit.toFixed(1)} Cr/unit). Have ${this.player.credits} Cr.`;
            } else {
              this.player.credits -= cost;
              this.player.addFuel(fuelToBuy);
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
} // End ActionProcessor class