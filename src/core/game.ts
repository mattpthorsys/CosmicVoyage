/* FILE: src/core/game.ts */
// src/core/game.ts (Corrected - Added SPECTRAL_TYPES import)

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { MineralRichness, SPECTRAL_TYPES } from '../constants'; // *** IMPORT ADDED ***
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager'; // Import GameState type
import { ActionProcessor } from './action_processor';
import { fastHash } from '@/utils/hash'; // Assuming alias setup
import { Planet } from '@/entities/planet';
import { Starbase } from '@/entities/starbase';
import { SolarSystem } from '@/entities/solar_system'; // Import SolarSystem

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
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG, () => this._forceFullRenderOnStateChange());
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager);
    window.addEventListener('resize', this._handleResize.bind(this));
    this._handleResize();
    logger.info(
      `[Game] Instance constructed. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${this.stateManager.state}'`
    );
  }

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
    this.inputManager.clearState();
    this.forceFullRender = true;
    this._update(0);
    this._render();
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
    this.forceFullRender = true;
    if (this.isRunning) this._render();
    this.lastUpdateTime = performance.now();
  }

  // --- Core Game Loop ---
  private _loop(currentTime: DOMHighResTimeStamp): void {
    if (!this.isRunning) return;
    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
    this.lastUpdateTime = currentTime;

    try {
        this._processInput();
        this.inputManager.update();
        this._update(deltaTime);
        this._render();
        if (this.forceFullRender) this.forceFullRender = false;
    } catch (loopError) {
        const currentState = this.stateManager.state;
        let errorMessage = 'Unknown Loop Error';
        let errorStack = 'N/A';
        if (loopError instanceof Error) {
            errorMessage = loopError.message;
            errorStack = loopError.stack || 'No stack available';
        } else { try { errorMessage = JSON.stringify(loopError); } catch { errorMessage = String(loopError); } }
        logger.error(`[Game:_loop:${currentState}] Error during game loop: ${errorMessage}`, { errorObject: loopError, stack: errorStack });
        this.statusMessage = `FATAL ERROR: ${errorMessage}. Refresh required.`;
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
        if (this.inputManager.wasActionJustPressed('MOVE_LEFT') || this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
            logger.info('[Game:_processInput] Closing popup via left/right arrow.');
            this.popupState = 'closing';
            this.forceFullRender = true;
            this.statusMessage = '';
            return;
        }
    }

    if (this.popupState === 'opening' || this.popupState === 'closing') return;

    // --- Process Normal Actions (if popup is inactive) ---
    let actionStatusMessage = '';
    const discreteActions: string[] = [
        'ENTER_SYSTEM', 'LEAVE_SYSTEM', 'ACTIVATE_LAND_LIFTOFF', 'SCAN', 'MINE',
        'TRADE', 'REFUEL', 'PEEK_SYSTEM', 'DOWNLOAD_LOG', 'QUIT'
    ];

    for (const action of discreteActions) {
        if (this.inputManager.wasActionJustPressed(action)) {
            logger.debug(`[Game:_processInput] Processing discrete action: ${action}`);
            if (action === 'PEEK_SYSTEM' && this.stateManager.state === 'hyperspace') {
                const peekedSystem = this.stateManager.peekAtSystem(this.player.worldX, this.player.worldY);
                if (peekedSystem) {
                    this.popupContent = this._formatSystemPopup(peekedSystem);
                    this.popupTotalChars = (this.popupContent || []).reduce((sum, line) => sum + line.length, 0) + (this.popupContent?.length || 1) -1;
                    this.popupState = 'opening';
                    this.popupOpenCloseProgress = 0;
                    this.popupTextProgress = 0;
                    this.forceFullRender = true;
                    logger.info(`[Game:_processInput] PEEK_SYSTEM success: Opening popup for ${peekedSystem.name}`);
                } else {
                    actionStatusMessage = "No star system detected at this location.";
                    logger.debug('[Game:_processInput] PEEK_SYSTEM failed: No system found.');
                }
                continue; // PEEK handled
            }

            const status = this.actionProcessor.processAction(action);
            if (status) actionStatusMessage = status;
            if (action === 'QUIT') { this.stopGame(); return; }
        }
    }

    // --- Process Movement ---
    let dx = 0, dy = 0;
    if (this.inputManager.isActionActive('MOVE_UP')) dy -= 1;
    if (this.inputManager.isActionActive('MOVE_DOWN')) dy += 1;
    if (this.inputManager.isActionActive('MOVE_LEFT')) dx -= 1;
    if (this.inputManager.isActionActive('MOVE_RIGHT')) dx += 1;

    if (dx !== 0 || dy !== 0) {
        if (!actionStatusMessage.toLowerCase().includes('error') && !actionStatusMessage.toLowerCase().includes('fail') && !actionStatusMessage.toLowerCase().includes('cannot')) {
            actionStatusMessage = '';
        }
        const isFine = this.inputManager.isActionActive('FINE_CONTROL');
        const isBoost = this.inputManager.isActionActive('BOOST');
        let useFine = isFine && !isBoost;
        let useBoost = isBoost && !isFine; // Currently unused in move methods

        try {
            switch (this.stateManager.state) {
                case 'hyperspace': this.player.moveWorld(dx, dy); break;
                case 'system': this.player.moveSystem(dx, dy, useFine); break;
                case 'planet': {
                    const planet = this.stateManager.currentPlanet;
                    if (planet) {
                        planet.ensureSurfaceReady();
                        const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                        this.player.moveSurface(dx, dy, mapSize);
                    } else { actionStatusMessage = 'Error: Planet data missing!'; }
                } break;
                case 'starbase': break; // No movement in starbase
            }
        } catch (moveError) {
            logger.error(`[Game:_processInput] Move Error:`, moveError);
            actionStatusMessage = `Move Error: ${moveError instanceof Error ? moveError.message : String(moveError)}`;
        }
    }
    if (actionStatusMessage) this.statusMessage = actionStatusMessage;
  }

  // --- Helper to format popup content ---
  private _formatSystemPopup(system: SolarSystem): string[] {
    const lines: string[] = [];
    lines.push(`SYSTEM REPORT: ${system.name}`);
    // *** Check SPECTRAL_TYPES before accessing ***
    const starTemp = SPECTRAL_TYPES[system.starType]?.temp ?? '????';
    lines.push(`Star Type: ${system.starType} (${starTemp}K)`);
    const planetCount = system.planets.filter(p => p !== null).length;
    lines.push(`Planets Detected: ${planetCount}`);
    if (system.starbase) {
        lines.push(`Facilities: Orbital Starbase Present`);
    } else {
        lines.push(`Facilities: None Detected`);
    }
    lines.push(""); // Spacer line
    lines.push("← Close →"); // Use actual arrow characters
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
            break;
        case 'active':
            if (this.popupTextProgress < this.popupTotalChars) {
                this.popupTextProgress += this.popupTypingSpeed * deltaTime;
                this.popupTextProgress = Math.min(this.popupTotalChars, Math.floor(this.popupTextProgress));
            }
            this.statusMessage = `System Details [←] Close [→]`;
            this._updateStatusBar();
            return; // Skip normal updates when popup active
        case 'closing':
            this.popupOpenCloseProgress -= this.popupAnimationSpeed * deltaTime;
            if (this.popupOpenCloseProgress <= 0) {
                this.popupOpenCloseProgress = 0;
                this.popupState = 'inactive';
                this.popupContent = null;
                this.forceFullRender = true;
                logger.debug('[Game:_update] Popup finished closing.');
            }
            break;
        case 'inactive':
            // Proceed with normal game updates
            try {
              const currentState = this.stateManager.state;
              let stateUpdateStatus = '';
              switch (currentState) {
                case 'hyperspace': stateUpdateStatus = this._updateHyperspace(deltaTime); break;
                case 'system': stateUpdateStatus = this._updateSystem(deltaTime); break;
                case 'planet': stateUpdateStatus = this._updatePlanet(deltaTime); break;
                case 'starbase': stateUpdateStatus = this._updateStarbase(deltaTime); break;
                default: stateUpdateStatus = `Error: Unexpected state ${currentState}`; logger.warn(stateUpdateStatus);
              }
              const wasActionStatusSet = this.statusMessage.includes('ACTION ERROR') || this.statusMessage.includes('Mining') ||
                                          this.statusMessage.includes('Scan') || this.statusMessage.includes('Sold') || this.statusMessage.includes('Purchased') ||
                                          this.statusMessage.includes('Entering system') || this.statusMessage.includes('Entered hyperspace') ||
                                          this.statusMessage.includes('Approaching') || this.statusMessage.includes('Departing') ||
                                          this.statusMessage.includes('Nothing nearby') || this.statusMessage.includes('Must travel further') ||
                                          this.statusMessage.includes('Liftoff') || this.statusMessage.includes('No star system detected') ||
                                          this.statusMessage.includes('already scanned') || this.statusMessage.includes('Cannot mine') ||
                                          this.statusMessage.includes('Cargo hold is empty') || this.statusMessage.includes('Fuel tank is already full') ||
                                          this.statusMessage.includes('Not enough credits') || this.statusMessage.includes('Move Error') ||
                                          this.statusMessage.includes('Surface Error') || this.statusMessage.includes('Log file download');
               if (stateUpdateStatus && !wasActionStatusSet) { this.statusMessage = stateUpdateStatus; }
               this._updateStatusBar();
            } catch (updateError) {
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
            break;
    }
  }

  // --- State-specific update methods ---
  private _updateHyperspace(_deltaTime: number): string {
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;
    let baseStatus = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`;
    if (isNearStar) {
      const peekedSystem = this.stateManager.peekAtSystem(this.player.worldX, this.player.worldY);
      if (peekedSystem) {
        const starbaseText = peekedSystem.starbase ? ' (Starbase)' : '';
        baseStatus += ` | Near ${peekedSystem.name}${starbaseText}. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.PEEK_SYSTEM.toUpperCase()}] Details`;
      } else { baseStatus += ` | Near star system. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.PEEK_SYSTEM.toUpperCase()}] Details`; }
    }
    if (!isNearStar) this.stateManager.resetPeekedSystem();
    return baseStatus;
  }
  private _updateSystem(deltaTime: number): string {
    const system = this.stateManager.currentSystem;
    if (!system) { return 'System Error: Data missing. Returned to hyperspace.'; } // Already handled state change
    system.updateOrbits(deltaTime);
    const nearbyObject = system.getObjectNear(this.player.systemX, this.player.systemY);
    let status = `System: ${system.name}(${system.starType}) | Pos: ${this.player.systemX.toFixed(0)},${this.player.systemY.toFixed(0)}`;
    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${dist.toFixed(0)} units). Press [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] to land/dock.`;
    } else if (this.isPlayerNearExit()) { status += ` | Near system edge. Press [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] to leave.`; }
    if (system.isAtEdge(this.player.systemX, this.player.systemY)) { this.stateManager.leaveSystem(); }
    return status;
  }
  private isPlayerNearExit(): boolean {
    const system = this.stateManager.currentSystem;
    if (!system) return false;
    const distSq = this.player.distanceSqToSystemCoords(0, 0);
    const exitThresholdSq = (system.edgeRadius * 0.75) ** 2;
    return distSq > exitThresholdSq;
  }
  private _updatePlanet(_deltaTime: number): string {
    const planet = this.stateManager.currentPlanet;
    if (!planet) { return 'Planet Error: Data missing. Returned to hyperspace.'; } // Already handled state change
    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.surfaceX},${this.player.surfaceY} | Grav: ${planet.gravity.toFixed(2)}g | Temp: ${planet.surfaceTemp}K`;
    const actions = [`[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Liftoff`];
    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
        if (planet.scanned) {
            status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
            if (planet.mineralRichness !== MineralRichness.NONE) actions.push(`[${CONFIG.KEY_BINDINGS.MINE.toUpperCase()}] Mine`);
        } else { actions.push(`[${CONFIG.KEY_BINDINGS.SCAN.toUpperCase()}] Scan`); status += ` | Scan: Required (Potential: ${planet.mineralRichness})`; }
    } else { status += ` | Scan: N/A (${planet.type})`; }
    status += ` | Actions: ${actions.join(', ')}.`;
    return status;
  }
  private _updateStarbase(_deltaTime: number): string {
    const starbase = this.stateManager.currentStarbase;
    if (!starbase) { return 'Starbase Error: Data missing. Returned to hyperspace.'; } // Already handled state change
    const actions = [ `[${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade`, `[${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel`, `[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Depart` ];
    return `Docked: ${starbase.name} | Actions: ${actions.join(', ')}.`;
  }

  // --- Rendering ---
  private _render(): void {
    const currentState = this.stateManager.state;
    try {
        //this.renderer.clear(this.forceFullRender || this.popupState === 'opening' || this.popupState === 'closing'); // Clear if animating popup too
        this.renderer.clear(true);

        // --- Draw Background Layer (System State Only) ---
        if (currentState === 'system' && this.popupState === 'inactive') {
            this.renderer.drawStarBackground(this.player);
            this.renderer.renderBufferFull(true);
        } else if (currentState === 'system' && this.popupState !== 'inactive') {
             // Ensure background is clear if popup is up in system view
             this.renderer.clear(true);
        }

        // --- Draw Main Scene Layer (populates main buffer) ---
        // Only draw main scene fully if popup isn't active/closing
        if (this.popupState !== 'active' && this.popupState !== 'closing') {
            switch (currentState) {
                case 'hyperspace': this.renderer.drawHyperspace(this.player, this.gameSeedPRNG); break;
                case 'system':
                    const system = this.stateManager.currentSystem;
                    if (system) this.renderer.drawSolarSystem(this.player, system);
                    else this._renderError('System data missing for render!');
                    break;
                case 'planet':
                    const planet = this.stateManager.currentPlanet;
                    if (planet) { planet.ensureSurfaceReady(); this.renderer.drawPlanetSurface(this.player, planet); }
                    else { this._renderError('Planet data missing for render!'); }
                    break;
                case 'starbase':
                    const starbase = this.stateManager.currentStarbase;
                    if (starbase) { starbase.ensureSurfaceReady(); this.renderer.drawPlanetSurface(this.player, starbase); }
                    else { this._renderError('Starbase data missing for render!'); }
                    break;
                default: this._renderError(`Unknown game state: ${currentState}`);
            }
        }

        // --- Draw Popup (if not inactive) ---
        if (this.popupState !== 'inactive') {
            this.renderer.drawPopup( this.popupContent, this.popupState, this.popupOpenCloseProgress, this.popupTextProgress );
        }

        // --- Render the main buffer ---
        this.renderer.renderBufferFull(false); // Render main buffer (scene + popup)

    } catch (error) {
        // ... (Error handling) ...
        logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, error);
        this.stopGame();
        this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
        try { this.renderer.renderBufferFull(false); } catch { /* ignore */ }
    }
  }

  /** Helper to render an error message directly to the canvas buffer. */
  private _renderError(message: string): void {
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true);
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOUR);
    this.statusMessage = `ERROR: ${message}`;
    this._updateStatusBar();
  }

  /** Updates the status bar text via the renderer. */
  private _updateStatusBar(): void {
    let currentCargoTotal = 0;
    try { currentCargoTotal = this.player.getCurrentCargoTotal(); }
    catch (e) { logger.error(`[Game:_updateStatusBar] Error getting cargo total: ${e}`); }
    const commonStatus = ` | Fuel: ${this.player.fuel.toFixed(0)}/${this.player.maxFuel} | Cargo: ${currentCargoTotal}/${this.player.cargoCapacity} | Cr: ${this.player.credits}`;
    const hasStarbase = this.stateManager.state === 'starbase';
    const finalStatus = (this.popupState !== 'inactive') ? this.statusMessage : this.statusMessage + commonStatus;
    this.renderer.updateStatus(finalStatus, hasStarbase);
  }
} // End of Game class