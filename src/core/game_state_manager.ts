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
  // Methods now primarily act as event handlers, but can still be called directly if needed

  /** Attempts to enter a system from hyperspace. Returns true on success, false otherwise. */
  setState(newState: GameState) {
    if (newState === 'system') {
      this.clearPlayArea();
    }
  }
  
  enterSystem(): boolean {
    if (this._state !== 'hyperspace') {
      logger.warn(`[GameStateManager] Cannot enter system, not in hyperspace (State: ${this._state})`);
      return false;
    }

    logger.debug(
      `[GameStateManager] Handling ${GameEvents.ENTER_SYSTEM_REQUESTED} event at World: <span class="math-inline">\{this\.player\.position\.worldX\},</span>{this.player.position.worldY}`
    );

    if (!this._canEnterSystemAtCurrentLocation()) {
      this.statusMessage = STATUS_MESSAGES.HYPERSPACE_NO_STAR;
      return false;
    }

    try {
      const system = this._createAndInitializeSystem();
      this._setPlayerStateForSystemEntry(system);
      this._changeState('system', system, null, null); // Use helper to change state and publish event
      this.statusMessage = STATUS_MESSAGES.HYPERSPACE_ENTERING(system.name);
      logger.info(`[GameStateManager] Successfully entered system ${system.name}`);
      return true; // Indicate success
    } catch (error) {
      logger.error(
        `[GameStateManager] Failed to create or enter solar system at <span class="math-inline">\{this\.player\.position\.worldX\},</span>{this.player.position.worldY}: ${error}`
      );
      this._currentSystem = null; // Ensure system is null on failure
      this.statusMessage = `System Entry Failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      // State remains 'hyperspace'
      return false; // Indicate failure
    }
  }

  /** Attempts to leave the current system. Returns true on success, false otherwise. */
  leaveSystem(): boolean {
    if (this._state !== 'system') {
      logger.warn(
        `[GameStateManager.leaveSystem] Attempted to leave system while not in system state (State: ${this._state})`
      );
      return false;
    }
    logger.debug(
      `[GameStateManager] Handling ${GameEvents.LEAVE_SYSTEM_REQUESTED} event from: ${
        this._currentSystem?.name ?? 'Unknown System'
      }`
    );

    if (!this._currentSystem) {
      logger.warn('[GameStateManager] Leave System failed: Not currently in a system (internal state error).');
      this.statusMessage = 'Cannot leave system: System data missing.';
      return false;
    }

    if (this._isPlayerNearSystemEdge()) {
      logger.info(`[GameStateManager] Leaving system ${this._currentSystem.name}...`);
      this._setPlayerStateForHyperspace();
      this._changeState('hyperspace', null, null, null); // Change state and publish
      this.statusMessage = STATUS_MESSAGES.SYSTEM_LEAVING;
      logger.info(`[GameStateManager] Successfully left system.`);
      return true;
    } else {
      logger.debug('[GameStateManager] Leave System failed: Player not close enough to system edge.');
      // Publish status message directly or let Game handle it via terminal overlay
      eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, {
        message: STATUS_MESSAGES.SYSTEM_LEAVE_TOO_CLOSE,
        hasStarbase: false,
      });
      return false;
    }
  }

  /** Attempts to land on a nearby object. Returns the landed object or null on failure. */
  landOnNearbyObject(): Planet | Starbase | null {
    if (this._state !== 'system') {
      logger.warn(
        `[GameStateManager.landOnNearbyObject] Attempted to land while not in system state (State: ${this._state})`
      );
      return null;
    }
    logger.info(
      `[GameStateManager] Handling <span class="math-inline">\{GameEvents\.LAND\_REQUESTED\} event\. Player system coords\: \[</span>{this.player.position.systemX.toFixed(0)}, ${this.player.position.systemY.toFixed(
        0
      )}]`
    );

    if (!this._currentSystem) {
      logger.warn('[GameStateManager] Land failed: Not in a system (internal state error).');
      this.statusMessage = 'Cannot land: System data missing.';
      return null;
    }

    const nearbyObject = this._findLandableObject();
    if (!nearbyObject) {
      logger.debug('[GameStateManager] Land failed: No object within landing distance.');
      // Publish status message directly or let Game handle it
      eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, {
        message: STATUS_MESSAGES.SYSTEM_LAND_FAIL_NO_TARGET,
        hasStarbase: false,
      });
      return null;
    }

    logger.info(`[GameStateManager] Landing on ${nearbyObject.name} (Type: ${nearbyObject.type})...`);
    try {
      // Prepare surface and update state if successful
      const newState = this._prepareSurfaceAndLand(nearbyObject);
      if (newState) {
        this.statusMessage = STATUS_MESSAGES.SYSTEM_LAND_APPROACHING(nearbyObject.name);
        logger.info(`[GameStateManager] Successfully landed/docked at ${nearbyObject.name}`);
        return nearbyObject; // Return the object landed on/docked at
      } else {
        // Landing was aborted during surface prep or state change
        return null;
      }
    } catch (error) {
      logger.error(`[GameStateManager] Failed to prepare surface or land on ${nearbyObject.name}: ${error}`);
      this.statusMessage = `Landing Error on ${nearbyObject.name}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this._currentPlanet = null; // Ensure context is cleared on failure
      this._currentStarbase = null;
      // State remains 'system'
      return null;
    }
  }

  /** Attempts to lift off from a planet or starbase. Returns true on success, false otherwise. */
  liftOff(): boolean {
    if (this._state !== 'planet' && this._state !== 'starbase') {
      logger.warn(`[GameStateManager.liftOff] Attempted liftoff while not landed/docked (State: ${this._state})`);
      return false;
    }
    logger.debug(`[GameStateManager] Handling ${GameEvents.LIFTOFF_REQUESTED} event...`);

    if (!this._currentSystem) {
      // This indicates a serious state inconsistency
      logger.error(
        `[GameStateManager] Liftoff failed: State is '${this._state}' but currentSystem is null! Attempting recovery.`
      );
      this._changeState('hyperspace', null, null, null); // Recover to hyperspace
      this.statusMessage = 'Liftoff Error: System data lost. Returning to hyperspace.';
      return false; // Indicate failure / abnormal recovery
    }

    const sourceObj = this._currentPlanet || this._currentStarbase;
    const liftedFromName = sourceObj?.name ?? 'Unknown Location';

    logger.info(`[GameStateManager] Lifting off from ${liftedFromName}...`);
    this._setPlayerStateAfterLiftoff(sourceObj); // Update player position/render state
    this._changeState('system', this._currentSystem, null, null); // Change state and publish
    this.statusMessage = STATUS_MESSAGES.LIFTOFF_SUCCESS(liftedFromName);
    logger.info(`[GameStateManager] Successfully lifted off from ${liftedFromName}`);
    return true;
  }

  // --- Private Helper Methods for State Transitions ---

  /** Checks if a star system exists at the player's current world coordinates. */
  private _canEnterSystemAtCurrentLocation(): boolean {
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.position.worldX, this.player.position.worldY, baseSeedInt);
    return hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;
  }

  /** Creates and initializes a new SolarSystem instance. */
  private _createAndInitializeSystem(): SolarSystem {
    logger.info(
      `[GameStateManager] Creating system at <span class="math-inline">\{this\.player\.position\.worldX\},</span>{this.player.position.worldY}...`
    );
    const system = new SolarSystem(this.player.position.worldX, this.player.position.worldY, this.gameSeedPRNG);
    logger.info(
      `[GameStateManager] Generated System: <span class="math-inline">\{system\.name\} \(</span>{system.starType})`
    );
    return system;
  }

  /** Sets the player's position and rendering state upon entering a system. */
  private _setPlayerStateForSystemEntry(system: SolarSystem): void {
    const entryAngle = Math.atan2(this.player.position.worldY, this.player.position.worldX);
    const entryDist = system.edgeRadius * 0.85; // Enter near the edge
    this.player.position.systemX = Math.cos(entryAngle) * entryDist;
    this.player.position.systemY = Math.sin(entryAngle) * entryDist;
    this.player.render.directionGlyph = GLYPHS.SHIP_NORTH; // Default facing
    this.player.render.char = this.player.render.directionGlyph;
    logger.debug(
      `[GameStateManager] Player position set for system entry: [${this.player.position.systemX.toExponential(
        1
      )}, ${this.player.position.systemY.toExponential(1)}]m`
    );
  }

  /** Checks if the player is close enough to the system edge to leave. */
  private _isPlayerNearSystemEdge(): boolean {
    if (!this._currentSystem) return false;
    const distSq = this.player.distanceSqToSystemCoords(0, 0);
    const edgeThresholdSq = (this._currentSystem.edgeRadius * CONFIG.SYSTEM_EDGE_LEAVE_FACTOR) ** 2;
    return distSq > edgeThresholdSq;
  }

  /** Resets player rendering state for hyperspace travel. */
  private _setPlayerStateForHyperspace(): void {
    this.player.render.char = CONFIG.PLAYER_CHAR;
    // Reset system/surface coords? Optional, depends on if they should persist.
    // this.player.position.systemX = 0;
    // this.player.position.systemY = 0;
  }

  /** Finds the closest landable object within range. */
  private _findLandableObject(): Planet | Starbase | null {
    if (!this._currentSystem) return null;
    return this._currentSystem.getObjectNear(this.player.position.systemX, this.player.position.systemY);
  }

  /** Prepares the target object's surface and updates game state for landing/docking. */
  private _prepareSurfaceAndLand(targetObject: Planet | Starbase): GameState | null {
    targetObject.ensureSurfaceReady(); // Throws on failure

    const oldState = this._state;
    let newState: GameState | null = null;
    let eventToPublish: string | null = null;
    let eventData: Planet | Starbase | null = null;

    if (targetObject instanceof Planet) {
      newState = 'planet';
      const mapSize = targetObject.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
      this.player.position.surfaceX = Math.floor(mapSize / 2);
      this.player.position.surfaceY = Math.floor(mapSize / 2);
      eventToPublish = GameEvents.PLANET_LANDED;
      eventData = targetObject;
    } else if (targetObject instanceof Starbase) {
      newState = 'starbase';
      this.player.position.surfaceX = 0; // Or designated entry point
      this.player.position.surfaceY = 0;
      eventToPublish = GameEvents.STARBASE_DOCKED;
      eventData = targetObject;
    } else {
      logger.error(`[GameStateManager] Land failed: Nearby object ${targetObject} has unknown type.`);
      this.statusMessage = `Landing Error: Unknown object type.`;
      return null; // Indicate failure
    }

    this._changeState(
      newState,
      this._currentSystem,
      newState === 'planet' ? (targetObject as Planet) : null,
      newState === 'starbase' ? (targetObject as Starbase) : null
    );
    this.player.render.char = CONFIG.PLAYER_CHAR; // Set char for surface/docked state

    if (eventToPublish && eventData) {
      eventManager.publish(eventToPublish, eventData);
    }
    logger.info(
      `[GameStateManager] State changed: '<span class="math-inline">\{oldState\}' \-\> '</span>{newState}' (Landed/Docked at ${targetObject.name})`
    );
    return newState; // Indicate success
  }

  /** Sets the player's position and rendering state after lifting off. */
  private _setPlayerStateAfterLiftoff(sourceObject: Planet | Starbase | null): void {
    if (sourceObject) {
      // Position slightly offset from the source object
      this.player.position.systemX =
        sourceObject.systemX + CONFIG.LANDING_DISTANCE * CONFIG.LIFTOFF_DISTANCE_FACTOR * 0.1; // Small X offset
      this.player.position.systemY = sourceObject.systemY - CONFIG.LANDING_DISTANCE * CONFIG.LIFTOFF_DISTANCE_FACTOR; // Offset 'above'
    } else {
      // Fallback position if source object somehow null
      this.player.position.systemX = 0;
      this.player.position.systemY = 0;
      logger.warn('[GameStateManager] Liftoff source object was null, placing player at system origin.');
    }
    // Reset player direction and char for system view
    this.player.render.directionGlyph = GLYPHS.SHIP_NORTH; // Default direction
    this.player.render.char = this.player.render.directionGlyph;
  }

  /** Centralized method to change the game state and publish the event. */
  private _changeState(
    newState: GameState,
    system: SolarSystem | null,
    planet: Planet | null,
    starbase: Starbase | null
  ): void {
    const oldState = this._state;
    this._state = newState;
    this._currentSystem = system;
    this._currentPlanet = planet;
    this._currentStarbase = starbase;
    logger.debug(
      `[GameStateManager._changeState] State changing: '<span class="math-inline">\{oldState\}' \-\> '</span>{newState}'`
    );
    eventManager.publish(GameEvents.GAME_STATE_CHANGED, this._state); // Publish notification
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
