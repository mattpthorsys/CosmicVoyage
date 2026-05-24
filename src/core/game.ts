// src/core/game.ts
// Full file integrating zoom level state, input handling, rendering scale,
// movement speed adjustment, status bar display, and previous realism changes.

import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { SPECTRAL_TYPES, ELEMENTS, TRADE_COMMODITIES, STATUS_MESSAGES, GLYPHS, AU_IN_METERS } from '../constants';
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager';
import { ActionProcessor, ActionProcessResult } from './action_processor';
import { fastHash } from '../utils/hash';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { SolarSystem } from '../entities/solar_system';
import { eventManager, GameEvents } from './event_manager';
import { MovementSystem, MoveRequestData } from '../systems/movement_system';
import { CargoSystem } from '../systems/cargo_systems';
import { MiningSystem } from '../systems/mining_system';
import { TerminalOverlay } from '../rendering/terminal_overlay';
import { AstrometricOverlay } from '../rendering/astrometric_overlay';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { StellarBody } from '../entities/stellar_body';
import { AvailableAction, createAvailableActions, formatAvailableActions } from './available_actions';
import {
  createStarbaseScreenModel,
  StarbaseScreenModel,
  StarbaseSectionId,
  StarbaseTableRow,
  STARBASE_SECTIONS,
} from './starbase_ui';
import { clampIndex, moveSelection } from './text_ui';
import { createHelpReferenceLines } from './help_reference';
import {
  createOrbitScreenModel,
  getPlanetMapSize,
  OrbitInteractionMode,
  OrbitScreenModel,
} from './orbit_ui';
import {
  formatMissionDetail,
  generateStarbaseMissions,
  generateStarbaseNotices,
  getMissionStatus,
  isMissionCompletedByScan,
  StarbaseMission,
} from './mission_board';
import { formatDistanceAu, formatHyperspaceSpan, formatLightTimeFromMeters } from '../utils/space_scale';
import { HyperspaceSurveyService, HyperspaceSurveyContact } from './hyperspace_survey';

// ScanTarget type includes SolarSystem now
type ScanTarget = Planet | Starbase | StellarBody | SolarSystem;
type NavigationTarget = Planet | Starbase | StellarBody;

interface TradeDepotItem {
  itemKey: string;
  name: string;
  description: string;
  category: string;
  units: number;
  buyPrice: number;
  sellPrice: number;
}

interface FrameProfile {
  frameMs: number;
  inputMs: number;
  updateMs: number;
  renderMs: number;
  renderPrepMs: number;
  overlayMs: number;
  fps: number;
}

interface HyperspaceNavigationContact {
  dx: number;
  dy: number;
  rangeCells: number;
  name: string;
  starType: string;
  hasStarbase: boolean;
  objectKind: 'stellar' | 'brown-dwarf' | null;
}

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
  private readonly astrometricOverlay: AstrometricOverlay;
  private readonly systemDataGenerator: SystemDataGenerator;
  private readonly hyperspaceSurveyService: HyperspaceSurveyService;
  private tradeSelectionIndex: number = 0;
  private starbaseSectionId: StarbaseSectionId = 'overview';
  private starbaseSelectionBySection: Record<string, number> = {};
  private starbaseOffsetBySection: Record<string, number> = {};
  private starbaseAlert: string = '';
  private acceptedMissionIds: Set<string> = new Set();
  private completedMissionIds: Set<string> = new Set();
  private activeMissions: Record<string, StarbaseMission> = {};
  private orbitSelectedBodyIndex: number = 0;
  private orbitMode: OrbitInteractionMode = 'overview';
  private orbitLandingX: number = Math.floor(CONFIG.PLANET_MAP_BASE_SIZE / 2);
  private orbitLandingY: number = Math.floor(CONFIG.PLANET_MAP_BASE_SIZE / 2);
  private orbitAlert: string = '';
  private orbitElapsedSeconds: number = 0;
  private currentTargetIndex: number = 0;
  private currentTargetSignature: string = '';
  private approachTargetSignature: string | null = null;
  private autoScannedSystemName: string | null = null;
  private tutorialHintsShown: Set<string> = new Set();

  // Game Loop State, Status, Flags
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private statusMessage: string = 'Initializing Systems...';
  private forceFullRender: boolean = true;
  private lastRenderStatsLogAt: number = 0;
  private lastMainRenderSignature: string = '';
  private profilerVisible: boolean = false;
  private lastFrameProfile: FrameProfile = {
    frameMs: 0,
    inputMs: 0,
    updateMs: 0,
    renderMs: 0,
    renderPrepMs: 0,
    overlayMs: 0,
    fps: 0,
  };

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
    this.systemDataGenerator = new SystemDataGenerator(this.gameSeedPRNG);
    this.hyperspaceSurveyService = new HyperspaceSurveyService(this.systemDataGenerator);
    this.renderer = new RendererFacade(canvasId, statusBarId, this.systemDataGenerator, this.hyperspaceSurveyService);
    this.player = new Player(); // Assumes Player constructor uses CONFIG defaults
    this.inputManager = new InputManager();
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG, this.systemDataGenerator);
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager);
    this.terminalOverlay = new TerminalOverlay(); // Initialize terminal overlay
    this.astrometricOverlay = new AstrometricOverlay(this.systemDataGenerator, this.hyperspaceSurveyService);

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
    this.currentTargetIndex = 0;
    this.currentTargetSignature = '';
    this.approachTargetSignature = null;
    if (newState === 'starbase') {
      this.starbaseSectionId = 'overview';
      this.starbaseAlert = '';
    }
    if (newState === 'orbit') {
      const planet = this.stateManager.currentPlanet;
      this.orbitSelectedBodyIndex = 0;
      this.orbitMode = 'overview';
      this.orbitAlert = '';
      if (planet) {
        const mapSize = getPlanetMapSize(planet);
        this.orbitLandingX = Math.floor(mapSize / 2);
        this.orbitLandingY = Math.floor(mapSize / 2);
      }
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
    this._emitContextualHint(newState);
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

  private _emitContextualHint(newState: GameState): void {
    if (newState === 'system' && this.stateManager.currentSystem) {
      const system = this.stateManager.currentSystem;
      if (this.autoScannedSystemName !== system.name) {
        this.autoScannedSystemName = system.name;
        const planetCount = system.planets.filter((planet) => planet !== null).length;
        const stellarSummary = system.isStarless
          ? 'None - free planetary-mass object'
          : system.stars.map((star) => `${star.id}:${star.starType}`).join(' ');
        this.terminalOverlay.clear();
        this.terminalOverlay.addMessageLines([
          `<h>Entered ${system.name}</h>`,
          `System: <hl>${system.architecture.kind}</hl> | Stars: <hl>${stellarSummary}</hl>`,
          `Bodies: <hl>${planetCount}</hl> | Facility: <hl>${system.starbase ? system.starbase.name : 'None detected'}</hl>`,
          `Tip: <hl>Tab</hl> cycles targets, <hl>Space</hl> performs the best action, <hl>A</hl> approaches target.`,
        ]);
      }
    } else if (newState === 'planet' && this.stateManager.currentPlanet && !this.tutorialHintsShown.has('planet')) {
      this.tutorialHintsShown.add('planet');
      this.terminalOverlay.addMessage(`<h>Surface operations:</h> scan before mining, then use Space for the next available action.`);
    } else if (newState === 'orbit' && this.stateManager.currentPlanet && !this.tutorialHintsShown.has('orbit')) {
      this.tutorialHintsShown.add('orbit');
      this.terminalOverlay.addMessage(`<h>Orbit:</h> choose a body, inspect the scan, then select a landing site.`);
    } else if (newState === 'starbase' && this.stateManager.currentStarbase && !this.tutorialHintsShown.has('starbase')) {
      this.tutorialHintsShown.add('starbase');
      this.terminalOverlay.addMessage(`<h>Starbase:</h> Enter buys selected goods, Backspace sells selected cargo, R refuels.`);
    }
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

    const frameStart = performance.now();
    let inputMs = 0;
    let updateMs = 0;
    let renderMs = 0;

    // Calculate deltaTime, capping it to prevent large jumps if paused/tabbed out
    const deltaTime = Math.min(0.1, (currentTime - this.lastUpdateTime) / 1000.0);
    this.lastUpdateTime = currentTime;

    try {
      // 1. Handle Input (including zoom)
      const inputStart = performance.now();
      this._processInput();
      // 2. Update Input Manager (clears justPressed)
      this.inputManager.update();
      inputMs = performance.now() - inputStart;
      // 3. Update Game State & Entities
      const updateStart = performance.now();
      this._update(deltaTime);
      updateMs = performance.now() - updateStart;
      // 4. Render Current State
      const renderStart = performance.now();
      this._render();
      renderMs = performance.now() - renderStart;

      // Reset force render flag after rendering
      if (this.forceFullRender) this.forceFullRender = false;
      this.updateFrameProfile(performance.now() - frameStart, inputMs, updateMs, renderMs);
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
        this.inputManager.wasActionJustPressed('HELP') ||
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

  private _handleStarbaseTradeInput(): boolean {
    if (this.stateManager.state !== 'starbase' || !this.stateManager.currentStarbase) {
      return false;
    }

    const starbase = this.stateManager.currentStarbase;
    const visibleRows = this.getStarbaseVisibleRowCount();
    const rows = this.getStarbaseRows(starbase, this.starbaseSectionId);
    const selectedIndex = clampIndex(this.getStarbaseSelection(), rows.length);

    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.moveStarbaseSelection(-1, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.moveStarbaseSelection(1, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.switchStarbaseSection(-1);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.switchStarbaseSection(1);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      this.moveStarbaseSelection(-visibleRows, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      this.moveStarbaseSelection(visibleRows, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM')) {
      this.activateStarbaseSelection(starbase, rows[selectedIndex]);
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return true;
    }

    if (this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
      this.starbaseSectionId = 'overview';
      this.starbaseAlert = 'Cancelled current panel.';
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return true;
    }

    if (this.inputManager.wasActionJustPressed('QUIT')) {
      this.starbaseSectionId = 'overview';
      this.starbaseAlert = 'Cancelled current panel.';
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return true;
    }

    if (this.inputManager.wasActionJustPressed('TRADE')) {
      this.starbaseSectionId = 'buy';
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('REFUEL')) {
      this._handleRefuelRequest();
      this.starbaseAlert = this.statusMessage;
      this.forceFullRender = true;
      return true;
    }

    return false;
  }

  private _handleOrbitInput(): boolean {
    if (this.stateManager.state !== 'orbit' || !this.stateManager.currentPlanet) {
      return false;
    }

    const bodies = this.getOrbitBodies();
    if (bodies.length === 0) return false;
    this.orbitSelectedBodyIndex = clampIndex(this.orbitSelectedBodyIndex, bodies.length);
    const selectedBody = bodies[this.orbitSelectedBodyIndex];
    const mapSize = getPlanetMapSize(selectedBody);

    if (this.orbitMode === 'overview') {
      if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
        this.orbitSelectedBodyIndex = (this.orbitSelectedBodyIndex - 1 + bodies.length) % bodies.length;
        this.resetOrbitLandingCursor();
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_RIGHT') || this.inputManager.wasActionJustPressed('CYCLE_TARGET')) {
        this.orbitSelectedBodyIndex = (this.orbitSelectedBodyIndex + 1) % bodies.length;
        this.resetOrbitLandingCursor();
        this.forceFullRender = true;
        return true;
      }
      if (
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
        this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
        this.inputManager.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF')
      ) {
        if (selectedBody.type === 'GasGiant' || selectedBody.type === 'IceGiant') {
          this.orbitAlert = 'No solid landing solution for giant-class atmosphere.';
        } else {
          selectedBody.ensureSurfaceReady();
          this.orbitMode = 'landing';
          this.orbitAlert = 'Select landing coordinates.';
        }
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
        this.stateManager.leaveOrbit();
        if (this.stateManager.statusMessage) {
          this.statusMessage = this.stateManager.statusMessage;
          this.stateManager.statusMessage = '';
        }
        this.forceFullRender = true;
        return true;
      }
      return false;
    }

    let moved = false;
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT') || this.inputManager.isActionActive('MOVE_LEFT')) {
      this.orbitLandingX = (this.orbitLandingX - 1 + mapSize) % mapSize;
      moved = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT') || this.inputManager.isActionActive('MOVE_RIGHT')) {
      this.orbitLandingX = (this.orbitLandingX + 1) % mapSize;
      moved = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP') || this.inputManager.isActionActive('MOVE_UP')) {
      this.orbitLandingY = Math.max(0, this.orbitLandingY - 1);
      moved = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN') || this.inputManager.isActionActive('MOVE_DOWN')) {
      this.orbitLandingY = Math.min(mapSize - 1, this.orbitLandingY + 1);
      moved = true;
    }
    if (moved) {
      this.orbitAlert = '';
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
      this.orbitMode = 'overview';
      this.orbitAlert = 'Landing selection cancelled.';
      this.forceFullRender = true;
      return true;
    }

    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
      this.inputManager.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF')
    ) {
      this.stateManager.landFromOrbit(selectedBody, this.orbitLandingX, this.orbitLandingY);
      if (this.stateManager.statusMessage) {
        this.statusMessage = this.stateManager.statusMessage;
        this.stateManager.statusMessage = '';
      }
      this.forceFullRender = true;
      return true;
    }

    return false;
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
      'PRIMARY_ACTION',
      'CYCLE_TARGET',
      'HELP',
      'TOGGLE_PROFILER',
      'APPROACH_TARGET',
    ];

    for (const action of discreteActions) {
      if (this.inputManager.wasActionJustPressed(action)) {
        logger.debug(`[Game:_handleDiscreteActions] Processing discrete action: ${action}`);

        if (action === 'INFO_TEST') {
          this.terminalOverlay.clear(); // Clear before adding test message
          this.terminalOverlay.addMessage(`Test message added at ${new Date().toLocaleTimeString()}`);
          return true; // Consume input
        }
        if (action === 'HELP') {
          this._showHelpOverlay();
          return true;
        }
        if (action === 'TOGGLE_PROFILER') {
          this.profilerVisible = !this.profilerVisible;
          this.forceFullRender = true;
          this.statusMessage = this.profilerVisible ? 'Performance profiler enabled.' : 'Performance profiler hidden.';
          return true;
        }
        if (action === 'CYCLE_TARGET') {
          this._cycleTarget();
          return true;
        }
        if (action === 'PRIMARY_ACTION') {
          this._executePrimaryAction();
          return true;
        }
        if (action === 'APPROACH_TARGET') {
          this._startApproachAssist();
          return true;
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
            this.terminalOverlay.clear(); // <<< CLEAR before handling scan request
            this._handleScanRequest(actionResult.requestScan);
            this.statusMessage = ''; // Scan uses terminal, clear status bar
          } else if ('requestSystemPeek' in actionResult) {
            this.terminalOverlay.clear(); // <<< CLEAR before handling peek request
            const peekedSystem = this.stateManager.peekAtSystem(
              this.player.position.worldX,
              this.player.position.worldY
            );
            if (peekedSystem) {
              // Add initial scanning message *before* dumping results
              //this.terminalOverlay.addMessage(STATUS_MESSAGES.HYPERSPACE_SCANNING_SYSTEM(peekedSystem.name));
              this._dumpScanToTerminal(peekedSystem); // Dump results using new method
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

  private _executePrimaryAction(): void {
    const actions = this.getCurrentAvailableActions();
    const primaryAction = this.choosePrimaryAction(actions);
    if (!primaryAction) {
      this.statusMessage = 'No contextual action available.';
      return;
    }

    switch (primaryAction.id) {
      case 'enter-system':
      case 'scan-system':
      case 'scan-local':
      case 'land-dock':
      case 'scan-object':
      case 'scan-star':
      case 'leave-system':
      case 'scan-surface':
      case 'mine':
      case 'liftoff':
      case 'refuel':
      case 'depart':
        this._executeActionByName(primaryAction.action);
        break;
      case 'use-starbase-row':
        if (this.stateManager.currentStarbase) {
          const rows = this.getStarbaseRows(this.stateManager.currentStarbase, this.starbaseSectionId);
          this.activateStarbaseSelection(this.stateManager.currentStarbase, rows[this.getStarbaseSelection()]);
        }
        break;
      case 'approach-target':
        this._startApproachAssist();
        break;
      case 'buy':
      case 'sell':
        this._executeActionByName(primaryAction.action);
        break;
      default:
        this.statusMessage = 'Choose a target or move closer.';
    }
  }

  private _executeActionByName(actionName: string): void {
    if (actionName === 'SCAN_SYSTEM_OBJECT') {
      const selectedTarget = this.getSelectedTarget();
      if (selectedTarget && this.isTargetWithinScanRange(selectedTarget)) {
        this.terminalOverlay.clear();
        this._dumpScanToTerminal(this.getScannableNavigationTarget(selectedTarget));
        this.statusMessage = '';
        return;
      }
    }

    const actionResult = this.actionProcessor.processAction(actionName, this.stateManager.state);
    if (typeof actionResult === 'string') {
      this.statusMessage = actionResult;
    } else if (actionResult && 'requestScan' in actionResult) {
      this.terminalOverlay.clear();
      this._handleScanRequest(actionResult.requestScan);
      this.statusMessage = '';
    } else if (actionResult && 'requestSystemPeek' in actionResult) {
      this.terminalOverlay.clear();
      const peekedSystem = this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY);
      if (peekedSystem) this._dumpScanToTerminal(peekedSystem);
      else this.terminalOverlay.addMessage(STATUS_MESSAGES.HYPERSPACE_SCAN_FAIL);
      this.statusMessage = '';
    }

    if (this.stateManager.statusMessage) {
      this.statusMessage = this.stateManager.statusMessage;
      this.stateManager.statusMessage = '';
    }
  }

  private choosePrimaryAction(actions: AvailableAction[]): AvailableAction | null {
    const excludedPrimaryIds = new Set([
      'primary',
      'move',
      'help',
      'cycle-target',
      'zoom-in',
      'zoom-out',
      'section-left',
      'section-right',
      'cancel-starbase-panel',
    ]);
    return (
      actions.find((action) => action.enabled && !excludedPrimaryIds.has(action.id)) ??
      null
    );
  }

  private _cycleTarget(): void {
    const targets = this.getNavigationTargets();
    if (targets.length === 0) {
      this.statusMessage = 'No targets in current view.';
      return;
    }
    this.currentTargetIndex = (this.currentTargetIndex + 1) % targets.length;
    const target = targets[this.currentTargetIndex];
    this.currentTargetSignature = this.getTargetSignature(target);
    this.approachTargetSignature = null;
    this.statusMessage = `Target selected: ${this.getTargetName(target)}.`;
  }

  private _startApproachAssist(): void {
    if (this.stateManager.state !== 'system') {
      this.statusMessage = 'Approach assist is only available in system view.';
      return;
    }
    const target = this.getSelectedTarget();
    if (!target) {
      this.statusMessage = 'No navigation target selected.';
      return;
    }
    this.approachTargetSignature = this.getTargetSignature(target);
    this.statusMessage = `Approach assist engaged: ${this.getTargetName(target)}.`;
  }

  private _showHelpOverlay(): void {
    const actions = this.getCurrentAvailableActions().filter((action) => action.enabled);
    const lines = createHelpReferenceLines(this.stateManager.state, actions);
    this.popupContent = lines;
    this.popupState = 'opening';
    this.popupOpenCloseProgress = 0;
    this.popupTextProgress = 0;
    this.popupTotalChars = lines.reduce((sum, line) => sum + line.length + 1, 0);
    this.forceFullRender = true;
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
      this.approachTargetSignature = null;
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
    // 2. Check starbase market controls before generic enter/backspace handling.
    if (this._handleStarbaseTradeInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleOrbitInput()) {
      this._publishStatusUpdate();
      return;
    }
    // 3. Check Zoom (consumes input if zoom changed)
    if (this._handleZoomInput()) {
      // Publish status immediately after zoom changes to reflect new scale/clear messages
      this._publishStatusUpdate();
      return; // Input consumed by zoom change
    }
    // 4. Check Discrete Actions (consumes input if an action is taken)
    if (this._handleDiscreteActions()) {
      // Discrete action handled, publish status update reflecting its outcome
      this._publishStatusUpdate();
      return; // Input consumed by a discrete action
    }
    // 5. Check Movement (does not consume input, allows holding)
    this._handleMovementInput();

    // 6. Publish Status Update (Reflects movement status or lack of action)
    // Note: Status might have been cleared by movement, or remain from previous frame if no action/move
    this._publishStatusUpdate();
  }
  /** Gets the current view scale in meters/cell based on the zoom level. */
  private getCurrentViewScale(): number {
    // Clamp index to prevent errors if it somehow goes out of bounds
    const safeIndex = Math.max(0, Math.min(this.currentZoomLevelIndex, this.zoomLevels.length - 1));
    return this.zoomLevels[safeIndex];
  }

  /** Handles scan requests triggered by ActionProcessor */
  private _handleScanRequest(scanType: 'system_object' | 'planet_surface'): void {
    const currentState = this.stateManager.state;
    logger.debug(
      `[Game:_handleScanRequest] Handling scan request type '${scanType}' in state '${currentState}'`
    );

    // ** CLEAR Terminal Overlay ** Moved to _handleDiscreteActions where the request originates

    let targetToScan: ScanTarget | null = null;
    let scanStatusMessage = ''; // Initial message for terminal

    if (scanType === 'system_object') {
      if (currentState === 'system') {
        const system = this.stateManager.currentSystem;
        if (!system) {
          scanStatusMessage = '<e>Scan Error: System data missing.</e>';
        } else {
          const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
          const scannableObject = system.getScannableObjectNear(this.player.position.systemX, this.player.position.systemY);
          const distSqToObject = nearbyObject
            ? this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY)
            : Infinity;
          const nearbyStar = system.getStarNear(
            this.player.position.systemX,
            this.player.position.systemY,
            CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER
          );
          const distSqToStar = nearbyStar
            ? this.player.distanceSqToSystemCoords(nearbyStar.systemX, nearbyStar.systemY)
            : Infinity;
          const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;
          if (nearbyStar && distSqToStar < distSqToObject && distSqToStar < scanThresholdSq) {
            targetToScan = nearbyStar;
            //scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_STAR(system.name);
          } else if (scannableObject && distSqToObject < scanThresholdSq) {
            targetToScan = scannableObject;
            // scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_OBJECT(nearbyObject.name);
          } else {
            scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_FAIL_NO_TARGET;
          }
        }
      } else {
        scanStatusMessage = `<e>Cannot perform system scan in ${currentState} state.</e>`;
      }
    } else if (scanType === 'planet_surface') {
      if (currentState === 'planet') {
        const planet = this.stateManager.currentPlanet;
        if (planet) {
          targetToScan = planet;
          scanStatusMessage = `<h>Scanning surface of ${planet.name}...</h>`;
        } else {
          scanStatusMessage = '<e>Planet scan error: Data missing.</e>';
        }
      } else {
        scanStatusMessage = `<e>Cannot perform surface scan in ${currentState} state.</e>`;
      }
    }

    // Send initial "Scanning..." message to terminal *before* results
    if (scanStatusMessage) {
      this.terminalOverlay.addMessage(scanStatusMessage);
    }

    // Dump results if target found (results added line-by-line via _dumpScanToTerminal)
    if (targetToScan) {
      this._dumpScanToTerminal(targetToScan);
    }
    // Status bar update happens in the main loop via _publishStatusUpdate
  }

  /** Dumps formatted scan results to the terminal overlay using addMessageLines */
  private _dumpScanToTerminal(target: ScanTarget | string): void {
    let lines: string[] | null = null;
    let targetName = 'Unknown Target';

    try {
      if (target instanceof SolarSystem) {
        lines = this._formatStarScanPopup(target);
        targetName = `Star (${target.name})`;
      } else if (typeof target === 'object' && target !== null && 'starType' in target && 'luminosityW' in target) {
        lines = this._formatStarScanPopup(target as StellarBody);
        targetName = `Star (${(target as StellarBody).name})`;
      } else if (target instanceof Planet || target instanceof Starbase) {
        targetName = target.name;
        if (target instanceof Planet && !target.scanned) {
          target.scan(); // Perform scan if needed
        }
        lines = target.getScanInfo(); // Get formatted lines
      } else {
        logger.error('[Game:_dumpScanToTerminal] Unknown or invalid scan target type:', target);
        lines = [`<e>Scan Error: Unknown object type.</e>`];
      }

      if (lines && lines.length > 0) {
        logger.info(`[Game] Dumping scan results for ${targetName} to terminal overlay.`);
        // ** Use the new method to add all lines at once **
        this.terminalOverlay.addMessageLines(lines);
        if (target instanceof Planet || target instanceof SolarSystem || (typeof target === 'object' && target !== null && 'starType' in target && 'luminosityW' in target)) {
          this.completeMissionsForScan(target as Planet | SolarSystem | StellarBody);
        }
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

  private completeMissionsForScan(target: Planet | SolarSystem | StellarBody): void {
    const system = this.stateManager.currentSystem;
    const completed: StarbaseMission[] = [];

    for (const mission of Object.values(this.activeMissions)) {
      if (this.completedMissionIds.has(mission.id)) continue;
      if (system && mission.systemName !== system.name) continue;
      if (!isMissionCompletedByScan(mission, target)) continue;
      completed.push(mission);
    }

    for (const mission of completed) {
      this.completedMissionIds.add(mission.id);
      delete this.activeMissions[mission.id];
      this.player.resources.credits += mission.rewardCredits;
      this.statusMessage = `Mission complete: ${mission.title}. Payment authorised: ${mission.rewardCredits} Cr.`;
      this.terminalOverlay.addMessage(`<h>${this.statusMessage}</h>`);
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: mission.rewardCredits,
      });
      logger.info(`[Game] Mission completed: ${mission.id} (${mission.rewardCredits} Cr).`);
    }
  }

  /** Formats scan results for a star/system */
  private _formatStarScanPopup(target: SolarSystem | StellarBody): string[] {
    const lines: string[] = [];
    const system = target instanceof SolarSystem ? target : null;
    if (system?.isStarless) {
      const primaryBody = system.planets.find((planet) => planet !== null);
      lines.push(``);
      lines.push(`<h>--- DEEP SPACE OBJECT SCAN: ${system.name} ---</h>`);
      lines.push(`Classification: <hl>FREE PLANETARY-MASS OBJECT</hl>`);
      lines.push(`Architecture: <hl>STARLESS</hl> (${primaryBody?.moons.length ?? 0} retained moon${primaryBody?.moons.length === 1 ? '' : 's'})`);
      lines.push(`Thermal Source: <hl>residual formation heat and tidal dissipation</hl>`);
      lines.push(`Chart Radius: <hl>${formatDistanceAu(system.edgeRadius)}</hl>`);
      lines.push(`One-way Light Time: <hl>${formatLightTimeFromMeters(system.edgeRadius)}</hl> to chart edge`);
      if (primaryBody) {
        lines.push(`Primary Body: <hl>${primaryBody.name}</hl> (${primaryBody.type})`);
        lines.push(`Mass: <hl>${primaryBody.mass.toExponential(2)} kg</hl> | Gravity: <hl>${primaryBody.gravity.toFixed(2)}g</hl>`);
        lines.push(`Temperature: <hl>${primaryBody.surfaceTemp} K</hl>`);
      }
      lines.push(`Facilities: <hl>None Detected</hl>`);
      lines.push('<h>--- SCAN COMPLETE---</h>');
      lines.push(``);
      return lines;
    }
    const star: StellarBody = system ? system.stars[0] : target as StellarBody;
    const starInfo = SPECTRAL_TYPES[star.starType];
    lines.push(``);
    lines.push(`<h>--- STELLAR SCAN: ${star.name} ---</h>`);
    if (system) lines.push(`Architecture: <hl>${system.architecture.kind.toUpperCase()}</hl> (${system.stars.length} star${system.stars.length === 1 ? '' : 's'})`);
    lines.push(`Spectral Type: <hl>${star.starType}</hl>`); // Use highlight tag
    lines.push(`Stellar Age: <hl>~${star.environment.ageGyr.toFixed(2)} Gyr</hl>`);
    lines.push(`Metallicity: <hl>${star.environment.metallicityFeH >= 0 ? '+' : ''}${star.environment.metallicityFeH.toFixed(2)} [Fe/H]</hl>`);
    if (starInfo) {
      lines.push(`Temperature: <hl>~${starInfo.temp.toLocaleString()} K</hl>`);
      // Calculate approx luminosity relative to Sol if possible
      const SUN_TEMP = SPECTRAL_TYPES['G'].temp;
      const SUN_RADIUS_M = 6.957e8;
      const starRadius_m = starInfo.radius ?? SUN_RADIUS_M;
      const relativeLuminosity = Math.pow(starInfo.temp / SUN_TEMP, 4) * Math.pow(starRadius_m / SUN_RADIUS_M, 2);
      lines.push(`Luminosity: <hl>~${relativeLuminosity.toExponential(1)}</hl> (Rel. Sol)`);
      lines.push(`Mass: <hl>~${(starInfo.mass / 1.98847e30).toFixed(2)} Solar Masses</hl>`); // Show solar masses
      lines.push(`Radius: <hl>~${(starInfo.radius / 6.957e8).toFixed(1)} Solar Radii</hl>`); // Show solar radii
    } else {
      lines.push(`Temperature: [-W-]Unknown</w>`);
      lines.push(`Luminosity: [-W-]Unknown</w>`);
      lines.push(`Mass: [-W-]Unknown</w>`);
      lines.push(`Radius: [-W-]Unknown</w>`);
    }
    if (system) {
      lines.push(`System Radius: <hl>${formatDistanceAu(system.edgeRadius)}</hl>`);
      lines.push(`One-way Light Time: <hl>${formatLightTimeFromMeters(system.edgeRadius)}</hl> to chart edge`);
      lines.push(`Planetary Bodies: <hl>${system.planets.filter((p) => p !== null).length}</hl>`);
      lines.push(`Facilities: <hl>${system.starbase ? 'Starbase Detected' : 'None Detected'}</hl>`);
    }
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
    this.astrometricOverlay.update(
      {
        state: this.stateManager.state,
        player: this.player,
        system: this.stateManager.currentSystem,
        planet: this.stateManager.currentPlanet,
        starbase: this.stateManager.currentStarbase,
        viewScale: this.getCurrentViewScale(),
      },
      deltaTime,
      Math.max(1, Math.floor(this.renderer.getCanvas().width / Math.max(1, this.renderer.getCharWidthPx()))),
      Math.max(1, Math.floor(this.renderer.getCanvas().height / Math.max(1, this.renderer.getCharHeightPx())))
    );

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
          case 'orbit':
            stateUpdateStatus = this._updateOrbit(deltaTime);
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
    const survey = this.getCurrentHyperspaceSurvey();
    const currentProps =
      survey.visibleCells[
        Math.floor(survey.rows / 2) * survey.cols + Math.floor(survey.cols / 2)
      ]?.system ?? this.systemDataGenerator.getSystemMapProperties(this.player.position.worldX, this.player.position.worldY);
    const isNearStar = currentProps.exists;
    const currentPhenomenon =
      survey.visibleCells[
        Math.floor(survey.rows / 2) * survey.cols + Math.floor(survey.cols / 2)
      ]?.phenomenon ?? this.systemDataGenerator.getDeepSpacePhenomenonProperties(this.player.position.worldX, this.player.position.worldY);
    const isNearRoguePlanet = currentPhenomenon?.exists && currentPhenomenon.type === 'rogue-planet';
    const medium = survey.medium;
    const contact = this.toNavigationContact(survey.nearestSystemContact);
    const fuelReach = Math.floor(this.player.resources.fuel / Math.max(1, CONFIG.HYPERSPACE_FUEL_COST));

    let baseStatus = `Hyperspace | Loc: ${this.player.position.worldX},${this.player.position.worldY} | ISM: ${medium.label} sensors ${(medium.sensorRangeMultiplier * 100).toFixed(0)}%`;
    if (contact) {
      baseStatus += ` | Contact: ${contact.name} ${contact.starType} ${this.formatHyperspaceBearing(contact)} ${contact.rangeCells.toFixed(1)}c/${formatHyperspaceSpan(contact.rangeCells)}`;
      if (contact.objectKind === 'brown-dwarf') baseStatus += ' faint';
      if (contact.hasStarbase) baseStatus += ' Starbase';
    } else {
      baseStatus += ` | Contact: none within ${formatHyperspaceSpan(CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS)}`;
    }
    baseStatus += ` | Fuel reach: ${fuelReach} jump${fuelReach === 1 ? '' : 's'} / ${formatHyperspaceSpan(fuelReach)}`;

    if (isNearStar || isNearRoguePlanet) {
      // Only peek if necessary for status display
      const peekedSystem = this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY);
      if (peekedSystem) {
        const starbaseText = peekedSystem.starbase ? ' (Starbase)' : '';
        const objectLabel = peekedSystem.isStarless ? 'Free planetary mass' : 'Near';
        const actions = createAvailableActions({
          state: 'hyperspace',
          player: this.player,
          system: null,
          planet: null,
          starbase: null,
          isNearHyperspaceSystem: true,
          nearbySystemName: peekedSystem.name,
        });
        baseStatus += ` | ${objectLabel} ${peekedSystem.name}${starbaseText}. Actions: ${formatAvailableActions(actions)}`;
      } else {
        // Hash indicated star, but peek failed? Log warning.
        logger.warn(
          `[Game:_updateHyperspace] Hash indicated explorable contact at ${this.player.position.worldX},${this.player.position.worldY} but peek failed.`
        );
        const actions = createAvailableActions({
          state: 'hyperspace',
          player: this.player,
          system: null,
          planet: null,
          starbase: null,
          isNearHyperspaceSystem: true,
        });
        baseStatus += ` | Near navigable contact. Actions: ${formatAvailableActions(actions, 2)}`;
      }
    } else {
      this.stateManager.resetPeekedSystem(); // Clear peek cache if not near star
      const actions = createAvailableActions({
        state: 'hyperspace',
        player: this.player,
        system: null,
        planet: null,
        starbase: null,
        isNearHyperspaceSystem: false,
      });
      baseStatus += ` | Actions: ${formatAvailableActions(actions, 5)}`;
    }
    return baseStatus;
  }

  private getCurrentHyperspaceSurvey() {
    const cols = Math.max(1, Math.floor(this.renderer.getCanvas().width / Math.max(1, this.renderer.getCharWidthPx())));
    const rows = Math.max(1, Math.floor(this.renderer.getCanvas().height / Math.max(1, this.renderer.getCharHeightPx())));
    return this.hyperspaceSurveyService.getSurvey(this.player.position.worldX, this.player.position.worldY, cols, rows);
  }

  private toNavigationContact(contact: HyperspaceSurveyContact | null): HyperspaceNavigationContact | null {
    if (!contact || contact.kind !== 'system' || !contact.system?.name || !contact.system.starType) return null;
    return {
      dx: contact.dx,
      dy: contact.dy,
      rangeCells: Math.sqrt(contact.distSq),
      name: contact.system.name,
      starType: contact.system.starType,
      hasStarbase: contact.system.hasStarbase,
      objectKind: contact.system.objectKind,
    };
  }

  private formatHyperspaceBearing(contact: HyperspaceNavigationContact): string {
    if (contact.dx === 0 && contact.dy === 0) return 'HERE';
    const vertical = contact.dy < 0 ? 'N' : contact.dy > 0 ? 'S' : '';
    const horizontal = contact.dx < 0 ? 'W' : contact.dx > 0 ? 'E' : '';
    return `${vertical}${horizontal}`;
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
    this.ensureSelectedTarget();
    this.updateApproachAssist(deltaTime);

    // Determine status message based on proximity
    const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
    const selectedTarget = this.getSelectedTarget();
    const systemKindLabel = system.isStarless
      ? 'starless rogue planetary-mass object'
      : `${system.architecture.kind}, ${system.stars.length} star${system.stars.length === 1 ? '' : 's'}`;
    let status = `System: ${system.name} (${systemKindLabel}) | Pos: ${this.player.position.systemX.toExponential(
      1
    )},${this.player.position.systemY.toExponential(1)}m`; // Use meters
    if (selectedTarget) status += ` | Target: ${this.getTargetName(selectedTarget)}`;

    if (nearbyObject) {
      const dist = Math.sqrt(this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY));
      status += ` | Near ${nearbyObject.name} (${(dist / AU_IN_METERS).toFixed(
        2
      )} AU).`; // Show dist in AU
    } else {
      // Check proximity to star for scanning
      const nearestStar = system.stars.length > 0
        ? system.getNearestStar(this.player.position.systemX, this.player.position.systemY)
        : null;
      const distSqToStar = nearestStar
        ? this.player.distanceSqToSystemCoords(nearestStar.systemX, nearestStar.systemY)
        : Infinity;
      const scanThresholdSq = (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;
      const nearStar = Boolean(nearestStar && distSqToStar < scanThresholdSq);

      if (this.isPlayerNearExit()) {
        // Check if near edge
        status += ` | Near system edge.`;
        if (nearStar && nearestStar) status += ` Near ${nearestStar.id}.`; // Allow star scan even near edge
      } else if (nearStar && nearestStar) {
        status += ` | Near ${nearestStar.name}.`;
      }
    }
    const nearestStar = system.stars.length > 0
      ? system.getNearestStar(this.player.position.systemX, this.player.position.systemY)
      : null;
    const distSqToStar = nearestStar ? this.player.distanceSqToSystemCoords(nearestStar.systemX, nearestStar.systemY) : Infinity;
    const nearStar = Boolean(nearestStar && distSqToStar < (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2);
    const actions = createAvailableActions({
      state: 'system',
      player: this.player,
      system,
      planet: null,
      starbase: null,
      nearbyObject,
      nearbyStar: nearStar ? nearestStar : null,
      selectedTargetName: selectedTarget ? this.getTargetName(selectedTarget) : null,
      hasSelectedTarget: Boolean(selectedTarget),
      isNearSystemEdge: this.isPlayerNearExit(),
    });
    status += ` | Actions: ${formatAvailableActions(actions, 5)}`;
    return status;
  }

  /** Helper to check if player is near system edge */
  private isPlayerNearExit(): boolean {
    const system = this.stateManager.currentSystem;
    if (!system) return false;
    const distSq = this.player.distanceSqToSystemCoords(0, 0); // Distance from barycenter
    // Use edgeRadius which is in meters
    const exitThresholdSq = (system.edgeRadius * CONFIG.SYSTEM_EDGE_LEAVE_FACTOR) ** 2;
    return distSq > exitThresholdSq;
  }

  private getNavigationTargets(): NavigationTarget[] {
    if (this.stateManager.state !== 'system' || !this.stateManager.currentSystem) return [];
    const system = this.stateManager.currentSystem;
    const targets: NavigationTarget[] = [...system.stars];
    system.planets.forEach((planet) => {
      if (!planet) return;
      targets.push(planet);
      if (planet.moons) targets.push(...planet.moons);
    });
    if (system.starbase) targets.push(system.starbase);
    return targets;
  }

  private ensureSelectedTarget(): NavigationTarget | null {
    const targets = this.getNavigationTargets();
    if (targets.length === 0) {
      this.currentTargetIndex = 0;
      this.currentTargetSignature = '';
      return null;
    }

    const existingIndex = targets.findIndex((target) => this.getTargetSignature(target) === this.currentTargetSignature);
    if (existingIndex >= 0) {
      this.currentTargetIndex = existingIndex;
      return targets[existingIndex];
    }

    let closestIndex = 0;
    let closestDistanceSq = Number.POSITIVE_INFINITY;
    targets.forEach((target, index) => {
      const coords = this.getTargetCoords(target);
      const distanceSq = this.player.distanceSqToSystemCoords(coords.x, coords.y);
      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closestIndex = index;
      }
    });
    this.currentTargetIndex = closestIndex;
    this.currentTargetSignature = this.getTargetSignature(targets[closestIndex]);
    return targets[closestIndex];
  }

  private getSelectedTarget(): NavigationTarget | null {
    if (this.stateManager.state !== 'system') return null;
    const targets = this.getNavigationTargets();
    if (targets.length === 0) return null;
    const existingIndex = targets.findIndex((target) => this.getTargetSignature(target) === this.currentTargetSignature);
    if (existingIndex >= 0) return targets[existingIndex];
    return this.ensureSelectedTarget();
  }

  private getTargetSignature(target: NavigationTarget): string {
    if (target instanceof Planet) return `planet:${target.name}`;
    if (target instanceof Starbase) return `starbase:${target.name}`;
    return `star:${target.name}`;
  }

  private getTargetName(target: NavigationTarget): string {
    return target.name;
  }

  private getTargetCoords(target: NavigationTarget): { x: number; y: number } {
    return { x: target.systemX, y: target.systemY };
  }

  private getScannableNavigationTarget(target: NavigationTarget): ScanTarget {
    const system = this.stateManager.currentSystem;
    if (system && target instanceof Planet) {
      return system.getOrbitParentFor(target);
    }
    return target;
  }

  private isTargetWithinScanRange(target: NavigationTarget): boolean {
    const coords = this.getTargetCoords(target);
    const multiplier = target instanceof Planet || target instanceof Starbase ? 1 : CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
    return this.player.distanceSqToSystemCoords(coords.x, coords.y) < (CONFIG.LANDING_DISTANCE * multiplier) ** 2;
  }

  private updateApproachAssist(deltaTime: number): void {
    if (this.stateManager.state !== 'system' || !this.approachTargetSignature) return;
    const target = this.getSelectedTarget();
    if (!target || this.getTargetSignature(target) !== this.approachTargetSignature) {
      this.approachTargetSignature = null;
      return;
    }

    const coords = this.getTargetCoords(target);
    const dx = coords.x - this.player.position.systemX;
    const dy = coords.y - this.player.position.systemY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const desiredDistance = CONFIG.LANDING_DISTANCE * 0.7;
    if (distance <= desiredDistance) {
      this.approachTargetSignature = null;
      this.statusMessage = `Approach complete: ${this.getTargetName(target)}.`;
      return;
    }

    const step = Math.min(distance - desiredDistance, Math.max(CONFIG.SYSTEM_MOVE_INCREMENT * 0.2, CONFIG.SYSTEM_MOVE_INCREMENT * deltaTime * 4));
    this.player.position.systemX += (dx / distance) * step;
    this.player.position.systemY += (dy / distance) * step;
    this.player.render.char = this.player.render.directionGlyph;
    this.forceFullRender = true;
  }

  private _updateOrbit(deltaTime: number): string {
    const planet = this.stateManager.currentPlanet;
    if (!planet) return 'Orbit Error: Planet data missing.';
    this.orbitElapsedSeconds += deltaTime;
    const selectedBody = this.getSelectedOrbitBody();
    const mapSize = getPlanetMapSize(selectedBody);
    this.orbitLandingX = ((Math.floor(this.orbitLandingX) % mapSize) + mapSize) % mapSize;
    this.orbitLandingY = Math.max(0, Math.min(mapSize - 1, Math.floor(this.orbitLandingY)));
    this.forceFullRender = true;

    const actions = createAvailableActions({
      state: 'orbit',
      player: this.player,
      system: this.stateManager.currentSystem,
      planet: selectedBody,
      starbase: null,
    });
    const orbitText = selectedBody.orbitDistance <= 0 ? 'none' : `${formatDistanceAu(selectedBody.orbitDistance)} from primary`;
    const signalText = selectedBody.orbitDistance <= 0 ? 'none' : formatLightTimeFromMeters(selectedBody.orbitDistance);
    return `Orbit: ${selectedBody.name} | Orbit ${orbitText} | Signal ${signalText} | Mode: ${this.orbitMode} | Site ${this.orbitLandingX},${this.orbitLandingY} | Actions: ${formatAvailableActions(actions, 4)}.`;
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
    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
      if (planet.scanned) {
        status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
      } else {
        status += ` | Scan: Required (Potential: ${planet.mineralRichness})`;
      }
    } else {
      status += ` | Scan: N/A (${planet.type})`;
    }
    const actions = createAvailableActions({
      state: 'planet',
      player: this.player,
      system: this.stateManager.currentSystem,
      planet,
      starbase: null,
    });
    status += ` | Actions: ${formatAvailableActions(actions, 4)}.`;
    return status;
  }

  private _updateStarbase(_deltaTime: number): string {
    const starbase = this.stateManager.currentStarbase;
    if (!starbase) {
      /* ... error handling ... */ return 'Starbase Error: Data missing.';
    }
    const section = STARBASE_SECTIONS.find((candidate) => candidate.id === this.starbaseSectionId)?.label ?? 'Operations';
    return `Docked: ${starbase.name} | Panel: ${section} | Enter use, Esc cancel, L depart.`;
  }

  // --- Rendering ---
  private _render(): void {
    const currentState = this.stateManager.state;
    try {
      const directCanvasOverlayVisible =
        this.terminalOverlay.hasVisibleContent() || this.astrometricOverlay.hasVisibleContent() || this.profilerVisible;
      const mainRenderSignature = this.getMainRenderSignature();
      if (this.canSkipMainRender(currentState, directCanvasOverlayVisible, mainRenderSignature)) {
        return;
      }
      const renderPrepStart = performance.now();
      const fullCanvasRepaint = this.forceFullRender || directCanvasOverlayVisible;
      this.renderer.clear(fullCanvasRepaint);

      // Draw main content layer based on state
      switch (currentState) {
        case 'hyperspace':
          this.renderer.drawHyperspace(this.player);
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
        case 'orbit':
          const orbitPlanet = this.stateManager.currentPlanet;
          if (orbitPlanet) {
            this.renderer.drawOrbitInterface(this.createCurrentOrbitScreen());
          } else {
            this._renderError('Orbit data missing for render!');
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
              this.renderer.drawStarbaseInterface(this.player, starbase, this.createCurrentStarbaseScreen());
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

      if (fullCanvasRepaint) {
        this.renderer.renderBufferFull();
      } else {
        this.renderer.renderDiff();
      }
      this.lastFrameProfile.renderPrepMs = performance.now() - renderPrepStart;
      this.logRenderStats();
      this.lastMainRenderSignature = mainRenderSignature;

      const overlayStart = performance.now();
      this.astrometricOverlay.render(
        this.renderer.getContext(),
        this.renderer.getCharWidthPx(),
        this.renderer.getCharHeightPx()
      );

      // Draw Terminal Overlay on top
      this.terminalOverlay.render(
        this.renderer.getContext(),
        this.renderer.getCanvas().width,
        this.renderer.getCanvas().height
      );
      this.renderPerformanceOverlay();
      this.lastFrameProfile.overlayMs = performance.now() - overlayStart;
    } catch (renderError) {
      logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, renderError);
      this.statusMessage = `FATAL RENDER ERROR: ${
        renderError instanceof Error ? renderError.message : String(renderError)
      }. Refresh.`;
      this._publishStatusUpdate(); // Try to show error
      this.stopGame(); // Stop loop on render errors
    }
  }

  private canSkipMainRender(state: GameState, directCanvasOverlayVisible: boolean, signature: string): boolean {
    if (this.forceFullRender || directCanvasOverlayVisible || this.popupState !== 'inactive') return false;
    if (state === 'starbase' && this.starbaseAlert) return false;
    if (state !== 'hyperspace' && state !== 'planet' && state !== 'starbase') return false;
    return signature === this.lastMainRenderSignature;
  }

  private getMainRenderSignature(): string {
    const state = this.stateManager.state;
    switch (state) {
      case 'hyperspace':
        return [
          state,
          this.player.position.worldX,
          this.player.position.worldY,
          this.player.render.char,
        ].join('|');
      case 'planet':
        return [
          state,
          this.stateManager.currentPlanet?.name ?? '',
          this.player.position.surfaceX,
          this.player.position.surfaceY,
          this.player.render.char,
          this.stateManager.currentPlanet?.scanned ? 'scanned' : 'unscanned',
        ].join('|');
      case 'starbase':
        return [
          state,
          this.stateManager.currentStarbase?.name ?? '',
          this.starbaseSectionId,
          this.getStarbaseSelection(),
          this.getStarbaseOffset(),
          this.starbaseAlert,
          this.player.resources.credits,
          this.player.resources.fuel,
        ].join('|');
      default:
        return `${state}|${performance.now()}`;
    }
  }

  private updateFrameProfile(frameMs: number, inputMs: number, updateMs: number, renderMs: number): void {
    const blend = this.lastFrameProfile.frameMs > 0 ? 0.18 : 1;
    this.lastFrameProfile.frameMs = this.blendProfileValue(this.lastFrameProfile.frameMs, frameMs, blend);
    this.lastFrameProfile.inputMs = this.blendProfileValue(this.lastFrameProfile.inputMs, inputMs, blend);
    this.lastFrameProfile.updateMs = this.blendProfileValue(this.lastFrameProfile.updateMs, updateMs, blend);
    this.lastFrameProfile.renderMs = this.blendProfileValue(this.lastFrameProfile.renderMs, renderMs, blend);
    this.lastFrameProfile.fps = this.lastFrameProfile.frameMs > 0 ? 1000 / this.lastFrameProfile.frameMs : 0;
  }

  private blendProfileValue(previous: number, next: number, blend: number): number {
    return previous * (1 - blend) + next * blend;
  }

  private renderPerformanceOverlay(): void {
    if (!this.profilerVisible) return;
    const ctx = this.renderer.getContext();
    const charWidth = this.renderer.getCharWidthPx();
    const charHeight = this.renderer.getCharHeightPx();
    if (charWidth <= 0 || charHeight <= 0) return;

    const stats = this.renderer.getLastRenderStats();
    const lines = [
      `PERF ${this.lastFrameProfile.fps.toFixed(0)} FPS  FRAME ${this.lastFrameProfile.frameMs.toFixed(1)}ms`,
      `INPUT ${this.lastFrameProfile.inputMs.toFixed(1)}  UPDATE ${this.lastFrameProfile.updateMs.toFixed(1)}  RENDER ${this.lastFrameProfile.renderMs.toFixed(1)}ms`,
      `PREP ${this.lastFrameProfile.renderPrepMs.toFixed(1)}  OVERLAY ${this.lastFrameProfile.overlayMs.toFixed(1)}  CANVAS ${stats.durationMs.toFixed(1)}ms`,
      `${stats.mode.toUpperCase()} CELLS ${stats.cellsDrawn}  BG ${stats.backgroundsDrawn}  GLYPHS ${stats.glyphsDrawn}`,
    ];
    const widthChars = lines.reduce((max, line) => Math.max(max, line.length), 0) + 2;
    const x = charWidth;
    const y = charHeight;
    const width = widthChars * charWidth;
    const height = (lines.length + 1) * charHeight;

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - Math.floor(charWidth * 0.5), y - Math.floor(charHeight * 0.35), width, height);
    ctx.globalAlpha = 0.92;
    ctx.font = `${charHeight * 0.78}px ${CONFIG.THIN_FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;
    lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? '#00CCAA' : '#7FE8C4';
      ctx.fillText(line, x, y + index * charHeight);
    });
    ctx.restore();
  }

  private logRenderStats(): void {
    const now = performance.now();
    if (now - this.lastRenderStatsLogAt < 2000) return;
    this.lastRenderStatsLogAt = now;
    const stats = this.renderer.getLastRenderStats();
    logger.debug(
      `[Game:_render] ${stats.mode} render: ${stats.cellsDrawn} changed cells, ${stats.backgroundsDrawn} bg cells, ${stats.glyphsDrawn} glyphs in ${stats.durationMs.toFixed(2)}ms`
    );
  }

  /** Helper to render an error message */
  private _renderError(message: string): void {
    logger.error(`[Game:_renderError] Displaying: ${message}`);
    this.renderer.clear(true); // Clear physically
    this.renderer.drawString(message, 1, 1, '#FF0000', CONFIG.DEFAULT_BG_COLOUR);
    this.statusMessage = `ERROR: ${message}`;
    this._publishStatusUpdate(); // Update status bar
    // Render the error state immediately
    this.renderer.renderBufferFull();
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

    const actions = this.getCurrentAvailableActions();
    eventManager.publish(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, {
      actions,
      primaryActionId: this.choosePrimaryAction(actions)?.id,
      targetName: this.getCommandStripTargetName(),
    });
  }

  private getCommandStripTargetName(): string | undefined {
    if (this.stateManager.state === 'hyperspace') {
      const contact = this.toNavigationContact(this.getCurrentHyperspaceSurvey().nearestSystemContact);
      return contact ? `${contact.name} ${this.formatHyperspaceBearing(contact)} ${contact.rangeCells.toFixed(1)}c` : undefined;
    }
    const selectedTarget = this.getSelectedTarget();
    return selectedTarget ? this.getTargetName(selectedTarget) : undefined;
  }

  private getCurrentAvailableActions(): AvailableAction[] {
    const state = this.stateManager.state;
    if (state === 'hyperspace') {
      const baseSeedInt = this.gameSeedPRNG.seed;
      const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
      const hash = fastHash(this.player.position.worldX, this.player.position.worldY, baseSeedInt);
      const isNearStar = hash % CONFIG.STAR_CHECK_HASH_SCALE < starPresenceThreshold;
      const peekedSystem = isNearStar
        ? this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY)
        : null;
      return createAvailableActions({
        state,
        player: this.player,
        system: null,
        planet: null,
        starbase: null,
        isNearHyperspaceSystem: isNearStar,
        nearbySystemName: peekedSystem?.name,
      });
    }

    if (state === 'system') {
      const system = this.stateManager.currentSystem;
      if (!system) {
        return createAvailableActions({ state, player: this.player, system: null, planet: null, starbase: null });
      }
      const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
      const nearestStar = system.stars.length > 0
        ? system.getNearestStar(this.player.position.systemX, this.player.position.systemY)
        : null;
      const nearStar =
        nearestStar !== null &&
        this.player.distanceSqToSystemCoords(nearestStar.systemX, nearestStar.systemY) <
        (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2;
      const selectedTarget = this.getSelectedTarget();
      return createAvailableActions({
        state,
        player: this.player,
        system,
        planet: null,
        starbase: null,
        nearbyObject,
        nearbyStar: nearStar ? nearestStar : null,
        selectedTargetName: selectedTarget ? this.getTargetName(selectedTarget) : null,
        hasSelectedTarget: Boolean(selectedTarget),
        isNearSystemEdge: this.isPlayerNearExit(),
      });
    }

    if (state === 'planet') {
      return createAvailableActions({
        state,
        player: this.player,
        system: this.stateManager.currentSystem,
        planet: this.stateManager.currentPlanet,
        starbase: null,
      });
    }

    if (state === 'orbit') {
      return createAvailableActions({
        state,
        player: this.player,
        system: this.stateManager.currentSystem,
        planet: this.getSelectedOrbitBody(),
        starbase: null,
      });
    }

    const market = this.stateManager.currentStarbase ? this.getTradeDepotManifest(this.stateManager.currentStarbase.name) : [];
    return createAvailableActions({
      state,
      player: this.player,
      system: this.stateManager.currentSystem,
      planet: null,
      starbase: this.stateManager.currentStarbase,
      currentCargoTotal: this.cargoSystem.getTotalUnits(this.player.cargoHold),
      marketHasItems: market.length > 0,
    });
  }

  private getOrbitBodies(): Planet[] {
    const parent = this.stateManager.currentPlanet;
    if (!parent) return [];
    return [parent, ...parent.moons];
  }

  private getSelectedOrbitBody(): Planet {
    const bodies = this.getOrbitBodies();
    const parent = this.stateManager.currentPlanet;
    if (bodies.length === 0 || !parent) {
      throw new Error('No orbital body selected.');
    }
    this.orbitSelectedBodyIndex = clampIndex(this.orbitSelectedBodyIndex, bodies.length);
    return bodies[this.orbitSelectedBodyIndex];
  }

  private resetOrbitLandingCursor(): void {
    const selected = this.getSelectedOrbitBody();
    const mapSize = getPlanetMapSize(selected);
    this.orbitLandingX = Math.floor(mapSize / 2);
    this.orbitLandingY = Math.floor(mapSize / 2);
    this.orbitMode = 'overview';
    this.orbitAlert = '';
  }

  private createCurrentOrbitScreen(): OrbitScreenModel {
    const parentPlanet = this.stateManager.currentPlanet!;
    const selectedBody = this.getSelectedOrbitBody();
    if (!selectedBody.scanned) selectedBody.scan();
    return createOrbitScreenModel({
      parentPlanet,
      selectedBody,
      selectedIndex: this.orbitSelectedBodyIndex,
      mode: this.orbitMode,
      landingCursorX: this.orbitLandingX,
      landingCursorY: this.orbitLandingY,
      rotationPhase: this.orbitElapsedSeconds * 0.18,
      alert: this.orbitAlert || this.statusMessage,
    });
  }

  private createCurrentStarbaseScreen(): StarbaseScreenModel {
    const starbase = this.stateManager.currentStarbase!;
    const visibleRowCount = this.getStarbaseVisibleRowCount();
    const rows = this.getStarbaseRows(starbase, this.starbaseSectionId);
    const selectedIndex = clampIndex(this.getStarbaseSelection(), rows.length);
    const viewOffset = this.getStarbaseOffset();
    const meta = this.getStarbaseSectionMeta(starbase, this.starbaseSectionId);
    return createStarbaseScreenModel({
      starbase,
      player: this.player,
      sectionId: this.starbaseSectionId,
      selectedIndex,
      viewOffset,
      visibleRowCount,
      rows,
      columns: meta.columns,
      widths: meta.widths,
      title: meta.title,
      subtitle: meta.subtitle,
      alert: this.starbaseAlert || this.statusMessage,
    });
  }

  private getStarbaseVisibleRowCount(): number {
    const rows = Math.max(1, Math.floor(this.renderer.getCanvas().height / Math.max(1, this.renderer.getCharHeightPx())));
    return Math.max(6, Math.min(18, rows - 18));
  }

  private getStarbaseSelection(): number {
    return this.starbaseSelectionBySection[this.starbaseSectionId] ?? 0;
  }

  private getStarbaseOffset(): number {
    return this.starbaseOffsetBySection[this.starbaseSectionId] ?? 0;
  }

  private moveStarbaseSelection(delta: number, rowCount: number, visibleRows: number): void {
    const viewport = moveSelection(this.getStarbaseSelection(), delta, rowCount, visibleRows, this.getStarbaseOffset());
    this.starbaseSelectionBySection[this.starbaseSectionId] = viewport.selectedIndex;
    this.starbaseOffsetBySection[this.starbaseSectionId] = viewport.viewOffset;
    this.starbaseAlert = '';
  }

  private switchStarbaseSection(delta: number): void {
    const currentIndex = STARBASE_SECTIONS.findIndex((section) => section.id === this.starbaseSectionId);
    const nextIndex = (currentIndex + delta + STARBASE_SECTIONS.length) % STARBASE_SECTIONS.length;
    this.starbaseSectionId = STARBASE_SECTIONS[nextIndex].id;
    this.starbaseAlert = '';
  }

  private activateStarbaseSelection(starbase: Starbase, row: StarbaseTableRow | undefined): void {
    if (!row) {
      this.starbaseAlert = 'No item selected.';
      return;
    }
    const market = this.getTradeDepotManifest(starbase.name);
    if (this.starbaseSectionId === 'overview') {
      this.starbaseSectionId = (row.id as StarbaseSectionId) || 'buy';
      return;
    }
    if (this.starbaseSectionId === 'buy') {
      this.tradeSelectionIndex = Math.max(0, market.findIndex((item) => item.itemKey === row.id));
      this.starbaseAlert = this.buySelectedDepotItem(market);
      this.statusMessage = this.starbaseAlert;
      return;
    }
    if (this.starbaseSectionId === 'sell') {
      this.tradeSelectionIndex = Math.max(0, market.findIndex((item) => item.itemKey === row.id));
      this.starbaseAlert = this.sellSelectedDepotItem(market);
      this.statusMessage = this.starbaseAlert;
      return;
    }
    if (this.starbaseSectionId === 'services' && row.id === 'refuel') {
      this._handleRefuelRequest();
      this.starbaseAlert = this.statusMessage;
      return;
    }
    if (this.starbaseSectionId === 'missions') {
      this.activateMissionSelection(starbase, row);
      return;
    }
    this.starbaseAlert = row.detail || `${row.cells[0]} selected.`;
  }

  private activateMissionSelection(starbase: Starbase, row: StarbaseTableRow): void {
    const system = this.stateManager.currentSystem;
    if (!system) {
      this.starbaseAlert = 'Mission board unavailable: local system record missing.';
      return;
    }

    const mission = generateStarbaseMissions(starbase, system).find((candidate) => candidate.id === row.id);
    if (!mission) {
      this.starbaseAlert = row.detail || 'No contract selected.';
      return;
    }

    const status = getMissionStatus(mission, {
      acceptedMissionIds: this.acceptedMissionIds,
      completedMissionIds: this.completedMissionIds,
    });
    if (status === 'COMPLETE') {
      this.starbaseAlert = formatMissionDetail(mission, status);
      return;
    }
    if (status === 'ACTIVE') {
      this.starbaseAlert = formatMissionDetail(mission, status);
      return;
    }

    this.acceptedMissionIds.add(mission.id);
    this.activeMissions[mission.id] = mission;
    this.starbaseAlert = `Accepted: ${mission.title}. ${mission.objective.targetLabel}.`;
    this.statusMessage = this.starbaseAlert;
  }

  private getStarbaseSectionMeta(
    starbase: Starbase,
    sectionId: StarbaseSectionId
  ): { title: string; subtitle: string; columns: string[]; widths: number[] } {
    const baseSubtitle = `${starbase.name} | ${new Date(0).toISOString().slice(11, 16)} station time`;
    switch (sectionId) {
      case 'overview':
        return { title: 'Starbase Operations', subtitle: baseSubtitle, columns: ['SECTION', 'STATUS', 'SUMMARY'], widths: [16, 16, 48] };
      case 'cargo':
        return { title: 'Cargo Manifest', subtitle: 'All cargo currently aboard your vessel.', columns: ['ITEM', 'QTY', 'VALUE', 'CLASS'], widths: [26, 7, 9, 18] };
      case 'buy':
        return { title: 'Trade Depot - Buy', subtitle: 'Purchase selected depot stock with Enter.', columns: ['COMMODITY', 'STOCK', 'BUY CR', 'CLASS'], widths: [26, 7, 9, 20] };
      case 'sell':
        return { title: 'Trade Depot - Sell', subtitle: 'Sell selected cargo lots with Enter.', columns: ['CARGO', 'HELD', 'SELL CR', 'CLASS'], widths: [26, 7, 9, 20] };
      case 'services':
        return { title: 'Port Services', subtitle: 'Station services and ship logistics.', columns: ['SERVICE', 'COST', 'STATUS', 'NOTES'], widths: [22, 10, 14, 34] };
      case 'notices':
        return { title: 'Station Notices', subtitle: 'Local bulletins, advisories, and dockmaster traffic.', columns: ['DATE', 'PRIORITY', 'NOTICE'], widths: [10, 10, 58] };
      case 'missions':
        return { title: 'Mission Board', subtitle: 'Local contracts authorised by station offices.', columns: ['CONTRACT', 'PAY', 'RISK', 'STATUS', 'SUMMARY'], widths: [22, 9, 7, 10, 32] };
      case 'shipyard':
        return { title: 'Shipyard', subtitle: 'Refit estimates and upgrade placeholders.', columns: ['BAY', 'QUOTE', 'ETA', 'WORK ORDER'], widths: [18, 10, 8, 42] };
      case 'crew':
        return { title: 'Crew Roster', subtitle: 'Recruitment lounge and personnel records.', columns: ['NAME', 'ROLE', 'RATE', 'PROFILE'], widths: [18, 16, 8, 42] };
    }
  }

  private getStarbaseRows(starbase: Starbase, sectionId: StarbaseSectionId): StarbaseTableRow[] {
    const market = this.getTradeDepotManifest(starbase.name);
    switch (sectionId) {
      case 'overview':
        return STARBASE_SECTIONS.filter((section) => section.id !== 'overview').map((section) => ({
          id: section.id,
          cells: [section.label, this.getSectionStatus(section.id), this.getSectionSummary(section.id)],
          detail: `Open ${section.label}.`,
        }));
      case 'cargo':
        return this.getCargoRows();
      case 'buy':
        return market.map((item) => ({
          id: item.itemKey,
          cells: [item.name, String(item.units), String(item.buyPrice), item.category],
          detail: item.description,
        }));
      case 'sell':
        return market
          .filter((item) => (this.player.cargoHold.items[item.itemKey] || 0) > 0)
          .map((item) => ({
            id: item.itemKey,
            cells: [item.name, String(this.player.cargoHold.items[item.itemKey] || 0), String(item.sellPrice), item.category],
            detail: item.description,
          }));
      case 'services':
        return [
          { id: 'refuel', cells: ['Reactor tender refuel', `${(1 / CONFIG.FUEL_PER_CREDIT).toFixed(2)}/fuel`, 'Available', 'Top off fuel tanks from station stores.'] },
          { id: 'repair', cells: ['Hull inspection', 'TBD', 'Standby', 'Stub: repair and damage systems are not online.'] },
          { id: 'storage', cells: ['Bonded cargo vault', 'TBD', 'Offline', 'Stub: long-term storage contract interface.'] },
        ];
      case 'notices':
        if (!this.stateManager.currentSystem) {
          return [{ id: 'no-notices', cells: ['--', 'OFFLINE', 'Station notice cache unavailable.'], detail: 'No local system record is attached to this dock.', disabled: true }];
        }
        return generateStarbaseNotices(starbase, this.stateManager.currentSystem).map((notice) => ({
          id: notice.id,
          cells: [notice.date, notice.priority, notice.text],
          detail: notice.relatedMissionId ? `${notice.detail} Related contract is listed on the mission board.` : notice.detail,
        }));
      case 'missions':
        if (!this.stateManager.currentSystem) {
          return [{ id: 'no-missions', cells: ['Board unavailable', '0 Cr', '--', 'OFFLINE', 'No local system record.'], detail: 'Dock services cannot issue contracts without a system record.', disabled: true }];
        }
        return generateStarbaseMissions(starbase, this.stateManager.currentSystem).map((mission) => {
          const status = getMissionStatus(mission, {
            acceptedMissionIds: this.acceptedMissionIds,
            completedMissionIds: this.completedMissionIds,
          });
          return {
            id: mission.id,
            cells: [mission.title, `${mission.rewardCredits} Cr`, mission.risk, status, mission.summary],
            detail: formatMissionDetail(mission, status),
          };
        });
      case 'shipyard':
        return [
          { id: 's1', cells: ['Cargo rack tuning', '620 Cr', '2h', '+10 cargo capacity retrofit placeholder.'], detail: 'Stub: upgrade purchase not yet implemented.' },
          { id: 's2', cells: ['Fuel bladder relining', '780 Cr', '3h', '+75 fuel capacity retrofit placeholder.'], detail: 'Stub: upgrade purchase not yet implemented.' },
          { id: 's3', cells: ['Survey mast overhaul', '1,250 Cr', '5h', 'Improved scan reach placeholder.'], detail: 'Stub: scanner upgrade path.' },
        ];
      case 'crew':
        return [
          { id: 'c1', cells: ['Mara Venn', 'Navigator', '12%', 'Former long-haul route analyst; excellent with binary ephemerides.'], detail: 'Stub: crew hiring and bonuses pending.' },
          { id: 'c2', cells: ['Ilo Rusk', 'Engineer', '10%', 'Keeps old drives running with improvised thermal loops.'], detail: 'Stub: crew hiring and bonuses pending.' },
          { id: 'c3', cells: ['Sev Anik', 'Broker', '15%', 'Knows which manifests get opened and which get waved through.'], detail: 'Stub: crew hiring and bonuses pending.' },
        ];
    }
  }

  private getCargoRows(): StarbaseTableRow[] {
    const cargoEntries = Object.entries(this.player.cargoHold.items).filter(([, amount]) => amount > 0);
    if (cargoEntries.length === 0) {
      return [{ id: 'empty', cells: ['Cargo hold empty', '0', '0', 'N/A'], detail: 'Mine or buy cargo to fill the manifest.', disabled: true }];
    }
    return cargoEntries.map(([itemKey, amount]) => {
      const info = this.getTradeItemInfo(itemKey);
      const marketItem = this.stateManager.currentStarbase
        ? this.getTradeDepotManifest(this.stateManager.currentStarbase.name).find((item) => item.itemKey === itemKey)
        : null;
      const value = (marketItem?.sellPrice ?? info?.baseValue ?? 1) * amount;
      return {
        id: itemKey,
        cells: [info?.name ?? itemKey, String(amount), String(value), marketItem?.category ?? 'mineral'],
        detail: `Estimated lot value ${value} Cr.`,
      };
    });
  }

  private getSectionStatus(sectionId: StarbaseSectionId): string {
    if (sectionId === 'sell') return this.cargoSystem.getTotalUnits(this.player.cargoHold) > 0 ? 'Ready' : 'No cargo';
    if (sectionId === 'missions') {
      const active = Object.keys(this.activeMissions).filter((id) => !this.completedMissionIds.has(id)).length;
      return active > 0 ? `${active} Active` : 'Available';
    }
    if (sectionId === 'shipyard' || sectionId === 'crew') return 'Stub';
    return 'Online';
  }

  private getSectionSummary(sectionId: StarbaseSectionId): string {
    const summaries: Record<StarbaseSectionId, string> = {
      overview: 'Station summary',
      cargo: 'Review hold contents and estimated value.',
      buy: 'Buy station commodities.',
      sell: 'Sell cargo carried in your hold.',
      services: 'Refuel and future station services.',
      notices: 'Read local port bulletins.',
      missions: 'Accept local scan and charting contracts.',
      shipyard: 'Browse future upgrades and refits.',
      crew: 'Review recruitable crew stubs.',
    };
    return summaries[sectionId];
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

    const market = this.getTradeDepotManifest(this.stateManager.currentStarbase.name);
    const currentCargo = { ...this.player.cargoHold.items };
    const totalUnitsSold = this.cargoSystem.getTotalUnits(this.player.cargoHold);

    if (totalUnitsSold <= 0) {
      const purchaseMessage = this.buyNextDepotItem(market);
      this.statusMessage = purchaseMessage ?? this.formatTradeDepotManifest(market);
      this._publishStatusUpdate();
      return;
    }

    let totalCreditsEarned = 0;
    let soldItemsLog: string[] = [];
    for (const itemKey in currentCargo) {
      const amount = currentCargo[itemKey];
      const itemInfo = this.getTradeItemInfo(itemKey);
      if (amount > 0 && itemInfo) {
        const depotItem = market.find((item) => item.itemKey === itemKey);
        const valuePerUnit = depotItem?.sellPrice ?? Math.max(1, Math.floor(itemInfo.baseValue * CONFIG.TRADE_SELL_MARKDOWN));
        const creditsEarned = amount * valuePerUnit;
        totalCreditsEarned += creditsEarned;
        soldItemsLog.push(`${amount} ${itemInfo.name || itemKey}`);
      } else {
        logger.warn(`[Game:_handleTradeRequest] Skipping unknown or zero amount item in cargo: ${itemKey}`);
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

  private getTradeDepotManifest(starbaseName: string): TradeDepotItem[] {
    const depotKeys = [
      'WATER_ICE',
      'HYDROGEN_SLUSH',
      'HELIUM_3',
      'DEUTERIUM_PELLETS',
      'TITANIUM_TRUSS',
      'SILICON_WAFERS',
      'RARE_EARTH_MAGNETS',
      'CATALYST_MESH',
      'HYDROPONIC_CULTURES',
      'MEDICAL_ISOTOPES',
      'SURVEY_DRONES',
      'NAV_BEACONS',
      'VACUUM_COFFEE',
      'CAPTAINS_SOCKS',
    ].filter((key) => TRADE_COMMODITIES[key]);

    const hashOffset = Math.abs(fastHash(starbaseName.length, starbaseName.charCodeAt(0) || 0, this.gameSeedPRNG.seed));
    return depotKeys
      .filter((itemKey, index) => TRADE_COMMODITIES[itemKey].rarity > 0.1 || (hashOffset + index * 23) % 100 < 18)
      .map((itemKey, index) => {
      const commodity = TRADE_COMMODITIES[itemKey];
      const localVariance = 0.9 + ((hashOffset + index * 17) % 34) / 100;
      const units = Math.max(1, Math.floor((CONFIG.TRADE_DEPOT_STOCK_UNITS + ((hashOffset + index * 7) % 9)) * commodity.rarity));
      return {
        itemKey,
        name: commodity.name,
        description: commodity.description,
        category: commodity.category,
        units,
        buyPrice: Math.max(1, Math.ceil(commodity.baseValue * CONFIG.TRADE_BUY_MARKUP * localVariance)),
        sellPrice: Math.max(1, Math.floor(commodity.baseValue * CONFIG.TRADE_SELL_MARKDOWN * localVariance)),
      };
    });
  }

  private buyNextDepotItem(market: TradeDepotItem[]): string | null {
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    if (freeCargo <= 0) return 'Trade depot: cargo hold is full.';

    for (let attempts = 0; attempts < market.length; attempts++) {
      const item = market[this.tradeSelectionIndex % market.length];
      this.tradeSelectionIndex++;
      const unitsToBuy = Math.min(item.units, freeCargo);
      const totalCost = unitsToBuy * item.buyPrice;
      if (unitsToBuy > 0 && this.player.resources.credits >= totalCost) {
        const added = this.cargoSystem.addItem(this.player.cargoHold, item.itemKey, unitsToBuy);
        this.player.resources.credits -= added * item.buyPrice;
        eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, { elementKey: item.itemKey, amount: added });
        eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
          newCredits: this.player.resources.credits,
          amountChanged: -added * item.buyPrice,
        });
        return `Purchased ${added} ${item.name} for ${added * item.buyPrice} Cr.`;
      }
    }

    return this.formatTradeDepotManifest(market);
  }

  private formatTradeDepotManifest(market: TradeDepotItem[]): string {
    const offers = market
      .slice(0, 6)
      .map((item) => `${item.name} ${item.buyPrice}Cr`)
      .join(', ');
    return `Trade depot offers: ${offers}. Need cargo space and credits to buy.`;
  }

  private buySelectedDepotItem(market: TradeDepotItem[]): string {
    const item = market[this.tradeSelectionIndex % market.length];
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    if (freeCargo <= 0) return 'Trade depot: cargo hold is full.';

    const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
    const unitsToBuy = Math.min(item.units, freeCargo, affordableUnits);
    if (unitsToBuy <= 0) return `Insufficient credits for ${item.name}.`;

    const added = this.cargoSystem.addItem(this.player.cargoHold, item.itemKey, unitsToBuy);
    const cost = added * item.buyPrice;
    this.player.resources.credits -= cost;
    eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, { elementKey: item.itemKey, amount: added });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: -cost,
    });
    return `Bought ${added} ${item.name} for ${cost} Cr.`;
  }

  private sellSelectedDepotItem(market: TradeDepotItem[]): string {
    const item = market[this.tradeSelectionIndex % market.length];
    const amount = this.player.cargoHold.items[item.itemKey] || 0;
    if (amount <= 0) return `No ${item.name} in cargo.`;

    const creditsEarned = amount * item.sellPrice;
    this.cargoSystem.removeItemType(this.player.cargoHold, item.itemKey);
    this.player.resources.credits += creditsEarned;
    eventManager.publish(GameEvents.PLAYER_CARGO_SOLD, {
      itemsSold: { [item.itemKey]: amount },
      creditsEarned,
      newCredits: this.player.resources.credits,
    });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: creditsEarned,
    });
    return `Sold ${amount} ${item.name} for ${creditsEarned} Cr.`;
  }

  private formatSelectedTradeLine(market: TradeDepotItem[]): string {
    const item = market[this.tradeSelectionIndex % market.length];
    const held = this.player.cargoHold.items[item.itemKey] || 0;
    return `Selected ${item.name}: buy ${item.buyPrice} Cr, sell ${item.sellPrice} Cr, stock ${item.units}, hold ${held}.`;
  }

  private getTradeItemInfo(itemKey: string): { name: string; baseValue: number } | null {
    const commodity = TRADE_COMMODITIES[itemKey];
    if (commodity) return { name: commodity.name, baseValue: commodity.baseValue };
    const element = ELEMENTS[itemKey];
    if (element) return { name: element.name, baseValue: element.baseValue };
    return null;
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
