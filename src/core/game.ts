/* FILE: src/core/game.ts */
// src/core/game.ts (Refactored + Full Render Logic)

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { MineralRichness } from '../constants';
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager } from './game_state_manager';
import { ActionProcessor } from './action_processor';
import { fastHash } from '@/utils/hash'; // Assuming alias setup
import { Planet } from '@/entities/planet';
import { Starbase } from '@/entities/starbase';

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

  // Flag to force full clear/redraw (e.g., on state change, resize)
  private forceFullRender: boolean = true; // Start with true for initial draw

  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('[Game] Constructing instance...');
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now());

    // Initialize Core Components
    this.gameSeedPRNG = new PRNG(initialSeed);
    this.renderer = new RendererFacade(canvasId, statusBarId); // Renderer handles DOM init
    this.player = new Player(); // Uses CONFIG defaults
    this.inputManager = new InputManager();
    // Pass callback to GameStateManager to set the forceFullRender flag
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG, () => this._forceFullRenderOnStateChange());
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager); // Inject dependencies

    // Event Listeners
    window.addEventListener('resize', this._handleResize.bind(this));
    this._handleResize(); // Initial fit (will also set forceFullRender)

    logger.info(
      `[Game] Instance constructed. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${this.stateManager.state}'`
    );
  }

  // Callback for GameStateManager to trigger a full render on state change
  private _forceFullRenderOnStateChange() {
    this.forceFullRender = true;
    logger.debug('[Game] State change detected, forcing full render on next frame.');
  }

  public getGameState(): string { return this.stateManager.state; }
  public checkIfRunning(): boolean { return this.isRunning; }

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
    this.forceFullRender = true; // Ensure first frame is a full render

    // Initial update and render
    this._update(0); // Initial update with zero delta time
    this._render(); // Initial render
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    logger.info('[Game] Game loop initiated.');
  }

  stopGame(): void {
    // (Stop game logic remains the same)
    if (!this.isRunning) return;
    logger.info('[Game] Stopping game loop...');
    this.isRunning = false;
    this.inputManager.stopListening(); // Stop listening for input
    if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        logger.debug(`[Game] Cancelled animation frame: ${this.animationFrameId}`);
        this.animationFrameId = null;
    }
    this.renderer.updateStatus('Game stopped. Refresh to restart.', false); // Added hasStarbase=false
    logger.info('[Game] Game loop stopped.');
  }

  // --- Event Handlers ---
  private _handleResize(): void {
    logger.debug('[Game] Handling window resize...');
    this.renderer.fitToScreen(); // Renderer logs size details
    this.forceFullRender = true; // Force full render after resize
    if (this.isRunning) {
      logger.debug('[Game] Triggering render after resize.');
      this._render(); // Re-render immediately if running
    }
    this.lastUpdateTime = performance.now(); // Prevent large delta jump
  }

  // --- Core Game Loop ---
  private _loop(currentTime: DOMHighResTimeStamp): void {
    if (!this.isRunning) return;

    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0); // Prevent large jumps
    this.lastUpdateTime = currentTime;

    try {
        // 1. Process Input FIRST
        this._processInput();

        // 2. Update Input Manager State SECOND
        this.inputManager.update();

        // 3. Update Game State
        this._update(deltaTime);

        // 4. Render
        this._render();

        // Reset force flag AFTER rendering is complete for this frame
        if (this.forceFullRender) {
            this.forceFullRender = false;
        }

    } catch (loopError) {
       // (Error handling remains the same)
        const currentState = this.stateManager.state; // Get state at time of error
        let errorMessage = 'Unknown Loop Error';
        let errorStack = 'N/A';

        if (loopError instanceof Error) {
            errorMessage = loopError.message;
            errorStack = loopError.stack || 'No stack available';
        } else {
            try { errorMessage = JSON.stringify(loopError); } catch { errorMessage = String(loopError); }
        }

        logger.error(`[Game:_loop:${currentState}] Error during game loop: ${errorMessage}`, {
            errorObject: loopError,
            stack: errorStack
        });

        this.statusMessage = `FATAL ERROR: ${errorMessage}. Refresh required.`;
        try { this._updateStatusBar(); } catch { /* ignore */ } // Attempt to show error
        this.stopGame(); // Stop the loop on error
        return; // Don't request another frame
    }

    // Request the next frame
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }


  // --- Input Processing ---
  private _processInput(): void {
    // (Input processing logic remains the same)
    const justPressedList = Array.from(this.inputManager.justPressedActions).join(', ') || 'None';
    // logger.debug(
    //   `>>> Game._processInput Tick. State: ${this.stateManager.state}. Just Pressed Actions: [${justPressedList}]`
    // ); // Can be noisy

    let actionStatusMessage = ''; // To store status from discrete actions

    // Handle discrete actions first
    const discreteActions: string[] = [
        'ENTER_SYSTEM', 'LEAVE_SYSTEM', 'ACTIVATE_LAND_LIFTOFF',
        'SCAN', 'MINE', 'TRADE', 'REFUEL', 'DOWNLOAD_LOG', 'QUIT'
    ];

    for (const action of discreteActions) {
        if (this.inputManager.wasActionJustPressed(action)) {
            logger.debug(`[Game:_processInput] Processing discrete action: ${action}`);
            if (action === 'DOWNLOAD_LOG') {
                 logger.info('--- DOWNLOAD_LOG action detected by wasActionJustPressed! ---');
            }
            const status = this.actionProcessor.processAction(action);
            if (status) { actionStatusMessage = status; }
            if (action === 'QUIT') {
                 this.stopGame();
                 logger.info('[Game] Quit action processed.');
                 return;
            }
            // break; // Optional: Only one discrete action per frame
        }
    }

    // Handle continuous movement AFTER potentially changing state
    let dx = 0, dy = 0;
    if (this.inputManager.isActionActive('MOVE_UP')) dy -= 1;
    if (this.inputManager.isActionActive('MOVE_DOWN')) dy += 1;
    if (this.inputManager.isActionActive('MOVE_LEFT')) dx -= 1;
    if (this.inputManager.isActionActive('MOVE_RIGHT')) dx += 1;

    if (dx !== 0 || dy !== 0) {
        const isFine = this.inputManager.isActionActive('FINE_CONTROL');
        const isBoost = this.inputManager.isActionActive('BOOST');
        let useFine = isFine && !isBoost;
        let useBoost = isBoost && !isFine;

        try {
            switch (this.stateManager.state) {
                case 'hyperspace':
                    this.player.moveWorld(dx, dy);
                    break;
                case 'system':
                    let moveScale = CONFIG.SYSTEM_MOVE_INCREMENT;
                    if (useBoost) moveScale *= CONFIG.BOOST_FACTOR;
                    this.player.moveSystem(dx, dy, useFine);
                    break;
                case 'planet':
                    {
                        const planet = this.stateManager.currentPlanet;
                        if (planet) {
                            planet.ensureSurfaceReady();
                            const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                            this.player.moveSurface(dx, dy, mapSize);
                        } else {
                            logger.error("[Game:_processInput] In 'planet' state but currentPlanet is null during movement!");
                            actionStatusMessage = 'Error: Planet data missing!';
                        }
                    }
                    break;
                case 'starbase': break; // No movement
            }
        } catch (moveError) {
            logger.error(`[Game:_processInput] Error during player movement in state '${this.stateManager.state}':`, moveError);
            actionStatusMessage = `Move Error: ${moveError instanceof Error ? moveError.message : String(moveError)}`;
        }
    }

    // Update status message if a discrete action provided feedback
    if (actionStatusMessage) {
        this.statusMessage = actionStatusMessage;
    }
  }


  // --- Game State Update ---
  private _update(deltaTime: number): void {
    // (Update logic and status message determination remains the same)
    try {
      const currentState = this.stateManager.state;
      let stateUpdateStatus = '';

      switch (currentState) {
        case 'hyperspace':
          stateUpdateStatus = this._updateHyperspace(deltaTime);
          break;
        case 'system':
          stateUpdateStatus = this._updateSystem(deltaTime);
          break;
        case 'planet':
          stateUpdateStatus = this._updatePlanet(deltaTime);
          break;
        case 'starbase':
          stateUpdateStatus = this._updateStarbase(deltaTime);
          break;
        default:
          logger.warn(`[Game:_update] Encountered unexpected state: ${currentState}`);
          stateUpdateStatus = `Error: Unexpected state ${currentState}`;
          break;
      }

      // Only overwrite status if state logic returned something *and*
      // no discrete action status was set in _processInput this frame.
      // Check if statusMessage still holds default/previous state info.
      const wasActionStatusSet = this.statusMessage.includes('ACTION ERROR') || this.statusMessage.includes('Mining') || this.statusMessage.includes('Scan') || this.statusMessage.includes('Sold') || this.statusMessage.includes('Purchased') || this.statusMessage.includes('Entering system') || this.statusMessage.includes('Entered hyperspace') || this.statusMessage.includes('Approaching') || this.statusMessage.includes('Departing') || this.statusMessage.includes('Nothing nearby') || this.statusMessage.includes('Must travel further') || this.statusMessage.includes('Liftoff') || this.statusMessage.includes('No star system detected') || this.statusMessage.includes('already scanned') || this.statusMessage.includes('Cannot mine') || this.statusMessage.includes('Cargo hold is empty') || this.statusMessage.includes('Fuel tank is already full') || this.statusMessage.includes('Not enough credits') || this.statusMessage.includes('Move Error') || this.statusMessage.includes('Surface Error');

      if (stateUpdateStatus && !wasActionStatusSet) {
          this.statusMessage = stateUpdateStatus;
      }

      // Update the status bar display at the end of the update cycle
      this._updateStatusBar();

    } catch (updateError) {
        // (Error handling remains the same)
        const stateWhenErrorOccurred = this.stateManager.state;
        let errorMessage = 'Unknown Update Error';
        if (updateError instanceof Error) errorMessage = updateError.message;
        else try { errorMessage = JSON.stringify(updateError); } catch { errorMessage = String(updateError); }
        logger.error(`[Game:_update:${stateWhenErrorOccurred}] Error during update logic: ${errorMessage}`, { errorObject: updateError });

        this.statusMessage = `UPDATE ERROR: ${errorMessage}`;
        try { this._updateStatusBar(); } catch { /* ignore */ }
        this.stopGame();
        throw updateError;
    }
  }

  // State-specific update methods remain the same
  private _updateHyperspace(_deltaTime: number): string {
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;
    const baseStatus = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`;

    if (isNearStar) {
      const peekedSystem = this.stateManager.peekAtSystem(this.player.worldX, this.player.worldY);
      if (peekedSystem) {
        const starbaseText = peekedSystem.starbase ? ' (Starbase)' : '';
        return `${baseStatus} | Near ${peekedSystem.name}${starbaseText}. Press [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] to enter.`;
      } else {
         return `${baseStatus} | Near star system. Press [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] to enter.`;
      }
    } else {
      this.stateManager.resetPeekedSystem();
    }
    return baseStatus;
  }

  private _updateSystem(deltaTime: number): string {
    const system = this.stateManager.currentSystem;
    if (!system) {
      logger.error('[Game:_updateSystem] CurrentSystem is null! Forcing state to hyperspace.');
      this.stateManager.leaveSystem();
      return 'System Error: Data missing. Returned to hyperspace.';
    }
    system.updateOrbits(deltaTime);
    const nearbyObject = system.getObjectNear(this.player.systemX, this.player.systemY);
    let status = `System: ${system.name}(${system.starType}) | Pos: ${this.player.systemX.toFixed(0)},${this.player.systemY.toFixed(0)}`;
    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${dist.toFixed(0)} units). Press [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] to land/dock.`;
    }
    if (system.isAtEdge(this.player.systemX, this.player.systemY)) {
       logger.info(`[Game:_updateSystem] Player reached edge of system ${system.name}. Automatically transitioning to hyperspace.`);
       this.stateManager.leaveSystem(); // Will trigger forceFullRender
    } else if (this.isPlayerNearExit()) {
        status += ` | Near system edge. Press [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] to leave.`
    }
    return status;
  }

  private isPlayerNearExit(): boolean {
    const system = this.stateManager.currentSystem;
    return system ? this.player.distanceSqToSystemCoords(0, 0) > (system.edgeRadius * 0.75) ** 2 : false;
  }

  private _updatePlanet(_deltaTime: number): string {
    const planet = this.stateManager.currentPlanet;
    if (!planet) {
      logger.error('[Game:_updatePlanet] CurrentPlanet is null! Forcing state to hyperspace.');
      this.stateManager.leaveSystem();
      return 'Planet Error: Data missing. Returned to hyperspace.';
    }
    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.surfaceX},${this.player.surfaceY} | Grav: ${planet.gravity.toFixed(2)}g | Temp: ${planet.surfaceTemp}K`;
    const actions = [`[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Liftoff`];
    if (planet.scanned) {
         status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
         if (planet.mineralRichness !== MineralRichness.NONE && planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
            actions.push(`[${CONFIG.KEY_BINDINGS.MINE.toUpperCase()}] Mine`);
         }
    } else {
         actions.push(`[${CONFIG.KEY_BINDINGS.SCAN.toUpperCase()}] Scan`);
    }
    status += ` | Actions: ${actions.join(', ')}.`;
    return status;
  }

  private _updateStarbase(_deltaTime: number): string {
    const starbase = this.stateManager.currentStarbase;
    if (!starbase) {
      logger.error('[Game:_updateStarbase] CurrentStarbase is null! Forcing state to hyperspace.');
      this.stateManager.leaveSystem();
      return 'Starbase Error: Data missing. Returned to hyperspace.';
    }
    const actions = [
         `[${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade`,
         `[${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel`,
         `[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Depart`
    ];
    return `Docked: ${starbase.name} | Actions: ${actions.join(', ')}.`;
  }

  // --- Rendering ---
  private _render(): void {
    const currentState = this.stateManager.state;
    // logger.debug(`[Game:_render] Rendering state: '${currentState}', ForceFullRender: ${this.forceFullRender}`); // Debug

    try {
        // --- Clear ---
        // Always clear physically at the start of the render cycle now
        this.renderer.clear(true);

        // --- Draw Background Layer (System State Only) ---
        if (currentState === 'system') {
            // 1. Populate the background buffer
            this.renderer.drawStarBackground(this.player);
            // 2. Render the background buffer to the canvas
            // Use full render instead of diff
            this.renderer.renderBufferFull(true); // Render background first
        }

        // --- Draw Main Scene Layer ---
        // 3. Populate the main buffer
        switch (currentState) {
            case 'hyperspace':
                this.renderer.drawHyperspace(this.player, this.gameSeedPRNG);
                break;
            case 'system':
                const system = this.stateManager.currentSystem;
                // Ensure drawSolarSystem uses transparent background fills (null)
                if (system) this.renderer.drawSolarSystem(this.player, system);
                else this._renderError('System data missing for render!');
                break;
            case 'planet':
                 const planet = this.stateManager.currentPlanet;
                 if (planet) {
                     planet.ensureSurfaceReady(); // Ensure data is ready
                     this.renderer.drawPlanetSurface(this.player, planet);
                 } else {
                     this._renderError('Planet data missing for render!');
                 }
                break;
            case 'starbase':
                 const starbase = this.stateManager.currentStarbase;
                 if (starbase) {
                     starbase.ensureSurfaceReady(); // Ensure data is ready
                     this.renderer.drawPlanetSurface(this.player, starbase);
                 } else {
                     this._renderError('Starbase data missing for render!');
                 }
                break;
            default:
                this._renderError(`Unknown game state: ${currentState}`);
        }

        // 4. Render the main buffer to the canvas
        // Use full render instead of diff
        this.renderer.renderBufferFull(false); // Render main buffer last

    } catch (error) {
      // (Error handling remains the same)
        logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, error);
        this.stopGame();
        this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
        try {
            this.renderer.renderBufferFull(false); // Attempt to draw error message
        } catch { /* ignore further errors */ }
    }
  }


  /** Helper to render an error message directly to the canvas. */
  private _renderError(message: string): void {
    // (Error rendering remains the same)
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true); // Physically clear canvas and buffers
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOUR); // Solid BG for error text
    this.statusMessage = `ERROR: ${message}`;
    this._updateStatusBar();
  }

  /** Updates the status bar text via the renderer. */
  private _updateStatusBar(): void {
    // (Status bar update logic remains the same)
    const commonStatus = ` | Fuel: ${this.player.fuel.toFixed(0)}/${this.player.maxFuel} | Cargo: ${this.player.mineralUnits}/${this.player.cargoCapacity} | Cr: ${this.player.credits}`;
    const hasStarbase = this.stateManager.state === 'starbase';
    this.renderer.updateStatus(this.statusMessage + commonStatus, hasStarbase);
  }
} // End of Game class