// src/core/game.ts (Refactored)

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system'; // Still needed for type checks maybe?
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { MineralRichness } from '../constants'; // Keep if update logic checks richness
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager';
import { ActionProcessor } from './action_processor';
import { fastHash } from '@/utils/hash';

/** Main game class - Coordinates components and manages the loop. */
export class Game {
  // Core Components (Dependencies Injected or Created)
  private readonly renderer: RendererFacade;
  private readonly player: Player;
  private readonly gameSeedPRNG: PRNG;
  private readonly inputManager: InputManager;
  private readonly stateManager: GameStateManager;
  private readonly actionProcessor: ActionProcessor;

  // Game Loop State
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  // Status Message
  private statusMessage: string = 'Initializing Systems...';

  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('[Game] Constructing instance...');
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now());

    // Initialize Core Components
    this.gameSeedPRNG = new PRNG(initialSeed);
    this.renderer = new RendererFacade(canvasId, statusBarId); // Renderer handles DOM init
    this.player = new Player(); // Uses CONFIG defaults
    this.inputManager = new InputManager();
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG); // Inject dependencies
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager); // Inject dependencies

    // Event Listeners
    window.addEventListener('resize', this._handleResize.bind(this));
    this._handleResize(); // Initial fit

    logger.info(
      `[Game] Instance constructed. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${
        this.stateManager.state
      }'`
    );
  }

  // --- Game Loop Control ---

  startGame(): void {
    if (this.isRunning) {
      logger.warn('[Game] startGame called but game is already running.');
      return;
    }
    logger.info('[Game] Starting game loop...');
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.inputManager.startListening(); // Start listening for input
    this.inputManager.clearState(); // Clear any old input

    // Initial update and render
    this._update(0); // Initial update with zero delta time
    this._render(); // Initial render
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    logger.info('[Game] Game loop initiated.');
  }

  stopGame(): void {
    if (!this.isRunning) return;
    logger.info('[Game] Stopping game loop...');
    this.isRunning = false;
    this.inputManager.stopListening(); // Stop listening for input
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      logger.debug(`[Game] Cancelled animation frame: ${this.animationFrameId}`);
      this.animationFrameId = null;
    }
    this.renderer.updateStatus('Game stopped. Refresh to restart.');
    logger.info('[Game] Game loop stopped.');
  }

  // --- Event Handlers ---

  private _handleResize(): void {
    logger.debug('[Game] Handling window resize...');
    this.renderer.fitToScreen(); // Renderer logs size details
    if (this.isRunning) {
      logger.debug('[Game] Triggering render after resize.');
      this._render(); // Re-render immediately
    }
    this.lastUpdateTime = performance.now(); // Prevent large delta jump
  }

  // --- Core Game Loop ---

  private _loop(currentTime: DOMHighResTimeStamp): void {
    if (!this.isRunning) return;

    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
    this.lastUpdateTime = currentTime;

    try {
      this._processInput(); // Process one action
      this._update(deltaTime); // Update game state
      this._render(); // Draw the current state
    } catch (loopError) {
      logger.error('[Game] !!!! Uncaught Error in Game Loop !!!!', loopError);
      this.statusMessage = `LOOP ERROR: ${loopError instanceof Error ? loopError.message : String(loopError)}`;
      try { this._updateStatusBar(); } catch { /* ignore */ } // Try to show status
      // Optional: Trigger log download
      // logger.downloadLogFile(`cosmic_voyage_log_ERROR_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      this.stopGame();
      return; // Prevent requesting next frame
    }

    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }

  // --- Input Processing ---

  private _processInput(): void {
    let dx = 0;
    let dy = 0;
    // Check modifier key status first
    let isFine = this.inputManager.isActionActive('FINE_CONTROL');
    let isBoost = this.inputManager.isActionActive('BOOST');
    let actionStatusMessage = ''; // To store status from discrete actions

    // --- Handle Continuous Movement ---
    // Check which movement actions are currently active
    if (this.inputManager.isActionActive('MOVE_UP')) dy -= 1;
    if (this.inputManager.isActionActive('MOVE_DOWN')) dy += 1;
    if (this.inputManager.isActionActive('MOVE_LEFT')) dx -= 1;
    if (this.inputManager.isActionActive('MOVE_RIGHT')) dx += 1;

    // If movement is detected, apply it based on state and modifiers
    if (dx !== 0 || dy !== 0) {
        // Get the base movement scale
        let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT;

        // Apply boost or fine control (prioritize boost? Or make exclusive?)
        // Current logic: Apply boost OR fine, not both. If both held, use default speed.
        if (isBoost && !isFine) {
            moveScale *= CONFIG.BOOST_FACTOR;
             logger.debug(`[Game:_processInput] Boost applied. Move scale: ${moveScale}`);
        } else if (isFine && !isBoost) {
            moveScale *= CONFIG.FINE_CONTROL_FACTOR;
             logger.debug(`[Game:_processInput] Fine control applied. Move scale: ${moveScale}`);
        }

        // Apply movement based on current game state
         try {
            switch (this.stateManager.state) {
                case 'hyperspace':
                    // Boost/Fine not implemented for hyperspace, uses raw dx/dy
                    this.player.moveWorld(dx, dy);
                    break;
                case 'system':
                     // Pass the potentially modified moveScale to player.moveSystem
                    this.player.moveSystem(dx, dy, isFine, moveScale); // Use updated signature
                    break;
                case 'planet':
                    // Boost/Fine typically not used on surface
                    const planet = this.stateManager.currentPlanet;
                    if (planet) {
                        // Ensure surface is ready before getting map size
                        planet.ensureSurfaceReady();
                        const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                        this.player.moveSurface(dx, dy, mapSize);
                    } else {
                         logger.error("[Game:_processInput] In 'planet' state but currentPlanet is null during movement!");
                         actionStatusMessage = 'Error: Planet data missing!';
                    }
                    break;
                 case 'starbase':
                     // No movement expected while docked
                     break;
            }
        } catch (moveError) {
             logger.error(`[Game:_processInput] Error during player movement in state '${this.stateManager.state}':`, moveError);
            actionStatusMessage = `Move Error: ${moveError instanceof Error ? moveError.message : String(moveError)}`;
         }
    } // End of movement handling (dx !== 0 || dy !== 0)

    // --- Handle Discrete Actions (Trigger only once per press) ---
    // Define the list of actions that should only trigger once per press
    const discreteActions: string[] = [
         'ENTER_SYSTEM', 'LEAVE_SYSTEM', 'LAND', 'LIFTOFF',
         'SCAN', 'MINE', 'TRADE', 'REFUEL', 'DOWNLOAD_LOG', 'QUIT'
         // Add any other non-movement actions here
    ];

    // Check each discrete action to see if it was just pressed
    for (const action of discreteActions) {
         if (this.inputManager.wasActionJustPressed(action)) {
            logger.debug(`[Game:_processInput] Processing discrete action: ${action}`);
             // Use ActionProcessor to handle the logic and potential state changes
             const status = this.actionProcessor.processAction(action);
             // Store the status message returned by the processor
             // This allows discrete actions to provide immediate feedback
             if (status) {
                 actionStatusMessage = status;
             }
             // Optional: If you want only ONE discrete action per frame, uncomment the break
             // break;
         }
    }

    // Update the game's primary status message ONLY if a discrete action
    // provided specific feedback in this frame. Otherwise, the status
    // will be set by the _update method based on the current state.
     if (actionStatusMessage) {
         this.statusMessage = actionStatusMessage;
         // Force an update to the status bar display *now* if needed,
         // otherwise _updateStatusBar in _update will handle it.
         // this._updateStatusBar(); // Uncomment if immediate status update is desired
     }
  }
  // --- Game State Update ---

  private _update(deltaTime: number): void {
    // Get current state from manager AFTER input processing
    const currentState = this.stateManager.state;
    // logger.debug(`Updating state: ${currentState}`); // Noisy

    try {
      // Delegate to state-specific update logic
      switch (currentState) {
        case 'hyperspace':
          this.statusMessage = this._updateHyperspace(deltaTime);
          break;
        case 'system':
          this.statusMessage = this._updateSystem(deltaTime);
          break;
        case 'planet':
          this.statusMessage = this._updatePlanet(deltaTime);
          break;
        case 'starbase':
          this.statusMessage = this._updateStarbase(deltaTime);
          break;
      }
      // Update the status bar with the message generated by the state update
      this._updateStatusBar();
    } catch (error) {
      logger.error(`[Game:_update:${currentState}] Error during update:`, error);
      this.statusMessage = `UPDATE ERROR: ${error instanceof Error ? error.message : String(error)}`;
      this._updateStatusBar(); // Show error
      this.stopGame(); // Stop on critical error
    }
  }

  // State-specific update methods now primarily DETERMINE the status message
  // Actual state changes are handled by GameStateManager via ActionProcessor

  private _updateHyperspace(_deltaTime: number): string {
    // Check if near a star
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;

    let baseStatus = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`;
    if (isNearStar) {
      return `${baseStatus} | Near star system. Press [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] to enter.`;
    } else {
      return baseStatus;
    }
  }

  private _updateSystem(deltaTime: number): string {
    const system = this.stateManager.currentSystem;
    if (!system) {
      // This should ideally not happen if state transitions are correct
      logger.error('[Game:_updateSystem] CurrentSystem is null! Forcing state to hyperspace.');
      // Force transition back via StateManager if needed, or handle here temporarily
      this.stateManager.leaveSystem(); // Attempt graceful transition back
      return 'System Error: Data missing. Returned to hyperspace.';
    }

    system.updateOrbits(deltaTime); // Update object positions

    // Find nearby object for status message context
    const nearbyObject = system.getObjectNear(this.player.systemX, this.player.systemY);
    let status = `System: ${system.name}(${system.starType}) | Pos: ${this.player.systemX.toFixed(0)},${this.player.systemY.toFixed(0)}`;

    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${dist.toFixed(0)} units). Press [${CONFIG.KEY_BINDINGS.LAND.toUpperCase()}] to land.`;
    }

    // Check if near edge
    const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
    const edgeThresholdSq = (system.edgeRadius * 0.9) ** 2;
    if (distFromStarSq > edgeThresholdSq) {
      status += ` | Approaching system edge. Press [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] to leave.`;
    }
    return status;
  }

  private _updatePlanet(_deltaTime: number): string {
    const planet = this.stateManager.currentPlanet;
    if (!planet) {
      logger.error('[Game:_updatePlanet] CurrentPlanet is null! Forcing state to hyperspace.');
      this.stateManager.leaveSystem(); // Attempt graceful transition back
      return 'Planet Error: Data missing. Returned to hyperspace.';
    }

    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.surfaceX},${this.player.surfaceY} | Press [${CONFIG.KEY_BINDINGS.LIFTOFF.toUpperCase()}] to liftoff.`;
    if (planet.scanned) {
      status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness}), Grav: ${planet.gravity.toFixed(2)}g`;
      if (planet.mineralRichness !== MineralRichness.NONE && planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
        status += ` | Press [${CONFIG.KEY_BINDINGS.MINE.toUpperCase()}] to mine.`;
      }
    } else {
      status += ` | Press [${CONFIG.KEY_BINDINGS.SCAN.toUpperCase()}] to scan surface.`;
    }
    return status;
  }

  private _updateStarbase(_deltaTime: number): string {
    const starbase = this.stateManager.currentStarbase;
     if (!starbase) {
      logger.error('[Game:_updateStarbase] CurrentStarbase is null! Forcing state to hyperspace.');
      this.stateManager.leaveSystem(); // Attempt graceful transition back
      return 'Starbase Error: Data missing. Returned to hyperspace.';
    }
    return `Docked: ${starbase.name} | Options: [${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade, [${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel, [${CONFIG.KEY_BINDINGS.LIFTOFF.toUpperCase()}] Liftoff.`;
  }

  // --- Rendering ---

  private _render(): void {
    const currentState = this.stateManager.state;
    logger.debug(`[Game:_render] Rendering state: '${currentState}'`);

    try {
      switch (currentState) {
        case 'hyperspace':
          this.renderer.drawHyperspace(this.player, this.gameSeedPRNG);
          break;
        case 'system':
          const system = this.stateManager.currentSystem;
          if (system) this.renderer.drawSolarSystem(this.player, system);
          else this._renderError('System data missing for render!');
          break;
        case 'planet':
          const planet = this.stateManager.currentPlanet;
          if (planet) this.renderer.drawPlanetSurface(this.player, planet);
          else this._renderError('Planet data missing for render!');
          break;
        case 'starbase':
          const starbase = this.stateManager.currentStarbase;
          if (starbase) this.renderer.drawPlanetSurface(this.player, starbase);
          else this._renderError('Starbase data missing for render!');
          break;
        default:
          this._renderError(`Unknown game state: ${currentState}`);
      }
      // Render differences AFTER scene drawing is complete
      this.renderer.renderDiff();
    } catch (error) {
      logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, error);
      this.stopGame();
      this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
      try { this.renderer.renderDiff(); } catch { /* ignore */ } // Attempt to show error
    }
  }

  /** Helper to render an error message directly to the canvas. */
  private _renderError(message: string): void {
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true); // Physically clear
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOR);
    this.statusMessage = `ERROR: ${message}`; // Also update status bar text
    this._updateStatusBar();
  }

  /** Updates the status bar text via the renderer. */
  private _updateStatusBar(): void {
    // Combine the state-specific message with common player stats
    const commonStatus = ` | Fuel: ${this.player.fuel.toFixed(0)}/${this.player.maxFuel} | Cargo: ${
      this.player.mineralUnits
    }/${this.player.cargoCapacity} | Cr: ${this.player.credits}`;
    this.renderer.updateStatus(this.statusMessage + commonStatus);
  }

} // End of Game class