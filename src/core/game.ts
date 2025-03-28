// src/core/game.ts (Re-Corrected - Apply this whole file)

import { Renderer } from '../rendering/renderer';
// import { InputManager } from './input_manager'; // Proper InputManager needed later
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase'; // Ensure this file exists and exports Starbase
import { PRNG } from '../utils/prng';
// No longer importing generateSystem - using SolarSystem constructor
import { CONFIG } from '../config'; // Ensure config.ts includes all needed keys
// Removed SPECTRAL_TYPES, PLANET_TYPES from imports here
import { MineralRichness } from '../constants';
import { fastHash } from '../utils/hash';

// Define the possible game states
export type GameState = 'hyperspace' | 'system' | 'planet' | 'starbase';

export class Game {
    private readonly renderer: Renderer;
    // private readonly inputManager: InputManager; // Proper InputManager needed later
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
    private statusMessage: string = "Initializing...";
    // --- End Status Message Handling ---

    constructor(
        canvasId: string,
        statusBarId: string,
        seed?: string | number
    ) {
        const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
        this.gameSeedPRNG = new PRNG(initialSeed);
        console.log(`Game initialized with seed: ${this.gameSeedPRNG.getInitialSeed()}`);

        this.renderer = new Renderer(canvasId, statusBarId);
        // this.inputManager = new InputManager(); // Commented out
        this.player = new Player(); // Uses defaults from CONFIG via constructor

        this.state = 'hyperspace';

        this._setupTempInput(); // Attach temporary listeners
        window.addEventListener('resize', this._handleResize.bind(this));
        this._handleResize(); // Initial fit

        console.log("Game constructed.");
    }

    // --- Temporary Input Handling Methods ---
    private _setupTempInput(): void {
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (this.keysPressed.has(e.key)) return; this.keysPressed.add(e.key);
            this._queueActionFromKey(e.key, e.shiftKey);
            if (Object.values(CONFIG.KEY_BINDINGS).includes(e.key as any)) { e.preventDefault(); }
        });
        window.addEventListener('keyup', (e: KeyboardEvent) => { this.keysPressed.delete(e.key); });
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
        if (this.isRunning) { console.warn("Game already running."); return; }
        console.log("Starting game loop..."); this.isRunning = true; this.lastUpdateTime = performance.now();
        this.keysPressed.clear(); this.actionQueue = [];
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    stopGame(): void {
        if (!this.isRunning) { return; }
        console.log("Stopping game loop..."); this.isRunning = false;
        if (this.animationFrameId !== null) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        // Cleanup temporary listeners if possible, or InputManager later
        this.renderer.updateStatus("Game stopped. Refresh to restart.");
    }

    private _handleResize(): void {
        this.renderer.fitToScreen(); if (this.isRunning) { this._render(); }
        this.lastUpdateTime = performance.now();
    }

    private _loop(currentTime: DOMHighResTimeStamp): void {
        if (!this.isRunning) return;
        const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
        this.lastUpdateTime = currentTime;
        this._handleInput();
        this._update(deltaTime);
        this._render();
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    private _handleInput(): void {
        const actionWithFinePrefix = this.actionQueue.shift(); if (!actionWithFinePrefix) return;
        let isFine = false; let baseAction = actionWithFinePrefix;
        if (actionWithFinePrefix.startsWith('FINE_')) { isFine = true; baseAction = actionWithFinePrefix.substring(5); }
        console.log(`Processing action: ${baseAction}${isFine ? ' (Fine)' : ''} in state: ${this.state}`);
        switch (this.state) {
            // Remove isFine parameter from calls to handlers where it's not needed
            case 'hyperspace': this._handleInputHyperspace(baseAction); break;
            case 'system': this._handleInputSystem(baseAction, isFine); break; // Keep isFine
            case 'planet': this._handleInputPlanet(baseAction); break;
            case 'starbase': this._handleInputStarbase(baseAction); break;
        }
    }

    // --- State-Specific Input Handlers ---
    // Remove isFine parameter signature
    private _handleInputHyperspace(action: string): void {
        let dx = 0; let dy = 0; // Declare dx/dy INSIDE
        switch (action) {
            case 'MOVE_UP': dy = -1; break; case 'MOVE_DOWN': dy = 1; break;
            case 'MOVE_LEFT': dx = -1; break; case 'MOVE_RIGHT': dx = 1; break;
            case 'ENTER_SYSTEM': this._enterSystemAction(); break;
        }
        if (dx !== 0 || dy !== 0) { this.player.moveWorld(dx, dy); }
    }

    // Keep isFine parameter signature
    private _handleInputSystem(action: string, isFine: boolean): void {
        let dx = 0; let dy = 0; // Declare dx/dy INSIDE
        switch (action) {
            case 'MOVE_UP': dy = -1; break; case 'MOVE_DOWN': dy = 1; break;
            case 'MOVE_LEFT': dx = -1; break; case 'MOVE_RIGHT': dx = 1; break;
            case 'LEAVE_SYSTEM': this._leaveSystemAction(); break;
            case 'LAND': this._landAction(); break;
        }
        if (dx !== 0 || dy !== 0) { this.player.moveSystem(dx, dy, isFine); }
    }

    // Remove isFine parameter signature
    private _handleInputPlanet(action: string): void {
        let dx = 0; let dy = 0; // Declare dx/dy INSIDE function
        switch (action) {
            case 'MOVE_UP': dy = -1; break;
            case 'MOVE_DOWN': dy = 1; break;
            case 'MOVE_LEFT': dx = -1; break;
            case 'MOVE_RIGHT': dx = 1; break;
            case 'LIFTOFF': this._liftoffAction(); break;
            case 'SCAN': this._scanPlanetAction(); break;
            case 'MINE': this._mineAction(); break;
        }
    
        // Apply movement using refactored type guard
        if (dx !== 0 || dy !== 0) {
            const planet = this.currentPlanet; // Assign to local variable
            if (planet) { // Check the local variable (acts as type guard)
                // Access properties via the local 'planet' variable
                // Remove the '!' assertion
                const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                // This usage should now clear the TS6133 for mapSize
                this.player.moveSurface(dx, dy, mapSize);
            }
        }
    }

    private _handleInputStarbase(action: string): void {
        switch (action) {
            case 'TRADE': this._tradeAction(); break; case 'REFUEL': this._refuelAction(); break;
            case 'LIFTOFF': this._liftoffAction(); break;
        }
    }

    private _update(deltaTime: number): void {
        switch (this.state) {
             // Rename parameter to _deltaTime where not used
            case 'hyperspace': this._updateHyperspace(deltaTime); break; // deltaTime IS used here for check logic (conceptually)
            case 'system': this._updateSystem(deltaTime); break; // Keep deltaTime
            case 'planet': this._updatePlanet(deltaTime); break; // Keep deltaTime? Or rename? Rename for now.
            case 'starbase': this._updateStarbase(deltaTime); break; // Keep deltaTime? Or rename? Rename for now.
        }
        this._updateStatusBar();
    }

    // --- State-Specific Update Methods ---
    // Parameter can remain deltaTime if we consider the check part of the update cycle
    private _updateHyperspace(deltaTime: number): void {
        const baseSeedInt = this.gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
        const isNearStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        if (isNearStar) { this.statusMessage = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY} | Near star system. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM}]`; }
        else { this.statusMessage = `Hyperspace | Loc: ${this.player.worldX},${this.player.worldY}`; }
    }

    // Keep deltaTime parameter as it IS used by updateOrbits
    private _updateSystem(deltaTime: number): void {
        if (!this.currentSystem) { this.state = 'hyperspace'; this.statusMessage = "Sys Err->Hyper."; return; }
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

    // Rename deltaTime parameter to signal not currently used
    private _updatePlanet(_deltaTime: number): void { // Keep _deltaTime parameter rename
        const planet = this.currentPlanet; // Assign to local variable first
        if (!planet) { // Check the local variable
            console.error("In 'planet' state but currentPlanet is null! Attempting recovery.");
            this.state = 'hyperspace';
            this.statusMessage = "Planet error. Reverted to hyperspace.";
            return;
        }
    
        // Now use 'planet' which TypeScript knows is not null here
        // Remove the '!' assertions
        let status = `Landed: <span class="math-inline">\{planet\.name\}\(</span>{planet.type}) | Surf Pos: <span class="math-inline">\{this\.player\.surfaceX\},</span>{this.player.surfaceY}`;
        status += ` | [${CONFIG.KEY_BINDINGS.LIFTOFF}] Liftoff`;
    
        if (planet.scanned) {
            status += ` | Scan: <span class="math-inline">\{planet\.primaryResource \|\| 'None'\} \(</span>{planet.mineralRichness}), Grav: ${planet.gravity.toFixed(2)}g`;
            if (planet.mineralRichness !== MineralRichness.NONE && planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
                 status += ` | [${CONFIG.KEY_BINDINGS.MINE}] Mine`;
            }
        } else {
            status += ` | [${CONFIG.KEY_BINDINGS.SCAN}] Scan`;
        }
        // This usage should now clear the TS6133 for status
        this.statusMessage = status;
    }

    // Rename deltaTime parameter to signal not currently used
    private _updateStarbase(_deltaTime: number): void {
        if (!this.currentStarbase) { this.state = 'hyperspace'; this.statusMessage = "Starbase Err->Hyper."; return; }
        this.statusMessage = `Docked: ${this.currentStarbase.name}|[${CONFIG.KEY_BINDINGS.TRADE}] Trade,[${CONFIG.KEY_BINDINGS.REFUEL}] Refuel,[${CONFIG.KEY_BINDINGS.LIFTOFF}] Liftoff`;
    }

    private _render(): void {
        try {
             switch (this.state) {
                 case 'hyperspace':
                     this.renderer.drawHyperspace(this.player, this.gameSeedPRNG);
                     break;
                 case 'system':
                     if (this.currentSystem) {
                         // REMOVE 3rd argument (gameSeedPRNG) from this call
                         this.renderer.drawSolarSystem(this.player, this.currentSystem);
                     } else { this._renderError("System not loaded"); }
                     break;
                 case 'planet':
                     if (this.currentPlanet) { this.renderer.drawPlanetSurface(this.player, this.currentPlanet); }
                     else { this._renderError("Planet not loaded"); }
                     break;
                 case 'starbase':
                      if (this.currentStarbase) { this.renderer.drawPlanetSurface(this.player, this.currentStarbase); }
                      else { this._renderError("Starbase not loaded"); }
                     break;
                 default: this._renderError(`Unknown game state: ${this.state}`);
             }
             this.renderer.renderDiff();
        } catch (error) {
             console.error("!!! CRITICAL RENDER ERROR !!!", error); this.stopGame();
             this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
             this.renderer.renderDiff(); // Try to show error
        }
    }

    private _renderError(message: string): void {
        console.error(`Render Error: ${message}`); this.renderer.clear(true);
        this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOR);
        this.statusMessage = `ERROR: ${message}`;
    }

    // --- Action Methods ---
    private _enterSystemAction(): void {
        if (this.state !== 'hyperspace') return;
        const baseSeedInt = this.gameSeedPRNG.seed; const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt); const isNearStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        if (isNearStar) {
            console.log(`Entering system at ${this.player.worldX}, ${this.player.worldY}`);
            try {
                // Use SolarSystem constructor directly
                this.currentSystem = new SolarSystem(this.player.worldX, this.player.worldY, this.gameSeedPRNG);
                this.state = 'system'; this.currentPlanet = null; this.currentStarbase = null;
                this.player.systemX = -this.currentSystem.edgeRadius * 0.9; this.player.systemY = 0;
                this.player.moveSystem(1, 0); // Face towards center
                this.statusMessage = `Entered ${this.currentSystem.name}`; this.renderer.clear(true);
            } catch (error) { console.error("Failed to create SolarSystem:", error); this.statusMessage = `Error entering system: ${error instanceof Error ? error.message : String(error)}`; this.currentSystem = null; }
        } else { this.statusMessage = "No star system close enough to enter."; }
    }

    private _leaveSystemAction(): void {
        if (this.state !== 'system' || !this.currentSystem) return;
        const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
        if (distFromStarSq <= (this.currentSystem.edgeRadius * 0.8) ** 2) { this.statusMessage = "Too close to star to leave."; return; }
        console.log(`Leaving system ${this.currentSystem.name}.`); this.state = 'hyperspace';
        this.currentSystem = null; this.currentPlanet = null; this.currentStarbase = null;
        this.statusMessage = "Entered hyperspace."; this.renderer.clear(true);
    }

    private _landAction(): void {
        if (this.state !== 'system' || !this.currentSystem) return;
        let targetObject: Planet | Starbase | null = null; let minDistSq = CONFIG.LANDING_DISTANCE * CONFIG.LANDING_DISTANCE;
        this.currentSystem.planets.forEach(p => { if(p) { const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY); if (dSq <= minDistSq) { minDistSq = dSq; targetObject = p; } } });
        if(this.currentSystem.starbase) { const dSq = this.player.distanceSqToSystemCoords(this.currentSystem.starbase.systemX, this.currentSystem.starbase.systemY); if (dSq <= minDistSq) { targetObject = this.currentSystem.starbase; } }
        if (targetObject) {
            console.log(`Initiating landing sequence on ${targetObject.name}.`);
            try {
                 targetObject.ensureSurfaceReady();
                 // Use instanceof for safer type checking
                 if (targetObject instanceof Starbase) {
                      this.state = 'starbase'; this.currentStarbase = targetObject; this.currentPlanet = null;
                      this.player.surfaceX = 0; this.player.surfaceY = 0; this.statusMessage = `Docked at ${this.currentStarbase.name}.`;
                 } else {
                      this.state = 'planet'; this.currentPlanet = targetObject; this.currentStarbase = null;
                      const mapSize = this.currentPlanet!.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
                      let status = `Landed: <span class="math-inline">\{this\.currentPlanet\!\.name\}\(</span>{this.currentPlanet!.type}) | Surf Pos: <span class="math-inline">\{this\.player\.surfaceX\},</span>{this.player.surfaceY}`;
                 }
                 this.renderer.clear(true);
            } catch(error) { console.error(`Error preparing landing on ${targetObject.name}:`, error); this.statusMessage = `Landing failed: ${error instanceof Error ? error.message : String(error)}`; }
        } else { this.statusMessage = "Nothing close enough to land on."; }
    }

    private _liftoffAction(): void {
        if (this.state !== 'planet' && this.state !== 'starbase') return;
        const originObject = this.currentPlanet || this.currentStarbase;
        if (!originObject || !this.currentSystem) { console.error("Liftoff error!"); this.state = 'hyperspace'; this.currentSystem = null; this.currentPlanet = null; this.currentStarbase = null; this.statusMessage = "Liftoff error->Hyper."; this.renderer.clear(true); return; }
        console.log(`Lifting off from ${originObject.name}.`); this.state = 'system';
        const liftDist = CONFIG.LANDING_DISTANCE * 1.1; const liftAngle = this.gameSeedPRNG.random(0, Math.PI * 2);
        this.player.systemX = originObject.systemX + Math.cos(liftAngle) * liftDist; this.player.systemY = originObject.systemY + Math.sin(liftAngle) * liftDist;
        this.player.moveSystem(Math.cos(liftAngle), Math.sin(liftAngle)); // Set char/direction
        this.currentPlanet = null; this.currentStarbase = null; this.statusMessage = `Ascending from ${originObject.name}.`; this.renderer.clear(true);
    }

    private _scanPlanetAction(): void {
        if (this.state !== 'planet' || !this.currentPlanet) return;
        if (this.currentPlanet.scanned) { this.statusMessage = `${this.currentPlanet.name} already scanned.`; return; }
        try { this.currentPlanet.scan(); this.statusMessage = `Scan Complete: ${this.currentPlanet.primaryResource}(${this.currentPlanet.mineralRichness})`; }
        catch (error) { console.error(`Error scanning ${this.currentPlanet.name}:`, error); this.statusMessage = `Scan failed: ${error instanceof Error ? error.message : String(error)}`; }
    }

    private _mineAction(): void {
        if (this.state !== 'planet' || !this.currentPlanet) return;
        if (this.currentPlanet.type === 'GasGiant' || this.currentPlanet.type === 'IceGiant') { this.statusMessage = "Cannot mine gas giants."; return; }
        if (this.currentPlanet.mineralRichness === MineralRichness.NONE) { this.statusMessage = "No minerals detected."; return; }
        if (!this.currentPlanet.scanned) { this.statusMessage = "Scan required before mining."; return; }
        if (this.player.mineralUnits >= this.player.cargoCapacity) { this.statusMessage = "Cargo hold full."; return; }
        let yieldFactor = 0;
        switch(this.currentPlanet.mineralRichness) { case MineralRichness.POOR: yieldFactor = 0.5; break; case MineralRichness.AVERAGE: yieldFactor = 1.0; break; case MineralRichness.RICH: yieldFactor = 2.0; break; case MineralRichness.EXCEPTIONAL: yieldFactor = 4.0; break; }
        const baseYield = CONFIG.MINING_RATE_FACTOR * yieldFactor; const actualYield = Math.max(1, Math.round(baseYield * this.gameSeedPRNG.random(0.8, 1.2)));
        const spaceAvailable = this.player.cargoCapacity - this.player.mineralUnits; const minedAmount = Math.min(actualYield, spaceAvailable);
        if (minedAmount > 0) { this.player.mineralUnits += minedAmount; this.statusMessage = `Mined ${minedAmount} units.`; }
        else { this.statusMessage = "Unable to extract minerals or cargo full."; }
    }

    private _tradeAction(): void {
        if (this.state !== 'starbase' || !this.currentStarbase) return;
        if (this.player.mineralUnits <= 0) { this.statusMessage = "Cargo hold empty."; return; }
        const earnings = this.player.mineralUnits * CONFIG.MINERAL_SELL_PRICE;
        if (window.confirm(`Sell ${this.player.mineralUnits} units for ${earnings} Cr?`)) { this.player.credits += earnings; this.player.mineralUnits = 0; this.statusMessage = `Sold minerals for ${earnings} Cr.`; }
        else { this.statusMessage = "Trade cancelled."; }
    }

    private _refuelAction(): void {
        if (this.state !== 'starbase' || !this.currentStarbase) return;
        const fuelNeeded = this.player.maxFuel - this.player.fuel;
        if (fuelNeeded < 0.1) { this.statusMessage = "Fuel tank full."; return; }
        const cost = Math.ceil(fuelNeeded / CONFIG.FUEL_PER_CREDIT);
        if (this.player.credits < cost) { this.statusMessage = `Need ${cost} Cr for full refuel. Have ${this.player.credits} Cr.`; return; }
        if (window.confirm(`Refuel ${fuelNeeded.toFixed(0)} units for ${cost} Cr?`)) { this.player.credits -= cost; this.player.fuel = this.player.maxFuel; this.statusMessage = `Refueled. -${cost} Cr.`; }
        else { this.statusMessage = "Refueling cancelled."; }
    }

    // --- Helper to update status bar text ---
    private _updateStatusBar(): void {
        const commonStatus = `|Fuel:${this.player.fuel.toFixed(0)}/${this.player.maxFuel}|Cargo:${this.player.mineralUnits}/${this.player.cargoCapacity}|Cr:${this.player.credits}`;
        this.renderer.updateStatus(this.statusMessage + commonStatus);
    }
}