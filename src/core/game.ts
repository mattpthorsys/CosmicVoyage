// src/core/game.ts
// Full corrected code incorporating fixes from previous steps.

import { Renderer } from '../rendering/renderer';
// import { InputManager } from './input_manager'; // Proper InputManager needed later
import { Player } from './player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase'; // Ensure src/entities/starbase.ts exists and exports Starbase
import { PRNG } from '../utils/prng';
// No longer importing generateSystem - using SolarSystem constructor
import { CONFIG } from '../config'; // Ensure config.ts includes all needed keys
import { SPECTRAL_TYPES, PLANET_TYPES, MineralRichness } from '../constants';
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
    private currentPlanet: Planet | null = null; // Could be solid or gas giant
    private currentStarbase: Starbase | null = null; // Explicit reference

    private lastUpdateTime: number = 0;
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;

    // --- Temporary Input Handling --- (Replace with InputManager later)
    // Stores currently held down keys to prevent rapid repeats from OS key repeat
    private keysPressed: Set<string> = new Set();
    // Queue actions derived from key presses
    private actionQueue: string[] = [];
    // --- End Temporary Input Handling ---

    // --- Status Message Handling ---
    private statusMessage: string = "Initializing..."; // Buffer for status bar text
    // --- End Status Message Handling ---


    constructor(
        canvasId: string,
        statusBarId: string,
        seed?: string | number // Make seed optional
    ) {
        // Use provided seed or generate one based on time
        const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
        this.gameSeedPRNG = new PRNG(initialSeed);
        console.log(`Game initialized with seed: ${this.gameSeedPRNG.getInitialSeed()}`); // Use getter

        this.renderer = new Renderer(canvasId, statusBarId);
        // this.inputManager = new InputManager(); // Commented out
        this.player = new Player(
            CONFIG.PLAYER_START_X,
            CONFIG.PLAYER_START_Y
            // Player constructor now uses defaults from CONFIG for char/color
        );

        this.state = 'hyperspace'; // Start in hyperspace

        // --- Temporary Input Handling Setup ---
        this._setupTempInput(); // Attach temporary listeners
        // --- End Temporary Input Handling Setup ---

        window.addEventListener('resize', this._handleResize.bind(this));
        this._handleResize(); // Initial fit

        console.log("Game constructed.");
    }

    // --- Temporary Input Handling Methods --- (Replace these later)
    private _setupTempInput(): void {
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            // Basic key repeat prevention
            if (this.keysPressed.has(e.key)) return;
            this.keysPressed.add(e.key);

            // Map key to action and queue it
            this._queueActionFromKey(e.key, e.shiftKey); // Pass shift state

            // Prevent default browser actions (scrolling, etc.) for game keys
            if (Object.values(CONFIG.KEY_BINDINGS).includes(e.key as any)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e: KeyboardEvent) => {
            this.keysPressed.delete(e.key);
        });
    }

    private _queueActionFromKey(key: string, isShiftDown: boolean): void {
        const bindings = CONFIG.KEY_BINDINGS;
        let action: string | null = null;
        let fineControl = isShiftDown; // Use Shift key for fine control example

        // Map keys to actions defined in CONFIG.KEY_BINDINGS
        switch (key) {
            case bindings.MOVE_UP: action = 'MOVE_UP'; break;
            case bindings.MOVE_DOWN: action = 'MOVE_DOWN'; break;
            case bindings.MOVE_LEFT: action = 'MOVE_LEFT'; break;
            case bindings.MOVE_RIGHT: action = 'MOVE_RIGHT'; break;
            // Optional: Map diagonal keys if defined
            // case bindings.MOVE_UP_LEFT: action = 'MOVE_UP_LEFT'; break;
            // ... etc ...
            case bindings.ENTER_SYSTEM: action = 'ENTER_SYSTEM'; break;
            case bindings.LEAVE_SYSTEM: action = 'LEAVE_SYSTEM'; break;
            case bindings.LAND: action = 'LAND'; break;
            case bindings.LIFTOFF: action = 'LIFTOFF'; break;
            case bindings.SCAN: action = 'SCAN'; break;
            case bindings.MINE: action = 'MINE'; break;
            case bindings.TRADE: action = 'TRADE'; break;
            case bindings.REFUEL: action = 'REFUEL'; break;
            case bindings.QUIT: action = 'QUIT'; this.stopGame(); break; // Example quit action
        }

        if (action) {
            // Prepend fine control flag if modifier is active and action is movement
            if (fineControl && action.startsWith('MOVE_')) {
                action = `FINE_${action}`;
            }
            this.actionQueue.push(action); // Add action to the queue
        }
    }
    // --- End Temporary Input Handling ---

    /** Starts the main game loop. */
    startGame(): void {
        if (this.isRunning) {
            console.warn("Game is already running.");
            return;
        }
        console.log("Starting game loop...");
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
        // Reset input state on start
        this.keysPressed.clear();
        this.actionQueue = [];
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    /** Stops the main game loop. */
    stopGame(): void {
        if (!this.isRunning) {
            // console.warn("Game is not running."); // Can be noisy if called multiple times
            return;
        }
        console.log("Stopping game loop...");
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        // --- Temporary Input Handling Cleanup ---
        // Ideally remove listeners here, but complex with anonymous functions.
        // A proper InputManager class should handle its own cleanup.
        // --- End Temporary Input Handling Cleanup ---
         this.renderer.updateStatus("Game stopped. Refresh to restart."); // Final status
    }

    /** Handles window resize events. */
    private _handleResize(): void {
        this.renderer.fitToScreen();
        // Trigger a re-render immediately after resize
        if (this.isRunning) { // Only render if loop was running
            this._render();
        }
        // Reset lastUpdateTime to avoid large deltaTime jump on resume after resize lag
        this.lastUpdateTime = performance.now();
    }

    /** The main game loop. */
    private _loop(currentTime: DOMHighResTimeStamp): void {
        if (!this.isRunning) return;

        const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0); // Delta time in seconds, with max cap
        this.lastUpdateTime = currentTime;

        // 1. Handle Input (Processes one action per frame from temporary queue)
        this._handleInput();

        // 2. Update Game State
        this._update(deltaTime);

        // 3. Render the current state
        this._render();

        // Request next frame
        this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    }

    /** Processes user input action based on the current game state. */
    private _handleInput(): void {
        const actionWithFinePrefix = this.actionQueue.shift(); // Get oldest action
        if (!actionWithFinePrefix) return; // No action this frame

        // Separate fine control flag from base action name
        let isFine = false;
        let baseAction = actionWithFinePrefix;
        if (actionWithFinePrefix.startsWith('FINE_')) {
            isFine = true;
            baseAction = actionWithFinePrefix.substring(5); // Remove "FINE_"
        }

        console.log(`Processing action: ${baseAction}${isFine ? ' (Fine)' : ''} in state: ${this.state}`); // Debug log

        // Delegate action handling based on game state
        switch (this.state) {
            case 'hyperspace':
                this._handleInputHyperspace(baseAction, isFine);
                break;
            case 'system':
                this._handleInputSystem(baseAction, isFine);
                break;
            case 'planet':
                this._handleInputPlanet(baseAction, isFine);
                break;
            case 'starbase':
                this._handleInputStarbase(baseAction); // Fine control usually irrelevant here
                break;
        }
    }

    // --- State-Specific Input Handlers ---
    private _handleInputHyperspace(action: string, isFine: boolean): void {
        let dx = 0; dy = 0;
        switch (action) {
            case 'MOVE_UP': dy = -1; break;
            case 'MOVE_DOWN': dy = 1; break;
            case 'MOVE_LEFT': dx = -1; break;
            case 'MOVE_RIGHT': dx = 1; break;
            case 'ENTER_SYSTEM': this._enterSystemAction(); break;
        }
        if (dx !== 0 || dy !== 0) {
            // isFine has no effect on 1-cell hyperspace movement
            this.player.moveWorld(dx, dy);
        }
    }

    private _handleInputSystem(action: string, isFine: boolean): void {
        let dx = 0; dy = 0;
        switch (action) {
            case 'MOVE_UP': dy = -1; break; // Direction only, scaling happens in moveSystem
            case 'MOVE_DOWN': dy = 1; break;
            case 'MOVE_LEFT': dx = -1; break;
            case 'MOVE_RIGHT': dx = 1; break;
            case 'LEAVE_SYSTEM': this._leaveSystemAction(); break;
            case 'LAND': this._landAction(); break;
        }
        if (dx !== 0 || dy !== 0) {
            this.player.moveSystem(dx, dy, isFine); // Pass direction and fine flag
        }
    }

    private _handleInputPlanet(action: string, isFine: boolean): void {
        let dx = 0; dy = 0;
        switch (action) {
            case 'MOVE_UP': dy = -1; break;
            case 'MOVE_DOWN': dy = 1; break;
            case 'MOVE_LEFT': dx = -1; break;
            case 'MOVE_RIGHT': dx = 1; break;
            case 'LIFTOFF': this._liftoffAction(); break;
            case 'SCAN': this._scanPlanetAction(); break;
            case 'MINE': this._mineAction(); break;
        }
        if ((dx !== 0 || dy !== 0) && this.currentPlanet) {
            // isFine has no effect on 1-cell surface movement
            // Use base size from config as fallback if heightmap isn't loaded (shouldn't happen)
            const mapSize = this.currentPlanet.heightmap?.length || CONFIG.PLANET_MAP_BASE_SIZE;
            this.player.moveSurface(dx, dy, mapSize);
        }
    }

    private _handleInputStarbase(action: string): void {
        switch (action) {
            case 'TRADE': this._tradeAction(); break;
            case 'REFUEL': this._refuelAction(); break;
            case 'LIFTOFF': this._liftoffAction(); break;
        }
    }

    /** Updates the game logic based on the current state and delta time. */
    private _update(deltaTime: number): void {
        switch (this.state) {
            case 'hyperspace': this._updateHyperspace(deltaTime); break;
            case 'system': this._updateSystem(deltaTime); break;
            case 'planet': this._updatePlanet(deltaTime); break;
            case 'starbase': this._updateStarbase(deltaTime); break;
        }
        this._updateStatusBar(); // Always update the status bar text buffer
    }

    // --- State-Specific Update Methods ---
    private _updateHyperspace(deltaTime: number): void {
        const baseSeedInt = this.gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
        const isNearStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (isNearStar) {
            this.statusMessage = `Hyperspace | Location: ${this.player.worldX}, ${this.player.worldY} | Near star system. Press [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM}] to enter.`;
        } else {
            this.statusMessage = `Hyperspace | Location: ${this.player.worldX}, ${this.player.worldY}`;
        }
    }

    private _updateSystem(deltaTime: number): void {
        if (!this.currentSystem) {
            console.error("In 'system' state but currentSystem is null! Attempting recovery.");
            this.state = 'hyperspace'; this.statusMessage = "System error. Reverted to hyperspace.";
            return;
        }

        // Update planet orbits using the method added to SolarSystem
        this.currentSystem.updateOrbits(deltaTime * CONFIG.SYSTEM_ORBIT_SPEED_FACTOR);

        // Check proximity for landing prompt
        let nearbyObject: Planet | Starbase | null = null;
        const landingDistSq = CONFIG.LANDING_DISTANCE * CONFIG.LANDING_DISTANCE;
        let currentMinDistSq = landingDistSq;

        this.currentSystem.planets.forEach(p => {
            if(p) {
                 const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY);
                 if (dSq <= currentMinDistSq) { currentMinDistSq = dSq; nearbyObject = p; }
            }
        });
        if(this.currentSystem.starbase) {
             const dSq = this.player.distanceSqToSystemCoords(this.currentSystem.starbase.systemX, this.currentSystem.starbase.systemY);
             if (dSq <= currentMinDistSq) { nearbyObject = this.currentSystem.starbase; } // Check if starbase is closer or equally close
        }

        // Build status message
        let status = `System: ${this.currentSystem.name} (${this.currentSystem.starType}) | Pos: ${this.player.systemX.toFixed(0)}, ${this.player.systemY.toFixed(0)}`;
        if (nearbyObject) {
            status += ` | Near ${nearbyObject.name}. Press [${CONFIG.KEY_BINDINGS.LAND}] to land.`;
        }
        // Check for leaving system possibility
        const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
        if (distFromStarSq > (this.currentSystem.edgeRadius * 0.8) ** 2) { // Example threshold
            status += ` | Press [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM}] to leave.`;
        }
        this.statusMessage = status;
    }

    private _updatePlanet(deltaTime: number): void {
        if (!this.currentPlanet) {
            console.error("In 'planet' state but currentPlanet is null! Attempting recovery.");
            this.state = 'hyperspace'; this.statusMessage = "Planet error. Reverted to hyperspace.";
            return;
        }
        let status = `Landed: ${this.currentPlanet.name} (${this.currentPlanet.type}) | Surf Pos: ${this.player.surfaceX}, ${this.player.surfaceY}`;
        status += ` | [${CONFIG.KEY_BINDINGS.LIFTOFF}] Liftoff`;

        // Add Scan/Mine options based on state
        if (this.currentPlanet.scanned) {
            status += ` | Scan: ${this.currentPlanet.primaryResource || 'None'} (${this.currentPlanet.mineralRichness}), Grav: ${this.currentPlanet.gravity.toFixed(2)}g`;
            if (this.currentPlanet.mineralRichness !== MineralRichness.NONE && this.currentPlanet.type !== 'GasGiant' && this.currentPlanet.type !== 'IceGiant') {
                 status += ` | [${CONFIG.KEY_BINDINGS.MINE}] Mine`;
            }
        } else {
            status += ` | [${CONFIG.KEY_BINDINGS.SCAN}] Scan`;
        }
        this.statusMessage = status;
    }

    private _updateStarbase(deltaTime: number): void {
        if (!this.currentStarbase) {
            console.error("In 'starbase' state but currentStarbase is null! Attempting recovery.");
            this.state = 'hyperspace'; this.statusMessage = "Starbase error. Reverted to hyperspace.";
            return;
        }
        this.statusMessage = `Docked: ${this.currentStarbase.name} | [${CONFIG.KEY_BINDINGS.TRADE}] Trade, [${CONFIG.KEY_BINDINGS.REFUEL}] Refuel, [${CONFIG.KEY_BINDINGS.LIFTOFF}] Liftoff.`;
    }

    /** Renders the current game state using the renderer. */
    private _render(): void {
        try { // Add basic error catching around rendering calls
             switch (this.state) {
                 case 'hyperspace':
                     this.renderer.drawHyperspace(this.player, this.gameSeedPRNG);
                     break;
                 case 'system':
                     if (this.currentSystem) {
                         this.renderer.drawSolarSystem(this.player, this.currentSystem, this.gameSeedPRNG);
                     } else { this._renderError("System not loaded"); }
                     break;
                 case 'planet':
                      // Use the landed object which could be Planet or Starbase - drawPlanetSurface handles Starbase internally
                     if (this.currentPlanet) {
                          this.renderer.drawPlanetSurface(this.player, this.currentPlanet);
                     } else { this._renderError("Planet not loaded"); }
                     break;
                 case 'starbase':
                      if (this.currentStarbase) {
                           // Pass Starbase to the same function, it has logic to detect and render interior
                           this.renderer.drawPlanetSurface(this.player, this.currentStarbase);
                      } else { this._renderError("Starbase not loaded"); }
                     break;
                 default:
                      this._renderError(`Unknown game state: ${this.state}`);
             }
             // Apply buffer changes to the canvas
             this.renderer.renderDiff();
        } catch (error) {
             console.error("!!! CRITICAL RENDER ERROR !!!", error);
             this.stopGame(); // Stop the loop on critical render failure
             this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
             // Ensure the error message is visible
             this.renderer.renderDiff(); // Attempt to render the error message background fill
        }
    }

    /** Helper to render an error message to the screen. */
    private _renderError(message: string): void {
        console.error(`Render Error: ${message}`);
        this.renderer.clear(true); // Force physical clear
        this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOR);
        this.statusMessage = `ERROR: ${message}`; // Also update status bar
    }

    // --- Action Methods ---

    private _enterSystemAction(): void {
        if (this.state !== 'hyperspace') return;
        // Check for star presence
        const baseSeedInt = this.gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
        const isNearStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (isNearStar) {
            console.log(`Entering system at ${this.player.worldX}, ${this.player.worldY}`);
            try {
                // Use SolarSystem constructor, passing the main game PRNG
                this.currentSystem = new SolarSystem(this.player.worldX, this.player.worldY, this.gameSeedPRNG);
                this.state = 'system';
                this.currentPlanet = null; this.currentStarbase = null;
                // Position player near edge (e.g., left side)
                this.player.systemX = -this.currentSystem.edgeRadius * 0.9;
                this.player.systemY = 0;
                this.player.moveSystem(1, 0); // Face towards center initially
                this.statusMessage = `Entered ${this.currentSystem.name}`;
                this.renderer.clear(true); // Clear for new state
            } catch (error) {
                console.error("Failed to create SolarSystem:", error);
                this.statusMessage = `Error entering system: ${error instanceof Error ? error.message : String(error)}`;
                this.currentSystem = null;
            }
        } else {
            this.statusMessage = "No star system close enough to enter.";
        }
    }

    private _leaveSystemAction(): void {
        if (this.state !== 'system' || !this.currentSystem) return;
        // Check distance from star center
        const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
        if (distFromStarSq <= (this.currentSystem.edgeRadius * 0.8) ** 2) {
            this.statusMessage = "Too close to the star to leave the system."; return;
        }
        console.log(`Leaving system ${this.currentSystem.name}.`);
        this.state = 'hyperspace';
        // World coords remain as they were when entering
        this.currentSystem = null; this.currentPlanet = null; this.currentStarbase = null;
        this.statusMessage = "Entered hyperspace.";
        this.renderer.clear(true);
    }

    private _landAction(): void {
        if (this.state !== 'system' || !this.currentSystem) return;
        // Find closest landable object within range
        let targetObject: Planet | Starbase | null = null;
        let minDistSq = CONFIG.LANDING_DISTANCE * CONFIG.LANDING_DISTANCE;

        this.currentSystem.planets.forEach(p => {
            if(p) {
                 const dSq = this.player.distanceSqToSystemCoords(p.systemX, p.systemY);
                 if (dSq <= minDistSq) { minDistSq = dSq; targetObject = p; }
            }
        });
        if(this.currentSystem.starbase) {
             const dSq = this.player.distanceSqToSystemCoords(this.currentSystem.starbase.systemX, this.currentSystem.starbase.systemY);
             if (dSq <= minDistSq) { targetObject = this.currentSystem.starbase; } // Allow starbase if equally close or closer
        }

        if (targetObject) {
            console.log(`Initiating landing sequence on ${targetObject.name}.`);
            try {
                 targetObject.ensureSurfaceReady(); // Prepare surface/interior graphics data

                 if (targetObject instanceof Starbase || targetObject.type === 'Starbase') {
                      this.state = 'starbase';
                      this.currentStarbase = targetObject as Starbase;
                      this.currentPlanet = null;
                      // Starbase interior doesn't use player surface coords in the same way
                       this.player.surfaceX = 0; this.player.surfaceY = 0;
                      this.statusMessage = `Docked at ${this.currentStarbase.name}.`;
                 } else {
                      this.state = 'planet';
                      this.currentPlanet = targetObject as Planet;
                      this.currentStarbase = null;
                       // Reset surface position to center of map (or landing zone later)
                       const mapSize = this.currentPlanet.heightmap?.length || CONFIG.PLANET_MAP_BASE_SIZE;
                       this.player.surfaceX = Math.floor(mapSize / 2);
                       this.player.surfaceY = Math.floor(mapSize / 2);
                       this.statusMessage = `Landed on ${this.currentPlanet.name}.`;
                 }
                 this.renderer.clear(true); // Clear for new view
            } catch(error) {
                 console.error(`Error preparing landing on ${targetObject.name}:`, error);
                 this.statusMessage = `Landing failed: ${error instanceof Error ? error.message : String(error)}`;
                 // Stay in system state if landing fails
            }
        } else {
           this.statusMessage = "Nothing close enough to land on.";
        }
    }

    private _liftoffAction(): void {
        if (this.state !== 'planet' && this.state !== 'starbase') return;
        const originObject = this.currentPlanet || this.currentStarbase;
        if (!originObject || !this.currentSystem) {
             console.error("Cannot liftoff without origin object or current system!");
             this.state = 'hyperspace'; // Attempt recovery
             this.currentSystem = null; this.currentPlanet = null; this.currentStarbase = null;
             this.statusMessage = "Liftoff error. Reverted to hyperspace.";
             this.renderer.clear(true);
             return;
        }

        console.log(`Lifting off from ${originObject.name}.`);
        this.state = 'system';
        // Position player slightly away from the origin
        const liftDist = CONFIG.LANDING_DISTANCE * 1.1;
        const liftAngle = this.gameSeedPRNG.random(0, Math.PI * 2); // Random direction away
        this.player.systemX = originObject.systemX + Math.cos(liftAngle) * liftDist;
        this.player.systemY = originObject.systemY + Math.sin(liftAngle) * liftDist;
        // Set player visual based on direction
        this.player.moveSystem(Math.cos(liftAngle), Math.sin(liftAngle)); // Sets char/shipDirection

        this.currentPlanet = null; this.currentStarbase = null;
        this.statusMessage = `Ascending from ${originObject.name}. Entered system view.`;
        this.renderer.clear(true);
    }

    private _scanPlanetAction(): void {
        if (this.state !== 'planet' || !this.currentPlanet) return;
        if (this.currentPlanet.scanned) {
            this.statusMessage = `${this.currentPlanet.name} already scanned.`; return;
        }
        try {
            this.currentPlanet.scan(); // Method now exists on Planet
            // Update message immediately, status bar will show it next frame
            this.statusMessage = `Scan Complete: ${this.currentPlanet.primaryResource} (${this.currentPlanet.mineralRichness})`;
        } catch (error) {
             console.error(`Error scanning ${this.currentPlanet.name}:`, error);
             this.statusMessage = `Scan failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private _mineAction(): void {
        if (this.state !== 'planet' || !this.currentPlanet) return;
        // Check if mining is possible
        if (this.currentPlanet.type === 'GasGiant' || this.currentPlanet.type === 'IceGiant') {
             this.statusMessage = "Atmospheric scoop not implemented for mining."; return;
        }
        if (this.currentPlanet.mineralRichness === MineralRichness.NONE) {
             this.statusMessage = "Subsurface scan shows no viable mineral deposits."; return;
        }
        if (!this.currentPlanet.scanned) {
             this.statusMessage = "Planetary scan required before mining."; return;
        }
        if (this.player.mineralUnits >= this.player.cargoCapacity) {
             this.statusMessage = "Cargo hold full."; return;
        }

        // Calculate yield
        let yieldFactor = 0;
        switch(this.currentPlanet.mineralRichness) {
             case MineralRichness.POOR: yieldFactor = 0.5; break;
             case MineralRichness.AVERAGE: yieldFactor = 1.0; break;
             case MineralRichness.RICH: yieldFactor = 2.0; break;
             case MineralRichness.EXCEPTIONAL: yieldFactor = 4.0; break;
        }
        const baseYield = CONFIG.MINING_RATE_FACTOR * yieldFactor;
        const actualYield = Math.max(1, Math.round(baseYield * this.gameSeedPRNG.random(0.8, 1.2)));
        const spaceAvailable = this.player.cargoCapacity - this.player.mineralUnits;
        const minedAmount = Math.min(actualYield, spaceAvailable);

        if (minedAmount > 0) {
             this.player.mineralUnits += minedAmount;
             this.statusMessage = `Mining beam active... Extracted ${minedAmount} units.`;
             // Deduct fuel cost?
             // this.player.fuel -= CONFIG.MINING_FUEL_COST; // Add cost to CONFIG if needed
        } else {
             this.statusMessage = "Unable to extract minerals or cargo hold full.";
        }
    }

    private _tradeAction(): void {
        if (this.state !== 'starbase' || !this.currentStarbase) return;
        if (this.player.mineralUnits <= 0) {
            this.statusMessage = "Cargo hold empty. Nothing to sell."; return;
        }
        const earnings = this.player.mineralUnits * CONFIG.MINERAL_SELL_PRICE;
        // Replace confirm with a more robust UI element later
        if (window.confirm(`Access Starbase Exchange?\n\nSell ${this.player.mineralUnits} Mineral Units for ${earnings} Credits?`)) {
             this.player.credits += earnings;
             this.player.mineralUnits = 0;
             this.statusMessage = `Transaction complete. +${earnings} Cr.`;
        } else {
             this.statusMessage = "Trade cancelled by pilot.";
        }
    }

    private _refuelAction(): void {
        if (this.state !== 'starbase' || !this.currentStarbase) return;
        const fuelNeeded = this.player.maxFuel - this.player.fuel;
        if (fuelNeeded < 0.1) {
             this.statusMessage = "Fuel tanks already at maximum capacity."; return;
        }
        const cost = Math.ceil(fuelNeeded / CONFIG.FUEL_PER_CREDIT);
        if (this.player.credits < cost) {
             this.statusMessage = `Insufficient credits! Need ${cost} Cr for full refuel. You have ${this.player.credits} Cr.`; return;
        }
        // Replace confirm later
        if (window.confirm(`Purchase ${fuelNeeded.toFixed(0)} units of fuel for ${cost} credits?`)) {
             this.player.credits -= cost;
             this.player.fuel = this.player.maxFuel;
             this.statusMessage = `Refueling complete. -${cost} Cr.`;
        } else {
             this.statusMessage = "Refueling cancelled by pilot.";
        }
    }

    // --- Helper to update status bar text ---
    private _updateStatusBar(): void {
        // Combine the state-specific message with common player stats
        const commonStatus = ` | Fuel:${this.player.fuel.toFixed(0)}/${this.player.maxFuel} | Cargo:${this.player.mineralUnits}/${this.player.cargoCapacity} | Cr:${this.player.credits}`;
        this.renderer.updateStatus(this.statusMessage + commonStatus);
    }
}