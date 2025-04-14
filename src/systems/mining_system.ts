// src/systems/mining_system.ts
import { Player } from '../core/player';
import { GameStateManager } from '../core/game_state_manager';
import { CargoSystem } from './cargo_systems'; // Assuming path is correct
import { eventManager, GameEvents } from '../core/event_manager';
import { logger } from '../utils/logger';
import { CONFIG } from '../config';
import { STATUS_MESSAGES, ELEMENTS } from '../constants';

export class MiningSystem {
  private player: Player;
  private stateManager: GameStateManager;
  private cargoSystem: CargoSystem;

  constructor(player: Player, stateManager: GameStateManager, cargoSystem: CargoSystem) {
    this.player = player;
    this.stateManager = stateManager;
    this.cargoSystem = cargoSystem;

    // Subscribe to the MINE_REQUESTED event
    eventManager.subscribe(GameEvents.MINE_REQUESTED, this.handleMineRequest.bind(this));

    logger.info('[MiningSystem] Initialized and subscribed to MINE_REQUESTED.');
  }

  /** Handles the MINE_REQUESTED event */
  private handleMineRequest(): void {
    logger.info(`!!!!!! [MiningSystem] handleMineRequest EXECUTION STARTED !!!!!!`); // Made it INFO level for visibility

    if (!this.stateManager) {
      logger.error('[MiningSystem] CRITICAL: stateManager is missing!');
      return; // Stop execution
    }
    if (!this.cargoSystem) {
      logger.error('[MiningSystem] CRITICAL: cargoSystem is missing!');
      return; // Stop execution
    }
    if (!this.player) {
      logger.error('[MiningSystem] CRITICAL: player is missing!');
      return; // Stop execution
    }
    logger.debug('[MiningSystem] Dependencies verified (stateManager, cargoSystem, player).');

    let statusMessage = '';
    let actionFailedReason: string | null = null;

    if (this.stateManager.state !== 'planet') {
      statusMessage = 'Mining requires landing on a planet surface.';
      actionFailedReason = 'Not landed';
      logger.warn('[MiningSystem] Mine attempted outside of planet state.');
    } else {
      const planet = this.stateManager.currentPlanet;
      if (!planet) {
        statusMessage = 'Mining Error: Planet data missing!';
        actionFailedReason = 'Planet data missing';
        logger.error("[MiningSystem] In 'planet' state but currentPlanet is null!");
      } else {
        // --- Perform Mining Logic ---
        try {
          // Check planet type and scan status
          if (planet.type === 'GasGiant' || planet.type === 'IceGiant') {
            statusMessage = STATUS_MESSAGES.PLANET_MINE_INVALID_TYPE(planet.type);
            actionFailedReason = 'Invalid planet type';
            logger.debug('[MiningSystem] Result: Invalid planet type');
          } else {
            // Ensure surface data (including element map) is ready
            planet.ensureSurfaceReady(); // Throws on failure
            const elementMap = planet.surfaceElementMap; // Use the getter

            if (!elementMap) {
              throw new Error('Surface element map data is missing after ensureSurfaceReady.');
            }

            const currentX = this.player.position.surfaceX;
            const currentY = this.player.position.surfaceY;
            logger.debug(`[MiningSystem] Player Position: [${currentX}, ${currentY}]`);

            // Check bounds for safety
            if (currentY < 0 || currentY >= elementMap.length || currentX < 0 || currentX >= elementMap[0].length) {
              throw new Error(`Player position [${currentX},${currentY}] out of map bounds.`);
            }

            // Check if already mined
            const isAlreadyMined = planet.isMined(currentX, currentY);
            logger.debug(`[MiningSystem] Is location [${currentX}, ${currentY}] already mined? ${isAlreadyMined}`);
            if (isAlreadyMined) {
              statusMessage = STATUS_MESSAGES.PLANET_MINE_DEPLETED;
              actionFailedReason = 'Location depleted';
              logger.debug('[MiningSystem] Result: Trace amounts');
            } else {
              const elementKey = elementMap[currentY][currentX];
              logger.debug(`[MiningSystem] Element key at [${currentX}, ${currentY}]: "${elementKey}"`);

              if (elementKey && elementKey !== '') {
                const elementInfo = ELEMENTS[elementKey];
                const baseAbundance = planet.elementAbundance[elementKey] || 0;
                logger.debug(
                  `[MiningSystem] Found element: ${elementInfo?.name || elementKey}, Base Abundance: ${baseAbundance}`
                );

                if (baseAbundance <= 0 && (!elementInfo || elementInfo.baseFrequency < 0.001)) {
                  statusMessage = STATUS_MESSAGES.PLANET_MINE_TRACE(elementInfo?.name || elementKey);
                  actionFailedReason = 'Trace amounts';
                  logger.debug('[MiningSystem] Result: Trace amounts');
                } else {
                  // Calculate yield
                  const abundanceFactor = Math.max(0.1, Math.sqrt(baseAbundance / 100));
                  const locationSeed = `mine_${currentX}_${currentY}`;
                  const minePRNG = planet.systemPRNG.seedNew(locationSeed);
                  let yieldAmount = CONFIG.MINING_RATE_FACTOR * abundanceFactor * minePRNG.random(0.6, 1.4);
                  yieldAmount = Math.max(1, Math.round(yieldAmount));
                  logger.debug(
                    `[MiningSystem] Calculated yield: ${yieldAmount} (Factor: ${abundanceFactor.toFixed(2)})`
                  );

                  // Add to cargo using CargoSystem
                  const actuallyAdded = this.cargoSystem.addItem(this.player.cargoHold, elementKey, yieldAmount);
                  logger.debug(`[MiningSystem] CargoSystem.addItem returned: ${actuallyAdded}`);

                  if (actuallyAdded > 0) {
                    planet.markMined(currentX, currentY); // Mark as mined *after* successful yield
                    const currentTotalCargo = this.cargoSystem.getTotalUnits(this.player.cargoHold);
                    statusMessage = STATUS_MESSAGES.PLANET_MINE_SUCCESS(
                      actuallyAdded,
                      elementInfo?.name || elementKey,
                      currentTotalCargo,
                      this.player.cargoHold.capacity
                    );
                    logger.debug(`[MiningSystem] Result: Success - Mined ${actuallyAdded} ${elementKey}`);
                    if (currentTotalCargo >= this.player.cargoHold.capacity) {
                      statusMessage += ` Cargo hold full!`;
                    }
                    // Publish PLAYER_CARGO_ADDED event
                    eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, {
                      elementKey: elementKey,
                      amountAdded: actuallyAdded,
                      newAmount: this.player.cargoHold.items[elementKey] || 0,
                      newTotalCargo: currentTotalCargo,
                    });
                    // Request render update as surface overlay might change (handled by Game listening to PLAYER_CARGO_ADDED maybe?)
                    // Alternatively, MiningSystem could publish a specific RENDER_UPDATE_REQUESTED event.
                    // For now, let's rely on status update triggering render.
                  } else {
                    // addCargo returned 0
                    statusMessage = STATUS_MESSAGES.PLANET_MINE_CARGO_FULL(
                      this.cargoSystem.getTotalUnits(this.player.cargoHold),
                      this.player.cargoHold.capacity
                    );
                    actionFailedReason = 'Cargo full'; // Set failure reason
                    logger.debug('[MiningSystem] Result: Cargo full');
                  }
                }
              } else {
                statusMessage = STATUS_MESSAGES.PLANET_MINE_NO_ELEMENTS;
                actionFailedReason = 'No elements found';
              }
            }
          }
        } catch (mineError) {
          logger.error(`[MiningSystem] Error during MINE action on ${planet?.name || 'unknown planet'}:`, mineError);
          statusMessage = `Mining Error: ${mineError instanceof Error ? mineError.message : String(mineError)}`;
          actionFailedReason = 'Error occurred';
        }
      }
    }

    logger.debug(
      `[MiningSystem] Final check before publish: statusMessage="${statusMessage}", actionFailedReason="${actionFailedReason}"`
    );

    // Publish results
    if (actionFailedReason) {
      logger.debug(`[MiningSystem] Publishing ACTION_FAILED event:`, { action: 'MINE', reason: actionFailedReason });
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'MINE', reason: actionFailedReason });
    }

    if (statusMessage) {
      logger.debug(`[MiningSystem] Publishing STATUS_UPDATE_NEEDED event:`, {
        message: statusMessage,
        hasStarbase: false,
      });
      eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, { message: statusMessage, hasStarbase: false });
    } else {
      logger.debug(`[MiningSystem] No status message set, skipping STATUS_UPDATE_NEEDED publish.`);
    }
    logger.info(`!!!!!! [MiningSystem] handleMineRequest EXECUTION FINISHED !!!!!!`); // Changed to INFO
  }

  /** Cleans up event listeners */
  destroy(): void {
    logger.info('[MiningSystem] Destroying and unsubscribing...');
    eventManager.unsubscribe(GameEvents.MINE_REQUESTED, this.handleMineRequest.bind(this));
  }
} // End MiningSystem class
