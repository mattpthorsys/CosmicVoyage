// src/core/game.ts (Handling DOWNLOAD_LOG action)

import { Renderer } from '../rendering/renderer';
// import { InputManager } from './input_manager'; // Proper InputManager needed later
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
// Import GLYPHS alongside MineralRichness
import { MineralRichness, GLYPHS } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger'; // Import the logger

export type GameState = 'hyperspace' | 'system' | 'planet' | 'starbase';

export class Game {
  private readonly renderer: Renderer;
  private readonly player: Player;
  private readonly gameSeedPRNG: PRNG;
  private state: GameState;
  private currentSystem: SolarSystem | null = null;
  private currentPlanet: Planet | null = null;
  private currentStarbase: Starbase | null = null;
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  // Simple input state for now
  private keysPressed: Set<string> = new Set();
  private actionQueue: string[] = []; // Stores actions derived from key presses
  // Status message displayed at the bottom
  private statusMessage: string = 'Initializing Systems...';

  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('Constructing Game instance...'); //
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now()); //
    // PRNG logs its own seed now
    this.gameSeedPRNG = new PRNG(initialSeed); //
    // Renderer logs its own success/failure
    this.renderer = new Renderer(canvasId, statusBarId); //
    this.player = new Player(); // Player constructor logs its details

    this.state = 'hyperspace'; //
    logger.info(`Initial game state set: '${this.state}'`); // Changed level to INFO

    this._setupTempInput(); // Logs internally
    window.addEventListener('resize', this._handleResize.bind(this));
    // Initial fit might happen before logger is fully ready if called immediately,
    // but subsequent calls in handler are fine. fitToScreen logs internally.
    this._handleResize(); // Logs internally

    logger.info(
      `Game instance constructed successfully. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${
        this.state
      }'`
    ); //
  }

  // --- Temporary Input Handling Methods --- (Replace these later)
  private _setupTempInput(): void {
    logger.debug('Setting up temporary input listeners...'); //
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Prevent continuous action queueing while key is held down
      if (this.keysPressed.has(e.key)) return;
      logger.debug(`Keydown detected: ${e.key} (Shift: ${e.shiftKey})`); // Log raw key
      this.keysPressed.add(e.key);
      this._queueActionFromKey(e.key, e.shiftKey); // Queue the mapped action
      // Prevent default browser action for game keys (scrolling, etc.)
      if (Object.values(CONFIG.KEY_BINDINGS).includes(e.key as any)) {
        //
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      logger.debug(`Keyup detected: ${e.key}`);
      this.keysPressed.delete(e.key); //
    });
    logger.debug('Temporary input listeners attached.'); //
  }

  // Maps a key press (and shift state) to an action string and adds it to the queue
  private _queueActionFromKey(key: string, isShiftDown: boolean): void {
    const bindings = CONFIG.KEY_BINDINGS; //
    let action: string | null = null;
    let fineControl = isShiftDown; // Use shift for fine control modifer

    switch (key) {
      case bindings.MOVE_UP:
        action = 'MOVE_UP';
        break; //
      case bindings.MOVE_DOWN:
        action = 'MOVE_DOWN';
        break; //
      case bindings.MOVE_LEFT:
        action = 'MOVE_LEFT';
        break; //
      case bindings.MOVE_RIGHT:
        action = 'MOVE_RIGHT';
        break; //
      case bindings.ENTER_SYSTEM:
        action = 'ENTER_SYSTEM';
        break; //
      case bindings.LEAVE_SYSTEM:
        action = 'LEAVE_SYSTEM';
        break; //
      case bindings.LAND:
        action = 'LAND';
        break; //
      case bindings.LIFTOFF:
        action = 'LIFTOFF';
        break; //
      case bindings.SCAN:
        action = 'SCAN';
        break; //
      case bindings.MINE:
        action = 'MINE';
        break; //
      case bindings.TRADE:
        action = 'TRADE';
        break; //
      case bindings.REFUEL:
        action = 'REFUEL';
        break; //
      case bindings.DOWNLOAD_LOG:
        action = 'DOWNLOAD_LOG';
        break; // <<< Handle new binding
      case bindings.QUIT:
        action = 'QUIT';
        this.stopGame();
        break; //
      // Add other bindings here
      default:
        // logger.debug(`Key '${key}' not bound to any action.`); // Can be noisy
        break;
    }

    if (action) {
      // Add FINE_ prefix if shift is held for movement actions
      if (fineControl && action.startsWith('MOVE_')) {
        //
        action = `FINE_${action}`; //
      }
      logger.debug(`Action queued: '${action}' from key '${key}'`);
      this.actionQueue.push(action); //
    }
  }
  // --- End Temporary Input Handling ---

  startGame(): void {
    if (this.isRunning) {
      logger.warn('startGame called but game is already running.'); //
      return;
    }
    logger.info('Starting game loop...');
    this.isRunning = true;
    this.lastUpdateTime = performance.now(); // Initialize time
    this.keysPressed.clear(); // Clear any stale keys
    this.actionQueue = []; // Clear any pending actions
    // Perform initial update to set status message etc. before first real frame
    this._update(0); //
    this._updateStatusBar(); // Ensure status bar is updated immediately
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this)); //
    logger.info('Game loop initiated.'); // Confirmation loop is requested
  }

  stopGame(): void {
    if (!this.isRunning) {
      // logger.debug("stopGame called but game was not running."); // Can be noisy
      return; //
    }
    logger.info('Stopping game loop...');
    this.isRunning = false; //
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId); //
      logger.debug(`Cancelled animation frame: ${this.animationFrameId}`);
      this.animationFrameId = null; //
    }
    // --- Optional: Trigger log download on stop? ---
    // logger.downloadLogFile(`cosmic_voyage_log_STOPPED_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    // -----------------------------------------------
    // TODO: Cleanup temporary listeners if possible, or InputManager later
    this.renderer.updateStatus('Game stopped. Refresh to restart.'); //
    logger.info('Game loop stopped.'); //
  }

  // Called on window resize event
  private _handleResize(): void {
    logger.debug('Handling window resize...'); //
    this.renderer.fitToScreen(); // Renderer logs size details
    if (this.isRunning) {
      logger.debug('Triggering render after resize.'); //
      this._render(); // Re-render immediately to adapt to new size
    }
    // Prevent large delta jump on next frame after resize pause
    this.lastUpdateTime = performance.now(); //
  }

  // Main game loop, called by requestAnimationFrame
  private _loop(currentTime: DOMHighResTimeStamp): void {
    if (!this.isRunning) return; //
    // logger.debug("Game loop tick"); // Often too noisy

    // Calculate time delta in seconds, cap at 0.1s to prevent large jumps
    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0); //
    this.lastUpdateTime = currentTime; //

    try {
      this._handleInput(); // Process one queued action
      this._update(deltaTime); // Update game state
      this._render(); // Draw the current state
    } catch (loopError) {
      // Use logger for errors now
      logger.error('!!!! Uncaught Error in Game Loop !!!!', loopError); //
      this.statusMessage = `LOOP ERROR: ${loopError instanceof Error ? loopError.message : String(loopError)}`; //
      // Attempt to display error in status bar before stopping
      try {
        this._updateStatusBar(); //
      } catch {
        /* ignore */
      }
      // --- Optional: Trigger log download on loop error? ---
      // logger.downloadLogFile(`cosmic_voyage_log_ERROR_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      // -----------------------------------------------------
      this.stopGame(); // Stop the game on critical error
      return; // Prevent requesting next frame
    }

    // Request next frame only if loop didn't error out
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this)); //
  }

  // Process one action from the queue based on the current game state
  private _handleInput(): void {
    const actionWithFinePrefix = this.actionQueue.shift(); // Get the oldest action
    if (!actionWithFinePrefix) return; // No action queued

    let isFine = false;
    let baseAction = actionWithFinePrefix;
    if (actionWithFinePrefix.startsWith('FINE_')) {
      isFine = true;
      baseAction = actionWithFinePrefix.substring(5); // Remove prefix
    }

    logger.debug(`[${this.state}] Processing action: '${baseAction}'${isFine ? ' (Fine)' : ''}`); // Log the processed action and state

    // --- <<< Handle global actions first >>> ---
    if (baseAction === 'DOWNLOAD_LOG') {
      logger.downloadLogFile(); // Call the download function from logger
      this.statusMessage = 'Log file download triggered...'; // Provide feedback
      return; // Consume the action, do nothing else this tick
    }
    // --- <<< End of global actions >>> ---

    // Delegate action handling based on current state
    try {
      switch (this.state) {
        case 'hyperspace':
          this._handleInputHyperspace(baseAction);
          break; //
        case 'system':
          this._handleInputSystem(baseAction, isFine);
          break; // Keep isFine
        case 'planet':
          this._handleInputPlanet(baseAction);
          break; //
        case 'starbase':
          this._handleInputStarbase(baseAction);
          break; //
        default:
          logger.warn(`No input handler for unknown state: ${this.state}`);
          break;
      }
    } catch (inputError) {
      logger.error(`Error handling input '${baseAction}' in state '${this.state}':`, inputError);
      this.statusMessage = `INPUT ERROR: ${inputError instanceof Error ? inputError.message : String(inputError)}`;
      // Don't stop the game for input errors necessarily, but log them.
    }
  }

  // --- State-Specific Input Handlers ---
  private _handleInputHyperspace(action: string): void {
    let dx = 0;
    let dy = 0; // Declare dx/dy INSIDE
    switch (action) {
      case 'MOVE_UP':
        dy = -1;
        break;
      case 'MOVE_DOWN':
        dy = 1;
        break;
      case 'MOVE_LEFT':
        dx = -1;
        break;
      case 'MOVE_RIGHT':
        dx = 1;
        break;
      case 'ENTER_SYSTEM':
        this._enterSystemAction();
        break; //
      // Note: DOWNLOAD_LOG is handled globally in _handleInput now
    }
    // If movement occurred, update player position
    if (dx !== 0 || dy !== 0) {
      this.player.moveWorld(dx, dy); // Player method logs details
    }
  }

  private _handleInputSystem(action: string, isFine: boolean): void {
    let dx = 0;
    let dy = 0; // Declare dx/dy INSIDE
    switch (action) {
      case 'MOVE_UP':
        dy = -1;
        break;
      case 'MOVE_DOWN':
        dy = 1;
        break;
      case 'MOVE_LEFT':
        dx = -1;
        break;
      case 'MOVE_RIGHT':
        dx = 1;
        break;
      case 'LEAVE_SYSTEM':
        this._leaveSystemAction();
        break; //
      case 'LAND':
        this._landAction();
        break; //
      // Note: DOWNLOAD_LOG is handled globally in _handleInput now
    }
    // If movement occurred, update player position (passing fine control flag)
    if (dx !== 0 || dy !== 0) {
      this.player.moveSystem(dx, dy, isFine); // Player method logs details
    }
  }

  private _handleInputPlanet(action: string): void {
    let dx = 0;
    let dy = 0; // Declare dx/dy INSIDE function
    switch (action) {
      case 'MOVE_UP':
        dy = -1;
        break;
      case 'MOVE_DOWN':
        dy = 1;
        break;
      case 'MOVE_LEFT':
        dx = -1;
        break;
      case 'MOVE_RIGHT':
        dx = 1;
        break;
      case 'LIFTOFF':
        this._liftoffAction();
        break; //
      case 'SCAN':
        this._scanPlanetAction();
        break; //
      case 'MINE':
        this._mineAction();
        break; //
      // Note: DOWNLOAD_LOG is handled globally in _handleInput now
    }

    // Apply movement using corrected type guard pattern
    if (dx !== 0 || dy !== 0) {
      const planet = this.currentPlanet; // Assign to local variable
      if (planet) {
        // Check the local variable
        // Ensure surface is ready before getting map size
        try {
          planet.ensureSurfaceReady(); // This might generate the map
          const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE; // Use generated size or fallback
          this.player.moveSurface(dx, dy, mapSize); // Player method logs details
        } catch (surfaceError) {
          logger.error(`[${this.state}] Error preparing surface for movement on ${planet.name}:`, surfaceError);
          this.statusMessage = `Surface Error: ${
            surfaceError instanceof Error ? surfaceError.message : String(surfaceError)
          }`;
        }
      } else {
        // This shouldn't happen if state is 'planet', log error
        logger.error('[planet] state handler: currentPlanet is null during movement!');
        this.statusMessage = 'Error: Planet data missing!';
      }
    }
  }

  private _handleInputStarbase(action: string): void {
    switch (action) {
      case 'LIFTOFF':
        this._liftoffAction();
        break; // Use same liftoff logic
      case 'TRADE':
        this._tradeAction();
        break;
      case 'REFUEL':
        this._refuelAction();
        break;
      // Note: DOWNLOAD_LOG is handled globally in _handleInput now
    }
  }

  // --- Update Methods ---
  // ... (Update methods remain unchanged from previous version) ...
  private _update(deltaTime: number): void {
    // Keep deltaTime here, used by system updates
    // logger.debug(`Updating state: ${this.state}`); // Noisy
    try {
      switch (this.state) {
        case 'hyperspace':
          this._updateHyperspace(deltaTime);
          break; //
        case 'system':
          this._updateSystem(deltaTime);
          break; // Pass deltaTime
        case 'planet':
          this._updatePlanet(deltaTime);
          break; //
        case 'starbase':
          this._updateStarbase(deltaTime);
          break; //
      }
      this._updateStatusBar(); // Update status text after state logic
    } catch (error) {
      logger.error(`[${this.state}] Error during game update:`, error); // Add state context
      this.statusMessage = `UPDATE ERROR: ${error instanceof Error ? error.message : String(error)}`;
      this._updateStatusBar(); // Show error in status
      this.stopGame(); // Stop on critical update error
    }
  }
  private _updateHyperspace(_deltaTime: number): void {
    // Ignore TS6133 if it appears, rename if truly never needed
    const baseSeedInt = this.gameSeedPRNG.seed; // Use the base integer seed
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE); //
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt); //
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold; //

    let baseStatus = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`;
    if (isNearStar) {
      //
      this.statusMessage = `${baseStatus} | Near star system. Press [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM}] to enter.`; //
    } else {
      this.statusMessage = baseStatus; //
    }
    // logger.debug(`[Hyperspace Update] Coords: ${this.player.worldX},${this.player.worldY}, Hash: ${hash}, Threshold: ${starPresenceThreshold}, NearStar: ${isNearStar}`); // Optional debug
  }
  private _updateSystem(deltaTime: number): void {
    // Keep deltaTime, it's used
    if (!this.currentSystem) {
      logger.error('[System Update] CurrentSystem is null! Returning to hyperspace.'); //
      this.state = 'hyperspace'; // Attempt recovery
      logger.info("Game state changed: 'system' -> 'hyperspace' (Error Recovery)");
      this.statusMessage = 'System Error: Data missing. Returned to hyperspace.';
      return;
    }

    // Update orbital positions
    this.currentSystem.updateOrbits(deltaTime); // Pass deltaTime

    let nearbyObject: Planet | Starbase | null = null;
    const landingDist = CONFIG.LANDING_DISTANCE; // Max distance to allow landing prompt
    const landingDistSq = landingDist * landingDist;
    let currentMinDistSq = landingDistSq; // Check against max landing distance

    // Find closest planet within landing distance
    this.currentSystem.planets.forEach((p) => {
      if (p) {
        const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY); //
        if (dSq < currentMinDistSq) {
          // Use < to find the closest one
          currentMinDistSq = dSq;
          nearbyObject = p;
        }
      }
    });

    // Check if starbase is closer (if it exists)
    if (this.currentSystem.starbase) {
      const dSq = this.player.distanceSqToSystemCoords(
        this.currentSystem.starbase.systemX,
        this.currentSystem.starbase.systemY
      ); //
      if (dSq < currentMinDistSq) {
        // Check if closer than closest planet
        currentMinDistSq = dSq; // Update minimum distance
        nearbyObject = this.currentSystem.starbase; // Starbase is now the closest
      }
    }

    // Build status message
    let status = `System: ${this.currentSystem.name}(${
      this.currentSystem.starType
    }) | Pos: ${this.player.systemX.toFixed(0)},${this.player.systemY.toFixed(0)}`; //
    if (nearbyObject) {
      const dist = Math.sqrt(currentMinDistSq);
      status += ` | Near ${nearbyObject.name} (${dist.toFixed(0)} units). Press [${
        CONFIG.KEY_BINDINGS.LAND
      }] to approach/land.`;
    }

    // Check if near edge to allow leaving
    const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0); // Distance from star center (0,0)
    const edgeThresholdSq = (this.currentSystem.edgeRadius * 0.9) ** 2; // Threshold slightly inside edge radius
    if (distFromStarSq > edgeThresholdSq) {
      //
      status += ` | Approaching system edge. Press [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM}] to enter hyperspace.`; //
    }
    this.statusMessage = status; //
  }
  private _updatePlanet(_deltaTime: number): void {
    // Use _deltaTime as it's not used internally yet
    const planet = this.currentPlanet; // Use local variable guard pattern
    if (!planet) {
      logger.error('[Planet Update] CurrentPlanet is null! Returning to hyperspace.'); //
      this.state = 'hyperspace'; // Attempt recovery
      logger.info("Game state changed: 'planet' -> 'hyperspace' (Error Recovery)");
      this.statusMessage = 'Planet Error: Data missing. Returned to hyperspace.';
      return;
    }

    // Build status message based on planet state
    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.surfaceX},${this.player.surfaceY} | Press [${CONFIG.KEY_BINDINGS.LIFTOFF}] to liftoff.`; //
    if (planet.scanned) {
      //
      status += ` | Scan: ${planet.primaryResource || 'N/A'} (${
        planet.mineralRichness
      }), Grav: ${planet.gravity.toFixed(2)}g`;
      // Add MINE prompt only if applicable
      if (planet.mineralRichness !== MineralRichness.NONE && planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
        //
        status += ` | Press [${CONFIG.KEY_BINDINGS.MINE}] to mine.`; //
      }
    } else {
      status += ` | Press [${CONFIG.KEY_BINDINGS.SCAN}] to scan surface.`; //
    }
    this.statusMessage = status; // Should clear the 'status' unused error TS6133
  }
  private _updateStarbase(_deltaTime: number): void {
    // Use _deltaTime
    if (!this.currentStarbase) {
      logger.error('[Starbase Update] CurrentStarbase is null! Returning to hyperspace.'); //
      this.state = 'hyperspace'; // Attempt recovery
      logger.info("Game state changed: 'starbase' -> 'hyperspace' (Error Recovery)");
      this.statusMessage = 'Starbase Error: Data missing. Returned to hyperspace.';
      return;
    }
    this.statusMessage = `Docked: ${this.currentStarbase.name} | Options: [${CONFIG.KEY_BINDINGS.TRADE}] Trade, [${CONFIG.KEY_BINDINGS.REFUEL}] Refuel, [${CONFIG.KEY_BINDINGS.LIFTOFF}] Liftoff.`; //
  }

  // --- Render Methods ---
  // ... (Render methods remain unchanged from previous version) ...
  private _render(): void {
    logger.debug(`Rendering state: '${this.state}'`); // Add state context
    try {
      switch (this.state) {
        case 'hyperspace':
          this.renderer.drawHyperspace(this.player, this.gameSeedPRNG); //
          break;
        case 'system':
          if (this.currentSystem) {
            this.renderer.drawSolarSystem(this.player, this.currentSystem); // Fixed drawSolarSystem call
          } else {
            // Should not happen if update logic is correct, but handle defensively
            logger.error("[Render] State is 'system' but currentSystem is null.");
            this._renderError('System data missing for render!');
          }
          break;
        case 'planet':
          if (this.currentPlanet) {
            this.renderer.drawPlanetSurface(this.player, this.currentPlanet); //
          } else {
            logger.error("[Render] State is 'planet' but currentPlanet is null.");
            this._renderError('Planet data missing for render!');
          }
          break;
        case 'starbase':
          if (this.currentStarbase) {
            // Starbase uses a simplified surface draw method
            this.renderer.drawPlanetSurface(this.player, this.currentStarbase); //
          } else {
            logger.error("[Render] State is 'starbase' but currentStarbase is null.");
            this._renderError('Starbase data missing for render!');
          }
          break;
        default:
          logger.error(`[Render] Unknown game state encountered: ${this.state}`);
          this._renderError(`Unknown game state: ${this.state}`); //
      }
      // After drawing the scene to the buffer, render the differences to the canvas
      this.renderer.renderDiff(); // Logs internally if cells were drawn
    } catch (error) {
      logger.error(`!!!! CRITICAL RENDER ERROR in state '${this.state}' !!!!`, error); // Add state context
      this.stopGame(); // Stop on critical render error
      // Try to display error message on canvas itself
      this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
      try {
        this.renderer.renderDiff(); // Attempt to draw the error message
      } catch {
        /* ignore nested error */
      }
    }
  }
  private _renderError(message: string): void {
    logger.error(`Render Error Displayed: ${message}`); //
    this.renderer.clear(true); // Physically clear the canvas
    // Draw error message directly (adjust position as needed)
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOR); //
    // Update status bar too
    this.statusMessage = `ERROR: ${message}`;
    this._updateStatusBar(); //
  }

  // --- Action Methods ---
  // ... (Action methods _enterSystemAction to _refuelAction remain unchanged from previous version) ...
  private _enterSystemAction(): void {
    logger.debug(`[Action] Attempting Enter System at World: ${this.player.worldX},${this.player.worldY}`);
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
    const isStarCell = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;

    if (isStarCell) {
      try {
        logger.info(`Entering system at ${this.player.worldX},${this.player.worldY}...`);
        // Create system using the game's PRNG seeded specifically for this location
        this.currentSystem = new SolarSystem(this.player.worldX, this.player.worldY, this.gameSeedPRNG);
        logger.info(`Generated System: ${this.currentSystem.name} (${this.currentSystem.starType})`);

        // TODO: Deduct fuel cost?
        // this.player.consumeFuel(CONFIG.HYPERSPACE_FUEL_COST);

        // Set player position relative to system center (e.g., near the edge)
        const entryAngle = Math.atan2(this.player.worldY, this.player.worldX); // Angle relative to global origin (crude)
        const entryDist = this.currentSystem.edgeRadius * 0.85; // Start inside the edge
        this.player.systemX = Math.cos(entryAngle) * entryDist;
        this.player.systemY = Math.sin(entryAngle) * entryDist;

        // Reset player direction and char for system view
        // Use GLYPHS which is now correctly imported
        this.player.shipDirection = GLYPHS.SHIP_NORTH; // Or face star?
        this.player.char = this.player.shipDirection;

        const oldState = this.state;
        this.state = 'system';
        logger.info(`Game state changed: '${oldState}' -> '${this.state}' (Entered system ${this.currentSystem.name})`);
        this.currentPlanet = null; // Ensure no planet context remains
        this.currentStarbase = null; // Ensure no starbase context remains
      } catch (error) {
        logger.error(`Failed to create or enter solar system at ${this.player.worldX},${this.player.worldY}:`, error);
        this.statusMessage = `System Entry Error: ${error instanceof Error ? error.message : String(error)}`;
        this.currentSystem = null; // Ensure system is null on failure
        // Stay in hyperspace state
      }
    } else {
      logger.debug('Enter System action failed: No star present at current location.');
      this.statusMessage = 'No star system detected at this location.';
    }
  }
  private _leaveSystemAction(): void {
    logger.debug(`[Action] Attempting Leave System from: ${this.currentSystem?.name ?? 'Unknown System'}`);
    if (!this.currentSystem) {
      logger.warn('[Leave System Action] Failed: Not currently in a system.');
      this.statusMessage = 'Cannot leave system: Not in a system!';
      return;
    }

    // Check if player is near the edge
    const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
    const edgeThresholdSq = (this.currentSystem.edgeRadius * 0.8) ** 2; // Use same threshold as update check

    if (distFromStarSq > edgeThresholdSq) {
      logger.info(`Leaving system ${this.currentSystem.name}...`);
      const oldState = this.state;
      this.state = 'hyperspace';
      this.currentSystem = null; // Clear system context
      this.currentPlanet = null; // Clear planet context
      this.currentStarbase = null; // Clear starbase context
      // Player world coordinates remain the same
      this.player.char = CONFIG.PLAYER_CHAR; // Set char for hyperspace
      logger.info(`Game state changed: '${oldState}' -> '${this.state}' (Left system)`);
      this.statusMessage = 'Entered hyperspace.';
    } else {
      logger.debug('[Leave System Action] Failed: Player not close enough to system edge.');
      this.statusMessage = 'Must travel further from the star to leave the system.';
    }
  }

  private _landAction(): void {
    logger.debug('[Action] Attempting Land...');
    if (!this.currentSystem) {
      logger.warn('[Land Action] Failed: Not in a system.');
      this.statusMessage = 'Cannot land: Not in a system!';
      return;
    }

    let nearbyObject: Planet | Starbase | null = null;
    const landingDist = CONFIG.LANDING_DISTANCE;
    const landingDistSq = landingDist * landingDist;
    let currentMinDistSq = landingDistSq;
    // Find closest object within landing distance (same logic as update)
    this.currentSystem.planets.forEach((p) => {
      if (p) {
        const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY);
        if (dSq < currentMinDistSq) {
          currentMinDistSq = dSq;
          nearbyObject = p;
        }
      }
    });
    if (this.currentSystem.starbase) {
      const dSq = this.player.distanceSqToSystemCoords(
        this.currentSystem.starbase.systemX,
        this.currentSystem.starbase.systemY
      );
      if (dSq < currentMinDistSq) {
        nearbyObject = this.currentSystem.starbase;
      }
    }

    if (nearbyObject) {
      logger.info(`Landing on ${nearbyObject.name} (Type: ${nearbyObject.type})...`);
      try {
        // Ensure surface is ready *before* changing state
        nearbyObject.ensureSurfaceReady(); // Generate map etc. if needed
        const oldState = this.state;

        // --- MODIFICATION START ---
        // Check using a type property instead of instanceof for mock compatibility
        // Assumes mocks will have a `_mockType` property set to 'Planet' or 'Starbase'
        const objectType =
          (nearbyObject as any)._mockType ||
          (nearbyObject instanceof Planet ? 'Planet' : nearbyObject instanceof Starbase ? 'Starbase' : 'Unknown');

        if (objectType === 'Planet') {
          // --- MODIFICATION END ---
          this.currentPlanet = nearbyObject as Planet; // Cast is safe here based on check
          this.currentStarbase = null;
          this.state = 'planet';
          // Set player surface position (e.g., center of map for now)
          const mapSize = this.currentPlanet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
          this.player.surfaceX = Math.floor(mapSize / 2);
          this.player.surfaceY = Math.floor(mapSize / 2);
          this.player.char = CONFIG.PLAYER_CHAR; // Set char for surface

          logger.info(
            `Game state changed: '${oldState}' -> '${this.state}' (Landed on planet ${this.currentPlanet.name})`
          );
          // --- MODIFICATION START ---
        } else if (objectType === 'Starbase') {
          // --- MODIFICATION END ---
          this.currentStarbase = nearbyObject as Starbase; // Cast is safe here
          this.currentPlanet = null;
          this.state = 'starbase';
          this.player.surfaceX = 0; // Use simple coords for starbase interior
          this.player.surfaceY = 0;
          this.player.char = CONFIG.PLAYER_CHAR; // Set char for surface

          logger.info(
            `Game state changed: '${oldState}' -> '${this.state}' (Docked at starbase ${this.currentStarbase.name})`
          );
        } else {
          // This case should not be reached if nearbyObject is valid Planet/Starbase
          logger.error(`[Land Action] Nearby object ${nearbyObject.name} has unknown type for landing.`);
          this.statusMessage = `Cannot land: Unknown object type.`;
          return; // Do not change state
        }
      } catch (error) {
        logger.error(`Failed to prepare surface or land on ${nearbyObject.name}:`, error);
        this.statusMessage = `Landing Error: ${error instanceof Error ? error.message : String(error)}`;
        // Don't change state if landing prep failed
        this.currentPlanet = null;
        this.currentStarbase = null;
      }
    } else {
      logger.debug('[Land Action] Failed: No planet or starbase within landing distance.');
      this.statusMessage = 'Nothing nearby to land on.';
    }
  }

  private _liftoffAction(): void {
    logger.debug('[Action] Attempting Liftoff...');
    if (this.state !== 'planet' && this.state !== 'starbase') {
      logger.warn(`[Liftoff Action] Failed: Cannot liftoff from state '${this.state}'.`);
      this.statusMessage = `Cannot liftoff from ${this.state}.`;
      return;
    }
    if (!this.currentSystem) {
      logger.error(`[Liftoff Action] Error: Liftoff initiated from state '${this.state}' but currentSystem is null!`);
      this.statusMessage = 'System error during liftoff!';
      // Attempt recovery? Maybe go to hyperspace?
      this.state = 'hyperspace';
      logger.info(`Game state changed: '${this.state}' -> 'hyperspace' (Error Recovery)`);
      this.currentPlanet = null;
      this.currentStarbase = null;
      return;
    }

    const liftedFromName = this.currentPlanet?.name ?? this.currentStarbase?.name ?? 'Unknown Location';
    logger.info(`Lifting off from ${liftedFromName}...`);

    // Place player back in system view, near the object they lifted off from
    const sourceObj = this.currentPlanet || this.currentStarbase;
    if (sourceObj) {
      // Place slightly offset from the object's system coords
      this.player.systemX = sourceObj.systemX + CONFIG.LANDING_DISTANCE * 0.1; // Small offset
      this.player.systemY = sourceObj.systemY;
    } else {
      // Fallback position if source object somehow null (shouldn't happen)
      this.player.systemX = 0;
      this.player.systemY = 0;
      logger.warn('[Liftoff Action] Source object (planet/starbase) was null, placing player at system origin.');
    }

    // Reset player direction and char for system view
    // Use GLYPHS which is now correctly imported
    this.player.shipDirection = GLYPHS.SHIP_NORTH; //
    this.player.char = this.player.shipDirection;

    const oldState = this.state;
    this.state = 'system';
    this.currentPlanet = null; // Clear planet/starbase context
    this.currentStarbase = null;
    logger.info(`Game state changed: '${oldState}' -> '${this.state}' (Lifted off from ${liftedFromName})`);
    this.statusMessage = `In orbit within ${this.currentSystem.name}.`;
  }
  private _scanPlanetAction(): void {
    logger.debug('[Action] Attempting Scan...');
    if (this.state !== 'planet') {
      logger.warn('[Scan Action] Failed: Not landed on a planet.');
      this.statusMessage = 'Can only scan while landed on a planet.';
      return;
    }
    if (!this.currentPlanet) {
      logger.error("[Scan Action] Failed: State is 'planet' but currentPlanet is null!");
      this.statusMessage = 'Planet data error!';
      return;
    }
    if (this.currentPlanet.scanned) {
      logger.debug('[Scan Action] Planet already scanned.');
      this.statusMessage = `${this.currentPlanet.name} has already been scanned.`;
      // Maybe show scan results again?
      // this.statusMessage = this.currentPlanet.getScanInfo().join(' | '); // Might be too long
      return;
    }

    logger.info(`Scanning ${this.currentPlanet.name}...`);
    try {
      this.currentPlanet.scan(); // Planet method performs the scan logic
      this.statusMessage = `${this.currentPlanet.name} scan complete. Richness: ${
        this.currentPlanet.mineralRichness
      }, Resource: ${this.currentPlanet.primaryResource || 'N/A'}.`;
      logger.info(
        `Scan successful. Richness: ${this.currentPlanet.mineralRichness}, Resource: ${this.currentPlanet.primaryResource}`
      );
    } catch (error) {
      logger.error(`Error during planet scan on ${this.currentPlanet.name}:`, error);
      this.statusMessage = `Scan Failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  private _mineAction(): void {
    logger.debug('[Action] Attempting Mine...');
    if (this.state !== 'planet') {
      logger.warn('[Mine Action] Failed: Not landed on a planet.');
      this.statusMessage = 'Can only mine while landed on a planet.';
      return;
    }
    if (!this.currentPlanet) {
      logger.error("[Mine Action] Failed: State is 'planet' but currentPlanet is null!");
      this.statusMessage = 'Planet data error!';
      return;
    }
    if (this.currentPlanet.type === 'GasGiant' || this.currentPlanet.type === 'IceGiant') {
      logger.warn('[Mine Action] Failed: Cannot mine gas giants.');
      this.statusMessage = `Cannot mine ${this.currentPlanet.type}.`;
      return;
    }
    if (this.currentPlanet.mineralRichness === MineralRichness.NONE) {
      logger.debug('[Mine Action] No minerals detected here.');
      this.statusMessage = 'Scan detected no significant mineral deposits.';
      return;
    }

    // Calculate mining yield based on richness and maybe other factors
    let yieldAmount = 0;
    switch (this.currentPlanet.mineralRichness) {
      case MineralRichness.POOR:
        yieldAmount = CONFIG.MINING_RATE_FACTOR * 1;
        break;
      case MineralRichness.AVERAGE:
        yieldAmount = CONFIG.MINING_RATE_FACTOR * 2;
        break;
      case MineralRichness.RICH:
        yieldAmount = CONFIG.MINING_RATE_FACTOR * 4;
        break;
      case MineralRichness.EXCEPTIONAL:
        yieldAmount = CONFIG.MINING_RATE_FACTOR * 8;
        break;
    }
    // Add some randomness?
    yieldAmount = Math.round(yieldAmount * this.currentPlanet.systemPRNG.random(0.8, 1.2));

    if (yieldAmount <= 0) {
      logger.info(`Mining attempt yielded no minerals on ${this.currentPlanet.name}.`);
      this.statusMessage = 'Mining yielded no results this time.';
      return;
    }

    logger.info(`Attempting to mine ${yieldAmount} units on ${this.currentPlanet.name}...`);
    const added = this.player.addCargo(yieldAmount); // Player method logs success/failure/partial

    if (added) {
      // Check if cargo is now full
      if (this.player.mineralUnits >= this.player.cargoCapacity) {
        this.statusMessage = `Mined minerals. Cargo hold is now full! (${this.player.mineralUnits}/${this.player.cargoCapacity})`;
      } else {
        // Find out how much was *actually* added if cargo was nearly full
        const lastAddedAmount = this.player.mineralUnits - (this.player.mineralUnits - yieldAmount); // Approximation, use return value if addCargo provided it
        this.statusMessage = `Mined ${lastAddedAmount} units of minerals. (${this.player.mineralUnits}/${this.player.cargoCapacity})`;
      }
    } else {
      // addCargo logs the specific reason (already full)
      this.statusMessage = `Mining failed: Cargo hold is full. (${this.player.mineralUnits}/${this.player.cargoCapacity})`;
    }
    // TODO: Deplete planet resources?
  }
  private _tradeAction(): void {
    logger.debug('[Action] Attempting Trade...');
    if (this.state !== 'starbase') {
      logger.warn('[Trade Action] Failed: Not docked at a starbase.');
      this.statusMessage = 'Must be docked at a starbase to trade.';
      return;
    }
    if (!this.currentStarbase) {
      logger.error("[Trade Action] Failed: State is 'starbase' but currentStarbase is null!");
      this.statusMessage = 'Starbase data error!';
      return;
    }

    logger.info(`Initiating trade sequence at ${this.currentStarbase.name}...`);
    // --- Basic Trade Logic ---
    if (this.player.mineralUnits > 0) {
      const mineralsToSell = this.player.mineralUnits;
      const creditsEarned = mineralsToSell * CONFIG.MINERAL_SELL_PRICE;
      const oldCredits = this.player.credits;
      const oldMinerals = this.player.mineralUnits;

      this.player.credits += creditsEarned;
      this.player.mineralUnits = 0; // Sell all

      logger.info(`Trade Complete: Sold ${mineralsToSell} minerals for ${creditsEarned} credits.`);
      logger.info(`Player credits: ${oldCredits} -> ${this.player.credits}`);
      logger.info(`Player minerals: ${oldMinerals} -> ${this.player.mineralUnits}`);
      this.statusMessage = `Sold ${mineralsToSell} mineral units for ${creditsEarned} credits. Current Credits: ${this.player.credits}`;
    } else {
      logger.info('Trade Sequence: No minerals to sell.');
      this.statusMessage = 'Cargo hold is empty. Nothing to sell.';
    }
    // TODO: Add buying options? Different goods? Market fluctuations?
  }
  private _refuelAction(): void {
    logger.debug('[Action] Attempting Refuel...');
    if (this.state !== 'starbase') {
      logger.warn('[Refuel Action] Failed: Not docked at a starbase.');
      this.statusMessage = 'Must be docked at a starbase to refuel.';
      return;
    }
    if (!this.currentStarbase) {
      logger.error("[Refuel Action] Failed: State is 'starbase' but currentStarbase is null!");
      this.statusMessage = 'Starbase data error!';
      return;
    }

    const fuelNeeded = this.player.maxFuel - this.player.fuel;
    if (fuelNeeded <= 0) {
      logger.info('Refuel unnecessary: Fuel tank is already full.');
      this.statusMessage = 'Fuel tank is already full.';
      return;
    }

    const creditsPerUnit = 1 / CONFIG.FUEL_PER_CREDIT;
    const maxAffordableFuel = this.player.credits * CONFIG.FUEL_PER_CREDIT;
    const fuelToBuy = Math.min(fuelNeeded, maxAffordableFuel);
    const cost = Math.ceil(fuelToBuy * creditsPerUnit); // Round cost up to nearest credit

    if (fuelToBuy <= 0 || cost <= 0) {
      logger.info(`Cannot afford fuel. Credits: ${this.player.credits}, Cost per unit: ${creditsPerUnit.toFixed(2)}`);
      this.statusMessage = `Not enough credits to purchase fuel. Need ${Math.ceil(creditsPerUnit)} credits for 1 unit.`;
      return;
    }

    logger.info(
      `Attempting to buy ${fuelToBuy.toFixed(0)} fuel for ${cost} credits at ${this.currentStarbase.name}...`
    );
    const oldCredits = this.player.credits;
    const oldFuel = this.player.fuel;

    // Perform transaction
    this.player.credits -= cost;
    this.player.addFuel(fuelToBuy); // addFuel handles logging the fuel addition

    logger.info(`Refuel Complete: Bought ${fuelToBuy.toFixed(0)} fuel for ${cost} credits.`);
    logger.info(`Player credits: ${oldCredits} -> ${this.player.credits}`);
    // Fuel level logged by addFuel

    if (this.player.fuel >= this.player.maxFuel) {
      this.statusMessage = `Purchased ${fuelToBuy.toFixed(
        0
      )} fuel for ${cost} credits. Fuel tank full! (${this.player.fuel.toFixed(0)}/${this.player.maxFuel})`;
    } else {
      this.statusMessage = `Purchased ${fuelToBuy.toFixed(0)} fuel for ${cost} credits. (${this.player.fuel.toFixed(
        0
      )}/${this.player.maxFuel})`;
    }
  }

  // --- Status Bar Update Helper ---
  private _updateStatusBar(): void {
    // Combine the current state-specific message with common player stats
    const commonStatus = ` | Fuel: ${this.player.fuel.toFixed(0)}/${this.player.maxFuel} | Cargo: ${
      this.player.mineralUnits
    }/${this.player.cargoCapacity} | Cr: ${this.player.credits}`;
    // logger.debug(`Status Msg: ${this.statusMessage}`); // Noisy
    this.renderer.updateStatus(this.statusMessage + commonStatus); // Renderer handles truncation and DOM update
  }
} // End of Game class
