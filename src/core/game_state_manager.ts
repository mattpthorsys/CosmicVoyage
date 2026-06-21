import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { readReadySurfaceData } from '../entities/planet/surface_data';
import { Starbase } from '../entities/starbase';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { STATUS_MESSAGES } from '../constants/messages';
import { GLYPHS } from '../constants/visual';
import { logger } from '../utils/logger';
import { eventManager, GameEvents, Unsubscribe } from './event_manager';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { findSystemPlanetByPath, LocationSaveData } from './save_game';

// Define GameState type here or import from a shared types file
export type GameState = 'hyperspace' | 'system' | 'orbit' | 'planet' | 'starbase';

export type ActiveGameLocation =
  | { kind: 'hyperspace' }
  | { kind: 'system'; system: SolarSystem }
  | {
      kind: 'orbit';
      system: SolarSystem;
      planet: Planet;
      orbitReference: Planet;
    }
  | {
      kind: 'planet';
      system: SolarSystem;
      planet: Planet;
      orbitReference: Planet;
    }
  | { kind: 'starbase'; system: SolarSystem; starbase: Starbase };

/** Manages the game's current state, context (system/planet/starbase), and transitions. */
export class GameStateManager {
  private _state: GameState;
  private _currentSystem: SolarSystem | null = null;
  private _currentPlanet: Planet | null = null;
  private _currentOrbitReferencePlanet: Planet | null = null;
  private _currentStarbase: Starbase | null = null;
  /** Holds the latest status message for the game state manager. */
  public statusMessage: string = ''; // Keep for action processor status

  // Dependencies needed for state transitions
  private player: Player;
  private gameSeedPRNG: PRNG;
  private systemDataGenerator: SystemDataGenerator;
  private readonly eventUnsubscribers: Unsubscribe[];

  /** Initializes GameStateManager. */
  constructor(player: Player, gameSeedPRNG: PRNG, systemDataGenerator: SystemDataGenerator) {
    this._state = 'hyperspace'; // Initial state
    this.player = player;
    this.gameSeedPRNG = gameSeedPRNG;
    this.systemDataGenerator = systemDataGenerator;
    logger.info(`[GameStateManager] Initialized. Initial state: '${this._state}'`);

    this.eventUnsubscribers = [
      eventManager.subscribe(GameEvents.ENTER_SYSTEM_REQUESTED, () => {
        this.enterSystem();
      }),
      eventManager.subscribe(GameEvents.LEAVE_SYSTEM_REQUESTED, () => {
        this.leaveSystem();
      }),
      eventManager.subscribe(GameEvents.LAND_REQUESTED, () => {
        this.landOnNearbyObject();
      }),
      eventManager.subscribe(GameEvents.LIFTOFF_REQUESTED, () => {
        this.liftOff();
      }),
    ];
    logger.info('[GameStateManager] Subscribed to action request events.');
  }

  // --- Getters for current state and context ---
  /** Returns state. */
  get state(): GameState {
    return this._state;
  }
  /** Returns current system. */
  get currentSystem(): SolarSystem | null {
    return this._currentSystem;
  }
  /** Returns current planet. */
  get currentPlanet(): Planet | null {
    return this._currentPlanet;
  }
  /** Returns current orbit reference planet. */
  get currentOrbitReferencePlanet(): Planet | null {
    return this._currentOrbitReferencePlanet ?? this._currentPlanet;
  }
  /** Returns current starbase. */
  get currentStarbase(): Starbase | null {
    return this._currentStarbase;
  }

  /** Returns a discriminated location view and rejects inconsistent internal context. */
  get location(): ActiveGameLocation {
    if (this._state === 'hyperspace') return { kind: 'hyperspace' };
    if (!this._currentSystem) {
      throw new Error(`Location invariant failed: ${this._state} requires a current system.`);
    }
    if (this._state === 'system') return { kind: 'system', system: this._currentSystem };
    if (this._state === 'starbase') {
      if (!this._currentStarbase) {
        throw new Error('Location invariant failed: starbase state requires a current starbase.');
      }
      return {
        kind: 'starbase',
        system: this._currentSystem,
        starbase: this._currentStarbase,
      };
    }
    if (!this._currentPlanet) {
      throw new Error(`Location invariant failed: ${this._state} requires a current planet.`);
    }
    const orbitReference = this._currentOrbitReferencePlanet ?? this._currentPlanet;
    return {
      kind: this._state,
      system: this._currentSystem,
      planet: this._currentPlanet,
      orbitReference,
    };
  }

  /** Reconstructs the active generated system and location from validated save data. */
  restoreLocation(location: LocationSaveData): SolarSystem | null {
    if (location.kind === 'hyperspace') {
      this._changeState('hyperspace', null, null, null);
      return null;
    }

    const basicProps =
      this.systemDataGenerator.getRoguePlanetSystemProperties(location.worldX, location.worldY) ??
      this.systemDataGenerator.getSystemProperties(location.worldX, location.worldY);
    if (!basicProps.exists) {
      throw new Error(`Saved system no longer exists at ${location.worldX},${location.worldY}.`);
    }

    const system = new SolarSystem(basicProps, location.worldX, location.worldY, this.gameSeedPRNG);
    const planet =
      location.kind === 'orbit' || location.kind === 'planet'
        ? findSystemPlanetByPath(system, location.bodyPath)
        : null;
    const orbitReference =
      location.kind === 'orbit' || location.kind === 'planet'
        ? findSystemPlanetByPath(system, location.orbitReferencePath)
        : null;
    const starbase = location.kind === 'starbase' ? system.starbase : null;

    if ((location.kind === 'orbit' || location.kind === 'planet') && !planet) {
      throw new Error(`Saved planetary body "${location.bodyPath}" could not be restored.`);
    }
    if (location.kind === 'starbase' && !starbase) {
      throw new Error('Saved starbase could not be restored.');
    }
    if (
      location.kind === 'starbase' &&
      location.starbaseName !== 'legacy-current-starbase' &&
      starbase?.name !== location.starbaseName
    ) {
      throw new Error(`Saved starbase "${location.starbaseName}" no longer matches this location.`);
    }

    this._currentOrbitReferencePlanet = orbitReference ?? planet;
    this._changeState(location.kind, system, planet, starbase);
    return system;
  }

  // --- State Transition Logic ---
  // Methods now primarily act as event handlers, but can still be called directly if needed

  /** Attempts to enter a system from hyperspace. Returns true on success, false otherwise. */
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
      this.statusMessage = system.isStarless
        ? `<h>--- Entering local frame: ${system.name} ---</h>`
        : STATUS_MESSAGES.HYPERSPACE_ENTERING(system.name);
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
      logger.warn(
        '[GameStateManager] Leave System failed: Not currently in a system (internal state error).'
      );
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
      if (nearbyObject instanceof Planet) {
        const orbitParent = this._currentSystem.getOrbitParentFor(nearbyObject);
        const insertionTarget =
          orbitParent === nearbyObject ? nearbyObject.name : `${orbitParent.name} local space`;
        this._currentOrbitReferencePlanet = orbitParent;
        this._changeState('orbit', this._currentSystem, orbitParent, null);
        this.player.render.char = CONFIG.PLAYER_CHAR;
        this.statusMessage = `Orbital insertion at ${insertionTarget}.`;
        eventManager.publish(GameEvents.PLANET_ORBIT_ENTERED, orbitParent);
        return nearbyObject;
      }

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

  /** Lands the ship at the selected surface coordinates from orbit. */
  landFromOrbit(targetPlanet: Planet, surfaceX: number, surfaceY: number): Planet | null {
    if (this._state !== 'orbit') {
      logger.warn(`[GameStateManager.landFromOrbit] Attempted orbital landing from state ${this._state}.`);
      return null;
    }
    try {
      const newState = this._prepareSurfaceAndLand(targetPlanet, surfaceX, surfaceY);
      if (newState) {
        this.statusMessage = STATUS_MESSAGES.SYSTEM_LAND_APPROACHING(targetPlanet.name);
        logger.info(`[GameStateManager] Orbital landing committed for ${targetPlanet.name}.`);
        return targetPlanet;
      }
    } catch (error) {
      logger.error(`[GameStateManager] Failed orbital landing on ${targetPlanet.name}: ${error}`);
      this.statusMessage = `Landing Error on ${targetPlanet.name}: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    return null;
  }

  /** Launches the ship from the surface and restores orbital state. */
  launchFromSurfaceToOrbit(): boolean {
    if (this._state !== 'planet' || !this._currentPlanet || !this._currentSystem) {
      this.statusMessage = 'Launch requires a landed ship on a planet surface.';
      return false;
    }
    const planet = this._currentPlanet;
    const orbitReference = this._currentSystem.getOrbitParentFor(planet);
    this._setPlayerStateAtSystemObject(planet);
    this._changeState('orbit', this._currentSystem, planet, null);
    this._currentOrbitReferencePlanet = orbitReference;
    this.player.render.char = CONFIG.PLAYER_CHAR;
    this.statusMessage = `Launched to orbit of ${planet.name}.`;
    eventManager.publish(GameEvents.PLANET_ORBIT_ENTERED, planet);
    return true;
  }

  /** Leaves orbit and restores the player to local system travel. */
  leaveOrbit(): boolean {
    if (this._state !== 'orbit') {
      logger.warn(`[GameStateManager.leaveOrbit] Attempted to leave orbit from state ${this._state}.`);
      return false;
    }
    if (!this._currentSystem) {
      this._changeState('hyperspace', null, null, null);
      this.statusMessage = 'Orbit error: system data lost. Returning to hyperspace.';
      return false;
    }
    const planet = this._currentPlanet;
    if (planet) {
      this._setPlayerStateAtSystemObject(planet);
    }
    this._changeState('system', this._currentSystem, null, null);
    this.statusMessage = planet ? `Departed orbit of ${planet.name}.` : 'Departed orbit.';
    return true;
  }

  /** Attempts to lift off from a planet or starbase. Returns true on success, false otherwise. */
  liftOff(): boolean {
    if (this._state === 'orbit') {
      return this.leaveOrbit();
    }
    if (this._state !== 'planet' && this._state !== 'starbase') {
      logger.warn(
        `[GameStateManager.liftOff] Attempted liftoff while not landed/docked (State: ${this._state})`
      );
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
    this._setPlayerStateAtSystemObject(sourceObj); // Update player position/render state
    this._changeState('system', this._currentSystem, null, null); // Change state and publish
    this.statusMessage = STATUS_MESSAGES.LIFTOFF_SUCCESS(liftedFromName);
    logger.info(`[GameStateManager] Successfully lifted off from ${liftedFromName}`);
    return true;
  }

  // --- Private Helper Methods for State Transitions ---

  /** Checks if a star system or explorable rogue planetary-mass object exists at the player's current world coordinates. */
  private _canEnterSystemAtCurrentLocation(): boolean {
    return (
      this.systemDataGenerator.getSystemMapProperties(
        this.player.position.worldX,
        this.player.position.worldY
      ).exists ||
      this.systemDataGenerator.getRoguePlanetSystemProperties(
        this.player.position.worldX,
        this.player.position.worldY
      ) !== null
    );
  }

  /** Creates and initializes a new SolarSystem instance. */
  private _createAndInitializeSystem(): SolarSystem {
    logger.info(
      `[GameStateManager] Creating system at <span class="math-inline">\{this\.player\.position\.worldX\},</span>{this.player.position.worldY}...`
    );
    const basicProps =
      this.systemDataGenerator.getRoguePlanetSystemProperties(
        this.player.position.worldX,
        this.player.position.worldY
      ) ??
      this.systemDataGenerator.getSystemProperties(this.player.position.worldX, this.player.position.worldY);
    const system = new SolarSystem(
      basicProps,
      this.player.position.worldX,
      this.player.position.worldY,
      this.gameSeedPRNG
    );
    logger.info(
      `[GameStateManager] Generated System: <span class="math-inline">\{system\.name\} \(</span>{system.starType})`
    );
    return system;
  }

  /** Sets the player's position and rendering state upon entering a system. */
  private _setPlayerStateForSystemEntry(system: SolarSystem): void {
    const entryDist = system.edgeRadius * 0.85; // Enter near the edge
    const travelDx = this.player.position.lastWorldMoveDx;
    const travelDy = this.player.position.lastWorldMoveDy;
    const travelLength = Math.hypot(travelDx, travelDy);

    if (travelLength > 0 && Number.isFinite(travelLength)) {
      this.player.position.systemX = -(travelDx / travelLength) * entryDist;
      this.player.position.systemY = -(travelDy / travelLength) * entryDist;
      this.player.render.directionGlyph = this._getShipGlyphForVector(travelDx, travelDy);
    } else {
      const entryAngle = Math.atan2(this.player.position.worldY, this.player.position.worldX);
      this.player.position.systemX = Math.cos(entryAngle) * entryDist;
      this.player.position.systemY = Math.sin(entryAngle) * entryDist;
      this.player.render.directionGlyph = GLYPHS.SHIP_NORTH; // Default facing
    }

    this.player.render.char = this.player.render.directionGlyph;
    logger.debug(
      `[GameStateManager] Player position set for system entry: [${this.player.position.systemX.toExponential(
        1
      )}, ${this.player.position.systemY.toExponential(1)}]m`
    );
  }

  /** Returns ship glyph for vector. */
  private _getShipGlyphForVector(dx: number, dy: number): string {
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
    }
    if (dy !== 0) {
      return dy > 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
    }
    return GLYPHS.SHIP_NORTH;
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
  private _prepareSurfaceAndLand(
    targetObject: Planet | Starbase,
    surfaceX?: number,
    surfaceY?: number
  ): GameState | null {
    if (targetObject instanceof Planet && !targetObject.isSurfaceReady()) {
      targetObject.prepareSurfaceInBackground();
      this.statusMessage = `Landing data for ${targetObject.name} is still preparing.`;
      return null;
    }
    if (targetObject instanceof Starbase) {
      targetObject.ensureSurfaceReady();
    }

    const oldState = this._state;
    let newState: GameState | null = null;
    let eventToPublish: typeof GameEvents.PLANET_LANDED | typeof GameEvents.STARBASE_DOCKED | null = null;
    let eventData: Planet | Starbase | null = null;

    if (targetObject instanceof Planet) {
      newState = 'planet';
      this._currentOrbitReferencePlanet =
        this._currentSystem?.getOrbitParentFor(targetObject) ?? targetObject;
      const mapSize = readReadySurfaceData(targetObject)?.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
      this.player.position.surfaceX = ((Math.floor(surfaceX ?? mapSize / 2) % mapSize) + mapSize) % mapSize;
      this.player.position.surfaceY = Math.max(0, Math.min(mapSize - 1, Math.floor(surfaceY ?? mapSize / 2)));
      this.player.terrainVehicle.shipSurfaceX = this.player.position.surfaceX;
      this.player.terrainVehicle.shipSurfaceY = this.player.position.surfaceY;
      this.player.terrainVehicle.deployed = false;
      this.player.terrainVehicle.moving = false;
      this.player.terrainVehicle.onFoot = false;
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
      `[GameStateManager] State changed: '${oldState}' -> '${newState}' (Landed/Docked at ${targetObject.name})`
    );
    return newState; // Indicate success
  }

  /** Sets the player's system position and rendering state at the current object coordinates. */
  private _setPlayerStateAtSystemObject(sourceObject: Planet | Starbase | null): void {
    if (sourceObject) {
      this.player.position.systemX = sourceObject.systemX;
      this.player.position.systemY = sourceObject.systemY;
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
    if (newState !== 'orbit' && newState !== 'planet') {
      this._currentOrbitReferencePlanet = null;
    }
    logger.debug(`[GameStateManager._changeState] State changing: '${oldState}' -> '${newState}'`);
    eventManager.publish(GameEvents.GAME_STATE_CHANGED, {
      previousState: oldState,
      state: this._state,
    });
  }

  /**
   * Checks if a system exists at the given world coordinates and returns a
   * temporary SolarSystem object with basic information if it does.
   */
  peekAtSystem(worldX: number, worldY: number): SolarSystem | null {
    logger.debug(`[GameStateManager] Peeking at system at: ${worldX}, ${worldY}`);
    const basicProps =
      this.systemDataGenerator.getRoguePlanetSystemProperties(worldX, worldY) ??
      this.systemDataGenerator.getSystemProperties(worldX, worldY);

    if (!basicProps.exists) {
      return null;
    }

    try {
      // Create a temporary system for peeking
      const tempSystem = new SolarSystem(basicProps, worldX, worldY, this.gameSeedPRNG);
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
    this.eventUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }
} // End GameStateManager class
