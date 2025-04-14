// src/core/game.ts (Handles Scan Logic correctly after ActionProcessor decoupling)

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { MineralRichness, SPECTRAL_TYPES, ELEMENTS, STATUS_MESSAGES } from '../constants';
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager';
import { ActionProcessor, ActionProcessResult } from './action_processor';
import { fastHash } from '@/utils/hash';
import { Planet } from '@/entities/planet';
import { Starbase } from '@/entities/starbase';
import { SolarSystem } from '@/entities/solar_system';
import { eventManager, GameEvents } from './event_manager';
import { MovementSystem } from '@/systems/movement_system';
import { CargoSystem } from '@/systems/cargo_systems';
import { MiningSystem } from '@/systems/mining_system';
import { TerminalOverlay } from '../rendering/terminal_overlay';

// ScanTarget type includes SolarSystem now
type ScanTarget = Planet | Starbase | { type: 'Star'; name: string; starType: string } | SolarSystem;

/** Main game class - Coordinates components and manages the loop. */
export class Game {
  // Core Components
  private readonly renderer: RendererFacade;
  private readonly player: Player;
  private readonly gameSeedPRNG: PRNG;
  private readonly inputManager: InputManager;
  private readonly stateManager: GameStateManager;
  private readonly actionProcessor: ActionProcessor;
  private readonly movementSystem: MovementSystem;
  private readonly cargoSystem: CargoSystem;
  private readonly miningSystem: MiningSystem;
  private readonly terminalOverlay: TerminalOverlay; // Add terminal overlay instance

  // Game Loop State, Status, Flags, Popup State... (remain the same)
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private statusMessage: string = 'Initializing Systems...';
  private forceFullRender: boolean = true;
  private popupState: 'inactive' | 'opening' | 'active' | 'closing' = 'inactive';
  private popupContent: string[] | null = null;
  private popupOpenCloseProgress: number = 0;
  private popupTextProgress: number = 0;
  private popupTotalChars: number = 0;
  private readonly popupAnimationSpeed: number = 5.0;
  private readonly popupTypingSpeed: number = 80;

  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('[Game] Constructing instance...');
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
    this.gameSeedPRNG = new PRNG(initialSeed);
    this.renderer = new RendererFacade(canvasId, statusBarId);
    this.player = new Player();
    this.inputManager = new InputManager();
    // Pass player AND stateManager, as ActionProcessor still needs peekAtSystem
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG);
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager); // Pass dependencies
    this.terminalOverlay = new TerminalOverlay(); // Instantiate the overlay

    // instantiate various systems
    this.movementSystem = new MovementSystem(this.player);
    this.cargoSystem = new CargoSystem();
    this.miningSystem = new MiningSystem(this.player, this.stateManager, this.cargoSystem);

    // Subscribe to Game State Changes
    eventManager.subscribe(GameEvents.GAME_STATE_CHANGED, this._handleGameStateChange.bind(this));
    eventManager.subscribe(GameEvents.TRADE_REQUESTED, this._handleTradeRequest.bind(this));
    eventManager.subscribe(GameEvents.REFUEL_REQUESTED, this._handleRefuelRequest.bind(this));
    eventManager.subscribe(GameEvents.PLAYER_CARGO_ADDED, this._handleCargoUpdate.bind(this));

    // Add resize listener
    window.addEventListener('resize', this._handleResize.bind(this));
    this._handleResize(); // Initial fit

    logger.info(
      `[Game] Instance constructed. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${
        this.stateManager.state
      }'`
    );
  }

  // --- Event Handlers ---
  /** Handles the gameStateChanged event from the event manager. */
  private _handleGameStateChange(newState: GameState): void {
    this.forceFullRender = true;
    logger.debug(`[Game] State change event received: ${newState}, forcing full render.`);
    if (this.popupState !== 'inactive') {
      this.popupState = 'inactive';
      this.popupContent = null;
      logger.debug('[Game] Closing active popup due to game state change.');
    }
    // Reflect status messages potentially set by GameStateManager during transition
    this.statusMessage = this.stateManager.statusMessage || ''; // Use status from stateManager
    this.stateManager.statusMessage = ''; // Clear it after reading
  }

  private _handleCargoUpdate(data: { elementKey: string; amountAdded: number }): void {
    logger.debug(`[Game] Cargo update event received for ${data.elementKey}. Triggering render.`);
    this.forceFullRender = true; // Trigger re-render to show updated overlay potentially
  }

  private _handleResize(): void {
    logger.debug('[Game] Handling window resize...');
    this.renderer.fitToScreen();
    this.terminalOverlay.updateCharDimensions(this.renderer.getCharHeightPx());
    this.forceFullRender = true;
    this.lastUpdateTime = performance.now();
  }

  // --- Game Loop Control --- (startGame, stopGame remain the same)
  startGame(): void {
    if (this.isRunning) return;
    logger.info('[Game] Starting game loop...');
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.inputManager.startListening();
    this.inputManager.clearState();
    this.forceFullRender = true;
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
    if (this.miningSystem) {
      this.miningSystem.destroy();
    }
    if (this.movementSystem) {
      this.movementSystem.destroy();
    }
    eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, {
      message: 'Game stopped. Refresh to restart.',
      hasStarbase: false,
    });
    logger.info('[Game] Game loop stopped.');
  }

  // --- Core Game Loop ---
  private _loop(currentTime: DOMHighResTimeStamp): void {
    // ... (Loop structure remains the same) ...
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
      // ... (Error handling remains the same) ...
      const currentState = this.stateManager.state;
      let errorMessage = 'Unknown Loop Error';
      let errorStack = 'N/A';
      if (loopError instanceof Error) {
        errorMessage = loopError.message;
        errorStack = loopError.stack || 'No stack available';
      } else {
        try {
          errorMessage = JSON.stringify(loopError);
        } catch {
          errorMessage = String(loopError);
        }
      }
      logger.error(`[Game:_loop:${currentState}] Error during game loop: ${errorMessage}`, {
        errorObject: loopError,
        stack: errorStack,
      });
      this.statusMessage = `FATAL LOOP ERROR: ${errorMessage}. Refresh required.`;
      try {
        this._publishStatusUpdate();
      } catch {
        /* ignore */
      }
      this.stopGame();
      return;
    }

    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }

  // --- Input Processing (Handles Scan Logic) ---
  private _processInput(): void {
    // --- TEMPORARY: Add a message on 'i' key press ---
    if (this.inputManager.wasActionJustPressed('SCAN')) {
      // Temporarily hijacking SCAN key 'v'
      this.terminalOverlay.addMessage(`Test message added at ${new Date().toLocaleTimeString()}`);
      return; // Consume the input for this frame
    }
    // --- Add 'i' Key Binding for Testing ---
    if (this.inputManager.wasActionJustPressed('INFO_TEST')) {
      // Use a descriptive temporary action name
      this.terminalOverlay.addMessage(`Test message added at ${new Date().toLocaleTimeString()}`);
      // Potentially prevent other actions if 'i' is pressed, or let them proceed
      return; // Consume the input
    }
    // --- Check for Popup Closing First --- (remains the same)
    if (this.popupState === 'active') {
      if (
        this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
        this.inputManager.wasActionJustPressed('MOVE_RIGHT') ||
        this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') ||
        this.inputManager.wasActionJustPressed('QUIT') ||
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM')
      ) {
        logger.info('[Game:_processInput] Closing popup via key press.');
        this.popupState = 'closing';
        this.forceFullRender = true;
        this.statusMessage = '';
        return;
      }
      return;
    }
    if (this.popupState === 'opening' || this.popupState === 'closing') {
      return;
    }

    // --- Process Normal Actions ---
    let actionTaken = false;
    let actionResult: ActionProcessResult = null;
    const currentState = this.stateManager.state; // Get current state

    const discreteActions: string[] = [
      'ENTER_SYSTEM',
      'LEAVE_SYSTEM',
      'ACTIVATE_LAND_LIFTOFF',
      'SCAN',
      'SCAN_SYSTEM_OBJECT',
      'MINE',
      'TRADE',
      'REFUEL',
      'DOWNLOAD_LOG',
      'QUIT',
    ];
    for (const action of discreteActions) {
      if (this.inputManager.wasActionJustPressed(action)) {
        logger.debug(`[Game:_processInput] Processing discrete action: ${action}`);
        // Pass current state to ActionProcessor
        actionResult = this.actionProcessor.processAction(action, currentState);
        actionTaken = true;

        if (action === 'QUIT') {
          eventManager.publish(GameEvents.GAME_QUIT);
          this.stopGame();
          return;
        }
        break;
      }
    }

    // --- Handle Action Results ---
    if (actionTaken) {
      if (typeof actionResult === 'string') {
        // Action processor returned a status message
        this.statusMessage = actionResult;
      } else if (actionResult && typeof actionResult === 'object' && 'requestScan' in actionResult) {
        // Action processor requested a scan
        // *** Call the dedicated scan handler ***
        this._handleScanRequest(actionResult.requestScan);
      } else if (actionResult && typeof actionResult === 'object' && 'requestSystemPeek' in actionResult) {
        // Action processor requested a system peek (hyperspace scan action)
        logger.debug('[Game:_processInput] Handling requestSystemPeek...');
        const peekedSystem = this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY);
        if (peekedSystem) {
          // System found, trigger the scan popup directly with the peeked system
          this.statusMessage = STATUS_MESSAGES.HYPERSPACE_SCANNING_SYSTEM(peekedSystem.name);
          this._triggerScanPopup(peekedSystem); // Pass the SolarSystem object
        } else {
          // No system found at player's location
          this.statusMessage = STATUS_MESSAGES.HYPERSPACE_SCAN_FAIL;
        }
      }
      // Reflect any status message set by the state manager during an action event
      // (e.g., if land/liftoff set a message)
      if (this.stateManager.statusMessage) {
        this.statusMessage = this.stateManager.statusMessage;
        this.stateManager.statusMessage = ''; // Clear after reading
      }
    }

    // --- Process Movement --- (remains the same)
    if (!actionTaken && this.popupState === 'inactive') {
      let dx = 0,
        dy = 0;
      if (this.inputManager.isActionActive('MOVE_UP')) dy -= 1;
      if (this.inputManager.isActionActive('MOVE_DOWN')) dy += 1;
      if (this.inputManager.isActionActive('MOVE_LEFT')) dx -= 1;
      if (this.inputManager.isActionActive('MOVE_RIGHT')) dx += 1;

      if (dx !== 0 || dy !== 0) {
        if (
          this.statusMessage === '' ||
          !(
            this.statusMessage.toLowerCase().includes('error') ||
            this.statusMessage.toLowerCase().includes('fail') ||
            this.statusMessage.toLowerCase().includes('cannot') ||
            this.statusMessage.startsWith('Mined') ||
            this.statusMessage.startsWith('Sold') ||
            this.statusMessage.startsWith('Scan') ||
            this.statusMessage.startsWith('Purchased')
          )
        ) {
          this.statusMessage = '';
        }

        const isFine = this.inputManager.isActionActive('FINE_CONTROL');
        const isBoost = this.inputManager.isActionActive('BOOST');
        let useFine = isFine && !isBoost;

        try {
          // Define the payload for the event
          // (Ensure this matches the expected structure in MovementSystem.handleMoveRequest)
          const moveData: any = {
            // Use 'any' temporarily or define MoveRequestData interface
            dx,
            dy,
            isFineControl: useFine,
            isBoost: isBoost, // Pass boost state if needed by system
            context: currentState, // Pass the current game state
          };

          // Add specific context needed for surface movement
          if (currentState === 'planet') {
            const planet = this.stateManager.currentPlanet;
            if (planet) {
              // Ensure surface is ready before allowing move request on planet
              try {
                planet.ensureSurfaceReady(); // Ensure map is available
                moveData.surfaceContext = {
                  mapSize: planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE,
                };
              } catch (surfaceError) {
                logger.error(`[Game:_processInput] Error ensuring surface ready for move: ${surfaceError}`);
                this.statusMessage = STATUS_MESSAGES.ERROR_SURFACE_PREP('Cannot move');
                return; // Exit movement processing for this frame
              }
            } else {
              logger.error('[Game:_processInput] Player in planet state but currentPlanet is null during move.');
              this.terminalOverlay.addMessage(STATUS_MESSAGES.ERROR_DATA_MISSING('Planet'));
              return; // Exit movement processing
            }
          }

          // Publish the event
          eventManager.publish(GameEvents.MOVE_REQUESTED, moveData);
          // logger.debug(`[Game:_processInput] Published MOVE_REQUESTED event:`, moveData); // Can be noisy
        } catch (error) {
          // Catch errors during data gathering or publishing
          logger.error(`[Game:_processInput] Error preparing or publishing move request: ${error}`);
          this.statusMessage = `Move Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    }
  } // End _processInput

  /** Handles scan requests based on context */
  private _handleScanRequest(scanType: 'system_object' | 'planet_surface'): void {
    const currentState = this.stateManager.state;
    logger.debug(`[Game:_handleScanRequest] Handling scan request type '${scanType}' in state '${currentState}'`);

    let targetToScan: ScanTarget | null = null;
    let scanStatusMessage = '';

    if (scanType === 'system_object') {
      if (currentState === 'hyperspace') {
        // *** Find target for hyperspace scan ***
        const peekedSystem = this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY);
        if (peekedSystem) {
          // Comment: Target for hyperspace scan is the peeked SolarSystem object itself.
          targetToScan = peekedSystem;
          scanStatusMessage = STATUS_MESSAGES.HYPERSPACE_SCANNING_SYSTEM(peekedSystem.name);
        } else {
          scanStatusMessage = STATUS_MESSAGES.HYPERSPACE_SCAN_FAIL;
        }
      } else if (currentState === 'system') {
        // *** Find target for system scan ***
        const system = this.stateManager.currentSystem;
        if (!system) {
          scanStatusMessage = 'Scan Error: System data missing.';
        } else {
          const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
          //let status = `System: ${system.name} (${system.starType}) | Pos: ${this.player.position.systemX.toFixed(0)},${this.player.position.systemY.toFixed(0)}`;
          const distSqToObject = nearbyObject
            ? this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY)
            : Infinity;
          const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
          const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;

          if (distSqToStar < distSqToObject && distSqToStar < scanThresholdSq) {
            targetToScan = {
              type: 'Star',
              name: system.name, // Use the system's name (often the star's name)
              starType: system.starType, // Get the star type from the system
            };
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_STAR(system.name);
          } else if (nearbyObject && distSqToObject < scanThresholdSq) {
            // Comment: Target for system scan (near object) is the Planet/Starbase object.
            targetToScan = nearbyObject;
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_OBJECT(nearbyObject.name);
          } else {
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_FAIL_NO_TARGET;
          }
        }
      } else {
        logger.warn(
          `[Game:_handleScanRequest] Received 'system_object' scan request in unexpected state: ${currentState}`
        );
        scanStatusMessage = 'Cannot perform system scan now.';
      }
    } else if (scanType === 'planet_surface') {
      if (currentState === 'planet') {
        const planet = this.stateManager.currentPlanet;
        if (planet) {
          // Comment: Target for planet surface scan is the current Planet object.
          targetToScan = planet;
          scanStatusMessage = `Scanning surface of ${planet.name}...`;
        } else {
          logger.error('[Game:_handleScanRequest] Cannot scan planet surface: currentPlanet is null.');
          scanStatusMessage = 'Planet scan error: Data missing.';
        }
      } else {
        logger.warn(
          `[Game:_handleScanRequest] Received 'planet_surface' scan request in unexpected state: ${currentState}`
        );
        scanStatusMessage = 'Cannot perform surface scan now.';
      }
    }

    // --- Trigger Popup or show message ---
    if (targetToScan) {
      this.statusMessage = scanStatusMessage; // Show "Scanning..." message first
      this._triggerScanPopup(targetToScan); // Then trigger popup
    } else {
      this.statusMessage = scanStatusMessage; // Show error/failure message
    }
  }

  // --- Helper to trigger and format popups ---
  // Accepts SolarSystem for hyperspace star scans
  private _triggerScanPopup(target: ScanTarget | string): void {
    let lines: string[] | null = null;
    try {
      let targetName = 'Unknown Target';
      // Check for SolarSystem instance (hyperspace scan result)
      if (target instanceof SolarSystem) {
        lines = this._formatStarScanPopup(target); // Pass system object
        targetName = `Star (${target.name})`;
      } else if (typeof target === 'object' && target !== null && 'type' in target && target.type === 'Star') {
        // --- Explicit Type Assertion ---
        // Assign target to a new const with the explicitly asserted type within this block
        const starTarget = target as { type: 'Star'; name: string; starType: string };
        // --- End Assertion ---

        // We need the *current* system context to format the popup fully
        const system = this.stateManager.currentSystem;

        // Now use starTarget for property access
        if (system && system.name === starTarget.name && system.starType === starTarget.starType) {
          lines = this._formatStarScanPopup(system); // Format using the current system
          targetName = `Star (${system.name})`;
        } else {
          // Fallback if current system doesn't match the object data
          logger.error('[Game:_triggerScanPopup] Mismatch between star object data and current system state.');
          // Use starTarget for property access
          lines = [
            `--- STELLAR SCAN: ${starTarget.name} ---`,
            `Spectral Type: ${starTarget.starType}`,
            '(System context mismatch)',
          ];
          targetName = `Star (${starTarget.name})`;
        }
      } else if (target instanceof Planet || target instanceof Starbase) {
        // Handle Planet/Starbase
        targetName = target.name;
        lines = target.getScanInfo();
        if (target instanceof Planet && !target.scanned) {
          target.scan();
          lines = target.getScanInfo();
        }
      } else {
        logger.error('[Game:_triggerScanPopup] Unknown or invalid scan target type:', target);
        this.statusMessage = 'Error: Unknown object type for scan.';
        return;
      }

      // Proceed if lines were generated
      if (lines && lines.length > 0) {
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push(CONFIG.POPUP_CLOSE_TEXT);
        this.popupContent = lines;
        this.popupTotalChars =
          this.popupContent.reduce((sum, line) => sum + line.length, 0) + this.popupContent.length - 1;
        this.popupState = 'opening';
        this.popupOpenCloseProgress = 0;
        this.popupTextProgress = 0;
        this.forceFullRender = true;
        logger.info(`[Game] Opening scan popup for ${targetName}`);
      } else {
        this.statusMessage = 'Error: Failed to generate scan information.';
        logger.error('[Game:_triggerScanPopup] Generated scan lines array was null or empty for target:', targetName);
      }
    } catch (error) {
      logger.error(`[Game:_triggerScanPopup] Error generating scan popup content: ${error}`);
      this.statusMessage = `Scan Error: ${error instanceof Error ? error.message : 'Failed to get info'}`;
    }
  }

  // Formatting function remains the same
  private _formatStarScanPopup(system: SolarSystem): string[] {
    // ... (implementation unchanged) ...
    const lines: string[] = [];
    const starInfo = SPECTRAL_TYPES[system.starType];
    lines.push(`--- STELLAR SCAN: ${system.name} ---`);
    lines.push(`Spectral Type: ${system.starType}`);
    if (starInfo) {
      lines.push(`Temperature: ~${starInfo.temp.toLocaleString()} K`);
      lines.push(`Luminosity: ~${starInfo.brightness.toFixed(1)} (Rel. Sol)`);
      lines.push(`Mass: ~${starInfo.mass.toFixed(1)} Solar Masses`);
      lines.push(`Colour Index: ${starInfo.colour}`);
    } else {
      lines.push(`Temperature: Unknown`);
      lines.push(`Luminosity: Unknown`);
      lines.push(`Mass: Unknown`);
    }
    lines.push(`Planetary Bodies: ${system.planets.filter((p) => p !== null).length}`);
    lines.push(`Facilities: ${system.starbase ? 'Starbase Detected' : 'None Detected'}`);
    return lines;
  }

  // --- Game State Update --- (remains the same)
  private _update(deltaTime: number): void {
    let blockGameUpdates = false;
    switch (this.popupState) {
      case 'opening':
        this.popupOpenCloseProgress += this.popupAnimationSpeed * deltaTime;
        if (this.popupOpenCloseProgress >= 1) {
          this.popupOpenCloseProgress = 1;
          this.popupState = 'active';
          logger.debug('[Game:_update] Popup finished opening.');
        }
        this.forceFullRender = true;
        blockGameUpdates = true;
        break;
      case 'active':
        if (this.popupTextProgress < this.popupTotalChars) {
          this.popupTextProgress += this.popupTypingSpeed * deltaTime;
          this.popupTextProgress = Math.min(this.popupTotalChars, Math.floor(this.popupTextProgress));
          this.forceFullRender = true;
        }
        this.statusMessage = `Scan Details [←] Close [→]`;
        blockGameUpdates = true;
        break;
      case 'closing':
        this.popupOpenCloseProgress -= this.popupAnimationSpeed * deltaTime;
        if (this.popupOpenCloseProgress <= 0) {
          this.popupOpenCloseProgress = 0;
          this.popupState = 'inactive';
          this.popupContent = null;
          logger.debug('[Game:_update] Popup finished closing.');
          this.statusMessage = '';
        }
        this.forceFullRender = true;
        blockGameUpdates = true;
        break;
      case 'inactive':
        break;
    }

    this.terminalOverlay.update(deltaTime);

    if (!blockGameUpdates) {
      try {
        const currentState = this.stateManager.state;
        let stateUpdateStatus = '';
        switch (currentState) {
          case 'hyperspace':
            stateUpdateStatus = this._updateHyperspace(deltaTime);
            break;
          case 'system':
            stateUpdateStatus = this._updateSystem(deltaTime);
            break;
          case 'planet':
            stateUpdateStatus = this._updatePlanet(deltaTime);
            break;
          case 'starbase':
            stateUpdateStatus = this._updateStarbase(deltaTime);
            break;
          default:
            stateUpdateStatus = `Error: Unexpected state ${currentState}`;
            logger.warn(stateUpdateStatus);
        }
        if (stateUpdateStatus && this.statusMessage === '') {
          this.statusMessage = stateUpdateStatus;
        }
      } catch (updateError) {
        const stateWhenErrorOccurred = this.stateManager.state;
        let errorMessage = 'Unknown Update Error';
        if (updateError instanceof Error) errorMessage = updateError.message;
        else
          try {
            errorMessage = JSON.stringify(updateError);
          } catch {
            errorMessage = String(updateError);
          }
        logger.error(`[Game:_update:${stateWhenErrorOccurred}] Error during update logic: ${errorMessage}`, {
          errorObject: updateError,
        });
        this.statusMessage = `UPDATE ERROR: ${errorMessage}`;
        this.stopGame();
      }
    }
    this._publishStatusUpdate();
  }

  // --- State-specific update methods --- (remain the same)
  private _updateHyperspace(_deltaTime: number): string {
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.position.worldX, this.player.position.worldY, baseSeedInt);
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;
    let baseStatus = `Hyperspace | Loc: ${this.player.position.worldX},${this.player.position.worldY}`;
    if (isNearStar) {
      const peekedSystem = this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY);
      if (peekedSystem) {
        const starbaseText = peekedSystem.starbase ? ' (Starbase)' : '';
        baseStatus += ` | Near ${
          peekedSystem.name
        }${starbaseText}. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
      } else {
        baseStatus += ` | Near star system. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
      }
    } else {
      this.stateManager.resetPeekedSystem();
    }
    return baseStatus;
  }

  private _updateSystem(deltaTime: number): string {
    const system = this.stateManager.currentSystem;
    if (!system) {
      logger.error(
        "[Game:_updateSystem] In 'system' state but currentSystem is null! Attempting recovery to hyperspace."
      );
      eventManager.publish(GameEvents.LEAVE_SYSTEM_REQUESTED);
      return 'System Error: Data missing. Returning to hyperspace.';
    }
    system.updateOrbits(deltaTime);
    const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
    let status = `System: ${system.name} (${system.starType}) | Pos: ${this.player.position.systemX.toFixed(
      0
    )},${this.player.position.systemY.toFixed(0)}`;
    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${dist.toFixed(
        0
      )} u). [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Land/Dock / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
    } else if (this.isPlayerNearExit()) {
      const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
      const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;
      if (distSqToStar < scanThresholdSq) {
        status += ` | [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan Star / [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] Leave System`;
      } else {
        status += ` | Near system edge. [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] Leave System`;
      }
    } else {
      const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
      const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;
      if (distSqToStar < scanThresholdSq) {
        status += ` | [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan Star`;
      }
    }
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
    if (!planet) {
      logger.error(
        "[Game:_updatePlanet] In 'planet' state but currentPlanet is null! Attempting recovery to hyperspace."
      );
      eventManager.publish(GameEvents.LEAVE_SYSTEM_REQUESTED);
      return 'Planet Error: Data missing. Returning to hyperspace.';
    }
    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.position.surfaceX},${
      this.player.position.surfaceY
    } | Grav: ${planet.gravity.toFixed(2)}g | Temp: ${planet.surfaceTemp}K`;
    const actions = [`[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Liftoff`];
    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
      if (planet.scanned) {
        status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
        if (
          planet.mineralRichness !== MineralRichness.NONE &&
          !planet.isMined(this.player.position.surfaceX, this.player.position.surfaceY)
        ) {
          actions.push(`[${CONFIG.KEY_BINDINGS.MINE.toUpperCase()}] Mine`);
        }
      } else {
        actions.push(`[${CONFIG.KEY_BINDINGS.SCAN.toUpperCase()}] Scan`);
        status += ` | Scan: Required (Potential: ${planet.mineralRichness}).`;
      }
    } else {
      status += ` | Scan: N/A (${planet.type})`;
    }
    status += ` | Actions: ${actions.join(', ')}.`;
    return status;
  }

  private _updateStarbase(_deltaTime: number): string {
    const starbase = this.stateManager.currentStarbase;
    if (!starbase) {
      logger.error(
        "[Game:_updateStarbase] In 'starbase' state but currentStarbase is null! Attempting recovery to hyperspace."
      );
      eventManager.publish(GameEvents.LEAVE_SYSTEM_REQUESTED);
      return 'Starbase Error: Data missing. Returning to hyperspace.';
    }
    const actions = [
      `[${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade`,
      `[${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel`,
      `[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Depart`,
    ];
    return `Docked: ${starbase.name} | Actions: ${actions.join(', ')}.`;
  }

  // --- Rendering --- (remains the same)
  private _render(): void {
    const currentState = this.stateManager.state;
    try {
      if (currentState === 'system' || this.forceFullRender) {
        this.renderer.clear(true);
      }
      if (currentState === 'system') {
        this.renderer.drawStarBackground(this.player);
        this.renderer.renderBufferFull(true);
      }
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
              logger.error(`[Game:_render] Error ensuring surface ready for ${planet.name}: ${surfaceError}`);
              this._renderError(`Surface Error: ${surfaceError instanceof Error ? surfaceError.message : 'Unknown'}`);
            }
          } else {
            this._renderError('Planet data missing for render!');
          }
          break;
        case 'starbase':
          const starbase = this.stateManager.currentStarbase;
          if (starbase) {
            try {
              starbase.ensureSurfaceReady();
              this.renderer.drawPlanetSurface(this.player, starbase);
            } catch (surfaceError) {
              logger.error(`[Game:_render] Error ensuring starbase ready for ${starbase.name}: ${surfaceError}`);
              this._renderError(`Docking Error: ${surfaceError instanceof Error ? surfaceError.message : 'Unknown'}`);
            }
          } else {
            this._renderError('Starbase data missing for render!');
          }
          break;
        default:
          this._renderError(`Unknown game state: ${currentState}`);
      }
      if (this.popupState !== 'inactive') {
        this.renderer.drawPopup(
          this.popupContent,
          this.popupState,
          this.popupOpenCloseProgress,
          this.popupTextProgress
        );
      }
      this.renderer.renderBufferFull(false);

      this.terminalOverlay.render(
        (this.renderer as any).ctx, // Access the context (might need a getter)
        (this.renderer as any).canvas.width, // Pass canvas dimensions
        (this.renderer as any).canvas.height
      );
    } catch (error) {
      logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!! ${error}`);

      this.stopGame();
      try {
        this._renderError(`FATAL RENDER ERROR: ${error instanceof Error ? error.message : String(error)}. Refresh.`);
        this.renderer.renderBufferFull(false);
      } catch {
        /* ignore */
      }
    }
  }

  /** Helper to render an error message */
  private _renderError(message: string): void {
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true);
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOUR);
    this.statusMessage = `ERROR: ${message}`;
    this._publishStatusUpdate();
  }

  /** Composes the status string and PUBLISHES it via the event manager. */
  private _publishStatusUpdate(): void {
    let currentCargoTotal = 0;
    try {
      // This method was updated correctly in Player class to use cargoHold
      currentCargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    } catch (e) {
      logger.error(`[Game:_publishStatusUpdate] Error getting cargo total: ${e}`);
    }

    const commonStatus =
      this.popupState === 'active'
        ? ''
        : // *** FIX: Access properties via components ***
          ` | Fuel: ${this.player.resources.fuel.toFixed(0)}/${
            this.player.resources.maxFuel
          } | Cargo: ${currentCargoTotal}/${
            this.player.cargoHold.capacity
          } | Cr: ${this.player.resources.credits.toLocaleString()}`;
    // *** END FIX ***

    const finalStatus = this.statusMessage + commonStatus;
    const hasStarbase = this.stateManager.state === 'starbase';

    eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, { message: finalStatus, hasStarbase });
  }

  private _handleTradeRequest(): void {
    if (this.stateManager.state !== 'starbase' || !this.stateManager.currentStarbase) {
      this.statusMessage = 'Trade requires docking at a starbase.';
      logger.warn('[Game:_handleTradeRequest] Trade attempted outside of starbase.');
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'TRADE', reason: 'Not docked' });
      return;
    }

    const currentCargo = { ...this.player.cargoHold.items }; // Still need to read items for value calc
    const totalUnitsSold = this.cargoSystem.getTotalUnits(this.player.cargoHold); // Use system method

    if (totalUnitsSold <= 0) {
      this.statusMessage = STATUS_MESSAGES.STARBASE_TRADE_EMPTY;
      logger.info('[Game:_handleTradeRequest] No cargo to sell.');
      // Optionally publish ACTION_FAILED or just update status
      return;
    }

    let totalCreditsEarned = 0;
    let soldItemsLog: string[] = [];
    for (const elementKey in currentCargo) {
      const amount = currentCargo[elementKey];
      const elementInfo = ELEMENTS[elementKey]; // Get element info
      if (amount > 0 && elementInfo) {
        const valuePerUnit = elementInfo.baseValue; // Use defined base value
        const creditsEarned = amount * valuePerUnit;
        totalCreditsEarned += creditsEarned;
        soldItemsLog.push(`${amount} ${elementInfo.name || elementKey}`);
      } else {
        logger.warn(`[Game:_handleTradeRequest] Skipping unknown or zero amount item in cargo: ${elementKey}`);
      }
    }

    // Perform player state modifications
    this.player.resources.credits += totalCreditsEarned;
    const removedCargoData = this.cargoSystem.clearAllItems(this.player.cargoHold); // Use system method

    // Set status and publish result event
    this.statusMessage = STATUS_MESSAGES.STARBASE_TRADE_SUCCESS(
      soldItemsLog.join(', '),
      totalUnitsSold,
      totalCreditsEarned
    );
    logger.info(
      `[Game:_handleTradeRequest] Trade Complete: Sold ${totalUnitsSold} units for ${totalCreditsEarned} credits.`
    );
    eventManager.publish(GameEvents.PLAYER_CARGO_SOLD, {
      itemsSold: removedCargoData, // Use data returned by system
      creditsEarned: totalCreditsEarned,
      newCredits: this.player.resources.credits,
    });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      // Also publish general credit change
      newCredits: this.player.resources.credits,
      amountChanged: totalCreditsEarned,
    });
  }

  /** Handles REFUEL_REQUESTED event */
  private _handleRefuelRequest(): void {
    if (this.stateManager.state !== 'starbase' || !this.stateManager.currentStarbase) {
      this.statusMessage = 'Refueling requires docking at a starbase.';
      logger.warn('[Game:_handleRefuelRequest] Refuel attempted outside of starbase.');
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'REFUEL', reason: 'Not docked' });
      return;
    }

    const fuelNeeded = this.player.resources.maxFuel - this.player.resources.fuel;

    if (fuelNeeded <= 0) {
      this.statusMessage = STATUS_MESSAGES.STARBASE_REFUEL_FULL;
      return;
    }

    const creditsPerUnit = 1 / CONFIG.FUEL_PER_CREDIT; // Cost per unit of fuel
    const maxAffordableFuel = this.player.resources.credits * CONFIG.FUEL_PER_CREDIT; // How much fuel player can buy
    const fuelToBuy = Math.floor(Math.min(fuelNeeded, maxAffordableFuel)); // Buy whole units, limited by need and funds
    const cost = Math.ceil(fuelToBuy * creditsPerUnit); // Cost, rounded up to nearest credit? Or use precise cost? Let's use ceil for now.

    if (fuelToBuy <= 0 || this.player.resources.credits < cost) {
      this.statusMessage = `Not enough credits for fuel (Need ${creditsPerUnit.toFixed(1)} Cr/unit). Have ${
        this.player.resources.credits
      } Cr.`;
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'REFUEL', reason: 'Insufficient credits' });
    } else {
      const oldFuel = this.player.resources.fuel;

      this.player.resources.credits -= cost;
      this.player.addFuel(fuelToBuy); // Player method handles max fuel clamp

      this.statusMessage = `Purchased ${fuelToBuy} fuel for ${cost} Cr.`;
      if (this.player.resources.fuel >= this.player.resources.maxFuel) {
        this.statusMessage += ` Tank full!`;
      }
      logger.info(`[Game:_handleRefuelRequest] Refuel Complete: Bought ${fuelToBuy} fuel for ${cost} credits.`);

      // Publish events
      eventManager.publish(GameEvents.PLAYER_FUEL_CHANGED, {
        newFuel: this.player.resources.fuel,
        maxFuel: this.player.resources.maxFuel,
        amountChanged: this.player.resources.fuel - oldFuel,
      });
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: -cost,
      });
    }
  }
} // End of Game class
