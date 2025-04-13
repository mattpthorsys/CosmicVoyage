// src/core/game_state_manager.ts (Using Event Manager)

import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { eventManager, GameEvents } from './event_manager'; // Import Event Manager and constants

// Define GameState type here or import from a shared types file
export type GameState = 'hyperspace' | 'system' | 'planet' | 'starbase';

/** Manages the game's current state, context (system/planet/starbase), and transitions. */
export class GameStateManager {
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

  // Removed onStateChange callback property

  constructor(player: Player, gameSeedPRNG: PRNG /* Removed onStateChange callback */) {
    this._state = 'hyperspace'; // Initial state
    this.player = player;
    this.gameSeedPRNG = gameSeedPRNG;
    // Removed callback initialization
    logger.info(`[GameStateManager] Initialized. Initial state: '${this._state}'`);
  }

  // --- Getters for current state and context ---
  get state(): GameState {
    return this._state;
  }
  get currentSystem(): SolarSystem | null {
    return this._currentSystem;
  }
  get currentPlanet(): Planet | null {
    return this._currentPlanet;
  }
  get currentStarbase(): Starbase | null {
    return this._currentStarbase;
  }

  // --- State Transition Logic ---

  /** Attempts to enter a system from hyperspace. Returns true on success, false otherwise. */
  enterSystem(): boolean {
    logger.debug(`[GameStateManager] Attempting Enter System at World: ${this.player.worldX},${this.player.worldY}`);
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.worldX, this.player.worldY, baseSeedInt);
    const isStarCell = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;

    if (!isStarCell) {
      logger.debug('[GameStateManager] Enter System failed: No star present.');
      return false; // Indicate failure
    }

    try {
      logger.info(`[GameStateManager] Entering system at ${this.player.worldX},${this.player.worldY}...`);
      const system = new SolarSystem(this.player.worldX, this.player.worldY, this.gameSeedPRNG);
      logger.info(`[GameStateManager] Generated System: ${system.name} (${system.starType})`);

      // Set player position relative to system center
      const entryAngle = Math.atan2(this.player.worldY, this.player.worldX); // Or maybe based on entry vector?
      const entryDist = system.edgeRadius * 0.85; // Enter just inside the edge
      this.player.systemX = Math.cos(entryAngle) * entryDist;
      this.player.systemY = Math.sin(entryAngle) * entryDist;

      // Reset player visual state for system view
      this.player.shipDirection = GLYPHS.SHIP_NORTH; // Default direction on entry
      this.player.char = this.player.shipDirection;

      // Update state
      const oldState = this._state;
      this._state = 'system';
      this._currentSystem = system;
      this._currentPlanet = null;
      this._currentStarbase = null;

      logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Entered ${system.name})`);
      // *** Publish event instead of calling callback ***
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
      eventManager.publish(GameEvents.SYSTEM_ENTERED, system); // Publish system data

      return true; // Indicate success
    } catch (error) {
      logger.error(`[GameStateManager] Failed to create or enter solar system at ${this.player.worldX},${this.player.worldY}: {error}`);
      this._currentSystem = null; // Ensure system is null on failure
      // Stay in hyperspace state
      return false; // Indicate failure
    }
  }

  /** Attempts to leave the current system. Returns true on success, false otherwise. */
  leaveSystem(): boolean {
    logger.debug(`[GameStateManager] Attempting Leave System from: ${this._currentSystem?.name ?? 'Unknown System'}`);
    if (!this._currentSystem) {
      logger.warn('[GameStateManager] Leave System failed: Not currently in a system.');
      return false;
    }

    // Check if player is near the edge (use threshold slightly larger than edge radius)
    const distFromStarSq = this.player.distanceSqToSystemCoords(0, 0);
    const edgeThresholdSq = (this._currentSystem.edgeRadius * 0.8) ** 2; // Use same threshold as before for consistency

    if (distFromStarSq > edgeThresholdSq) {
      logger.info(`[GameStateManager] Leaving system ${this._currentSystem.name}...`);
      const oldState = this._state;
      this._state = 'hyperspace';
      this._currentSystem = null;
      this._currentPlanet = null;
      this._currentStarbase = null;
      this.player.char = CONFIG.PLAYER_CHAR; // Set char for hyperspace

      logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Left system)`);
      // *** Publish event instead of calling callback ***
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
      eventManager.publish(GameEvents.SYSTEM_LEFT);

      return true;
    } else {
      logger.debug('[GameStateManager] Leave System failed: Player not close enough to system edge.');
      return false;
    }
  }

  /** Attempts to land on a nearby object. Returns the landed object or null on failure. */
  landOnNearbyObject(): Planet | Starbase | null {
    logger.info(`>>> GameStateManager.landOnNearbyObject called. Player system coords: [${this.player.systemX.toFixed(0)}, ${this.player.systemY.toFixed(0)}]`);
    if (!this._currentSystem) {
      logger.warn('[GameStateManager] Land failed: Not in a system.');
      return null;
    }

    // Find the closest landable object within range
    const nearbyObject = this._currentSystem.getObjectNear(this.player.systemX, this.player.systemY);
    logger.info(`>>> GameStateManager: getObjectNear returned: ${nearbyObject?.name ?? 'null'}`);

    if (!nearbyObject) {
      logger.debug('[GameStateManager] Land failed: No object within landing distance.');
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
        // Set player surface coords (e.g., center of map)
        const mapSize = nearbyObject.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
        this.player.surfaceX = Math.floor(mapSize / 2);
        this.player.surfaceY = Math.floor(mapSize / 2);
        eventToPublish = GameEvents.PLANET_LANDED;
        eventData = nearbyObject;
      } else if (nearbyObject instanceof Starbase) {
        this._state = 'starbase';
        this._currentStarbase = nearbyObject;
        this._currentPlanet = null;
        // Set player coords for starbase interior
        this.player.surfaceX = 0; // Or designated entry point
        this.player.surfaceY = 0;
        eventToPublish = GameEvents.STARBASE_DOCKED;
        eventData = nearbyObject;
      } else {
        // Should not happen if getObjectNear is correct
        logger.error(`[GameStateManager] Land failed: Nearby object ${nearbyObject} has unknown type.`);
        return null;
      }

      this.player.char = CONFIG.PLAYER_CHAR; // Set char for surface/docked state

      logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Landed/Docked at ${nearbyObject.name})`);
      // *** Publish event instead of calling callback ***
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state);
      if (eventToPublish && eventData) {
        eventManager.publish(eventToPublish, eventData);
      }

      return nearbyObject; // Return the object landed on/docked at
    } catch (error) {
      logger.error(`[GameStateManager] Failed to prepare surface or land on ${nearbyObject.name}: ${error}`);
      // Revert state changes if surface prep failed? Or handle in Game loop?
      // For now, don't change state and return null.
      this.statusMessage = `Landing Error on ${nearbyObject.name}: ${error instanceof Error ? error.message : String(error)}`;
      this._currentPlanet = null;
      this._currentStarbase = null;
      // this.state remains 'system'
      return null;
    }
  }

  /** Attempts to lift off from a planet or starbase. Returns true on success, false otherwise. */
  liftOff(): boolean {
    logger.debug('[GameStateManager] Attempting Liftoff...');
    if (this._state !== 'planet' && this._state !== 'starbase') {
      logger.warn(`[GameStateManager] Liftoff failed: Cannot liftoff from state '${this._state}'.`);
      return false;
    }
    if (!this._currentSystem) {
      // This indicates a serious state inconsistency
      logger.error(`[GameStateManager] Liftoff failed: State is '${this._state}' but currentSystem is null! Attempting recovery.`);
      // Recover to hyperspace? Or throw? For now, try hyperspace.
      this._state = 'hyperspace';
      this._currentPlanet = null;
      this._currentStarbase = null;
      eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state); // Publish recovery state
      return false; // Indicate failure / abnormal recovery
    }

    const sourceObj = this._currentPlanet || this._currentStarbase;
    const liftedFromName = sourceObj?.name ?? 'Unknown Location';

    logger.info(`[GameStateManager] Lifting off from ${liftedFromName}...`);

    // Place player back in system view, near the object
    if (sourceObj) {
      // Place slightly "above" the object in system view coordinates?
      this.player.systemX = sourceObj.systemX;
      this.player.systemY = sourceObj.systemY - CONFIG.LANDING_DISTANCE * 0.1; // Example offset
    } else {
      // Fallback position if source object somehow null (shouldn't happen)
      this.player.systemX = 0;
      this.player.systemY = 0;
      logger.warn('[GameStateManager] Liftoff source object was null, placing player at system origin.');
    }

    // Reset player direction and char for system view
    this.player.shipDirection = GLYPHS.SHIP_NORTH; // Default direction after liftoff
    this.player.char = this.player.shipDirection;

    // Update state
    const oldState = this._state;
    this._state = 'system';
    this._currentPlanet = null;
    this._currentStarbase = null;

    logger.info(`[GameStateManager] State changed: '${oldState}' -> '${this._state}' (Lifted off from ${liftedFromName})`);
    // *** Publish event instead of calling callback ***
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
      // logger.debug(`[GameStateManager] No star found at: ${worldX}, ${worldY}`); // Can be noisy
      return null;
    }

    try {
      // Create a temporary system for peeking - Note: Could cache this slightly
      // if peeking at the same system repeatedly before moving.
      const tempSystem = new SolarSystem(worldX, worldY, this.gameSeedPRNG);
      // logger.debug(`[GameStateManager] Peeked at system: ${tempSystem.name} (${tempSystem.starType})`); // Can be noisy
      return tempSystem;
    } catch (error) {
      logger.error(`[GameStateManager] Error peeking at system at ${worldX}, ${worldY}: ${error}`);
      return null;
    }
  }

  /** Clears the peeked system cache/reference (if any). */
  resetPeekedSystem() {
    // If caching was implemented for peekAtSystem, clear it here.
    // For now, this method might not be strictly needed if peek just creates a new temp system each time.
    // this.peekedSystem = null; // Example if caching existed
  }
}