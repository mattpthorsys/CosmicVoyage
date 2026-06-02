// src/systems/mining_system.ts
import { Player } from '../core/player';
import { GameStateManager } from '../core/game_state_manager';
import { CargoSystem } from './cargo_systems'; // Assuming path is correct
import { eventManager, GameEvents } from '../core/event_manager';
import { logger } from '../utils/logger';
import { CONFIG } from '../config';
import { STATUS_MESSAGES, ELEMENTS } from '../constants';
import { TerminalOverlay } from '@/rendering/terminal_overlay';
import { Planet } from '../entities/planet';

export interface MiningEstimate {
  canMine: boolean;
  elementKey?: string;
  elementName?: string;
  maxAmount: number;
  message?: string;
}

export class MiningSystem {

  private readonly terminalOverlay: TerminalOverlay;

  private player: Player;
  private stateManager: GameStateManager;
  private cargoSystem: CargoSystem;

  constructor(player: Player, stateManager: GameStateManager, cargoSystem: CargoSystem) {
    this.player = player;
    this.stateManager = stateManager;
    this.cargoSystem = cargoSystem;
    this.terminalOverlay = new TerminalOverlay();

    // Subscribe to the MINE_REQUESTED event
    eventManager.subscribe(GameEvents.MINE_REQUESTED, this.handleMineRequest.bind(this));

    logger.info('[MiningSystem] Initialized and subscribed to MINE_REQUESTED.');
  }

  /** Handles the MINE_REQUESTED event */
  private handleMineRequest(): void {
    this.mine();
  }

  getMiningEstimate(): MiningEstimate {
    if (this.stateManager.state !== 'planet') {
      return { canMine: false, maxAmount: 0, message: 'Mining requires landing on a planet surface.' };
    }
    const planet = this.stateManager.currentPlanet;
    if (!planet) {
      return { canMine: false, maxAmount: 0, message: 'Mining Error: Planet data missing!' };
    }
    try {
      const site = this.getMiningSite(planet);
      if (!site.canMine) return site;
      const cargoHold = this.player.getActiveSurfaceCargoHold();
      const freeCargo = cargoHold.capacity - this.cargoSystem.getTotalUnits(cargoHold);
      if (freeCargo <= 0) {
        return {
          canMine: false,
          maxAmount: 0,
          elementKey: site.elementKey,
          elementName: site.elementName,
          message: STATUS_MESSAGES.PLANET_MINE_CARGO_FULL(
            this.cargoSystem.getTotalUnits(cargoHold),
            cargoHold.capacity
          ),
        };
      }
      return { ...site, maxAmount: Math.min(site.maxAmount, freeCargo) };
    } catch (mineError) {
      return {
        canMine: false,
        maxAmount: 0,
        message: `Mining Error: ${mineError instanceof Error ? mineError.message : String(mineError)}`,
      };
    }
  }

  mine(requestedAmount?: number): void {
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
        try {
          const site = this.getMiningSite(planet);
          if (!site.canMine || !site.elementKey) {
            statusMessage = site.message || '';
            actionFailedReason = site.message || 'Cannot mine';
          } else {
            const cargoHold = this.player.getActiveSurfaceCargoHold();
            const freeCargo = cargoHold.capacity - this.cargoSystem.getTotalUnits(cargoHold);
            const desiredAmount = requestedAmount === undefined ? site.maxAmount : Math.max(0.1, roundToTenth(requestedAmount));
            const amountToMine = roundToTenth(Math.min(site.maxAmount, desiredAmount, freeCargo));
            if (amountToMine <= 0) {
              statusMessage = STATUS_MESSAGES.PLANET_MINE_CARGO_FULL(
                this.cargoSystem.getTotalUnits(cargoHold),
                cargoHold.capacity
              );
              actionFailedReason = 'Cargo full';
            } else {
              const actuallyAdded = this.cargoSystem.addItem(cargoHold, site.elementKey, amountToMine);
              logger.debug(`[MiningSystem] CargoSystem.addItem returned: ${actuallyAdded}`);

              if (actuallyAdded > 0) {
                this.player.awardCrewExperience('geology', 8 + Math.ceil(actuallyAdded));
                planet.recordMinedAmount(this.player.position.surfaceX, this.player.position.surfaceY, actuallyAdded, site.totalYield ?? site.maxAmount);
                const currentTotalCargo = this.cargoSystem.getTotalUnits(cargoHold);
                statusMessage = STATUS_MESSAGES.PLANET_MINE_SUCCESS(
                  actuallyAdded,
                  site.elementName || site.elementKey,
                  currentTotalCargo,
                  cargoHold.capacity
                );
                logger.debug(`[MiningSystem] Result: Success - Mined ${actuallyAdded} ${site.elementKey}`);
                if (currentTotalCargo >= cargoHold.capacity) {
                  statusMessage += ` Cargo hold full!`;
                }
                eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, {
                  elementKey: site.elementKey,
                  amountAdded: actuallyAdded,
                  newAmount: cargoHold.items[site.elementKey] || 0,
                  newTotalCargo: currentTotalCargo,
                });
              } else {
                statusMessage = STATUS_MESSAGES.PLANET_MINE_CARGO_FULL(
                  this.cargoSystem.getTotalUnits(cargoHold),
                  cargoHold.capacity
                );
                actionFailedReason = 'Cargo full';
                logger.debug('[MiningSystem] Result: Cargo full');
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

  private getMiningSite(planet: Planet): MiningEstimate & { totalYield?: number } {
    if (planet.type === 'GasGiant' || planet.type === 'IceGiant') {
      return { canMine: false, maxAmount: 0, message: STATUS_MESSAGES.PLANET_MINE_INVALID_TYPE(planet.type) };
    }

    planet.ensureSurfaceReady();
    const elementMap = planet.surfaceElementMap;
    if (!elementMap) {
      throw new Error('Surface element map data is missing after ensureSurfaceReady.');
    }

    const currentX = this.player.position.surfaceX;
    const currentY = this.player.position.surfaceY;
    logger.debug(`[MiningSystem] Player Position: [${currentX}, ${currentY}]`);
    if (currentY < 0 || currentY >= elementMap.length || currentX < 0 || currentX >= elementMap[0].length) {
      throw new Error(`Player position [${currentX},${currentY}] out of map bounds.`);
    }
    if (planet.isMined(currentX, currentY)) {
      return { canMine: false, maxAmount: 0, message: STATUS_MESSAGES.PLANET_MINE_DEPLETED };
    }

    const elementKey = elementMap[currentY][currentX];
    logger.debug(`[MiningSystem] Element key at [${currentX}, ${currentY}]: "${elementKey}"`);
    if (!elementKey) {
      return { canMine: false, maxAmount: 0, message: STATUS_MESSAGES.PLANET_MINE_NO_ELEMENTS };
    }

    const elementInfo = ELEMENTS[elementKey];
    const baseAbundance = planet.elementAbundance[elementKey] || 0;
    if (baseAbundance <= 0 && (!elementInfo || elementInfo.baseFrequency < 0.001)) {
      return {
        canMine: false,
        maxAmount: 0,
        elementKey,
        elementName: elementInfo?.name || elementKey,
        message: STATUS_MESSAGES.PLANET_MINE_TRACE(elementInfo?.name || elementKey),
      };
    }

    const minePRNG = planet.systemPRNG.seedNew(`mine_${currentX}_${currentY}`);
    const totalYield = roundToTenth(minePRNG.random(0.1, 15.05));
    const alreadyMined = planet.getMinedAmount(currentX, currentY);
    const remaining = roundToTenth(Math.max(0, totalYield - alreadyMined));
    if (remaining <= 0) {
      planet.markMined(currentX, currentY);
      return { canMine: false, maxAmount: 0, elementKey, elementName: elementInfo?.name || elementKey, message: STATUS_MESSAGES.PLANET_MINE_DEPLETED };
    }
    return {
      canMine: true,
      elementKey,
      elementName: elementInfo?.name || elementKey,
      maxAmount: remaining,
      totalYield,
    };
  }

  /** Cleans up event listeners */
  destroy(): void {
    logger.info('[MiningSystem] Destroying and unsubscribing...');
    eventManager.unsubscribe(GameEvents.MINE_REQUESTED, this.handleMineRequest.bind(this));
  }
} // End MiningSystem class

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
