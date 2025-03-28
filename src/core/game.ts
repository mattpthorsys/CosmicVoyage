// src/core/game.ts (With Logging)

import { Renderer } from '../rendering/renderer';
// import { InputManager } from './input_manager'; // Proper InputManager needed later
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
// No longer importing generateSystem
import { CONFIG } from '../config';
import { MineralRichness } from '../constants'; // Keep for status updates
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger'; // Import the logger

// Define the possible game states
export type GameState = 'hyperspace' | 'system' | 'planet' | 'starbase';

export class Game {
    private readonly renderer: Renderer;
    // private readonly inputManager: InputManager;
    private readonly player: Player;
    private readonly gameSeedPRNG: PRNG;

    private state: GameState;
    private currentSystem: SolarSystem | null = null;
    private currentPlanet: Planet | null = null;
    private currentStarbase: Starbase | null = null;

    private lastUpdateTime: number = 0;
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;

    // --- Temporary Input Handling ---
    private keysPressed: Set<string> = new Set();
    private actionQueue: string[] = [];
    // --- End Temporary Input Handling ---

    // --- Status Message Handling ---
    private statusMessage: string = "Initializing Systems...";
    // --- End Status Message Handling ---

    constructor(
        canvasId: string,
        statusBarId: string,
        seed?: string | number
    ) {
        const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
        this.gameSeedPRNG = new PRNG(initialSeed); // PRNG uses logger internally now (if added)
        // No need to log seed here, PRNG constructor can do it

        logger.info("Constructing Game...");
        this.renderer = new Renderer(canvasId, statusBarId); // Renderer uses logger
        // this.inputManager = new InputManager(); // TODO: Add later
        this.player = new Player();

        this.state = 'hyperspace';
        logger.debug(`Initial game state: ${this.state}`);

        this._setupTempInput();
        window.addEventListener('resize', this._handleResize.bind(this));
        this._handleResize(); // Initial fit

        logger.info("Game constructed successfully.");
    }

    // --- Temporary Input Handling Methods --- (Logging inside if needed later)
    private _setupTempInput(): void {
         logger.debug("Setting up temporary input listeners...");
         window.addEventListener('keydown', (e: KeyboardEvent) => { /* ... keydown logic ... */ this._queueActionFromKey(e.key, e.shiftKey); /* ... preventDefault ... */ });
         window.addEventListener('keyup', (e: KeyboardEvent) => { this.keysPressed.delete(e.key); });
         logger.debug("Temporary input listeners attached.");
    }
    private _queueActionFromKey(key: string, isShiftDown: boolean): void { /* ... unchanged logic ... */ }
    // --- End Temporary Input Handling ---

    startGame(): void {
        if (this.isRunning) { logger.warn("startGame called but game is already running."); return; }
        logger.info("Starting game loop...");
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
        this.keysPressed.clear(); this.actionQueue = [];
        // Initial update to set status bar before first render
        this._update(0); // Call update once with 0 delta time
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    stopGame(): void {
        if (!this.isRunning) { return; }
        logger.info("Stopping game loop...");
        this.isRunning = false;
        if (this.animationFrameId !== null) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        // Cleanup temporary listeners if possible, or InputManager later
        this.renderer.updateStatus("Game stopped. Refresh to restart."); // Final status
        logger.info("Game loop stopped.");
    }

    private _handleResize(): void {
         logger.debug("Handling window resize...");
         this.renderer.fitToScreen();
         if (this.isRunning) { this._render(); logger.debug("Re-rendered after resize.");}
         this.lastUpdateTime = performance.now();
    }

    private _loop(currentTime: DOMHighResTimeStamp): void {
        if (!this.isRunning) return;
        // Log loop start infrequently if needed for performance debugging
        // logger.debug("Game loop tick");

        const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
        this.lastUpdateTime = currentTime;
        // logger.debug(`DeltaTime: ${deltaTime.toFixed(4)}s`); // Can be very noisy

        this._handleInput();
        this._update(deltaTime);
        this._render();

        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    private _handleInput(): void {
        const actionWithFinePrefix = this.actionQueue.shift(); if (!actionWithFinePrefix) return;
        let isFine = false; let baseAction = actionWithFinePrefix;
        if (actionWithFinePrefix.startsWith('FINE_')) { isFine = true; baseAction = actionWithFinePrefix.substring(5); }

        // Log processed action
        logger.debug(`Processing action: ${baseAction}${isFine ? ' (Fine)' : ''} in state: ${this.state}`);

        switch (this.state) { /* ... unchanged calls to state handlers ... */
            case 'hyperspace': this._handleInputHyperspace(baseAction); break;
            case 'system': this._handleInputSystem(baseAction, isFine); break;
            case 'planet': this._handleInputPlanet(baseAction); break;
            case 'starbase': this._handleInputStarbase(baseAction); break;
        }
    }

    // --- State-Specific Input Handlers (Add minimal logging if needed) ---
    private _handleInputHyperspace(action: string): void {
         let dx = 0; let dy = 0; // Declare dx/dy INSIDE
         switch (action) { /* ... cases ... */ case 'ENTER_SYSTEM': this._enterSystemAction(); break; }
         if (dx !== 0 || dy !== 0) { /*logger.debug(`Moving hyperspace by ${dx},${dy}`);*/ this.player.moveWorld(dx, dy); }
     }
     private _handleInputSystem(action: string, isFine: boolean): void {
         let dx = 0; let dy = 0; // Declare dx/dy INSIDE
         switch (action) { /* ... cases ... */ case 'LEAVE_SYSTEM': this._leaveSystemAction(); break; case 'LAND': this._landAction(); break; }
         if (dx !== 0 || dy !== 0) { /*logger.debug(`Moving system by ${dx},${dy} (Fine: ${isFine})`);*/ this.player.moveSystem(dx, dy, isFine); }
     }
     private _handleInputPlanet(action: string): void {
         let dx = 0; let dy = 0; // Declare dx/dy INSIDE
         switch (action) { /* ... cases ... */ case 'LIFTOFF': this._liftoffAction(); break; case 'SCAN': this._scanPlanetAction(); break; case 'MINE': this._mineAction(); break; }
         if (dx !== 0 || dy !== 0) {
             const planet = this.currentPlanet; if (planet) { const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE; /*logger.debug(`Moving surface by ${dx},${dy}`);*/ this.player.moveSurface(dx, dy, mapSize); }
         }
     }
     private _handleInputStarbase(action: string): void { /* ... unchanged calls to action methods ... */
          switch (action) { case 'TRADE': this._tradeAction(); break; case 'REFUEL': this._refuelAction(); break; case 'LIFTOFF': this._liftoffAction(); break; }
      }

    // --- Update Methods ---
    private _update(deltaTime: number): void {
         // logger.debug(`Updating state: ${this.state}`); // Can be noisy
         try {
              switch (this.state) {
                  case 'hyperspace': this._updateHyperspace(deltaTime); break;
                  case 'system': this._updateSystem(deltaTime); break;
                  case 'planet': this._updatePlanet(deltaTime); break; // Pass original deltaTime
                  case 'starbase': this._updateStarbase(deltaTime); break; // Pass original deltaTime
              }
              this._updateStatusBar(); // Update status message buffer
         } catch (error) {
              logger.error("Error during game update:", error);
              // Potentially try to recover or stop the game
              this.statusMessage = `UPDATE ERROR: ${error instanceof Error ? error.message : String(error)}`;
              this._updateStatusBar(); // Show error in status bar
              this.stopGame();
         }
    }
    // --- State-Specific Update Methods --- (Keep deltaTime, rename if truly unused)
    private _updateHyperspace(deltaTime: number): void { /* ... unchanged star check logic ... */ }
    private _updateSystem(deltaTime: number): void { /* ... unchanged orbit update and nearby object check ... */ }
    private _updatePlanet(_deltaTime: number): void { /* Renamed param, unchanged status message logic */
         const planet = this.currentPlanet; if (!planet) { logger.error("UpdatePlanet: currentPlanet is null!"); this.state = 'hyperspace'; this.statusMessage = "Planet Err->Hyper."; return; }
         let status = `Landed: ${planet.name}(${planet.type})|Surf:${this.player.surfaceX},${this.player.surfaceY}|[${CONFIG.KEY_BINDINGS.LIFTOFF}]Liftoff`;
         if (planet.scanned) { status += `|Scan:${planet.primaryResource||'N/A'}(${planet.mineralRichness}),Grav:${planet.gravity.toFixed(2)}g`; if (planet.mineralRichness !== MineralRichness.NONE && planet.type !== 'GasGiant' && planet.type !== 'IceGiant') { status += `|[${CONFIG.KEY_BINDINGS.MINE}]Mine`; } }
         else { status += `|[${CONFIG.KEY_BINDINGS.SCAN}]Scan`; } this.statusMessage = status;
     }
    private _updateStarbase(_deltaTime: number): void { /* Renamed param, unchanged status message logic */
         if (!this.currentStarbase) { logger.error("UpdateStarbase: currentStarbase is null!"); this.state = 'hyperspace'; this.statusMessage = "Starbase Err->Hyper."; return; }
         this.statusMessage = `Docked: ${this.currentStarbase.name}|[${CONFIG.KEY_BINDINGS.TRADE}]Trade,[${CONFIG.KEY_BINDINGS.REFUEL}]Refuel,[${CONFIG.KEY_BINDINGS.LIFTOFF}]Liftoff`;
    }

    // --- Render Method ---
    private _render(): void {
        // logger.debug(`Rendering state: ${this.state}`); // Can be noisy
        try {
            switch (this.state) {
                case 'hyperspace': this.renderer.drawHyperspace(this.player, this.gameSeedPRNG); break;
                case 'system':
                     if (this.currentSystem) { this.renderer.drawSolarSystem(this.player, this.currentSystem); } // Corrected call
                     else { this._renderError("System not loaded"); } break;
                case 'planet':
                     if (this.currentPlanet) { this.renderer.drawPlanetSurface(this.player, this.currentPlanet); }
                     else { this._renderError("Planet not loaded"); } break;
                case 'starbase':
                     if (this.currentStarbase) { this.renderer.drawPlanetSurface(this.player, this.currentStarbase); }
                     else { this._renderError("Starbase not loaded"); } break;
                default: this._renderError(`Unknown game state: ${this.state}`);
            }
            this.renderer.renderDiff(); // Apply changes to canvas
        } catch (error) {
            logger.error("!!! CRITICAL RENDER ERROR !!!", error); this.stopGame();
            this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
            try { this.renderer.renderDiff(); } catch { /* Ignore errors during error rendering */ }
        }
    }
    private _renderError(message: string): void { /* ... unchanged ... */ }

    // --- Action Methods (Add Logging) ---
    private _enterSystemAction(): void {
        if (this.state !== 'hyperspace') return;
        const baseSeedInt = this.gameSeedPRNG.seed; const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt); const isNearStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        if (isNearStar) {
            logger.info(`Entering system at ${this.player.worldX}, ${this.player.worldY}`);
            try {
                this.currentSystem = new SolarSystem(this.player.worldX, this.player.worldY, this.gameSeedPRNG);
                this.state = 'system'; this.currentPlanet = null; this.currentStarbase = null;
                this.player.systemX = -this.currentSystem.edgeRadius * 0.9; this.player.systemY = 0;
                this.player.moveSystem(1, 0); // Face towards center
                this.statusMessage = `Entered ${this.currentSystem.name}`;
                logger.info(`State changed to: ${this.state}. System: ${this.currentSystem.name}`);
                this.renderer.clear(true);
            } catch (error) { logger.error("Failed to create SolarSystem:", error); this.statusMessage = `Error entering system: ${error instanceof Error ? error.message : String(error)}`; this.currentSystem = null; }
        } else { logger.debug("No star system close enough to enter."); this.statusMessage = "No star system close enough to enter."; }
    }

    private _leaveSystemAction(): void {
        if (this.state !== 'system' || !this.currentSystem) return;
        const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
        if (distFromStarSq <= (this.currentSystem.edgeRadius * 0.8) ** 2) { this.statusMessage = "Too close to star to leave."; return; }
        logger.info(`Leaving system ${this.currentSystem.name}.`); this.state = 'hyperspace';
        const oldSystemName = this.currentSystem.name; this.currentSystem = null; this.currentPlanet = null; this.currentStarbase = null;
        this.statusMessage = `Left ${oldSystemName}. Entered hyperspace.`;
        logger.info(`State changed to: ${this.state}.`);
        this.renderer.clear(true);
    }

    private _landAction(): void {
        if (this.state !== 'system' || !this.currentSystem) return;
        let targetObject: Planet | Starbase | null = null; let minDistSq = CONFIG.LANDING_DISTANCE * CONFIG.LANDING_DISTANCE;
        this.currentSystem.planets.forEach(p => { if(p) { const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY); if (dSq <= minDistSq) { minDistSq = dSq; targetObject = p; } } });
        if(this.currentSystem.starbase) { const dSq = this.player.distanceSqToSystemCoords(this.currentSystem.starbase.systemX, this.currentSystem.starbase.systemY); if (dSq <= minDistSq) { targetObject = this.currentSystem.starbase; } }
        if (targetObject) {
            logger.info(`Attempting landing on ${targetObject.name} (${targetObject.type}).`);
            try {
                 targetObject.ensureSurfaceReady(); // Renderer logs success/failure of this
                 if (targetObject instanceof Starbase) {
                      this.state = 'starbase'; this.currentStarbase = targetObject; this.currentPlanet = null;
                      this.player.surfaceX = 0; this.player.surfaceY = 0; this.statusMessage = `Docked at ${this.currentStarbase.name}.`;
                      logger.info(`State changed to: ${this.state}. Target: ${this.currentStarbase.name}`);
                 } else {
                      this.state = 'planet'; this.currentPlanet = targetObject; this.currentStarbase = null;
                      const mapSize = this.currentPlanet.heightmap?.length || CONFIG.PLANET_MAP_BASE_SIZE;
                      this.player.surfaceX = Math.floor(mapSize / 2); this.player.surfaceY = Math.floor(mapSize / 2); this.statusMessage = `Landed on ${this.currentPlanet.name}.`;
                      logger.info(`State changed to: ${this.state}. Target: ${this.currentPlanet.name}`);
                 }
                 this.renderer.clear(true);
            } catch(error) { logger.error(`Error preparing landing on ${targetObject.name}:`, error); this.statusMessage = `Landing failed: ${error instanceof Error ? error.message : String(error)}`; }
        } else { logger.debug("No object close enough to land on."); this.statusMessage = "Nothing close enough to land on."; }
    }

    private _liftoffAction(): void {
        const originObject = this.currentPlanet || this.currentStarbase;
        if ((this.state !== 'planet' && this.state !== 'starbase') || !originObject || !this.currentSystem) {
             logger.error("Cannot liftoff - invalid state or missing object/system refs!", { state: this.state, originObject, currentSystem: this.currentSystem });
             this.state = 'hyperspace'; this.currentSystem = null; this.currentPlanet = null; this.currentStarbase = null; this.statusMessage = "Liftoff error->Hyper."; this.renderer.clear(true); return;
        }
        logger.info(`Lifting off from ${originObject.name}.`); this.state = 'system';
        const liftDist = CONFIG.LANDING_DISTANCE * 1.1; const liftAngle = this.gameSeedPRNG.random(0, Math.PI * 2);
        this.player.systemX = originObject.systemX + Math.cos(liftAngle) * liftDist; this.player.systemY = originObject.systemY + Math.sin(liftAngle) * liftDist;
        this.player.moveSystem(Math.cos(liftAngle), Math.sin(liftAngle));
        const originName = originObject.name; this.currentPlanet = null; this.currentStarbase = null;
        this.statusMessage = `Ascending from ${originName}.`;
        logger.info(`State changed to: ${this.state}.`);
        this.renderer.clear(true);
    }

    private _scanPlanetAction(): void {
        if (this.state !== 'planet' || !this.currentPlanet) { logger.warn("Scan action invalid in current state."); return; }
        if (this.currentPlanet.scanned) { logger.debug("Planet already scanned."); this.statusMessage = `${this.currentPlanet.name} already scanned.`; return; }
        logger.info(`Scanning planet ${this.currentPlanet.name}...`);
        try { this.currentPlanet.scan(); this.statusMessage = `Scan Complete: ${this.currentPlanet.primaryResource}(${this.currentPlanet.mineralRichness})`; }
        catch (error) { logger.error(`Error scanning ${this.currentPlanet.name}:`, error); this.statusMessage = `Scan failed: ${error instanceof Error ? error.message : String(error)}`; }
    }

    private _mineAction(): void {
        if (this.state !== 'planet' || !this.currentPlanet) { logger.warn("Mine action invalid in current state."); return; }
        // ... (checks for gas giant, richness, scanned, cargo) ...
        if (this.currentPlanet.type === 'GasGiant' || this.currentPlanet.type === 'IceGiant') { this.statusMessage = "Cannot mine gas giants."; return; }
        if (this.currentPlanet.mineralRichness === MineralRichness.NONE) { this.statusMessage = "No minerals detected."; return; }
        if (!this.currentPlanet.scanned) { this.statusMessage = "Scan required before mining."; return; }
        if (this.player.mineralUnits >= this.player.cargoCapacity) { this.statusMessage = "Cargo hold full."; return; }
        // ... (yield calculation) ...
        let yieldFactor = 0; switch(this.currentPlanet.mineralRichness){ case MineralRichness.POOR:yieldFactor=0.5;break; case MineralRichness.AVERAGE:yieldFactor=1.0;break; case MineralRichness.RICH:yieldFactor=2.0;break; case MineralRichness.EXCEPTIONAL:yieldFactor=4.0;break; }
        const baseYield = CONFIG.MINING_RATE_FACTOR*yieldFactor; const actualYield = Math.max(1, Math.round(baseYield * this.gameSeedPRNG.random(0.8, 1.2)));
        const spaceAvailable = this.player.cargoCapacity - this.player.mineralUnits; const minedAmount = Math.min(actualYield, spaceAvailable);
        if (minedAmount > 0) { this.player.mineralUnits += minedAmount; this.statusMessage = `Mined ${minedAmount} units.`; logger.info(`Mined ${minedAmount} units from ${this.currentPlanet.name}. Cargo: ${this.player.mineralUnits}/${this.player.cargoCapacity}`); }
        else { this.statusMessage = "Unable to extract minerals or cargo full."; logger.debug("Mining yielded 0 or cargo full."); }
    }

    private _tradeAction(): void {
        if (this.state !== 'starbase') { logger.warn("Trade action invalid in current state."); return; }
        if (this.player.mineralUnits <= 0) { this.statusMessage = "Cargo hold empty."; logger.debug("Trade attempted with no minerals."); return; }
        const earnings = this.player.mineralUnits * CONFIG.MINERAL_SELL_PRICE;
        // Replace confirm with proper UI later
        logger.info(`Attempting to sell ${this.player.mineralUnits} minerals for ${earnings} Cr.`);
        if (window.confirm(`Sell ${this.player.mineralUnits} units for ${earnings} Cr?`)) { this.player.credits += earnings; this.player.mineralUnits = 0; this.statusMessage = `Sold minerals for ${earnings} Cr.`; logger.info("Trade successful."); }
        else { this.statusMessage = "Trade cancelled."; logger.info("Trade cancelled by user."); }
    }

    private _refuelAction(): void {
        if (this.state !== 'starbase') { logger.warn("Refuel action invalid in current state."); return; }
        const fuelNeeded = this.player.maxFuel - this.player.fuel;
        if (fuelNeeded < 0.1) { this.statusMessage = "Fuel tank full."; logger.debug("Refuel attempted when full."); return; }
        const cost = Math.ceil(fuelNeeded / CONFIG.FUEL_PER_CREDIT);
        if (this.player.credits < cost) { this.statusMessage = `Need ${cost} Cr for full refuel. Have ${this.player.credits} Cr.`; logger.warn(`Refuel failed: Insufficient credits (Need ${cost}, Have ${this.player.credits})`); return; }
        logger.info(`Attempting to buy ${fuelNeeded.toFixed(0)} fuel for ${cost} Cr.`);
        // Replace confirm later
        if (window.confirm(`Refuel ${fuelNeeded.toFixed(0)} units for ${cost} Cr?`)) { this.player.credits -= cost; this.player.fuel = this.player.maxFuel; this.statusMessage = `Refueled. -${cost} Cr.`; logger.info("Refuel successful."); }
        else { this.statusMessage = "Refueling cancelled."; logger.info("Refuel cancelled by user."); }
    }

    // --- Helper to update status bar text ---
    private _updateStatusBar(): void {
        const commonStatus = `|Fuel:${this.player.fuel.toFixed(0)}/${this.player.maxFuel}|Cargo:${this.player.mineralUnits}/${this.player.cargoCapacity}|Cr:${this.player.credits}`;
        // Use logger.debug if status message gets too verbose for INFO level
        // logger.debug(`Updating Status: ${this.statusMessage + commonStatus}`);
        this.renderer.updateStatus(this.statusMessage + commonStatus);
    }
}