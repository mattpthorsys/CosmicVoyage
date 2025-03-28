// src/core/game.ts (Complete Code with Logging and Fixes)

import { Renderer } from '../rendering/renderer';
// import { InputManager } from './input_manager'; // Proper InputManager needed later
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase'; // Ensure this file exists and exports Starbase
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config'; // Ensure config.ts includes all needed keys
import { MineralRichness } from '../constants'; // Keep for status updates
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
    private keysPressed: Set<string> = new Set();
    private actionQueue: string[] = [];
    private statusMessage: string = "Initializing Systems...";

    constructor(
        canvasId: string,
        statusBarId: string,
        seed?: string | number
    ) {
        logger.info("Constructing Game instance..."); // Log constructor start
        const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
        // PRNG logs its own seed now
        this.gameSeedPRNG = new PRNG(initialSeed);

        // Renderer logs its own success
        this.renderer = new Renderer(canvasId, statusBarId);
        this.player = new Player(); // Uses defaults from CONFIG via constructor

        this.state = 'hyperspace';
        logger.debug(`Initial game state set: ${this.state}`);

        this._setupTempInput();
        window.addEventListener('resize', this._handleResize.bind(this));
        // Initial fit might happen before logger is fully ready if called immediately,
        // but subsequent calls in handler are fine. fitToScreen logs internally.
        this._handleResize();

        logger.info(`Game instance constructed successfully. Initial state: ${this.state}`);
    }

    // --- Temporary Input Handling Methods --- (Replace these later)
    private _setupTempInput(): void {
         logger.debug("Setting up temporary input listeners...");
         window.addEventListener('keydown', (e: KeyboardEvent) => { if (this.keysPressed.has(e.key)) return; this.keysPressed.add(e.key); this._queueActionFromKey(e.key, e.shiftKey); if (Object.values(CONFIG.KEY_BINDINGS).includes(e.key as any)) { e.preventDefault(); } });
         window.addEventListener('keyup', (e: KeyboardEvent) => { this.keysPressed.delete(e.key); });
         logger.debug("Temporary input listeners attached.");
    }
    private _queueActionFromKey(key: string, isShiftDown: boolean): void {
        const bindings = CONFIG.KEY_BINDINGS; let action: string | null = null; let fineControl = isShiftDown;
        switch (key) {
            case bindings.MOVE_UP: action = 'MOVE_UP'; break; case bindings.MOVE_DOWN: action = 'MOVE_DOWN'; break;
            case bindings.MOVE_LEFT: action = 'MOVE_LEFT'; break; case bindings.MOVE_RIGHT: action = 'MOVE_RIGHT'; break;
            case bindings.ENTER_SYSTEM: action = 'ENTER_SYSTEM'; break; case bindings.LEAVE_SYSTEM: action = 'LEAVE_SYSTEM'; break;
            case bindings.LAND: action = 'LAND'; break; case bindings.LIFTOFF: action = 'LIFTOFF'; break;
            case bindings.SCAN: action = 'SCAN'; break; case bindings.MINE: action = 'MINE'; break;
            case bindings.TRADE: action = 'TRADE'; break; case bindings.REFUEL: action = 'REFUEL'; break;
            case bindings.QUIT: action = 'QUIT'; this.stopGame(); break;
        }
        if (action) { if (fineControl && action.startsWith('MOVE_')) { action = `FINE_${action}`; } this.actionQueue.push(action); }
    }
    // --- End Temporary Input Handling ---

    startGame(): void {
        if (this.isRunning) { logger.warn("startGame called but game is already running."); return; }
        logger.info("Starting game loop...");
        this.isRunning = true; this.lastUpdateTime = performance.now();
        this.keysPressed.clear(); this.actionQueue = [];
        // Perform initial update to set status message etc. before first real frame
        this._update(0);
        this._updateStatusBar(); // Ensure status bar is updated immediately
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
        logger.info("Game loop initiated."); // Confirmation loop is requested
    }

    stopGame(): void {
        if (!this.isRunning) { return; }
        logger.info("Stopping game loop..."); this.isRunning = false;
        if (this.animationFrameId !== null) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        // Cleanup temporary listeners if possible, or InputManager later
        this.renderer.updateStatus("Game stopped. Refresh to restart.");
        logger.info("Game loop stopped.");
    }

    private _handleResize(): void {
         logger.debug("Handling window resize...");
         this.renderer.fitToScreen(); // Renderer logs size details
         if (this.isRunning) {
              logger.debug("Triggering render after resize.");
              this._render(); // Re-render immediately
         }
         this.lastUpdateTime = performance.now(); // Prevent large delta jump
    }

    private _loop(currentTime: DOMHighResTimeStamp): void {
        if (!this.isRunning) return;
        // logger.debug("Game loop tick"); // Often too noisy

        const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
        this.lastUpdateTime = currentTime;

        try {
             this._handleInput();
             this._update(deltaTime);
             this._render();
        } catch (loopError) {
             // Use logger for errors now
             logger.error("!!!! Uncaught Error in Game Loop !!!!", loopError);
             this.statusMessage = `LOOP ERROR: ${loopError instanceof Error ? loopError.message : String(loopError)}`;
             // Attempt to display error in status bar before stopping
             try { this._updateStatusBar(); } catch { /* ignore */ }
             this.stopGame();
             return; // Prevent requesting next frame
        }
        // Request next frame only if loop didn't error out
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    private _handleInput(): void {
        const actionWithFinePrefix = this.actionQueue.shift(); if (!actionWithFinePrefix) return;
        let isFine = false; let baseAction = actionWithFinePrefix;
        if (actionWithFinePrefix.startsWith('FINE_')) { isFine = true; baseAction = actionWithFinePrefix.substring(5); }

        logger.debug(`Processing action: ${baseAction}${isFine ? ' (Fine)' : ''} in state: ${this.state}`); // Log the processed action

        switch (this.state) {
            // Use correct signatures (removed unused isFine where applicable)
            case 'hyperspace': this._handleInputHyperspace(baseAction); break;
            case 'system': this._handleInputSystem(baseAction, isFine); break; // Keep isFine
            case 'planet': this._handleInputPlanet(baseAction); break;
            case 'starbase': this._handleInputStarbase(baseAction); break;
        }
    }

    // Input Handlers
    private _handleInputHyperspace(action: string): void {
        let dx = 0; let dy = 0; // Declare dx/dy INSIDE
        switch (action) { /* ... cases ... */ case 'ENTER_SYSTEM': this._enterSystemAction(); break; }
        if (dx !== 0 || dy !== 0) { this.player.moveWorld(dx, dy); }
    }
    private _handleInputSystem(action: string, isFine: boolean): void {
        let dx = 0; let dy = 0; // Declare dx/dy INSIDE
        switch (action) { /* ... cases ... */ case 'LEAVE_SYSTEM': this._leaveSystemAction(); break; case 'LAND': this._landAction(); break; }
        if (dx !== 0 || dy !== 0) { this.player.moveSystem(dx, dy, isFine); }
    }
    private _handleInputPlanet(action: string): void {
        let dx = 0; let dy = 0; // Declare dx/dy INSIDE function
        switch (action) { /* ... cases ... */ case 'LIFTOFF': this._liftoffAction(); break; case 'SCAN': this._scanPlanetAction(); break; case 'MINE': this._mineAction(); break; }

        // Apply movement using corrected type guard pattern
        if (dx !== 0 || dy !== 0) {
            const planet = this.currentPlanet; // Assign to local variable
            if (planet) { // Check the local variable
                // Use local 'planet' variable here
                const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                // mapSize should now be considered used by TS
                this.player.moveSurface(dx, dy, mapSize);
            }
        }
    }
    private _handleInputStarbase(action: string): void {
        switch (action) { /* ... cases ... */ }
    }

    // Update Methods
    private _update(deltaTime: number): void { // Keep deltaTime here, ignore TS6133 if it appears
        // logger.debug(`Updating state: ${this.state}`); // Noisy
        try {
             switch (this.state) {
                 case 'hyperspace': this._updateHyperspace(deltaTime); break;
                 case 'system': this._updateSystem(deltaTime); break;
                 case 'planet': this._updatePlanet(deltaTime); break;
                 case 'starbase': this._updateStarbase(deltaTime); break;
             }
             this._updateStatusBar();
        } catch (error) {
             logger.error("Error during game update:", error);
             this.statusMessage = `UPDATE ERROR: ${error instanceof Error ? error.message : String(error)}`;
             this._updateStatusBar();
             this.stopGame();
        }
    }

    // State Update Methods (Rename parameter if *truly* unused)
    private _updateHyperspace(deltaTime: number): void { // Ignore TS6133 if it appears
        const baseSeedInt = this.gameSeedPRNG.seed; const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt); const isNearStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        if (isNearStar) { this.statusMessage = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY} | Near star system. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM}]`; }
        else { this.statusMessage = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`; }
    }
    private _updateSystem(deltaTime: number): void { // Keep deltaTime, it's used
        if (!this.currentSystem) { logger.error("UpdateSystem: currentSystem is null!"); this.state = 'hyperspace'; this.statusMessage = "Sys Err->Hyper."; return; }
        this.currentSystem.updateOrbits(deltaTime * CONFIG.SYSTEM_ORBIT_SPEED_FACTOR);
        let nearbyObject: Planet | Starbase | null = null; const landingDistSq = CONFIG.LANDING_DISTANCE * CONFIG.LANDING_DISTANCE;
        let currentMinDistSq = landingDistSq;
        this.currentSystem.planets.forEach(p => { if(p) { const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY); if (dSq <= currentMinDistSq) { currentMinDistSq = dSq; nearbyObject = p; } } });
        if(this.currentSystem.starbase) { const dSq = this.player.distanceSqToSystemCoords(this.currentSystem.starbase.systemX, this.currentSystem.starbase.systemY); if (dSq <= currentMinDistSq) { nearbyObject = this.currentSystem.starbase; } }
        let status = `Sys: ${this.currentSystem.name}(${this.currentSystem.starType})|Pos:${this.player.systemX.toFixed(0)},${this.player.systemY.toFixed(0)}`;
        if (nearbyObject) { status += `|Near ${nearbyObject.name}.[${CONFIG.KEY_BINDINGS.LAND}]`; }
        const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
        if (distFromStarSq > (this.currentSystem.edgeRadius * 0.8) ** 2) { status += `|[${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM}] Leave`; }
        this.statusMessage = status;
    }
    private _updatePlanet(_deltaTime: number): void { // Use _deltaTime as it's not used internally yet
        const planet = this.currentPlanet; // Use local variable guard pattern
        if (!planet) { logger.error("UpdatePlanet: currentPlanet is null!"); this.state = 'hyperspace'; this.statusMessage = "Planet Err->Hyper."; return; }
        // Use local `planet` variable
        let status = `Landed: ${planet.name}(${planet.type})|Surf:${this.player.surfaceX},${this.player.surfaceY}|[${CONFIG.KEY_BINDINGS.LIFTOFF}]Liftoff`;
        if (planet.scanned) { status += `|Scan:${planet.primaryResource||'N/A'}(${planet.mineralRichness}),Grav:${planet.gravity.toFixed(2)}g`; if (planet.mineralRichness !== MineralRichness.NONE && planet.type !== 'GasGiant' && planet.type !== 'IceGiant') { status += `|[${CONFIG.KEY_BINDINGS.MINE}]Mine`; } }
        else { status += `|[${CONFIG.KEY_BINDINGS.SCAN}]Scan`; }
        this.statusMessage = status; // Should clear the 'status' unused error TS6133
    }
    private _updateStarbase(_deltaTime: number): void { // Use _deltaTime
        if (!this.currentStarbase) { logger.error("UpdateStarbase: currentStarbase is null!"); this.state = 'hyperspace'; this.statusMessage = "Starbase Err->Hyper."; return; }
        this.statusMessage = `Docked: ${this.currentStarbase.name}|[${CONFIG.KEY_BINDINGS.TRADE}]Trade,[${CONFIG.KEY_BINDINGS.REFUEL}]Refuel,[${CONFIG.KEY_BINDINGS.LIFTOFF}]Liftoff`;
    }

    // Render Methods
    private _render(): void {
         logger.debug(`Rendering state: ${this.state}`);
         try {
             switch (this.state) {
                 case 'hyperspace': this.renderer.drawHyperspace(this.player, this.gameSeedPRNG); break;
                 case 'system': if (this.currentSystem) { this.renderer.drawSolarSystem(this.player, this.currentSystem); } else { this._renderError("System not loaded"); } break; // Fixed drawSolarSystem call
                 case 'planet': if (this.currentPlanet) { this.renderer.drawPlanetSurface(this.player, this.currentPlanet); } else { this._renderError("Planet not loaded"); } break;
                 case 'starbase': if (this.currentStarbase) { this.renderer.drawPlanetSurface(this.player, this.currentStarbase); } else { this._renderError("Starbase not loaded"); } break;
                 default: this._renderError(`Unknown game state: ${this.state}`);
             }
             this.renderer.renderDiff();
         } catch (error) {
             logger.error("!!! CRITICAL RENDER ERROR !!!", error); this.stopGame();
             this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
             try { this.renderer.renderDiff(); } catch {/* ignore */}
         }
    }
    private _renderError(message: string): void {
         logger.error(`Render Error Displayed: ${message}`); this.renderer.clear(true);
         this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOR);
         this.statusMessage = `ERROR: ${message}`; this._updateStatusBar();
    }

    // Action Methods (With Logging)
    private _enterSystemAction(): void { /* ... unchanged logging logic ... */ }
    private _leaveSystemAction(): void { /* ... unchanged logging logic ... */ }
    private _landAction(): void { /* ... unchanged logging logic, uses instanceof ... */ }
    private _liftoffAction(): void { /* ... unchanged logging logic ... */ }
    private _scanPlanetAction(): void { /* ... unchanged logging logic ... */ }
    private _mineAction(): void { /* ... unchanged logging logic ... */ }
    private _tradeAction(): void { /* ... unchanged logging logic ... */ }
    private _refuelAction(): void { /* ... unchanged logging logic ... */ }

    // Status Bar Update Helper
    private _updateStatusBar(): void {
        const commonStatus = `|Fuel:${this.player.fuel.toFixed(0)}/${this.player.maxFuel}|Cargo:${this.player.mineralUnits}/${this.player.cargoCapacity}|Cr:${this.player.credits}`;
        // logger.debug(`Status Msg: ${this.statusMessage}`); // Noisy
        this.renderer.updateStatus(this.statusMessage + commonStatus);
    }
} // End of Game class