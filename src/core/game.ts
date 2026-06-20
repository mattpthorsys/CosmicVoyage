import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { AU_IN_METERS } from '../constants/physics';
import { ELEMENTS } from '../constants/resources';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { STATUS_MESSAGES } from '../constants/messages';
import { GLYPHS } from '../constants/visual';
import { logger } from '../utils/logger';
import { InputManager } from './input_manager';
import { GameStateManager, GameState } from './game_state_manager';
import { ActionProcessor, ActionProcessResult } from './action_processor';
import { Planet } from '../entities/planet';
import { readReadySurfaceData } from '../entities/planet/surface_data';
import { Starbase } from '../entities/starbase';
import { SolarSystem } from '../entities/solar_system';
import { eventManager, GameEvents, GameStateChangedEvent, Unsubscribe } from './event_manager';
import { MovementSystem, MoveRequestData } from '../systems/movement_system';
import { CargoSystem } from '../systems/cargo_systems';
import { MiningSite, MiningSystem } from '../systems/mining_system';
import { TerminalOverlay } from '../rendering/terminal_overlay';
import { AstrometricOverlay } from '../rendering/astrometric_overlay';
import { DeepSpacePhenomenonProperties, SystemDataGenerator } from '../generation/system_data_generator';
import { StellarBody } from '../entities/stellar_body';
import { AvailableAction, createAvailableActions, formatAvailableActions } from './available_actions';
import { commandButton, CommandBarButton, CommandBarModel } from './command_bar';
import { StarbaseScreenModel, StarbaseSectionId, StarbaseTableRow, STARBASE_SECTIONS } from './starbase_ui';
import {
  clampIndex,
  moveSelection,
  moveSelectionInRows,
  TextModalTableModel,
  TextTableRow,
  TextTone,
} from './text_ui';
import {
  adjustQuantitySelector,
  createQuantitySelector,
  createQuantitySelectorModel,
  QuantitySelectorState,
  setQuantitySelectorValue,
} from './quantity_selector';
import { createHelpReferenceLines } from './help_reference';
import { createOrbitScreenModel, getPlanetMapSize, OrbitScreenModel } from './orbit_ui';
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
import { createShipStatusDashboard } from './ship_status_dashboard';
import { TEXT_PALETTE } from '../rendering/text_palette';
import { createPlayerViewSnapshot, createSceneViewModel } from '../rendering/scene_view_model';
import {
  OrbitModeController,
  GameModeDispatcher,
  InterfaceModeController,
  ShipMenuSection,
  ShipOperationsController,
  SurfaceModeController,
  TravelModeController,
  TravelObserveCursor,
} from './modes/game_mode_controllers';
import {
  findSystemPlanetPath,
  GameSave,
  getSystemPlanetPaths,
  PlanetMutationSaveData,
  SAVE_GAME_VERSION,
} from './save_game';
import {
  DEFAULT_SYSTEM_ZOOM_INDEX,
  getSystemSimulationSpeedMultiplier,
  getSystemViewScale,
  getSystemZoomFactor,
  SYSTEM_ZOOM_LEVELS,
} from './system_zoom';
import {
  CommerceEffects,
  getTradeItemInfo,
  StarbaseCommerceService,
  TradeDepotItem,
} from './starbase_commerce';
import { StarbaseController } from './starbase_controller';

// ScanTarget type includes SolarSystem now
type ScanTarget = Planet | Starbase | StellarBody | SolarSystem;
type NavigationTarget = Planet | Starbase | StellarBody;
type RoverActionId =
  | 'map'
  | 'move'
  | 'cargo'
  | 'pickup'
  | 'mine'
  | 'scan'
  | 'stun'
  | 'shoot'
  | 'embark'
  | 'icon';
type QuantityOperation =
  | { type: 'buy'; itemKey: string }
  | { type: 'sell'; itemKey: string }
  | { type: 'jettison'; itemKey: string }
  | { type: 'mine'; x?: number; y?: number };

interface SurfaceExtractionSelectorState {
  mode: 'mine' | 'pickup';
  options: MiningSite[];
  selectedIndex: number;
  viewOffset: number;
}

interface JettisonConfirmationState {
  itemKey: string;
  amount: number;
  selectedIndex: number;
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

/** Clones a JSON-compatible save value without retaining mutable runtime references. */
function cloneSaveValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Returns the registry key for one persistent generated-body mutation record. */
function getPlanetMutationKey(
  mutation: Pick<PlanetMutationSaveData, 'worldX' | 'worldY' | 'bodyPath'>
): string {
  return `${mutation.worldX},${mutation.worldY}/${mutation.bodyPath}`;
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
  private readonly eventUnsubscribers: Unsubscribe[];
  private _starbaseCommerce?: StarbaseCommerceService;
  private _travelMode?: TravelModeController;
  private _orbitModeState?: OrbitModeController;
  private _surfaceMode?: SurfaceModeController;
  private _starbaseMode?: StarbaseController;
  private _shipOperations?: ShipOperationsController;
  private _modeDispatcher?: GameModeDispatcher;
  private _interfaceMode?: InterfaceModeController<
    QuantitySelectorState<QuantityOperation>,
    SurfaceExtractionSelectorState,
    JettisonConfirmationState
  >;
  private acceptedMissionIds: Set<string> = new Set();
  private completedMissionIds: Set<string> = new Set();
  private activeMissions: Record<string, StarbaseMission> = {};
  private planetMutationRegistry = new Map<string, PlanetMutationSaveData>();
  private static readonly SIMULATED_SECONDS_PER_REAL_SECOND = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);
  private static readonly GAME_START_UTC_MS = Date.UTC(3015, 0, 1, 0, 0, 0);
  private static readonly SYSTEM_RENDER_INTERVAL_MS = 1000 / 60;
  private static readonly ORBIT_RENDER_INTERVAL_MS = 1000 / 60;
  private static readonly SURFACE_RENDER_INTERVAL_MS = 250;
  private static readonly STARBASE_ALERT_RENDER_INTERVAL_MS = 450;
  private static readonly OVERLAY_RENDER_INTERVAL_MS = 1000 / 60;
  private gameClockElapsedSeconds: number = 0;
  private currentShipCompartmentId: string = 'bridge';
  private autoScannedSystemName: string | null = null;
  private tutorialHintsShown: Set<string> = new Set();

  // Game Loop State, Status, Flags
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private isDestroyed: boolean = false;
  private animationFrameId: number | null = null;
  private statusMessage: string = 'Initializing Systems...';
  private forceFullRender: boolean = true;
  private lastRenderStatsLogAt: number = 0;
  private lastMainRenderSignature: string = '';
  private lastOverlayRenderAt: number = Number.NEGATIVE_INFINITY;
  private lastPublishedStatusSignature: string = '';
  private lastPublishedCommandSignature: string = '';
  private lastHyperspaceUpdateSignature: string = '';
  private lastHyperspaceUpdateStatus: string = '';
  private preparingSurfacePlanet: Planet | null = null;
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
  private readonly zoomLevels = SYSTEM_ZOOM_LEVELS;
  private currentZoomLevelIndex: number = DEFAULT_SYSTEM_ZOOM_INDEX;

  /** Returns travel mode. */
  private get travelMode(): TravelModeController {
    return (this._travelMode ??= new TravelModeController());
  }

  /** Returns orbit mode state. */
  private get orbitModeState(): OrbitModeController {
    return (this._orbitModeState ??= new OrbitModeController());
  }

  /** Returns surface mode. */
  private get surfaceMode(): SurfaceModeController {
    return (this._surfaceMode ??= new SurfaceModeController());
  }

  /** Returns starbase mode. */
  private get starbaseMode(): StarbaseController {
    return (this._starbaseMode ??= new StarbaseController());
  }

  /** Returns ship operations. */
  private get shipOperations(): ShipOperationsController {
    return (this._shipOperations ??= new ShipOperationsController());
  }

  /** Returns mode dispatcher. */
  private get modeDispatcher(): GameModeDispatcher {
    return (this._modeDispatcher ??= new GameModeDispatcher());
  }

  /** Returns interface mode. */
  private get interfaceMode(): InterfaceModeController<
    QuantitySelectorState<QuantityOperation>,
    SurfaceExtractionSelectorState,
    JettisonConfirmationState
  > {
    return (this._interfaceMode ??= new InterfaceModeController());
  }

  /** Returns starbase commerce. */
  private get starbaseCommerce(): StarbaseCommerceService {
    return (this._starbaseCommerce ??= new StarbaseCommerceService(
      this.player,
      this.cargoSystem,
      this.gameSeedPRNG.seed
    ));
  }

  // Transitional aliases for isolated harnesses and save/debug tooling. Production
  // code uses the mode controllers directly; these preserve one source of truth.
  /** Returns travel command moving. */
  private get travelCommandMoving(): boolean {
    return this.travelMode.commandMoving;
  }
  /** Updates travel command moving. */
  private set travelCommandMoving(value: boolean) {
    this.travelMode.commandMoving = value;
  }
  /** Returns travel command selection. */
  private get travelCommandSelection(): number {
    return this.travelMode.commandSelection;
  }
  /** Updates travel command selection. */
  private set travelCommandSelection(value: number) {
    this.travelMode.commandSelection = value;
  }
  /** Returns travel observe cursor. */
  private get travelObserveCursor(): TravelObserveCursor | null {
    return this.travelMode.observeCursor;
  }
  /** Updates travel observe cursor. */
  private set travelObserveCursor(value: TravelObserveCursor | null) {
    this.travelMode.observeCursor = value;
  }
  /** Returns target menu open. */
  private get targetMenuOpen(): boolean {
    return this.interfaceMode.is('target-menu');
  }
  /** Updates target menu open. */
  private set targetMenuOpen(value: boolean) {
    if (value) this.interfaceMode.open('target-menu');
    else this.interfaceMode.close('target-menu');
  }
  /** Returns target menu selection. */
  private get targetMenuSelection(): number {
    return this.travelMode.targetMenuSelection;
  }
  /** Updates target menu selection. */
  private set targetMenuSelection(value: number) {
    this.travelMode.targetMenuSelection = value;
  }
  /** Returns target menu offset. */
  private get targetMenuOffset(): number {
    return this.travelMode.targetMenuOffset;
  }
  /** Updates target menu offset. */
  private set targetMenuOffset(value: number) {
    this.travelMode.targetMenuOffset = value;
  }
  /** Returns current target index. */
  private get currentTargetIndex(): number {
    return this.travelMode.currentTargetIndex;
  }
  /** Updates current target index. */
  private set currentTargetIndex(value: number) {
    this.travelMode.currentTargetIndex = value;
  }
  /** Returns current target signature. */
  private get currentTargetSignature(): string {
    return this.travelMode.currentTargetSignature;
  }
  /** Updates current target signature. */
  private set currentTargetSignature(value: string) {
    this.travelMode.currentTargetSignature = value;
  }
  /** Returns approach target signature. */
  private get approachTargetSignature(): string | null {
    return this.travelMode.approachTargetSignature;
  }
  /** Updates approach target signature. */
  private set approachTargetSignature(value: string | null) {
    this.travelMode.approachTargetSignature = value;
  }
  /** Returns orbit elapsed seconds. */
  private get orbitElapsedSeconds(): number {
    return this.orbitModeState.elapsedSeconds;
  }
  /** Updates orbit elapsed seconds. */
  private set orbitElapsedSeconds(value: number) {
    this.orbitModeState.elapsedSeconds = value;
  }
  /** Returns ship menu open. */
  private get shipMenuOpen(): boolean {
    return this.interfaceMode.is('ship-menu');
  }
  /** Updates ship menu open. */
  private set shipMenuOpen(value: boolean) {
    if (value) this.interfaceMode.open('ship-menu');
    else this.interfaceMode.close('ship-menu');
  }
  /** Returns ship menu section. */
  private get shipMenuSection(): ShipMenuSection {
    return this.shipOperations.section;
  }
  /** Updates ship menu section. */
  private set shipMenuSection(value: ShipMenuSection) {
    this.shipOperations.section = value;
  }
  /** Returns ship menu selection. */
  private get shipMenuSelection(): number {
    return this.shipOperations.selection;
  }
  /** Updates ship menu selection. */
  private set shipMenuSelection(value: number) {
    this.shipOperations.selection = value;
  }
  /** Returns ship menu offset. */
  private get shipMenuOffset(): number {
    return this.shipOperations.offset;
  }
  /** Updates ship menu offset. */
  private set shipMenuOffset(value: number) {
    this.shipOperations.offset = value;
  }
  /** Returns ship menu selection by section. */
  private get shipMenuSelectionBySection(): Partial<Record<ShipMenuSection, number>> {
    return this.shipOperations.selectionBySection;
  }
  /** Updates ship menu selection by section. */
  private set shipMenuSelectionBySection(value: Partial<Record<ShipMenuSection, number>>) {
    this.shipOperations.selectionBySection = value;
  }
  /** Returns ship menu offset by section. */
  private get shipMenuOffsetBySection(): Partial<Record<ShipMenuSection, number>> {
    return this.shipOperations.offsetBySection;
  }
  /** Updates ship menu offset by section. */
  private set shipMenuOffsetBySection(value: Partial<Record<ShipMenuSection, number>>) {
    this.shipOperations.offsetBySection = value;
  }
  /** Returns ship menu jettison item key. */
  private get shipMenuJettisonItemKey(): string | null {
    return this.shipOperations.jettisonItemKey;
  }
  /** Updates ship menu jettison item key. */
  private set shipMenuJettisonItemKey(value: string | null) {
    this.shipOperations.jettisonItemKey = value;
  }
  /** Returns starbase section id. */
  private get starbaseSectionId(): StarbaseSectionId {
    return this.starbaseMode.sectionId;
  }
  /** Updates starbase section id. */
  private set starbaseSectionId(value: StarbaseSectionId) {
    this.starbaseMode.sectionId = value;
  }
  /** Returns starbase selection by section. */
  private get starbaseSelectionBySection(): Record<string, number> {
    return this.starbaseMode.selectionBySection;
  }
  /** Updates starbase selection by section. */
  private set starbaseSelectionBySection(value: Record<string, number>) {
    this.starbaseMode.selectionBySection = value;
  }
  /** Returns starbase offset by section. */
  private get starbaseOffsetBySection(): Record<string, number> {
    return this.starbaseMode.offsetBySection;
  }
  /** Updates starbase offset by section. */
  private set starbaseOffsetBySection(value: Record<string, number>) {
    this.starbaseMode.offsetBySection = value;
  }
  /** Returns starbase alert. */
  private get starbaseAlert(): string {
    return this.starbaseMode.alert;
  }
  /** Updates starbase alert. */
  private set starbaseAlert(value: string) {
    this.starbaseMode.alert = value;
  }
  /** Returns trade selection index. */
  private get tradeSelectionIndex(): number {
    return this.starbaseMode.tradeSelectionIndex;
  }
  /** Updates trade selection index. */
  private set tradeSelectionIndex(value: number) {
    this.starbaseMode.tradeSelectionIndex = value;
  }
  /** Returns rover menu selection. */
  private get roverMenuSelection(): number {
    return this.surfaceMode.roverMenuSelection;
  }
  /** Updates rover menu selection. */
  private set roverMenuSelection(value: number) {
    this.surfaceMode.roverMenuSelection = value;
  }
  /** Returns rover cargo open. */
  private get roverCargoOpen(): boolean {
    return this.interfaceMode.is('rover-cargo');
  }
  /** Updates rover cargo open. */
  private set roverCargoOpen(value: boolean) {
    if (value) this.interfaceMode.open('rover-cargo');
    else this.interfaceMode.close('rover-cargo');
  }
  /** Returns rover cargo selection. */
  private get roverCargoSelection(): number {
    return this.surfaceMode.roverCargoSelection;
  }
  /** Updates rover cargo selection. */
  private set roverCargoSelection(value: number) {
    this.surfaceMode.roverCargoSelection = value;
  }
  /** Returns rover cargo offset. */
  private get roverCargoOffset(): number {
    return this.surfaceMode.roverCargoOffset;
  }
  /** Updates rover cargo offset. */
  private set roverCargoOffset(value: number) {
    this.surfaceMode.roverCargoOffset = value;
  }
  /** Returns surface map expanded. */
  private get surfaceMapExpanded(): boolean {
    return this.surfaceMode.mapExpanded;
  }
  /** Updates surface map expanded. */
  private set surfaceMapExpanded(value: boolean) {
    this.surfaceMode.mapExpanded = value;
  }
  /** Returns surface legend open. */
  private get surfaceLegendOpen(): boolean {
    return this.interfaceMode.is('surface-legend');
  }
  /** Updates surface legend open. */
  private set surfaceLegendOpen(value: boolean) {
    if (value) this.interfaceMode.open('surface-legend');
    else this.interfaceMode.close('surface-legend');
  }
  /** Returns surface legend selection. */
  private get surfaceLegendSelection(): number {
    return this.surfaceMode.legendSelection;
  }
  /** Updates surface legend selection. */
  private set surfaceLegendSelection(value: number) {
    this.surfaceMode.legendSelection = value;
  }
  /** Returns surface legend offset. */
  private get surfaceLegendOffset(): number {
    return this.surfaceMode.legendOffset;
  }
  /** Updates surface legend offset. */
  private set surfaceLegendOffset(value: number) {
    this.surfaceMode.legendOffset = value;
  }
  /** Returns surface scan cursor. */
  private get surfaceScanCursor(): { dx: number; dy: number } | null {
    return this.surfaceMode.scanCursor;
  }
  /** Updates surface scan cursor. */
  private set surfaceScanCursor(value: { dx: number; dy: number } | null) {
    this.surfaceMode.scanCursor = value;
  }
  /** Returns surface notifications. */
  private get surfaceNotifications(): string[] {
    return this.surfaceMode.notifications;
  }
  /** Updates surface notifications. */
  private set surfaceNotifications(value: string[]) {
    this.surfaceMode.notifications = value;
  }
  /** Returns quantity selector. */
  private get quantitySelector(): QuantitySelectorState<QuantityOperation> | null {
    return this.interfaceMode.quantity;
  }
  /** Updates quantity selector. */
  private set quantitySelector(value: QuantitySelectorState<QuantityOperation> | null) {
    if (value) this.interfaceMode.openQuantity(value);
    else this.interfaceMode.close('quantity');
  }
  /** Returns surface extraction selector. */
  private get surfaceExtractionSelector(): SurfaceExtractionSelectorState | null {
    return this.interfaceMode.surfaceExtraction;
  }
  /** Updates surface extraction selector. */
  private set surfaceExtractionSelector(value: SurfaceExtractionSelectorState | null) {
    if (value) this.interfaceMode.openSurfaceExtraction(value);
    else this.interfaceMode.close('surface-extraction');
  }
  /** Returns jettison confirmation. */
  private get jettisonConfirmation(): JettisonConfirmationState | null {
    return this.interfaceMode.jettisonConfirmation;
  }
  /** Updates jettison confirmation. */
  private set jettisonConfirmation(value: JettisonConfirmationState | null) {
    if (value) this.interfaceMode.openJettisonConfirmation(value);
    else this.interfaceMode.close('jettison-confirmation');
  }

  /** Initializes Game. */
  constructor(canvasId: string, statusBarId: string, seed?: string | number) {
    logger.info('[Game] Constructing instance...');
    const initialSeed = seed !== undefined ? String(seed) : String(Date.now());
    this.gameSeedPRNG = new PRNG(initialSeed);
    this.systemDataGenerator = new SystemDataGenerator(this.gameSeedPRNG);
    this.hyperspaceSurveyService = new HyperspaceSurveyService(this.systemDataGenerator);
    this.renderer = new RendererFacade(
      canvasId,
      statusBarId,
      this.systemDataGenerator,
      this.hyperspaceSurveyService
    );
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

    this.eventUnsubscribers = [
      eventManager.subscribe(GameEvents.GAME_STATE_CHANGED, (transition) => {
        this._handleGameStateChange(transition);
      }),
      eventManager.subscribe(GameEvents.TRADE_REQUESTED, () => {
        this._handleTradeRequest();
      }),
      eventManager.subscribe(GameEvents.REFUEL_REQUESTED, () => {
        this._handleRefuelRequest();
      }),
      eventManager.subscribe(GameEvents.PLAYER_CARGO_ADDED, () => {
        this._handleCargoUpdate();
      }),
      eventManager.subscribe(GameEvents.PLAYER_CARGO_SOLD, () => {
        this._handleCargoUpdate();
      }),
      eventManager.subscribe(GameEvents.PLAYER_FUEL_CHANGED, () => {
        this._handleFuelUpdate();
      }),
      eventManager.subscribe(GameEvents.PLAYER_CREDITS_CHANGED, () => {
        this._handleCreditsUpdate();
      }),
      eventManager.subscribe(GameEvents.COMMAND_BAR_ACTION_SELECTED, (data) => {
        this._handleCommandBarAction(data);
      }),
    ];

    // Add resize listener
    window.addEventListener('resize', this._handleResize);
    this._handleResize(); // Initial fit

    logger.info(
      `[Game] Instance constructed. Seed: "${this.gameSeedPRNG.getInitialSeed()}", Initial State: '${
        this.stateManager.state
      }'`
    );
  }

  /** Creates a versioned JSON-compatible snapshot of persistent game progress. */
  createSaveGame(): GameSave {
    this.captureCurrentPlanetMutations();
    const system = this.stateManager.currentSystem;
    const planetMutations = [...this.planetMutationRegistry.values()].map((mutation) =>
      cloneSaveValue(mutation)
    );

    return {
      version: SAVE_GAME_VERSION,
      savedAt: new Date().toISOString(),
      seed: this.gameSeedPRNG.getInitialSeed(),
      gameClockElapsedSeconds: this.gameClockElapsedSeconds,
      player: cloneSaveValue({
        position: this.player.position,
        render: this.player.render,
        resources: this.player.resources,
        cargoHold: this.player.cargoHold,
        terrainVehicle: this.player.terrainVehicle,
        crew: this.player.crew,
        ship: this.player.ship,
      }),
      location: {
        state: this.stateManager.state,
        worldX: this.player.position.worldX,
        worldY: this.player.position.worldY,
        bodyPath: system ? findSystemPlanetPath(system, this.stateManager.currentPlanet) : null,
        orbitReferencePath: system
          ? findSystemPlanetPath(system, this.stateManager.currentOrbitReferencePlanet)
          : null,
        atStarbase: this.stateManager.state === 'starbase',
      },
      systemOrbit: system
        ? {
            stars: system.stars.map((star) => ({
              id: star.id,
              orbitAngle: star.orbit?.angle ?? null,
              systemX: star.systemX,
              systemY: star.systemY,
            })),
            starbase: system.starbase
              ? {
                  orbitAngle: system.starbase.orbitAngle,
                  systemX: system.starbase.systemX,
                  systemY: system.starbase.systemY,
                }
              : null,
          }
        : null,
      planetMutations,
      acceptedMissionIds: [...this.acceptedMissionIds],
      completedMissionIds: [...this.completedMissionIds],
      activeMissions: cloneSaveValue(this.activeMissions),
      tutorialHintsShown: [...this.tutorialHintsShown],
    };
  }

  /** Restores validated persistent progress into this freshly constructed game instance. */
  restoreSaveGame(save: GameSave): void {
    if (save.seed !== this.gameSeedPRNG.getInitialSeed()) {
      throw new Error('Save seed does not match the constructed game universe.');
    }

    this.planetMutationRegistry = new Map(
      save.planetMutations.map((mutation) => [getPlanetMutationKey(mutation), cloneSaveValue(mutation)])
    );
    const system = this.stateManager.restoreLocation(
      save.location.state,
      save.location.worldX,
      save.location.worldY,
      save.location.bodyPath,
      save.location.orbitReferencePath,
      save.location.atStarbase
    );
    if (system) {
      this.applyPlanetMutations(system, true);
      if (save.systemOrbit) {
        for (const starState of save.systemOrbit.stars) {
          const star = system.stars.find((candidate) => candidate.id === starState.id);
          if (!star) continue;
          if (star.orbit && starState.orbitAngle !== null) star.orbit.angle = starState.orbitAngle;
          star.systemX = starState.systemX;
          star.systemY = starState.systemY;
        }
        if (system.starbase && save.systemOrbit.starbase) {
          system.starbase.orbitAngle = save.systemOrbit.starbase.orbitAngle;
          system.starbase.systemX = save.systemOrbit.starbase.systemX;
          system.starbase.systemY = save.systemOrbit.starbase.systemY;
        }
      }
    }

    this.player.position = cloneSaveValue(save.player.position);
    this.player.render = cloneSaveValue(save.player.render);
    this.player.resources = cloneSaveValue(save.player.resources);
    this.player.cargoHold = cloneSaveValue(save.player.cargoHold);
    this.player.terrainVehicle = cloneSaveValue(save.player.terrainVehicle);
    this.player.crew = cloneSaveValue(save.player.crew);
    this.player.ship = cloneSaveValue(save.player.ship);
    this.gameClockElapsedSeconds = Math.max(0, save.gameClockElapsedSeconds);
    this.acceptedMissionIds = new Set(save.acceptedMissionIds);
    this.completedMissionIds = new Set(save.completedMissionIds);
    this.activeMissions = cloneSaveValue(save.activeMissions);
    this.tutorialHintsShown = new Set(save.tutorialHintsShown);
    this.statusMessage = `Loaded save from ${new Date(save.savedAt).toLocaleString()}.`;
    this.forceFullRender = true;
    this.lastMainRenderSignature = '';
    this._publishStatusUpdate();
  }

  /** Captures mutable planet state from the active generated system into the persistent registry. */
  private captureCurrentPlanetMutations(): void {
    const system = this.stateManager.currentSystem;
    if (!system) return;
    for (const { path, planet } of getSystemPlanetPaths(system)) {
      const mutation: PlanetMutationSaveData = {
        worldX: system.starX,
        worldY: system.starY,
        bodyPath: path,
        orbitAngle: planet.orbitAngle,
        systemX: planet.systemX,
        systemY: planet.systemY,
        scanned: planet.scanned,
        primaryResource: planet.primaryResource,
        minedLocations: [...planet.minedLocations],
        minedLocationAmounts: { ...planet.minedLocationAmounts },
      };
      this.planetMutationRegistry.set(getPlanetMutationKey(mutation), mutation);
    }
  }

  /** Applies saved scan, mining, and orbital deltas to a regenerated system. */
  private applyPlanetMutations(system: SolarSystem, restoreOrbit: boolean = false): void {
    for (const { path, planet } of getSystemPlanetPaths(system)) {
      const mutation = this.planetMutationRegistry.get(
        getPlanetMutationKey({ worldX: system.starX, worldY: system.starY, bodyPath: path })
      );
      if (!mutation) continue;
      if (restoreOrbit) {
        planet.orbitAngle = mutation.orbitAngle;
        planet.systemX = mutation.systemX;
        planet.systemY = mutation.systemY;
      }
      planet.scanned = mutation.scanned;
      planet.primaryResource = mutation.primaryResource;
      planet.minedLocations = new Set(mutation.minedLocations);
      planet.minedLocationAmounts = { ...mutation.minedLocationAmounts };
    }
  }

  /** Pauses simulation and keyboard handling while retaining the current game instance. */
  pauseGame(): void {
    if (!this.isRunning || this.isDestroyed) return;
    this.isRunning = false;
    this.inputManager.stopListening();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /** Resumes a paused game without resetting progress or status. */
  resumeGame(): void {
    if (this.isRunning || this.isDestroyed) return;
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.inputManager.clearState();
    this.inputManager.startListening();
    this.forceFullRender = true;
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }

  // --- Event Handlers ---
  /** Handles game state change. */
  private _handleGameStateChange({ previousState, state: newState }: GameStateChangedEvent): void {
    this.forceFullRender = true; // Always force redraw on state change
    this.lastHyperspaceUpdateSignature = '';
    this.lastHyperspaceUpdateStatus = '';
    logger.info(`[Game] State change event received: ${newState}. Forcing full render.`);
    if (this.stateManager.currentSystem) {
      this.applyPlanetMutations(this.stateManager.currentSystem);
    }
    // Reset zoom to default when leaving system view
    if (previousState === 'system' && newState !== 'system') {
      this.currentZoomLevelIndex = DEFAULT_SYSTEM_ZOOM_INDEX;
      logger.info(
        `[Game] Resetting zoom to default level (${this.currentZoomLevelIndex}) due to state change.`
      );
    }
    this.travelMode.resetForState(newState);
    this.shipOperations.close();
    this.surfaceMode.closeTransientInterfaces();
    this.interfaceMode.close();
    if (newState === 'starbase') {
      this.starbaseMode.reset();
    }
    if (newState === 'orbit') {
      const planet = this.stateManager.currentPlanet;
      if (planet) {
        const bodies = this.getOrbitBodies();
        const selectedIndex = bodies.indexOf(planet);
        this.orbitModeState.reset(selectedIndex >= 0 ? selectedIndex : 0, getPlanetMapSize(planet));
      } else {
        this.orbitModeState.reset();
      }
    }
    if (newState !== 'planet') {
      this.surfaceMode.notifications = [];
    }
    // Close popups on state change
    if (this.popupState !== 'inactive') {
      this.popupState = 'inactive';
      this.popupContent = null;
      this.interfaceMode.close('popup');
      logger.debug('[Game] Closing active popup due to game state change.');
    }
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
  /** Handles cargo update. */
  private _handleCargoUpdate(): void {
    this._publishStatusUpdate();
  }
  /** Handles fuel update. */
  private _handleFuelUpdate(): void {
    this._publishStatusUpdate();
  }
  /** Handles credits update. */
  private _handleCreditsUpdate(): void {
    this._publishStatusUpdate();
  }

  /** Handles command bar action. */
  private _handleCommandBarAction(data?: { id?: string; action?: string }): void {
    if (!data?.action) return;
    if (
      this.popupState !== 'inactive' ||
      this.targetMenuOpen ||
      this.shipMenuOpen ||
      this.roverCargoOpen ||
      this.surfaceLegendOpen ||
      this.quantitySelector ||
      this.surfaceExtractionSelector ||
      this.jettisonConfirmation
    ) {
      this.statusMessage = 'Command bar unavailable while another interface is active.';
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }

    this.executeCommandBarAction(data.action);
    this.forceFullRender = true;
    this._publishStatusUpdate();
  }

  /** Publishes the contextual command hint for the current game state. */
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
    } else if (
      newState === 'planet' &&
      this.stateManager.currentPlanet &&
      !this.tutorialHintsShown.has('planet')
    ) {
      this.tutorialHintsShown.add('planet');
      this.terminalOverlay.addMessage(
        `<h>Surface operations:</h> scan before mining, then use Space for the next available action.`
      );
    } else if (
      newState === 'orbit' &&
      this.stateManager.currentPlanet &&
      !this.tutorialHintsShown.has('orbit')
    ) {
      this.tutorialHintsShown.add('orbit');
      this.terminalOverlay.addMessage(
        `<h>Orbit:</h> choose a body, inspect the scan, then select a landing site.`
      );
    } else if (
      newState === 'starbase' &&
      this.stateManager.currentStarbase &&
      !this.tutorialHintsShown.has('starbase')
    ) {
      this.tutorialHintsShown.add('starbase');
      this.terminalOverlay.addMessage(
        `<h>Starbase:</h> Enter buys selected goods, Backspace sells selected cargo, R refuels.`
      );
    }
  }

  /** Handles resize. */
  private _handleResize = (): void => {
    logger.debug('[Game] Handling window resize...');
    this.renderer.fitToScreen();
    // Update terminal overlay dimensions if needed
    this.terminalOverlay.updateCharDimensions(this.renderer.getCharHeightPx());
    this.forceFullRender = true; // Force redraw after resize
    this.lastUpdateTime = performance.now(); // Reset timer to avoid large deltaTime jump
  };

  // --- Game Loop Control ---
  /** Starts game. */
  startGame(): void {
    if (this.isRunning || this.isDestroyed) return;
    logger.info('[Game] Starting game loop...');
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.inputManager.startListening();
    this.inputManager.clearState(); // Clear any lingering input state
    this.forceFullRender = true; // Ensure initial render is complete
    // Initial status update
    if (this.statusMessage === 'Initializing Systems...') {
      this.statusMessage = 'Welcome to Cosmic Voyage!';
    }
    this._publishStatusUpdate();
    // Start the loop
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
    logger.info('[Game] Game loop initiated.');
  }

  /** Stops game. */
  stopGame(): void {
    if (this.isDestroyed) return;
    logger.info('[Game] Stopping game loop...');
    this.isRunning = false;
    this.isDestroyed = true;
    this.inputManager.stopListening();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, {
      message: 'Game stopped. Refresh to restart.',
      hasStarbase: false,
    });
    window.removeEventListener('resize', this._handleResize);
    this.eventUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.movementSystem.destroy();
    this.miningSystem.destroy();
    this.stateManager.destroy();
    this.renderer.destroy();
    logger.info('[Game] Game loop stopped.');
  }

  // --- Core Game Loop ---
  /** Runs one animation frame, including input, simulation, and rendering. */
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
      this.inputManager.wasActionJustPressed('ZOOM_IN') ||
      this.inputManager.wasActionJustPressed('ZOOM_IN_NUMPAD');
    const zoomOutPressed =
      this.inputManager.wasActionJustPressed('ZOOM_OUT') ||
      this.inputManager.wasActionJustPressed('ZOOM_OUT_NUMPAD');

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

  /** Handles starbase trade input. */
  private _handleStarbaseTradeInput(): boolean {
    if (this.stateManager.state !== 'starbase' || !this.stateManager.currentStarbase) {
      return false;
    }

    const starbase = this.stateManager.currentStarbase;
    const visibleRows = this.starbaseMode.getVisibleRowCount(
      this.renderer.getCanvas().height,
      this.renderer.getCharHeightPx()
    );
    const rows = this.getStarbaseRows(starbase, this.starbaseMode.sectionId);
    const selectedIndex = clampIndex(this.starbaseMode.getSelection(), rows.length);

    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.starbaseMode.moveSelection(-1, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.starbaseMode.moveSelection(1, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.starbaseMode.switchSection(-1);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.starbaseMode.switchSection(1);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      this.starbaseMode.moveSelection(-visibleRows, rows.length, visibleRows);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      this.starbaseMode.moveSelection(visibleRows, rows.length, visibleRows);
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
      this.starbaseMode.cancelPanel();
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
      this.starbaseMode.openSection('buy');
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('REFUEL')) {
      this._handleRefuelRequest();
      this.starbaseMode.alert = this.statusMessage;
      this.forceFullRender = true;
      return true;
    }

    return false;
  }

  /** Undocks from the active starbase and restores local system travel. */
  private departStarbase(): void {
    if (this.stateManager.state !== 'starbase') return;
    const departed = this.stateManager.liftOff();
    if (departed) {
      this.starbaseMode.alert = '';
      this.statusMessage = this.stateManager.statusMessage || 'Departed starbase.';
      this.stateManager.statusMessage = '';
    }
    this.forceFullRender = true;
  }

  /** Handles orbit input. */
  private _handleOrbitInput(): boolean {
    if (this.stateManager.state !== 'orbit' || !this.stateManager.currentPlanet) {
      return false;
    }

    const bodies = this.getOrbitBodies();
    if (bodies.length === 0) return false;
    this.orbitModeState.selectedBodyIndex = clampIndex(this.orbitModeState.selectedBodyIndex, bodies.length);
    const selectedBody = bodies[this.orbitModeState.selectedBodyIndex];
    const mapSize = getPlanetMapSize(selectedBody);

    if (this.orbitModeState.mode === 'overview') {
      if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
        this.orbitModeState.selectedBodyIndex =
          (this.orbitModeState.selectedBodyIndex - 1 + bodies.length) % bodies.length;
        this.resetOrbitLandingCursor();
        this.forceFullRender = true;
        return true;
      }
      if (
        this.inputManager.wasActionJustPressed('MOVE_RIGHT') ||
        this.inputManager.wasActionJustPressed('CYCLE_TARGET')
      ) {
        this.orbitModeState.selectedBodyIndex = (this.orbitModeState.selectedBodyIndex + 1) % bodies.length;
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
          this.orbitModeState.alert = 'No solid landing solution for giant-class atmosphere.';
        } else if (!selectedBody.isSurfaceReady()) {
          this.orbitModeState.alert = `Preparing ${selectedBody.name} landing data...`;
          this.prepareOrbitLandingSurface(selectedBody);
        } else {
          this.orbitModeState.mode = 'landing';
          this.orbitModeState.alert = 'Select landing coordinates.';
        }
        this.forceFullRender = true;
        return true;
      }
      if (
        this.inputManager.wasActionJustPressed('QUIT') ||
        this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
      ) {
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
    if (
      this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
      this.inputManager.isActionActive('MOVE_LEFT')
    ) {
      this.orbitModeState.landingX = (this.orbitModeState.landingX - 1 + mapSize) % mapSize;
      moved = true;
    }
    if (
      this.inputManager.wasActionJustPressed('MOVE_RIGHT') ||
      this.inputManager.isActionActive('MOVE_RIGHT')
    ) {
      this.orbitModeState.landingX = (this.orbitModeState.landingX + 1) % mapSize;
      moved = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP') || this.inputManager.isActionActive('MOVE_UP')) {
      this.orbitModeState.landingY = Math.max(0, this.orbitModeState.landingY - 1);
      moved = true;
    }
    if (
      this.inputManager.wasActionJustPressed('MOVE_DOWN') ||
      this.inputManager.isActionActive('MOVE_DOWN')
    ) {
      this.orbitModeState.landingY = Math.min(mapSize - 1, this.orbitModeState.landingY + 1);
      moved = true;
    }
    if (moved) {
      this.orbitModeState.alert = '';
      this.forceFullRender = true;
      return true;
    }

    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
    ) {
      this.orbitModeState.mode = 'overview';
      this.orbitModeState.alert = 'Landing selection cancelled.';
      this.forceFullRender = true;
      return true;
    }

    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
      this.inputManager.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF')
    ) {
      this.stateManager.landFromOrbit(
        selectedBody,
        this.orbitModeState.landingX,
        this.orbitModeState.landingY
      );
      if (this.stateManager.statusMessage) {
        this.statusMessage = this.stateManager.statusMessage;
        this.stateManager.statusMessage = '';
      }
      this.forceFullRender = true;
      return true;
    }

    return false;
  }

  /** Handles target menu input. */
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
      const viewport = moveSelection(
        this.travelMode.targetMenuSelection,
        -1,
        targets.length,
        visibleRows,
        this.travelMode.targetMenuOffset
      );
      this.travelMode.targetMenuSelection = viewport.selectedIndex;
      this.travelMode.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(
        this.travelMode.targetMenuSelection,
        1,
        targets.length,
        visibleRows,
        this.travelMode.targetMenuOffset
      );
      this.travelMode.targetMenuSelection = viewport.selectedIndex;
      this.travelMode.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(
        this.travelMode.targetMenuSelection,
        -visibleRows,
        targets.length,
        visibleRows,
        this.travelMode.targetMenuOffset
      );
      this.travelMode.targetMenuSelection = viewport.selectedIndex;
      this.travelMode.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(
        this.travelMode.targetMenuSelection,
        visibleRows,
        targets.length,
        visibleRows,
        this.travelMode.targetMenuOffset
      );
      this.travelMode.targetMenuSelection = viewport.selectedIndex;
      this.travelMode.targetMenuOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('ENTER_SYSTEM')) {
      const selected = targets[this.travelMode.targetMenuSelection];
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

  /** Handles rover cargo input. */
  private _handleRoverCargoInput(): boolean {
    if (!this.roverCargoOpen) return false;
    const rows = this.getRoverCargoRows();
    const visibleRows = 8;
    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') ||
      this.inputManager.wasActionJustPressed('MOVE_LEFT')
    ) {
      this.roverCargoOpen = false;
      this.statusMessage = 'Terrain vehicle cargo closed.';
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      const viewport = moveSelection(
        this.surfaceMode.roverCargoSelection,
        -1,
        rows.length,
        visibleRows,
        this.surfaceMode.roverCargoOffset
      );
      this.surfaceMode.roverCargoSelection = viewport.selectedIndex;
      this.surfaceMode.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(
        this.surfaceMode.roverCargoSelection,
        1,
        rows.length,
        visibleRows,
        this.surfaceMode.roverCargoOffset
      );
      this.surfaceMode.roverCargoSelection = viewport.selectedIndex;
      this.surfaceMode.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(
        this.surfaceMode.roverCargoSelection,
        -visibleRows,
        rows.length,
        visibleRows,
        this.surfaceMode.roverCargoOffset
      );
      this.surfaceMode.roverCargoSelection = viewport.selectedIndex;
      this.surfaceMode.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(
        this.surfaceMode.roverCargoSelection,
        visibleRows,
        rows.length,
        visibleRows,
        this.surfaceMode.roverCargoOffset
      );
      this.surfaceMode.roverCargoSelection = viewport.selectedIndex;
      this.surfaceMode.roverCargoOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      this.dropSelectedRoverCargo(rows[this.surfaceMode.roverCargoSelection]);
      return true;
    }
    return true;
  }

  /** Handles surface legend input. */
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
      const viewport = moveSelection(
        this.surfaceMode.legendSelection,
        -1,
        rows.length,
        visibleRows,
        this.surfaceMode.legendOffset
      );
      this.surfaceMode.legendSelection = viewport.selectedIndex;
      this.surfaceMode.legendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(
        this.surfaceMode.legendSelection,
        1,
        rows.length,
        visibleRows,
        this.surfaceMode.legendOffset
      );
      this.surfaceMode.legendSelection = viewport.selectedIndex;
      this.surfaceMode.legendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(
        this.surfaceMode.legendSelection,
        -visibleRows,
        rows.length,
        visibleRows,
        this.surfaceMode.legendOffset
      );
      this.surfaceMode.legendSelection = viewport.selectedIndex;
      this.surfaceMode.legendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(
        this.surfaceMode.legendSelection,
        visibleRows,
        rows.length,
        visibleRows,
        this.surfaceMode.legendOffset
      );
      this.surfaceMode.legendSelection = viewport.selectedIndex;
      this.surfaceMode.legendOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }
    return true;
  }

  /** Handles ship menu input. */
  private _handleShipMenuInput(): boolean {
    if (!this.shipMenuOpen) return false;

    const rows = this.getShipMenuRows();
    const visibleRows = this.getShipMenuVisibleRows();
    if (
      this.inputManager.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF') &&
      this.stateManager.state === 'planet'
    ) {
      this.launchFromParkedShip();
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
    ) {
      const inMainSection = this.shipOperations.section === 'main';
      if (inMainSection) {
        if (this.isShipOperationsRequiredOnSurface()) {
          this.statusMessage = 'Choose Terrain Vehicle to disembark, or Launch to return to orbit.';
          this.forceFullRender = true;
        } else {
          this.closeShipMenu('Ship menu closed.');
        }
      } else {
        this.openShipMenuSection('main');
      }
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      if (this.shipOperations.section === 'main') {
        if (this.isShipOperationsRequiredOnSurface()) {
          this.statusMessage = 'Landed ship operations remain open while embarked planetside.';
          this.forceFullRender = true;
        } else {
          this.closeShipMenu('Ship menu closed.');
        }
      } else this.openShipMenuSection('main');
      return true;
    }

    if (this.shipOperations.section === 'status') {
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT') && this.shipOperations.section === 'main') {
      this.activateShipMenuSelection(rows[this.shipOperations.selection]);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.moveShipMenuSelection(-1, rows, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.moveShipMenuSelection(1, rows, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      this.moveShipMenuSelection(-visibleRows, rows, visibleRows);
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      this.moveShipMenuSelection(visibleRows, rows, visibleRows);
      return true;
    }

    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      this.activateShipMenuSelection(rows[this.shipOperations.selection]);
      return true;
    }

    return true;
  }

  /** Returns whether ship operations required on surface. */
  private isShipOperationsRequiredOnSurface(): boolean {
    return (
      this.stateManager.state === 'planet' &&
      !this.player.terrainVehicle.deployed &&
      !this.player.terrainVehicle.onFoot
    );
  }

  /** Handles surface vehicle input. */
  private _handleSurfaceVehicleInput(): boolean {
    if (
      this.stateManager.state !== 'planet' ||
      (!this.player.terrainVehicle.deployed && !this.player.terrainVehicle.onFoot)
    )
      return false;

    if (this.surfaceMode.mapExpanded) {
      if (
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
        this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
        this.inputManager.wasActionJustPressed('QUIT') ||
        this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
      ) {
        this.surfaceMode.mapExpanded = false;
        this.statusMessage = 'Surface map closed.';
        this.forceFullRender = true;
      }
      return true;
    }

    if (this.surfaceMode.scanCursor) {
      const bounds = this.getSurfaceScanCursorBounds();
      if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
        this.surfaceMode.scanCursor.dy = Math.max(-bounds.y, this.surfaceMode.scanCursor.dy - 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
        this.surfaceMode.scanCursor.dy = Math.min(bounds.y, this.surfaceMode.scanCursor.dy + 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
        this.surfaceMode.scanCursor.dx = Math.max(-bounds.x, this.surfaceMode.scanCursor.dx - 1);
        this.forceFullRender = true;
        return true;
      }
      if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
        this.surfaceMode.scanCursor.dx = Math.min(bounds.x, this.surfaceMode.scanCursor.dx + 1);
        this.forceFullRender = true;
        return true;
      }
      if (
        this.inputManager.wasActionJustPressed('QUIT') ||
        this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
      ) {
        this.surfaceMode.scanCursor = null;
        this.addSurfaceNotification('Surface scan cursor cancelled.');
        this.forceFullRender = true;
        return true;
      }
      if (
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
        this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
      ) {
        this.confirmSurfaceCursorScan();
        return true;
      }
      return true;
    }

    const rover = this.player.terrainVehicle;
    if (rover.onFoot) return false;
    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      if (rover.moving) {
        rover.moving = false;
        this.surfaceMode.roverMenuSelection = this.getDefaultSurfaceVehicleMenuSelection();
        this.statusMessage = 'Terrain vehicle stopped.';
      } else {
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems()[this.surfaceMode.roverMenuSelection]
        );
      }
      this.forceFullRender = true;
      return true;
    }

    if (rover.moving) return false;

    const items = this.getSurfaceVehicleMenuItems();
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.surfaceMode.roverMenuSelection =
        (this.surfaceMode.roverMenuSelection - 1 + items.length) % items.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.surfaceMode.roverMenuSelection = (this.surfaceMode.roverMenuSelection + 1) % items.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.surfaceMode.roverMenuSelection = Math.max(0, this.surfaceMode.roverMenuSelection - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.surfaceMode.roverMenuSelection = Math.min(
        items.length - 1,
        this.surfaceMode.roverMenuSelection + 1
      );
      this.forceFullRender = true;
      return true;
    }

    return false;
  }

  /** Handles travel command input. */
  private _handleTravelCommandInput(): boolean {
    const state = this.stateManager.state;
    if (state !== 'hyperspace' && state !== 'system') return false;

    if (this.travelMode.commandMoving) {
      if (
        this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
        this.inputManager.wasActionJustPressed('PRIMARY_ACTION') ||
        this.inputManager.wasActionJustPressed('QUIT')
      ) {
        this.travelMode.commandMoving = false;
        this.travelMode.commandSelection = this.getDefaultTravelCommandIndex();
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
    this.travelMode.commandSelection = clampIndex(this.travelMode.commandSelection, commands.length);
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.travelMode.commandSelection = Math.max(0, this.travelMode.commandSelection - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.travelMode.commandSelection = Math.min(commands.length - 1, this.travelMode.commandSelection + 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.travelMode.commandSelection =
        (this.travelMode.commandSelection - 1 + commands.length) % commands.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.travelMode.commandSelection = (this.travelMode.commandSelection + 1) % commands.length;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('QUIT')) {
      this.travelMode.commandMoving = true;
      this.statusMessage = `${state === 'hyperspace' ? 'Interstellar' : 'Planetary'} movement engaged.`;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('CYCLE_TARGET')) {
      this.activateRecommendedTravelCommand();
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      const selected = commands[this.travelMode.commandSelection];
      if (selected) this.executeCommandBarAction(selected.action);
      return true;
    }
    return true;
  }

  /** Handles travel observe cursor input. */
  private _handleTravelObserveCursorInput(): boolean {
    if (!this.travelMode.observeCursor) return false;
    const state = this.stateManager.state;
    if (state !== this.travelMode.observeCursor.mode) {
      this.travelMode.observeCursor = null;
      return false;
    }

    const bounds = this.getTravelObserveCursorBounds();
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.travelMode.observeCursor.dy = Math.max(-bounds.y, this.travelMode.observeCursor.dy - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.travelMode.observeCursor.dy = Math.min(bounds.y, this.travelMode.observeCursor.dy + 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.travelMode.observeCursor.dx = Math.max(-bounds.x, this.travelMode.observeCursor.dx - 1);
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.travelMode.observeCursor.dx = Math.min(bounds.x, this.travelMode.observeCursor.dx + 1);
      this.forceFullRender = true;
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
    ) {
      this.travelMode.observeCursor = null;
      this.statusMessage = 'Observation reticle cancelled.';
      this.forceFullRender = true;
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
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
          this.statusMessage = this.profilerVisible
            ? 'Performance profiler enabled.'
            : 'Performance profiler hidden.';
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
            // Replace previous terminal output so the new scan report starts cleanly.
            this.terminalOverlay.clear();
            this._handleScanRequest(actionResult.requestScan);
            this.statusMessage = ''; // Scan uses terminal, clear status bar
          } else if ('requestSystemPeek' in actionResult) {
            // Replace previous terminal output so the local survey starts cleanly.
            this.terminalOverlay.clear();
            this.scanCurrentHyperspaceCell();
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

  /** Executes the primary contextual action available to the player. */
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
          const rows = this.getStarbaseRows(this.stateManager.currentStarbase, this.starbaseMode.sectionId);
          this.activateStarbaseSelection(
            this.stateManager.currentStarbase,
            rows[this.getStarbaseSelection()]
          );
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

  /** Resolves and executes an action selected from the command bar. */
  private executeCommandBarAction(action: string): void {
    switch (action) {
      case 'TRAVEL_MOVE':
        this.travelMode.commandMoving = true;
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
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems().find((item) => item.id === 'map')
        );
        return;
      case 'ROVER_CARGO':
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems().find((item) => item.id === 'cargo')
        );
        return;
      case 'ROVER_MOVE':
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems().find((item) => item.id === 'move')
        );
        return;
      case 'ROVER_SCAN':
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems().find((item) => item.id === 'scan')
        );
        return;
      case 'ROVER_MINE':
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems().find((item) => item.id === 'mine')
        );
        return;
      case 'ROVER_ICON':
        this.activateSurfaceVehicleAction(
          this.getSurfaceVehicleMenuItems().find((item) => item.id === 'icon')
        );
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

  /** Scans local or selected system target if available. */
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

  /** Resolves and executes a gameplay action by its registered name. */
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
      this.scanCurrentHyperspaceCell();
      this.statusMessage = '';
    }

    if (this.stateManager.statusMessage) {
      this.statusMessage = this.stateManager.statusMessage;
      this.stateManager.statusMessage = '';
    }
  }

  /** Scans current hyperspace cell. */
  private scanCurrentHyperspaceCell(): void {
    const worldX = this.player.position.worldX;
    const worldY = this.player.position.worldY;
    const peekedSystem = this.stateManager.peekAtSystem(worldX, worldY);
    if (peekedSystem) {
      this._dumpScanToTerminal(peekedSystem);
      return;
    }

    const phenomenon = this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
    if (phenomenon.exists) {
      this.terminalOverlay.addMessageLines(this.formatDeepSpacePhenomenonScan(phenomenon, worldX, worldY));
      this.player.awardCrewExperience('astroscience', phenomenon.type === 'ancient-signal' ? 12 : 8);
      this.player.awardCrewExperience('communication', phenomenon.type === 'ancient-signal' ? 8 : 3);
      return;
    }

    this.terminalOverlay.addMessage(STATUS_MESSAGES.HYPERSPACE_SCAN_FAIL);
  }

  /** Chooses primary action. */
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
    return actions.find((action) => action.enabled && !excludedPrimaryIds.has(action.id)) ?? null;
  }

  /** Advances the selected navigation target and refreshes its signature. */
  private _cycleTarget(): void {
    const targets = this.getNavigationTargets();
    if (targets.length === 0) {
      this.statusMessage = 'No targets in current view.';
      return;
    }
    this.travelMode.currentTargetIndex = (this.travelMode.currentTargetIndex + 1) % targets.length;
    this.selectNavigationTarget(targets[this.travelMode.currentTargetIndex], false);
  }

  /** Opens target menu. */
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
    const selectedIndex = targets.findIndex(
      (target) => this.getTargetSignature(target) === selectedSignature
    );
    const visibleRows = this.getTargetMenuVisibleRows();
    const viewport = moveSelection(
      selectedIndex >= 0 ? selectedIndex : 0,
      0,
      targets.length,
      visibleRows,
      this.travelMode.targetMenuOffset
    );
    this.travelMode.targetMenuSelection = viewport.selectedIndex;
    this.travelMode.targetMenuOffset = viewport.viewOffset;
    this.targetMenuOpen = true;
    this.forceFullRender = true;
    this.statusMessage = 'Select navigation target.';
  }

  /** Closes target menu. */
  private closeTargetMenu(message: string = ''): void {
    this.targetMenuOpen = false;
    this.forceFullRender = true;
    this.statusMessage = message;
  }

  /** Selects navigation target. */
  private selectNavigationTarget(target: NavigationTarget, startApproach: boolean): void {
    const targets = this.getNavigationTargets();
    const signature = this.getTargetSignature(target);
    const index = targets.findIndex((candidate) => this.getTargetSignature(candidate) === signature);
    this.travelMode.currentTargetIndex = index >= 0 ? index : 0;
    this.travelMode.currentTargetSignature = signature;
    this.travelMode.approachTargetSignature = startApproach ? signature : null;
    if (startApproach) {
      this.setShipFacingTowardTarget(target);
      this.player.awardCrewExperience('navigation', 4);
      this.player.awardCrewExperience('piloting', 2);
    }
    this.statusMessage = startApproach
      ? `Approach assist engaged: ${this.getTargetName(target)}.`
      : `Target selected: ${this.getTargetName(target)}.`;
  }

  /** Starts approach assist. */
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
    this.travelMode.approachTargetSignature = this.getTargetSignature(target);
    this.setShipFacingTowardTarget(target);
    this.player.awardCrewExperience('navigation', 4);
    this.player.awardCrewExperience('piloting', 2);
    this.statusMessage = `Approach assist engaged: ${this.getTargetName(target)}.`;
  }

  /** Opens the help overlay at the section relevant to the current mode. */
  private _showHelpOverlay(): void {
    const actions = this.getCurrentAvailableActions().filter((action) => action.enabled);
    const lines = createHelpReferenceLines(this.stateManager.state, actions);
    this.popupContent = lines;
    this.popupState = 'opening';
    this.interfaceMode.open('popup');
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
    /** Returns whether move pressed. */
    const isMovePressed = (action: string) =>
      planetStepMode
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
      this.travelMode.approachTargetSignature = null;
      // Clear non-critical status messages when moving
      if (this.statusMessage && !/(error|fail|cannot|mined|sold|scan|purchased)/i.test(this.statusMessage)) {
        this.statusMessage = '';
      }

      const isFine = this.inputManager.isActionActive('FINE_CONTROL');
      const isBoost = this.inputManager.isActionActive('BOOST');
      const useFine = isFine && !isBoost;
      const currentState = this.stateManager.state;
      if ((currentState === 'hyperspace' || currentState === 'system') && !this.travelMode.commandMoving) {
        return;
      }
      if (currentState === 'planet' && (this.surfaceMode.mapExpanded || this.surfaceLegendOpen)) {
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
            this.statusMessage =
              'Disembark the terrain vehicle from ship operations before travelling overland.';
            return;
          }
          if (this.player.terrainVehicle.deployed && !this.player.terrainVehicle.moving) {
            return;
          }
          if (planet) {
            const surfaceData = readReadySurfaceData(planet);
            if (!surfaceData?.heightmap) {
              this.requestSurfacePreparation(planet);
              this.statusMessage = 'Surface navigation is waiting for terrain generation.';
              return;
            }
            const mapSize = surfaceData.heightmap.length;
            if (this.player.terrainVehicle.deployed && !this.consumeTerrainVehicleFuelForMove(planet)) {
              return;
            }
            if (this.player.terrainVehicle.onFoot) this.applyFootTravelRisk();
            moveData.surfaceContext = { mapSize };
          } else {
            logger.error(
              '[Game:_handleMovementInput] Player in planet state but currentPlanet is null during move.'
            );
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
    if (this._handleSurfaceExtractionSelectorInput()) {
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
    return getSystemViewScale(this.currentZoomLevelIndex);
  }

  /** Returns system cursor move speed multiplier. */
  private getSystemCursorMoveSpeedMultiplier(): number {
    return getSystemSimulationSpeedMultiplier(this.currentZoomLevelIndex);
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
      } else if (
        typeof target === 'object' &&
        target !== null &&
        'starType' in target &&
        'luminosityW' in target
      ) {
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
        if (
          target instanceof Planet ||
          target instanceof SolarSystem ||
          (typeof target === 'object' && target !== null && 'starType' in target && 'luminosityW' in target)
        ) {
          this.player.awardCrewExperience(
            target instanceof Planet ? 'geology' : 'astroscience',
            target instanceof Planet ? 8 : 10
          );
          this.player.awardCrewExperience('communication', 3);
          this.completeMissionsForScan(target as Planet | SolarSystem | StellarBody);
        }
      } else {
        logger.error(
          '[Game:_dumpScanToTerminal] Generated scan lines array was null or empty for target:',
          targetName
        );
        this.terminalOverlay.addMessage(
          `<e>Error: Failed to generate scan information for ${targetName}.</e>`
        );
      }
    } catch (error) {
      logger.error(`[Game:_dumpScanToTerminal] Error generating or sending scan content: ${error}`);
      const errorMsg = `<e>Scan Error: ${error instanceof Error ? error.message : 'Failed to get info'}</e>`;
      this.terminalOverlay.addMessage(errorMsg);
    }
  }

  /** Starts travel observe cursor. */
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
    this.travelMode.observeCursor = cursor;
    this.travelMode.commandMoving = false;
    this.statusMessage = `${mode === 'hyperspace' ? 'Interstellar' : 'Planetary'} observation reticle active. Arrows aim; Enter scans; Esc cancels.`;
    this.forceFullRender = true;
  }

  /** Returns travel view center. */
  private getTravelViewCenter(): { x: number; y: number } {
    return {
      x: Math.floor(this.renderer.getGridCols() / 2),
      y: Math.floor(this.renderer.getGridRows() / 2),
    };
  }

  /** Returns travel observe cursor bounds. */
  private getTravelObserveCursorBounds(): { x: number; y: number } {
    const center = this.getTravelViewCenter();
    return {
      x: Math.max(0, center.x - 1),
      y: Math.max(0, center.y - 1),
    };
  }

  /** Confirms travel observe cursor. */
  private confirmTravelObserveCursor(): void {
    const cursor = this.travelMode.observeCursor;
    if (!cursor) return;
    this.terminalOverlay.clear();
    if (cursor.mode === 'hyperspace') {
      this.scanHyperspaceObserveCursor(cursor);
    } else {
      this.scanSystemObserveCursor(cursor);
    }
    this.travelMode.observeCursor = null;
    this.forceFullRender = true;
  }

  /** Scans hyperspace observe cursor. */
  private scanHyperspaceObserveCursor(cursor: TravelObserveCursor): void {
    const worldX = this.player.position.worldX + cursor.dx;
    const worldY = this.player.position.worldY + cursor.dy;
    const props = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
    const phenomenon = props.exists
      ? null
      : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
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
    const lines = this.formatInterstellarObserveReport(
      target,
      worldX,
      worldY,
      quality,
      props.starType,
      props.objectKind
    );
    this.terminalOverlay.addMessageLines(lines);
    this.player.awardCrewExperience('astroscience', quality.confidence >= 60 ? 6 : 3);
    this.player.awardCrewExperience('communication', 2);
    if (quality.confidence >= 70) this.completeMissionsForScan(target);
    this.statusMessage = `Observed ${quality.label}.`;
  }

  /** Formats deep space phenomenon scan. */
  private formatDeepSpacePhenomenonScan(
    phenomenon: DeepSpacePhenomenonProperties,
    worldX: number,
    worldY: number
  ): string[] {
    const classification = phenomenon.classification ?? 'UNRESOLVED DEEP-SPACE SOURCE';
    const name = phenomenon.name ?? 'Uncatalogued return';
    const rarity = phenomenon.rarity ?? 'unclassified';
    const signal = phenomenon.signal ?? 'intermittent low-energy return';
    const lines = [
      '<h>DEEP-SPACE SIGNAL SCAN</h>',
      `SOURCE: <hl>${name}</hl>`,
      `CLASS: <hl>${classification}</hl>`,
      `GRID: <hl>${worldX},${worldY}</hl>  TRACE: <hl>${signal}</hl>`,
      `RARITY: <hl>${rarity}</hl>  MARKER: <hl>${phenomenon.char ?? '?'}</hl>`,
    ];

    switch (phenomenon.type) {
      case 'ancient-signal':
        lines.push(
          'Narrowband repetition is too regular for ordinary astrophysical noise. No language layer resolved.'
        );
        break;
      case 'debris-field':
        lines.push(
          'Cold artificial returns drift without transponder acknowledgement. Approach should be deliberate.'
        );
        break;
      case 'dark-nebula':
        lines.push(
          'Signal is mostly absence: background starlight is being absorbed by cold molecular dust.'
        );
        break;
      case 'neutron-star':
        lines.push('Compact remnant pulse timing is stable. Radiation discipline advised at closer range.');
        break;
      case 'black-hole':
        lines.push('No luminous primary resolved; lensing geometry suggests a compact mass concentration.');
        break;
      case 'rogue-planet':
        lines.push('Thermal remnant is consistent with a free planetary-mass object.');
        break;
      default:
        lines.push('Return is real but does not yet match a reliable local catalogue entry.');
    }

    return lines;
  }

  /** Returns interstellar observation quality. */
  private getInterstellarObservationQuality(
    cursor: TravelObserveCursor,
    starType: string | null,
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | null
  ): { confidence: number; rangeCells: number; label: string; signature: string; rangeLabel: string } {
    const rangeCells = Math.hypot(cursor.dx, cursor.dy);
    const starInfo = starType ? SPECTRAL_TYPES[starType] : null;
    const solarRadius = SPECTRAL_TYPES.G.radius || 1;
    const brightnessSignal = Math.sqrt(
      Math.max(0.02, starInfo?.brightness ?? (objectKind === 'rogue-planet' ? 0.025 : 0.12))
    );
    const radiusSignal = Math.sqrt(Math.max(0.05, (starInfo?.radius ?? solarRadius * 0.08) / solarRadius));
    const sourceStrength =
      objectKind === 'rogue-planet'
        ? 0.18
        : Math.max(0.12, Math.min(1.35, brightnessSignal * 0.66 + radiusSignal * 0.34));
    const confidence = Math.max(8, Math.min(98, Math.round((104 - rangeCells * 2.55) * sourceStrength)));
    const label =
      confidence >= 72
        ? 'resolved interstellar contact'
        : confidence >= 48
          ? 'probable stellar contact'
          : confidence >= 26
            ? objectKind === 'brown-dwarf'
              ? 'possible substellar source'
              : 'faint point-source'
            : 'weak unresolved return';
    const signature =
      confidence >= 72
        ? 'stable'
        : confidence >= 48
          ? 'usable but incomplete'
          : confidence >= 26
            ? 'noisy'
            : 'near background';
    const rangeLabel =
      confidence >= 60
        ? `${rangeCells.toFixed(1)} cells / ${formatHyperspaceSpan(rangeCells)}`
        : confidence >= 32
          ? `about ${Math.max(1, Math.round(rangeCells))} cells`
          : 'poorly constrained';
    return { confidence, rangeCells, label, signature, rangeLabel };
  }

  /** Formats interstellar observe report. */
  private formatInterstellarObserveReport(
    target: SolarSystem,
    worldX: number,
    worldY: number,
    quality: { confidence: number; rangeCells: number; label: string; signature: string; rangeLabel: string },
    starType: string | null,
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | null
  ): string[] {
    const classLabel =
      objectKind === 'rogue-planet'
        ? 'planetary-mass object'
        : objectKind === 'brown-dwarf'
          ? 'substellar infrared source'
          : 'stellar source';
    const identity =
      quality.confidence >= 72
        ? `${target.name} ${starType ?? target.starType}`
        : quality.confidence >= 48
          ? `${starType ? `${starType.slice(0, 1)}-class ` : ''}${classLabel}`
          : quality.label;
    const facilityTrace =
      quality.confidence >= 72 && target.starbase
        ? 'confirmed'
        : quality.confidence >= 50 && target.starbase
          ? 'possible'
          : 'none';
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
      lines.push(
        'Contact is stable enough for confident navigation, though full astrophysical detail requires system entry.'
      );
    }
    return lines;
  }

  /** Scans system observe cursor. */
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

  /** Returns navigation target at reticle. */
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

  /** Returns system target view position. */
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

  /** Selects and reports details for a visible hyperspace contact. */
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
    const rangeLabel =
      confidence > 65
        ? `${range.toFixed(1)} cells / ${formatHyperspaceSpan(range)}`
        : `~${Math.round(range)} cells`;
    const bearing = this.formatHyperspaceBearing(contact);
    const classification =
      confidence > 55
        ? `${contact.name} ${contact.starType}`
        : contact.objectKind === 'brown-dwarf'
          ? 'faint substellar contact'
          : 'stellar contact';
    this.terminalOverlay.addMessageLines([
      '<h>LONG-RANGE OBSERVATION</h>',
      `CONTACT: <hl>${classification}</hl>`,
      `BEARING: <hl>${bearing}</hl>  RANGE: <hl>${rangeLabel}</hl>`,
      `CONFIDENCE: <hl>${confidence}%</hl>  FACILITY TRACE: <hl>${contact.hasStarbase && confidence > 45 ? 'possible' : 'none'}</hl>`,
      range > 18
        ? 'Reading is smeared by distance and medium scattering.'
        : 'Reading is stable enough for approach decisions.',
    ]);
    this.statusMessage = `Observed ${classification}.`;
  }

  /** Selects and reports details for a target in the current solar system. */
  private observeSystemTarget(): void {
    const system = this.stateManager.currentSystem;
    const target = this.getSelectedTarget();
    this.terminalOverlay.clear();
    if (!system || !target) {
      this.terminalOverlay.addMessageLines([
        '<h>LOCAL OBSERVATION</h>',
        'No selected local target. Use the target menu or Tab first.',
      ]);
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
      lines.push(
        `DISC: <hl>${target.diameter.toLocaleString()} km</hl>  GRAVITY: <hl>${target.gravity.toFixed(2)}g</hl>`
      );
    } else if (!(target instanceof Planet) && confidence > 55) {
      lines.push(`SPECTRAL RETURN: <hl>${this.getTargetClassLabel(target)}</hl>`);
    } else {
      lines.push('Fine detail is below reliable passive resolution at this range.');
    }
    this.terminalOverlay.addMessageLines(lines);
    this.statusMessage = `Observed ${nameLabel}.`;
  }

  /** Completes missions whose objectives are satisfied by the latest scan. */
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
      lines.push(
        `Architecture: <hl>STARLESS</hl> (${primaryBody?.moons.length ?? 0} retained moon${primaryBody?.moons.length === 1 ? '' : 's'})`
      );
      lines.push(`Thermal Source: <hl>residual formation heat and tidal dissipation</hl>`);
      lines.push(`Chart Radius: <hl>${formatDistanceAu(system.edgeRadius)}</hl>`);
      lines.push(
        `One-way Light Time: <hl>${formatLightTimeFromMeters(system.edgeRadius)}</hl> to chart edge`
      );
      if (primaryBody) {
        lines.push(`Primary Body: <hl>${primaryBody.name}</hl> (${primaryBody.type})`);
        lines.push(
          `Mass: <hl>${primaryBody.mass.toExponential(2)} kg</hl> | Gravity: <hl>${primaryBody.gravity.toFixed(2)}g</hl>`
        );
        lines.push(
          `Temperature: <hl>avg ${primaryBody.surfaceTemp} K</hl> | <hl>min ${primaryBody.surfaceTempMin} K</hl> | <hl>max ${primaryBody.surfaceTempMax} K</hl>`
        );
      }
      lines.push(`Facilities: <hl>None Detected</hl>`);
      lines.push('<h>--- SCAN COMPLETE---</h>');
      lines.push(``);
      return lines;
    }
    const star: StellarBody = system ? system.stars[0] : (target as StellarBody);
    const starInfo = SPECTRAL_TYPES[star.starType];
    lines.push(``);
    lines.push(`<h>--- STELLAR SCAN: ${star.name} ---</h>`);
    if (system)
      lines.push(
        `Architecture: <hl>${system.architecture.kind.toUpperCase()}</hl> (${system.stars.length} star${system.stars.length === 1 ? '' : 's'})`
      );
    lines.push(`Spectral Type: <hl>${star.starType}</hl>`); // Use highlight tag
    lines.push(`Stellar Age: <hl>~${star.environment.ageGyr.toFixed(2)} Gyr</hl>`);
    lines.push(
      `Metallicity: <hl>${star.environment.metallicityFeH >= 0 ? '+' : ''}${star.environment.metallicityFeH.toFixed(2)} [Fe/H]</hl>`
    );
    if (starInfo) {
      lines.push(`Temperature: <hl>~${starInfo.temp.toLocaleString()} K</hl>`);
      // Calculate approx luminosity relative to Sol if possible
      const SUN_TEMP = SPECTRAL_TYPES['G'].temp;
      const SUN_RADIUS_M = 6.957e8;
      const starRadius_m = starInfo.radius ?? SUN_RADIUS_M;
      const relativeLuminosity =
        Math.pow(starInfo.temp / SUN_TEMP, 4) * Math.pow(starRadius_m / SUN_RADIUS_M, 2);
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
      lines.push(
        `One-way Light Time: <hl>${formatLightTimeFromMeters(system.edgeRadius)}</hl> to chart edge`
      );
      lines.push(`Planetary Bodies: <hl>${system.planets.filter((p) => p !== null).length}</hl>`);
      lines.push(`Facilities: <hl>${system.starbase ? 'Starbase Detected' : 'None Detected'}</hl>`);
    }
    lines.push('<h>--- SCAN COMPLETE---</h>');
    lines.push(``);
    return lines;
  }

  // --- Game State Update ---
  /** Updates. */
  private _update(deltaTime: number): void {
    this.captureCurrentPlanetMutations();
    let blockGameUpdates = false;
    if (!this.isGameClockPaused()) {
      this.gameClockElapsedSeconds += deltaTime * Game.SIMULATED_SECONDS_PER_REAL_SECOND;
    }

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
          this.interfaceMode.close('popup');
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
    if (!this.shipMenuOpen) {
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
        Math.max(
          1,
          Math.floor(this.renderer.getCanvas().width / Math.max(1, this.renderer.getCharWidthPx()))
        ),
        Math.max(
          1,
          Math.floor(this.renderer.getCanvas().height / Math.max(1, this.renderer.getCharHeightPx()))
        )
      );
    }

    // --- Update Core Game Logic (if not blocked by popup) ---
    if (!blockGameUpdates) {
      try {
        const currentState = this.stateManager.state;
        let stateUpdateStatus = ''; // Store status from state-specific updates

        stateUpdateStatus = this.modeDispatcher.dispatch(currentState, {
          hyperspace: () => this._updateHyperspace(deltaTime),
          system: () => this._updateSystem(deltaTime),
          orbit: () => this._updateOrbit(deltaTime),
          planet: () => this._updatePlanet(deltaTime),
          starbase: () => this._updateStarbase(deltaTime),
        });
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
        logger.error(
          `[Game:_update:${stateWhenErrorOccurred}] CRITICAL Error during update logic: ${errorMessage}`,
          {
            errorObject: updateError,
            stack: errorStack,
          }
        );
        this.statusMessage = `UPDATE ERROR: ${errorMessage}. Refresh required.`;
        this.stopGame(); // Stop on update errors
        // --- End Improved Error Logging ---
      }
    }
    // Always publish status bar update at the end of the update phase
    this._publishStatusUpdate();
  }

  // --- State-specific update methods ---
  /** Updates hyperspace. */
  private _updateHyperspace(_deltaTime: number): string {
    const viewportSignature = [
      this.player.position.worldX,
      this.player.position.worldY,
      this.renderer.getGridCols(),
      this.renderer.getGridRows(),
      this.player.resources.fuel.toFixed(3),
    ].join('|');
    if (viewportSignature === this.lastHyperspaceUpdateSignature) {
      return this.lastHyperspaceUpdateStatus;
    }

    // Check for nearby star system for status message
    const survey = this.getCurrentHyperspaceSurvey();
    const currentProps =
      survey.visibleCells[Math.floor(survey.rows / 2) * survey.cols + Math.floor(survey.cols / 2)]?.system ??
      this.systemDataGenerator.getSystemMapProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
    const isNearStar = currentProps.exists;
    const currentPhenomenon =
      survey.visibleCells[Math.floor(survey.rows / 2) * survey.cols + Math.floor(survey.cols / 2)]
        ?.phenomenon ??
      this.systemDataGenerator.getDeepSpacePhenomenonProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
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
      const peekedSystem = this.stateManager.peekAtSystem(
        this.player.position.worldX,
        this.player.position.worldY
      );
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
    this.lastHyperspaceUpdateSignature = viewportSignature;
    this.lastHyperspaceUpdateStatus = baseStatus;
    return baseStatus;
  }

  /** Returns current hyperspace survey. */
  private getCurrentHyperspaceSurvey() {
    const cols = Math.max(
      1,
      Math.floor(this.renderer.getCanvas().width / Math.max(1, this.renderer.getCharWidthPx()))
    );
    const rows = Math.max(
      1,
      Math.floor(this.renderer.getCanvas().height / Math.max(1, this.renderer.getCharHeightPx()))
    );
    return this.hyperspaceSurveyService.getSurvey(
      this.player.position.worldX,
      this.player.position.worldY,
      cols,
      rows
    );
  }

  /** Converts a detected object into a navigation contact model. */
  private toNavigationContact(contact: HyperspaceSurveyContact | null): HyperspaceNavigationContact | null {
    if (!contact || contact.kind !== 'system' || !contact.system?.name || !contact.system.starType)
      return null;
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

  /** Formats hyperspace bearing. */
  private formatHyperspaceBearing(contact: HyperspaceNavigationContact): string {
    if (contact.dx === 0 && contact.dy === 0) return 'HERE';
    const vertical = contact.dy < 0 ? 'N' : contact.dy > 0 ? 'S' : '';
    const horizontal = contact.dx < 0 ? 'W' : contact.dx > 0 ? 'E' : '';
    return `${vertical}${horizontal}`;
  }

  /** Updates system. */
  private _updateSystem(deltaTime: number): string {
    const system = this.stateManager.currentSystem;
    if (!system) {
      logger.error("[Game:_updateSystem] In 'system' state but currentSystem is null! Attempting recovery.");
      eventManager.publish(GameEvents.LEAVE_SYSTEM_REQUESTED); // Trigger leave process
      return 'System Error: Data missing. Returning to hyperspace.';
    }

    // Time scale adjustments
    const timeScaleMultiplier = getSystemSimulationSpeedMultiplier(this.currentZoomLevelIndex);
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
      const dist = Math.sqrt(
        this.player.distanceSqToSystemCoords(nearbyObject.systemX, nearbyObject.systemY)
      );
      status += ` | Near ${nearbyObject.name} (${(dist / AU_IN_METERS).toFixed(2)} AU).`; // Show dist in AU
    } else {
      // Check proximity to star for scanning
      const nearestStar =
        system.stars.length > 0
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
    const nearestStar =
      system.stars.length > 0
        ? system.getNearestStar(this.player.position.systemX, this.player.position.systemY)
        : null;
    const distSqToStar = nearestStar
      ? this.player.distanceSqToSystemCoords(nearestStar.systemX, nearestStar.systemY)
      : Infinity;
    const nearStar = Boolean(
      nearestStar && distSqToStar < (CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER) ** 2
    );
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

  /** Returns navigation targets. */
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

  /** Returns target menu targets. */
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

  /** Returns target menu visible rows. */
  private getTargetMenuVisibleRows(): number {
    return 12;
  }

  /** Creates target menu model. */
  private createTargetMenuModel(): TextModalTableModel {
    const system = this.stateManager.currentSystem;
    const targets = this.getTargetMenuTargets();
    const visibleRows = this.getTargetMenuVisibleRows();
    const viewport = moveSelection(
      this.travelMode.targetMenuSelection,
      0,
      targets.length,
      visibleRows,
      this.travelMode.targetMenuOffset
    );
    this.travelMode.targetMenuSelection = viewport.selectedIndex;
    this.travelMode.targetMenuOffset = viewport.viewOffset;

    return {
      title: 'Navigation Targets',
      subtitle: system ? `${system.name} local target index` : 'Local target index',
      columns: ['TYPE', 'NAME', 'RANGE', 'BRG'],
      widths: [8, 24, 10, 5],
      rows: targets.map((target) => this.createTargetMenuRow(target, system)),
      selectedIndex: this.travelMode.targetMenuSelection,
      viewOffset: this.travelMode.targetMenuOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down select  Enter approach  Esc/Left/Right cancel'],
    };
  }

  /** Creates target menu row. */
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

  /** Opens ship menu. */
  private openShipMenu(): void {
    if (!this.canOpenShipMenu()) {
      this.statusMessage = 'Ship menu unavailable while another interface is active.';
      return;
    }
    this.shipMenuOpen = true;
    this.shipOperations.selectionBySection = {};
    this.shipOperations.offsetBySection = {};
    this.openShipMenuSection('main');
    this.statusMessage = 'Ship operations menu opened.';
    this.forceFullRender = true;
  }

  /** Returns whether open ship menu is allowed. */
  private canOpenShipMenu(): boolean {
    return (
      this.stateManager.state !== 'starbase' &&
      this.stateManager.state !== 'orbit' &&
      this.popupState === 'inactive' &&
      !this.targetMenuOpen &&
      !this.roverCargoOpen &&
      !this.surfaceLegendOpen &&
      !this.quantitySelector &&
      !this.surfaceExtractionSelector &&
      !this.jettisonConfirmation
    );
  }

  /** Closes ship menu. */
  private closeShipMenu(message: string = ''): void {
    this.shipOperations.close();
    this.interfaceMode.close('ship-menu');
    this.statusMessage = message;
    this.forceFullRender = true;
  }

  /** Opens ship menu section. */
  private openShipMenuSection(section: ShipMenuSection): void {
    this.shipOperations.selectionBySection[this.shipOperations.section] = this.shipOperations.selection;
    this.shipOperations.offsetBySection[this.shipOperations.section] = this.shipOperations.offset;
    this.shipOperations.section = section;
    const rows = this.getShipMenuRows();
    const visibleRows = this.getShipMenuVisibleRows();
    const viewport = moveSelectionInRows(
      this.shipOperations.selectionBySection[section] ?? 0,
      0,
      rows,
      visibleRows,
      this.shipOperations.offsetBySection[section] ?? 0
    );
    this.shipOperations.selection = viewport.selectedIndex;
    this.shipOperations.offset = viewport.viewOffset;
    if (section !== 'jettison') this.shipOperations.jettisonItemKey = null;
    this.forceFullRender = true;
  }

  /** Moves ship menu selection. */
  private moveShipMenuSelection(delta: number, rows: TextTableRow[], visibleRows: number): void {
    const viewport = moveSelectionInRows(
      this.shipOperations.selection,
      delta,
      rows,
      visibleRows,
      this.shipOperations.offset
    );
    this.shipOperations.selection = viewport.selectedIndex;
    this.shipOperations.offset = viewport.viewOffset;
    this.forceFullRender = true;
  }

  /** Handles jettison confirmation input. */
  private _handleJettisonConfirmationInput(): boolean {
    if (!this.jettisonConfirmation) return false;

    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
    ) {
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
    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
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

  /** Handles surface extraction selector input. */
  private _handleSurfaceExtractionSelectorInput(): boolean {
    if (!this.surfaceExtractionSelector) return false;
    const selector = this.surfaceExtractionSelector;
    const visibleRows = this.getSurfaceExtractionVisibleRows();

    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM') ||
      this.inputManager.wasActionJustPressed('MOVE_LEFT') ||
      this.inputManager.wasActionJustPressed('MOVE_RIGHT')
    ) {
      this.closeSurfaceExtractionSelector(
        `${selector.mode === 'mine' ? 'Mining' : 'Pickup'} selection cancelled.`
      );
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      const viewport = moveSelection(
        selector.selectedIndex,
        -1,
        selector.options.length,
        visibleRows,
        selector.viewOffset
      );
      selector.selectedIndex = viewport.selectedIndex;
      selector.viewOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      const viewport = moveSelection(
        selector.selectedIndex,
        1,
        selector.options.length,
        visibleRows,
        selector.viewOffset
      );
      selector.selectedIndex = viewport.selectedIndex;
      selector.viewOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const viewport = moveSelection(
        selector.selectedIndex,
        -visibleRows,
        selector.options.length,
        visibleRows,
        selector.viewOffset
      );
      selector.selectedIndex = viewport.selectedIndex;
      selector.viewOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('PAGE_DOWN')) {
      const viewport = moveSelection(
        selector.selectedIndex,
        visibleRows,
        selector.options.length,
        visibleRows,
        selector.viewOffset
      );
      selector.selectedIndex = viewport.selectedIndex;
      selector.viewOffset = viewport.viewOffset;
      this.forceFullRender = true;
      return true;
    }

    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      const option = selector.options[selector.selectedIndex];
      this.surfaceExtractionSelector = null;
      if (selector.mode === 'mine') {
        this.openMiningQuantitySelector(option);
      } else {
        this.statusMessage = 'No recoverable surface items detected.';
        this.forceFullRender = true;
      }
      return true;
    }

    return true;
  }

  /** Closes surface extraction selector. */
  private closeSurfaceExtractionSelector(message: string): void {
    this.surfaceExtractionSelector = null;
    this.statusMessage = message;
    this.forceFullRender = true;
  }

  /** Returns whether cel jettison confirmation is allowed. */
  private cancelJettisonConfirmation(): void {
    this.jettisonConfirmation = null;
    this.statusMessage = 'Jettison cancelled.';
    this.forceFullRender = true;
  }

  /** Handles quantity selector input. */
  private _handleQuantitySelectorInput(): boolean {
    if (!this.quantitySelector) return false;

    if (
      this.inputManager.wasActionJustPressed('QUIT') ||
      this.inputManager.wasActionJustPressed('LEAVE_SYSTEM')
    ) {
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
    if (
      this.inputManager.wasActionJustPressed('ENTER_SYSTEM') ||
      this.inputManager.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      this.confirmQuantitySelector();
      return true;
    }

    return true;
  }

  /** Returns whether cel quantity selector is allowed. */
  private cancelQuantitySelector(): void {
    const operation = this.quantitySelector?.context.type;
    this.quantitySelector = null;
    const message = operation === 'mine' ? 'Mining cancelled.' : 'Transfer cancelled.';
    this.statusMessage = message;
    if (this.stateManager.state === 'starbase') this.starbaseMode.alert = message;
    this.forceFullRender = true;
  }

  /** Confirms quantity selector. */
  private confirmQuantitySelector(): void {
    if (!this.quantitySelector) return;
    const { value, context } = this.quantitySelector;
    this.quantitySelector = null;
    switch (context.type) {
      case 'buy':
        this.statusMessage = this.buyDepotItem(context.itemKey, value);
        this.starbaseMode.alert = this.statusMessage;
        break;
      case 'sell':
        this.statusMessage = this.sellDepotItem(context.itemKey, value);
        this.starbaseMode.alert = this.statusMessage;
        break;
      case 'jettison':
        this.openJettisonConfirmation(context.itemKey, value);
        break;
      case 'mine':
        if (context.x !== undefined && context.y !== undefined) {
          this.miningSystem.mineAt(context.x, context.y, value);
        } else {
          this.miningSystem.mine(value);
        }
        break;
    }
    this.forceFullRender = true;
  }

  /** Opens quantity selector. */
  private openQuantitySelector(selector: QuantitySelectorState<QuantityOperation>): void {
    this.quantitySelector = selector;
    this.forceFullRender = true;
  }

  /** Opens jettison confirmation. */
  private openJettisonConfirmation(itemKey: string, amount: number): void {
    this.jettisonConfirmation = { itemKey, amount, selectedIndex: 1 };
    this.statusMessage = 'Confirm cargo jettison.';
    this.forceFullRender = true;
  }

  /** Creates jettison confirmation model. */
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

  /** Opens mining quantity selector. */
  private openMiningQuantitySelector(selectedSite?: MiningSite): void {
    if (this.stateManager.state === 'planet' && !this.player.terrainVehicle.deployed) {
      this.statusMessage = 'Mining requires the terrain vehicle. Disembark from ship operations.';
      return;
    }
    if (!selectedSite) {
      const options = this.miningSystem.getMiningOptions();
      if (options.length > 1) {
        this.openSurfaceExtractionSelector('mine', options);
        return;
      }
      selectedSite = options[0];
    }
    const estimate = selectedSite ?? this.miningSystem.getMiningEstimate();
    if (!estimate.canMine || estimate.maxAmount <= 0) {
      this.statusMessage = estimate.message ?? 'Nothing mineable at this location.';
      return;
    }
    this.openQuantitySelector(
      createQuantitySelector({
        title: 'Mine Deposit',
        subject: `${estimate.elementName ?? estimate.elementKey ?? 'Deposit'} | ${this.formatSurfaceExtractionOffset(estimate)}`,
        detail: 'remaining local seam',
        unitLabel: 'm^3',
        max: estimate.maxAmount,
        value: estimate.maxAmount,
        step: 0.1,
        precision: 1,
        context: { type: 'mine', x: estimate.x, y: estimate.y },
      })
    );
  }

  /** Opens surface extraction selector. */
  private openSurfaceExtractionSelector(mode: 'mine' | 'pickup', options: MiningSite[]): void {
    this.surfaceExtractionSelector = {
      mode,
      options,
      selectedIndex: 0,
      viewOffset: 0,
    };
    this.statusMessage = mode === 'mine' ? 'Select nearby deposit.' : 'Select nearby object.';
    this.forceFullRender = true;
  }

  /** Returns surface extraction visible rows. */
  private getSurfaceExtractionVisibleRows(): number {
    return 9;
  }

  /** Creates surface extraction selector model. */
  private createSurfaceExtractionSelectorModel(): TextModalTableModel {
    const selector = this.surfaceExtractionSelector;
    const options = selector?.options ?? [];
    const visibleRows = this.getSurfaceExtractionVisibleRows();
    const viewport = moveSelection(
      selector?.selectedIndex ?? 0,
      0,
      options.length,
      visibleRows,
      selector?.viewOffset ?? 0
    );
    if (selector) {
      selector.selectedIndex = viewport.selectedIndex;
      selector.viewOffset = viewport.viewOffset;
    }
    const mode = selector?.mode ?? 'mine';
    return {
      title: mode === 'mine' ? 'Local Extraction' : 'Local Recovery',
      subtitle: mode === 'mine' ? 'Reachable mineral deposits' : 'Reachable surface objects',
      columns: ['SITE', 'MATERIAL', 'REMAINING', 'BEARING'],
      widths: [8, 20, 12, 14],
      rows: options.map((option, index) => ({
        id: `${mode}:${option.x ?? 0},${option.y ?? 0}:${option.elementKey ?? index}`,
        cells: [
          index === 0 ? 'PRIMARY' : `SITE ${index + 1}`,
          option.elementName ?? option.elementKey ?? 'Unknown',
          `${option.maxAmount.toFixed(1)} m^3`,
          this.formatSurfaceExtractionOffset(option),
        ],
        detail: `${option.elementName ?? option.elementKey ?? 'Deposit'} within terrain vehicle manipulator reach. Enter opens extraction quantity.`,
      })),
      selectedIndex: viewport.selectedIndex,
      viewOffset: viewport.viewOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down select  Enter choose  Esc/Left/Right cancel'],
    };
  }

  /** Formats surface extraction offset. */
  private formatSurfaceExtractionOffset(site: Pick<MiningSite, 'x' | 'y'>): string {
    if (site.x === undefined || site.y === undefined) return 'local site';
    const planet = this.stateManager.currentPlanet;
    const mapSize =
      planet?.surfaceElementMap?.length ?? planet?.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
    const dx = wrapDelta(site.x - this.player.position.surfaceX, mapSize);
    const dy = wrapDelta(site.y - this.player.position.surfaceY, mapSize);
    if (dx === 0 && dy === 0) return 'current square';
    return this.formatSurfaceDirection(dx, dy);
  }

  /** Returns surface vehicle menu items. */
  private getSurfaceVehicleMenuItems(): SurfaceVehicleMenuItem[] {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    const cargoLoad = this.formatCargoLoad(cargoTotal, this.player.terrainVehicle.cargoHold.capacity);
    const fuel = Math.max(0, this.player.terrainVehicle.fuel);
    const items: SurfaceVehicleMenuItem[] = [
      { id: 'map', label: 'Map', status: this.surfaceMode.mapExpanded ? 'expanded' : 'local' },
      { id: 'move', label: 'Move', status: fuel > 0 ? 'ready' : 'no fuel' },
      { id: 'cargo', label: 'Cargo', status: `${cargoLoad} m^3` },
      { id: 'pickup', label: 'Pick up', status: 'no local items' },
      { id: 'mine', label: 'Mine', status: `${cargoLoad} m^3` },
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

  /** Returns default surface vehicle menu selection. */
  private getDefaultSurfaceVehicleMenuSelection(): number {
    const items = this.getSurfaceVehicleMenuItems();
    const situationalIndex = items.findIndex((item) => item.id === 'embark');
    return situationalIndex >= 0 ? situationalIndex : 0;
  }

  /** Creates surface vehicle overlay model. */
  private createSurfaceVehicleOverlayModel() {
    const items = this.getSurfaceVehicleMenuItems();
    const cargo = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    this.surfaceMode.roverMenuSelection = clampIndex(this.surfaceMode.roverMenuSelection, items.length);
    return {
      dateTime: this.getGameDateTimeLabel(),
      notifications:
        this.surfaceMode.notifications.length > 0
          ? this.surfaceMode.notifications
          : [this.statusMessage].filter(Boolean),
      deployed: this.player.terrainVehicle.deployed,
      moving: this.player.terrainVehicle.moving,
      available: this.player.terrainVehicle.available,
      onFoot: this.player.terrainVehicle.onFoot,
      fuel: this.player.terrainVehicle.fuel,
      maxFuel: this.player.terrainVehicle.maxFuel,
      cargo,
      cargoCapacity: this.player.terrainVehicle.cargoHold.capacity,
      selectedIndex: this.surfaceMode.roverMenuSelection,
      items: items.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        tone: item.id === 'embark' ? ('green' as const) : ('normal' as const),
      })),
      mapExpanded: this.surfaceMode.mapExpanded,
      surfaceCellScale: this.surfaceMode.mapExpanded ? 1 : CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE,
      scanCursor: this.surfaceMode.scanCursor ?? undefined,
      crew: this.player.crew.map((member) => ({
        name: member.name,
        hitPoints: member.hitPoints,
        maxHitPoints: member.maxHitPoints,
      })),
      ship: {
        x: this.player.terrainVehicle.shipSurfaceX - this.player.position.surfaceX,
        y: this.player.terrainVehicle.shipSurfaceY - this.player.position.surfaceY,
      },
      shipDistance: this.getParkedShipRangeAndBearing(),
      atShip: this.isAtParkedShip(),
      altitudeBand: this.getCurrentSurfaceAltitudeBand(),
    };
  }

  /** Returns game date time label. */
  private getGameDateTimeLabel(): string {
    const date = new Date(Game.GAME_START_UTC_MS + Math.floor(this.gameClockElapsedSeconds) * 1000);
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
      date.getUTCMonth()
    ];
    const year = date.getUTCFullYear();
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} AD ${hours}:${minutes}`;
  }

  /** Formats cargo amount. */
  private formatCargoAmount(value: number): string {
    return roundCargoQuantity(value).toFixed(1);
  }

  /** Formats cargo load. */
  private formatCargoLoad(current: number, capacity: number): string {
    return `${this.formatCargoAmount(current)}/${Math.round(capacity)}`;
  }

  /** Opens rover cargo. */
  private openRoverCargo(): void {
    this.roverCargoOpen = true;
    this.surfaceMode.roverCargoSelection = 0;
    this.surfaceMode.roverCargoOffset = 0;
    this.player.terrainVehicle.moving = false;
    this.statusMessage = 'Terrain vehicle cargo opened.';
    this.forceFullRender = true;
  }

  /** Creates rover cargo model. */
  private createRoverCargoModel(): TextModalTableModel {
    const rows = this.getRoverCargoRows();
    const visibleRows = 8;
    const viewport = moveSelection(
      this.surfaceMode.roverCargoSelection,
      0,
      rows.length,
      visibleRows,
      this.surfaceMode.roverCargoOffset
    );
    this.surfaceMode.roverCargoSelection = viewport.selectedIndex;
    this.surfaceMode.roverCargoOffset = viewport.viewOffset;
    return {
      title: 'Terrain Vehicle Cargo',
      subtitle: 'Rover hold only. Enter drops selected cargo onto the planet surface.',
      columns: ['CARGO', 'QTY', 'VALUE', 'ACTION'],
      widths: [26, 7, 10, 36],
      rows,
      selectedIndex: this.surfaceMode.roverCargoSelection,
      viewOffset: this.surfaceMode.roverCargoOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down select  Enter drop stack  Esc/Left close'],
    };
  }

  /** Returns rover cargo rows. */
  private getRoverCargoRows(): TextTableRow[] {
    const entries = Object.entries(this.player.terrainVehicle.cargoHold.items).filter(
      ([, amount]) => amount > 0
    );
    if (entries.length === 0) {
      return [{ id: 'empty', cells: ['Rover hold empty', '0', '0', 'No cargo to drop.'], disabled: true }];
    }
    return entries.map(([itemKey, amount]) => {
      const info = this.getTradeItemInfo(itemKey);
      const value = (info?.baseValue ?? 1) * amount;
      return {
        id: itemKey,
        cells: [
          info?.name ?? itemKey,
          this.formatCargoAmount(amount),
          this.formatCargoAmount(value),
          'Drop on local surface',
        ],
        detail: `Drops ${this.formatCargoAmount(amount)} m^3 here. Surface item persistence is pending future salvage work.`,
      };
    });
  }

  /** Drops the selected rover cargo item onto the current surface cell. */
  private dropSelectedRoverCargo(row: TextTableRow | undefined): void {
    if (!row || row.disabled) return;
    const amount = this.player.terrainVehicle.cargoHold.items[row.id] || 0;
    if (amount <= 0) return;
    const removed = this.cargoSystem.removeItem(this.player.terrainVehicle.cargoHold, row.id, amount);
    const name = this.getTradeItemInfo(row.id)?.name ?? row.id;
    this.addSurfaceNotification(`Dropped ${this.formatCargoAmount(removed)} m^3 ${name} on the surface.`);
    this.statusMessage = `Dropped ${this.formatCargoAmount(removed)} m^3 ${name}.`;
    if (this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold) <= 0) {
      this.surfaceMode.roverCargoSelection = 0;
      this.surfaceMode.roverCargoOffset = 0;
    }
    this.forceFullRender = true;
  }

  /** Returns surface legend visible rows. */
  private getSurfaceLegendVisibleRows(): number {
    return 10;
  }

  /** Creates surface legend model. */
  private createSurfaceLegendModel(): TextModalTableModel {
    const rows = this.getSurfaceLegendRows();
    const visibleRows = this.getSurfaceLegendVisibleRows();
    const viewport = moveSelection(
      this.surfaceMode.legendSelection,
      0,
      rows.length,
      visibleRows,
      this.surfaceMode.legendOffset
    );
    this.surfaceMode.legendSelection = viewport.selectedIndex;
    this.surfaceMode.legendOffset = viewport.viewOffset;
    return {
      title: 'Surface Icon Legend',
      subtitle: 'Planetary surface symbols and instrument marks.',
      columns: ['ICON', 'SIGNATURE', 'MEANING'],
      widths: [8, 18, 56],
      rows,
      selectedIndex: this.surfaceMode.legendSelection,
      viewOffset: this.surfaceMode.legendOffset,
      visibleRowCount: visibleRows,
      footer: ['Up/Down inspect  PageUp/PageDown scroll  Esc/Left/Right close'],
    };
  }

  /** Returns surface legend rows. */
  private getSurfaceLegendRows(): TextTableRow[] {
    return [
      {
        id: 'player',
        cells: [
          this.player.render.char,
          'Crew position',
          'Current location of the active surface party or terrain vehicle.',
        ],
      },
      {
        id: 'ship',
        cells: ['S', 'Parked ship', 'Landed starship. Return here to embark or launch back to orbit.'],
      },
      {
        id: 'resource',
        cells: [
          '%',
          'Mineral return',
          'Concentrated local resource that can be mined if the vehicle is deployed.',
        ],
      },
      {
        id: 'scanner',
        cells: ['< >', 'Scan reticle', 'Flashing cursor around the selected local terrain cell.'],
      },
      {
        id: 'crosshair',
        cells: ['+', 'Local fix', 'Central surface navigation reference around the current position.'],
      },
      {
        id: 'high',
        cells: [
          'High',
          'Relief scale',
          'Upper terrain colours indicate ridges, uplands, or exposed high ground.',
        ],
      },
      {
        id: 'low',
        cells: [
          'Low',
          'Relief scale',
          'Lower terrain colours indicate basins, plains, or local depressions.',
        ],
      },
      {
        id: 'terrain',
        cells: [
          GLYPHS.BLOCK,
          'Terrain colour',
          'Surface colour is generated from planet type, height, atmosphere, and local conditions.',
        ],
      },
    ];
  }

  /** Starts surface cursor scan. */
  private startSurfaceCursorScan(): void {
    if (this.stateManager.state !== 'planet' || !this.stateManager.currentPlanet) {
      this.statusMessage = 'Surface scan requires a landed planet.';
      return;
    }
    this.player.terrainVehicle.moving = false;
    this.surfaceMode.scanCursor = { dx: 0, dy: 0 };
    this.addSurfaceNotification('Surface scanner active. Move cursor within the view; Enter/Space confirms.');
    this.forceFullRender = true;
  }

  /** Returns surface scan cursor bounds. */
  private getSurfaceScanCursorBounds(): { x: number; y: number } {
    const scale = Math.max(1, CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE);
    return {
      x: Math.max(1, Math.floor(Math.min(CONFIG.PLANET_SURFACE_VIEW_WIDTH, 92) / (2 * scale)) - 1),
      y: Math.max(1, Math.floor(CONFIG.PLANET_SURFACE_VIEW_HEIGHT / (2 * scale)) - 1),
    };
  }

  /** Confirms surface cursor scan. */
  private confirmSurfaceCursorScan(): void {
    const planet = this.stateManager.currentPlanet;
    const cursor = this.surfaceMode.scanCursor;
    if (!planet || !cursor) return;
    const surfaceData = readReadySurfaceData(planet);
    if (!surfaceData?.heightmap || !surfaceData.surfaceElementMap) {
      this.requestSurfacePreparation(planet);
      this.statusMessage = 'Surface scan is waiting for terrain generation.';
      return;
    }
    const map = surfaceData.heightmap;
    const elements = surfaceData.surfaceElementMap;
    const size = map?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
    const x = ((Math.floor(this.player.position.surfaceX + cursor.dx) % size) + size) % size;
    const y = Math.max(0, Math.min(size - 1, Math.floor(this.player.position.surfaceY + cursor.dy)));
    const height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, map?.[y]?.[x] ?? 0));
    const altitude = height / Math.max(1, CONFIG.PLANET_HEIGHT_LEVELS - 1);
    const elementKey = elements?.[y]?.[x] ?? '';
    const elementName = elementKey
      ? (this.getTradeItemInfo(elementKey)?.name ?? ELEMENTS[elementKey]?.name ?? elementKey)
      : 'no concentrated resource';
    const mined = planet.isMined(x, y);
    const lat = 90 - (y / Math.max(1, size - 1)) * 180;
    const lon = (x / size) * 360 - 180;
    this.surfaceMode.scanCursor = null;
    this.addSurfaceNotification(
      `Scan ${Math.round(Math.abs(lat))}${lat < 0 ? 'S' : 'N'} x ${Math.round(Math.abs(lon))}${lon < 0 ? 'W' : 'E'}: ${this.getSurfaceAltitudeLabel(altitude)} terrain.`
    );
    this.addSurfaceNotification(
      mined
        ? `${elementName} trace is depleted at this location.`
        : `Local return: ${elementName}. Altitude ${Math.round(altitude * 100)}%.`
    );
    this.addSurfaceNotification(
      `Temp ${planet.getCurrentTemperature()} K. Gravity ${planet.gravity.toFixed(2)}g. ${planet.atmosphere.density} atmosphere.`
    );
    this.statusMessage = 'Surface scan complete.';
    this.forceFullRender = true;
  }

  /** Adds surface notification. */
  private addSurfaceNotification(message: string): void {
    if (!message) return;
    this.surfaceMode.notifications = [message, ...this.surfaceMode.notifications].slice(0, 4);
  }

  /** Returns surface altitude label. */
  private getSurfaceAltitudeLabel(altitude: number): string {
    if (altitude > 0.78) return 'high ridge';
    if (altitude > 0.58) return 'upland';
    if (altitude < 0.22) return 'low basin';
    if (altitude < 0.38) return 'lowland';
    return 'broken plain';
  }

  /** Describes local surface conditions before the crew disembarks. */
  private describePlanetSurfaceForDisembark(planet: Planet | null): string[] {
    if (!planet) return ['Surface optics online.', 'No planetary description available.'];
    const terrain =
      planet.type === 'Oceanic'
        ? 'broad dark waterfields broken by mineral-bright margins'
        : planet.type === 'Frozen'
          ? 'pale fractured ice, shadowed basins, and wind-polished crust'
          : planet.type === 'Lunar'
            ? 'powder-grey regolith, crater rims, and hard black horizons'
            : 'rocky rises, low basins, and exposed mineral seams';
    const primaryGas = Object.keys(planet.atmosphere.composition)[0] ?? 'thin';
    const sky =
      planet.atmosphere.density === 'None'
        ? 'The sky is black and sharp; shadows fall without haze.'
        : `The ${primaryGas.toLowerCase()} air gives the horizon a thin ${planet.atmosphere.density.toLowerCase()} veil.`;
    return [
      `${planet.name}: ${terrain}.`,
      sky,
      `Current surface ${planet.getCurrentTemperature()} K; gravity ${planet.gravity.toFixed(2)}g.`,
    ];
  }

  /** Activates surface vehicle action. */
  private activateSurfaceVehicleAction(item: SurfaceVehicleMenuItem | undefined): void {
    if (!item) return;
    switch (item.id) {
      case 'map':
        this.surfaceMode.mapExpanded = true;
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
        this.surfaceMode.legendSelection = 0;
        this.surfaceMode.legendOffset = 0;
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

  /** Moves the crew from the parked ship into the terrain vehicle. */
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
    this.surfaceMode.roverMenuSelection = 1;
    this.surfaceMode.mapExpanded = false;
    this.surfaceLegendOpen = false;
    this.surfaceMode.notifications = this.describePlanetSurfaceForDisembark(this.stateManager.currentPlanet);
    this.statusMessage = 'Disembarked. Surface operations online.';
    this.addSurfaceNotification(this.statusMessage);
    this.closeShipMenu('');
    this.forceFullRender = true;
  }

  /** Docks the terrain vehicle and transfers its occupants back to the ship. */
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
    this.statusMessage =
      remaining > 0
        ? `Embarked. Transferred ${transferred} m^3; ${remaining} m^3 remains aboard rover.`
        : `Embarked. Transferred ${transferred} m^3 to ship hold.`;
    this.addSurfaceNotification(this.statusMessage);
    this.openSurfaceLandingOperationsMenu();
    this.forceFullRender = true;
  }

  /** Launches the parked ship from the surface into orbit. */
  private launchFromParkedShip(): void {
    if (!this.isAtParkedShip() || this.player.terrainVehicle.deployed || this.player.terrainVehicle.onFoot) {
      this.statusMessage = 'Launch requires being aboard the parked ship.';
      return;
    }
    this.shipMenuOpen = false;
    this.shipOperations.section = 'main';
    this.stateManager.launchFromSurfaceToOrbit();
    if (this.stateManager.statusMessage) {
      this.statusMessage = this.stateManager.statusMessage;
      this.stateManager.statusMessage = '';
    }
    this.forceFullRender = true;
  }

  /** Opens surface landing operations menu. */
  private openSurfaceLandingOperationsMenu(): void {
    if (this.stateManager.state !== 'planet') return;
    this.shipMenuOpen = true;
    this.shipOperations.section = 'main';
    this.shipOperations.selection = this.getShipMenuRows().findIndex((row) => row.id === 'rover');
    if (this.shipOperations.selection < 0) this.shipOperations.selection = 0;
    this.shipOperations.offset = 0;
    this.shipOperations.jettisonItemKey = null;
    this.forceFullRender = true;
  }

  /** Returns whether at parked ship. */
  private isAtParkedShip(): boolean {
    return (
      Math.floor(this.player.position.surfaceX) === Math.floor(this.player.terrainVehicle.shipSurfaceX) &&
      Math.floor(this.player.position.surfaceY) === Math.floor(this.player.terrainVehicle.shipSurfaceY)
    );
  }

  /** Returns parked ship range and bearing. */
  private getParkedShipRangeAndBearing(): { distanceKm: number; direction: string } {
    const dx = this.player.terrainVehicle.shipSurfaceX - this.player.position.surfaceX;
    const dy = this.player.terrainVehicle.shipSurfaceY - this.player.position.surfaceY;
    return {
      distanceKm: Math.sqrt(dx * dx + dy * dy) * this.getSurfaceCellKilometers(),
      direction: this.formatSurfaceDirection(dx, dy),
    };
  }

  /** Returns surface cell kilometers. */
  private getSurfaceCellKilometers(): number {
    const planet = this.stateManager.currentPlanet;
    if (!planet) return 1;
    const mapSize = Math.max(1, planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE);
    const radiusKm = Math.max(1, planet.diameter / 2);
    return (2 * Math.PI * radiusKm) / mapSize;
  }

  /** Formats surface direction. */
  private formatSurfaceDirection(dx: number, dy: number): string {
    if (Math.round(dx) === 0 && Math.round(dy) === 0) return 'Here';
    const vertical = dy < 0 ? 'North' : dy > 0 ? 'South' : '';
    const horizontal = dx > 0 ? 'East' : dx < 0 ? 'West' : '';
    return vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal;
  }

  /** Returns current surface altitude band. */
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

  /** Transfers rover cargo into available ship storage. */
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

  /** Consumes terrain-vehicle fuel for one surface movement step. */
  private consumeTerrainVehicleFuelForMove(planet: Planet): boolean {
    const map = planet.heightmap;
    const size = map?.length ?? 0;
    const x = size > 0 ? ((Math.floor(this.player.position.surfaceX) % size) + size) % size : 0;
    const y = size > 0 ? Math.max(0, Math.min(size - 1, Math.floor(this.player.position.surfaceY))) : 0;
    const height = size > 0 ? Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, map?.[y]?.[x] ?? 0)) : 0;
    const altitude = height / Math.max(1, CONFIG.PLANET_HEIGHT_LEVELS - 1);
    const cost =
      CONFIG.TERRAIN_VEHICLE_MOVE_FUEL_BASE * (1 + altitude * CONFIG.TERRAIN_VEHICLE_ALTITUDE_FUEL_FACTOR);
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

  /** Applies foot travel risk. */
  private applyFootTravelRisk(): void {
    if (this.gameSeedPRNG.random() >= CONFIG.FOOT_TRAVEL_DAMAGE_CHANCE) return;
    const living = this.player.crew.filter((member) => member.hitPoints > 0);
    if (living.length === 0) return;
    const victim = living[this.gameSeedPRNG.randomInt(0, living.length - 1)];
    const damage = this.gameSeedPRNG.randomInt(1, 3);
    victim.hitPoints = Math.max(0, victim.hitPoints - damage);
    this.addSurfaceNotification(`${victim.name} takes ${damage} damage crossing exposed ground on foot.`);
  }

  /** Activates ship menu selection. */
  private activateShipMenuSelection(row: TextTableRow | undefined): void {
    if (!row || row.disabled) return;
    if (this.shipOperations.section === 'main') {
      if (row.id === 'launch') {
        this.launchFromParkedShip();
        return;
      }
      if (
        row.id === 'deck' ||
        row.id === 'stations' ||
        row.id === 'cargo' ||
        row.id === 'crew' ||
        row.id === 'status' ||
        row.id === 'log' ||
        row.id === 'rover'
      ) {
        this.openShipMenuSection(row.id as ShipMenuSection);
      }
      return;
    }
    if (this.shipOperations.section === 'rover') {
      if (row.id === 'rover:deploy') this.disembarkTerrainVehicle();
      if (row.id === 'rover:embark') this.dockTerrainVehicle();
      if (row.id === 'rover:launch') this.launchFromParkedShip();
      return;
    }
    if (this.shipOperations.section === 'deck' && row.id.startsWith('deck:')) {
      this.focusShipCompartment(row.id.slice('deck:'.length));
      return;
    }
    if (this.shipOperations.section === 'stations' && row.id.startsWith('station:')) {
      this.focusShipCompartment(row.id.slice('station:'.length));
      return;
    }
    if (this.shipOperations.section === 'cargo') {
      if (row.id.startsWith('cargo:')) {
        this.openJettisonQuantitySelector(row.id.slice('cargo:'.length));
      }
      return;
    }
    if (this.shipOperations.section === 'jettison') {
      this.activateJettisonSelection(row);
    }
  }

  /** Moves ship-menu focus to the requested compartment. */
  private focusShipCompartment(compartmentId: string): void {
    const compartment = getShipCompartment(compartmentId);
    this.currentShipCompartmentId = compartment.id;
    this.statusMessage = `Ship focus: ${compartment.label}.`;
    this.forceFullRender = true;
  }

  /** Activates jettison selection. */
  private activateJettisonSelection(row: TextTableRow): void {
    if (row.id === 'cancel') {
      this.openShipMenuSection('cargo');
      this.statusMessage = 'Jettison cancelled.';
      return;
    }
    const itemKey = this.shipOperations.jettisonItemKey;
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

  /** Opens jettison quantity selector. */
  private openJettisonQuantitySelector(itemKey: string): void {
    const held = this.player.cargoHold.items[itemKey] || 0;
    const name = this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    if (held <= 0) {
      this.statusMessage = `No ${name} aboard.`;
      return;
    }
    this.openQuantitySelector(
      createQuantitySelector({
        title: 'Jettison Cargo',
        subject: name,
        detail: 'external bay purge',
        unitLabel: 'm^3',
        max: held,
        value: held,
        context: { type: 'jettison', itemKey },
      })
    );
  }

  /** Removes the selected cargo quantity after confirmation. */
  private jettisonCargoItem(itemKey: string, amount: number): string {
    const removed = this.cargoSystem.removeItem(this.player.cargoHold, itemKey, amount);
    const name = this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    eventManager.publish(GameEvents.PLAYER_CARGO_REMOVED, { elementKey: itemKey, amountRemoved: removed });
    return removed > 0 ? `Jettisoned ${removed} m^3 ${name}.` : `No ${name} jettisoned.`;
  }

  /** Returns ship menu visible rows. */
  private getShipMenuVisibleRows(): number {
    if (this.shipOperations.section === 'status') return 18;
    return 12;
  }

  /** Creates ship menu model. */
  private createShipMenuModel(): TextModalTableModel {
    const rows = this.getShipMenuRows();
    const visibleRows = this.getShipMenuVisibleRows();
    const viewport = moveSelectionInRows(
      this.shipOperations.selection,
      0,
      rows,
      visibleRows,
      this.shipOperations.offset
    );
    this.shipOperations.selection = viewport.selectedIndex;
    this.shipOperations.offset = viewport.viewOffset;
    const meta = this.getShipMenuMeta();
    return {
      title: meta.title,
      subtitle: meta.subtitle,
      columns: meta.columns,
      widths: meta.widths,
      rows,
      selectedIndex: this.shipOperations.selection,
      viewOffset: this.shipOperations.offset,
      visibleRowCount: visibleRows,
      detailLineCount: this.shipOperations.section === 'main' ? 2 : 1,
      footer: meta.footer,
      dashboard: this.shipOperations.section === 'status' ? this.getShipStatusDashboard() : undefined,
    };
  }

  /** Returns ship menu meta. */
  private getShipMenuMeta(): {
    title: string;
    subtitle: string;
    columns: string[];
    widths: number[];
    footer: string[];
  } {
    const backHint = this.shipOperations.section === 'main' ? 'Esc/Left close' : 'Esc/Left back';
    switch (this.shipOperations.section) {
      case 'deck':
        return {
          title: 'Ship Deck Plan',
          subtitle: `${getShipCompartment(this.currentShipCompartmentId).label} is the current internal focus.`,
          columns: ['DECK', 'COMPARTMENT', 'WATCH', 'STATE', 'READOUT'],
          widths: [6, 20, 17, 10, 35],
          footer: [`Up/Down select  Enter focus compartment  ${backHint}`],
        };
      case 'stations':
        return {
          title: 'Ship Stations',
          subtitle: 'Crewed work points and instrument ownership.',
          columns: ['STATION', 'SKILL', 'BEST', 'STATE', 'READOUT'],
          widths: [20, 16, 6, 10, 36],
          footer: [`Up/Down select  Enter focus station  ${backHint}`],
        };
      case 'cargo':
        return {
          title: 'Ship Cargo',
          subtitle: 'Hold manifest, mass load, and external ejection controls.',
          columns: ['BAY / CARGO', 'QTY', 'VALUE', 'LOAD / ACTION'],
          widths: [26, 7, 10, 34],
          footer: [`Up/Down select  Enter jettison options  ${backHint}`],
        };
      case 'crew':
        return {
          title: 'Crew Records',
          subtitle: 'Personnel vitals, readiness, and specialist coverage.',
          columns: ['CREW', 'DUTY', 'VITALS', 'READINESS / SKILLS'],
          widths: [20, 16, 13, 41],
          footer: [`Up/Down inspect  ${backHint}`],
        };
      case 'status':
        return {
          title: 'Ship Status',
          subtitle: 'Primary shipboard systems, drive economy, and operating posture.',
          columns: ['VESSEL DIAGRAM', 'READOUT'],
          widths: [62, 34],
          footer: ['Esc/Left back'],
        };
      case 'log':
        return {
          title: 'Ship Log',
          subtitle: 'Chronicle, fixes, anomalies, and watch notes recorded by ship systems.',
          columns: ['LOG', 'CHANNEL', 'STATE', 'ENTRY'],
          widths: [8, 12, 13, 55],
          footer: [`Up/Down inspect  PageUp/PageDown scroll  ${backHint}`],
        };
      case 'rover':
        return {
          title: 'Terrain Vehicle',
          subtitle: 'Planetside disembark, embark, fuel, cargo, and surface sortie state.',
          columns: ['SYSTEM', 'READING', 'STATE', 'ACTION'],
          widths: [18, 18, 13, 42],
          footer: [`Up/Down select  Enter use  ${backHint}`],
        };
      case 'jettison':
        return {
          title: 'Confirm Jettison',
          subtitle: 'External bay doors armed. Cargo ejection is permanent.',
          columns: ['VENT', 'CARGO', 'AFTER', 'CONFIRMATION'],
          widths: [10, 24, 14, 40],
          footer: [`Enter confirms selected amount  ${backHint}`],
        };
      case 'main':
      default:
        return {
          title: 'Ship Operations',
          subtitle: 'Quiet shipboard console. HUD overlays are muted while this panel is open.',
          columns: ['SECTION', 'STATUS'],
          widths: [26, 28],
          footer: ['Up/Down select  Enter/Right open  Esc/Left close'],
        };
    }
  }

  /** Returns ship menu rows. */
  private getShipMenuRows(): TextTableRow[] {
    switch (this.shipOperations.section) {
      case 'deck':
        return this.getShipDeckMenuRows();
      case 'stations':
        return this.getShipStationMenuRows();
      case 'cargo':
        return this.getShipCargoMenuRows();
      case 'crew':
        return this.getShipCrewMenuRows();
      case 'status':
        return [];
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
          {
            id: 'deck',
            cells: ['Deck Plan', `Focus: ${focus.label}`],
            detail: 'Internal compartments, active watch location, and the ship as a traversable place.',
            cellTones: ['cyan', 'bright'],
            detailTone: 'cyan',
          },
          {
            id: 'stations',
            cells: ['Duty Stations', this.getShipStationCoverageLabel()],
            detail: 'Crewed navigation, survey, engineering, medical, communications, and bay-control posts.',
            cellTones: ['cyan', 'green'],
            detailTone: 'cyan',
          },
          {
            id: 'cargo',
            cells: [
              'Cargo Manifest',
              `${this.formatCargoLoad(cargoTotal, this.player.cargoHold.capacity)} m^3 aboard`,
            ],
            detail: `${this.formatGauge(cargoTotal, this.player.cargoHold.capacity, 14)} Ship hold inventory, rover transfer state, and external jettison control.`,
            cellTones: ['cyan', this.getCargoTone(cargoTotal, this.player.cargoHold.capacity)],
            detailTone: 'cyan',
          },
          {
            id: 'crew',
            cells: [
              'Crew Records',
              wounded > 0 ? `${wounded} wounded` : `${this.player.crew.length} fit for duty`,
            ],
            detail: 'Roster, vitals, learning progress, and specialist coverage.',
            cellTones: ['cyan', wounded > 0 ? 'amber' : 'green'],
            detailTone: wounded > 0 ? 'amber' : 'cyan',
          },
          {
            id: 'status',
            cells: [
              'Ship Status',
              `${this.getShipOperatingState()} / Drive C${this.player.ship.engineClass}`,
            ],
            detail:
              'Fuel reserve, drive economy, damage, modules, cargo capacity, finance, and navigation posture.',
            cellTones: ['cyan', 'bright'],
            detailTone: 'cyan',
          },
          {
            id: 'log',
            cells: ['Ship Log', this.getShipLogSummary()],
            detail: 'Persistent watch notes, discoveries, mission state, and navigation fixes.',
            cellTones: ['cyan', this.statusMessage ? 'amber' : 'green'],
            detailTone: 'cyan',
          },
        ];
        if (this.stateManager.state === 'planet') {
          rows.splice(3, 0, {
            id: 'rover',
            cells: [
              'Terrain Vehicle',
              this.player.terrainVehicle.available
                ? this.player.terrainVehicle.deployed
                  ? 'surface sortie active'
                  : `${this.formatCargoLoad(roverTotal, this.player.terrainVehicle.cargoHold.capacity)} m^3 stowed`
                : 'vehicle lost',
            ],
            detail: 'Disembark, embark, refuel, review rover cargo, and manage the planetside sortie.',
            cellTones: ['cyan', this.player.terrainVehicle.available ? 'green' : 'red'],
            detailTone: this.player.terrainVehicle.available ? 'cyan' : 'red',
          });
          rows.splice(4, 0, {
            id: 'launch',
            cells: [
              'Launch To Orbit',
              this.isAtParkedShip() &&
              !this.player.terrainVehicle.deployed &&
              !this.player.terrainVehicle.onFoot
                ? 'ready'
                : 'parked ship req.',
            ],
            detail: 'Lift from the landed ship to orbital view.',
            disabled:
              !this.isAtParkedShip() ||
              this.player.terrainVehicle.deployed ||
              this.player.terrainVehicle.onFoot,
            cellTones: [
              'cyan',
              this.isAtParkedShip() &&
              !this.player.terrainVehicle.deployed &&
              !this.player.terrainVehicle.onFoot
                ? 'green'
                : 'amber',
            ],
            detailTone: 'cyan',
          });
        }
        return rows;
    }
  }

  /** Returns ship deck menu rows. */
  private getShipDeckMenuRows(): TextTableRow[] {
    return createShipDeckRows(this.getShipPlaceContext());
  }

  /** Returns ship station menu rows. */
  private getShipStationMenuRows(): TextTableRow[] {
    return createShipStationRows(this.getShipPlaceContext());
  }

  /** Returns ship place context. */
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

  /** Returns ship station coverage label. */
  private getShipStationCoverageLabel(): string {
    const critical = [
      'navigation',
      'astroscience',
      'engineering',
      'medicine',
      'communication',
    ] as CrewSkill[];
    const covered = critical.filter((skill) => getBestCrewSkill(this.player.crew, skill) > 0).length;
    return `${covered}/${critical.length} crewed`;
  }

  /** Returns ship cargo menu rows. */
  private getShipCargoMenuRows(): TextTableRow[] {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const roverTotal = this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold);
    const rows: TextTableRow[] = [
      {
        id: 'cargo-overview',
        cells: [
          'Hold capacity',
          this.formatCargoAmount(cargoTotal),
          `${this.player.cargoHold.capacity}`,
          `${this.formatGauge(cargoTotal, this.player.cargoHold.capacity, 18)} ${this.getCargoLoadLabel(cargoTotal)}`,
        ],
        detail: `${this.formatCargoAmount(this.player.cargoHold.capacity - cargoTotal)} m^3 free. Jettisoned cargo is unrecoverable in the current build.`,
        disabled: true,
        cellTones: [
          'cyan',
          this.getCargoTone(cargoTotal, this.player.cargoHold.capacity),
          'bright',
          this.getCargoTone(cargoTotal, this.player.cargoHold.capacity),
        ],
        detailTone: 'cyan',
      },
    ];
    const shipCargoRows = this.getCargoRowsForHold(this.player.cargoHold.items, 'ship').map(
      (row, index): TextTableRow => ({
        id: row.disabled ? row.id : `cargo:${row.id}`,
        cells: [
          row.disabled ? row.cells[0] : `Bay ${String(index + 1).padStart(2, '0')} ${row.cells[0]}`,
          row.cells[1],
          row.cells[2],
          row.disabled
            ? 'No cargo aboard'
            : `${this.formatGauge(Number(row.cells[1]), Math.max(1, cargoTotal), 12)} Enter to arm ejector`,
        ],
        detail: row.disabled ? row.detail : `${row.detail ?? row.cells[0]} Select to choose jettison amount.`,
        disabled: row.disabled,
        cellTones: row.disabled ? ['muted', 'muted', 'muted', 'muted'] : ['green', 'bright', 'amber', 'cyan'],
        detailTone: row.disabled ? 'muted' : 'cyan',
      })
    );
    const roverCargoRows = this.getCargoRowsForHold(this.player.terrainVehicle.cargoHold.items, 'rover').map(
      (row): TextTableRow => ({
        id: `rover:${row.id}`,
        cells: [
          row.disabled ? row.cells[0] : `Rover ${row.cells[0]}`,
          row.cells[1],
          row.cells[2],
          row.disabled ? 'Vehicle bay empty' : 'Terrain vehicle cargo; docks into ship when space permits',
        ],
        detail: row.detail,
        disabled: true,
        cellTones: row.disabled ? ['muted', 'muted', 'muted', 'muted'] : ['cyan', 'bright', 'amber', 'green'],
        detailTone: row.disabled ? 'muted' : 'cyan',
      })
    );
    return [
      ...rows,
      {
        id: 'ship-heading',
        cells: [
          '-- Ship Hold --',
          this.formatCargoAmount(cargoTotal),
          `${this.player.cargoHold.capacity}`,
          'Primary cargo bay',
        ],
        disabled: true,
        skipSelection: true,
        cellTones: ['muted', 'cyan', 'cyan', 'muted'],
        detailTone: 'muted',
      },
      ...shipCargoRows,
      {
        id: 'rover-heading',
        cells: [
          '-- Terrain Vehicle --',
          this.formatCargoAmount(roverTotal),
          `${this.player.terrainVehicle.cargoHold.capacity}`,
          this.player.terrainVehicle.deployed ? 'Out on surface' : 'Docked in vehicle bay',
        ],
        disabled: true,
        skipSelection: true,
        cellTones: ['muted', 'cyan', 'cyan', this.player.terrainVehicle.deployed ? 'amber' : 'muted'],
        detailTone: 'muted',
      },
      ...roverCargoRows,
    ];
  }

  /** Returns terrain vehicle menu rows. */
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
          rover.deployed || rover.onFoot
            ? 'Enter embarks at parked ship and transfers cargo.'
            : 'Enter disembarks with full rover fuel.',
        ],
        disabled: !onSurface || (!rover.available && !rover.onFoot),
        cellTones: [
          'cyan',
          rover.onFoot ? 'amber' : rover.deployed ? 'green' : 'bright',
          rover.available ? 'green' : 'red',
          'cyan',
        ],
        detailTone: rover.available ? 'cyan' : 'red',
      },
      {
        id: 'rover:launch',
        cells: [
          'Launch',
          atShip && !rover.deployed && !rover.onFoot ? 'ready' : 'parked ship req.',
          onSurface ? 'orbit' : 'locked',
          'Launch from landed ship to orbital view.',
        ],
        disabled: !onSurface || !atShip || rover.deployed || rover.onFoot,
        cellTones: [
          'cyan',
          atShip && !rover.deployed && !rover.onFoot ? 'green' : 'amber',
          onSurface ? 'bright' : 'muted',
          'cyan',
        ],
        detailTone: atShip ? 'cyan' : 'amber',
      },
      {
        id: 'rover-fuel',
        cells: [
          'Vehicle fuel',
          `${rover.fuel.toFixed(1)}/${rover.maxFuel}`,
          rover.fuel > 0 ? 'ready' : 'empty',
          `${this.formatGauge(rover.fuel, rover.maxFuel, 20)} altitude raises consumption`,
        ],
        disabled: true,
        cellTones: [
          'cyan',
          this.getFuelTone(rover.fuel, rover.maxFuel),
          rover.fuel > 0 ? 'green' : 'red',
          this.getFuelTone(rover.fuel, rover.maxFuel),
        ],
        detailTone: this.getFuelTone(rover.fuel, rover.maxFuel),
      },
      {
        id: 'rover-cargo',
        cells: [
          'Vehicle cargo',
          `${this.formatCargoLoad(cargoTotal, rover.cargoHold.capacity)} m^3`,
          this.getCargoLoadLabel(cargoTotal),
          `${this.formatGauge(cargoTotal, rover.cargoHold.capacity, 20)} transfers on dock`,
        ],
        disabled: true,
        cellTones: [
          'cyan',
          this.getCargoTone(cargoTotal, rover.cargoHold.capacity),
          this.getCargoTone(cargoTotal, rover.cargoHold.capacity),
          'green',
        ],
        detailTone: 'cyan',
      },
      {
        id: 'rover-controls',
        cells: [
          'Surface controls',
          rover.moving ? 'moving' : 'stopped',
          'menu',
          rover.moving ? 'Enter/Space stops; arrows drive.' : 'Stopped: arrows select rover actions.',
        ],
        disabled: true,
        cellTones: ['cyan', rover.moving ? 'green' : 'bright', 'cyan', 'bright'],
        detailTone: 'cyan',
      },
    ];
  }

  /** Returns ship crew menu rows. */
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
        cellTones: ['cyan', 'bright', this.getCrewHealthTone(), 'green'],
        detailTone: 'cyan',
      },
    ];
    return [
      ...rows,
      ...crew.map((member): TextTableRow => {
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
          cellTones: [
            'bright',
            'cyan',
            this.getMemberHealthTone(member),
            member.trainingPoints > 0 ? 'amber' : 'green',
          ],
          detailTone: member.trainingPoints > 0 ? 'amber' : 'cyan',
        };
      }),
    ];
  }

  /** Returns ship status dashboard. */
  private getShipStatusDashboard() {
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const stateLabel =
      this.stateManager.state === 'planet'
        ? `Surface: ${this.stateManager.currentPlanet?.name ?? 'unknown'}`
        : this.stateManager.state;
    return createShipStatusDashboard({
      ship: this.player.ship,
      stats: getShipDerivedStats(this.player.ship),
      crew: this.player.crew,
      cargoTotal,
      cargoCapacity: this.player.cargoHold.capacity,
      fuel: Math.round(this.player.resources.fuel),
      maxFuel: this.player.resources.maxFuel,
      credits: this.player.resources.credits,
      worldX: this.player.position.worldX,
      worldY: this.player.position.worldY,
      stateLabel,
      operatingState: this.getShipOperatingState(),
      crewHealthLabel: this.getCrewHealthLabel(),
      terrainVehicleAvailable: this.player.terrainVehicle.available,
    });
  }

  /** Returns ship log menu rows. */
  private getShipLogMenuRows(): TextTableRow[] {
    const rows: TextTableRow[] = [];
    const state = this.stateManager.state;
    const system = this.stateManager.currentSystem;
    const planet = this.stateManager.currentPlanet;
    const target = this.getSelectedTarget();
    const cargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const activeMissionCount = Object.keys(this.activeMissions).length;

    rows.push(
      this.createShipLogRow(
        '001',
        'NAV',
        'FIX',
        this.getShipPositionLogEntry(),
        'Current navigational fix and vessel state at the time the log panel was opened.'
      )
    );
    rows.push(
      this.createShipLogRow(
        '002',
        'SHIP',
        this.getShipOperatingState().toUpperCase(),
        `Fuel ${Math.round(this.player.resources.fuel)}/${this.player.resources.maxFuel} | Cargo ${this.formatCargoLoad(cargoTotal, this.player.cargoHold.capacity)} m^3 | Shields C${this.player.ship.shieldClass || '-'} | Laser C${this.player.ship.laserClass || '-'} | Missiles ${this.player.ship.missileCount}/${this.player.ship.missileCapacity}.`,
        'Core shipboard resources, fitted combat systems, and current watch posture.'
      )
    );
    rows.push(
      this.createShipLogRow(
        '003',
        'CREW',
        this.getCrewHealthLabel().toUpperCase(),
        `Best skills: Nav ${getBestCrewSkill(this.player.crew, 'navigation')}  Astro ${getBestCrewSkill(this.player.crew, 'astroscience')}  Eng ${getBestCrewSkill(this.player.crew, 'engineering')}  Med ${getBestCrewSkill(this.player.crew, 'medicine')}.`,
        'Crew readiness, specialist coverage, and available shipboard judgement.'
      )
    );

    if (system) {
      rows.push(
        this.createShipLogRow(
          '004',
          'SURVEY',
          state.toUpperCase(),
          `${system.name} | ${system.architecture.kind} architecture | ${system.planets.filter(Boolean).length} indexed planetary bodies.`,
          'System summary compiled from the current navigation database.'
        )
      );
    } else {
      rows.push(
        this.createShipLogRow(
          '004',
          'SURVEY',
          'VOID',
          'No local system locked. Long-range survey suite is reading interstellar background only.',
          'Deep-space cruise state. Local records are limited to contacts and medium readings.'
        )
      );
    }

    if (target) {
      rows.push(
        this.createShipLogRow(
          '005',
          'TARGET',
          'SELECTED',
          `${this.getTargetName(target)} | ${this.getTargetClassLabel(target)} | ${this.getTargetRangeLabel(target)}.`,
          'Selected navigation target, suitable for approach assist where available.'
        )
      );
    } else {
      rows.push(
        this.createShipLogRow(
          '005',
          'TARGET',
          'NONE',
          'No navigation target selected.',
          'Use target cycling or the navigation menu to designate a local object.'
        )
      );
    }

    if (planet) {
      rows.push(
        this.createShipLogRow(
          '006',
          'PLANET',
          planet.scanned ? 'SCANNED' : 'UNSCANNED',
          `${planet.name} | ${planet.getRotationPeriodLabel()} rotation | ${planet.surfaceTempMin}-${planet.surfaceTempMax} K surface range.`,
          'Current landed body record. Full mineral details require a surface scan.'
        )
      );
    }

    rows.push(
      this.createShipLogRow(
        '007',
        'MISSION',
        activeMissionCount > 0 ? 'ACTIVE' : 'QUIET',
        activeMissionCount > 0
          ? `${activeMissionCount} accepted mission${activeMissionCount === 1 ? '' : 's'} in ship memory.`
          : 'No active contracts. Notice boards may hold new work at starbases.',
        'Mission/notices integration point for the shipboard memory system.'
      )
    );

    if (this.statusMessage) {
      rows.push(
        this.createShipLogRow(
          '008',
          'ALERT',
          /error|fail|cannot/i.test(this.statusMessage) ? 'CAUTION' : 'NOTE',
          this.statusMessage,
          'Most recent bridge status line preserved for context.'
        )
      );
    } else {
      rows.push(
        this.createShipLogRow('008', 'ALERT', 'CLEAR', 'No unresolved bridge alert.', 'Normal operations.')
      );
    }

    return rows;
  }

  /** Creates ship log row. */
  private createShipLogRow(
    id: string,
    channel: string,
    state: string,
    entry: string,
    detail: string
  ): TextTableRow {
    return {
      id: `log:${id}`,
      cells: [id, channel, state, entry],
      detail,
      disabled: true,
      cellTones: ['muted', this.getShipLogChannelTone(channel), this.getShipLogStateTone(state), 'bright'],
      detailTone: this.getShipLogStateTone(state) === 'red' ? 'red' : 'cyan',
    };
  }

  /** Returns ship position log entry. */
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

  /** Returns ship log summary. */
  private getShipLogSummary(): string {
    const alerts = this.statusMessage ? 'watch note' : 'nominal';
    const missionCount = Object.keys(this.activeMissions).length;
    return missionCount > 0 ? `${missionCount} mission${missionCount === 1 ? '' : 's'} | ${alerts}` : alerts;
  }

  /** Returns jettison menu rows. */
  private getJettisonMenuRows(): TextTableRow[] {
    const itemKey = this.shipOperations.jettisonItemKey;
    const held = itemKey ? this.player.cargoHold.items[itemKey] || 0 : 0;
    const name = itemKey ? (this.getTradeItemInfo(itemKey)?.name ?? itemKey) : 'No cargo';
    if (!itemKey || held <= 0) {
      return [
        {
          id: 'cancel',
          cells: ['Cancel', name, '--', 'Return to cargo manifest.'],
          cellTones: ['cyan', 'muted', 'muted', 'cyan'],
          detailTone: 'cyan',
        },
      ];
    }
    const rows: TextTableRow[] = [
      {
        id: '1',
        cells: ['1 unit', name, `${held - 1} left`, 'Vent one sealed unit through external bay.'],
        cellTones: ['amber', 'bright', 'green', 'amber'],
        detailTone: 'amber',
      },
    ];
    if (held >= 10)
      rows.push({
        id: '10',
        cells: ['10 units', name, `${held - 10} left`, 'Vent ten units. Confirm bay doors armed.'],
        cellTones: ['amber', 'bright', 'green', 'amber'],
        detailTone: 'amber',
      });
    rows.push({
      id: 'all',
      cells: ['ALL', name, '0 left', 'Purge the full cargo stack. No recovery beacon.'],
      cellTones: ['red', 'bright', 'red', 'red'],
      detailTone: 'red',
    });
    rows.push({
      id: 'cancel',
      cells: ['Cancel', name, `${held} held`, 'Stand down ejector sequence.'],
      cellTones: ['cyan', 'bright', 'green', 'cyan'],
      detailTone: 'cyan',
    });
    return rows;
  }

  /** Formats gauge. */
  private formatGauge(value: number, max: number, width: number): string {
    const safeMax = Math.max(1, max);
    const ratio = Math.max(0, Math.min(1, value / safeMax));
    const filled = Math.round(ratio * width);
    return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
  }

  /** Returns fuel state label. */
  private getFuelStateLabel(): string {
    const ratio = this.player.resources.fuel / Math.max(1, this.player.resources.maxFuel);
    if (ratio <= 0) return 'Empty';
    if (ratio < 0.2) return 'Low';
    if (ratio < 0.5) return 'Reserve';
    return 'Ready';
  }

  /** Returns fuel tone. */
  private getFuelTone(value: number, max: number): TextTone {
    const ratio = value / Math.max(1, max);
    if (ratio <= 0) return 'red';
    if (ratio < 0.2) return 'amber';
    if (ratio < 0.5) return 'bright';
    return 'green';
  }

  /** Returns cargo load label. */
  private getCargoLoadLabel(cargoTotal: number): string {
    const ratio = cargoTotal / Math.max(1, this.player.cargoHold.capacity);
    if (cargoTotal <= 0) return 'Empty';
    if (ratio >= 1) return 'Full';
    if (ratio > 0.75) return 'Heavy';
    if (ratio > 0.35) return 'Loaded';
    return 'Light';
  }

  /** Returns cargo tone. */
  private getCargoTone(cargoTotal: number, capacity: number): TextTone {
    const ratio = cargoTotal / Math.max(1, capacity);
    if (cargoTotal <= 0) return 'muted';
    if (ratio >= 1) return 'red';
    if (ratio > 0.75) return 'amber';
    if (ratio > 0.35) return 'green';
    return 'bright';
  }

  /** Returns crew health label. */
  private getCrewHealthLabel(): string {
    if (this.player.crew.length === 0) return 'Uncrewed';
    const wounded = this.player.crew.filter((member) => member.hitPoints < member.maxHitPoints).length;
    if (wounded === 0) return 'All green';
    return `${wounded} wounded`;
  }

  /** Returns crew health tone. */
  private getCrewHealthTone(): TextTone {
    if (this.player.crew.length === 0) return 'amber';
    return this.player.crew.some((member) => member.hitPoints < member.maxHitPoints) ? 'amber' : 'green';
  }

  /** Returns member health tone. */
  private getMemberHealthTone(member: CrewMember): TextTone {
    if (member.hitPoints <= 0) return 'red';
    if (member.hitPoints < member.maxHitPoints) return 'amber';
    return 'green';
  }

  /** Returns ship log channel tone. */
  private getShipLogChannelTone(channel: string): TextTone {
    if (channel === 'ALERT') return 'amber';
    if (channel === 'MISSION') return 'green';
    if (channel === 'TARGET' || channel === 'SURVEY') return 'cyan';
    return 'bright';
  }

  /** Returns ship log state tone. */
  private getShipLogStateTone(state: string): TextTone {
    if (/CAUTION|FAIL|ERROR|LOW|UNSCANNED/i.test(state)) return 'amber';
    if (/CLEAR|SCANNED|ACTIVE|SELECTED|FIX|ONLINE|READY|DRIFT|QUIET/i.test(state)) return 'green';
    if (/NONE|VOID|UNCREWED/i.test(state)) return 'muted';
    return 'cyan';
  }

  /** Returns ship operating state. */
  private getShipOperatingState(): string {
    switch (this.stateManager.state) {
      case 'hyperspace':
        return 'Drift';
      case 'system':
        return this.travelMode.approachTargetSignature ? 'Approach' : 'Local';
      case 'planet':
        return 'Landed';
      default:
        return 'Online';
    }
  }

  /** Returns target class label. */
  private getTargetClassLabel(target: NavigationTarget): string {
    if (target instanceof Planet) return 'Planet';
    if (target instanceof Starbase) return 'Starbase';
    return `Star ${target.id}`;
  }

  /** Returns target short name. */
  private getTargetShortName(target: NavigationTarget, system: SolarSystem | null): string {
    const baseName = system ? target.name.replace(`${system.name} `, '') : target.name;
    if (!(target instanceof Planet)) return baseName;
    const moonCount = target.moons?.length ?? 0;
    const moonLabel = moonCount === 1 ? '1 moon' : `${moonCount} moons`;
    const suffix = ` (${moonLabel})`;
    return `${baseName.slice(0, Math.max(0, 24 - suffix.length))}${suffix}`;
  }

  /** Formats bearing. */
  private formatBearing(dx: number, dy: number): string {
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'HERE';
    const horizontal = dx > 0 ? 'E' : dx < 0 ? 'W' : '';
    const vertical = dy > 0 ? 'S' : dy < 0 ? 'N' : '';
    return `${vertical}${horizontal}` || 'HERE';
  }

  /** Ensures selected target. */
  private ensureSelectedTarget(): NavigationTarget | null {
    const targets = this.getNavigationTargets();
    if (targets.length === 0) {
      this.travelMode.currentTargetIndex = 0;
      this.travelMode.currentTargetSignature = '';
      return null;
    }

    const existingIndex = targets.findIndex(
      (target) => this.getTargetSignature(target) === this.travelMode.currentTargetSignature
    );
    if (existingIndex >= 0) {
      this.travelMode.currentTargetIndex = existingIndex;
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
    this.travelMode.currentTargetIndex = closestIndex;
    this.travelMode.currentTargetSignature = this.getTargetSignature(targets[closestIndex]);
    return targets[closestIndex];
  }

  /** Returns selected target. */
  private getSelectedTarget(): NavigationTarget | null {
    if (this.stateManager.state !== 'system') return null;
    const targets = this.getNavigationTargets();
    if (targets.length === 0) return null;
    const existingIndex = targets.findIndex(
      (target) => this.getTargetSignature(target) === this.travelMode.currentTargetSignature
    );
    if (existingIndex >= 0) return targets[existingIndex];
    return this.ensureSelectedTarget();
  }

  /** Returns target signature. */
  private getTargetSignature(target: NavigationTarget): string {
    if (target instanceof Planet) return `planet:${target.name}`;
    if (target instanceof Starbase) return `starbase:${target.name}`;
    return `star:${target.name}`;
  }

  /** Returns target name. */
  private getTargetName(target: NavigationTarget): string {
    return target.name;
  }

  /** Returns target coords. */
  private getTargetCoords(target: NavigationTarget): { x: number; y: number } {
    return { x: target.systemX, y: target.systemY };
  }

  /** Returns target range label. */
  private getTargetRangeLabel(target: NavigationTarget): string {
    const coords = this.getTargetCoords(target);
    return formatDistanceAu(
      Math.hypot(coords.x - this.player.position.systemX, coords.y - this.player.position.systemY)
    );
  }

  /** Returns scannable navigation target. */
  private getScannableNavigationTarget(target: NavigationTarget): ScanTarget {
    const system = this.stateManager.currentSystem;
    if (system && target instanceof Planet) {
      return system.getOrbitParentFor(target);
    }
    return target;
  }

  /** Returns local system scan target. */
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

  /** Returns whether target within scan range. */
  private isTargetWithinScanRange(target: NavigationTarget): boolean {
    const coords = this.getTargetCoords(target);
    const multiplier =
      target instanceof Planet || target instanceof Starbase ? 1 : CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
    return (
      this.player.distanceSqToSystemCoords(coords.x, coords.y) < (CONFIG.LANDING_DISTANCE * multiplier) ** 2
    );
  }

  /** Returns target approach distance. */
  private getTargetApproachDistance(target: NavigationTarget): number {
    return target instanceof Planet || target instanceof Starbase
      ? CONFIG.LANDING_DISTANCE * 0.62
      : CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
  }

  /** Updates ship facing toward target. */
  private setShipFacingTowardTarget(target: NavigationTarget): void {
    const coords = this.getTargetCoords(target);
    const dx = coords.x - this.player.position.systemX;
    const dy = coords.y - this.player.position.systemY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.player.render.directionGlyph = dx >= 0 ? GLYPHS.SHIP_EAST : GLYPHS.SHIP_WEST;
    } else {
      this.player.render.directionGlyph = dy >= 0 ? GLYPHS.SHIP_SOUTH : GLYPHS.SHIP_NORTH;
    }
    this.player.render.char = this.player.render.directionGlyph;
  }

  /** Updates approach assist. */
  private updateApproachAssist(_deltaTime: number): void {
    if (this.stateManager.state !== 'system' || !this.travelMode.approachTargetSignature) return;
    const target = this.getSelectedTarget();
    if (!target || this.getTargetSignature(target) !== this.travelMode.approachTargetSignature) {
      this.travelMode.approachTargetSignature = null;
      return;
    }

    const coords = this.getTargetCoords(target);
    const dx = coords.x - this.player.position.systemX;
    const dy = coords.y - this.player.position.systemY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const desiredDistance = this.getTargetApproachDistance(target);
    if (distance <= desiredDistance) {
      this.travelMode.approachTargetSignature = null;
      this.statusMessage = `Approach complete: ${this.getTargetName(target)}.`;
      return;
    }

    const step = Math.min(
      distance - desiredDistance,
      CONFIG.SYSTEM_MOVE_INCREMENT * this.getSystemCursorMoveSpeedMultiplier()
    );
    this.player.position.systemX += (dx / distance) * step;
    this.player.position.systemY += (dy / distance) * step;
    this.player.render.char = this.player.render.directionGlyph;
  }

  /** Updates orbit. */
  private _updateOrbit(deltaTime: number): string {
    const planet = this.stateManager.currentPlanet;
    if (!planet) return 'Orbit Error: Planet data missing.';
    this.orbitModeState.elapsedSeconds += deltaTime;
    const selectedBody = this.getSelectedOrbitBody();
    const mapSize = getPlanetMapSize(selectedBody);
    this.orbitModeState.landingX = ((Math.floor(this.orbitModeState.landingX) % mapSize) + mapSize) % mapSize;
    this.orbitModeState.landingY = Math.max(
      0,
      Math.min(mapSize - 1, Math.floor(this.orbitModeState.landingY))
    );
    const actions = createAvailableActions({
      state: 'orbit',
      player: this.player,
      system: this.stateManager.currentSystem,
      planet: selectedBody,
      starbase: null,
    });
    const orbitText =
      selectedBody.orbitDistance <= 0
        ? 'none'
        : `${formatDistanceAu(selectedBody.orbitDistance)} from primary`;
    const signalText =
      selectedBody.orbitDistance <= 0 ? 'none' : formatLightTimeFromMeters(selectedBody.orbitDistance);
    return `Orbit: ${selectedBody.name} | Orbit ${orbitText} | Signal ${signalText} | Mode: ${this.orbitModeState.mode} | Site ${this.orbitModeState.landingX},${this.orbitModeState.landingY} | Actions: ${formatAvailableActions(actions, 4)}.`;
  }

  /** Updates planet. */
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

  /** Updates starbase. */
  private _updateStarbase(_deltaTime: number): string {
    const starbase = this.stateManager.currentStarbase;
    if (!starbase) {
      /* ... error handling ... */ return 'Starbase Error: Data missing.';
    }
    const section = this.starbaseMode.getSectionLabel();
    return `Docked: ${starbase.name} | Panel: ${section} | Enter use, Esc cancel, L depart.`;
  }

  /** Draws travel observe cursor. */
  private drawTravelObserveCursor(): void {
    const cursor = this.travelMode.observeCursor;
    if (!cursor || cursor.mode !== this.stateManager.state) return;
    const center = this.getTravelViewCenter();
    const x = center.x + cursor.dx;
    const y = center.y + cursor.dy;
    const cols = this.renderer.getGridCols();
    const rows = this.renderer.getGridRows();
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    const lit = Math.floor(performance.now() / 420) % 2 === 0;
    const fg = lit ? TEXT_PALETTE.textBright : TEXT_PALETTE.textMuted;
    const bg = lit ? CONFIG.TRANSPARENT_COLOUR : CONFIG.DEFAULT_BG_COLOUR;
    if (y > 0) this.renderer.drawChar('^', x, y - 1, fg, bg);
    if (y < rows - 1) this.renderer.drawChar('v', x, y + 1, fg, bg);
    if (x > 0) this.renderer.drawChar('<', x - 1, y, fg, bg);
    if (x < cols - 1) this.renderer.drawChar('>', x + 1, y, fg, bg);
  }

  // --- Rendering ---
  /** Renders. */
  private _render(): void {
    const currentState = this.stateManager.state;
    try {
      const renderNow = performance.now();
      const mainRenderSignature = this.getMainRenderSignature(renderNow);
      const shouldRenderMainScene = !this.canSkipMainRender(currentState, mainRenderSignature);
      if (shouldRenderMainScene) {
        const renderPrepStart = performance.now();
        const fullCanvasRepaint = this.forceFullRender;
        this.renderer.clear(fullCanvasRepaint);

        // Draw main content layer based on state
        switch (currentState) {
          case 'hyperspace':
            this.renderer.drawScene(
              createSceneViewModel({
                kind: 'hyperspace',
                player: createPlayerViewSnapshot(this.player),
              })
            );
            this.drawTravelObserveCursor();
            break;
          case 'system':
            const system = this.stateManager.currentSystem;
            if (system) {
              const currentViewScale = this.getCurrentViewScale();
              this.renderer.drawScene(
                createSceneViewModel({
                  kind: 'system',
                  player: createPlayerViewSnapshot(this.player),
                  system,
                  viewScale: currentViewScale,
                })
              );
              this.drawTravelObserveCursor();
            } else {
              this._renderError('System data missing for render!');
            }
            break;
          case 'orbit':
            const orbitPlanet = this.stateManager.currentPlanet;
            if (orbitPlanet) {
              this.renderer.drawScene(
                createSceneViewModel({
                  kind: 'orbit',
                  model: this.createCurrentOrbitScreen(),
                })
              );
            } else {
              this._renderError('Orbit data missing for render!');
            }
            break;
          case 'planet':
            const planet = this.stateManager.currentPlanet;
            if (planet) {
              if (planet.isSurfaceReady()) {
                this.renderer.drawScene(
                  createSceneViewModel({
                    kind: 'surface',
                    player: createPlayerViewSnapshot(this.player),
                    body: planet,
                    overlay: this.createSurfaceVehicleOverlayModel(),
                  })
                );
              } else {
                this.requestSurfacePreparation(planet);
                this.renderer.drawSurfaceLoading(planet.name);
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
                this.renderer.drawScene(
                  createSceneViewModel({
                    kind: 'starbase',
                    player: createPlayerViewSnapshot(this.player),
                    starbase,
                    model: this.createCurrentStarbaseScreen(),
                  })
                );
              } catch (surfaceError) {
                logger.error(
                  `[Game:_render] Error ensuring starbase ready for ${starbase.name}: ${surfaceError}`
                );
                this._renderError(
                  `Docking Error: ${surfaceError instanceof Error ? surfaceError.message : 'Unknown'}`
                );
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

        if (this.surfaceExtractionSelector) {
          this.renderer.drawTextModalTable(this.createSurfaceExtractionSelectorModel());
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
      } else {
        this.lastFrameProfile.renderPrepMs = 0;
      }

      if (this.shouldRenderOverlay(renderNow)) {
        const overlayStart = performance.now();
        this.renderer.clearOverlay();
        this.renderTravelDateTimeHud();
        if (!this.shouldSuppressHudForeground()) {
          this.astrometricOverlay.render(
            this.renderer.getOverlayContext(),
            this.renderer.getCharWidthPx(),
            this.renderer.getCharHeightPx()
          );
        }

        // Draw Terminal Overlay on top
        if (!this.shouldSuppressHudForeground()) {
          this.terminalOverlay.render(
            this.renderer.getOverlayContext(),
            this.renderer.getOverlayCanvas().width,
            this.renderer.getOverlayCanvas().height
          );
        }
        this.renderPerformanceOverlay();
        this.lastFrameProfile.overlayMs = performance.now() - overlayStart;
        this.lastOverlayRenderAt = renderNow;
      } else {
        this.lastFrameProfile.overlayMs = 0;
      }
    } catch (renderError) {
      logger.error(`[Game:_render] !!!! CRITICAL RENDER ERROR in state '${currentState}' !!!!`, renderError);
      this.statusMessage = `FATAL RENDER ERROR: ${
        renderError instanceof Error ? renderError.message : String(renderError)
      }. Refresh.`;
      this._publishStatusUpdate(); // Try to show error
      this.stopGame(); // Stop loop on render errors
    }
  }

  /** Returns whether the active interface should hide foreground HUD elements. */
  private shouldSuppressHudForeground(): boolean {
    return this.shipMenuOpen || this.targetMenuOpen;
  }

  /** Returns whether travel date time hud visible. */
  private isTravelDateTimeHudVisible(): boolean {
    return (
      (this.stateManager.state === 'hyperspace' ||
        this.stateManager.state === 'system' ||
        this.stateManager.state === 'orbit' ||
        this.stateManager.state === 'starbase') &&
      !this.shouldSuppressHudForeground()
    );
  }

  /** Renders travel date time hud. */
  private renderTravelDateTimeHud(): void {
    if (!this.isTravelDateTimeHudVisible()) return;
    const label = this.getGameDateTimeLabel();
    const ctx = this.renderer.getOverlayContext();
    const canvas = this.renderer.getOverlayCanvas();
    const charHeight = this.renderer.getCharHeightPx();
    ctx.save();
    ctx.font = `${charHeight * 0.86}px ${CONFIG.THIN_FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = TEXT_PALETTE.greenBright;
    ctx.shadowBlur = 5;
    const width = ctx.measureText(label).width;
    const x = Math.max(0, (canvas.width - width) / 2);
    const y = Math.max(0, charHeight * 0.18);
    ctx.fillStyle = CONFIG.DEFAULT_BG_COLOUR;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(Math.max(0, x - charHeight * 0.35), 0, width + charHeight * 0.7, charHeight * 1.1);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = TEXT_PALETTE.cyanSignal;
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  /** Returns whether game clock paused. */
  private isGameClockPaused(): boolean {
    return (
      this.stateManager.state === 'starbase' ||
      this.popupState !== 'inactive' ||
      this.targetMenuOpen ||
      this.shipMenuOpen ||
      this.roverCargoOpen ||
      this.surfaceLegendOpen ||
      Boolean(this.quantitySelector) ||
      Boolean(this.surfaceExtractionSelector) ||
      Boolean(this.jettisonConfirmation)
    );
  }

  /** Returns whether skip main render is allowed. */
  private canSkipMainRender(state: GameState, signature: string): boolean {
    if (
      this.forceFullRender ||
      this.popupState !== 'inactive' ||
      this.shipMenuOpen ||
      this.roverCargoOpen ||
      this.surfaceLegendOpen ||
      this.quantitySelector ||
      this.surfaceExtractionSelector ||
      this.jettisonConfirmation
    )
      return false;
    return signature === this.lastMainRenderSignature;
  }

  /** Returns whether the animated overlay layer is due for another frame. */
  private shouldRenderOverlay(now: number): boolean {
    return this.forceFullRender || now - this.lastOverlayRenderAt >= Game.OVERLAY_RENDER_INTERVAL_MS;
  }

  /** Returns main render signature. */
  private getMainRenderSignature(now: number = performance.now()): string {
    const state = this.stateManager.state;
    switch (state) {
      case 'hyperspace':
        return [
          state,
          this.player.position.worldX,
          this.player.position.worldY,
          this.player.render.char,
        ].join('|');
      case 'system':
        return [
          state,
          this.stateManager.currentSystem?.name ?? '',
          this.player.render.char,
          this.currentZoomLevelIndex,
          this.travelMode.currentTargetSignature,
          Math.floor(now / Game.SYSTEM_RENDER_INTERVAL_MS),
        ].join('|');
      case 'orbit':
        return [
          state,
          this.getSelectedOrbitBody()?.name ?? '',
          this.orbitModeState.selectedBodyIndex,
          this.orbitModeState.mode,
          this.orbitModeState.landingX,
          this.orbitModeState.landingY,
          this.orbitModeState.alert,
          Math.floor(now / Game.ORBIT_RENDER_INTERVAL_MS),
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
          this.surfaceMode.roverMenuSelection,
          this.roverCargoOpen ? 'cargo' : 'nocargo',
          this.surfaceMode.mapExpanded ? 'map' : 'local',
          this.surfaceLegendOpen ? 'legend' : 'nolegend',
          this.surfaceMode.scanCursor
            ? `${this.surfaceMode.scanCursor.dx},${this.surfaceMode.scanCursor.dy}`
            : 'noscan',
          Math.floor(now / Game.SURFACE_RENDER_INTERVAL_MS),
          this.player.terrainVehicle.fuel.toFixed(1),
          this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold),
          this.statusMessage,
        ].join('|');
      case 'starbase':
        return [
          state,
          this.stateManager.currentStarbase?.name ?? '',
          this.starbaseMode.sectionId,
          this.getStarbaseSelection(),
          this.getStarbaseOffset(),
          this.starbaseMode.alert,
          this.player.resources.credits,
          this.player.resources.fuel,
          this.starbaseMode.alert ? Math.floor(now / Game.STARBASE_ALERT_RENDER_INTERVAL_MS) : 'static',
        ].join('|');
      default:
        return state;
    }
  }

  /** Updates frame profile. */
  private updateFrameProfile(frameMs: number, inputMs: number, updateMs: number, renderMs: number): void {
    const blend = this.lastFrameProfile.frameMs > 0 ? 0.18 : 1;
    this.lastFrameProfile.frameMs = this.blendProfileValue(this.lastFrameProfile.frameMs, frameMs, blend);
    this.lastFrameProfile.inputMs = this.blendProfileValue(this.lastFrameProfile.inputMs, inputMs, blend);
    this.lastFrameProfile.updateMs = this.blendProfileValue(this.lastFrameProfile.updateMs, updateMs, blend);
    this.lastFrameProfile.renderMs = this.blendProfileValue(this.lastFrameProfile.renderMs, renderMs, blend);
    this.lastFrameProfile.fps = this.lastFrameProfile.frameMs > 0 ? 1000 / this.lastFrameProfile.frameMs : 0;
  }

  /** Blends profile value. */
  private blendProfileValue(previous: number, next: number, blend: number): number {
    return previous * (1 - blend) + next * blend;
  }

  /** Renders performance overlay. */
  private renderPerformanceOverlay(): void {
    if (!this.profilerVisible) return;
    const ctx = this.renderer.getOverlayContext();
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
    if (this.stateManager.state === 'hyperspace') {
      const hyper = this.renderer.getLastHyperspaceRenderStats();
      lines.push(
        `HYPER ${hyper.mode.toUpperCase()} ${hyper.cells} CELLS  SURVEY ${hyper.surveyMs.toFixed(1)}  BUILD ${hyper.buildMs.toFixed(1)}ms`,
        `PREF ${hyper.prefetchMs.toFixed(1)}  SHIFT ${hyper.shiftMs.toFixed(1)}  STAGE ${hyper.stageMs.toFixed(1)}ms`
      );
    }
    const widthChars = lines.reduce((max, line) => Math.max(max, line.length), 0) + 2;
    const x = charWidth;
    const y = charHeight;
    const width = widthChars * charWidth;
    const height = (lines.length + 1) * charHeight;

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = TEXT_PALETTE.background;
    ctx.fillRect(x - Math.floor(charWidth * 0.5), y - Math.floor(charHeight * 0.35), width, height);
    ctx.globalAlpha = 0.92;
    ctx.font = `${charHeight * 0.78}px ${CONFIG.THIN_FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;
    lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? TEXT_PALETTE.cyanSignal : TEXT_PALETTE.greenSoft;
      ctx.fillText(line, x, y + index * charHeight);
    });
    ctx.restore();
  }

  /** Periodically records render timing and cache statistics for diagnostics. */
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
    this.renderer.drawString(message, 1, 1, TEXT_PALETTE.red, CONFIG.DEFAULT_BG_COLOUR);
    this.statusMessage = `ERROR: ${message}`;
    this._publishStatusUpdate(); // Update status bar
    // Render the error state immediately
    this.renderer.renderBufferFull();
  }

  // --- Status Update (Adds Zoom Level) ---
  /** Publishes status update. */
  private _publishStatusUpdate(): void {
    let currentCargoTotal = 0;
    try {
      currentCargoTotal = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    } catch (e) {
      logger.error(`[Game:_publishStatusUpdate] Error getting cargo total: ${e}`);
    }

    let zoomLabel = '';
    if (this.stateManager.state === 'system') {
      const zoomFactor = getSystemZoomFactor(this.currentZoomLevelIndex);
      zoomLabel = ` | Zoom: ${zoomFactor.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
    }

    const roverState = !this.player.terrainVehicle.available
      ? 'lost'
      : this.player.terrainVehicle.onFoot
        ? 'on foot'
        : this.player.terrainVehicle.deployed
          ? 'disembarked'
          : 'embarked';
    const roverStatus =
      this.stateManager.state === 'planet'
        ? ` | Rover: ${roverState} ${this.player.terrainVehicle.fuel.toFixed(0)}/${this.player.terrainVehicle.maxFuel} fuel ${this.formatCargoLoad(this.cargoSystem.getTotalUnits(this.player.terrainVehicle.cargoHold), this.player.terrainVehicle.cargoHold.capacity)} m^3`
        : '';

    const commonStatus =
      this.popupState === 'active'
        ? '' // Don't show stats when popup is fully active
        : ` | Fuel: ${this.player.resources.fuel.toFixed(0)}/${
            this.player.resources.maxFuel
          } | Cargo: ${this.formatCargoLoad(currentCargoTotal, this.player.cargoHold.capacity)} | Cr: ${this.player.resources.credits.toLocaleString()}` +
          roverStatus +
          zoomLabel; // Append zoom label

    const finalStatus = this.statusMessage + commonStatus;
    const hasStarbase = this.stateManager.state === 'starbase';

    const actions = this.getCurrentAvailableActions();
    const commandUpdate = {
      actions,
      primaryActionId: this.choosePrimaryAction(actions)?.id,
      targetName: this.getCommandStripTargetName(),
      commandBar: this.createCommandBarModel(actions),
    };
    const statusSignature = `${hasStarbase ? 'starbase' : 'standard'}|${finalStatus}`;
    if (statusSignature !== this.lastPublishedStatusSignature) {
      this.lastPublishedStatusSignature = statusSignature;
      eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, { message: finalStatus, hasStarbase });
    }

    const commandSignature = JSON.stringify(commandUpdate);
    if (commandSignature !== this.lastPublishedCommandSignature) {
      this.lastPublishedCommandSignature = commandSignature;
      eventManager.publish(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, commandUpdate);
    }
  }

  /** Creates command bar model. */
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

  /** Returns selectable travel command buttons. */
  private getSelectableTravelCommandButtons(): CommandBarButton[] {
    const model =
      this.stateManager.state === 'system'
        ? this.createSystemCommandBar(this.getCurrentAvailableActions(), false)
        : this.createHyperspaceCommandBar(this.getCurrentAvailableActions(), false);
    return [...(model.leftButtons ?? []), ...(model.buttons ?? []), ...(model.rightButtons ?? [])].filter(
      (button) => button.enabled !== false
    );
  }

  /** Returns travel move command index. */
  private getTravelMoveCommandIndex(): number {
    const commands = this.getSelectableTravelCommandButtons();
    const moveIndex = commands.findIndex((button) => button.id === 'move');
    return moveIndex >= 0 ? moveIndex : 0;
  }

  /** Returns default travel command index. */
  private getDefaultTravelCommandIndex(): number {
    const commands = this.getSelectableTravelCommandButtons();
    const situationalIndex = commands.findIndex((button) => button.tone === 'green');
    return situationalIndex >= 0 ? situationalIndex : this.getTravelMoveCommandIndex();
  }

  /** Returns selected travel command id. */
  private getSelectedTravelCommandId(): string {
    const commands = this.getSelectableTravelCommandButtons();
    this.travelMode.commandSelection = clampIndex(this.travelMode.commandSelection, commands.length);
    return commands[this.travelMode.commandSelection]?.id ?? 'move';
  }

  /** Activates recommended travel command. */
  private activateRecommendedTravelCommand(): void {
    const model =
      this.stateManager.state === 'system'
        ? this.createSystemCommandBar(this.getCurrentAvailableActions(), false)
        : this.createHyperspaceCommandBar(this.getCurrentAvailableActions(), false);
    const commands = [...(model.leftButtons ?? []), ...model.buttons, ...(model.rightButtons ?? [])].filter(
      (button) => button.enabled !== false
    );
    const recommended =
      commands.find((button) => button.id === model.primaryButtonId) ??
      commands[this.travelMode.commandSelection];
    if (recommended) this.executeCommandBarAction(recommended.action);
    this.forceFullRender = true;
  }

  /** Creates hyperspace command bar. */
  private createHyperspaceCommandBar(
    actions: AvailableAction[],
    includeSelection: boolean = true
  ): CommandBarModel {
    const enter = actions.find((action) => action.id === 'enter-system');
    return {
      context: 'interstellar',
      targetName: this.getCommandStripTargetName(),
      primaryButtonId: enter?.id,
      selectedButtonId:
        includeSelection && !this.travelMode.commandMoving ? this.getSelectedTravelCommandId() : undefined,
      leftButtons: enter
        ? [
            commandButton(enter.id, enter.label, enter.action, {
              key: enter.key,
              tone: 'green',
              detail: enter.targetName ? `Enter ${enter.targetName}` : 'Enter navigable contact',
            }),
          ]
        : [],
      buttons: [
        commandButton('move', 'Move', 'TRAVEL_MOVE', {
          key: 'Arrows',
          detail: this.travelMode.commandMoving
            ? 'Movement engaged. Enter, Space, or Esc pauses command movement.'
            : 'Resume interstellar movement.',
        }),
        commandButton('scan-local', 'Scan', 'SCAN_SYSTEM_OBJECT', {
          key: CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT,
          detail: 'Scan the stellar or planemo contact at current coordinates.',
        }),
        commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', {
          key: CONFIG.KEY_BINDINGS.SHIP_MENU,
          detail: 'Open ship operations.',
        }),
        commandButton('observe', 'Observe', 'OBSERVE_HYPERSPACE', {
          detail: 'Open a reticle for long-range contact observation.',
        }),
      ],
      rightButtons: [
        commandButton('red-reserved', 'Alert', 'RED_RESERVED', {
          tone: 'red',
          enabled: false,
          detail: 'Reserved for future emergency commands.',
        }),
      ],
    };
  }

  /** Creates system command bar. */
  private createSystemCommandBar(
    actions: AvailableAction[],
    includeSelection: boolean = true
  ): CommandBarModel {
    const primaryTravel =
      actions.find((action) => action.id === 'land-dock') ??
      actions.find((action) => action.id === 'leave-system');
    return {
      context: 'planetary',
      targetName: this.getCommandStripTargetName(),
      primaryButtonId: primaryTravel?.id,
      selectedButtonId:
        includeSelection && !this.travelMode.commandMoving ? this.getSelectedTravelCommandId() : undefined,
      leftButtons: primaryTravel
        ? [
            commandButton(primaryTravel.id, primaryTravel.label, primaryTravel.action, {
              key: primaryTravel.key,
              tone: 'green',
              detail: primaryTravel.targetName
                ? `${primaryTravel.label} ${primaryTravel.targetName}`
                : primaryTravel.label,
            }),
          ]
        : [],
      buttons: [
        commandButton('move', 'Move', 'TRAVEL_MOVE', {
          key: 'Arrows',
          detail: this.travelMode.commandMoving
            ? 'Movement engaged. Enter, Space, or Esc pauses command movement.'
            : 'Resume planetary movement.',
        }),
        commandButton('scan-object', 'Scan', 'SCAN_SYSTEM_OBJECT', {
          key: CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT,
          detail: 'Scan a nearby star, planet, starbase, or selected close target.',
        }),
        commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', {
          key: CONFIG.KEY_BINDINGS.SHIP_MENU,
          detail: 'Open ship operations.',
        }),
        commandButton('observe', 'Observe', 'OBSERVE_SYSTEM_TARGET', {
          detail: 'Open a reticle and scan the selected local body.',
        }),
        commandButton('target-menu', 'Targets', 'TARGET_MENU', {
          key: CONFIG.KEY_BINDINGS.TARGET_MENU,
          detail: 'Open local navigation target list.',
        }),
      ],
      rightButtons: [
        commandButton('red-reserved', 'Alert', 'RED_RESERVED', {
          tone: 'red',
          enabled: false,
          detail: 'Reserved for future emergency commands.',
        }),
      ],
    };
  }

  /** Creates surface command bar. */
  private createSurfaceCommandBar(): CommandBarModel {
    const rover = this.player.terrainVehicle;
    if (!rover.deployed && !rover.onFoot) {
      return {
        context: 'landed ship',
        targetName: this.stateManager.currentPlanet?.name,
        buttons: [
          commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', {
            key: CONFIG.KEY_BINDINGS.SHIP_MENU,
            detail: 'Open landed ship operations.',
          }),
          commandButton('scan-surface', 'Scan', 'SCAN', {
            key: CONFIG.KEY_BINDINGS.SCAN,
            detail: 'Begin a local surface scan.',
          }),
        ],
        rightButtons: [
          commandButton('red-reserved', 'Alert', 'RED_RESERVED', {
            tone: 'red',
            enabled: false,
            detail: 'Reserved for future emergency commands.',
          }),
        ],
      };
    }

    const cargo = this.cargoSystem.getTotalUnits(rover.cargoHold);
    return {
      context: 'terrain',
      targetName: this.stateManager.currentPlanet?.name,
      primaryButtonId: this.isAtParkedShip() ? 'embark' : undefined,
      selectedButtonId: rover.moving
        ? undefined
        : this.getSurfaceVehicleMenuItems()[this.surfaceMode.roverMenuSelection]?.id,
      leftButtons: this.isAtParkedShip()
        ? [
            commandButton('embark', 'Embark', 'ROVER_EMBARK', {
              tone: 'green',
              detail: 'Board the parked ship.',
            }),
          ]
        : [],
      buttons: [
        commandButton('map', 'Map', 'ROVER_MAP', { detail: 'Toggle expanded terrain map.' }),
        commandButton('move', 'Move', 'ROVER_MOVE', {
          detail: rover.fuel > 0 ? 'Start terrain vehicle movement.' : 'Terrain vehicle fuel exhausted.',
          enabled: rover.fuel > 0,
        }),
        commandButton('cargo', 'Cargo', 'ROVER_CARGO', {
          detail: `Terrain vehicle cargo ${this.formatCargoLoad(cargo, rover.cargoHold.capacity)} m^3.`,
        }),
        commandButton('mine', 'Mine', 'ROVER_MINE', {
          key: CONFIG.KEY_BINDINGS.MINE,
          detail: 'Mine the local deposit if present.',
        }),
        commandButton('scan', 'Scan', 'ROVER_SCAN', {
          key: CONFIG.KEY_BINDINGS.SCAN,
          detail: 'Move the surface scan cursor.',
        }),
        commandButton('icon', 'Icon', 'ROVER_ICON', { detail: 'Open the surface icon legend.' }),
      ],
      rightButtons: [
        commandButton('red-reserved', 'Alert', 'RED_RESERVED', {
          tone: 'red',
          enabled: false,
          detail: 'Reserved for future emergency commands.',
        }),
      ],
    };
  }

  /** Returns command strip target name. */
  private getCommandStripTargetName(): string | undefined {
    if (this.stateManager.state === 'hyperspace') {
      const contact = this.toNavigationContact(this.getCurrentHyperspaceSurvey().nearestSystemContact);
      return contact
        ? `${contact.name} ${this.formatHyperspaceBearing(contact)} ${contact.rangeCells.toFixed(1)}c`
        : undefined;
    }
    const selectedTarget = this.getSelectedTarget();
    return selectedTarget ? this.getTargetName(selectedTarget) : undefined;
  }

  /** Returns current available actions. */
  private getCurrentAvailableActions(): AvailableAction[] {
    const state = this.stateManager.state;
    if (state === 'hyperspace') {
      const currentProps = this.systemDataGenerator.getSystemMapProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
      const currentPhenomenon = this.systemDataGenerator.getDeepSpacePhenomenonProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
      const isNavigableContact =
        currentProps.exists ||
        Boolean(currentPhenomenon?.exists && currentPhenomenon.type === 'rogue-planet');
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
        return createAvailableActions({
          state,
          player: this.player,
          system: null,
          planet: null,
          starbase: null,
        });
      }
      const nearbyObject = system.getObjectNear(this.player.position.systemX, this.player.position.systemY);
      const nearestStar =
        system.stars.length > 0
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

    const market = this.stateManager.currentStarbase
      ? this.getTradeDepotManifest(this.stateManager.currentStarbase.name)
      : [];
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

  /** Returns orbit bodies. */
  private getOrbitBodies(): Planet[] {
    const parent = this.stateManager.currentOrbitReferencePlanet;
    if (!parent) return [];
    return [parent, ...parent.moons];
  }

  /** Returns selected orbit body. */
  private getSelectedOrbitBody(): Planet {
    const bodies = this.getOrbitBodies();
    const parent = this.stateManager.currentOrbitReferencePlanet;
    if (bodies.length === 0 || !parent) {
      throw new Error('No orbital body selected.');
    }
    this.orbitModeState.selectedBodyIndex = clampIndex(this.orbitModeState.selectedBodyIndex, bodies.length);
    return bodies[this.orbitModeState.selectedBodyIndex];
  }

  /** Resets orbit landing cursor. */
  private resetOrbitLandingCursor(): void {
    const selected = this.getSelectedOrbitBody();
    const mapSize = getPlanetMapSize(selected);
    this.orbitModeState.landingX = Math.floor(mapSize / 2);
    this.orbitModeState.landingY = Math.floor(mapSize / 2);
    this.orbitModeState.mode = 'overview';
    this.orbitModeState.alert = '';
  }

  /** Creates current orbit screen. */
  private createCurrentOrbitScreen(): OrbitScreenModel {
    const parentPlanet = this.stateManager.currentOrbitReferencePlanet ?? this.stateManager.currentPlanet!;
    const selectedBody = this.getSelectedOrbitBody();
    if (!selectedBody.scanned) selectedBody.scan();
    selectedBody.prepareSurfaceInBackground();
    return createOrbitScreenModel({
      parentPlanet,
      selectedBody,
      selectedIndex: this.orbitModeState.selectedBodyIndex,
      mode: this.orbitModeState.mode,
      landingCursorX: this.orbitModeState.landingX,
      landingCursorY: this.orbitModeState.landingY,
      rotationPhase: this.getOrbitGlobeRotationPhase(selectedBody),
      illuminationPhase: this.getOrbitGlobeIlluminationPhase(),
      stellarSources: this.getOrbitStellarSources(selectedBody),
      alert: this.orbitModeState.alert || this.statusMessage,
    });
  }

  /** Starts worker-backed surface preparation and redraws when the current planet becomes ready. */
  private requestSurfacePreparation(planet: Planet): void {
    if (planet.isSurfaceReady() || this.preparingSurfacePlanet === planet) return;
    this.preparingSurfacePlanet = planet;
    void planet
      .prepareSurfaceReady()
      .then(() => {
        if (this.stateManager.currentPlanet === planet) {
          this.statusMessage = `${planet.name} surface data ready.`;
          this.forceFullRender = true;
        }
      })
      .catch((error) => {
        if (this.stateManager.currentPlanet === planet) {
          this.statusMessage = `Surface preparation failed for ${planet.name}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          this.forceFullRender = true;
        }
      })
      .finally(() => {
        if (this.preparingSurfacePlanet === planet) {
          this.preparingSurfacePlanet = null;
        }
      });
  }

  /** Prepares the selected orbit body before exposing landing-site controls. */
  private prepareOrbitLandingSurface(planet: Planet): void {
    void planet
      .prepareSurfaceReady()
      .then(() => {
        if (
          this.stateManager.state === 'orbit' &&
          this.getSelectedOrbitBody() === planet &&
          this.orbitModeState.mode === 'overview'
        ) {
          this.resetOrbitLandingCursor();
          this.orbitModeState.mode = 'landing';
          this.orbitModeState.alert = 'Select landing coordinates.';
          this.forceFullRender = true;
        }
      })
      .catch((error) => {
        if (this.stateManager.state === 'orbit' && this.getSelectedOrbitBody() === planet) {
          this.orbitModeState.alert = `Landing data unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`;
          this.forceFullRender = true;
        }
      });
  }

  /** Returns orbit stellar sources. */
  private getOrbitStellarSources(
    selectedBody: Planet
  ): Array<{ id: string; primary: boolean; brightness: number; colour: string }> {
    const system = this.stateManager.currentSystem;
    if (!system || system.stars.length === 0) return [];
    const starsByDistance = system.stars
      .map((star) => ({
        star,
        distanceSq:
          Math.pow((star.systemX ?? 0) - (selectedBody.systemX ?? 0), 2) +
          Math.pow((star.systemY ?? 0) - (selectedBody.systemY ?? 0), 2),
      }))
      .sort((a, b) => a.distanceSq - b.distanceSq);
    const nearestId = starsByDistance[0]?.star.id;
    const baselineLuminosity = Math.max(1, starsByDistance[0]?.star.luminosityW ?? 1);
    return starsByDistance.slice(0, 3).map(({ star }) => ({
      id: star.id,
      primary: star.id === nearestId,
      brightness: Math.max(
        0.12,
        Math.min(1.5, Math.sqrt(Math.max(0.01, star.luminosityW) / baselineLuminosity))
      ),
      colour: SPECTRAL_TYPES[star.starType]?.colour ?? SPECTRAL_TYPES.G.colour,
    }));
  }

  /** Returns orbit globe rotation phase. */
  private getOrbitGlobeRotationPhase(body: Planet): number {
    const rotationPeriodSeconds = body.rotationPeriodHours * 60 * 60;
    if (!Number.isFinite(rotationPeriodSeconds) || rotationPeriodSeconds <= 0) {
      return this.orbitModeState.elapsedSeconds * 0.006;
    }
    const simulatedSeconds = this.orbitModeState.elapsedSeconds * Game.SIMULATED_SECONDS_PER_REAL_SECOND;
    return simulatedSeconds / rotationPeriodSeconds;
  }

  /** Returns orbit globe illumination phase. */
  private getOrbitGlobeIlluminationPhase(): number {
    return this.orbitModeState.elapsedSeconds * 0.06;
  }

  /** Creates current starbase screen. */
  private createCurrentStarbaseScreen(): StarbaseScreenModel {
    const starbase = this.stateManager.currentStarbase!;
    const rows = this.getStarbaseRows(starbase, this.starbaseMode.sectionId);
    return this.starbaseMode.createScreen({
      starbase,
      player: this.player,
      rows,
      canvasHeight: this.renderer.getCanvas().height,
      charHeight: this.renderer.getCharHeightPx(),
      statusMessage: this.statusMessage,
    });
  }

  /** Returns starbase selection. */
  private getStarbaseSelection(): number {
    return this.starbaseMode.getSelection();
  }

  /** Returns starbase offset. */
  private getStarbaseOffset(): number {
    return this.starbaseMode.getOffset();
  }

  /** Activates starbase selection. */
  private activateStarbaseSelection(starbase: Starbase, row: StarbaseTableRow | undefined): void {
    if (!row) {
      this.starbaseMode.alert = 'No item selected.';
      return;
    }
    const market = this.getTradeDepotManifest(starbase.name);
    if (this.starbaseMode.sectionId === 'overview') {
      this.starbaseMode.sectionId = (row.id as StarbaseSectionId) || 'buy';
      return;
    }
    if (this.starbaseMode.sectionId === 'buy') {
      this.starbaseMode.tradeSelectionIndex = Math.max(
        0,
        market.findIndex((item) => item.itemKey === row.id)
      );
      this.openBuyQuantitySelector(row.id);
      return;
    }
    if (this.starbaseMode.sectionId === 'sell') {
      this.starbaseMode.tradeSelectionIndex = Math.max(
        0,
        market.findIndex((item) => item.itemKey === row.id)
      );
      this.openSellQuantitySelector(row.id);
      return;
    }
    if (this.starbaseMode.sectionId === 'services' && row.id === 'refuel') {
      this._handleRefuelRequest();
      this.starbaseMode.alert = this.statusMessage;
      return;
    }
    if (this.starbaseMode.sectionId === 'missions') {
      this.activateMissionSelection(starbase, row);
      return;
    }
    if (this.starbaseMode.sectionId === 'crew') {
      this.activateCrewSelection(starbase, row);
      return;
    }
    if (this.starbaseMode.sectionId === 'shipyard' && row.id === 'terrain-vehicle') {
      this.purchaseTerrainVehicle();
      return;
    }
    if (this.starbaseMode.sectionId === 'shipyard' && row.id.startsWith('shipyard:')) {
      this.purchaseShipyardUpgrade(row.id);
      return;
    }
    this.starbaseMode.alert = row.detail || `${row.cells[0]} selected.`;
  }

  /** Purchases and installs the selected shipyard upgrade when affordable. */
  private purchaseShipyardUpgrade(optionId: string): void {
    const starbaseName = this.stateManager.currentStarbase?.name ?? 'default shipyard';
    const profile = getStarbaseShipyardProfile(starbaseName);
    const option = createShipyardUpgradeOptions(this.player.ship, profile).find(
      (candidate) => candidate.id === optionId
    );
    if (!option) {
      this.starbaseMode.alert = 'Shipyard order unavailable.';
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    if (option.disabled) {
      this.starbaseMode.alert = option.detail;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    if (this.player.resources.credits < option.cost) {
      this.starbaseMode.alert = `Insufficient credits for ${option.label}. Required ${option.cost.toLocaleString()} Cr.`;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    this.player.resources.credits -= option.cost;
    this.starbaseMode.alert = `${installShipyardUpgrade(this.player.ship, optionId)} Cost ${option.cost.toLocaleString()} Cr.`;
    this.statusMessage = this.starbaseMode.alert;
    this.player.cargoHold.capacity = getShipCargoCapacity(this.player.ship);
  }

  /** Purchases a terrain vehicle when the player meets cost and storage requirements. */
  private purchaseTerrainVehicle(): void {
    if (this.player.terrainVehicle.available) {
      this.starbaseMode.alert = 'Terrain vehicle already aboard.';
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    const cost = CONFIG.TERRAIN_VEHICLE_REPLACEMENT_COST;
    if (this.player.resources.credits < cost) {
      this.starbaseMode.alert = `Insufficient credits for terrain vehicle replacement. Required ${cost.toLocaleString()} Cr.`;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    this.player.resources.credits -= cost;
    this.player.terrainVehicle.available = true;
    this.player.terrainVehicle.deployed = false;
    this.player.terrainVehicle.moving = false;
    this.player.terrainVehicle.onFoot = false;
    this.player.terrainVehicle.fuel = this.player.terrainVehicle.maxFuel;
    this.starbaseMode.alert = `Purchased replacement terrain vehicle for ${cost.toLocaleString()} Cr.`;
    this.statusMessage = this.starbaseMode.alert;
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: -cost,
    });
  }

  /** Activates crew selection. */
  private activateCrewSelection(starbase: Starbase, row: StarbaseTableRow): void {
    if (row.disabled) {
      this.starbaseMode.alert = row.detail || 'Crew record unavailable.';
      return;
    }
    if (row.id.startsWith('hire:')) {
      const recruitId = row.id.slice('hire:'.length);
      const recruit = this.getRecruitCandidates(starbase).find((candidate) => candidate.id === recruitId);
      if (!recruit) {
        this.starbaseMode.alert = 'Recruit no longer available.';
        return;
      }
      if (this.player.resources.credits < recruit.hireCost) {
        this.starbaseMode.alert = `Insufficient credits to hire ${recruit.name}. Required ${recruit.hireCost} Cr.`;
        return;
      }
      if (this.player.crew.some((member) => member.id === recruit.id)) {
        this.starbaseMode.alert = `${recruit.name} is already aboard.`;
        return;
      }
      this.player.resources.credits -= recruit.hireCost;
      this.player.crew.push({
        ...recruit,
        skills: { ...recruit.skills },
        skillCaps: { ...recruit.skillCaps },
      });
      this.starbaseMode.alert = `Hired ${recruit.name}, ${recruit.role}.`;
      this.statusMessage = this.starbaseMode.alert;
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
        this.starbaseMode.alert = 'Training record unavailable.';
        return;
      }
      const result = trainCrewSkill(member, skill as CrewSkill);
      this.starbaseMode.alert = result.message;
      this.statusMessage = result.message;
      return;
    }
    this.starbaseMode.alert = row.detail || 'Crew record selected.';
  }

  /** Activates mission selection. */
  private activateMissionSelection(starbase: Starbase, row: StarbaseTableRow): void {
    const system = this.stateManager.currentSystem;
    if (!system) {
      this.starbaseMode.alert = 'Mission board unavailable: local system record missing.';
      return;
    }

    const mission = generateStarbaseMissions(starbase, system).find((candidate) => candidate.id === row.id);
    if (!mission) {
      this.starbaseMode.alert = row.detail || 'No contract selected.';
      return;
    }

    const status = getMissionStatus(mission, {
      acceptedMissionIds: this.acceptedMissionIds,
      completedMissionIds: this.completedMissionIds,
    });
    if (status === 'COMPLETE') {
      this.starbaseMode.alert = formatMissionDetail(mission, status);
      return;
    }
    if (status === 'ACTIVE') {
      this.starbaseMode.alert = formatMissionDetail(mission, status);
      return;
    }

    this.acceptedMissionIds.add(mission.id);
    this.activeMissions[mission.id] = mission;
    this.starbaseMode.alert = `Accepted: ${mission.title}. ${mission.objective.targetLabel}.`;
    this.statusMessage = this.starbaseMode.alert;
  }

  /** Returns starbase rows. */
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
            cells: [
              item.name,
              String(this.player.cargoHold.items[item.itemKey] || 0),
              String(item.sellPrice),
              item.category,
            ],
            detail: item.description,
          }));
      case 'services':
        return [
          {
            id: 'refuel',
            cells: [
              'D/He3 reactor refuel',
              `${(1 / CONFIG.FUEL_PER_CREDIT).toFixed(2)}/fuel`,
              'Available',
              'Uses carried He3 + deuterium first, then station fuel stores.',
            ],
          },
          {
            id: 'repair',
            cells: ['Hull inspection', 'TBD', 'Standby', 'Stub: repair and damage systems are not online.'],
          },
          {
            id: 'storage',
            cells: ['Bonded cargo vault', 'TBD', 'Offline', 'Stub: long-term storage contract interface.'],
          },
        ];
      case 'notices':
        if (!this.stateManager.currentSystem) {
          return [
            {
              id: 'no-notices',
              cells: ['--', 'OFFLINE', 'Station notice cache unavailable.'],
              detail: 'No local system record is attached to this dock.',
              disabled: true,
            },
          ];
        }
        return generateStarbaseNotices(starbase, this.stateManager.currentSystem).map((notice) => ({
          id: notice.id,
          cells: [notice.date, notice.priority, notice.text],
          detail: notice.relatedMissionId
            ? `${notice.detail} Related contract is listed on the mission board.`
            : notice.detail,
        }));
      case 'missions':
        if (!this.stateManager.currentSystem) {
          return [
            {
              id: 'no-missions',
              cells: ['Board unavailable', '0 Cr', '--', 'OFFLINE', 'No local system record.'],
              detail: 'Dock services cannot issue contracts without a system record.',
              disabled: true,
            },
          ];
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
          {
            id: 'terrain-vehicle',
            cells: [
              'Landing bay rover',
              `${CONFIG.TERRAIN_VEHICLE_REPLACEMENT_COST.toLocaleString()} Cr`,
              'Now',
              this.player.terrainVehicle.available
                ? 'Vehicle bay occupied.'
                : 'Purchase replacement rover and surface kit.',
            ],
            detail: 'Replacement includes fuel cell, cargo bay, scanner mast, and recovery transponder.',
            disabled: this.player.terrainVehicle.available,
          },
          ...createShipyardUpgradeOptions(this.player.ship, profile).map((option) => ({
            id: option.id,
            cells: [option.label, `${option.cost.toLocaleString()} Cr`, option.eta, option.workOrder],
            detail: option.detail,
            disabled: option.disabled,
          })),
          {
            id: 's1',
            cells: [
              'Superstructure refit',
              'TBD',
              '--',
              `${this.player.ship.superstructure.name} replacement path reserved.`,
            ],
            detail:
              'Stub: future superstructure replacement and expansion refits. No frame swap is available yet.',
            disabled: true,
          },
          {
            id: 's2',
            cells: ['Survey mast overhaul', '1,250 Cr', '5h', 'Improved scan reach placeholder.'],
            detail: 'Stub: scanner upgrade path.',
            disabled: true,
          },
        ];
      case 'crew':
        return this.getCrewRows(starbase);
    }
  }

  /** Returns cargo rows. */
  private getCargoRows(): StarbaseTableRow[] {
    return this.getCargoRowsForHold(this.player.cargoHold.items, 'ship');
  }

  /** Returns shipyard refit rows. */
  private getShipyardRefitRows(starbase: Starbase): StarbaseTableRow[] {
    const ship = this.player.ship;
    const stats = getShipDerivedStats(ship);
    const profile = getStarbaseShipyardProfile(starbase.name);
    const repairCost = getShipRepairCost(ship);
    const shieldState =
      ship.shieldClass > 0
        ? `Class ${ship.shieldClass}; rating ${stats.shieldRating}`
        : 'Empty shield mount; classes 1-5 available.';
    const laserState =
      ship.laserClass > 0
        ? `Class ${ship.laserClass}; output ${stats.laserRating}`
        : 'Empty laser hardpoint; classes 1-5 available.';
    return [
      {
        id: 'refit:yard',
        cells: [
          'Yard profile',
          '--',
          '--',
          `${profile.label}; shields C${profile.maxShieldClass}, lasers C${profile.maxLaserClass}, repairs ${profile.repairQuality}`,
        ],
        detail: `Station availability is local: missiles ${profile.sellsMissiles ? 'stocked' : 'not stocked'}, cargo pods ${profile.sellsCargoPods ? 'stocked' : 'not stocked'}.`,
        disabled: true,
      },
      {
        id: 'refit:frame',
        cells: [
          'Frame survey',
          '--',
          '--',
          `${ship.superstructure.name}; fitted load ${stats.fittedLoadPercent}%`,
        ],
        detail: `${ship.superstructure.engineMounts} engine, ${ship.superstructure.shieldMounts} shield, ${ship.superstructure.laserMounts} laser, ${ship.superstructure.missileBayMounts} missile, ${ship.superstructure.specialPurposeBays} special, ${ship.superstructure.probeBays} probe, ${ship.superstructure.cargoBays} cargo bays.`,
        disabled: true,
      },
      {
        id: 'refit:engine',
        cells: [
          'Engine mount',
          '--',
          '--',
          `Class ${ship.engineClass}; drive efficiency ${stats.driveEfficiencyPercent}%`,
        ],
        detail:
          'Primary drive is fitted. Future engine refits can use this slot without changing the superstructure.',
        disabled: true,
      },
      {
        id: 'refit:damage',
        cells: [
          'Damage control',
          repairCost > 0 ? `${repairCost.toLocaleString()} Cr` : '--',
          repairCost > 0 ? 'Work' : '--',
          getShipDamageSummary(ship),
        ],
        detail:
          repairCost > 0
            ? 'Enter the damage repair order below to restore hull and damaged subsystems.'
            : 'Hull and fitted modules are reading nominal.',
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
        cells: [
          'Missile bay',
          `${NUCLEAR_MISSILE_COST.toLocaleString()} Cr`,
          'Now',
          `${ship.missileCount}/${stats.missileCapacity} nuclear missiles loaded (${stats.missileLoadPercent}%)`,
        ],
        detail:
          'Existing missile bay magazine accepts nuclear-tipped missiles. Enter the missile row below to load one.',
        disabled: true,
      },
      {
        id: 'refit:cargo',
        cells: [
          'Cargo bays',
          `${CARGO_POD_COST.toLocaleString()} Cr`,
          '2h',
          `${ship.cargoPodsInstalled}/${ship.superstructure.cargoBays} pods; ${stats.cargoCapacity} m^3 capacity`,
        ],
        detail: `${stats.emptyCargoBays} empty cargo bays remain. Each modular cargo pod adds ${ship.cargoPodCapacity} m^3.`,
        disabled: true,
      },
      {
        id: 'refit:special',
        cells: [
          'Special purpose bays',
          'TBD',
          '--',
          `${ship.specialBaysOccupied}/${stats.specialBayCapacity} occupied; ${stats.emptySpecialPurposeBays} reserved`,
        ],
        detail:
          'Future mission labs, repair workshops, medical systems, signal analyzers, or processors can live here.',
        disabled: true,
      },
      {
        id: 'refit:probe',
        cells: [
          'Probe bays',
          'TBD',
          '--',
          `${ship.probeBaysOccupied}/${stats.probeCapacity} occupied; ${stats.emptyProbeBays} empty`,
        ],
        detail: 'Probe bay control exists, but probe construction and launch orders are not online yet.',
        disabled: true,
      },
      {
        id: 'refit:landing',
        cells: [
          'Landing bay',
          '--',
          '--',
          `${stats.landingBayCapacity} bay; ${this.player.terrainVehicle.available ? 'terrain vehicle secured' : 'vehicle missing'}`,
        ],
        detail: 'Landing bay supports the surface vehicle and transfer lock for planetside operations.',
        disabled: true,
      },
    ];
  }

  /** Returns cargo rows for hold. */
  private getCargoRowsForHold(items: Record<string, number>, source: 'ship' | 'rover'): StarbaseTableRow[] {
    const cargoEntries = Object.entries(items).filter(([, amount]) => amount > 0);
    if (cargoEntries.length === 0) {
      const label = source === 'rover' ? 'Rover cargo empty' : 'Cargo hold empty';
      return [
        {
          id: `${source}:empty`,
          cells: [label, '0', '0', 'N/A'],
          detail:
            source === 'rover'
              ? 'Surface vehicle carries recovered material until it docks.'
              : 'Mine or buy cargo to fill the manifest.',
          disabled: true,
        },
      ];
    }
    return cargoEntries.map(([itemKey, amount]) => {
      const info = this.getTradeItemInfo(itemKey);
      const marketItem = this.stateManager.currentStarbase
        ? this.getTradeDepotManifest(this.stateManager.currentStarbase.name).find(
            (item) => item.itemKey === itemKey
          )
        : null;
      const value = (marketItem?.sellPrice ?? info?.baseValue ?? 1) * amount;
      return {
        id: itemKey,
        cells: [info?.name ?? itemKey, String(amount), String(value), marketItem?.category ?? 'mineral'],
        detail: `Estimated lot value ${value} Cr.`,
      };
    });
  }

  /** Returns section status. */
  private getSectionStatus(sectionId: StarbaseSectionId): string {
    if (sectionId === 'sell')
      return this.cargoSystem.getTotalUnits(this.player.cargoHold) > 0 ? 'Ready' : 'No cargo';
    if (sectionId === 'missions') {
      const active = Object.keys(this.activeMissions).filter(
        (id) => !this.completedMissionIds.has(id)
      ).length;
      return active > 0 ? `${active} Active` : 'Available';
    }
    if (sectionId === 'crew') {
      const points = this.player.crew.reduce((sum, member) => sum + member.trainingPoints, 0);
      return points > 0 ? `${points} Training` : `${this.player.crew.length} Aboard`;
    }
    if (sectionId === 'shipyard') return 'Refit';
    return 'Online';
  }

  /** Returns section summary. */
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

  /** Returns crew rows. */
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
      CREW_SKILLS.filter(
        (skill) => member.trainingPoints > 0 && member.skills[skill] < member.skillCaps[skill]
      )
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

  /** Returns recruit candidates. */
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
      this._publishStatusUpdate();
      return;
    }

    const totalUnitsSold = this.cargoSystem.getTotalUnits(this.player.cargoHold);
    let result;
    if (totalUnitsSold <= 0) {
      result = this.starbaseCommerce.buyNext(
        this.stateManager.currentStarbase.name,
        this.starbaseMode.tradeSelectionIndex
      );
      this.starbaseMode.tradeSelectionIndex = result.nextSelectionIndex;
    } else {
      result = this.starbaseCommerce.sellAll(this.stateManager.currentStarbase.name);
    }
    this.statusMessage = result.message;
    this.publishCommerceEffects(result.effects);
    this._publishStatusUpdate();
  }

  /** Returns trade depot manifest. */
  private getTradeDepotManifest(starbaseName: string): TradeDepotItem[] {
    return this.starbaseCommerce.getManifest(starbaseName);
  }

  /** Returns depot purchase limit. */
  private getDepotPurchaseLimit(itemKey: string, rawLimit: number): number {
    return this.starbaseCommerce.getPurchaseLimit(itemKey, rawLimit);
  }

  /** Opens buy quantity selector. */
  private openBuyQuantitySelector(itemKey: string): void {
    const item = this.getTradeDepotManifest(this.stateManager.currentStarbase?.name ?? '').find(
      (candidate) => candidate.itemKey === itemKey
    );
    if (!item) {
      this.starbaseMode.alert = 'Depot item unavailable.';
      return;
    }
    const freeCargo = this.player.cargoHold.capacity - this.cargoSystem.getTotalUnits(this.player.cargoHold);
    const affordableUnits = Math.floor(this.player.resources.credits / item.buyPrice);
    const max = this.getDepotPurchaseLimit(item.itemKey, Math.min(item.units, freeCargo, affordableUnits));
    if (freeCargo <= 0) {
      this.starbaseMode.alert = 'Trade depot: cargo hold is full.';
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    if (max <= 0) {
      this.starbaseMode.alert = `Insufficient credits for ${item.name}.`;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    this.openQuantitySelector(
      createQuantitySelector({
        title: 'Buy Cargo',
        subject: `${item.name} | ${item.buyPrice} Cr/m^3`,
        detail: `${max * item.buyPrice} Cr max spend`,
        unitLabel: 'm^3',
        max,
        value: max,
        min: item.itemKey === 'FUSION_FUEL_MIX' ? 2 : 1,
        step: item.itemKey === 'FUSION_FUEL_MIX' ? 2 : undefined,
        context: { type: 'buy', itemKey },
      })
    );
  }

  /** Opens sell quantity selector. */
  private openSellQuantitySelector(itemKey: string): void {
    const item = this.getTradeDepotManifest(this.stateManager.currentStarbase?.name ?? '').find(
      (candidate) => candidate.itemKey === itemKey
    );
    const held = this.player.cargoHold.items[itemKey] || 0;
    const name = item?.name ?? this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    if (held <= 0) {
      this.starbaseMode.alert = `No ${name} in cargo.`;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    this.openQuantitySelector(
      createQuantitySelector({
        title: 'Sell Cargo',
        subject: `${name} | ${item?.sellPrice ?? 1} Cr/m^3`,
        detail: `${held * (item?.sellPrice ?? 1)} Cr max return`,
        unitLabel: 'm^3',
        max: held,
        value: held,
        context: { type: 'sell', itemKey },
      })
    );
  }

  /** Buys depot item. */
  private buyDepotItem(itemKey: string, amount: number): string {
    const result = this.starbaseCommerce.buyItem(
      this.stateManager.currentStarbase?.name ?? '',
      itemKey,
      amount
    );
    this.publishCommerceEffects(result.effects);
    return result.message;
  }

  /** Sells depot item. */
  private sellDepotItem(itemKey: string, amount: number): string {
    const result = this.starbaseCommerce.sellItem(
      this.stateManager.currentStarbase?.name ?? '',
      itemKey,
      amount
    );
    this.publishCommerceEffects(result.effects);
    return result.message;
  }

  /** Buys selected depot item. */
  private buySelectedDepotItem(market: TradeDepotItem[]): string {
    const item = market[this.starbaseMode.tradeSelectionIndex % market.length];
    return this.buyDepotItem(item.itemKey, item.units);
  }

  /** Sells selected depot item. */
  private sellSelectedDepotItem(market: TradeDepotItem[]): string {
    const item = market[this.starbaseMode.tradeSelectionIndex % market.length];
    const amount = this.player.cargoHold.items[item.itemKey] || 0;
    return this.sellDepotItem(item.itemKey, amount);
  }

  /** Formats selected trade line. */
  private formatSelectedTradeLine(market: TradeDepotItem[]): string {
    const item = market[this.starbaseMode.tradeSelectionIndex % market.length];
    const held = this.player.cargoHold.items[item.itemKey] || 0;
    return `Selected ${item.name}: buy ${item.buyPrice} Cr, sell ${item.sellPrice} Cr, stock ${item.units}, hold ${held}.`;
  }

  /** Returns trade item info. */
  private getTradeItemInfo(itemKey: string): { name: string; baseValue: number } | null {
    return getTradeItemInfo(itemKey);
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

    const result = this.starbaseCommerce.refuel();
    this.statusMessage = result.message;
    this.publishCommerceEffects(result.effects);
    this._publishStatusUpdate();
  }

  /** Publishes commerce effects. */
  private publishCommerceEffects(effects: CommerceEffects): void {
    if (effects.cargoAdded) {
      eventManager.publish(GameEvents.PLAYER_CARGO_ADDED, effects.cargoAdded);
    }
    if (effects.cargoSold) {
      eventManager.publish(GameEvents.PLAYER_CARGO_SOLD, effects.cargoSold);
    }
    if (effects.fuelChanged) {
      eventManager.publish(GameEvents.PLAYER_FUEL_CHANGED, effects.fuelChanged);
    }
    if (effects.creditsChanged) {
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, effects.creditsChanged);
    }
    if (effects.actionFailed) {
      eventManager.publish(GameEvents.ACTION_FAILED, effects.actionFailed);
    }
  }
} // End Game class

/** Wraps delta. */
function wrapDelta(delta: number, size: number): number {
  if (size <= 0) return delta;
  const half = size / 2;
  let wrapped = delta;
  while (wrapped > half) wrapped -= size;
  while (wrapped < -half) wrapped += size;
  return Math.round(wrapped);
}

/** Rounds a cargo quantity to the precision used by inventory calculations. */
function roundCargoQuantity(value: number): number {
  return Math.round(value * 10) / 10;
}
