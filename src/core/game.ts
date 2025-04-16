// src/core/game.ts
// Full file integrating zoom level state, input handling, rendering scale,
// movement speed adjustment, status bar display, and previous realism changes.

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { MineralRichness, SPECTRAL_TYPES, ELEMENTS, STATUS_MESSAGES, GLYPHS, AU_IN_METERS } from '../constants';
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager';
import { ActionProcessor, ActionProcessResult } from './action_processor';
import { fastHash } from '../utils/hash';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { SolarSystem } from '../entities/solar_system';
import { eventManager, GameEvents } from './event_manager';
import { MovementSystem } from '../systems/movement_system';
import { CargoSystem } from '../systems/cargo_systems';
import { MiningSystem } from '../systems/mining_system';
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
  private readonly terminalOverlay: TerminalOverlay;

  // Game Loop State, Status, Flags
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private statusMessage: string = 'Initializing Systems...';
  private forceFullRender: boolean = true;

  // Popup State
  private popupState: 'inactive' | 'opening' | 'active' | 'closing' = 'inactive';
  private popupContent: string[] | null = null;
  private popupOpenCloseProgress: number = 0;
  private popupTextProgress: number = 0;
  private popupTotalChars: number = 0;
  private readonly popupAnimationSpeed: number = 5.0; // Controls open/close speed
  private readonly popupTypingSpeed: number = 80; // Characters per second

  // --- Zoom State ---
  private readonly zoomLevels: number[] = [
    CONFIG.SYSTEM_VIEW_SCALE * 32, // Zoom Out 3x (~0.03x) - ~240 chars = 1 AU
    CONFIG.SYSTEM_VIEW_SCALE * 8, // Zoom Out 2x (~0.125x) - 120 chars = 1 AU
    CONFIG.SYSTEM_VIEW_SCALE * 4, // Zoom Out 1x (~0.25x) - 60 chars = 1 AU
    CONFIG.SYSTEM_VIEW_SCALE, // Default (1x) - 30 chars = 1 AU
    CONFIG.SYSTEM_VIEW_SCALE / 4, // Zoom In 1x (4x) - 7.5 chars = 1 AU
    CONFIG.SYSTEM_VIEW_SCALE / 16, // Zoom In 2x (16x) - ~2 chars = 1 AU
    CONFIG.SYSTEM_VIEW_SCALE / 64, // Zoom In 3x (64x) - Moons might be visible
    CONFIG.SYSTEM_VIEW_SCALE / 256, // Zoom In 4x (256x) - Deeper moon view
    CONFIG.SYSTEM_VIEW_SCALE / 1024, // Zoom In 5x (1024x) - Very close view
  ];
  // Adjust default index if needed (Default 1x is now index 3)
  private currentZoomLevelIndex: number = 3; // Start at the default index (1x zoom)

  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('[Game] Constructing instance...');
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
    this.gameSeedPRNG = new PRNG(initialSeed);
    this.renderer = new RendererFacade(canvasId, statusBarId);
    this.player = new Player(); // Assumes Player constructor uses CONFIG defaults
    this.inputManager = new InputManager();
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG);
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager);
    this.terminalOverlay = new TerminalOverlay(); // Initialize terminal overlay

    // Instantiate systems
    this.movementSystem = new MovementSystem(this.player);
    this.cargoSystem = new CargoSystem();
    this.miningSystem = new MiningSystem(this.player, this.stateManager, this.cargoSystem);

    // Subscribe to events
    eventManager.subscribe(GameEvents.GAME_STATE_CHANGED, this._handleGameStateChange.bind(this));
    eventManager.subscribe(GameEvents.TRADE_REQUESTED, this._handleTradeRequest.bind(this));
    eventManager.subscribe(GameEvents.REFUEL_REQUESTED, this._handleRefuelRequest.bind(this));
    eventManager.subscribe(GameEvents.PLAYER_CARGO_ADDED, this._handleCargoUpdate.bind(this));
    eventManager.subscribe(GameEvents.PLAYER_CARGO_SOLD, this._handleCargoUpdate.bind(this)); // Also trigger render on sell
    eventManager.subscribe(GameEvents.PLAYER_FUEL_CHANGED, this._handleFuelUpdate.bind(this)); // Trigger render on fuel change
    eventManager.subscribe(GameEvents.PLAYER_CREDITS_CHANGED, this._handleCreditsUpdate.bind(this)); // Trigger render on credit change

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
  private _handleGameStateChange(newState: GameState): void {
    this.forceFullRender = true; // Always force redraw on state change
    logger.info(`[Game] State change event received: ${newState}. Forcing full render.`);
    // Reset zoom to default when leaving system view
    if (newState !== 'system' && this.stateManager.state === 'system') {
      this.currentZoomLevelIndex = 2; // Index of default zoom
      logger.info(`[Game] Resetting zoom to default level (${this.currentZoomLevelIndex}) due to state change.`);
    }
    // Close popups on state change
    if (this.popupState !== 'inactive') {
      this.popupState = 'inactive';
      this.popupContent = null;
      logger.debug('[Game] Closing active popup due to game state change.');
    }
    // Reflect status messages potentially set by GameStateManager during transition
    this.statusMessage = this.stateManager.statusMessage || ''; // Use status from stateManager
    this.stateManager.statusMessage = ''; // Clear it after reading
    this._publishStatusUpdate(); // Update status bar immediately
  }

  // Generic handlers to force status bar update on resource changes
  private _handleCargoUpdate(): void {
    this._publishStatusUpdate();
  }
  private _handleFuelUpdate(): void {
    this._publishStatusUpdate();
  }
  private _handleCreditsUpdate(): void {
    this._publishStatusUpdate();
  }

  private _handleResize(): void {
    logger.debug('[Game] Handling window resize...');
    this.renderer.fitToScreen();
    // Update terminal overlay dimensions if needed
    this.terminalOverlay.updateCharDimensions(this.renderer.getCharHeightPx());
    this.forceFullRender = true; // Force redraw after resize
    this.lastUpdateTime = performance.now(); // Reset timer to avoid large deltaTime jump
  }

  // --- Game Loop Control ---
  startGame(): void {
    if (this.isRunning) return;
    logger.info('[Game] Starting game loop...');
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.inputManager.startListening();
    this.inputManager.clearState(); // Clear any lingering input state
    this.forceFullRender = true; // Ensure initial render is complete
    // Initial status update
    this.statusMessage = 'Welcome to Cosmic Voyage!';
    this._publishStatusUpdate();
    // Start the loop
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
    // Clean up systems
    if (this.movementSystem) this.movementSystem.destroy();
    if (this.miningSystem) this.miningSystem.destroy();
    if (this.stateManager) this.stateManager.destroy();
    // Clear event manager listeners? Optional, depends if Game instance is reused
    // eventManager.clearAll();
    // Final status message
    eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, {
      message: 'Game stopped. Refresh to restart.',
      hasStarbase: false,
    });
    logger.info('[Game] Game loop stopped.');
  }

  // --- Core Game Loop ---
  private _loop(currentTime: DOMHighResTimeStamp): void {
    if (!this.isRunning) return; // Exit if stopped

    // Calculate deltaTime, capping it to prevent large jumps if paused/tabbed out
    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
    this.lastUpdateTime = currentTime;

    try {
      // 1. Handle Input (including zoom)
      this._processInput();
      // 2. Update Input Manager (clears justPressed)
      this.inputManager.update();
      // 3. Update Game State & Entities
      this._update(deltaTime);
      // 4. Render Current State
      this._render();

      // Reset force render flag after rendering
      if (this.forceFullRender) this.forceFullRender = false;
    } catch (loopError) {
      // --- Robust Error Handling ---
      const currentState = this.stateManager?.state ?? 'UNKNOWN'; // Safely get state
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
      logger.error(`[Game:_loop:${currentState}] CRITICAL Error during game loop: ${errorMessage}`, {
        errorObject: loopError,
        stack: errorStack,
      });
      this.statusMessage = `FATAL LOOP ERROR: ${errorMessage}. Refresh required.`;
      try {
        this._publishStatusUpdate();
      } catch {
        /* ignore */
      } // Try to update status bar
      this.stopGame(); // Stop the loop
      return; // Prevent requesting next frame
      // --- End Error Handling ---
    }

    // Request next frame
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }

  /** Checks popup state and handles closing input. Returns true if input is blocked. */
  private _handlePopupInput(): boolean {
    if (this.popupState === 'active') {
      if (
        this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
        this.inputManager.wasActionJustPressed('MOVE_RIGHT') ||
        this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') ||
        this.inputManager.wasActionJustPressed('QUIT') ||
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM')
      ) {
        logger.info('[Game:_handlePopupInput] Closing popup via key press.');
        this.popupState = 'closing';
        this.forceFullRender = true;
        this.statusMessage = ''; // Clear scan status
        return true; // Consume input
      }
      return true; // Block other input while active
    }
    if (this.popupState === 'opening' || this.popupState === 'closing') {
      return true; // Block input during animation
    }
    return false; // Input not blocked by popup
  }

  /** Handles zoom key presses. Returns true if zoom changed (input consumed). */
  private _handleZoomInput(): boolean {
    const currentState = this.stateManager.state;
    if (currentState !== 'system') {
      return false; // Zoom only allowed in system view
    }

    let zoomChanged = false;
    const zoomInPressed =
      this.inputManager.wasActionJustPressed('ZOOM_IN') || this.inputManager.wasActionJustPressed('ZOOM_IN_NUMPAD');
    const zoomOutPressed =
      this.inputManager.wasActionJustPressed('ZOOM_OUT') || this.inputManager.wasActionJustPressed('ZOOM_OUT_NUMPAD');

    if (zoomInPressed) {
      if (this.currentZoomLevelIndex < this.zoomLevels.length - 1) {
        this.currentZoomLevelIndex++;
        zoomChanged = true;
        logger.info(
          `[Game] Zoom In -> Level ${this.currentZoomLevelIndex} (Scale: ${this.getCurrentViewScale().toExponential(
            1
          )} m/cell)`
        );
      }
    } else if (zoomOutPressed) {
      if (this.currentZoomLevelIndex > 0) {
        this.currentZoomLevelIndex--;
        zoomChanged = true;
        logger.info(
          `[Game] Zoom Out -> Level ${this.currentZoomLevelIndex} (Scale: ${this.getCurrentViewScale().toExponential(
            1
          )} m/cell)`
        );
      }
    }

    if (zoomChanged) {
      this.forceFullRender = true;
      this.statusMessage = ''; // Clear old messages on zoom
      // Note: _publishStatusUpdate is called after this returns true in _processInput
      return true; // Consume input for this frame
    }
    return false; // No zoom change
  }

  /** Processes discrete actions (scan, land, mine, etc.). Returns true if an action was processed. */
  private _handleDiscreteActions(): boolean {
    const currentState = this.stateManager.state;
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
      'INFO_TEST',
    ];

    for (const action of discreteActions) {
      if (this.inputManager.wasActionJustPressed(action)) {
        logger.debug(`[Game:_handleDiscreteActions] Processing discrete action: ${action}`);

        if (action === 'INFO_TEST') {
          // Handle special cases first
          this.terminalOverlay.addMessage(`Test message added at ${new Date().toLocaleTimeString()}`);
          return true; // Consume input
        }
        if (action === 'QUIT') {
          eventManager.publish(GameEvents.GAME_QUIT);
          this.stopGame();
          return true; // Consume input & stop game
        }

        // Process standard actions via ActionProcessor
        const actionResult: ActionProcessResult = this.actionProcessor.processAction(action, currentState);

        // Handle the result
        if (typeof actionResult === 'string') {
          this.statusMessage = actionResult; // Set status bar message
        } else if (actionResult && typeof actionResult === 'object') {
          if ('requestScan' in actionResult) {
            this._handleScanRequest(actionResult.requestScan);
            this.statusMessage = ''; // Scan usually clears status or uses terminal
          } else if ('requestSystemPeek' in actionResult) {
            const peekedSystem = this.stateManager.peekAtSystem(
              this.player.position.worldX,
              this.player.position.worldY
            );
            if (peekedSystem) {
              this.terminalOverlay.addMessage(STATUS_MESSAGES.HYPERSPACE_SCANNING_SYSTEM(peekedSystem.name));
              this._dumpScanToTerminal(peekedSystem);
            } else {
              this.terminalOverlay.addMessage(STATUS_MESSAGES.HYPERSPACE_SCAN_FAIL);
            }
            this.statusMessage = ''; // System peek uses terminal
          }
        }
        // Reflect status message set by stateManager during event handling
        if (this.stateManager.statusMessage) {
          this.statusMessage = this.stateManager.statusMessage;
          this.stateManager.statusMessage = ''; // Clear after reading
        }

        return true; // Indicate an action was processed, consume input
      }
    }
    return false; // No discrete action processed
  }

  /** Handles movement input and publishes MOVE_REQUESTED event. */
  private _handleMovementInput(): void {
    let dx = 0,
      dy = 0;
    if (this.inputManager.isActionActive('MOVE_UP')) dy -= 1;
    if (this.inputManager.isActionActive('MOVE_DOWN')) dy += 1;
    if (this.inputManager.isActionActive('MOVE_LEFT')) dx -= 1;
    if (this.inputManager.isActionActive('MOVE_RIGHT')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      // Clear non-critical status messages when moving
      if (this.statusMessage && !/(error|fail|cannot|mined|sold|scan|purchased)/i.test(this.statusMessage)) {
        this.statusMessage = '';
      }

      const isFine = this.inputManager.isActionActive('FINE_CONTROL');
      const isBoost = this.inputManager.isActionActive('BOOST');
      const useFine = isFine && !isBoost;
      const currentState = this.stateManager.state;

      // Calculate Speed Multiplier based on Zoom
      let speedMultiplier = 1.0;
      if (currentState === 'system') {
        const defaultZoomIndex = 3; // Index of 1x zoom (adjust if default changes)
        const zoomDifference = this.currentZoomLevelIndex - defaultZoomIndex;
        speedMultiplier = Math.pow(0.5, zoomDifference);
        speedMultiplier = Math.max(0.01, Math.min(speedMultiplier, 10.0)); // Clamp
      }

      try {
        const moveData: MoveRequestData = {
          dx,
          dy,
          isFineControl: useFine,
          isBoost,
          context: currentState,
          speedMultiplier,
        };

        if (currentState === 'planet') {
          const planet = this.stateManager.currentPlanet;
          if (planet) {
            try {
              planet.ensureSurfaceReady(); // Ensure map exists for size
              moveData.surfaceContext = { mapSize: planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE };
            } catch (surfaceError) {
              logger.error(`[Game:_handleMovementInput] Error ensuring surface ready for move: ${surfaceError}`);
              this.statusMessage = STATUS_MESSAGES.ERROR_SURFACE_PREP('Cannot move');
              // Publish update here if error prevents move event
              this._publishStatusUpdate();
              return; // Stop movement processing
            }
          } else {
            logger.error('[Game:_handleMovementInput] Player in planet state but currentPlanet is null during move.');
            this.terminalOverlay.addMessage(STATUS_MESSAGES.ERROR_DATA_MISSING('Planet'));
            return; // Stop movement processing
          }
        }

        eventManager.publish(GameEvents.MOVE_REQUESTED, moveData);
      } catch (error) {
        logger.error(`[Game:_handleMovementInput] Error preparing or publishing move request: ${error}`);
        this.statusMessage = `Move Error: ${error instanceof Error ? error.message : String(error)}`;
        // Publish update here if error occurs during move prep
        this._publishStatusUpdate();
      }
    }
  }

  /** Processes all input for the current frame by calling helper methods. */
  private _processInput(): void {
    // 1. Check Popups (blocks other input if active or animating)
    if (this._handlePopupInput()) {
      return; // Input consumed by popup
    }
    // 2. Check Zoom (consumes input if zoom changed)
    if (this._handleZoomInput()) {
      // Publish status immediately after zoom changes to reflect new scale/clear messages
      this._publishStatusUpdate();
      return; // Input consumed by zoom change
    }
    // 3. Check Discrete Actions (consumes input if an action is taken)
    if (this._handleDiscreteActions()) {
      // Discrete action handled, publish status update reflecting its outcome
      this._publishStatusUpdate();
      return; // Input consumed by a discrete action
    }
    // 4. Check Movement (does not consume input, allows holding)
    this._handleMovementInput();

    // 5. Publish Status Update (Reflects movement status or lack of action)
    // Note: Status might have been cleared by movement, or remain from previous frame if no action/move
    this._publishStatusUpdate();
  }
  /** Gets the current view scale in meters/cell based on the zoom level. */
  private getCurrentViewScale(): number {
    // Clamp index to prevent errors if it somehow goes out of bounds
    const safeIndex = Math.max(0, Math.min(this.currentZoomLevelIndex, this.zoomLevels.length - 1));
    return this.zoomLevels[safeIndex];
  }

  // --- Scan Handling ---
  /** Handles scan requests triggered by ActionProcessor */
  private _handleScanRequest(scanType: 'system_object' | 'planet_surface'): void {
    const currentState = this.stateManager.state;
    logger.debug(`[Game:_handleScanRequest] Handling scan request type '${scanType}' in state '${currentState}'`);

    let targetToScan: ScanTarget | null = null;
    let scanStatusMessage = ''; // Message for terminal overlay

    if (scanType === 'system_object') {
      // Scan logic remains same, uses terminal overlay now
      if (currentState === 'hyperspace') {
        /* ... handled by peek request ... */
      } else if (currentState === 'system') {
        const system = this.stateManager.currentSystem;
        if (!system) {
          scanStatusMessage = '<e>Scan Error: System data missing.</e>';
        } else {
          const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
          const distSqToObject = nearbyObject
            ? this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY)
            : Infinity;
          const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
          const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;

          if (distSqToStar < distSqToObject && distSqToStar < scanThresholdSq) {
            targetToScan = { type: 'Star', name: system.name, starType: system.starType };
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_STAR(system.name);
          } else if (nearbyObject && distSqToObject < scanThresholdSq) {
            targetToScan = nearbyObject;
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_OBJECT(nearbyObject.name);
          } else {
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_FAIL_NO_TARGET;
          }
        }
      } else {
        scanStatusMessage = `<e>Cannot perform system scan in ${currentState} state.</e>`;
      }
    } else if (scanType === 'planet_surface') {
      // Scan logic remains same, uses terminal overlay now
      if (currentState === 'planet') {
        const planet = this.stateManager.currentPlanet;
        if (planet) {
          targetToScan = planet;
          scanStatusMessage = `<h>Scanning surface of ${planet.name}...</h>`; // Heading format
        } else {
          scanStatusMessage = '<e>Planet scan error: Data missing.</e>';
        }
      } else {
        scanStatusMessage = `<e>Cannot perform surface scan in ${currentState} state.</e>`;
      }
    }

    // Send initial message to terminal and dump results if target found
    this.terminalOverlay.addMessage(scanStatusMessage);
    if (targetToScan) {
      this._dumpScanToTerminal(targetToScan);
    }
    // Status bar update happens in the main loop via _publishStatusUpdate
  }

  /** Dumps formatted scan results to the terminal overlay */
  private _dumpScanToTerminal(target: ScanTarget | string): void {
    let lines: string[] | null = null;
    let targetName = 'Unknown Target';

    try {
      if (target instanceof SolarSystem) {
        lines = this._formatStarScanPopup(target); // Use existing formatter
        targetName = `Star (${target.name})`;
      } else if (typeof target === 'object' && target !== null && 'type' in target && target.type === 'Star') {
        const starTarget = target as { type: 'Star'; name: string; starType: string };
        const system = this.stateManager.currentSystem; // Check current system context
        if (system && system.name === starTarget.name && system.starType === starTarget.starType) {
          lines = this._formatStarScanPopup(system);
          targetName = `Star (${system.name})`;
        } else {
          lines = [`<e>Error: System context mismatch for star scan.</e>`];
          targetName = `Star (${starTarget.name})`;
        }
      } else if (target instanceof Planet || target instanceof Starbase) {
        targetName = target.name;
        if (target instanceof Planet && !target.scanned) {
          target.scan();
        } // Perform scan if needed
        lines = target.getScanInfo(); // Get formatted lines (includes moon info now)
      } else {
        logger.error('[Game:_dumpScanToTerminal] Unknown or invalid scan target type:', target);
        lines = [`<e>Scan Error: Unknown object type.</e>`];
      }

      if (lines && lines.length > 0) {
        logger.info(`[Game] Dumping scan results for ${targetName} to terminal overlay.`);
        // Add results line by line to the overlay
        lines.forEach((line) => this.terminalOverlay.addMessage(line));
      } else {
        logger.error('[Game:_dumpScanToTerminal] Generated scan lines array was null or empty for target:', targetName);
        this.terminalOverlay.addMessage(`<e>Error: Failed to generate scan information for ${targetName}.</e>`);
      }
    } catch (error) {
      logger.error(`[Game:_dumpScanToTerminal] Error generating or sending scan content: ${error}`);
      const errorMsg = `<e>Scan Error: ${error instanceof Error ? error.message : 'Failed to get info'}</e>`;
      this.terminalOverlay.addMessage(errorMsg);
    }
  }

  /** Formats scan results for a star/system */
  private _formatStarScanPopup(system: SolarSystem): string[] {
    const lines: string[] = [];
    const starInfo = SPECTRAL_TYPES[system.starType];
    lines.push(``);
    lines.push(`<h>--- STELLAR SCAN: ${system.name} ---</h>`);
    lines.push(`Spectral Type: <hl>${system.starType}</hl>`); // Use highlight tag
    if (starInfo) {
      lines.push(`Temperature: <hl>~${starInfo.temp.toLocaleString()} K</hl>`);
      // Calculate approx luminosity relative to Sol if possible
      const SUN_TEMP = SPECTRAL_TYPES['G'].temp;
      const SUN_RADIUS_M = 6.957e8;
      const starRadius_m = starInfo.radius ?? SUN_RADIUS_M;
      const relativeLuminosity = Math.pow(starInfo.temp / SUN_TEMP, 4) * Math.pow(starRadius_m / SUN_RADIUS_M, 2);
      lines.push(`Luminosity: <hl>~${relativeLuminosity.toExponential(1)}</hl> (Rel. Sol)`);
      lines.push(`Mass: <hl>~${(starInfo.mass / 1.98847e30).toFixed(1)} Solar Masses</hl>`); // Show solar masses
      lines.push(`Radius: <hl>~${(starInfo.radius / 6.957e8).toFixed(1)} Solar Radii</hl>`); // Show solar radii
    } else {
      lines.push(`Temperature: [-W-]Unknown</w>`);
      lines.push(`Luminosity: [-W-]Unknown</w>`);
      lines.push(`Mass: [-W-]Unknown</w>`);
      lines.push(`Radius: [-W-]Unknown</w>`);
    }
    lines.push(`Planetary Bodies: <hl>${system.planets.filter((p) => p !== null).length}</hl>`);
    lines.push(`Facilities: <hl>${system.starbase ? 'Starbase Detected' : 'None Detected'}</hl>`);
    lines.push('<h>--- SCAN COMPLETE---</h>');
    lines.push(``);
    return lines;
  }

  // --- Game State Update ---
  private _update(deltaTime: number): void {
    let blockGameUpdates = false;

    // --- Update Popup Animation ---
    switch (this.popupState) {
      case 'opening':
        this.popupOpenCloseProgress += this.popupAnimationSpeed * deltaTime;
        if (this.popupOpenCloseProgress >= 1) {
          this.popupOpenCloseProgress = 1;
          this.popupState = 'active';
          logger.debug('[Game:_update] Popup finished opening.');
        }
        this.forceFullRender = true; // Need render update during animation
        blockGameUpdates = true; // Block game logic while animating
        break;
      case 'active':
        // Update typing effect if content exists
        if (this.popupContent && this.popupTextProgress < this.popupTotalChars) {
          this.popupTextProgress += this.popupTypingSpeed * deltaTime;
          this.popupTextProgress = Math.min(this.popupTotalChars, Math.floor(this.popupTextProgress));
          this.forceFullRender = true; // Need render update for typing
        }
        // Don't block game updates once fully open and typed? Or keep blocking? Let's keep blocking for now.
        blockGameUpdates = true;
        break;
      case 'closing':
        this.popupOpenCloseProgress -= this.popupAnimationSpeed * deltaTime;
        if (this.popupOpenCloseProgress <= 0) {
          this.popupOpenCloseProgress = 0;
          this.popupState = 'inactive';
          this.popupContent = null; // Clear content when closed
          logger.debug('[Game:_update] Popup finished closing.');
        }
        this.forceFullRender = true; // Need render update during animation
        blockGameUpdates = true; // Block game logic while animating
        break;
      case 'inactive':
        // Do nothing related to popup
        break;
    }

    // --- Update Terminal Overlay ---
    this.terminalOverlay.update(deltaTime); // Update typing/fading

    // --- Update Core Game Logic (if not blocked by popup) ---
    if (!blockGameUpdates) {
      try {
        const currentState = this.stateManager.state;
        let stateUpdateStatus = ''; // Store status from state-specific updates

        switch (currentState) {
          case 'hyperspace':
            stateUpdateStatus = this._updateHyperspace(deltaTime);
            break;
          case 'system':
            stateUpdateStatus = this._updateSystem(deltaTime); // Includes orbit updates
            break;
          case 'planet':
            stateUpdateStatus = this._updatePlanet(deltaTime);
            break;
          case 'starbase':
            stateUpdateStatus = this._updateStarbase(deltaTime);
            break;
          default:
            // This should not happen if state management is correct
            stateUpdateStatus = `Error: Unexpected state ${currentState}`;
            logger.warn(stateUpdateStatus);
        }
        // Update main status message ONLY if the state update provided one
        // AND the current message isn't an error/failure/important action result
        if (
          stateUpdateStatus &&
          (this.statusMessage === '' ||
            !(
              this.statusMessage.toLowerCase().includes('error') ||
              this.statusMessage.toLowerCase().includes('fail') ||
              this.statusMessage.toLowerCase().includes('cannot') ||
              this.statusMessage.startsWith('Mined') ||
              this.statusMessage.startsWith('Sold') ||
              this.statusMessage.startsWith('Scan') ||
              this.statusMessage.startsWith('Purchased')
            ))
        ) {
          this.statusMessage = stateUpdateStatus;
        }
      } catch (updateError) {
        // --- Improved Error Logging ---
        const stateWhenErrorOccurred = this.stateManager?.state ?? 'UNKNOWN'; // Safely get state
        let errorMessage = 'Unknown Update Error';
        let errorStack = 'N/A';
        // Try to get message and stack regardless of error type
        if (updateError instanceof Error) {
          errorMessage = updateError.message;
          errorStack = updateError.stack || 'No stack available';
        } else {
          // Handle non-Error objects more gracefully
          try {
            errorMessage = JSON.stringify(updateError);
          } catch {
            errorMessage = String(updateError);
          }
          // Try to create a stack trace manually
          try {
            throw new Error('Originating stack trace');
          } catch (e) {
            if (e instanceof Error) errorStack = e.stack || 'Manual stack failed';
          }
        }
        // Log more details including the raw error object
        logger.error(`[Game:_update:${stateWhenErrorOccurred}] CRITICAL Error during update logic: ${errorMessage}`, {
          errorObject: updateError,
          stack: errorStack,
        });
        this.statusMessage = `UPDATE ERROR: ${errorMessage}. Refresh required.`;
        this.stopGame(); // Stop on update errors
        // --- End Improved Error Logging ---
      }
    }
    // Always publish status bar update at the end of the update phase
    this._publishStatusUpdate();
  }

  // --- State-specific update methods ---
  private _updateHyperspace(_deltaTime: number): string {
    // Check for nearby star system for status message
    const baseSeedInt = this.gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
    const hash = fastHash(this.player.position.worldX, this.player.position.worldY, baseSeedInt);
    const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;

    let baseStatus = `Hyperspace | Loc: ${this.player.position.worldX},${this.player.position.worldY}`;

    if (isNearStar) {
      // Only peek if necessary for status display
      const peekedSystem = this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY);
      if (peekedSystem) {
        const starbaseText = peekedSystem.starbase ? ' (Starbase)' : '';
        // Use SCAN_SYSTEM_OBJECT binding for scan prompt
        baseStatus += ` | Near ${
          peekedSystem.name
        }${starbaseText}. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`;
      } else {
        // Hash indicated star, but peek failed? Log warning.
        logger.warn(
          `[Game:_updateHyperspace] Hash indicated star at ${this.player.position.worldX},${this.player.position.worldY} but peek failed.`
        );
        baseStatus += ` | Near star system. [${CONFIG.KEY_BINDINGS.ENTER_SYSTEM.toUpperCase()}] Enter`;
      }
    } else {
      this.stateManager.resetPeekedSystem(); // Clear peek cache if not near star
    }
    return baseStatus;
  }

  private _updateSystem(deltaTime: number): string {
    const system = this.stateManager.currentSystem;
    if (!system) {
      logger.error("[Game:_updateSystem] In 'system' state but currentSystem is null! Attempting recovery.");
      eventManager.publish(GameEvents.LEAVE_SYSTEM_REQUESTED); // Trigger leave process
      return 'System Error: Data missing. Returning to hyperspace.';
    }

    // Time scale adjustments
    const defaultZoomIndex = 3; // Index of your default scale (1x zoom)
    const zoomDifference = this.currentZoomLevelIndex - defaultZoomIndex;
    // Adjust time speed by factor of 2 per zoom level (0.5 = slower when zoomed in)
    // Adjust the base (0.5) for different scaling sensitivity
    let timeScaleMultiplier = Math.pow(0.5, zoomDifference);
    // Clamp multiplier to prevent time stopping or going excessively fast
    timeScaleMultiplier = Math.max(0.01, Math.min(timeScaleMultiplier, 10.0));
    logger.debug(
      `[Game] Zoom Index: ${this.currentZoomLevelIndex}, Time Scale Multiplier: ${timeScaleMultiplier.toFixed(3)}`
    );
    const scaledDeltaTime = deltaTime * timeScaleMultiplier;

    // Update orbits of planets, moons, starbase
    system.updateOrbits(scaledDeltaTime);

    // Determine status message based on proximity
    const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
    let status = `System: ${system.name} (${system.starType}) | Pos: ${this.player.position.systemX.toExponential(
      1
    )},${this.player.position.systemY.toExponential(1)}m`; // Use meters

    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${(dist / AU_IN_METERS).toFixed(
        2
      )} AU). [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Land/Dock / [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan`; // Show dist in AU
    } else {
      // Check proximity to star for scanning
      const distSqToStar = this.player.distanceSqToSystemCoords(0, 0);
      const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;
      const nearStar = distSqToStar < scanThresholdSq;

      if (this.isPlayerNearExit()) {
        // Check if near edge
        status += ` | Near system edge.`;
        if (nearStar) status += ` [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan Star /`; // Allow star scan even near edge
        status += ` [${CONFIG.KEY_BINDINGS.LEAVE_SYSTEM.toUpperCase()}] Leave System`;
      } else if (nearStar) {
        status += ` | [${CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT.toUpperCase()}] Scan Star`;
      }
    }
    return status;
  }

  /** Helper to check if player is near system edge */
  private isPlayerNearExit(): boolean {
    const system = this.stateManager.currentSystem;
    if (!system) return false;
    const distSq = this.player.distanceSqToSystemCoords(0, 0); // Distance from star center
    // Use edgeRadius which is in meters
    const exitThresholdSq = (system.edgeRadius * CONFIG.SYSTEM_EDGE_LEAVE_FACTOR) ** 2;
    return distSq > exitThresholdSq;
  }

  private _updatePlanet(_deltaTime: number): string {
    const planet = this.stateManager.currentPlanet;
    if (!planet) {
      /* ... error handling ... */ return 'Planet Error: Data missing.';
    }

    // Use getCurrentTemperature for dynamic temp display
    const currentTemp = planet.getCurrentTemperature(); // Use the new method

    let status = `Landed: ${planet.name} (${planet.type}) | Surface: ${this.player.position.surfaceX},${
      this.player.position.surfaceY
    } | Grav: ${planet.gravity.toFixed(2)}g | Temp: ${currentTemp}K`; // Show current temp
    const actions = [`[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Liftoff`];

    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
      if (planet.scanned) {
        status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
        // Check if location is mineable (not already mined)
        if (
          planet.mineralRichness !== MineralRichness.NONE &&
          !planet.isMined(this.player.position.surfaceX, this.player.position.surfaceY)
        ) {
          actions.push(`[${CONFIG.KEY_BINDINGS.MINE.toUpperCase()}] Mine`);
        }
      } else {
        actions.push(`[${CONFIG.KEY_BINDINGS.SCAN.toUpperCase()}] Scan`);
        status += ` | Scan: Required (Potential: ${planet.mineralRichness})`;
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
      /* ... error handling ... */ return 'Starbase Error: Data missing.';
    }
    const actions = [
      `[${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade`,
      `[${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel`,
      `[${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] Depart`,
    ];
    return `Docked: ${starbase.name} | Actions: ${actions.join(', ')}.`;
  }

  // --- Rendering ---
  private _render(): void {
    const currentState = this.stateManager.state;
    try {
      // Clear physical canvas only if needed (state change or system view)
      if (currentState === 'system' || this.forceFullRender) {
        this.renderer.clear(true); // Physical clear
      } else {
        // For other states, just clear the internal buffer state
        this.renderer.clear(false);
      }

      // Draw background layer first if in system view
      if (currentState === 'system') {
        this.renderer.drawStarBackground(this.player);
        this.renderer.renderBufferFull(true); // Render background buffer to canvas
      }

      // Draw main content layer based on state
      switch (currentState) {
        case 'hyperspace':
          this.renderer.drawHyperspace(this.player, this.gameSeedPRNG);
          break;
        case 'system':
          const system = this.stateManager.currentSystem;
          if (system) {
            const currentViewScale = this.getCurrentViewScale();
            this.renderer.drawSolarSystem(this.player, system, currentViewScale);
          } else {
            this._renderError('System data missing for render!');
          }
          break;
        case 'planet':
          const planet = this.stateManager.currentPlanet;
          if (planet) {
            try {
              // Ensure surface data is ready (lazy loading)
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
              // Starbases also need ensureSurfaceReady for placeholder data
              starbase.ensureSurfaceReady();
              this.renderer.drawPlanetSurface(this.player, starbase); // Uses starbase interior drawing logic
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

      // Draw Popup (if active)
      if (this.popupState !== 'inactive') {
        this.renderer.drawPopup(
          this.popupContent,
          this.popupState,
          this.popupOpenCloseProgress,
          this.popupTextProgress
        );
      }

      // Render the main buffer (diff or full)
      if (this.forceFullRender) {
        this.renderer.renderBufferFull(false); // Render main buffer fully
      } else {
        this.renderer.renderDiff(); // Render only changes in main buffer
      }

      // Draw Terminal Overlay on top
      this.terminalOverlay.render(
        this.renderer.getContext(),
        this.renderer.getCanvas().width,
        this.renderer.getCanvas().height
      );
    } catch (renderError) {
      logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, renderError);
      this.statusMessage = `FATAL RENDER ERROR: ${
        renderError instanceof Error ? renderError.message : String(renderError)
      }. Refresh.`;
      this._publishStatusUpdate(); // Try to show error
      this.stopGame(); // Stop loop on render errors
    }
  }

  /** Helper to render an error message */
  private _renderError(message: string): void {
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true); // Clear physically
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOUR);
    this.statusMessage = `ERROR: ${message}`;
    this._publishStatusUpdate(); // Update status bar
    // Render the error state immediately
    this.renderer.renderBufferFull(false);
  }

  // --- Status Update (Adds Zoom Level) ---
  private _publishStatusUpdate(): void {
    let currentCargoTotal = 0;
    try {
      currentCargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    } catch (e) {
      logger.error(`[Game:_publishStatusUpdate] Error getting cargo total: ${e}`);
    }

    let zoomLabel = '';
    if (this.stateManager.state === 'system') {
      const defaultZoomIndex = 2; // Index of 1x zoom
      const zoomDifference = defaultZoomIndex - this.currentZoomLevelIndex;
      const zoomFactor = Math.pow(4, zoomDifference); // Assuming factor of 4 steps
      zoomLabel = ` | Zoom: ${zoomFactor.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
    }

    const commonStatus =
      this.popupState === 'active'
        ? '' // Don't show stats when popup is fully active
        : ` | Fuel: ${this.player.resources.fuel.toFixed(0)}/${
            this.player.resources.maxFuel
          } | Cargo: ${currentCargoTotal}/${
            this.player.cargoHold.capacity
          } | Cr: ${this.player.resources.credits.toLocaleString()}` + zoomLabel; // Append zoom label

    const finalStatus = this.statusMessage + commonStatus;
    const hasStarbase = this.stateManager.state === 'starbase';

    // Publish event for the status bar updater
    eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, { message: finalStatus, hasStarbase });
  }

  // --- Starbase Action Handlers ---
  /** Handles TRADE_REQUESTED event */
  private _handleTradeRequest(): void {
    if (this.stateManager.state !== 'starbase' || !this.stateManager.currentStarbase) {
      this.statusMessage = 'Trade requires docking at a starbase.';
      logger.warn('[Game:_handleTradeRequest] Trade attempted outside of starbase.');
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'TRADE', reason: 'Not docked' });
      this._publishStatusUpdate(); // Update status bar
      return;
    }

    const currentCargo = { ...this.player.cargoHold.items };
    const totalUnitsSold = this.cargoSystem.getTotalUnits(this.player.cargoHold);

    if (totalUnitsSold <= 0) {
      this.statusMessage = STATUS_MESSAGES.STARBASE_TRADE_EMPTY;
      logger.info('[Game:_handleTradeRequest] No cargo to sell.');
      this._publishStatusUpdate(); // Update status bar
      return;
    }

    let totalCreditsEarned = 0;
    let soldItemsLog: string[] = [];
    for (const elementKey in currentCargo) {
      const amount = currentCargo[elementKey];
      const elementInfo = ELEMENTS[elementKey];
      if (amount > 0 && elementInfo) {
        const valuePerUnit = elementInfo.baseValue; // Use defined base value
        const creditsEarned = amount * valuePerUnit;
        totalCreditsEarned += creditsEarned;
        soldItemsLog.push(`${amount} ${elementInfo.name || elementKey}`); // Use name if available
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
      itemsSold: removedCargoData,
      creditsEarned: totalCreditsEarned,
      newCredits: this.player.resources.credits,
    });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: totalCreditsEarned,
    });
    // Status bar will update automatically via _publishStatusUpdate in the next loop
  }

  /** Handles REFUEL_REQUESTED event */
  private _handleRefuelRequest(): void {
    if (this.stateManager.state !== 'starbase' || !this.stateManager.currentStarbase) {
      this.statusMessage = 'Refueling requires docking at a starbase.';
      logger.warn('[Game:_handleRefuelRequest] Refuel attempted outside of starbase.');
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'REFUEL', reason: 'Not docked' });
      this._publishStatusUpdate();
      return;
    }

    const fuelNeeded = this.player.resources.maxFuel - this.player.resources.fuel;
    if (fuelNeeded <= 0) {
      this.statusMessage = STATUS_MESSAGES.STARBASE_REFUEL_FULL;
      this._publishStatusUpdate();
      return;
    }

    const creditsPerUnit = 1 / CONFIG.FUEL_PER_CREDIT;
    const maxAffordableFuel = this.player.resources.credits * CONFIG.FUEL_PER_CREDIT;
    const fuelToBuy = Math.floor(Math.min(fuelNeeded, maxAffordableFuel));
    const cost = Math.ceil(fuelToBuy * creditsPerUnit); // Use ceil to ensure player pays enough

    if (fuelToBuy <= 0 || this.player.resources.credits < cost) {
      this.statusMessage = STATUS_MESSAGES.STARBASE_REFUEL_FAIL_CREDITS(creditsPerUnit, this.player.resources.credits);
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'REFUEL', reason: 'Insufficient credits' });
    } else {
      const oldFuel = this.player.resources.fuel;
      this.player.resources.credits -= cost;
      this.player.addFuel(fuelToBuy); // Use player method for clamping and logging
      this.statusMessage = STATUS_MESSAGES.STARBASE_REFUEL_SUCCESS(fuelToBuy, cost);
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
    this._publishStatusUpdate(); // Update status bar
  }
} // End Game class
