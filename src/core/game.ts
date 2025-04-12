/* FILE: src/core/game.ts */
// src/core/game.ts (Revised rendering order for system view)

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { MineralRichness, SPECTRAL_TYPES, ELEMENTS } from '../constants'; // Import ELEMENTS
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager';
// Import GameState type
import { ActionProcessor, ActionProcessResult } from './action_processor'; // Import ActionProcessResult type
import { fastHash } from '@/utils/hash';
// Assuming alias setup
import { Planet } from '@/entities/planet';
import { Starbase } from '@/entities/starbase';
import { SolarSystem } from '@/entities/solar_system'; // Import SolarSystem

// Define type for scan target (including star info)
type ScanTarget = Planet | Starbase | { type: 'Star', name: string, starType: string };

/** Main game class - Coordinates components and manages the loop. */
export class Game {
  // Core Components
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

  // Flag to force full clear/redraw
  private forceFullRender: boolean = true;

  // --- Popup State ---
  private popupState: 'inactive' | 'opening' | 'active' | 'closing' = 'inactive';
  private popupContent: string[] | null = null;
  private popupOpenCloseProgress: number = 0; // 0 (closed/small) to 1 (open/full size)
  private popupTextProgress: number = 0; // Character index for typing effect
  private popupTotalChars: number = 0; // Total characters in popupContent for clamping progress
  private readonly popupAnimationSpeed: number = 5.0; // Progress per second (FASTER)
  private readonly popupTypingSpeed: number = 80; // Characters per second (FASTER)


  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('[Game] Constructing instance...');
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
    this.gameSeedPRNG = new PRNG(initialSeed);
    this.renderer = new RendererFacade(canvasId, statusBarId);
    this.player = new Player();
    this.inputManager = new InputManager();
    // Ensure the GameStateManager callback is bound correctly
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG, this._forceFullRenderOnStateChange.bind(this));
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager);
    window.addEventListener('resize', this._handleResize.bind(this));
    this._handleResize(); // Initial fit
    logger.info(
      `[Game] Instance constructed. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${this.stateManager.state}'`
    );
  }

  // Callback for GameStateManager to signal a state change requires a full render
  private _forceFullRenderOnStateChange() {
    this.forceFullRender = true;
    logger.debug('[Game] State change detected, forcing full render on next frame.');
  }

  public getGameState(): GameState { return this.stateManager.state; }
  public checkIfRunning(): boolean { return this.isRunning; }

  // --- Game Loop Control ---
  startGame(): void {
    if (this.isRunning) return;
    logger.info('[Game] Starting game loop...');
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.inputManager.startListening();
    this.inputManager.clearState(); // Ensure clean state on start
    this.forceFullRender = true; // Ensure first frame is a full render
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    logger.info('[Game] Game loop initiated.');
  }

  stopGame(): void {
    if (!this.isRunning) return;
    logger.info('[Game] Stopping game loop...');
    this.isRunning = false;
    this.inputManager.stopListening();
    if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }
    this.renderer.updateStatus('Game stopped. Refresh to restart.', false);
    logger.info('[Game] Game loop stopped.');
  }

  // --- Event Handlers ---
  private _handleResize(): void {
    logger.debug('[Game] Handling window resize...');
    this.renderer.fitToScreen();
    this.forceFullRender = true; // Force redraw after resize
    this.lastUpdateTime = performance.now();
  }

  // --- Core Game Loop ---
  private _loop(currentTime: DOMHighResTimeStamp): void {
    if (!this.isRunning) return;

    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0); // Cap at 100ms
    this.lastUpdateTime = currentTime;

    try {
        this._processInput();
        this.inputManager.update();
        this._update(deltaTime);
        this._render(); // Render handles clearing internally now

        if (this.forceFullRender) this.forceFullRender = false; // Reset flag *after* render

    } catch (loopError) {
        const currentState = this.stateManager.state;
        let errorMessage = 'Unknown Loop Error';
        let errorStack = 'N/A';
        if (loopError instanceof Error) {
            errorMessage = loopError.message;
            errorStack = loopError.stack || 'No stack available';
        } else { try { errorMessage = JSON.stringify(loopError); } catch { errorMessage = String(loopError); } }
        logger.error(`[Game:_loop:${currentState}] Error during game loop: ${errorMessage}`, { errorObject: loopError, stack: errorStack });
        this.statusMessage = `FATAL LOOP ERROR: ${errorMessage}. Refresh required.`;
        try { this._updateStatusBar(); } catch { /* ignore */ }
        this.stopGame();
        return;
    }

    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }


  // --- Input Processing ---
  private _processInput(): void {
    // --- Check for Popup Closing First ---
    if (this.popupState === 'active') {
        if (this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
            this.inputManager.wasActionJustPressed('MOVE_RIGHT') ||
            this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') || // Backspace
            this.inputManager.wasActionJustPressed('QUIT') ||          // Escape
            this.inputManager.wasActionJustPressed('ENTER_SYSTEM')) { // Enter
            logger.info('[Game:_processInput] Closing popup via key press.');
            this.popupState = 'closing';
            this.forceFullRender = true;
            this.statusMessage = '';
            return;
        }
    }

    if (this.popupState === 'opening' || this.popupState === 'closing') {
        return; // Block input while animating
    }

    // --- Process Normal Actions (if popup is inactive) ---
    let actionTaken = false;
    let actionResult: ActionProcessResult = null;

    const discreteActions: string[] = [
        'ENTER_SYSTEM', 'LEAVE_SYSTEM', 'ACTIVATE_LAND_LIFTOFF',
        'SCAN', // Planet surface scan
        'SCAN_SYSTEM_OBJECT', // NEW: System view scan
        'MINE', 'TRADE', 'REFUEL',
        'DOWNLOAD_LOG', 'QUIT'
    ];

    for (const action of discreteActions) {
        if (this.inputManager.wasActionJustPressed(action)) {
            logger.debug(`[Game:_processInput] Processing discrete action: ${action}`);
            actionResult = this.actionProcessor.processAction(action);
            actionTaken = true;
            if (action === 'QUIT') { this.stopGame(); return; }
            break;
        }
    }

    // --- Handle Action Results ---
    if (actionTaken) {
        if (typeof actionResult === 'string') {
            this.statusMessage = actionResult;
        } else if (actionResult && typeof actionResult === 'object' && 'scanTarget' in actionResult) {
            if (actionResult.scanTarget) { // Check if target is not null/undefined
                 this._triggerScanPopup(actionResult.scanTarget);
                 this.statusMessage = `Scanning ${actionResult.scanTarget === 'Star' ? 'local star' : actionResult.scanTarget.name}...`; // Set scanning message
            } else {
                // This case shouldn't happen if ActionProcessor works correctly, but handle it.
                logger.warn("[Game:_processInput] ActionProcessor returned scanTarget object but target was null/undefined.");
                this.statusMessage = "Scan Error: Invalid target.";
            }
        }
        // else: actionResult is null, do nothing (action was likely invalid)
    }

    // --- Process Movement (only if no discrete action was processed this frame) ---
    if (!actionTaken) {
        let dx = 0, dy = 0;
        if (this.inputManager.isActionActive('MOVE_UP')) dy -= 1;
        if (this.inputManager.isActionActive('MOVE_DOWN')) dy += 1;
        if (this.inputManager.isActionActive('MOVE_LEFT')) dx -= 1;
        if (this.inputManager.isActionActive('MOVE_RIGHT')) dx += 1;

        if (dx !== 0 || dy !== 0) {
             // Clear non-sticky status messages on movement
            if (this.statusMessage === '' || // Clear if empty
                !(this.statusMessage.toLowerCase().includes('error') || // Don't clear errors
                  this.statusMessage.toLowerCase().includes('fail') ||
                  this.statusMessage.toLowerCase().includes('cannot') ||
                  this.statusMessage.startsWith('Mined') ||
                  this.statusMessage.startsWith('Sold') ||
                  this.statusMessage.startsWith('Scan') || // Don't clear scan messages immediately
                  this.statusMessage.startsWith('Purchased')))
            {
                this.statusMessage = ''; // Clear previous status on move
            }

            const isFine = this.inputManager.isActionActive('FINE_CONTROL');
            const isBoost = this.inputManager.isActionActive('BOOST');
            let useFine = isFine && !isBoost;

            try {
                switch (this.stateManager.state) {
                    case 'hyperspace': this.player.moveWorld(dx, dy); break;
                    case 'system': this.player.moveSystem(dx, dy, useFine); break;
                    case 'planet': {
                        const planet = this.stateManager.currentPlanet;
                        if (planet) {
                            try {
                                planet.ensureSurfaceReady();
                                const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                                this.player.moveSurface(dx, dy, mapSize);
                            } catch (surfaceError) {
                                logger.error(`[Game:_processInput] Error preparing surface for move:`, surfaceError);
                                this.statusMessage = `Surface Error: Failed to move.`;
                            }
                        } else {
                            this.statusMessage = 'Error: Planet data missing for surface move!';
                            logger.error('[Game:_processInput] Player in planet state but currentPlanet is null.');
                        }
                    } break;
                    case 'starbase': break;
                }
            } catch (moveError) {
                logger.error(`[Game:_processInput] Move Error:`, moveError);
                this.statusMessage = `Move Error: ${moveError instanceof Error ? moveError.message : String(moveError)}`;
            }
        }
    }
  } // End _processInput

  // --- Helper to trigger and format popups ---
  private _triggerScanPopup(target: ScanTarget): void {
      let lines: string[] | null = null;
      try {
        if (target === 'Star' || (typeof target === 'object' && target?.type === 'Star')) { // Robust check for star
            const system = this.stateManager.currentSystem;
            if (system) {
                lines = this._formatStarScanPopup(system);
            } else {
                logger.error("[Game:_triggerScanPopup] Cannot format star scan: current system is null.");
                this.statusMessage = "Error: System data missing for star scan.";
                return;
            }
        } else if (target instanceof Planet || target instanceof Starbase) {
            lines = target.getScanInfo();
            if (target instanceof Planet && !target.scanned) {
                target.scan();
                lines = target.getScanInfo();
            }
        } else {
             logger.error("[Game:_triggerScanPopup] Unknown scan target type:", target);
             this.statusMessage = "Error: Unknown object type for scan.";
             return;
        }

        if (lines && lines.length > 0) { // Ensure lines were generated
            this.popupContent = lines;
            if (this.popupContent[this.popupContent.length - 1] !== "") {
                 this.popupContent.push(""); // Add spacer
            }
            this.popupContent.push("← Close →");
            this.popupTotalChars = this.popupContent.reduce((sum, line) => sum + line.length, 0) + this.popupContent.length -1;
            this.popupState = 'opening';
            this.popupOpenCloseProgress = 0;
            this.popupTextProgress = 0;
            this.forceFullRender = true;
            logger.info(`[Game] Opening scan popup for ${target === 'Star' || target.type === 'Star' ? 'Star' : target.name}`);
        } else {
             this.statusMessage = "Error: Failed to generate scan information.";
             logger.error("[Game:_triggerScanPopup] Generated scan lines array was null or empty.");
        }
      } catch (error) {
           logger.error(`[Game:_triggerScanPopup] Error generating scan popup content:`, error);
           this.statusMessage = `Scan Error: ${error instanceof Error ? error.message : 'Failed to get info'}`;
      }
  }

  private _formatStarScanPopup(system: SolarSystem): string[] {
      const lines: string[] = [];
      const starInfo = SPECTRAL_TYPES[system.starType];
      lines.push(`--- STELLAR SCAN: ${system.name} ---`);
      lines.push(`Spectral Type: ${system.starType}`);
      if (starInfo) {
          lines.push(`Temperature: ~${starInfo.temp.toLocaleString()} K`);
          lines.push(`Luminosity: ~${starInfo.brightness.toFixed(1)} (Rel. Sol)`);
          lines.push(`Mass: ~${starInfo.mass.toFixed(1)} Solar Masses`); // Now includes mass
          lines.push(`Colour Index: ${starInfo.colour}`);
      } else {
          lines.push(`Temperature: Unknown`);
          lines.push(`Luminosity: Unknown`);
          lines.push(`Mass: Unknown`);
      }
      lines.push(`Planetary Bodies: ${system.planets.filter(p => p !== null).length}`);
      lines.push(`Facilities: ${system.starbase ? 'Starbase Detected' : 'None Detected'}`);
      return lines;
  }


  // --- Game State Update ---
  private _update(deltaTime: number): void {
    // --- Update Popup Animation State ---
    switch (this.popupState) {
        case 'opening':
            this.popupOpenCloseProgress += this.popupAnimationSpeed * deltaTime;
            if (this.popupOpenCloseProgress >= 1) {
                this.popupOpenCloseProgress = 1;
                this.popupState = 'active';
                logger.debug('[Game:_update] Popup finished opening.');
            }
            this.forceFullRender = true; // Need redraw during opening
            break; // Still need to update status bar below
        case 'active':
            // Advance typing effect
            if (this.popupTextProgress < this.popupTotalChars) {
                this.popupTextProgress += this.popupTypingSpeed * deltaTime;
                this.popupTextProgress = Math.min(this.popupTotalChars, Math.floor(this.popupTextProgress));
                 this.forceFullRender = true; // Need redraw during typing
            }
            // Update status bar for active popup
            this.statusMessage = `Scan Details [←] Close [→]`;
            this._updateStatusBar(); // Update status bar immediately
            return; // Skip normal game updates when popup is fully active
        case 'closing':
            this.popupOpenCloseProgress -= this.popupAnimationSpeed * deltaTime;
            if (this.popupOpenCloseProgress <= 0) {
                this.popupOpenCloseProgress = 0;
                this.popupState = 'inactive';
                this.popupContent = null; // Clear content after closing
                logger.debug('[Game:_update] Popup finished closing.');
                this.statusMessage = ''; // Clear status message after popup closes
            }
             this.forceFullRender = true; // Need redraw during closing
            break; // Still need to update status bar below
        case 'inactive':
            // --- Normal Game State Updates ---
            try {
              const currentState = this.stateManager.state;
              let stateUpdateStatus = ''; // Holds status from state-specific updates
              switch (currentState) {
                case 'hyperspace': stateUpdateStatus = this._updateHyperspace(deltaTime); break;
                case 'system': stateUpdateStatus = this._updateSystem(deltaTime); break;
                case 'planet': stateUpdateStatus = this._updatePlanet(deltaTime); break;
                case 'starbase': stateUpdateStatus = this._updateStarbase(deltaTime); break;
                default: stateUpdateStatus = `Error: Unexpected state ${currentState}`; logger.warn(stateUpdateStatus);
              }
               // Update status message ONLY if it wasn't set by a discrete action this frame
               if (stateUpdateStatus && this.statusMessage === '') {
                   this.statusMessage = stateUpdateStatus;
               }
            } catch (updateError) {
                 const stateWhenErrorOccurred = this.stateManager.state;
                 let errorMessage = 'Unknown Update Error';
                 if (updateError instanceof Error) errorMessage = updateError.message;
                 else try { errorMessage = JSON.stringify(updateError); } catch { errorMessage = String(updateError); }
                 logger.error(`[Game:_update:${stateWhenErrorOccurred}] Error during update logic: ${errorMessage}`, { errorObject: updateError });
                 this.statusMessage = `UPDATE ERROR: ${errorMessage}`;
                 this.stopGame(); // Stop on update error
                 // Optionally re-throw if error should halt execution immediately
                 // throw updateError;
            }
            break; // End inactive case
    } // End popupState switch

    // Update status bar regardless of popup animation state (except when fully active)
    this._updateStatusBar();

  } // End _update


  // --- State-specific update methods ---
  private _updateHyperspace(_deltaTime: number): string {
    // ... (content unchanged from previous version) ...
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;

    let baseStatus = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`;
    if (isNearStar) {
      const peekedSystem = this.stateManager.peekAtSystem(this.player.worldX, this.player.worldY);
      if (peekedSystem) {
        const starbaseText = peekedSystem.starbase ? ' (Starbase)' : '';
        // Use SCAN_SYSTEM_OBJECT key for details now
        baseStatus += ` | Near ${peekedSystem.name}${starbaseText}. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
      } else {
        baseStatus += ` | Near star system. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
      }
    } else {
         this.stateManager.resetPeekedSystem(); // Clear peeked system if not near star
    }
    return baseStatus;
  }

  private _updateSystem(deltaTime: number): string {
    // ... (content unchanged from previous version) ...
    const system = this.stateManager.currentSystem;
    if (!system) {
        logger.error("[Game:_updateSystem] In 'system' state but currentSystem is null! Attempting recovery to hyperspace.");
        this.stateManager.leaveSystem();
        return 'System Error: Data missing. Returning to hyperspace.';
    }
    system.updateOrbits(deltaTime);
    const nearbyObject = system.getObjectNear(this.player.systemX, this.player.systemY);
    let status = `System: ${system.name} (${system.starType}) | Pos: ${this.player.systemX.toFixed(0)},${this.player.systemY.toFixed(0)}`;

    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${dist.toFixed(0)} u). [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Land/Dock / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
    } else if (this.isPlayerNearExit()) {
         const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
        const scanThresholdSq = (CONFIG.LANDING_DISTANCE * 2) ** 2;
        if (distSqToStar < scanThresholdSq) {
             status += ` | [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan Star / [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] Leave System`;
        } else {
            status += ` | Near system edge. [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] Leave System`;
        }
    } else {
         const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
        const scanThresholdSq = (CONFIG.LANDING_DISTANCE * 2) ** 2;
        if (distSqToStar < scanThresholdSq) {
             status += ` | [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan Star`;
        }
    }
    return status;
  }

  private isPlayerNearExit(): boolean {
    // ... (content unchanged from previous version) ...
    const system = this.stateManager.currentSystem;
    if (!system) return false;
    const distSq = this.player.distanceSqToSystemCoords(0, 0);
    const exitThresholdSq = (system.edgeRadius * 0.75) ** 2;
    return distSq > exitThresholdSq;
  }

  private _updatePlanet(_deltaTime: number): string {
    // ... (content unchanged from previous version) ...
     const planet = this.stateManager.currentPlanet;
    if (!planet) {
        logger.error("[Game:_updatePlanet] In 'planet' state but currentPlanet is null! Attempting recovery to hyperspace.");
        this.stateManager.leaveSystem();
        return 'Planet Error: Data missing. Returning to hyperspace.';
    }
    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.surfaceX},${this.player.surfaceY} | Grav: ${planet.gravity.toFixed(2)}g | Temp: ${planet.surfaceTemp}K`;
    const actions = [`[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Liftoff`];
    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
        if (planet.scanned) {
            status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
            if (planet.mineralRichness !== MineralRichness.NONE && !planet.isMined(this.player.surfaceX, this.player.surfaceY)) {
                actions.push(`[${CONFIG.KEY_BINDINGS.MINE.toUpperCase()}] Mine`);
            }
        } else {
            actions.push(`[${CONFIG.KEY_BINDINGS.SCAN.toUpperCase()}] Scan`);
            status += ` | Scan: Required (Potential: ${planet.mineralRichness})`;
        }
    } else {
        status += ` | Scan: N/A (${planet.type})`;
    }
    status += ` | Actions: ${actions.join(', ')}.`;
    return status;
  }

  private _updateStarbase(_deltaTime: number): string {
    // ... (content unchanged from previous version) ...
    const starbase = this.stateManager.currentStarbase;
    if (!starbase) {
        logger.error("[Game:_updateStarbase] In 'starbase' state but currentStarbase is null! Attempting recovery to hyperspace.");
        this.stateManager.leaveSystem();
        return 'Starbase Error: Data missing. Returning to hyperspace.';
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
    try {
        // --- Start Rendering ---
        // Clear the physical canvas. Always needed unless doing complex diff rendering.
        // For simplicity with background layers and popups, always clearing is safer.
        this.renderer.clear(true);

        // --- Draw Background Layer (Only in System View) ---
        if (currentState === 'system') {
            this.renderer.drawStarBackground(this.player);
            // Draw background content into the background buffer
            // *** RENDER the background buffer to the canvas ***
            this.renderer.renderBufferFull(true);
             // If a popup is opening/closing, this background might get drawn over.
        }

        // --- Draw Main Scene (populates main buffer) ---
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
                if (planet) {
                   try {
                       planet.ensureSurfaceReady();
                       this.renderer.drawPlanetSurface(this.player, planet);
                   } catch (surfaceError) {
                        logger.error(`[Game:_render] Error ensuring surface ready for ${planet.name}:`, surfaceError);
                        this._renderError(`Surface Error: ${surfaceError instanceof Error ? surfaceError.message : 'Unknown'}`);
                   }
                } else { this._renderError('Planet data missing for render!'); }
                break;
            case 'starbase':
                const starbase = this.stateManager.currentStarbase;
                if (starbase) {
                     try {
                         starbase.ensureSurfaceReady();
                         this.renderer.drawPlanetSurface(this.player, starbase);
                     } catch (surfaceError) {
                          logger.error(`[Game:_render] Error ensuring starbase ready for ${starbase.name}:`, surfaceError);
                         this._renderError(`Docking Error: ${surfaceError instanceof Error ? surfaceError.message : 'Unknown'}`);
                     }
                } else { this._renderError('Starbase data missing for render!'); }
                break;
            default: this._renderError(`Unknown game state: ${currentState}`);
        }

        // --- Draw Popup (populates main buffer OVER scene content) ---
        if (this.popupState !== 'inactive') {
            this.renderer.drawPopup(
                 this.popupContent,
                 this.popupState,
                 this.popupOpenCloseProgress,
                 this.popupTextProgress
            );
        }

        // --- Render the main buffer (scene + potential popup) to the canvas ---
        // This draws ON TOP of the star background rendered earlier (if in system view)
        this.renderer.renderBufferFull(false);


    } catch (error) {
        logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, error);
        this.stopGame();
        try {
           this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
           this.renderer.renderBufferFull(false); // Attempt one last render
        } catch { /* ignore secondary error */ }
    }
  }


  /** Helper to render an error message directly to the canvas buffer. */
  private _renderError(message: string): void {
    // ... (content unchanged) ...
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true);
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOUR);
    this.statusMessage = `ERROR: ${message}`;
    this._updateStatusBar();
  }

  /** Updates the status bar text via the renderer. */
  private _updateStatusBar(): void {
    // ... (content unchanged) ...
    let currentCargoTotal = 0;
    try { currentCargoTotal = this.player.getCurrentCargoTotal(); }
    catch (e) { logger.error(`[Game:_updateStatusBar] Error getting cargo total: ${e}`); }
    const commonStatus = ` | Fuel: ${this.player.fuel.toFixed(0)}/${this.player.maxFuel} | Cargo: ${currentCargoTotal}/${this.player.cargoCapacity} | Cr: ${this.player.credits}`;
    const finalStatus = (this.popupState === 'active')
                        ? this.statusMessage
                        : this.statusMessage + commonStatus;
    const hasStarbase = this.stateManager.state === 'starbase';
    this.renderer.updateStatus(finalStatus, hasStarbase);
  }

} // End of Game class