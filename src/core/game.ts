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
import { commandButton, CommandBarButton, CommandBarModel } from './command_bar';
import {
  createStarbaseScreenModel,
  StarbaseScreenModel,
  StarbaseSectionId,
  StarbaseTableRow,
  STARBASE_SECTIONS,
} from './starbase_ui';
import { clampIndex, moveSelection, TextModalTableModel, TextTableRow } from './text_ui';
import {
  adjustQuantitySelector,
  createQuantitySelector,
  createQuantitySelectorModel,
  QuantitySelectorState,
  setQuantitySelectorValue,
} from './quantity_selector';
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
import {
  CREW_SKILL_LABELS,
  CREW_SKILLS,
  CrewMember,
  CrewSkill,
  formatTopSkills,
  generateRecruitCandidates,
  getBestCrewSkill,
  getCrewSkillTotal,
  getNextLevelExperience,
  trainCrewSkill,
} from './crew';
import { createShipDeckRows, createShipStationRows, getShipCompartment } from './ship_place';
import {
  CARGO_POD_COST,
  createShipyardUpgradeOptions,
  getShipDamageSummary,
  getShipCargoCapacity,
  getShipDerivedStats,
  getShipRepairCost,
  getStarbaseShipyardProfile,
  installShipyardUpgrade,
  NUCLEAR_MISSILE_COST,
} from './ship_modifications';
import { formatDistanceAu, formatHyperspaceSpan, formatLightTimeFromMeters } from '../utils/space_scale';
import { HyperspaceSurveyService, HyperspaceSurveyContact } from './hyperspace_survey';

// ScanTarget type includes SolarSystem now
type ScanTarget = Planet | Starbase | StellarBody | SolarSystem;
type NavigationTarget = Planet | Starbase | StellarBody;
type TravelObserveCursor = { mode: 'hyperspace' | 'system'; dx: number; dy: number };
type CargoAddResult = { added: number; addedItems: Record<string, number> };
type ShipMenuSection = 'main' | 'deck' | 'stations' | 'cargo' | 'crew' | 'status' | 'log' | 'rover' | 'jettison';
type RoverActionId = 'map' | 'move' | 'cargo' | 'pickup' | 'mine' | 'scan' | 'stun' | 'shoot' | 'embark' | 'icon';
type QuantityOperation =
  | { type: 'buy'; itemKey: string }
  | { type: 'sell'; itemKey: string }
  | { type: 'jettison'; itemKey: string }
  | { type: 'mine' };

interface JettisonConfirmationState {
  itemKey: string;
  amount: number;
  selectedIndex: number;
}

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

interface SurfaceVehicleMenuItem {
  id: RoverActionId;
  label: string;
  status: string;
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
  private travelCommandMoving: boolean = true;
  private travelCommandSelection: number = 0;
  private travelObserveCursor: TravelObserveCursor | null = null;
  private targetMenuOpen: boolean = false;
  private targetMenuSelection: number = 0;
  private targetMenuOffset: number = 0;
  private shipMenuOpen: boolean = false;
  private shipMenuSection: ShipMenuSection = 'main';
  private shipMenuSelection: number = 0;
  private shipMenuOffset: number = 0;
  private shipMenuSelectionBySection: Partial<Record<ShipMenuSection, number>> = {};
  private shipMenuOffsetBySection: Partial<Record<ShipMenuSection, number>> = {};
  private shipMenuJettisonItemKey: string | null = null;
  private currentShipCompartmentId: string = 'bridge';
  private quantitySelector: QuantitySelectorState<QuantityOperation> | null = null;
  private jettisonConfirmation: JettisonConfirmationState | null = null;
  private roverMenuSelection: number = 0;
  private roverCargoOpen: boolean = false;
  private roverCargoSelection: number = 0;
  private roverCargoOffset: number = 0;
  private surfaceMapExpanded: boolean = false;
  private surfaceLegendOpen: boolean = false;
  private surfaceLegendSelection: number = 0;
  private surfaceLegendOffset: number = 0;
  private surfaceScanCursor: { dx: number; dy: number } | null = null;
  private surfaceNotifications: string[] = [];
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
    this.player = new Player(CONFIG.PLAYER_START_X, CONFIG.PLAYER_START_Y, CONFIG.PLAYER_CHAR, initialSeed);
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
    eventManager.subscribe(GameEvents.COMMAND_BAR_ACTION_SELECTED, this._handleCommandBarAction.bind(this));

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
    this.travelObserveCursor = null;
    if (newState === 'hyperspace' || newState === 'system') {
      this.travelCommandMoving = true;
      this.travelCommandSelection = 0;
    }
    this.targetMenuOpen = false;
    this.shipMenuOpen = false;
    this.roverCargoOpen = false;
    this.surfaceMapExpanded = false;
    this.surfaceLegendOpen = false;
    this.surfaceScanCursor = null;
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
    if (newState !== 'planet') {
      this.surfaceNotifications = [];
    }
    // Close popups on state change
    if (this.popupState !== 'inactive') {
      this.popupState = 'inactive';
      this.popupContent = null;
      logger.debug('[Game] Closing active popup due to game state change.');
    }
    this.targetMenuOpen = false;
    this.shipMenuOpen = false;
    this.roverCargoOpen = false;
    if (newState === 'planet') {
      this.openSurfaceLandingOperationsMenu();
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

  private _handleCommandBarAction(data?: { id?: string; action?: string }): void {
    if (!data?.action) return;
    if (this.popupState !== 'inactive' || this.targetMenuOpen || this.shipMenuOpen || this.roverCargoOpen || this.surfaceLegendOpen || this.quantitySelector || this.jettisonConfirmation) {
      this.statusMessage = 'Command bar unavailable while another interface is active.';
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }

    this.executeCommandBarAction(data.action);
    this.forceFullRender = true;
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
      this.departStarbase();
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

  private departStarbase(): void {
    if (this.stateManager.state !== 'starbase') return;
    const departed = this.stateManager.liftOff();
    if (departed) {
      this.starbaseAlert = '';
      this.statusMessage = this.stateManager.statusMessage || 'Departed starbase.';
      this.stateManager.statusMessage = '';
    }
    this.forceFullRender = true;
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

  private _handleTargetMenuInput(): boolean {
    if (!this.targetMenuOpen) return false;

    const targets = this.getTargetMenuTargets();
    const visibleRows = this.getTargetMenuVisibleRows();
    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') ||
      this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
      this.inputManager.wasActionJustPressed('MOVE_RIGHT')
    ) {
      this.closeTargetMenu('Target selection cancelled.');
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      const viewport = moveSelection(this.targetMenuSelection, -1, targets.length, visibleRows, this.targetMenuOffset);
      this.targetMenuSelection = viewport.selectedIndex;
      this.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(this.targetMenuSelection, 1, targets.length, visibleRows, this.targetMenuOffset);
      this.targetMenuSelection = viewport.selectedIndex;
      this.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(this.targetMenuSelection, -visibleRows, targets.length, visibleRows, this.targetMenuOffset);
      this.targetMenuSelection = viewport.selectedIndex;
      this.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(this.targetMenuSelection, visibleRows, targets.length, visibleRows, this.targetMenuOffset);
      this.targetMenuSelection = viewport.selectedIndex;
      this.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM')) {
      const selected = targets[this.targetMenuSelection];
      if (!selected) {
        this.closeTargetMenu('No target selected.');
        return true;
      }
      this.selectNavigationTarget(selected, true);
      this.targetMenuOpen = false;
      this.forceFullRender = true;
      return true;
    }

    return true;
  }

  private _handleRoverCargoInput(): boolean {
    if (!this.roverCargoOpen) return false;
    const rows = this.getRoverCargoRows();
    const visibleRows = 8;
    if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') || this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.roverCargoOpen = false;
      this.statusMessage = 'Terrain vehicle cargo closed.';
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      const viewport = moveSelection(this.roverCargoSelection, -1, rows.length, visibleRows, this.roverCargoOffset);
      this.roverCargoSelection = viewport.selectedIndex;
      this.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(this.roverCargoSelection, 1, rows.length, visibleRows, this.roverCargoOffset);
      this.roverCargoSelection = viewport.selectedIndex;
      this.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(this.roverCargoSelection, -visibleRows, rows.length, visibleRows, this.roverCargoOffset);
      this.roverCargoSelection = viewport.selectedIndex;
      this.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(this.roverCargoSelection, visibleRows, rows.length, visibleRows, this.roverCargoOffset);
      this.roverCargoSelection = viewport.selectedIndex;
      this.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      this.dropSelectedRoverCargo(rows[this.roverCargoSelection]);
      return true;
    }
    return true;
  }

  private _handleSurfaceLegendInput(): boolean {
    if (!this.surfaceLegendOpen) return false;
    const rows = this.getSurfaceLegendRows();
    const visibleRows = this.getSurfaceLegendVisibleRows();
    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') ||
      this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
      this.inputManager.wasActionJustPressed('MOVE_RIGHT')
    ) {
      this.surfaceLegendOpen = false;
      this.statusMessage = 'Surface icon legend closed.';
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      const viewport = moveSelection(this.surfaceLegendSelection, -1, rows.length, visibleRows, this.surfaceLegendOffset);
      this.surfaceLegendSelection = viewport.selectedIndex;
      this.surfaceLegendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(this.surfaceLegendSelection, 1, rows.length, visibleRows, this.surfaceLegendOffset);
      this.surfaceLegendSelection = viewport.selectedIndex;
      this.surfaceLegendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(this.surfaceLegendSelection, -visibleRows, rows.length, visibleRows, this.surfaceLegendOffset);
      this.surfaceLegendSelection = viewport.selectedIndex;
      this.surfaceLegendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(this.surfaceLegendSelection, visibleRows, rows.length, visibleRows, this.surfaceLegendOffset);
      this.surfaceLegendSelection = viewport.selectedIndex;
      this.surfaceLegendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    return true;
  }

  private _handleShipMenuInput(): boolean {
    if (!this.shipMenuOpen) return false;

    const rows = this.getShipMenuRows();
    const visibleRows = this.getShipMenuVisibleRows();
    if (this.inputManager.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF') && this.stateManager.state === 'planet') {
      this.launchFromParkedShip();
      return true;
    }
    if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
      const inMainSection = this.shipMenuSection === 'main';
      if (inMainSection) {
        this.closeShipMenu('Ship menu closed.');
      } else {
        this.openShipMenuSection('main');
      }
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      if (this.shipMenuSection === 'main') this.closeShipMenu('Ship menu closed.');
      else this.openShipMenuSection('main');
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT') && this.shipMenuSection === 'main') {
      this.activateShipMenuSelection(rows[this.shipMenuSelection]);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.moveShipMenuSelection(-1, rows.length, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.moveShipMenuSelection(1, rows.length, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      this.moveShipMenuSelection(-visibleRows, rows.length, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      this.moveShipMenuSelection(visibleRows, rows.length, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      this.activateShipMenuSelection(rows[this.shipMenuSelection]);
      return true;
    }

    return true;
  }

  private _handleSurfaceVehicleInput(): boolean {
    if (this.stateManager.state !== 'planet' || (!this.player.terrainVehicle.deployed && !this.player.terrainVehicle.onFoot)) return false;

    if (this.surfaceMapExpanded) {
      if (
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
        this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
        this.inputManager.wasActionJustPressed('QUIT') ||
        this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
      ) {
        this.surfaceMapExpanded = false;
        this.statusMessage = 'Surface map closed.';
        this.forceFullRender = true;
      }
      return true;
    }

    if (this.surfaceScanCursor) {
      const bounds = this.getSurfaceScanCursorBounds();
      if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
        this.surfaceScanCursor.dy = Math.max(-bounds.y, this.surfaceScanCursor.dy - 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
        this.surfaceScanCursor.dy = Math.min(bounds.y, this.surfaceScanCursor.dy + 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
        this.surfaceScanCursor.dx = Math.max(-bounds.x, this.surfaceScanCursor.dx - 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
        this.surfaceScanCursor.dx = Math.min(bounds.x, this.surfaceScanCursor.dx + 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
        this.surfaceScanCursor = null;
        this.addSurfaceNotification('Surface scan cursor cancelled.');
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
        this.confirmSurfaceCursorScan();
        return true;
      }
      return true;
    }

    const rover = this.player.terrainVehicle;
    if (rover.onFoot) return false;
    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      if (rover.moving) {
        rover.moving = false;
        this.roverMenuSelection = this.getDefaultSurfaceVehicleMenuSelection();
        this.statusMessage = 'Terrain vehicle stopped.';
      } else {
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems()[this.roverMenuSelection]);
      }
      this.forceFullRender = true;
      return true;
    }

    if (rover.moving) return false;

    const items = this.getSurfaceVehicleMenuItems();
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.roverMenuSelection = (this.roverMenuSelection - 1 + items.length) % items.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.roverMenuSelection = (this.roverMenuSelection + 1) % items.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.roverMenuSelection = Math.max(0, this.roverMenuSelection - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.roverMenuSelection = Math.min(items.length - 1, this.roverMenuSelection + 1);
      this.forceFullRender = true;
      return true;
    }

    return false;
  }

  private _handleTravelCommandInput(): boolean {
    const state = this.stateManager.state;
    if (state !== 'hyperspace' && state !== 'system') return false;

    if (this.travelCommandMoving) {
      if (
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
        this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
        this.inputManager.wasActionJustPressed('QUIT')
      ) {
        this.travelCommandMoving = false;
        this.travelCommandSelection = this.getDefaultTravelCommandIndex();
        this.statusMessage = `${state === 'hyperspace' ? 'Interstellar' : 'Planetary'} movement paused. Arrows select commands.`;
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('CYCLE_TARGET')) {
        this.activateRecommendedTravelCommand();
        return true;
      }
      return false;
    }

    const commands = this.getSelectableTravelCommandButtons();
    this.travelCommandSelection = clampIndex(this.travelCommandSelection, commands.length);
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.travelCommandSelection = Math.max(0, this.travelCommandSelection - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.travelCommandSelection = Math.min(commands.length - 1, this.travelCommandSelection + 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.travelCommandSelection = (this.travelCommandSelection - 1 + commands.length) % commands.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.travelCommandSelection = (this.travelCommandSelection + 1) % commands.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('QUIT')) {
      this.travelCommandMoving = true;
      this.statusMessage = `${state === 'hyperspace' ? 'Interstellar' : 'Planetary'} movement engaged.`;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('CYCLE_TARGET')) {
      this.activateRecommendedTravelCommand();
      return true;
    }
    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      const selected = commands[this.travelCommandSelection];
      if (selected) this.executeCommandBarAction(selected.action);
      return true;
    }
    return true;
  }

  private _handleTravelObserveCursorInput(): boolean {
    if (!this.travelObserveCursor) return false;
    const state = this.stateManager.state;
    if (state !== this.travelObserveCursor.mode) {
      this.travelObserveCursor = null;
      return false;
    }

    const bounds = this.getTravelObserveCursorBounds();
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.travelObserveCursor.dy = Math.max(-bounds.y, this.travelObserveCursor.dy - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.travelObserveCursor.dy = Math.min(bounds.y, this.travelObserveCursor.dy + 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.travelObserveCursor.dx = Math.max(-bounds.x, this.travelObserveCursor.dx - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.travelObserveCursor.dx = Math.min(bounds.x, this.travelObserveCursor.dx + 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
      this.travelObserveCursor = null;
      this.statusMessage = 'Observation reticle cancelled.';
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      this.confirmTravelObserveCursor();
      return true;
    }
    return true;
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
      'TARGET_MENU',
      'SHIP_MENU',
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
        if (action === 'TARGET_MENU') {
          this.openTargetMenu();
          return true;
        }
        if (action === 'SHIP_MENU') {
          this.openShipMenu();
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
        if (action === 'SCAN_SYSTEM_OBJECT' && this.scanLocalOrSelectedSystemTargetIfAvailable()) {
          return true;
        }
        if (action === 'MINE') {
          this.openMiningQuantitySelector();
          return true;
        }
        if (action === 'QUIT') {
          this.statusMessage = 'Nothing to cancel.';
          return true;
        }
        if (action === 'ACTIVATE_LAND_LIFTOFF' && currentState === 'planet') {
          this.launchFromParkedShip();
          return true;
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

  private executeCommandBarAction(action: string): void {
    switch (action) {
      case 'TRAVEL_MOVE':
        this.travelCommandMoving = true;
        this.statusMessage = `${this.stateManager.state === 'hyperspace' ? 'Interstellar' : 'Planetary'} movement engaged.`;
        return;
      case 'OPEN_SHIP_MENU':
        this.openShipMenu();
        return;
      case 'TARGET_MENU':
        this.openTargetMenu();
        return;
      case 'OBSERVE_HYPERSPACE':
        this.startTravelObserveCursor('hyperspace');
        return;
      case 'OBSERVE_SYSTEM_TARGET':
        this.startTravelObserveCursor('system');
        return;
      case 'ROVER_MAP':
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems().find((item) => item.id === 'map'));
        return;
      case 'ROVER_CARGO':
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems().find((item) => item.id === 'cargo'));
        return;
      case 'ROVER_MOVE':
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems().find((item) => item.id === 'move'));
        return;
      case 'ROVER_SCAN':
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems().find((item) => item.id === 'scan'));
        return;
      case 'ROVER_MINE':
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems().find((item) => item.id === 'mine'));
        return;
      case 'ROVER_ICON':
        this.activateSurfaceVehicleAction(this.getSurfaceVehicleMenuItems().find((item) => item.id === 'icon'));
        return;
      case 'ROVER_EMBARK':
        this.dockTerrainVehicle();
        return;
      case 'RED_RESERVED':
        this.statusMessage = 'No emergency command is armed.';
        return;
      default:
        this._executeActionByName(action);
    }
  }

  private scanLocalOrSelectedSystemTargetIfAvailable(): boolean {
    if (this.stateManager.state !== 'system') return false;
    const localTarget = this.getLocalSystemScanTarget();
    if (localTarget) {
      this.terminalOverlay.clear();
      this._dumpScanToTerminal(localTarget);
      this.statusMessage = '';
      this.forceFullRender = true;
      return true;
    }

    const selectedTarget = this.getSelectedTarget();
    if (!selectedTarget) return false;
    if (!this.isTargetWithinScanRange(selectedTarget)) return false;
    this.terminalOverlay.clear();
    this._dumpScanToTerminal(this.getScannableNavigationTarget(selectedTarget));
    this.statusMessage = '';
    this.forceFullRender = true;
    return true;
  }

  private _executeActionByName(actionName: string): void {
    if (actionName === 'ACTIVATE_LAND_LIFTOFF' && this.stateManager.state === 'planet') {
      this.launchFromParkedShip();
      return;
    }
    if (actionName === 'MINE') {
      this.openMiningQuantitySelector();
      return;
    }
    if (actionName === 'SCAN_SYSTEM_OBJECT') {
      if (this.scanLocalOrSelectedSystemTargetIfAvailable()) {
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
      'target-menu',
      'ship-menu',
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
    this.selectNavigationTarget(targets[this.currentTargetIndex], false);
  }

  private openTargetMenu(): void {
    if (this.stateManager.state !== 'system') {
      this.statusMessage = 'Navigation target menu is only available in system view.';
      return;
    }
    const targets = this.getTargetMenuTargets();
    if (targets.length === 0) {
      this.statusMessage = 'No stellar or planetary targets available.';
      return;
    }
    const selected = this.getSelectedTarget();
    const selectedSignature = selected ? this.getTargetSignature(selected) : '';
    const selectedIndex = targets.findIndex((target) => this.getTargetSignature(target) === selectedSignature);
    const visibleRows = this.getTargetMenuVisibleRows();
    const viewport = moveSelection(selectedIndex >= 0 ? selectedIndex : 0, 0, targets.length, visibleRows, this.targetMenuOffset);
    this.targetMenuSelection = viewport.selectedIndex;
    this.targetMenuOffset = viewport.viewOffset;
    this.targetMenuOpen = true;
    this.forceFullRender = true;
    this.statusMessage = 'Select navigation target.';
  }

  private closeTargetMenu(message: string = ''): void {
    this.targetMenuOpen = false;
    this.forceFullRender = true;
    this.statusMessage = message;
  }

  private selectNavigationTarget(target: NavigationTarget, startApproach: boolean): void {
    const targets = this.getNavigationTargets();
    const signature = this.getTargetSignature(target);
    const index = targets.findIndex((candidate) => this.getTargetSignature(candidate) === signature);
    this.currentTargetIndex = index >= 0 ? index : 0;
    this.currentTargetSignature = signature;
    this.approachTargetSignature = startApproach ? signature : null;
    if (startApproach) {
      this.player.awardCrewExperience('navigation', 4);
      this.player.awardCrewExperience('piloting', 2);
    }
    this.statusMessage = startApproach
      ? `Approach assist engaged: ${this.getTargetName(target)}.`
      : `Target selected: ${this.getTargetName(target)}.`;
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
    this.player.awardCrewExperience('navigation', 4);
    this.player.awardCrewExperience('piloting', 2);
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
    const planetStepMode = this.stateManager.state === 'planet';
    const isMovePressed = (action: string) => planetStepMode
      ? this.inputManager.wasActionJustPressed(action)
      : this.inputManager.isActionActive(action);
    if (isMovePressed('MOVE_UP')) dy -= 1;
    if (isMovePressed('MOVE_DOWN')) dy += 1;
    if (isMovePressed('MOVE_LEFT')) dx -= 1;
    if (isMovePressed('MOVE_RIGHT')) dx += 1;
    if (this.stateManager.state === 'hyperspace') {
      if (this.inputManager.isActionActive('MOVE_UP_LEFT')) {
        dx -= 1;
        dy -= 1;
      }
      if (this.inputManager.isActionActive('MOVE_UP_RIGHT')) {
        dx += 1;
        dy -= 1;
      }
      if (this.inputManager.isActionActive('MOVE_DOWN_LEFT')) {
        dx -= 1;
        dy += 1;
      }
      if (this.inputManager.isActionActive('MOVE_DOWN_RIGHT')) {
        dx += 1;
        dy += 1;
      }
    }

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
      if ((currentState === 'hyperspace' || currentState === 'system') && !this.travelCommandMoving) {
        return;
      }
      if (currentState === 'planet' && (this.surfaceMapExpanded || this.surfaceLegendOpen)) {
        return;
      }

      // Calculate Speed Multiplier based on Zoom
      let speedMultiplier = 1.0;
      if (currentState === 'system') {
        speedMultiplier = this.getSystemCursorMoveSpeedMultiplier();
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
          if (!this.player.terrainVehicle.deployed && !this.player.terrainVehicle.onFoot) {
            this.statusMessage = 'Disembark the terrain vehicle from ship operations before travelling overland.';
            return;
          }
          if (this.player.terrainVehicle.deployed && !this.player.terrainVehicle.moving) {
            return;
          }
          if (planet) {
            try {
              planet.ensureSurfaceReady(); // Ensure map exists for size
              const mapSize = planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
              if (this.player.terrainVehicle.deployed && !this.consumeTerrainVehicleFuelForMove(planet)) {
                return;
              }
              if (this.player.terrainVehicle.onFoot) this.applyFootTravelRisk();
              moveData.surfaceContext = { mapSize };
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
    if (this._handleJettisonConfirmationInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleQuantitySelectorInput()) {
      this._publishStatusUpdate();
      return;
    }
    // 1. Check Popups (blocks other input if active or animating)
    if (this._handlePopupInput()) {
      return; // Input consumed by popup
    }
    if (this._handleShipMenuInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleRoverCargoInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleSurfaceLegendInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleTargetMenuInput()) {
      this._publishStatusUpdate();
      return;
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
    if (this._handleSurfaceVehicleInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleTravelObserveCursorInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleTravelCommandInput()) {
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

  private getSystemCursorMoveSpeedMultiplier(): number {
    const defaultZoomIndex = 3; // Index of 1x zoom (adjust if default changes)
    const zoomDifference = this.currentZoomLevelIndex - defaultZoomIndex;
    return Math.max(0.01, Math.min(Math.pow(0.5, zoomDifference), 10.0));
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
          targetToScan = this.getLocalSystemScanTarget();
          if (!targetToScan) scanStatusMessage = STATUS_MESSAGES.SYSTEM_SCAN_FAIL_NO_TARGET;
        }
      } else {
        scanStatusMessage = `<e>Cannot perform system scan in ${currentState} state.</e>`;
      }
    } else if (scanType === 'planet_surface') {
      if (currentState === 'planet') {
        this.startSurfaceCursorScan();
        return;
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
          this.player.awardCrewExperience(target instanceof Planet ? 'geology' : 'astroscience', target instanceof Planet ? 8 : 10);
          this.player.awardCrewExperience('communication', 3);
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

  private startTravelObserveCursor(mode: 'hyperspace' | 'system'): void {
    const cursor: TravelObserveCursor = { mode, dx: 0, dy: 0 };
    if (mode === 'system') {
      const selected = this.getSelectedTarget();
      if (selected) {
        const view = this.getSystemTargetViewPosition(selected);
        if (view) {
          const center = this.getTravelViewCenter();
          cursor.dx = Math.max(-center.x, Math.min(center.x, view.x - center.x));
          cursor.dy = Math.max(-center.y, Math.min(center.y, view.y - center.y));
        }
      }
    } else {
      const contact = this.toNavigationContact(this.getCurrentHyperspaceSurvey().nearestSystemContact);
      if (contact) {
        const bounds = this.getTravelObserveCursorBounds();
        cursor.dx = Math.max(-bounds.x, Math.min(bounds.x, contact.dx));
        cursor.dy = Math.max(-bounds.y, Math.min(bounds.y, contact.dy));
      }
    }
    this.travelObserveCursor = cursor;
    this.travelCommandMoving = false;
    this.statusMessage = `${mode === 'hyperspace' ? 'Interstellar' : 'Planetary'} observation reticle active. Arrows aim; Enter scans; Esc cancels.`;
    this.forceFullRender = true;
  }

  private getTravelViewCenter(): { x: number; y: number } {
    return {
      x: Math.floor(this.renderer.getGridCols() / 2),
      y: Math.floor(this.renderer.getGridRows() / 2),
    };
  }

  private getTravelObserveCursorBounds(): { x: number; y: number } {
    const center = this.getTravelViewCenter();
    return {
      x: Math.max(0, center.x - 1),
      y: Math.max(0, center.y - 1),
    };
  }

  private confirmTravelObserveCursor(): void {
    const cursor = this.travelObserveCursor;
    if (!cursor) return;
    this.terminalOverlay.clear();
    if (cursor.mode === 'hyperspace') {
      this.scanHyperspaceObserveCursor(cursor);
    } else {
      this.scanSystemObserveCursor(cursor);
    }
    this.travelObserveCursor = null;
    this.forceFullRender = true;
  }

  private scanHyperspaceObserveCursor(cursor: TravelObserveCursor): void {
    const worldX = this.player.position.worldX + cursor.dx;
    const worldY = this.player.position.worldY + cursor.dy;
    const props = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
    const phenomenon = props.exists ? null : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
    const isNavigable = props.exists || Boolean(phenomenon?.exists && phenomenon.type === 'rogue-planet');
    if (!isNavigable) {
      this.terminalOverlay.addMessageLines([
        '<h>LONG-RANGE OBSERVATION</h>',
        'Reticle return: no stable stellar or planetary-mass body at this bearing.',
        `Grid: <hl>${worldX},${worldY}</hl>`,
      ]);
      this.statusMessage = 'Observation reticle found empty deep space.';
      return;
    }
    const target = this.stateManager.peekAtSystem(worldX, worldY);
    if (!target) {
      this.terminalOverlay.addMessageLines([
        '<h>LONG-RANGE OBSERVATION</h>',
        'Contact geometry is unstable; no navigational record could be resolved.',
      ]);
      this.statusMessage = 'Observation contact unresolved.';
      return;
    }
    const quality = this.getInterstellarObservationQuality(cursor, props.starType, props.objectKind);
    const lines = this.formatInterstellarObserveReport(target, worldX, worldY, quality, props.starType, props.objectKind);
    this.terminalOverlay.addMessageLines(lines);
    this.player.awardCrewExperience('astroscience', quality.confidence >= 60 ? 6 : 3);
    this.player.awardCrewExperience('communication', 2);
    if (quality.confidence >= 70) this.completeMissionsForScan(target);
    this.statusMessage = `Observed ${quality.label}.`;
  }

  private getInterstellarObservationQuality(
    cursor: TravelObserveCursor,
    starType: string | null,
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | null
  ): { confidence: number; rangeCells: number; label: string; signature: string; rangeLabel: string } {
    const rangeCells = Math.hypot(cursor.dx, cursor.dy);
    const starInfo = starType ? SPECTRAL_TYPES[starType] : null;
    const solarRadius = SPECTRAL_TYPES.G.radius || 1;
    const brightnessSignal = Math.sqrt(Math.max(0.02, starInfo?.brightness ?? (objectKind === 'rogue-planet' ? 0.025 : 0.12)));
    const radiusSignal = Math.sqrt(Math.max(0.05, (starInfo?.radius ?? solarRadius * 0.08) / solarRadius));
    const sourceStrength = objectKind === 'rogue-planet'
      ? 0.18
      : Math.max(0.12, Math.min(1.35, brightnessSignal * 0.66 + radiusSignal * 0.34));
    const confidence = Math.max(8, Math.min(98, Math.round((104 - rangeCells * 2.55) * sourceStrength)));
    const label = confidence >= 72
      ? 'resolved interstellar contact'
      : confidence >= 48
        ? 'probable stellar contact'
        : confidence >= 26
          ? objectKind === 'brown-dwarf' ? 'possible substellar source' : 'faint point-source'
          : 'weak unresolved return';
    const signature = confidence >= 72
      ? 'stable'
      : confidence >= 48
        ? 'usable but incomplete'
        : confidence >= 26
          ? 'noisy'
          : 'near background';
    const rangeLabel = confidence >= 60
      ? `${rangeCells.toFixed(1)} cells / ${formatHyperspaceSpan(rangeCells)}`
      : confidence >= 32
        ? `about ${Math.max(1, Math.round(rangeCells))} cells`
        : 'poorly constrained';
    return { confidence, rangeCells, label, signature, rangeLabel };
  }

  private formatInterstellarObserveReport(
    target: SolarSystem,
    worldX: number,
    worldY: number,
    quality: { confidence: number; rangeCells: number; label: string; signature: string; rangeLabel: string },
    starType: string | null,
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | null
  ): string[] {
    const classLabel = objectKind === 'rogue-planet'
      ? 'planetary-mass object'
      : objectKind === 'brown-dwarf'
        ? 'substellar infrared source'
        : 'stellar source';
    const identity = quality.confidence >= 72
      ? `${target.name} ${starType ?? target.starType}`
      : quality.confidence >= 48
        ? `${starType ? `${starType.slice(0, 1)}-class ` : ''}${classLabel}`
        : quality.label;
    const facilityTrace = quality.confidence >= 72 && target.starbase ? 'confirmed' : quality.confidence >= 50 && target.starbase ? 'possible' : 'none';
    const lines = [
      '<h>LONG-RANGE OBSERVATION</h>',
      `RETICLE: <hl>${identity}</hl>`,
      `GRID: <hl>${worldX},${worldY}</hl>  RANGE: <hl>${quality.rangeLabel}</hl>`,
      `CONFIDENCE: <hl>${quality.confidence}%</hl>  SIGNATURE: <hl>${quality.signature}</hl>`,
      `FACILITY TRACE: <hl>${facilityTrace}</hl>`,
    ];
    if (quality.confidence < 32) {
      lines.push('Return is barely above background; classification and distance are not reliable.');
    } else if (quality.confidence < 60) {
      lines.push('Small angular size and low flux smear the contact. Approach for a firmer classification.');
    } else if (quality.confidence < 78) {
      lines.push('Major class is plausible, but fine stellar data remains uncertain at this range.');
    } else {
      lines.push('Contact is stable enough for confident navigation, though full astrophysical detail requires system entry.');
    }
    return lines;
  }

  private scanSystemObserveCursor(cursor: TravelObserveCursor): void {
    const target = this.getNavigationTargetAtReticle(cursor.dx, cursor.dy);
    if (!target) {
      this.terminalOverlay.addMessageLines([
        '<h>LOCAL OBSERVATION</h>',
        'Reticle return: no resolved local body under cursor.',
        'Move the reticle over a star, planet, moon, or starbase marker.',
      ]);
      this.statusMessage = 'Observation reticle found no local target.';
      return;
    }
    this.selectNavigationTarget(target, false);
    this._dumpScanToTerminal(this.getScannableNavigationTarget(target));
    this.statusMessage = `Observed ${this.getTargetName(target)}.`;
  }

  private getNavigationTargetAtReticle(dx: number, dy: number): NavigationTarget | null {
    const center = this.getTravelViewCenter();
    const cursorX = center.x + dx;
    const cursorY = center.y + dy;
    let bestTarget: NavigationTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of this.getNavigationTargets()) {
      const view = this.getSystemTargetViewPosition(target);
      if (!view) continue;
      const distance = Math.hypot(view.x - cursorX, view.y - cursorY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = target;
      }
    }
    return bestDistance <= 1.5 ? bestTarget : null;
  }

  private getSystemTargetViewPosition(target: NavigationTarget): { x: number; y: number } | null {
    if (this.stateManager.state !== 'system') return null;
    const center = this.getTravelViewCenter();
    const viewScale = this.getCurrentViewScale();
    const viewWorldStartX = this.player.position.systemX - center.x * viewScale;
    const viewWorldStartY = this.player.position.systemY - center.y * viewScale;
    const coords = this.getTargetCoords(target);
    return {
      x: Math.floor((coords.x - viewWorldStartX) / viewScale),
      y: Math.floor((coords.y - viewWorldStartY) / viewScale),
    };
  }

  private observeHyperspaceContact(): void {
    const survey = this.getCurrentHyperspaceSurvey();
    const contact = this.toNavigationContact(survey.nearestSystemContact);
    this.terminalOverlay.clear();
    if (!contact) {
      this.terminalOverlay.addMessageLines([
        '<h>LONG-RANGE OBSERVATION</h>',
        'No stable stellar or planetary-mass contact inside the reticle field.',
        `Interstellar medium: ${survey.medium.label}; sensor efficiency ${(survey.medium.sensorRangeMultiplier * 100).toFixed(0)}%.`,
      ]);
      this.statusMessage = 'Observation found no stable contact.';
      return;
    }

    const range = Math.max(0, contact.rangeCells);
    const confidence = Math.max(12, Math.min(98, Math.round(96 - range * 2.3)));
    const rangeLabel = confidence > 65 ? `${range.toFixed(1)} cells / ${formatHyperspaceSpan(range)}` : `~${Math.round(range)} cells`;
    const bearing = this.formatHyperspaceBearing(contact);
    const classification = confidence > 55
      ? `${contact.name} ${contact.starType}`
      : contact.objectKind === 'brown-dwarf'
        ? 'faint substellar contact'
        : 'stellar contact';
    this.terminalOverlay.addMessageLines([
      '<h>LONG-RANGE OBSERVATION</h>',
      `CONTACT: <hl>${classification}</hl>`,
      `BEARING: <hl>${bearing}</hl>  RANGE: <hl>${rangeLabel}</hl>`,
      `CONFIDENCE: <hl>${confidence}%</hl>  FACILITY TRACE: <hl>${contact.hasStarbase && confidence > 45 ? 'possible' : 'none'}</hl>`,
      range > 18 ? 'Reading is smeared by distance and medium scattering.' : 'Reading is stable enough for approach decisions.',
    ]);
    this.statusMessage = `Observed ${classification}.`;
  }

  private observeSystemTarget(): void {
    const system = this.stateManager.currentSystem;
    const target = this.getSelectedTarget();
    this.terminalOverlay.clear();
    if (!system || !target) {
      this.terminalOverlay.addMessageLines(['<h>LOCAL OBSERVATION</h>', 'No selected local target. Use the target menu or Tab first.']);
      this.statusMessage = 'No local target selected.';
      return;
    }
    const coords = this.getTargetCoords(target);
    const range = Math.sqrt(this.player.distanceSqToSystemCoords(coords.x, coords.y));
    const rangeAu = range / AU_IN_METERS;
    const confidence = Math.max(10, Math.min(99, Math.round(99 - rangeAu * 7)));
    const classLabel = confidence > 45 ? this.getTargetClassLabel(target) : 'distant body';
    const nameLabel = confidence > 35 ? this.getTargetName(target) : 'unresolved target';
    const lines = [
      '<h>LOCAL OBSERVATION</h>',
      `TARGET: <hl>${nameLabel}</hl>  CLASS: <hl>${classLabel}</hl>`,
      `RANGE: <hl>${formatDistanceAu(range)}</hl>  BEARING: <hl>${this.formatBearing(coords.x - this.player.position.systemX, coords.y - this.player.position.systemY)}</hl>`,
      `SIGNAL CONFIDENCE: <hl>${confidence}%</hl>  LIGHT TIME: <hl>${formatLightTimeFromMeters(range)}</hl>`,
    ];
    if (target instanceof Planet && confidence > 55) {
      lines.push(`DISC: <hl>${target.diameter.toLocaleString()} km</hl>  GRAVITY: <hl>${target.gravity.toFixed(2)}g</hl>`);
    } else if (!(target instanceof Planet) && confidence > 55) {
      lines.push(`SPECTRAL RETURN: <hl>${this.getTargetClassLabel(target)}</hl>`);
    } else {
      lines.push('Fine detail is below reliable passive resolution at this range.');
    }
    this.terminalOverlay.addMessageLines(lines);
    this.statusMessage = `Observed ${nameLabel}.`;
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
      this.player.awardCrewExperience('communication', 12);
      this.player.awardCrewExperience('astroscience', 8);
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
        lines.push(
          `Temperature: <hl>avg ${primaryBody.surfaceTemp} K</hl> | <hl>min ${primaryBody.surfaceTempMin} K</hl> | <hl>max ${primaryBody.surfaceTempMax} K</hl>`
        );
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

  private getTargetMenuTargets(): NavigationTarget[] {
    if (this.stateManager.state !== 'system' || !this.stateManager.currentSystem) return [];
    const system = this.stateManager.currentSystem;
    const targets: NavigationTarget[] = [
      ...system.stars,
      ...system.planets.filter((planet): planet is Planet => planet !== null),
    ];
    if (system.starbase) targets.push(system.starbase);
    return targets;
  }

  private getTargetMenuVisibleRows(): number {
    return 12;
  }

  private createTargetMenuModel(): TextModalTableModel {
    const system = this.stateManager.currentSystem;
    const targets = this.getTargetMenuTargets();
    const visibleRows = this.getTargetMenuVisibleRows();
    const viewport = moveSelection(this.targetMenuSelection, 0, targets.length, visibleRows, this.targetMenuOffset);
    this.targetMenuSelection = viewport.selectedIndex;
    this.targetMenuOffset = viewport.viewOffset;

    return {
      title: 'Navigation Targets',
      subtitle: system ? `${system.name} local target index` : 'Local target index',
      columns: ['TYPE', 'NAME', 'RANGE', 'BRG'],
      widths: [8, 24, 10, 5],
      rows: targets.map((target) => this.createTargetMenuRow(target, system)),
      selectedIndex: this.targetMenuSelection,
      viewOffset: this.targetMenuOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down select  Enter approach  Esc/Left/Right cancel'],
    };
  }

  private createTargetMenuRow(target: NavigationTarget, system: SolarSystem | null): TextTableRow {
    const coords = this.getTargetCoords(target);
    const distance = Math.sqrt(this.player.distanceSqToSystemCoords(coords.x, coords.y));
    return {
      id: this.getTargetSignature(target),
      cells: [
        this.getTargetClassLabel(target),
        this.getTargetShortName(target, system),
        formatDistanceAu(distance),
        this.formatBearing(coords.x - this.player.position.systemX, coords.y - this.player.position.systemY),
      ],
      detail: `${this.getTargetName(target)} | ${this.getTargetClassLabel(target)} | one-way signal ${formatLightTimeFromMeters(distance)}`,
    };
  }

  private openShipMenu(): void {
    if (!this.canOpenShipMenu()) {
      this.statusMessage = 'Ship menu unavailable while another interface is active.';
      return;
    }
    this.shipMenuOpen = true;
    this.shipMenuSelectionBySection = {};
    this.shipMenuOffsetBySection = {};
    this.openShipMenuSection('main');
    this.statusMessage = 'Ship operations menu opened.';
    this.forceFullRender = true;
  }

  private canOpenShipMenu(): boolean {
    return (
      this.stateManager.state !== 'starbase' &&
      this.stateManager.state !== 'orbit' &&
      this.popupState === 'inactive' &&
      !this.targetMenuOpen &&
      !this.roverCargoOpen &&
      !this.surfaceLegendOpen &&
      !this.quantitySelector &&
      !this.jettisonConfirmation
    );
  }

  private closeShipMenu(message: string = ''): void {
    this.shipMenuOpen = false;
    this.shipMenuSection = 'main';
    this.shipMenuSelection = 0;
    this.shipMenuOffset = 0;
    this.shipMenuSelectionBySection = {};
    this.shipMenuOffsetBySection = {};
    this.shipMenuJettisonItemKey = null;
    this.statusMessage = message;
    this.forceFullRender = true;
  }

  private openShipMenuSection(section: ShipMenuSection): void {
    this.shipMenuSelectionBySection[this.shipMenuSection] = this.shipMenuSelection;
    this.shipMenuOffsetBySection[this.shipMenuSection] = this.shipMenuOffset;
    this.shipMenuSection = section;
    const rows = this.getShipMenuRows();
    const visibleRows = this.getShipMenuVisibleRows();
    const viewport = moveSelection(
      this.shipMenuSelectionBySection[section] ?? 0,
      0,
      rows.length,
      visibleRows,
      this.shipMenuOffsetBySection[section] ?? 0
    );
    this.shipMenuSelection = viewport.selectedIndex;
    this.shipMenuOffset = viewport.viewOffset;
    if (section !== 'jettison') this.shipMenuJettisonItemKey = null;
    this.forceFullRender = true;
  }

  private moveShipMenuSelection(delta: number, rowCount: number, visibleRows: number): void {
    const viewport = moveSelection(this.shipMenuSelection, delta, rowCount, visibleRows, this.shipMenuOffset);
    this.shipMenuSelection = viewport.selectedIndex;
    this.shipMenuOffset = viewport.viewOffset;
    this.forceFullRender = true;
  }

  private _handleJettisonConfirmationInput(): boolean {
    if (!this.jettisonConfirmation) return false;

    if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
      this.cancelJettisonConfirmation();
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
      this.inputManager.wasActionJustPressed('MOVE_RIGHT') ||
      this.inputManager.wasActionJustPressed('MOVE_UP') ||
      this.inputManager.wasActionJustPressed('MOVE_DOWN')
    ) {
      this.jettisonConfirmation.selectedIndex = this.jettisonConfirmation.selectedIndex === 0 ? 1 : 0;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      if (this.jettisonConfirmation.selectedIndex === 0) {
        const { itemKey, amount } = this.jettisonConfirmation;
        this.jettisonConfirmation = null;
        this.statusMessage = this.jettisonCargoItem(itemKey, amount);
      } else {
        this.cancelJettisonConfirmation();
      }
      this.forceFullRender = true;
      return true;
    }

    return true;
  }

  private cancelJettisonConfirmation(): void {
    this.jettisonConfirmation = null;
    this.statusMessage = 'Jettison cancelled.';
    this.forceFullRender = true;
  }

  private _handleQuantitySelectorInput(): boolean {
    if (!this.quantitySelector) return false;

    if (this.inputManager.wasActionJustPressed('QUIT') || this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')) {
      this.cancelQuantitySelector();
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.quantitySelector = adjustQuantitySelector(this.quantitySelector, -1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.quantitySelector = adjustQuantitySelector(this.quantitySelector, 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      this.quantitySelector = adjustQuantitySelector(this.quantitySelector, this.quantitySelector.step);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      this.quantitySelector = adjustQuantitySelector(this.quantitySelector, -this.quantitySelector.step);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.quantitySelector = setQuantitySelectorValue(this.quantitySelector, this.quantitySelector.max);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.quantitySelector = setQuantitySelectorValue(this.quantitySelector, this.quantitySelector.min);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM') || this.inputManager.wasActionJustPressed('PRIMARY_ACTION')) {
      this.confirmQuantitySelector();
      return true;
    }

    return true;
  }

  private cancelQuantitySelector(): void {
    const operation = this.quantitySelector?.context.type;
    this.quantitySelector = null;
    const message = operation === 'mine' ? 'Mining cancelled.' : 'Transfer cancelled.';
    this.statusMessage = message;
    if (this.stateManager.state === 'starbase') this.starbaseAlert = message;
    this.forceFullRender = true;
  }

  private confirmQuantitySelector(): void {
    if (!this.quantitySelector) return;
    const { value, context } = this.quantitySelector;
    this.quantitySelector = null;
    switch (context.type) {
      case 'buy':
        this.statusMessage = this.buyDepotItem(context.itemKey, value);
        this.starbaseAlert = this.statusMessage;
        break;
      case 'sell':
        this.statusMessage = this.sellDepotItem(context.itemKey, value);
        this.starbaseAlert = this.statusMessage;
        break;
      case 'jettison':
        this.openJettisonConfirmation(context.itemKey, value);
        break;
      case 'mine':
        this.miningSystem.mine(value);
        break;
    }
    this.forceFullRender = true;
  }

  private openQuantitySelector(selector: QuantitySelectorState<QuantityOperation>): void {
    this.quantitySelector = selector;
    this.forceFullRender = true;
  }

  private openJettisonConfirmation(itemKey: string, amount: number): void {
    this.jettisonConfirmation = { itemKey, amount, selectedIndex: 1 };
    this.statusMessage = 'Confirm cargo jettison.';
    this.forceFullRender = true;
  }

  private createJettisonConfirmationModel(): TextModalTableModel {
    const confirmation = this.jettisonConfirmation;
    const itemKey = confirmation?.itemKey ?? '';
    const amount = confirmation?.amount ?? 0;
    const name = this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    return {
      title: 'Confirm Jettison',
      subtitle: `${amount} m^3 ${name}`,
      columns: ['CHOICE', 'ACTION', 'RESULT'],
      widths: [8, 18, 46],
      rows: [
        {
          id: 'yes',
          cells: ['YES', 'Open bay doors', 'Cargo will be permanently ejected into local space.'],
          detail: 'Final confirmation. There is no recovery beacon for jettisoned cargo.',
        },
        {
          id: 'no',
          cells: ['NO', 'Stand down', 'Return to the manifest with cargo intact.'],
          detail: 'Cancel the purge sequence and keep the selected cargo aboard.',
        },
      ],
      selectedIndex: confirmation?.selectedIndex ?? 1,
      viewOffset: 0,
      visibleRowCount: 2,
      footer: ['Up/Down or Left/Right choose  Enter confirm  Esc cancel'],
    };
  }

  private openMiningQuantitySelector(): void {
    if (this.stateManager.state === 'planet' && !this.player.terrainVehicle.deployed) {
      this.statusMessage = 'Mining requires the terrain vehicle. Disembark from ship operations.';
      return;
    }
    const estimate = this.miningSystem.getMiningEstimate();
    if (!estimate.canMine || estimate.maxAmount <= 0) {
      this.statusMessage = estimate.message ?? 'Nothing mineable at this location.';
      return;
    }
    this.openQuantitySelector(createQuantitySelector({
      title: 'Mine Deposit',
      subject: `${estimate.elementName ?? estimate.elementKey ?? 'Deposit'} | surface extraction`,
      detail: 'remaining local seam',
      unitLabel: 'm^3',
      max: estimate.maxAmount,
      value: estimate.maxAmount,
      context: { type: 'mine' },
    }));
  }

  private getSurfaceVehicleMenuItems(): SurfaceVehicleMenuItem[] {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    const fuel = Math.max(0, this.player.terrainVehicle.fuel);
    const items: SurfaceVehicleMenuItem[] = [
      { id: 'map', label: 'Map', status: this.surfaceMapExpanded ? 'expanded' : 'local' },
      { id: 'move', label: 'Move', status: fuel > 0 ? 'ready' : 'no fuel' },
      { id: 'cargo', label: 'Cargo', status: `${cargoTotal}/${this.player.terrainVehicle.cargoHold.capacity} m^3` },
      { id: 'pickup', label: 'Pick up', status: 'no local items' },
      { id: 'mine', label: 'Mine', status: `${cargoTotal}/${this.player.terrainVehicle.cargoHold.capacity} m^3` },
      { id: 'scan', label: 'Scan', status: 'local sweep' },
      { id: 'stun', label: 'Stun', status: 'safe' },
      { id: 'shoot', label: 'Shoot', status: 'safe' },
      { id: 'icon', label: 'Icon', status: 'legend' },
    ];
    if (this.isAtParkedShip()) {
      items.splice(0, 0, { id: 'embark', label: 'Embark', status: 'board ship' });
    }
    return items;
  }

  private getDefaultSurfaceVehicleMenuSelection(): number {
    const items = this.getSurfaceVehicleMenuItems();
    const situationalIndex = items.findIndex((item) => item.id === 'embark');
    return situationalIndex >= 0 ? situationalIndex : 0;
  }

  private createSurfaceVehicleOverlayModel() {
    const items = this.getSurfaceVehicleMenuItems();
    const cargo = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    this.roverMenuSelection = clampIndex(this.roverMenuSelection, items.length);
    return {
      notifications: this.surfaceNotifications.length > 0 ? this.surfaceNotifications : [this.statusMessage].filter(Boolean),
      deployed: this.player.terrainVehicle.deployed,
      moving: this.player.terrainVehicle.moving,
      available: this.player.terrainVehicle.available,
      onFoot: this.player.terrainVehicle.onFoot,
      fuel: this.player.terrainVehicle.fuel,
      maxFuel: this.player.terrainVehicle.maxFuel,
      cargo,
      cargoCapacity: this.player.terrainVehicle.cargoHold.capacity,
      selectedIndex: this.roverMenuSelection,
      items: items.map((item) => ({ id: item.id, label: item.label, status: item.status, tone: item.id === 'embark' ? 'green' as const : 'normal' as const })),
      mapExpanded: this.surfaceMapExpanded,
      surfaceCellScale: this.surfaceMapExpanded ? 1 : CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE,
      scanCursor: this.surfaceScanCursor ?? undefined,
      crew: this.player.crew.map((member) => ({ name: member.name, hitPoints: member.hitPoints, maxHitPoints: member.maxHitPoints })),
      ship: {
        x: this.player.terrainVehicle.shipSurfaceX - this.player.position.surfaceX,
        y: this.player.terrainVehicle.shipSurfaceY - this.player.position.surfaceY,
      },
      shipDistance: this.getParkedShipRangeAndBearing(),
      atShip: this.isAtParkedShip(),
      altitudeBand: this.getCurrentSurfaceAltitudeBand(),
    };
  }

  private openRoverCargo(): void {
    this.roverCargoOpen = true;
    this.roverCargoSelection = 0;
    this.roverCargoOffset = 0;
    this.player.terrainVehicle.moving = false;
    this.statusMessage = 'Terrain vehicle cargo opened.';
    this.forceFullRender = true;
  }

  private createRoverCargoModel(): TextModalTableModel {
    const rows = this.getRoverCargoRows();
    const visibleRows = 8;
    const viewport = moveSelection(this.roverCargoSelection, 0, rows.length, visibleRows, this.roverCargoOffset);
    this.roverCargoSelection = viewport.selectedIndex;
    this.roverCargoOffset = viewport.viewOffset;
    return {
      title: 'Terrain Vehicle Cargo',
      subtitle: 'Rover hold only. Enter drops selected cargo onto the planet surface.',
      columns: ['CARGO', 'QTY', 'VALUE', 'ACTION'],
      widths: [26, 7, 10, 36],
      rows,
      selectedIndex: this.roverCargoSelection,
      viewOffset: this.roverCargoOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down select  Enter drop stack  Esc/Left close'],
    };
  }

  private getRoverCargoRows(): TextTableRow[] {
    const entries = Object.entries(this.player.terrainVehicle.cargoHold.items).filter(([, amount]) => amount > 0);
    if (entries.length === 0) {
      return [{ id: 'empty', cells: ['Rover hold empty', '0', '0', 'No cargo to drop.'], disabled: true }];
    }
    return entries.map(([itemKey, amount]) => {
      const info = this.getTradeItemInfo(itemKey);
      const value = (info?.baseValue ?? 1) * amount;
      return {
        id: itemKey,
        cells: [info?.name ?? itemKey, String(amount), String(value), 'Drop on local surface'],
        detail: `Drops ${amount} m^3 here. Surface item persistence is pending future salvage work.`,
      };
    });
  }

  private dropSelectedRoverCargo(row: TextTableRow | undefined): void {
    if (!row || row.disabled) return;
    const amount = this.player.terrainVehicle.cargoHold.items[row.id] || 0;
    if (amount <= 0) return;
    const removed = this.cargoSystem.removeItem(this.player.terrainVehicle.cargoHold, row.id, amount);
    const name = this.getTradeItemInfo(row.id)?.name ?? row.id;
    this.addSurfaceNotification(`Dropped ${removed} m^3 ${name} on the surface.`);
    this.statusMessage = `Dropped ${removed} m^3 ${name}.`;
    if (this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold) <= 0) {
      this.roverCargoSelection = 0;
      this.roverCargoOffset = 0;
    }
    this.forceFullRender = true;
  }

  private getSurfaceLegendVisibleRows(): number {
    return 10;
  }

  private createSurfaceLegendModel(): TextModalTableModel {
    const rows = this.getSurfaceLegendRows();
    const visibleRows = this.getSurfaceLegendVisibleRows();
    const viewport = moveSelection(this.surfaceLegendSelection, 0, rows.length, visibleRows, this.surfaceLegendOffset);
    this.surfaceLegendSelection = viewport.selectedIndex;
    this.surfaceLegendOffset = viewport.viewOffset;
    return {
      title: 'Surface Icon Legend',
      subtitle: 'Planetary surface symbols and instrument marks.',
      columns: ['ICON', 'SIGNATURE', 'MEANING'],
      widths: [8, 18, 56],
      rows,
      selectedIndex: this.surfaceLegendSelection,
      viewOffset: this.surfaceLegendOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down inspect  PageUp/PageDown scroll  Esc/Left/Right close'],
    };
  }

  private getSurfaceLegendRows(): TextTableRow[] {
    return [
      { id: 'player', cells: [this.player.render.char, 'Crew position', 'Current location of the active surface party or terrain vehicle.'] },
      { id: 'ship', cells: ['S', 'Parked ship', 'Landed starship. Return here to embark or launch back to orbit.'] },
      { id: 'resource', cells: ['%', 'Mineral return', 'Concentrated local resource that can be mined if the vehicle is deployed.'] },
      { id: 'scanner', cells: ['< >', 'Scan reticle', 'Flashing cursor around the selected local terrain cell.'] },
      { id: 'crosshair', cells: ['+', 'Local fix', 'Central surface navigation reference around the current position.'] },
      { id: 'high', cells: ['High', 'Relief scale', 'Upper terrain colours indicate ridges, uplands, or exposed high ground.'] },
      { id: 'low', cells: ['Low', 'Relief scale', 'Lower terrain colours indicate basins, plains, or local depressions.'] },
      { id: 'terrain', cells: [GLYPHS.BLOCK, 'Terrain colour', 'Surface colour is generated from planet type, height, atmosphere, and local conditions.'] },
    ];
  }

  private startSurfaceCursorScan(): void {
    if (this.stateManager.state !== 'planet' || !this.stateManager.currentPlanet) {
      this.statusMessage = 'Surface scan requires a landed planet.';
      return;
    }
    this.player.terrainVehicle.moving = false;
    this.surfaceScanCursor = { dx: 0, dy: 0 };
    this.addSurfaceNotification('Surface scanner active. Move cursor within the view; Enter/Space confirms.');
    this.forceFullRender = true;
  }

  private getSurfaceScanCursorBounds(): { x: number; y: number } {
    const scale = Math.max(1, CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE);
    return {
      x: Math.max(1, Math.floor(Math.min(CONFIG.PLANET_SURFACE_VIEW_WIDTH, 92) / (2 * scale)) - 1),
      y: Math.max(1, Math.floor(CONFIG.PLANET_SURFACE_VIEW_HEIGHT / (2 * scale)) - 1),
    };
  }

  private confirmSurfaceCursorScan(): void {
    const planet = this.stateManager.currentPlanet;
    const cursor = this.surfaceScanCursor;
    if (!planet || !cursor) return;
    planet.ensureSurfaceReady();
    const map = planet.heightmap;
    const elements = planet.surfaceElementMap;
    const size = map?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
    const x = ((Math.floor(this.player.position.surfaceX + cursor.dx) % size) + size) % size;
    const y = Math.max(0, Math.min(size - 1, Math.floor(this.player.position.surfaceY + cursor.dy)));
    const height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, map?.[y]?.[x] ?? 0));
    const altitude = height / Math.max(1, CONFIG.PLANET_HEIGHT_LEVELS - 1);
    const elementKey = elements?.[y]?.[x] ?? '';
    const elementName = elementKey ? this.getTradeItemInfo(elementKey)?.name ?? ELEMENTS[elementKey]?.name ?? elementKey : 'no concentrated resource';
    const mined = planet.isMined(x, y);
    const lat = 90 - (y / Math.max(1, size - 1)) * 180;
    const lon = (x / size) * 360 - 180;
    this.surfaceScanCursor = null;
    this.addSurfaceNotification(`Scan ${Math.round(Math.abs(lat))}${lat < 0 ? 'S' : 'N'} x ${Math.round(Math.abs(lon))}${lon < 0 ? 'W' : 'E'}: ${this.getSurfaceAltitudeLabel(altitude)} terrain.`);
    this.addSurfaceNotification(mined ? `${elementName} trace is depleted at this location.` : `Local return: ${elementName}. Altitude ${Math.round(altitude * 100)}%.`);
    this.addSurfaceNotification(`Temp ${planet.getCurrentTemperature()} K. Gravity ${planet.gravity.toFixed(2)}g. ${planet.atmosphere.density} atmosphere.`);
    this.statusMessage = 'Surface scan complete.';
    this.forceFullRender = true;
  }

  private addSurfaceNotification(message: string): void {
    if (!message) return;
    this.surfaceNotifications = [message, ...this.surfaceNotifications].slice(0, 4);
  }

  private getSurfaceAltitudeLabel(altitude: number): string {
    if (altitude > 0.78) return 'high ridge';
    if (altitude > 0.58) return 'upland';
    if (altitude < 0.22) return 'low basin';
    if (altitude < 0.38) return 'lowland';
    return 'broken plain';
  }

  private describePlanetSurfaceForDisembark(planet: Planet | null): string[] {
    if (!planet) return ['Surface optics online.', 'No planetary description available.'];
    const terrain = planet.type === 'Oceanic'
      ? 'broad dark waterfields broken by mineral-bright margins'
      : planet.type === 'Frozen'
        ? 'pale fractured ice, shadowed basins, and wind-polished crust'
        : planet.type === 'Lunar'
          ? 'powder-grey regolith, crater rims, and hard black horizons'
          : 'rocky rises, low basins, and exposed mineral seams';
    const primaryGas = Object.keys(planet.atmosphere.composition)[0] ?? 'thin';
    const sky = planet.atmosphere.density === 'None'
      ? 'The sky is black and sharp; shadows fall without haze.'
      : `The ${primaryGas.toLowerCase()} air gives the horizon a thin ${planet.atmosphere.density.toLowerCase()} veil.`;
    return [
      `${planet.name}: ${terrain}.`,
      sky,
      `Current surface ${planet.getCurrentTemperature()} K; gravity ${planet.gravity.toFixed(2)}g.`,
    ];
  }

  private activateSurfaceVehicleAction(item: SurfaceVehicleMenuItem | undefined): void {
    if (!item) return;
    switch (item.id) {
      case 'map':
        this.surfaceMapExpanded = true;
        this.player.terrainVehicle.moving = false;
        this.statusMessage = 'Surface map expanded. Enter/Space returns to local view.';
        this.forceFullRender = true;
        break;
      case 'move':
        if (this.player.terrainVehicle.fuel <= 0) {
          this.statusMessage = 'Terrain vehicle fuel exhausted. Dock with the ship to refuel.';
        } else {
          this.player.terrainVehicle.moving = true;
          this.statusMessage = 'Terrain vehicle moving. Arrow keys drive; Enter/Space stops.';
        }
        break;
      case 'cargo':
        this.openRoverCargo();
        break;
      case 'mine':
        this.openMiningQuantitySelector();
        break;
      case 'scan':
        this.startSurfaceCursorScan();
        break;
      case 'embark':
        this.dockTerrainVehicle();
        break;
      case 'icon':
        this.surfaceLegendOpen = true;
        this.surfaceLegendSelection = 0;
        this.surfaceLegendOffset = 0;
        this.player.terrainVehicle.moving = false;
        this.statusMessage = 'Surface icon legend opened.';
        this.forceFullRender = true;
        break;
      case 'pickup':
        this.statusMessage = 'No recoverable surface items detected.';
        break;
      case 'stun':
        this.statusMessage = 'Stunner armed; no biological target acquired.';
        break;
      case 'shoot':
        this.statusMessage = 'Rover weapon safe; no target designated.';
        break;
    }
  }

  private disembarkTerrainVehicle(): void {
    if (this.stateManager.state !== 'planet') {
      this.statusMessage = 'Terrain vehicle deployment requires landing on a planet.';
      return;
    }
    if (!this.player.terrainVehicle.available) {
      this.statusMessage = 'No terrain vehicle aboard. Purchase a replacement at a starport shipyard.';
      return;
    }
    this.player.terrainVehicle.deployed = true;
    this.player.terrainVehicle.moving = false;
    this.player.terrainVehicle.onFoot = false;
    this.player.terrainVehicle.fuel = this.player.terrainVehicle.maxFuel;
    this.roverMenuSelection = 1;
    this.surfaceMapExpanded = false;
    this.surfaceLegendOpen = false;
    this.surfaceNotifications = this.describePlanetSurfaceForDisembark(this.stateManager.currentPlanet);
    this.statusMessage = 'Disembarked. Surface operations online.';
    this.addSurfaceNotification(this.statusMessage);
    this.closeShipMenu('');
    this.forceFullRender = true;
  }

  private dockTerrainVehicle(): void {
    if (!this.isAtParkedShip()) {
      this.statusMessage = 'Embark requires returning to the parked ship.';
      this.addSurfaceNotification(this.statusMessage);
      this.forceFullRender = true;
      return;
    }
    const transferred = this.transferRoverCargoToShip();
    this.player.terrainVehicle.deployed = false;
    this.player.terrainVehicle.moving = false;
    this.player.terrainVehicle.onFoot = false;
    this.player.terrainVehicle.fuel = this.player.terrainVehicle.maxFuel;
    const remaining = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    this.statusMessage = remaining > 0
      ? `Embarked. Transferred ${transferred} m^3; ${remaining} m^3 remains aboard rover.`
      : `Embarked. Transferred ${transferred} m^3 to ship hold.`;
    this.addSurfaceNotification(this.statusMessage);
    this.openSurfaceLandingOperationsMenu();
    this.forceFullRender = true;
  }

  private launchFromParkedShip(): void {
    if (!this.isAtParkedShip() || this.player.terrainVehicle.deployed || this.player.terrainVehicle.onFoot) {
      this.statusMessage = 'Launch requires being aboard the parked ship.';
      return;
    }
    this.shipMenuOpen = false;
    this.shipMenuSection = 'main';
    this.stateManager.launchFromSurfaceToOrbit();
    if (this.stateManager.statusMessage) {
      this.statusMessage = this.stateManager.statusMessage;
      this.stateManager.statusMessage = '';
    }
    this.forceFullRender = true;
  }

  private openSurfaceLandingOperationsMenu(): void {
    if (this.stateManager.state !== 'planet') return;
    this.shipMenuOpen = true;
    this.shipMenuSection = 'main';
    this.shipMenuSelection = this.getShipMenuRows().findIndex((row) => row.id === 'rover');
    if (this.shipMenuSelection < 0) this.shipMenuSelection = 0;
    this.shipMenuOffset = 0;
    this.shipMenuJettisonItemKey = null;
    this.forceFullRender = true;
  }

  private isAtParkedShip(): boolean {
    return (
      Math.floor(this.player.position.surfaceX) === Math.floor(this.player.terrainVehicle.shipSurfaceX) &&
      Math.floor(this.player.position.surfaceY) === Math.floor(this.player.terrainVehicle.shipSurfaceY)
    );
  }

  private getParkedShipRangeAndBearing(): { distanceKm: number; direction: string } {
    const dx = this.player.terrainVehicle.shipSurfaceX - this.player.position.surfaceX;
    const dy = this.player.terrainVehicle.shipSurfaceY - this.player.position.surfaceY;
    return {
      distanceKm: Math.sqrt(dx * dx + dy * dy) * this.getSurfaceCellKilometers(),
      direction: this.formatSurfaceDirection(dx, dy),
    };
  }

  private getSurfaceCellKilometers(): number {
    const planet = this.stateManager.currentPlanet;
    if (!planet) return 1;
    const mapSize = Math.max(1, planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE);
    const radiusKm = Math.max(1, planet.diameter / 2);
    return (2 * Math.PI * radiusKm) / mapSize;
  }

  private formatSurfaceDirection(dx: number, dy: number): string {
    if (Math.round(dx) === 0 && Math.round(dy) === 0) return 'Here';
    const vertical = dy < 0 ? 'North' : dy > 0 ? 'South' : '';
    const horizontal = dx > 0 ? 'East' : dx < 0 ? 'West' : '';
    return vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal;
  }

  private getCurrentSurfaceAltitudeBand(): { low: string; high: string; current: string } {
    const planet = this.stateManager.currentPlanet;
    const map = planet?.heightmap;
    const size = map?.length ?? 0;
    if (!planet || !map || size <= 0) return { low: 'Low', high: 'High', current: 'unknown' };
    const x = ((Math.floor(this.player.position.surfaceX) % size) + size) % size;
    const y = Math.max(0, Math.min(size - 1, Math.floor(this.player.position.surfaceY)));
    const height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, map[y]?.[x] ?? 0));
    const altitude = height / Math.max(1, CONFIG.PLANET_HEIGHT_LEVELS - 1);
    return { low: 'Low', high: 'High', current: this.getSurfaceAltitudeLabel(altitude) };
  }

  private transferRoverCargoToShip(): number {
    let transferred = 0;
    for (const [itemKey, amount] of Object.entries({ ...this.player.terrainVehicle.cargoHold.items })) {
      if (amount <= 0) continue;
      const added = this.cargoSystem.addItem(this.player.cargoHold, itemKey, amount);
      if (added > 0) {
        this.cargoSystem.removeItem(this.player.terrainVehicle.cargoHold, itemKey, added);
        transferred += added;
      }
    }
    return transferred;
  }

  private consumeTerrainVehicleFuelForMove(planet: Planet): boolean {
    const map = planet.heightmap;
    const size = map?.length ?? 0;
    const x = size > 0 ? ((Math.floor(this.player.position.surfaceX) % size) + size) % size : 0;
    const y = size > 0 ? Math.max(0, Math.min(size - 1, Math.floor(this.player.position.surfaceY))) : 0;
    const height = size > 0 ? Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, map?.[y]?.[x] ?? 0)) : 0;
    const altitude = height / Math.max(1, CONFIG.PLANET_HEIGHT_LEVELS - 1);
    const cost = CONFIG.TERRAIN_VEHICLE_MOVE_FUEL_BASE * (1 + altitude * CONFIG.TERRAIN_VEHICLE_ALTITUDE_FUEL_FACTOR);
    if (this.player.terrainVehicle.fuel < cost) {
      this.player.terrainVehicle.fuel = 0;
      this.player.terrainVehicle.moving = false;
      this.player.terrainVehicle.deployed = false;
      this.player.terrainVehicle.available = false;
      this.player.terrainVehicle.onFoot = true;
      this.statusMessage = 'Terrain vehicle fuel exhausted. Vehicle abandoned; return to the ship on foot.';
      this.addSurfaceNotification(this.statusMessage);
      this.forceFullRender = true;
      return false;
    }
    this.player.terrainVehicle.fuel = Math.max(0, this.player.terrainVehicle.fuel - cost);
    return true;
  }

  private applyFootTravelRisk(): void {
    if (this.gameSeedPRNG.random() >= CONFIG.FOOT_TRAVEL_DAMAGE_CHANCE) return;
    const living = this.player.crew.filter((member) => member.hitPoints > 0);
    if (living.length === 0) return;
    const victim = living[this.gameSeedPRNG.randomInt(0, living.length - 1)];
    const damage = this.gameSeedPRNG.randomInt(1, 3);
    victim.hitPoints = Math.max(0, victim.hitPoints - damage);
    this.addSurfaceNotification(`${victim.name} takes ${damage} damage crossing exposed ground on foot.`);
  }

  private activateShipMenuSelection(row: TextTableRow | undefined): void {
    if (!row || row.disabled) return;
    if (this.shipMenuSection === 'main') {
      if (row.id === 'launch') {
        this.launchFromParkedShip();
        return;
      }
      if (row.id === 'deck' || row.id === 'stations' || row.id === 'cargo' || row.id === 'crew' || row.id === 'status' || row.id === 'log' || row.id === 'rover') {
        this.openShipMenuSection(row.id as ShipMenuSection);
      }
      return;
    }
    if (this.shipMenuSection === 'rover') {
      if (row.id === 'rover:deploy') this.disembarkTerrainVehicle();
      if (row.id === 'rover:embark') this.dockTerrainVehicle();
      if (row.id === 'rover:launch') this.launchFromParkedShip();
      return;
    }
    if (this.shipMenuSection === 'deck' && row.id.startsWith('deck:')) {
      this.focusShipCompartment(row.id.slice('deck:'.length));
      return;
    }
    if (this.shipMenuSection === 'stations' && row.id.startsWith('station:')) {
      this.focusShipCompartment(row.id.slice('station:'.length));
      return;
    }
    if (this.shipMenuSection === 'cargo') {
      if (row.id.startsWith('cargo:')) {
        this.openJettisonQuantitySelector(row.id.slice('cargo:'.length));
      }
      return;
    }
    if (this.shipMenuSection === 'jettison') {
      this.activateJettisonSelection(row);
    }
  }

  private focusShipCompartment(compartmentId: string): void {
    const compartment = getShipCompartment(compartmentId);
    this.currentShipCompartmentId = compartment.id;
    this.statusMessage = `Ship focus: ${compartment.label}.`;
    this.forceFullRender = true;
  }

  private activateJettisonSelection(row: TextTableRow): void {
    if (row.id === 'cancel') {
      this.openShipMenuSection('cargo');
      this.statusMessage = 'Jettison cancelled.';
      return;
    }
    const itemKey = this.shipMenuJettisonItemKey;
    if (!itemKey) {
      this.openShipMenuSection('cargo');
      this.statusMessage = 'No cargo selected.';
      return;
    }
    const held = this.player.cargoHold.items[itemKey] || 0;
    if (held <= 0) {
      this.openShipMenuSection('cargo');
      this.statusMessage = 'Selected cargo is no longer aboard.';
      return;
    }
    const amount = row.id === 'all' ? held : Number(row.id);
    const message = this.jettisonCargoItem(itemKey, amount);
    this.openShipMenuSection('cargo');
    this.statusMessage = message;
  }

  private openJettisonQuantitySelector(itemKey: string): void {
    const held = this.player.cargoHold.items[itemKey] || 0;
    const name = this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    if (held <= 0) {
      this.statusMessage = `No ${name} aboard.`;
      return;
    }
    this.openQuantitySelector(createQuantitySelector({
      title: 'Jettison Cargo',
      subject: name,
      detail: 'external bay purge',
      unitLabel: 'm^3',
      max: held,
      value: held,
      context: { type: 'jettison', itemKey },
    }));
  }

  private jettisonCargoItem(itemKey: string, amount: number): string {
    const removed = this.cargoSystem.removeItem(this.player.cargoHold, itemKey, amount);
    const name = this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    eventManager.publish(GameEvents.PLAYER_CARGO_REMOVED, { elementKey: itemKey, amountRemoved: removed });
    return removed > 0 ? `Jettisoned ${removed} m^3 ${name}.` : `No ${name} jettisoned.`;
  }

  private getShipMenuVisibleRows(): number {
    return 12;
  }

  private createShipMenuModel(): TextModalTableModel {
    const rows = this.getShipMenuRows();
    const visibleRows = this.getShipMenuVisibleRows();
    const viewport = moveSelection(this.shipMenuSelection, 0, rows.length, visibleRows, this.shipMenuOffset);
    this.shipMenuSelection = viewport.selectedIndex;
    this.shipMenuOffset = viewport.viewOffset;
    const meta = this.getShipMenuMeta();
    return {
      title: meta.title,
      subtitle: meta.subtitle,
      columns: meta.columns,
      widths: meta.widths,
      rows,
      selectedIndex: this.shipMenuSelection,
      viewOffset: this.shipMenuOffset,
      visibleRowCount: visibleRows,
      detailLineCount: this.shipMenuSection === 'main' ? 2 : 1,
      footer: meta.footer,
    };
  }

  private getShipMenuMeta(): { title: string; subtitle: string; columns: string[]; widths: number[]; footer: string[] } {
    const backHint = this.shipMenuSection === 'main' ? 'Esc/Left close' : 'Esc/Left back';
    switch (this.shipMenuSection) {
      case 'deck':
        return { title: 'Ship Deck Plan', subtitle: `${getShipCompartment(this.currentShipCompartmentId).label} is the current internal focus.`, columns: ['DECK', 'COMPARTMENT', 'WATCH', 'STATE', 'READOUT'], widths: [6, 20, 17, 10, 35], footer: [`Up/Down select  Enter focus compartment  ${backHint}`] };
      case 'stations':
        return { title: 'Ship Stations', subtitle: 'Crewed work points and instrument ownership.', columns: ['STATION', 'SKILL', 'BEST', 'STATE', 'READOUT'], widths: [20, 16, 6, 10, 36], footer: [`Up/Down select  Enter focus station  ${backHint}`] };
      case 'cargo':
        return { title: 'Ship Cargo', subtitle: 'Hold manifest, mass load, and external ejection controls.', columns: ['BAY / CARGO', 'QTY', 'VALUE', 'LOAD / ACTION'], widths: [26, 7, 10, 34], footer: [`Up/Down select  Enter jettison options  ${backHint}`] };
      case 'crew':
        return { title: 'Crew Records', subtitle: 'Personnel vitals, readiness, and specialist coverage.', columns: ['CREW', 'DUTY', 'VITALS', 'READINESS / SKILLS'], widths: [20, 16, 13, 41], footer: [`Up/Down inspect  ${backHint}`] };
      case 'status':
        return { title: 'Ship Status', subtitle: 'Primary shipboard systems and operating posture.', columns: ['SYSTEM', 'READING', 'STATE', 'TELEMETRY'], widths: [18, 18, 12, 42], footer: [`Up/Down inspect  ${backHint}`] };
      case 'log':
        return { title: 'Ship Log', subtitle: 'Chronicle, fixes, anomalies, and watch notes recorded by ship systems.', columns: ['LOG', 'CHANNEL', 'STATE', 'ENTRY'], widths: [8, 12, 13, 55], footer: [`Up/Down inspect  PageUp/PageDown scroll  ${backHint}`] };
      case 'rover':
        return { title: 'Terrain Vehicle', subtitle: 'Planetside disembark, embark, fuel, cargo, and surface sortie state.', columns: ['SYSTEM', 'READING', 'STATE', 'ACTION'], widths: [18, 18, 13, 42], footer: [`Up/Down select  Enter use  ${backHint}`] };
      case 'jettison':
        return { title: 'Confirm Jettison', subtitle: 'External bay doors armed. Cargo ejection is permanent.', columns: ['VENT', 'CARGO', 'AFTER', 'CONFIRMATION'], widths: [10, 24, 14, 40], footer: [`Enter confirms selected amount  ${backHint}`] };
      case 'main':
      default:
        return { title: 'Ship Operations', subtitle: 'Internal vessel systems, manifests, crew, and compartment focus.', columns: ['SHIP AREA', 'STATE'], widths: [24, 24], footer: ['Up/Down select  Enter/Right open  Esc/Left close'] };
    }
  }

  private getShipMenuRows(): TextTableRow[] {
    switch (this.shipMenuSection) {
      case 'deck':
        return this.getShipDeckMenuRows();
      case 'stations':
        return this.getShipStationMenuRows();
      case 'cargo':
        return this.getShipCargoMenuRows();
      case 'crew':
        return this.getShipCrewMenuRows();
      case 'status':
        return this.getShipStatusMenuRows();
      case 'log':
        return this.getShipLogMenuRows();
      case 'rover':
        return this.getTerrainVehicleMenuRows();
      case 'jettison':
        return this.getJettisonMenuRows();
      case 'main':
      default:
        const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
        const roverTotal = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
        const wounded = this.player.crew.filter((member) => member.hitPoints < member.maxHitPoints).length;
        const focus = getShipCompartment(this.currentShipCompartmentId);
        const rows: TextTableRow[] = [
          { id: 'deck', cells: ['Deck Plan', focus.label], detail: 'Internal compartments, watch stations, and current shipboard focus.' },
          { id: 'stations', cells: ['Stations', this.getShipStationCoverageLabel()], detail: 'Crewed work points for navigation, survey, engineering, medical, and bay control.' },
          { id: 'cargo', cells: ['Cargo', `${cargoTotal}/${this.player.cargoHold.capacity} m^3`], detail: `${this.formatGauge(cargoTotal, this.player.cargoHold.capacity, 14)} Ship hold plus rover cargo manifest.` },
          { id: 'crew', cells: ['Crew', wounded > 0 ? `${wounded} wounded` : `${this.player.crew.length} ready`], detail: 'Roster, vitals, learning progress, and specialist coverage.' },
          { id: 'status', cells: ['Ship Status', this.getShipOperatingState()], detail: 'Fuel, cargo, finance, crew, location, and current flight mode.' },
          { id: 'log', cells: ['Ship Log', this.getShipLogSummary()], detail: 'Persistent watch notes, discoveries, mission state, and navigation fixes.' },
        ];
        if (this.stateManager.state === 'planet') {
          rows.splice(3, 0, { id: 'rover', cells: ['Terrain Vehicle', this.player.terrainVehicle.available ? (this.player.terrainVehicle.deployed ? 'disembarked' : `${roverTotal}/50 m^3`) : 'lost'], detail: 'Disembark, embark, refuel, and review the surface vehicle.' });
          rows.splice(4, 0, {
            id: 'launch',
            cells: [
              'Launch',
              this.isAtParkedShip() && !this.player.terrainVehicle.deployed && !this.player.terrainVehicle.onFoot ? 'ready' : 'parked ship req.',
            ],
            detail: 'Lift from the landed ship to orbital view.',
            disabled: !this.isAtParkedShip() || this.player.terrainVehicle.deployed || this.player.terrainVehicle.onFoot,
          });
        }
        return rows;
    }
  }

  private getShipDeckMenuRows(): TextTableRow[] {
    return createShipDeckRows(this.getShipPlaceContext());
  }

  private getShipStationMenuRows(): TextTableRow[] {
    return createShipStationRows(this.getShipPlaceContext());
  }

  private getShipPlaceContext() {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    return {
      crew: this.player.crew,
      cargoTotal,
      cargoCapacity: this.player.cargoHold.capacity,
      fuel: this.player.resources.fuel,
      maxFuel: this.player.resources.maxFuel,
      credits: this.player.resources.credits,
      stateLabel: this.stateManager.state,
      currentCompartmentId: this.currentShipCompartmentId,
    };
  }

  private getShipStationCoverageLabel(): string {
    const critical = ['navigation', 'astroscience', 'engineering', 'medicine', 'communication'] as CrewSkill[];
    const covered = critical.filter((skill) => getBestCrewSkill(this.player.crew, skill) > 0).length;
    return `${covered}/${critical.length} crewed`;
  }

  private getShipCargoMenuRows(): TextTableRow[] {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const roverTotal = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    const rows: TextTableRow[] = [
      {
        id: 'cargo-overview',
        cells: [
          'Hold capacity',
          `${cargoTotal}`,
          `${this.player.cargoHold.capacity}`,
          `${this.formatGauge(cargoTotal, this.player.cargoHold.capacity, 18)} ${this.getCargoLoadLabel(cargoTotal)}`,
        ],
        detail: `${this.player.cargoHold.capacity - cargoTotal} m^3 free. Jettisoned cargo is unrecoverable in the current build.`,
        disabled: true,
      },
    ];
    const shipCargoRows = this.getCargoRowsForHold(this.player.cargoHold.items, 'ship').map((row, index) => ({
      id: row.disabled ? row.id : `cargo:${row.id}`,
      cells: [
        row.disabled ? row.cells[0] : `Bay ${String(index + 1).padStart(2, '0')} ${row.cells[0]}`,
        row.cells[1],
        row.cells[2],
        row.disabled ? 'No cargo aboard' : `${this.formatGauge(Number(row.cells[1]), Math.max(1, cargoTotal), 12)} Enter to arm ejector`,
      ],
      detail: row.disabled ? row.detail : `${row.detail ?? row.cells[0]} Select to choose jettison amount.`,
      disabled: row.disabled,
    }));
    const roverCargoRows = this.getCargoRowsForHold(this.player.terrainVehicle.cargoHold.items, 'rover').map((row) => ({
      id: `rover:${row.id}`,
      cells: [row.disabled ? row.cells[0] : `Rover ${row.cells[0]}`, row.cells[1], row.cells[2], row.disabled ? 'Vehicle bay empty' : 'Terrain vehicle cargo; docks into ship when space permits'],
      detail: row.detail,
      disabled: true,
    }));
    return [
      ...rows,
      { id: 'ship-heading', cells: ['-- Ship Hold --', `${cargoTotal}`, `${this.player.cargoHold.capacity}`, 'Primary cargo bay'], disabled: true },
      ...shipCargoRows,
      { id: 'rover-heading', cells: ['-- Terrain Vehicle --', `${roverTotal}`, `${this.player.terrainVehicle.cargoHold.capacity}`, this.player.terrainVehicle.deployed ? 'Out on surface' : 'Docked in vehicle bay'], disabled: true },
      ...roverCargoRows,
    ];
  }

  private getTerrainVehicleMenuRows(): TextTableRow[] {
    const rover = this.player.terrainVehicle;
    const cargoTotal = this.cargoSystem.getTotalUnits(rover.cargoHold);
    const onSurface = this.stateManager.state === 'planet';
    const atShip = this.isAtParkedShip();
    return [
      {
        id: rover.deployed || rover.onFoot ? 'rover:embark' : 'rover:deploy',
        cells: [
          'Sortie state',
          rover.onFoot ? 'on foot' : rover.deployed ? 'disembarked' : 'embarked',
          rover.available ? (onSurface ? 'available' : 'locked') : 'vehicle lost',
          rover.deployed || rover.onFoot ? 'Enter embarks at parked ship and transfers cargo.' : 'Enter disembarks with full rover fuel.',
        ],
        disabled: !onSurface || (!rover.available && !rover.onFoot),
      },
      {
        id: 'rover:launch',
        cells: ['Launch', atShip && !rover.deployed && !rover.onFoot ? 'ready' : 'parked ship req.', onSurface ? 'orbit' : 'locked', 'Launch from landed ship to orbital view.'],
        disabled: !onSurface || !atShip || rover.deployed || rover.onFoot,
      },
      {
        id: 'rover-fuel',
        cells: ['Vehicle fuel', `${rover.fuel.toFixed(1)}/${rover.maxFuel}`, rover.fuel > 0 ? 'ready' : 'empty', `${this.formatGauge(rover.fuel, rover.maxFuel, 20)} altitude raises consumption`],
        disabled: true,
      },
      {
        id: 'rover-cargo',
        cells: ['Vehicle cargo', `${cargoTotal}/${rover.cargoHold.capacity} m^3`, this.getCargoLoadLabel(cargoTotal), `${this.formatGauge(cargoTotal, rover.cargoHold.capacity, 20)} transfers on dock`],
        disabled: true,
      },
      {
        id: 'rover-controls',
        cells: ['Surface controls', rover.moving ? 'moving' : 'stopped', 'menu', rover.moving ? 'Enter/Space stops; arrows drive.' : 'Stopped: arrows select rover actions.'],
        disabled: true,
      },
    ];
  }

  private getShipCrewMenuRows(): TextTableRow[] {
    const crew = this.player.crew;
    const rows: TextTableRow[] = [
      {
        id: 'crew-overview',
        cells: [
          `${crew.length} aboard`,
          'Ship company',
          this.getCrewHealthLabel(),
          `Nav ${getBestCrewSkill(crew, 'navigation')}  Astro ${getBestCrewSkill(crew, 'astroscience')}  Eng ${getBestCrewSkill(crew, 'engineering')}  Med ${getBestCrewSkill(crew, 'medicine')}`,
        ],
        detail: `Coverage totals: Comms ${getCrewSkillTotal(crew, 'communication')}, Geo ${getCrewSkillTotal(crew, 'geology')}, Pilot ${getCrewSkillTotal(crew, 'piloting')}, Security ${getCrewSkillTotal(crew, 'spaceCombat')}.`,
        disabled: true,
      },
    ];
    return [
      ...rows,
      ...crew.map((member) => {
        const nextXp = getNextLevelExperience(member.level);
        const healthBar = this.formatGauge(member.hitPoints, member.maxHitPoints, 8);
        const xpBar = this.formatGauge(member.experience, nextXp, 8);
        return {
          id: member.id,
          cells: [
            member.name,
            `${member.role} L${member.level}`,
            `${healthBar} ${member.hitPoints}/${member.maxHitPoints}`,
            `XP ${xpBar} ${member.experience}/${nextXp}  TP ${member.trainingPoints}  ${formatTopSkills(member, 3)}`,
          ],
          detail: `Durability ${member.durability}. Human learning cap 10. Training can be assigned from a starbase crew office.`,
          disabled: true,
        };
      }),
    ];
  }

  private getShipStatusMenuRows(): TextTableRow[] {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const stateLabel = this.stateManager.state === 'planet' ? `Surface: ${this.stateManager.currentPlanet?.name ?? 'unknown'}` : this.stateManager.state;
    const fuel = Math.round(this.player.resources.fuel);
    const ship = this.player.ship;
    const stats = getShipDerivedStats(ship);
    return [
      { id: 'flight', cells: ['Flight mode', stateLabel, this.getShipOperatingState(), `World grid ${this.player.position.worldX},${this.player.position.worldY}`], disabled: true },
      { id: 'fuel', cells: ['Fuel reserve', `${fuel}/${this.player.resources.maxFuel}`, this.getFuelStateLabel(), this.formatGauge(fuel, this.player.resources.maxFuel, 22)], disabled: true },
      { id: 'damage', cells: ['Damage control', `${stats.hullIntegrityPercent}% hull`, stats.damagedSubsystemCount > 0 ? `${stats.damagedSubsystemCount} damaged` : 'Nominal', getShipDamageSummary(ship)], disabled: true },
      { id: 'cargo', cells: ['Cargo hold', `${cargoTotal}/${this.player.cargoHold.capacity} m^3`, this.getCargoLoadLabel(cargoTotal), this.formatGauge(cargoTotal, this.player.cargoHold.capacity, 22)], disabled: true },
      { id: 'superstructure', cells: ['Superstructure', ship.superstructure.name, `${stats.fittedLoadPercent}% fitted`, `${ship.superstructure.engineMounts} engine  ${ship.superstructure.specialPurposeBays} special  ${ship.superstructure.probeBays} probe  ${ship.superstructure.cargoBays} cargo bays`], disabled: true },
      { id: 'drive', cells: ['Drive plant', `Class ${ship.engineClass}`, `${stats.driveEfficiencyPercent}% eff.`, 'Efficiency reflects fitted load and installed engine class.'], disabled: true },
      { id: 'cargo-pods', cells: ['Cargo pods', `${ship.cargoPodsInstalled}/${ship.superstructure.cargoBays}`, `${stats.emptyCargoBays} empty`, `${ship.cargoPodCapacity} m^3 each; capacity ${stats.cargoCapacity} m^3`], disabled: true },
      { id: 'weapons', cells: ['Weapons', `Laser C${ship.laserClass || '-'}`, ship.laserClass > 0 ? `Output ${stats.laserRating}` : 'None', `Missiles ${ship.missileCount}/${stats.missileCapacity} nuclear (${stats.missileLoadPercent}%)`], disabled: true },
      { id: 'shields', cells: ['Shields', ship.shieldClass > 0 ? `Class ${ship.shieldClass}` : 'None', ship.shieldClass > 0 ? `Rating ${stats.shieldRating}` : 'Unfitted', ship.shieldClass > 0 ? 'Generator fitted in shield mount.' : 'No shield generator installed.'], disabled: true },
      { id: 'bays', cells: ['Utility bays', `${stats.emptySpecialPurposeBays}/${stats.specialBayCapacity} special`, `${stats.emptyProbeBays}/${stats.probeCapacity} probe`, `Landing bays ${stats.landingBayCapacity}; terrain vehicle ${this.player.terrainVehicle.available ? 'secured' : 'missing'}`], disabled: true },
      { id: 'credits', cells: ['Credit account', `${this.player.resources.credits.toLocaleString()} Cr`, 'Liquid', 'Station-authorised spend balance.'], disabled: true },
      { id: 'crew', cells: ['Crew company', `${this.player.crew.length} aboard`, this.getCrewHealthLabel(), `Training points ${this.player.crew.reduce((sum, member) => sum + member.trainingPoints, 0)} available.`], disabled: true },
      { id: 'navigation', cells: ['Navigation', `Nav ${getBestCrewSkill(this.player.crew, 'navigation')}`, 'Crewed', `Pilot ${getBestCrewSkill(this.player.crew, 'piloting')}  Astro ${getBestCrewSkill(this.player.crew, 'astroscience')}`], disabled: true },
      { id: 'survey', cells: ['Survey suite', `Geo ${getBestCrewSkill(this.player.crew, 'geology')}`, 'Crewed', `Astro ${getBestCrewSkill(this.player.crew, 'astroscience')}  Comms ${getBestCrewSkill(this.player.crew, 'communication')}`], disabled: true },
    ];
  }

  private getShipLogMenuRows(): TextTableRow[] {
    const rows: TextTableRow[] = [];
    const state = this.stateManager.state;
    const system = this.stateManager.currentSystem;
    const planet = this.stateManager.currentPlanet;
    const target = this.getSelectedTarget();
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const activeMissionCount = Object.keys(this.activeMissions).length;

    rows.push(this.createShipLogRow('001', 'NAV', 'FIX', this.getShipPositionLogEntry(), 'Current navigational fix and vessel state at the time the log panel was opened.'));
    rows.push(this.createShipLogRow('002', 'SHIP', this.getShipOperatingState().toUpperCase(), `Fuel ${Math.round(this.player.resources.fuel)}/${this.player.resources.maxFuel} | Cargo ${cargoTotal}/${this.player.cargoHold.capacity} m^3 | Shields C${this.player.ship.shieldClass || '-'} | Laser C${this.player.ship.laserClass || '-'} | Missiles ${this.player.ship.missileCount}/${this.player.ship.missileCapacity}.`, 'Core shipboard resources, fitted combat systems, and current watch posture.'));
    rows.push(this.createShipLogRow('003', 'CREW', this.getCrewHealthLabel().toUpperCase(), `Best skills: Nav ${getBestCrewSkill(this.player.crew, 'navigation')}  Astro ${getBestCrewSkill(this.player.crew, 'astroscience')}  Eng ${getBestCrewSkill(this.player.crew, 'engineering')}  Med ${getBestCrewSkill(this.player.crew, 'medicine')}.`, 'Crew readiness, specialist coverage, and available shipboard judgement.'));

    if (system) {
      rows.push(this.createShipLogRow('004', 'SURVEY', state.toUpperCase(), `${system.name} | ${system.architecture.kind} architecture | ${system.planets.filter(Boolean).length} indexed planetary bodies.`, 'System summary compiled from the current navigation database.'));
    } else {
      rows.push(this.createShipLogRow('004', 'SURVEY', 'VOID', 'No local system locked. Long-range survey suite is reading interstellar background only.', 'Deep-space cruise state. Local records are limited to contacts and medium readings.'));
    }

    if (target) {
      rows.push(this.createShipLogRow('005', 'TARGET', 'SELECTED', `${this.getTargetName(target)} | ${this.getTargetClassLabel(target)} | ${this.getTargetRangeLabel(target)}.`, 'Selected navigation target, suitable for approach assist where available.'));
    } else {
      rows.push(this.createShipLogRow('005', 'TARGET', 'NONE', 'No navigation target selected.', 'Use target cycling or the navigation menu to designate a local object.'));
    }

    if (planet) {
      rows.push(this.createShipLogRow('006', 'PLANET', planet.scanned ? 'SCANNED' : 'UNSCANNED', `${planet.name} | ${planet.getRotationPeriodLabel()} rotation | ${planet.surfaceTempMin}-${planet.surfaceTempMax} K surface range.`, 'Current landed body record. Full mineral details require a surface scan.'));
    }

    rows.push(this.createShipLogRow('007', 'MISSION', activeMissionCount > 0 ? 'ACTIVE' : 'QUIET', activeMissionCount > 0 ? `${activeMissionCount} accepted mission${activeMissionCount === 1 ? '' : 's'} in ship memory.` : 'No active contracts. Notice boards may hold new work at starbases.', 'Mission/notices integration point for the shipboard memory system.'));

    if (this.statusMessage) {
      rows.push(this.createShipLogRow('008', 'ALERT', /error|fail|cannot/i.test(this.statusMessage) ? 'CAUTION' : 'NOTE', this.statusMessage, 'Most recent bridge status line preserved for context.'));
    } else {
      rows.push(this.createShipLogRow('008', 'ALERT', 'CLEAR', 'No unresolved bridge alert.', 'Normal operations.'));
    }

    return rows;
  }

  private createShipLogRow(id: string, channel: string, state: string, entry: string, detail: string): TextTableRow {
    return {
      id: `log:${id}`,
      cells: [id, channel, state, entry],
      detail,
      disabled: true,
    };
  }

  private getShipPositionLogEntry(): string {
    switch (this.stateManager.state) {
      case 'hyperspace':
        return `Interstellar grid ${this.player.position.worldX},${this.player.position.worldY}; drift reference ${this.player.position.lastWorldMoveDx},${this.player.position.lastWorldMoveDy}.`;
      case 'system':
        return `System ${this.stateManager.currentSystem?.name ?? 'unknown'}; local ${formatDistanceAu(Math.hypot(this.player.position.systemX, this.player.position.systemY))} from barycentric datum.`;
      case 'planet':
        return `Landed ${this.stateManager.currentPlanet?.name ?? 'unknown'}; surface ${this.player.position.surfaceX},${this.player.position.surfaceY}.`;
      default:
        return `Mode ${this.stateManager.state}; position record held by local interface.`;
    }
  }

  private getShipLogSummary(): string {
    const alerts = this.statusMessage ? 'watch note' : 'nominal';
    const missionCount = Object.keys(this.activeMissions).length;
    return missionCount > 0 ? `${missionCount} mission${missionCount === 1 ? '' : 's'} | ${alerts}` : alerts;
  }

  private getJettisonMenuRows(): TextTableRow[] {
    const itemKey = this.shipMenuJettisonItemKey;
    const held = itemKey ? this.player.cargoHold.items[itemKey] || 0 : 0;
    const name = itemKey ? this.getTradeItemInfo(itemKey)?.name ?? itemKey : 'No cargo';
    if (!itemKey || held <= 0) {
      return [{ id: 'cancel', cells: ['Cancel', name, '--', 'Return to cargo manifest.'] }];
    }
    const rows: TextTableRow[] = [
      { id: '1', cells: ['1 unit', name, `${held - 1} left`, 'Vent one sealed unit through external bay.'] },
    ];
    if (held >= 10) rows.push({ id: '10', cells: ['10 units', name, `${held - 10} left`, 'Vent ten units. Confirm bay doors armed.'] });
    rows.push({ id: 'all', cells: ['ALL', name, '0 left', 'Purge the full cargo stack. No recovery beacon.'] });
    rows.push({ id: 'cancel', cells: ['Cancel', name, `${held} held`, 'Stand down ejector sequence.'] });
    return rows;
  }

  private formatGauge(value: number, max: number, width: number): string {
    const safeMax = Math.max(1, max);
    const ratio = Math.max(0, Math.min(1, value / safeMax));
    const filled = Math.round(ratio * width);
    return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
  }

  private getFuelStateLabel(): string {
    const ratio = this.player.resources.fuel / Math.max(1, this.player.resources.maxFuel);
    if (ratio <= 0) return 'Empty';
    if (ratio < 0.2) return 'Low';
    if (ratio < 0.5) return 'Reserve';
    return 'Ready';
  }

  private getCargoLoadLabel(cargoTotal: number): string {
    const ratio = cargoTotal / Math.max(1, this.player.cargoHold.capacity);
    if (cargoTotal <= 0) return 'Empty';
    if (ratio >= 1) return 'Full';
    if (ratio > 0.75) return 'Heavy';
    if (ratio > 0.35) return 'Loaded';
    return 'Light';
  }

  private getCrewHealthLabel(): string {
    if (this.player.crew.length === 0) return 'Uncrewed';
    const wounded = this.player.crew.filter((member) => member.hitPoints < member.maxHitPoints).length;
    if (wounded === 0) return 'All green';
    return `${wounded} wounded`;
  }

  private getShipOperatingState(): string {
    switch (this.stateManager.state) {
      case 'hyperspace':
        return 'Drift';
      case 'system':
        return this.approachTargetSignature ? 'Approach' : 'Local';
      case 'planet':
        return 'Landed';
      default:
        return 'Online';
    }
  }

  private getTargetClassLabel(target: NavigationTarget): string {
    if (target instanceof Planet) return 'Planet';
    if (target instanceof Starbase) return 'Starbase';
    return `Star ${target.id}`;
  }

  private getTargetShortName(target: NavigationTarget, system: SolarSystem | null): string {
    const baseName = system ? target.name.replace(`${system.name} `, '') : target.name;
    if (!(target instanceof Planet)) return baseName;
    const moonCount = target.moons?.length ?? 0;
    const moonLabel = moonCount === 1 ? '1 moon' : `${moonCount} moons`;
    const suffix = ` (${moonLabel})`;
    return `${baseName.slice(0, Math.max(0, 24 - suffix.length))}${suffix}`;
  }

  private formatBearing(dx: number, dy: number): string {
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'HERE';
    const horizontal = dx > 0 ? 'E' : dx < 0 ? 'W' : '';
    const vertical = dy > 0 ? 'S' : dy < 0 ? 'N' : '';
    return `${vertical}${horizontal}` || 'HERE';
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

  private getTargetRangeLabel(target: NavigationTarget): string {
    const coords = this.getTargetCoords(target);
    return formatDistanceAu(Math.hypot(coords.x - this.player.position.systemX, coords.y - this.player.position.systemY));
  }

  private getScannableNavigationTarget(target: NavigationTarget): ScanTarget {
    const system = this.stateManager.currentSystem;
    if (system && target instanceof Planet) {
      return system.getOrbitParentFor(target);
    }
    return target;
  }

  private getLocalSystemScanTarget(): ScanTarget | null {
    if (this.stateManager.state !== 'system') return null;
    const system = this.stateManager.currentSystem;
    if (!system) return null;

    const scanX = this.player.position.systemX;
    const scanY = this.player.position.systemY;
    const nearbyObject = system.getObjectNear(scanX, scanY);
    const scannableObject = system.getScannableObjectNear(scanX, scanY);
    const objectThreshold = CONFIG.LANDING_DISTANCE;
    const objectDistanceSq = nearbyObject
      ? this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY)
      : Infinity;
    const starThreshold = CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
    const nearbyStar = system.getStarNear(scanX, scanY, starThreshold);
    const starDistanceSq = nearbyStar
      ? this.player.distanceSqToSystemCoords(nearbyStar.systemX, nearbyStar.systemY)
      : Infinity;

    const objectScore = scannableObject ? objectDistanceSq / (objectThreshold * objectThreshold) : Infinity;
    const starScore = nearbyStar ? starDistanceSq / (starThreshold * starThreshold) : Infinity;
    if (nearbyStar && starScore <= objectScore) return nearbyStar;
    if (scannableObject && objectScore <= 1) return scannableObject;
    if (nearbyStar && starScore <= 1) return nearbyStar;
    return null;
  }

  private isTargetWithinScanRange(target: NavigationTarget): boolean {
    const coords = this.getTargetCoords(target);
    const multiplier = target instanceof Planet || target instanceof Starbase ? 1 : CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
    return this.player.distanceSqToSystemCoords(coords.x, coords.y) < (CONFIG.LANDING_DISTANCE * multiplier) ** 2;
  }

  private getTargetApproachDistance(target: NavigationTarget): number {
    return target instanceof Planet || target instanceof Starbase
      ? CONFIG.LANDING_DISTANCE
      : CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
  }

  private updateApproachAssist(_deltaTime: number): void {
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
    const desiredDistance = this.getTargetApproachDistance(target);
    if (distance <= desiredDistance) {
      this.approachTargetSignature = null;
      this.statusMessage = `Approach complete: ${this.getTargetName(target)}.`;
      return;
    }

    const step = Math.min(distance - desiredDistance, CONFIG.SYSTEM_MOVE_INCREMENT * this.getSystemCursorMoveSpeedMultiplier());
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
    } | Grav: ${planet.gravity.toFixed(2)}g | Rot: ${planet.getRotationPeriodLabel()} | Temp: ${currentTemp}K avg ${planet.surfaceTemp}K ${planet.surfaceTempMin}-${planet.surfaceTempMax}K`; // Show current temp
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

  private drawTravelObserveCursor(): void {
    const cursor = this.travelObserveCursor;
    if (!cursor || cursor.mode !== this.stateManager.state) return;
    const center = this.getTravelViewCenter();
    const x = center.x + cursor.dx;
    const y = center.y + cursor.dy;
    const cols = this.renderer.getGridCols();
    const rows = this.renderer.getGridRows();
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    const lit = Math.floor(performance.now() / 420) % 2 === 0;
    const fg = lit ? '#8CFFF0' : '#2F6F68';
    const bg = lit ? CONFIG.TRANSPARENT_COLOUR : CONFIG.DEFAULT_BG_COLOUR;
    if (y > 0) this.renderer.drawChar('^', x, y - 1, fg, bg);
    if (y < rows - 1) this.renderer.drawChar('v', x, y + 1, fg, bg);
    if (x > 0) this.renderer.drawChar('<', x - 1, y, fg, bg);
    if (x < cols - 1) this.renderer.drawChar('>', x + 1, y, fg, bg);
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
          this.drawTravelObserveCursor();
          break;
        case 'system':
          const system = this.stateManager.currentSystem;
          if (system) {
            const currentViewScale = this.getCurrentViewScale();
            this.renderer.drawSolarSystem(this.player, system, currentViewScale);
            this.drawTravelObserveCursor();
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
              this.renderer.drawPlanetSurface(this.player, planet, this.createSurfaceVehicleOverlayModel());
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

      if (this.targetMenuOpen) {
        this.renderer.drawTextModalTable(this.createTargetMenuModel());
      }

      if (this.shipMenuOpen) {
        this.renderer.drawTextModalTable(this.createShipMenuModel());
      }

      if (this.roverCargoOpen) {
        this.renderer.drawTextModalTable(this.createRoverCargoModel());
      }

      if (this.surfaceLegendOpen) {
        this.renderer.drawTextModalTable(this.createSurfaceLegendModel());
      }

      if (this.quantitySelector) {
        this.renderer.drawTextModalTable(createQuantitySelectorModel(this.quantitySelector));
      }

      if (this.jettisonConfirmation) {
        this.renderer.drawTextModalTable(this.createJettisonConfirmationModel());
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
    if (this.forceFullRender || directCanvasOverlayVisible || this.popupState !== 'inactive' || this.shipMenuOpen || this.roverCargoOpen || this.surfaceLegendOpen || this.quantitySelector || this.jettisonConfirmation) return false;
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
          this.player.terrainVehicle.deployed ? 'rover' : 'ship',
          this.player.terrainVehicle.available ? 'available' : 'lost',
          this.player.terrainVehicle.onFoot ? 'foot' : 'notfoot',
          this.player.terrainVehicle.moving ? 'moving' : 'stopped',
          this.player.terrainVehicle.shipSurfaceX,
          this.player.terrainVehicle.shipSurfaceY,
          this.roverMenuSelection,
          this.roverCargoOpen ? 'cargo' : 'nocargo',
          this.surfaceMapExpanded ? 'map' : 'local',
          this.surfaceLegendOpen ? 'legend' : 'nolegend',
          this.surfaceScanCursor ? `${this.surfaceScanCursor.dx},${this.surfaceScanCursor.dy}` : 'noscan',
          Math.floor(performance.now() / 450),
          this.player.terrainVehicle.fuel.toFixed(1),
          this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold),
          this.statusMessage,
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

    const roverState = !this.player.terrainVehicle.available
      ? 'lost'
      : this.player.terrainVehicle.onFoot
        ? 'on foot'
        : this.player.terrainVehicle.deployed
          ? 'disembarked'
          : 'embarked';
    const roverStatus = this.stateManager.state === 'planet'
      ? ` | Rover: ${roverState} ${this.player.terrainVehicle.fuel.toFixed(0)}/${this.player.terrainVehicle.maxFuel} fuel ${this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold)}/${this.player.terrainVehicle.cargoHold.capacity} m^3`
      : '';

    const commonStatus =
      this.popupState === 'active'
        ? '' // Don't show stats when popup is fully active
        : ` | Fuel: ${this.player.resources.fuel.toFixed(0)}/${
            this.player.resources.maxFuel
          } | Cargo: ${currentCargoTotal}/${
            this.player.cargoHold.capacity
          } | Cr: ${this.player.resources.credits.toLocaleString()}` + roverStatus + zoomLabel; // Append zoom label

    const finalStatus = this.statusMessage + commonStatus;
    const hasStarbase = this.stateManager.state === 'starbase';

    // Publish event for the status bar updater
    eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, { message: finalStatus, hasStarbase });

    const actions = this.getCurrentAvailableActions();
    eventManager.publish(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, {
      actions,
      primaryActionId: this.choosePrimaryAction(actions)?.id,
      targetName: this.getCommandStripTargetName(),
      commandBar: this.createCommandBarModel(actions),
    });
  }

  private createCommandBarModel(actions: AvailableAction[]): CommandBarModel {
    const state = this.stateManager.state;
    if (state === 'hyperspace') return this.createHyperspaceCommandBar(actions);
    if (state === 'system') return this.createSystemCommandBar(actions);
    if (state === 'planet') return this.createSurfaceCommandBar();
    return {
      context: state,
      targetName: this.getCommandStripTargetName(),
      primaryButtonId: this.choosePrimaryAction(actions)?.id,
      buttons: actions
        .filter((action) => action.enabled)
        .slice(0, 7)
        .map((action) => commandButton(action.id, action.label, action.action, { key: action.key })),
    };
  }

  private getSelectableTravelCommandButtons(): CommandBarButton[] {
    const model = this.stateManager.state === 'system'
      ? this.createSystemCommandBar(this.getCurrentAvailableActions(), false)
      : this.createHyperspaceCommandBar(this.getCurrentAvailableActions(), false);
    return [...(model.leftButtons ?? []), ...(model.buttons ?? []), ...(model.rightButtons ?? [])].filter((button) => button.enabled !== false);
  }

  private getTravelMoveCommandIndex(): number {
    const commands = this.getSelectableTravelCommandButtons();
    const moveIndex = commands.findIndex((button) => button.id === 'move');
    return moveIndex >= 0 ? moveIndex : 0;
  }

  private getDefaultTravelCommandIndex(): number {
    const commands = this.getSelectableTravelCommandButtons();
    const situationalIndex = commands.findIndex((button) => button.tone === 'green');
    return situationalIndex >= 0 ? situationalIndex : this.getTravelMoveCommandIndex();
  }

  private getSelectedTravelCommandId(): string {
    const commands = this.getSelectableTravelCommandButtons();
    this.travelCommandSelection = clampIndex(this.travelCommandSelection, commands.length);
    return commands[this.travelCommandSelection]?.id ?? 'move';
  }

  private activateRecommendedTravelCommand(): void {
    const model = this.stateManager.state === 'system'
      ? this.createSystemCommandBar(this.getCurrentAvailableActions(), false)
      : this.createHyperspaceCommandBar(this.getCurrentAvailableActions(), false);
    const commands = [...(model.leftButtons ?? []), ...model.buttons, ...(model.rightButtons ?? [])].filter((button) => button.enabled !== false);
    const recommended = commands.find((button) => button.id === model.primaryButtonId) ?? commands[this.travelCommandSelection];
    if (recommended) this.executeCommandBarAction(recommended.action);
    this.forceFullRender = true;
  }

  private createHyperspaceCommandBar(actions: AvailableAction[], includeSelection: boolean = true): CommandBarModel {
    const enter = actions.find((action) => action.id === 'enter-system');
    return {
      context: 'interstellar',
      targetName: this.getCommandStripTargetName(),
      primaryButtonId: enter?.id,
      selectedButtonId: includeSelection && !this.travelCommandMoving ? this.getSelectedTravelCommandId() : undefined,
      leftButtons: enter
        ? [commandButton(enter.id, enter.label, enter.action, { key: enter.key, tone: 'green', detail: enter.targetName ? `Enter ${enter.targetName}` : 'Enter navigable contact' })]
        : [],
      buttons: [
        commandButton('move', 'Move', 'TRAVEL_MOVE', { key: 'Arrows', detail: this.travelCommandMoving ? 'Movement engaged. Enter, Space, or Esc pauses command movement.' : 'Resume interstellar movement.' }),
        commandButton('scan-local', 'Scan', 'SCAN_SYSTEM_OBJECT', { key: CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT, detail: 'Scan the stellar or planemo contact at current coordinates.' }),
        commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', { key: CONFIG.KEY_BINDINGS.SHIP_MENU, detail: 'Open ship operations.' }),
        commandButton('observe', 'Observe', 'OBSERVE_HYPERSPACE', { detail: 'Open a reticle for long-range contact observation.' }),
      ],
      rightButtons: [commandButton('red-reserved', 'Alert', 'RED_RESERVED', { tone: 'red', enabled: false, detail: 'Reserved for future emergency commands.' })],
    };
  }

  private createSystemCommandBar(actions: AvailableAction[], includeSelection: boolean = true): CommandBarModel {
    const primaryTravel =
      actions.find((action) => action.id === 'land-dock') ??
      actions.find((action) => action.id === 'leave-system');
    return {
      context: 'planetary',
      targetName: this.getCommandStripTargetName(),
      primaryButtonId: primaryTravel?.id,
      selectedButtonId: includeSelection && !this.travelCommandMoving ? this.getSelectedTravelCommandId() : undefined,
      leftButtons: primaryTravel
        ? [commandButton(primaryTravel.id, primaryTravel.label, primaryTravel.action, { key: primaryTravel.key, tone: 'green', detail: primaryTravel.targetName ? `${primaryTravel.label} ${primaryTravel.targetName}` : primaryTravel.label })]
        : [],
      buttons: [
        commandButton('move', 'Move', 'TRAVEL_MOVE', { key: 'Arrows', detail: this.travelCommandMoving ? 'Movement engaged. Enter, Space, or Esc pauses command movement.' : 'Resume planetary movement.' }),
        commandButton('scan-object', 'Scan', 'SCAN_SYSTEM_OBJECT', { key: CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT, detail: 'Scan a nearby star, planet, starbase, or selected close target.' }),
        commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', { key: CONFIG.KEY_BINDINGS.SHIP_MENU, detail: 'Open ship operations.' }),
        commandButton('observe', 'Observe', 'OBSERVE_SYSTEM_TARGET', { detail: 'Open a reticle and scan the selected local body.' }),
        commandButton('target-menu', 'Targets', 'TARGET_MENU', { key: CONFIG.KEY_BINDINGS.TARGET_MENU, detail: 'Open local navigation target list.' }),
      ],
      rightButtons: [commandButton('red-reserved', 'Alert', 'RED_RESERVED', { tone: 'red', enabled: false, detail: 'Reserved for future emergency commands.' })],
    };
  }

  private createSurfaceCommandBar(): CommandBarModel {
    const rover = this.player.terrainVehicle;
    if (!rover.deployed && !rover.onFoot) {
      return {
        context: 'landed ship',
        targetName: this.stateManager.currentPlanet?.name,
        buttons: [
          commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', { key: CONFIG.KEY_BINDINGS.SHIP_MENU, detail: 'Open landed ship operations.' }),
          commandButton('scan-surface', 'Scan', 'SCAN', { key: CONFIG.KEY_BINDINGS.SCAN, detail: 'Begin a local surface scan.' }),
        ],
        rightButtons: [commandButton('red-reserved', 'Alert', 'RED_RESERVED', { tone: 'red', enabled: false, detail: 'Reserved for future emergency commands.' })],
      };
    }

    const cargo = this.cargoSystem.getTotalUnits(rover.cargoHold);
    return {
      context: 'terrain',
      targetName: this.stateManager.currentPlanet?.name,
      primaryButtonId: this.isAtParkedShip() ? 'embark' : undefined,
      selectedButtonId: rover.moving ? undefined : this.getSurfaceVehicleMenuItems()[this.roverMenuSelection]?.id,
      leftButtons: this.isAtParkedShip()
        ? [commandButton('embark', 'Embark', 'ROVER_EMBARK', { tone: 'green', detail: 'Board the parked ship.' })]
        : [],
      buttons: [
        commandButton('map', 'Map', 'ROVER_MAP', { detail: 'Toggle expanded terrain map.' }),
        commandButton('move', 'Move', 'ROVER_MOVE', { detail: rover.fuel > 0 ? 'Start terrain vehicle movement.' : 'Terrain vehicle fuel exhausted.', enabled: rover.fuel > 0 }),
        commandButton('cargo', 'Cargo', 'ROVER_CARGO', { detail: `Terrain vehicle cargo ${cargo}/${rover.cargoHold.capacity} m^3.` }),
        commandButton('mine', 'Mine', 'ROVER_MINE', { key: CONFIG.KEY_BINDINGS.MINE, detail: 'Mine the local deposit if present.' }),
        commandButton('scan', 'Scan', 'ROVER_SCAN', { key: CONFIG.KEY_BINDINGS.SCAN, detail: 'Move the surface scan cursor.' }),
        commandButton('icon', 'Icon', 'ROVER_ICON', { detail: 'Open the surface icon legend.' }),
      ],
      rightButtons: [commandButton('red-reserved', 'Alert', 'RED_RESERVED', { tone: 'red', enabled: false, detail: 'Reserved for future emergency commands.' })],
    };
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
      const currentProps = this.systemDataGenerator.getSystemMapProperties(this.player.position.worldX, this.player.position.worldY);
      const currentPhenomenon = this.systemDataGenerator.getDeepSpacePhenomenonProperties(this.player.position.worldX, this.player.position.worldY);
      const isNavigableContact = currentProps.exists || Boolean(currentPhenomenon?.exists && currentPhenomenon.type === 'rogue-planet');
      const peekedSystem = isNavigableContact
        ? this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY)
        : null;
      return createAvailableActions({
        state,
        player: this.player,
        system: null,
        planet: null,
        starbase: null,
        isNearHyperspaceSystem: isNavigableContact,
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
      rotationPhase: this.orbitElapsedSeconds * 0.06,
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
      detailLineCount: this.starbaseSectionId === 'overview' ? 2 : 1,
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
      this.openBuyQuantitySelector(row.id);
      return;
    }
    if (this.starbaseSectionId === 'sell') {
      this.tradeSelectionIndex = Math.max(0, market.findIndex((item) => item.itemKey === row.id));
      this.openSellQuantitySelector(row.id);
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
    if (this.starbaseSectionId === 'crew') {
      this.activateCrewSelection(starbase, row);
      return;
    }
    if (this.starbaseSectionId === 'shipyard' && row.id === 'terrain-vehicle') {
      this.purchaseTerrainVehicle();
      return;
    }
    if (this.starbaseSectionId === 'shipyard' && row.id.startsWith('shipyard:')) {
      this.purchaseShipyardUpgrade(row.id);
      return;
    }
    this.starbaseAlert = row.detail || `${row.cells[0]} selected.`;
  }

  private purchaseShipyardUpgrade(optionId: string): void {
    const starbaseName = this.stateManager.currentStarbase?.name ?? 'default shipyard';
    const profile = getStarbaseShipyardProfile(starbaseName);
    const option = createShipyardUpgradeOptions(this.player.ship, profile).find((candidate) => candidate.id === optionId);
    if (!option) {
      this.starbaseAlert = 'Shipyard order unavailable.';
      this.statusMessage = this.starbaseAlert;
      return;
    }
    if (option.disabled) {
      this.starbaseAlert = option.detail;
      this.statusMessage = this.starbaseAlert;
      return;
    }
    if (this.player.resources.credits < option.cost) {
      this.starbaseAlert = `Insufficient credits for ${option.label}. Required ${option.cost.toLocaleString()} Cr.`;
      this.statusMessage = this.starbaseAlert;
      return;
    }
    this.player.resources.credits -= option.cost;
    this.starbaseAlert = `${installShipyardUpgrade(this.player.ship, optionId)} Cost ${option.cost.toLocaleString()} Cr.`;
    this.statusMessage = this.starbaseAlert;
    this.player.cargoHold.capacity = getShipCargoCapacity(this.player.ship);
  }

  private purchaseTerrainVehicle(): void {
    if (this.player.terrainVehicle.available) {
      this.starbaseAlert = 'Terrain vehicle already aboard.';
      this.statusMessage = this.starbaseAlert;
      return;
    }
    const cost = CONFIG.TERRAIN_VEHICLE_REPLACEMENT_COST;
    if (this.player.resources.credits < cost) {
      this.starbaseAlert = `Insufficient credits for terrain vehicle replacement. Required ${cost.toLocaleString()} Cr.`;
      this.statusMessage = this.starbaseAlert;
      return;
    }
    this.player.resources.credits -= cost;
    this.player.terrainVehicle.available = true;
    this.player.terrainVehicle.deployed = false;
    this.player.terrainVehicle.moving = false;
    this.player.terrainVehicle.onFoot = false;
    this.player.terrainVehicle.fuel = this.player.terrainVehicle.maxFuel;
    this.starbaseAlert = `Purchased replacement terrain vehicle for ${cost.toLocaleString()} Cr.`;
    this.statusMessage = this.starbaseAlert;
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: -cost,
    });
  }

  private activateCrewSelection(starbase: Starbase, row: StarbaseTableRow): void {
    if (row.disabled) {
      this.starbaseAlert = row.detail || 'Crew record unavailable.';
      return;
    }
    if (row.id.startsWith('hire:')) {
      const recruitId = row.id.slice('hire:'.length);
      const recruit = this.getRecruitCandidates(starbase).find((candidate) => candidate.id === recruitId);
      if (!recruit) {
        this.starbaseAlert = 'Recruit no longer available.';
        return;
      }
      if (this.player.resources.credits < recruit.hireCost) {
        this.starbaseAlert = `Insufficient credits to hire ${recruit.name}. Required ${recruit.hireCost} Cr.`;
        return;
      }
      if (this.player.crew.some((member) => member.id === recruit.id)) {
        this.starbaseAlert = `${recruit.name} is already aboard.`;
        return;
      }
      this.player.resources.credits -= recruit.hireCost;
      this.player.crew.push({ ...recruit, skills: { ...recruit.skills }, skillCaps: { ...recruit.skillCaps } });
      this.starbaseAlert = `Hired ${recruit.name}, ${recruit.role}.`;
      this.statusMessage = this.starbaseAlert;
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: -recruit.hireCost,
      });
      return;
    }
    if (row.id.startsWith('train:')) {
      const [, memberId, skill] = row.id.split(':');
      const member = this.player.crew.find((candidate) => candidate.id === memberId);
      if (!member || !CREW_SKILLS.includes(skill as CrewSkill)) {
        this.starbaseAlert = 'Training record unavailable.';
        return;
      }
      const result = trainCrewSkill(member, skill as CrewSkill);
      this.starbaseAlert = result.message;
      this.statusMessage = result.message;
      return;
    }
    this.starbaseAlert = row.detail || 'Crew record selected.';
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
        return { title: 'Starbase Operations', subtitle: baseSubtitle, columns: ['PORT SECTION', 'STATUS'], widths: [24, 18] };
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
        return { title: 'Shipyard', subtitle: 'Superstructure slots, installed modules, and refit orders.', columns: ['BAY', 'QUOTE', 'ETA', 'WORK ORDER'], widths: [22, 10, 8, 48] };
      case 'crew':
        return { title: 'Crew Roster', subtitle: 'Recruitment, personnel records, and starbase training.', columns: ['NAME', 'ROLE', 'COST/PTS', 'PROFILE'], widths: [20, 16, 9, 39] };
    }
  }

  private getStarbaseRows(starbase: Starbase, sectionId: StarbaseSectionId): StarbaseTableRow[] {
    const market = this.getTradeDepotManifest(starbase.name);
    switch (sectionId) {
      case 'overview':
        return STARBASE_SECTIONS.filter((section) => section.id !== 'overview').map((section) => ({
          id: section.id,
          cells: [section.label, this.getSectionStatus(section.id)],
          detail: `${this.getSectionSummary(section.id)} Enter opens ${section.label}.`,
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
          { id: 'refuel', cells: ['D/He3 reactor refuel', `${(1 / CONFIG.FUEL_PER_CREDIT).toFixed(2)}/fuel`, 'Available', 'Uses carried He3 + deuterium first, then station fuel stores.'] },
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
        const profile = getStarbaseShipyardProfile(starbase.name);
        return [
          ...this.getShipyardRefitRows(starbase),
          { id: 'terrain-vehicle', cells: ['Landing bay rover', `${CONFIG.TERRAIN_VEHICLE_REPLACEMENT_COST.toLocaleString()} Cr`, 'Now', this.player.terrainVehicle.available ? 'Vehicle bay occupied.' : 'Purchase replacement rover and surface kit.'], detail: 'Replacement includes fuel cell, cargo bay, scanner mast, and recovery transponder.', disabled: this.player.terrainVehicle.available },
          ...createShipyardUpgradeOptions(this.player.ship, profile).map((option) => ({
            id: option.id,
            cells: [option.label, `${option.cost.toLocaleString()} Cr`, option.eta, option.workOrder],
            detail: option.detail,
            disabled: option.disabled,
          })),
          { id: 's1', cells: ['Superstructure refit', 'TBD', '--', `${this.player.ship.superstructure.name} replacement path reserved.`], detail: 'Stub: future superstructure replacement and expansion refits. No frame swap is available yet.', disabled: true },
          { id: 's2', cells: ['Survey mast overhaul', '1,250 Cr', '5h', 'Improved scan reach placeholder.'], detail: 'Stub: scanner upgrade path.', disabled: true },
        ];
      case 'crew':
        return this.getCrewRows(starbase);
    }
  }

  private getCargoRows(): StarbaseTableRow[] {
    return this.getCargoRowsForHold(this.player.cargoHold.items, 'ship');
  }

  private getShipyardRefitRows(starbase: Starbase): StarbaseTableRow[] {
    const ship = this.player.ship;
    const stats = getShipDerivedStats(ship);
    const profile = getStarbaseShipyardProfile(starbase.name);
    const repairCost = getShipRepairCost(ship);
    const shieldState = ship.shieldClass > 0 ? `Class ${ship.shieldClass}; rating ${stats.shieldRating}` : 'Empty shield mount; classes 1-5 available.';
    const laserState = ship.laserClass > 0 ? `Class ${ship.laserClass}; output ${stats.laserRating}` : 'Empty laser hardpoint; classes 1-5 available.';
    return [
      {
        id: 'refit:yard',
        cells: ['Yard profile', '--', '--', `${profile.label}; shields C${profile.maxShieldClass}, lasers C${profile.maxLaserClass}, repairs ${profile.repairQuality}`],
        detail: `Station availability is local: missiles ${profile.sellsMissiles ? 'stocked' : 'not stocked'}, cargo pods ${profile.sellsCargoPods ? 'stocked' : 'not stocked'}.`,
        disabled: true,
      },
      {
        id: 'refit:frame',
        cells: ['Frame survey', '--', '--', `${ship.superstructure.name}; fitted load ${stats.fittedLoadPercent}%`],
        detail: `${ship.superstructure.engineMounts} engine, ${ship.superstructure.shieldMounts} shield, ${ship.superstructure.laserMounts} laser, ${ship.superstructure.missileBayMounts} missile, ${ship.superstructure.specialPurposeBays} special, ${ship.superstructure.probeBays} probe, ${ship.superstructure.cargoBays} cargo bays.`,
        disabled: true,
      },
      {
        id: 'refit:engine',
        cells: ['Engine mount', '--', '--', `Class ${ship.engineClass}; drive efficiency ${stats.driveEfficiencyPercent}%`],
        detail: 'Primary drive is fitted. Future engine refits can use this slot without changing the superstructure.',
        disabled: true,
      },
      {
        id: 'refit:damage',
        cells: ['Damage control', repairCost > 0 ? `${repairCost.toLocaleString()} Cr` : '--', repairCost > 0 ? 'Work' : '--', getShipDamageSummary(ship)],
        detail: repairCost > 0 ? 'Enter the damage repair order below to restore hull and damaged subsystems.' : 'Hull and fitted modules are reading nominal.',
        disabled: true,
      },
      {
        id: 'refit:shield',
        cells: ['Shield mount', 'See below', '--', shieldState],
        detail: 'One shield generator mount. Installed classes supersede lower class generators.',
        disabled: true,
      },
      {
        id: 'refit:laser',
        cells: ['Laser hardpoint', 'See below', '--', laserState],
        detail: 'One ship laser hardpoint. Installed classes supersede lower class emitters.',
        disabled: true,
      },
      {
        id: 'refit:missiles',
        cells: ['Missile bay', `${NUCLEAR_MISSILE_COST.toLocaleString()} Cr`, 'Now', `${ship.missileCount}/${stats.missileCapacity} nuclear missiles loaded (${stats.missileLoadPercent}%)`],
        detail: 'Existing missile bay magazine accepts nuclear-tipped missiles. Enter the missile row below to load one.',
        disabled: true,
      },
      {
        id: 'refit:cargo',
        cells: ['Cargo bays', `${CARGO_POD_COST.toLocaleString()} Cr`, '2h', `${ship.cargoPodsInstalled}/${ship.superstructure.cargoBays} pods; ${stats.cargoCapacity} m^3 capacity`],
        detail: `${stats.emptyCargoBays} empty cargo bays remain. Each modular cargo pod adds ${ship.cargoPodCapacity} m^3.`,
        disabled: true,
      },
      {
        id: 'refit:special',
        cells: ['Special purpose bays', 'TBD', '--', `${ship.specialBaysOccupied}/${stats.specialBayCapacity} occupied; ${stats.emptySpecialPurposeBays} reserved`],
        detail: 'Future mission labs, repair workshops, medical systems, signal analyzers, or processors can live here.',
        disabled: true,
      },
      {
        id: 'refit:probe',
        cells: ['Probe bays', 'TBD', '--', `${ship.probeBaysOccupied}/${stats.probeCapacity} occupied; ${stats.emptyProbeBays} empty`],
        detail: 'Probe bay control exists, but probe construction and launch orders are not online yet.',
        disabled: true,
      },
      {
        id: 'refit:landing',
        cells: ['Landing bay', '--', '--', `${stats.landingBayCapacity} bay; ${this.player.terrainVehicle.available ? 'terrain vehicle secured' : 'vehicle missing'}`],
        detail: 'Landing bay supports the surface vehicle and transfer lock for planetside operations.',
        disabled: true,
      },
    ];
  }

  private getCargoRowsForHold(items: Record<string, number>, source: 'ship' | 'rover'): StarbaseTableRow[] {
    const cargoEntries = Object.entries(items).filter(([, amount]) => amount > 0);
    if (cargoEntries.length === 0) {
      const label = source === 'rover' ? 'Rover cargo empty' : 'Cargo hold empty';
      return [{ id: `${source}:empty`, cells: [label, '0', '0', 'N/A'], detail: source === 'rover' ? 'Surface vehicle carries recovered material until it docks.' : 'Mine or buy cargo to fill the manifest.', disabled: true }];
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
    if (sectionId === 'crew') {
      const points = this.player.crew.reduce((sum, member) => sum + member.trainingPoints, 0);
      return points > 0 ? `${points} Training` : `${this.player.crew.length} Aboard`;
    }
    if (sectionId === 'shipyard') return 'Refit';
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
      shipyard: 'Buy missiles, cargo pods, shields, lasers, and future refits.',
      crew: 'Hire crew and assign training points.',
    };
    return summaries[sectionId];
  }

  private getCrewRows(starbase: Starbase): StarbaseTableRow[] {
    const rows: StarbaseTableRow[] = [];
    rows.push({
      id: 'crew-summary',
      cells: [
        `${this.player.crew.length} aboard`,
        'Ship Company',
        `${this.player.crew.reduce((sum, member) => sum + member.trainingPoints, 0)} pts`,
        `Best Nav ${getBestCrewSkill(this.player.crew, 'navigation')}  Astro ${getBestCrewSkill(this.player.crew, 'astroscience')}  Med ${getBestCrewSkill(this.player.crew, 'medicine')}`,
      ],
      detail: `Crew totals: Nav ${getCrewSkillTotal(this.player.crew, 'navigation')}, Astro ${getCrewSkillTotal(this.player.crew, 'astroscience')}, Comms ${getCrewSkillTotal(this.player.crew, 'communication')}, Med ${getCrewSkillTotal(this.player.crew, 'medicine')}.`,
      disabled: true,
    });

    this.player.crew.forEach((member) => {
      rows.push({
        id: `member:${member.id}`,
        cells: [
          member.name,
          `${member.role} L${member.level}`,
          `${member.trainingPoints} pts`,
          `HP ${member.hitPoints}/${member.maxHitPoints} Dur ${member.durability} ${formatTopSkills(member)}`,
        ],
        detail: `Human learning caps currently 10. XP ${member.experience}. Select training rows below to spend points.`,
        disabled: true,
      });
      CREW_SKILLS.filter((skill) => member.trainingPoints > 0 && member.skills[skill] < member.skillCaps[skill])
        .slice(0, 4)
        .forEach((skill) => {
          rows.push({
            id: `train:${member.id}:${skill}`,
            cells: [
              `  Train ${CREW_SKILL_LABELS[skill]}`,
              member.name.slice(0, 16),
              '1 pt',
              `${CREW_SKILL_LABELS[skill]} ${member.skills[skill]} -> ${member.skills[skill] + 1}`,
            ],
            detail: `Spend one training point for ${member.name}. Training is only assigned while docked.`,
          });
        });
    });

    this.getRecruitCandidates(starbase).forEach((candidate) => {
      const hired = this.player.crew.some((member) => member.id === candidate.id);
      rows.push({
        id: `hire:${candidate.id}`,
        cells: [
          candidate.name,
          `${candidate.role} L${candidate.level}`,
          `${candidate.hireCost} Cr`,
          `HP ${candidate.hitPoints}/${candidate.maxHitPoints} Dur ${candidate.durability} ${formatTopSkills(candidate)}`,
        ],
        detail: hired
          ? `${candidate.name} is already aboard.`
          : `Hire ${candidate.name}. Salary estimate ${candidate.salary} Cr per port cycle when upkeep is implemented.`,
        disabled: hired,
      });
    });

    return rows;
  }

  private getRecruitCandidates(starbase: Starbase): CrewMember[] {
    return generateRecruitCandidates(starbase.name, this.gameSeedPRNG.getInitialSeed());
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
      'FUSION_FUEL_MIX',
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
      const unitsToBuy = this.getDepotPurchaseLimit(item.itemKey, Math.min(item.units, freeCargo));
      const totalCost = unitsToBuy * item.buyPrice;
      if (unitsToBuy > 0 && this.player.resources.credits >= totalCost) {
        const purchase = this.addPurchasedDepotCargo(item.itemKey, unitsToBuy);
        const added = purchase.added;
        this.player.resources.credits -= added * item.buyPrice;
        eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, { elementKey: item.itemKey, amount: added, items: purchase.addedItems });
        eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
          newCredits: this.player.resources.credits,
          amountChanged: -added * item.buyPrice,
        });
        return `Purchased ${this.formatPurchasedDepotCargo(item.itemKey, purchase.addedItems)} for ${added * item.buyPrice} Cr.`;
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

  private getDepotPurchaseLimit(itemKey: string, rawLimit: number): number {
    const limit = Math.max(0, Math.floor(rawLimit));
    if (itemKey !== 'FUSION_FUEL_MIX') return limit;
    return Math.floor(limit / 2) * 2;
  }

  private addPurchasedDepotCargo(itemKey: string, amount: number): CargoAddResult {
    const requested = Math.max(0, Math.floor(amount));
    if (requested <= 0) return { added: 0, addedItems: {} };
    if (itemKey !== 'FUSION_FUEL_MIX') {
      const added = this.cargoSystem.addItem(this.player.cargoHold, itemKey, requested);
      return { added, addedItems: added > 0 ? { [itemKey]: added } : {} };
    }

    const mixUnits = Math.floor(requested / 2) * 2;
    if (mixUnits <= 0) return { added: 0, addedItems: {} };
    const heliumUnits = mixUnits / 2;
    const deuteriumUnits = mixUnits / 2;
    const addedHelium = this.cargoSystem.addItem(this.player.cargoHold, 'HELIUM_3', heliumUnits);
    const addedDeuterium = this.cargoSystem.addItem(this.player.cargoHold, 'DEUTERIUM_PELLETS', deuteriumUnits);
    const addedItems: Record<string, number> = {};
    if (addedHelium > 0) addedItems.HELIUM_3 = addedHelium;
    if (addedDeuterium > 0) addedItems.DEUTERIUM_PELLETS = addedDeuterium;
    return { added: addedHelium + addedDeuterium, addedItems };
  }

  private formatPurchasedDepotCargo(itemKey: string, addedItems: Record<string, number>): string {
    if (itemKey === 'FUSION_FUEL_MIX') {
      const helium = addedItems.HELIUM_3 || 0;
      const deuterium = addedItems.DEUTERIUM_PELLETS || 0;
      return `${helium} m^3 Helium-3 and ${deuterium} m^3 Deuterium`;
    }
    const [addedKey, amount] = Object.entries(addedItems)[0] ?? [itemKey, 0];
    const info = this.getTradeItemInfo(addedKey);
    return `${amount} m^3 ${info?.name ?? addedKey}`;
  }

  private openBuyQuantitySelector(itemKey: string): void {
    const item = this.getTradeDepotManifest(this.stateManager.currentStarbase?.name ?? '').find((candidate) => candidate.itemKey === itemKey);
    if (!item) {
      this.starbaseAlert = 'Depot item unavailable.';
      return;
    }
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
    const max = this.getDepotPurchaseLimit(item.itemKey, Math.min(item.units, freeCargo, affordableUnits));
    if (freeCargo <= 0) {
      this.starbaseAlert = 'Trade depot: cargo hold is full.';
      this.statusMessage = this.starbaseAlert;
      return;
    }
    if (max <= 0) {
      this.starbaseAlert = `Insufficient credits for ${item.name}.`;
      this.statusMessage = this.starbaseAlert;
      return;
    }
    this.openQuantitySelector(createQuantitySelector({
      title: 'Buy Cargo',
      subject: `${item.name} | ${item.buyPrice} Cr/m^3`,
      detail: `${max * item.buyPrice} Cr max spend`,
      unitLabel: 'm^3',
      max,
      value: max,
      min: item.itemKey === 'FUSION_FUEL_MIX' ? 2 : 1,
      step: item.itemKey === 'FUSION_FUEL_MIX' ? 2 : undefined,
      context: { type: 'buy', itemKey },
    }));
  }

  private openSellQuantitySelector(itemKey: string): void {
    const item = this.getTradeDepotManifest(this.stateManager.currentStarbase?.name ?? '').find((candidate) => candidate.itemKey === itemKey);
    const held = this.player.cargoHold.items[itemKey] || 0;
    const name = item?.name ?? this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    if (held <= 0) {
      this.starbaseAlert = `No ${name} in cargo.`;
      this.statusMessage = this.starbaseAlert;
      return;
    }
    this.openQuantitySelector(createQuantitySelector({
      title: 'Sell Cargo',
      subject: `${name} | ${item?.sellPrice ?? 1} Cr/m^3`,
      detail: `${held * (item?.sellPrice ?? 1)} Cr max return`,
      unitLabel: 'm^3',
      max: held,
      value: held,
      context: { type: 'sell', itemKey },
    }));
  }

  private buyDepotItem(itemKey: string, amount: number): string {
    const item = this.getTradeDepotManifest(this.stateManager.currentStarbase?.name ?? '').find((candidate) => candidate.itemKey === itemKey);
    if (!item) return 'Depot item unavailable.';
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
    const unitsToBuy = this.getDepotPurchaseLimit(item.itemKey, Math.min(item.units, freeCargo, affordableUnits, Math.max(1, Math.floor(amount))));
    if (freeCargo <= 0) return 'Trade depot: cargo hold is full.';
    if (unitsToBuy <= 0) return `Insufficient credits for ${item.name}.`;

    const purchase = this.addPurchasedDepotCargo(item.itemKey, unitsToBuy);
    const added = purchase.added;
    const cost = added * item.buyPrice;
    this.player.resources.credits -= cost;
    eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, { elementKey: item.itemKey, amount: added, items: purchase.addedItems });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: -cost,
    });
    return `Bought ${this.formatPurchasedDepotCargo(item.itemKey, purchase.addedItems)} for ${cost} Cr.`;
  }

  private sellDepotItem(itemKey: string, amount: number): string {
    const item = this.getTradeDepotManifest(this.stateManager.currentStarbase?.name ?? '').find((candidate) => candidate.itemKey === itemKey);
    if (!item) return 'Depot item unavailable.';
    const held = this.player.cargoHold.items[item.itemKey] || 0;
    const unitsToSell = Math.min(held, Math.max(1, Math.floor(amount)));
    if (unitsToSell <= 0) return `No ${item.name} in cargo.`;

    const removed = this.cargoSystem.removeItem(this.player.cargoHold, item.itemKey, unitsToSell);
    const creditsEarned = removed * item.sellPrice;
    this.player.resources.credits += creditsEarned;
    eventManager.publish(GameEvents.PLAYER_CARGO_SOLD, {
      itemsSold: { [item.itemKey]: removed },
      creditsEarned,
      newCredits: this.player.resources.credits,
    });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: creditsEarned,
    });
    return `Sold ${removed} m^3 ${item.name} for ${creditsEarned} Cr.`;
  }

  private buySelectedDepotItem(market: TradeDepotItem[]): string {
    const item = market[this.tradeSelectionIndex % market.length];
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    if (freeCargo <= 0) return 'Trade depot: cargo hold is full.';

    const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
    const unitsToBuy = this.getDepotPurchaseLimit(item.itemKey, Math.min(item.units, freeCargo, affordableUnits));
    if (unitsToBuy <= 0) return `Insufficient credits for ${item.name}.`;

    const purchase = this.addPurchasedDepotCargo(item.itemKey, unitsToBuy);
    const added = purchase.added;
    const cost = added * item.buyPrice;
    this.player.resources.credits -= cost;
    eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, { elementKey: item.itemKey, amount: added, items: purchase.addedItems });
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: -cost,
    });
    return `Bought ${this.formatPurchasedDepotCargo(item.itemKey, purchase.addedItems)} for ${cost} Cr.`;
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

  private getAvailableDeuteriumCargo(): number {
    return (this.player.cargoHold.items.DEUTERIUM || 0) + (this.player.cargoHold.items.DEUTERIUM_PELLETS || 0);
  }

  private consumeFusionFuelCargo(pairUnits: number): { helium: number; deuterium: number; fuel: number } {
    const pairs = Math.max(0, Math.floor(pairUnits));
    if (pairs <= 0) return { helium: 0, deuterium: 0, fuel: 0 };
    const helium = this.cargoSystem.removeItem(this.player.cargoHold, 'HELIUM_3', pairs);
    let deuteriumNeeded = helium;
    let deuterium = this.cargoSystem.removeItem(this.player.cargoHold, 'DEUTERIUM', deuteriumNeeded);
    deuteriumNeeded -= deuterium;
    if (deuteriumNeeded > 0) {
      deuterium += this.cargoSystem.removeItem(this.player.cargoHold, 'DEUTERIUM_PELLETS', deuteriumNeeded);
    }
    return { helium, deuterium, fuel: Math.min(helium, deuterium) * 40 };
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

    const oldFuel = this.player.resources.fuel;
    const cargoFuelPairs = Math.min(
      this.player.cargoHold.items.HELIUM_3 || 0,
      this.getAvailableDeuteriumCargo(),
      Math.ceil(fuelNeeded / 40)
    );
    const consumed = this.consumeFusionFuelCargo(cargoFuelPairs);
    if (consumed.fuel > 0) {
      this.player.addFuel(consumed.fuel);
      this.player.awardCrewExperience('engineering', Math.max(2, Math.floor(consumed.fuel / 80)));
    }

    const remainingFuelNeeded = this.player.resources.maxFuel - this.player.resources.fuel;
    if (remainingFuelNeeded <= 0) {
      this.statusMessage = `Loaded ${consumed.helium} m^3 He3 and ${consumed.deuterium} m^3 deuterium into the reactor. Tank full.`;
      eventManager.publish(GameEvents.PLAYER_FUEL_CHANGED, {
        newFuel: this.player.resources.fuel,
        maxFuel: this.player.resources.maxFuel,
        amountChanged: this.player.resources.fuel - oldFuel,
      });
      this._publishStatusUpdate();
      return;
    }

    const creditsPerUnit = 1 / CONFIG.FUEL_PER_CREDIT;
    const maxAffordableFuel = this.player.resources.credits * CONFIG.FUEL_PER_CREDIT;
    const fuelToBuy = Math.floor(Math.min(remainingFuelNeeded, maxAffordableFuel));
    const cost = Math.ceil(fuelToBuy * creditsPerUnit); // Use ceil to ensure player pays enough

    if (fuelToBuy <= 0 || this.player.resources.credits < cost) {
      this.statusMessage = consumed.fuel > 0
        ? `Loaded cargo fuel, but credits are insufficient for station He3/deuterium top-off.`
        : STATUS_MESSAGES.STARBASE_REFUEL_FAIL_CREDITS(creditsPerUnit, this.player.resources.credits);
      eventManager.publish(GameEvents.ACTION_FAILED, { action: 'REFUEL', reason: 'Insufficient credits' });
      if (consumed.fuel > 0) {
        eventManager.publish(GameEvents.PLAYER_FUEL_CHANGED, {
          newFuel: this.player.resources.fuel,
          maxFuel: this.player.resources.maxFuel,
          amountChanged: this.player.resources.fuel - oldFuel,
        });
      }
    } else {
      this.player.resources.credits -= cost;
      this.player.addFuel(fuelToBuy); // Use player method for clamping and logging
      this.player.awardCrewExperience('engineering', Math.max(2, Math.floor(fuelToBuy / 50)));
      const cargoPrefix = consumed.fuel > 0 ? `Loaded ${consumed.helium} m^3 He3 + ${consumed.deuterium} m^3 deuterium, then ` : '';
      this.statusMessage = `${cargoPrefix}purchased ${fuelToBuy} D/He3 reactor fuel for ${cost} Cr.`;
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
