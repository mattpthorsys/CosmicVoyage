// src/core/game_state_manager.ts (Subscribing to Action Request Events)

import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS, STATUS_MESSAGES } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { eventManager, GameEvents } from './event_manager'; // Import Event Manager and constants
import { TerminalOverlay } from '@/rendering/terminal_overlay';

// Define GameState type here or import from a shared types file
export type GameState = 'hyperspace' | 'system' | 'planet' | 'starbase';

/** Manages the game's current state, context (system/planet/starbase), and transitions. */
export class GameStateManager {

  private readonly terminalOverlay: TerminalOverlay;

  private _state: GameState;
  private _currentSystem: SolarSystem | null = null;
  private _currentPlanet: Planet | null = null;
  private _currentStarbase: Starbase | null = null;
  private peekedSystem: SolarSystem | null = null; // Keep for peeking logic
  /** Holds the latest status message for the game state manager. */
  public statusMessage: string = ''; // Keep for action processor status

  // Dependencies needed for state transitions
  private player: Player;
  private gameSeedPRNG: PRNG;

  constructor(player: Player, gameSeedPRNG: PRNG) {
    this._state = 'hyperspace'; // Initial state
    this.player = player;
    this.gameSeedPRNG = gameSeedPRNG;
    this.terminalOverlay = new TerminalOverlay();
    logger.info(`[GameStateManager] Initialized. Initial state: '${this._state}'`);

    // --- Subscribe to Action Request Events ---
    eventManager.subscribe(GameEvents.ENTER_SYSTEM_REQUESTED, this.enterSystem.bind(this));
    eventManager.subscribe(GameEvents.LEAVE_SYSTEM_REQUESTED, this.leaveSystem.bind(this));
    eventManager.subscribe(GameEvents.LAND_REQUESTED, this.landOnNearbyObject.bind(this));
    eventManager.subscribe(GameEvents.LIFTOFF_REQUESTED, this.liftOff.bind(this));
    logger.info('[GameStateManager] Subscribed to action request events.');
  }

  // --- Getters for current state and context ---
  get state(): GameState { return this._state; }
  get currentSystem(): SolarSystem | null { return this._currentSystem; }
  get currentPlanet(): Planet | null { return this._currentPlanet; }
  get currentStarbase(): Starbase | null { return this._currentStarbase; }

  // --- State Transition Logic ---
  // Methods now primarily act as event handlers, but can still be called directly if needed

  /** Attempts to enter a system from hyperspace. Returns true on success, false otherwise. */
  enterSystem(): boolean {
    if (this._state !== 'hyperspace') { /* ... */ return false; }
    // *** FIX: Use player.position ***
    logger.debug(`[GameStateManager] Handling ${GameEvents.ENTER_SYSTEM_REQUESTED} event at World: ${this.player.position.worldX},${this.player.position.worldY}`);
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.position.worldX, this.player.position.worldY, baseSeedInt); // Use position
    // *** END FIX ***
    const isStarCell = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;
    if (!isStarCell) { /* ... */ return false; }

    try {
      // *** FIX: Use player.position ***
      logger.info(`[GameStateManager] Entering system at ${this.player.position.worldX},${this.player.position.worldY}...`);
      const system = new SolarSystem(this.player.position.worldX, this.player.position.worldY, this.gameSeedPRNG); // Use position
      // *** END FIX ***
      logger.info(`[GameStateManager] Generated System: ${system.name} (${system.starType})`);
      // Set player position relative to system center
      // *** FIX: Use player.position ***
      const entryAngle = Math.atan2(this.player.position.worldY, this.player.position.worldX); // Use position
      // *** END FIX ***
      const entryDist = system.edgeRadius * 0.85;
      // *** FIX: Use player.position ***
      this.player.position.systemX = Math.cos(entryAngle) * entryDist; // Set position component
      this.player.position.systemY = Math.sin(entryAngle) * entryDist; // Set position component
      // *** END FIX ***
      // Reset player visual state for system view
      this.player.render.directionGlyph = GLYPHS.SHIP_NORTH; // Use render component
      this.player.render.char = this.player.render.directionGlyph; // Use render component
      // Update state
      const oldState = this._state;
      this._state = 'system';
      this._currentSystem = system;
      this._currentPlanet = null;
      this._currentStarbase = null;
      this.statusMessage = STATUS_MESSAGES.HYPERSPACE_ENTERING(system.name); // Set status

      logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Entered ${system.name})`);
      // Publish notification events
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
      eventManager.publish(GameEvents.SYSTEM_ENTERED, system);

      return true; // Indicate success
    } catch (error) {
      logger.error(`[GameStateManager] Failed to create or enter solar system at ${this.player.position.worldX},${this.player.position.worldY}: ${error}`); // Use position
      this._currentSystem = null; // Ensure system is null on failure
      this.statusMessage = `System Entry Failed: ${error instanceof Error ? error.message : 'Unknown error'}`; // Set status
      // Stay in hyperspace state
      return false; // Indicate failure
    }
  }

  /** Attempts to leave the current system. Returns true on success, false otherwise. */
  leaveSystem(): boolean {
    // Prevent leaving system if not in one
    if (this._state !== 'system') {
      logger.warn(`[GameStateManager.leaveSystem] Attempted to leave system while not in system state (State: ${this._state})`);
      return false;
    }
    logger.debug(`[GameStateManager] Handling ${GameEvents.LEAVE_SYSTEM_REQUESTED} event from: ${this._currentSystem?.name ?? 'Unknown System'}`);
    if (!this._currentSystem) {
      logger.warn('[GameStateManager] Leave System failed: Not currently in a system (internal state error).');
      this.statusMessage = 'Cannot leave system: System data missing.';
      return false;
    }

    // Check if player is near the edge
    const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
    const edgeThresholdSq = (this._currentSystem.edgeRadius * CONFIG.SYSTEM_EDGE_LEAVE_FACTOR) ** 2;

    if (distFromStarSq > edgeThresholdSq) {
      logger.info(`[GameStateManager] Leaving system ${this._currentSystem.name}...`);
      const oldState = this._state;
      this._state = 'hyperspace';
      this._currentSystem = null;
      this._currentPlanet = null;
      this._currentStarbase = null;
      this.player.render.char = CONFIG.PLAYER_CHAR; // Set char for hyperspace
      this.statusMessage = 'Entered hyperspace.'; // Set status

      logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Left system)`);
      // Publish notification events
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
      eventManager.publish(GameEvents.SYSTEM_LEFT);

      return true;
    } else {
      logger.debug('[GameStateManager] Leave System failed: Player not close enough to system edge.');
      this.terminalOverlay.addMessage(STATUS_MESSAGES.SYSTEM_LEAVE_TOO_CLOSE);
      return false;
    }
  }

  /** Attempts to land on a nearby object. Returns the landed object or null on failure. */
  landOnNearbyObject(): Planet | Starbase | null {
    // Prevent landing if not in system state
    if (this._state !== 'system') {
      logger.warn(`[GameStateManager.landOnNearbyObject] Attempted to land while not in system state (State: ${this._state})`);
      return null;
    }
    logger.info(`[GameStateManager] Handling ${GameEvents.LAND_REQUESTED} event. Player system coords: [${this.player.position.systemX.toFixed(0)}, ${this.player.position.systemY.toFixed(0)}]`);
    if (!this._currentSystem) {
      logger.warn('[GameStateManager] Land failed: Not in a system (internal state error).');
      this.statusMessage = 'Cannot land: System data missing.';
      return null;
    }

    // Find the closest landable object within range
    const nearbyObject = this._currentSystem.getObjectNear(this.player.position.systemX, this.player.position.systemY);
    logger.info(`>>> GameStateManager: getObjectNear returned: ${nearbyObject?.name ?? 'null'}`);

    if (!nearbyObject) {
      logger.debug('[GameStateManager] Land failed: No object within landing distance.');
      this.terminalOverlay.addMessage(STATUS_MESSAGES.SYSTEM_LAND_FAIL_NO_TARGET);
      return null;
    }

    logger.info(`[GameStateManager] Landing on ${nearbyObject.name} (Type: ${nearbyObject.type})...`);
    logger.info(`>>> GameStateManager: Attempting ensureSurfaceReady for ${nearbyObject.name}...`);
    try {
      // Ensure surface is ready *before* changing state
      nearbyObject.ensureSurfaceReady(); // Logs internally

      const oldState = this._state;
      let eventToPublish: string | null = null;
      let eventData: Planet | Starbase | null = null;

      if (nearbyObject instanceof Planet) {
        this._state = 'planet';
        this._currentPlanet = nearbyObject;
        this._currentStarbase = null;
        const mapSize = nearbyObject.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
        this.player.position.surfaceX = Math.floor(mapSize / 2);
        this.player.position.surfaceY = Math.floor(mapSize / 2);
        eventToPublish = GameEvents.PLANET_LANDED;
        eventData = nearbyObject;
      } else if (nearbyObject instanceof Starbase) {
        this._state = 'starbase';
        this._currentStarbase = nearbyObject;
        this._currentPlanet = null;
        this.player.position.surfaceX = 0; // Or designated entry point
        this.player.position.surfaceY = 0;
        eventToPublish = GameEvents.STARBASE_DOCKED;
        eventData = nearbyObject;
      } else {
        logger.error(`[GameStateManager] Land failed: Nearby object ${nearbyObject} has unknown type.`);
        this.statusMessage = `Landing Error: Unknown object type.`;
        return null;
      }

      this.player.render.char = CONFIG.PLAYER_CHAR; // Set char for surface/docked state
      this.terminalOverlay.addMessage(STATUS_MESSAGES.SYSTEM_LAND_APPROACHING(nearbyObject.name));

      logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Landed/Docked at ${nearbyObject.name})`);
      // Publish notification events
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
      if (eventToPublish && eventData) {
        eventManager.publish(eventToPublish, eventData);
      }

      return nearbyObject; // Return the object landed on/docked at
    } catch (error) {
      logger.error(`[GameStateManager] Failed to prepare surface or land on ${nearbyObject.name}: ${error}`);
      this.statusMessage = `Landing Error on ${nearbyObject.name}: ${error instanceof Error ? error.message : String(error)}`;
      this._currentPlanet = null;
      this._currentStarbase = null;
      // State remains 'system'
      return null;
    }
  }

  /** Attempts to lift off from a planet or starbase. Returns true on success, false otherwise. */
  liftOff(): boolean {
    // Prevent liftoff if not landed/docked
    if (this._state !== 'planet' && this._state !== 'starbase') {
      logger.warn(`[GameStateManager.liftOff] Attempted liftoff while not landed/docked (State: ${this._state})`);
      return false;
    }
    logger.debug(`[GameStateManager] Handling ${GameEvents.LIFTOFF_REQUESTED} event...`);
    if (!this._currentSystem) {
      // This indicates a serious state inconsistency
      logger.error(`[GameStateManager] Liftoff failed: State is '${this._state}' but currentSystem is null! Attempting recovery.`);
      this._state = 'hyperspace'; // Recover to hyperspace
      this._currentPlanet = null;
      this._currentStarbase = null;
      this.statusMessage = 'Liftoff Error: System data lost. Returning to hyperspace.';
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state); // Publish recovery state
      return false; // Indicate failure / abnormal recovery
    }

    const sourceObj = this._currentPlanet || this._currentStarbase;
    const liftedFromName = sourceObj?.name ?? 'Unknown Location';

    logger.info(`[GameStateManager] Lifting off from ${liftedFromName}...`);

    // Place player back in system view, near the object
    if (sourceObj) {
      this.player.position.systemX = sourceObj.systemX;
      this.player.position.systemY = sourceObj.systemY - CONFIG.LANDING_DISTANCE * CONFIG.LIFTOFF_DISTANCE_FACTOR;
    } else {
      // Fallback position if source object somehow null (shouldn't happen)
      this.player.position.systemX = 0;
      this.player.position.systemY = 0;
      logger.warn('[GameStateManager] Liftoff source object was null, placing player at system origin.');
    }

    // Reset player direction and char for system view
    this.player.render.directionGlyph = GLYPHS.SHIP_NORTH; // Default direction after liftoff
    this.player.render.char = this.player.render.directionGlyph;

    // Update state
    const oldState = this._state;
    this._state = 'system';
    this._currentPlanet = null;
    this._currentStarbase = null;
    this.statusMessage = `Liftoff from ${liftedFromName} successful.`; // Set status

    logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Lifted off from ${liftedFromName})`);
    // Publish notification events
    eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
    eventManager.publish(GameEvents.LIFT_OFF);

    return true;
  }

  /**
   * Checks if a system exists at the given world coordinates and returns a
   * temporary SolarSystem object with basic information if it does.
   */
  peekAtSystem(worldX: number, worldY: number): SolarSystem | null {
    logger.debug(`[GameStateManager] Peeking at system at: ${worldX}, ${worldY}`);
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(worldX, worldY, baseSeedInt);
    const isStarCell = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;

    if (!isStarCell) {
      return null;
    }

    try {
      // Create a temporary system for peeking
      const tempSystem = new SolarSystem(worldX, worldY, this.gameSeedPRNG);
      return tempSystem;
    } catch (error) {
      logger.error(`[GameStateManager] Error peeking at system at ${worldX}, ${worldY}: ${error}`);
      return null;
    }
  }

  /** Clears the peeked system cache/reference (if any). */
  resetPeekedSystem() {
    // If caching was implemented for peekAtSystem, clear it here.
    // this.peekedSystem = null; // Example if caching existed
  }

  /** Cleans up event listeners */
  destroy(): void {
    logger.info('[GameStateManager] Destroying and unsubscribing from events...');
    eventManager.unsubscribe(GameEvents.ENTER_SYSTEM_REQUESTED, this.enterSystem.bind(this));
    eventManager.unsubscribe(GameEvents.LEAVE_SYSTEM_REQUESTED, this.leaveSystem.bind(this));
    eventManager.unsubscribe(GameEvents.LAND_REQUESTED, this.landOnNearbyObject.bind(this));
    eventManager.unsubscribe(GameEvents.LIFTOFF_REQUESTED, this.liftOff.bind(this));
  }

} // End GameStateManager class