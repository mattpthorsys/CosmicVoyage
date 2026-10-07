import { RendererFacade } from '../rendering/renderer_facade';
import { Player } from './player';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { AU_IN_METERS, SOLAR_MASS_KG, SOLAR_RADIUS_M, SOLAR_LUMINOSITY_W } from '../constants/physics';
import { getStellarStageLabel } from '../entities/stellar_environment';
import { getStellarDetectionRadii } from './stellar_detection';
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
import { NavigationMarker } from '../entities/navigation_marker';
import { InfrastructureRegistry } from './infrastructure_registry';
import { DepotService } from './depot_service';
import { DepotContracts, type DepotContractCheckpoint, type DepotContractResult } from './depot_contracts';
import {
  DepotServiceConsole,
  createDepotServiceDialog,
  createDepotServiceRows,
  createDepotResourceDialog,
} from './depot_service_console';
import type { DepotDialogIntent, DepotServiceKind, DepotServiceQuote } from './depot_types';
import { SurveyDataService } from './survey_data_service';
import { createSurveyDataSnapshot, parseSurveyAddress, type SurveyUploadQuote } from './survey_data_types';
import { recordLocalSurvey } from './survey_observations';
import { FrontierCatalogue } from './frontier_catalogue';
import { FrontierTerminal, frontierLine, type FrontierTerminalEntry } from './frontier_terminal';
import {
  createSurveyUploadEntries,
  createPublicChartEntries,
  createSurveyUploadDialog,
  type SurveyDialogIntent,
} from './survey_exchange_console';
import { materializeHaulSites } from './haul_sites';
import {
  commitHaulChange,
  prepareHaulCommissioning,
  prepareCommissioningRefill,
} from './heavy_haul_commissioning';
import { SolarSystem } from '../entities/solar_system';
import { eventManager, GameEvents, GameStateChangedEvent, Unsubscribe } from './event_manager';
import { MovementSystem, MoveRequestData } from '../systems/movement_system';
import { CargoSystem } from '../systems/cargo_systems';
import { MiningSite, MiningSystem } from '../systems/mining_system';
import { TerminalOverlay } from '../rendering/terminal_overlay';
import { AstrometricOverlay } from '../rendering/astrometric_overlay';
import {
  DeepSpacePhenomenonProperties,
  InterstellarMediumKind,
  isNavigablePhenomenon,
  SystemDataGenerator,
} from '../generation/system_data_generator';
import { StellarBody } from '../entities/stellar_body';
import { AvailableAction, createAvailableActions } from './available_actions';
import { commandButton, CommandBarButton, CommandBarModel } from './command_bar';
import { getStationSections, StarbaseScreenModel, StarbaseSectionId, StarbaseTableRow } from './starbase_ui';
import {
  clampIndex,
  moveSelection,
  moveSelectionInRows,
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardSegment,
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
import { getPlanetMapSize, OrbitScreenModel } from './orbit_ui';
import { OrbitModeController } from './modes/orbit_mode_controller';
import {
  formatMissionDetail,
  formatMissionDetailSegments,
  generateStarbaseMissions,
  generateStarbaseNotices,
  getHeavyHaulObjective,
  getMissionStatusLabel,
  matchesSpecimenObjective,
  type MissionStatus,
  type StarbaseMission,
} from './mission_board';
import { MissionProgressService } from './mission_progress';
import { MissionJournal, type MissionJournalEntry } from './mission_journal';
import { ScienceLog } from './science_log';
import { ObservatoryController, type ObservatoryScreenModel } from './observatory';
import { ObservatoryService } from './observatory_service';
import { HeavyHaulService } from './heavy_haul_service';
import {
  createHeavyHaulSnapshot,
  sameHaulAddress,
  type HaulHomeboundRoute,
  type HaulQuoteResult,
  type HaulResupplyTarget,
} from './heavy_haul_types';
import { HeavyHaulOffers, type HaulOfferWorld } from './heavy_haul_offers';
import { selectStationMissionOffers } from './station_mission_offers';
import {
  HaulManifest,
  type HaulManifestAction,
  type HaulManifestData,
  type HaulManifestStage,
} from './haul_manifest';
import { TerminalDialog, type TerminalDialogResult, type TerminalDialogSpec } from './terminal_dialog';
import { ScreenTransition } from './screen_transition';
import {
  createMissionAcceptanceDialog,
  createMissionStatusDialog,
  createHaulActionDialog,
  createHaulPrelude,
  createHaulArrivalDialog,
  createHaulResultDialog,
  createHomeboundRouteDialog,
  createHomeboundVoyageDialog,
  createHomeboundPrelude,
  createHomeboundArrivalDialog,
  type MissionDialogIntent,
} from './mission_dialogs';
import { prepareHaulLifecycle } from './heavy_haul_lifecycle';
import {
  resolveHaulNavigation,
  describeHaulStage,
  findHaulHomeboundRoute,
  findHaulHomeboundInstallation,
} from './haul_navigation';
import {
  quoteHomeboundJourney,
  prepareHomeboundJourney,
  commitPreparedHomeboundJourney,
  type HomeboundQuote,
  type PreparedHomeboundJourney,
} from './homebound_journey';
import {
  commitPreparedHaulJourney,
  prepareHaulJourney,
  resolveHaulQuoteContext,
  type HaulJourneyRequest,
  type PreparedHaulJourney,
} from './heavy_haul_journey';
import {
  capturePlanetMutations,
  captureSystemOrbit,
  restorePlanetProgress,
  restoreSystemOrbits,
  systemAddress,
  systemAddressKey,
  type SystemOrbitHistoryRecord,
} from './system_orbit_state';
import { frameToSimulatedSeconds, SIMULATED_SECONDS_PER_REAL_SECOND } from './simulation_time';
import { getTowLocalStepFactor, quoteHeavyHaul } from './tow_performance';
import { getFunctionalHypersleepBerths } from './ship_modifications';
import { TOW_COUPLERS, HAUL_RENDEZVOUS_RANGE_M } from '../constants/heavy_haul';
import {
  createObservatorySnapshot,
  getObservatoryCapabilities,
  observatoryDistanceLy,
  type ObservatoryContact,
} from './observatory_types';
import { biologySurveyReport, biologySurveySummary, habitatLandingPreview } from './biology_survey';
import {
  getMissionLandingBody,
  getMissionLandingLocation,
  getMissionLandingObjectiveIndices,
  getRecordedLandingBody,
  isMissionSystem,
  resolveMissionNavigation,
} from './mission_navigation';
import {
  createBiologicalContracts,
  deliverBiologicalContract,
  biologicalRequirement,
} from './biological_contracts';
import type { BiologicalFieldRequest } from './biological_mission_guidance';
import { ScanService } from './scan_service';
import { DiscoveryLevel, formatDiscoveryLevel, hasDiscoveryLevel } from './discovery';
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
  getEngineFuelUseMultiplier,
  getShipRepairCost,
  getStarbaseShipyardProfile,
  installShipyardUpgrade,
  NUCLEAR_MISSILE_COST,
  ROVER_REPAIR_COST_PER_POINT,
} from './ship_modifications';
import { ShipRepairConsole, createRepairQuotes, purchaseRepairs } from './ship_repair_console';
import { BEHAVIOUR_OBSERVATION_LABELS } from '../entities/biology/behaviour_observations';
import { formatDistanceAu, formatHyperspaceSpan, formatLightTimeFromMeters } from '../utils/space_scale';
import { HyperspaceSurveyService, HyperspaceSurveyContact } from './hyperspace_survey';
import { createShipStatusDashboard } from './ship_status_dashboard';
import { TEXT_PALETTE } from '../rendering/text_palette';
import { createPlayerViewSnapshot, createSceneViewModel } from '../rendering/scene_view_model';
import {
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
  LocationSaveData,
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
import { getOperationalCapabilities } from './operational_capabilities';
import { SurfacePrefetchService } from './surface_prefetch';
import { GalaxyMapController } from './galaxy_map';
import { TelemetryField, TravelTelemetryModel } from './travel_telemetry';
import { XenobiologyService } from './xenobiology_service';
import { SurfaceEncounterController } from './modes/surface_encounter_controller';
import {
  createEncounter,
  createCollectionContainer,
  SurfaceEncounterSystem,
  type EncounterCommand,
  individualProfile,
  encounterVisible,
} from '../systems/surface_encounter_system';
import { prepareEncounterSurface } from './encounter_surface';
import { SpecimenCargoSystem } from '../systems/specimen_cargo_system';
import { isMicrobialPatch } from '../entities/biology/biology_rules';
import { propaguleAvailability, supportsPropagules } from '../entities/biology/propagules';
import { prepareBiosphere } from '../entities/biology/biosphere_generator';
import {
  type BiosphereDefinition,
  type EncounterField,
  type SpecimenContainer,
  type BiologyOrigin,
  type BiologySite,
  createXenobiologySnapshot,
} from '../entities/biology/biology_types';
import {
  createEncounterView,
  researchRows,
  specimenRows,
  specimenSaleRows,
  biologyDashboard,
} from './xenobiology_ui';
import { surfaceCoordinates, surfaceLongitudeDelta } from '../utils/surface_coordinates';

// ScanTarget type includes SolarSystem now
type ScanTarget = Planet | Starbase | NavigationMarker | StellarBody | SolarSystem;
type NavigationTarget = Planet | Starbase | NavigationMarker | StellarBody;
type VoyageTransitionIntent =
  | { readonly mission: StarbaseMission; readonly journey: PreparedHaulJourney }
  | { readonly kind: 'homebound'; readonly journey: PreparedHomeboundJourney };
type RoverActionId =
  | 'operations'
  | 'science'
  | 'missions'
  | 'map'
  | 'move'
  | 'cargo'
  | 'pickup'
  | 'mine'
  | 'scan'
  | 'life'
  | 'repair'
  | 'stun'
  | 'shoot'
  | 'embark'
  | 'icon';
type QuantityOperation =
  | { type: 'buy'; itemKey: string }
  | { type: 'sell'; itemKey: string }
  | { type: 'jettison'; itemKey: string }
  | { type: 'mine'; x?: number; y?: number };

const COMPACT_INTERSTELLAR_MEDIUM_LABELS: Record<InterstellarMediumKind, string> = {
  'cold-void': 'COLD VOID',
  'diffuse-hydrogen': 'H I',
  'molecular-dust': 'MOLECULAR',
  'ionised-plasma': 'PLASMA',
  'radiation-front': 'RAD FRONT',
  'gravitational-shear': 'GRAV SHEAR',
};

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

type GameDialogIntent = MissionDialogIntent | DepotDialogIntent | SurveyDialogIntent;

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
  mutation: Pick<PlanetMutationSaveData, 'worldX' | 'worldY' | 'systemSlot' | 'bodyPath'>
): string {
  return `${mutation.worldX},${mutation.worldY},${mutation.systemSlot ?? 0}/${mutation.bodyPath}`;
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
  private _scanService?: ScanService;
  private _missionProgress?: MissionProgressService;
  private _missionJournal?: MissionJournal;
  private _scienceLog?: ScienceLog;
  private _observatoryService?: ObservatoryService;
  private _observatoryController?: ObservatoryController;
  private _heavyHaulService?: HeavyHaulService;
  private _haulOffers?: HeavyHaulOffers;
  private _haulManifest?: HaulManifest;
  private _terminalDialog?: TerminalDialog<GameDialogIntent>;
  private _screenTransition?: ScreenTransition<VoyageTransitionIntent>;
  private pendingHomeboundArrival: PreparedHomeboundJourney | null = null;
  private sleepingHaulCrew = 0;
  private _infrastructureRegistry?: InfrastructureRegistry;
  private bulkAdvanceSeconds = 0;
  private systemOrbitRegistry?: Map<string, SystemOrbitHistoryRecord>;
  private materializedOrbitalSystem: SolarSystem | null = null;
  private journeyCheckpointWriter?: (save: GameSave) => void;
  private observatorySearchSerial = 0;
  private _surfacePrefetch?: SurfacePrefetchService;
  private readonly eventUnsubscribers: Unsubscribe[];
  private _starbaseCommerce?: StarbaseCommerceService;
  private _depotService?: DepotService;
  private _depotContracts?: DepotContracts;
  private _depotConsole?: DepotServiceConsole;
  private _surveyData?: SurveyDataService;
  private _frontierCatalogue?: FrontierCatalogue;
  private _frontierTerminal?: FrontierTerminal;
  private frontierSearchSerial = 0;
  private _travelMode?: TravelModeController;
  private _orbitModeState?: OrbitModeController;
  private _surfaceMode?: SurfaceModeController;
  private _starbaseMode?: StarbaseController;
  private _shipOperations?: ShipOperationsController;
  private _shipRepairConsole?: ShipRepairConsole;
  private _modeDispatcher?: GameModeDispatcher;
  private _interfaceMode?: InterfaceModeController<
    QuantitySelectorState<QuantityOperation>,
    SurfaceExtractionSelectorState,
    JettisonConfirmationState
  >;
  private _galaxyMap?: GalaxyMapController;
  private _xenobiology?: XenobiologyService;
  private _encounterController?: SurfaceEncounterController;
  private _encounterSystem?: SurfaceEncounterSystem;
  private biosphereCache?: WeakMap<Planet, { ready: boolean; biosphere: BiosphereDefinition | null }>;
  private habitatSelection = 0;
  private planetMutationRegistry = new Map<string, PlanetMutationSaveData>();
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

  /** Returns the scan service, including for lightweight prototype-based test harnesses. */
  private get scanService(): ScanService {
    this._scanService ??= new ScanService();
    return this._scanService;
  }

  /** Owns the catalogue and evidence independently of the instrument's transient UI state. */
  private get observatoryService(): ObservatoryService {
    return (this._observatoryService ??= new ObservatoryService(
      this.systemDataGenerator,
      this.gameSeedPRNG,
      undefined,
      this.infrastructureRegistry,
      () => this.bulkAdvanceSeconds ?? 0,
      (contact, observation) =>
        this.surveyData.recordRemote(contact, observation, this.gameClockElapsedSeconds ?? 0)
    ));
  }

  /** Keeps tow state tied to the existing canonical mission owner, without generating production offers. */
  private get heavyHaulService(): HeavyHaulService {
    return (this._heavyHaulService ??= new HeavyHaulService(this.missionProgress));
  }

  /** Owns persistent installations independently of generator caches and live scene objects. */
  private get infrastructureRegistry(): InfrastructureRegistry {
    return (this._infrastructureRegistry ??= new InfrastructureRegistry());
  }

  /** Shares one persistent operations owner between natural and player-commissioned depots. */
  private get depotService(): DepotService {
    return (this._depotService ??= new DepotService(
      this.starbaseCommerce,
      this.gameSeedPRNG.getInitialSeed(),
      this.player,
      this.cargoSystem
    ));
  }

  /** Keeps robotic service selection/reveal separate from station tabs and gameplay inventory. */
  private get depotConsole(): DepotServiceConsole {
    return (this._depotConsole ??= new DepotServiceConsole());
  }

  /** Owns paid science separately from catalogue details that can be evicted. */
  private get surveyData(): SurveyDataService {
    return (this._surveyData ??= new SurveyDataService());
  }

  /** Shares bounded worker-backed physical catalogue queries between frontier instruments. */
  private get frontierCatalogue(): FrontierCatalogue {
    return (this._frontierCatalogue ??= new FrontierCatalogue(this.systemDataGenerator, this.gameSeedPRNG));
  }

  /** Keeps frontier terminal presentation out of science, station and navigation owners. */
  private get frontierTerminal(): FrontierTerminal {
    return (this._frontierTerminal ??= new FrontierTerminal());
  }

  /** Coordinates bounded robotic jobs through the existing stock, mission and operational owners. */
  private get depotContracts(): DepotContracts {
    return (this._depotContracts ??= new DepotContracts(
      this.depotService,
      this.starbaseCommerce,
      this.missionProgress,
      this.player,
      this.cargoSystem,
      this.gameSeedPRNG.getInitialSeed()
    ));
  }

  /** Initialises real service inventories on materialisation, never inside station rendering. */
  private prepareSystemDepots(system: SolarSystem): void {
    const address = systemAddress(system);
    const assets = this.infrastructureRegistry.at(address);
    for (const station of system.stations ?? []) {
      if (station.kind !== 'automated-depot') continue;
      const commissioned = assets.find((asset) => asset.assetId === station.id)?.commissionedAtSeconds;
      this.depotService.ensureStation(
        station,
        address,
        this.gameClockElapsedSeconds ?? 0,
        commissioned,
        system
      );
      this.depotContracts.refreshStation(station, system, this.gameClockElapsedSeconds ?? 0);
      if (station.capabilities.surveyExchange) this.surveyData.ensureBuyer(station.id, address);
    }
  }

  /** Keeps bounded offer generation independent of ship state and the gameplay random stream. */
  private get haulOffers(): HeavyHaulOffers {
    return (this._haulOffers ??= new HeavyHaulOffers(
      this.gameSeedPRNG.getInitialSeed(),
      this.haulJourneyWorld
    ));
  }

  /** Owns the paused voyage terminal independently of the mission board and travel controls. */
  private get haulManifest(): HaulManifest {
    return (this._haulManifest ??= new HaulManifest());
  }

  /** Owns foreground confirmations independently of the station, journal or manifest underneath. */
  private get terminalDialog(): TerminalDialog<GameDialogIntent> {
    return (this._terminalDialog ??= new TerminalDialog());
  }

  /** Coordinates a visual blackout around one prepared, checkpointed voyage. */
  private get screenTransition(): ScreenTransition<VoyageTransitionIntent> {
    return (this._screenTransition ??= new ScreenTransition());
  }

  /** Clears held keys and transient HUD when a terminal choice takes foreground ownership. */
  private showTerminalDialog(spec: TerminalDialogSpec<GameDialogIntent>): void {
    this.terminalDialog.open(spec);
    this.inputManager.clearState();
    this.terminalOverlay.clear();
    this.astrometricOverlay.clear();
    this.forceFullRender = true;
    this._publishStatusUpdate();
  }

  /** Consumes every keyboard shortcut while a choice or persistent message is visible. */
  private handleTerminalDialogInput(): boolean {
    if (!this.terminalDialog.isOpen) return false;
    const model = this.terminalDialog.createModel(this.renderer.getGridCols(), this.renderer.getGridRows());
    const result = this.terminalDialog.input(this.inputManager, model);
    if (result) this.finishTerminalDialog(result);
    if (this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Applies only an explicit choice, then prevents its key from acting on the restored parent. */
  private finishTerminalDialog(result: TerminalDialogResult<GameDialogIntent>): void {
    this.inputManager.clearState();
    const intent = result.intent;
    if (intent?.kind === 'accept-mission') this.confirmMissionAcceptance(intent.mission, intent.stationId);
    else if (intent?.kind === 'haul-action') this.performHaulAction(intent.mission, intent.action);
    else if (intent?.kind === 'view-haul') this.openHaulManifest(intent.mission);
    else if (intent?.kind === 'homebound-route') this.navigateHomeboundRoute(intent.route);
    else if (intent?.kind === 'offer-homebound') this.openHomeboundVoyage(intent.assetId);
    else if (intent?.kind === 'begin-homebound') this.beginHomeboundVoyage(intent.assetId, intent.quote);
    else if (intent?.kind === 'depot-service') this.performDepotService(intent.quote);
    else if (intent?.kind === 'depot-contract') this.performDepotContract(intent.missionId, intent.action);
    else if (intent?.kind === 'survey-upload') this.performSurveyUpload(intent.quote);
    this.forceFullRender = true;
    this._publishStatusUpdate();
  }

  /** Retrieves durable issuer metadata, retaining the last marked port for pre-metadata deliveries. */
  private getHomeboundRoute(): HaulHomeboundRoute | null {
    return findHaulHomeboundRoute(
      this.infrastructureRegistry.createSnapshot(),
      this._observatoryService?.snapshot.destination
    );
  }

  /** Offers the latest deferred automatic return, keeping local or completed returns as ordinary port navigation. */
  private openHomeboundVoyage(assetId?: string): void {
    const installations = this.infrastructureRegistry.createSnapshot();
    const asset = assetId
      ? installations.find((entry) => entry.assetId === assetId)
      : findHaulHomeboundInstallation(installations);
    if (assetId && !asset) {
      this.showHomeboundFailure('The delivered installation no longer has a saved return route.');
      return;
    }
    const route = asset?.homeboundRoute ?? this.getHomeboundRoute();
    if (!route) return;
    const inHomeSystem =
      this.stateManager.state === 'system' &&
      this.stateManager.currentSystem &&
      sameHaulAddress(systemAddress(this.stateManager.currentSystem), route.systemAddress);
    if (!asset || asset.homeboundReceipt || inHomeSystem) {
      this.showTerminalDialog(
        createHomeboundRouteDialog(
          route,
          observatoryDistanceLy(this.player.position.worldX, this.player.position.worldY, route.systemAddress)
        )
      );
      return;
    }
    const save = this.createSaveGame();
    this.showTerminalDialog(
      createHomeboundVoyageDialog(
        route,
        asset.assetId,
        quoteHomeboundJourney(save, asset.assetId),
        save.player.resources.fuel
      )
    );
  }

  /** Revalidates the displayed quote before starting a one-time automatic voyage through the existing blackout. */
  private beginHomeboundVoyage(assetId: string, quote: HomeboundQuote): void {
    const prepared = prepareHomeboundJourney(
      this.createSaveGame(),
      this.stateManager.currentSystem,
      assetId,
      this.haulJourneyWorld,
      quote
    );
    if (!prepared.ok) {
      this.showHomeboundFailure(prepared.message);
      return;
    }
    this.pendingHomeboundArrival = null;
    this.sleepingHaulCrew = prepared.journey.quote.requiredBerths;
    this.screenTransition.start(
      { kind: 'homebound', journey: prepared.journey },
      {
        preludeSeconds: this.sleepingHaulCrew ? 1.2 : 0.7,
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      }
    );
    this.shipOperations.close();
    this.interfaceMode.close();
    this.showTerminalDialog(createHomeboundPrelude(prepared.journey));
  }

  /** Leaves refusal or checkpoint failure visible without advancing time or draining fuel. */
  private showHomeboundFailure(message: string): void {
    this.statusMessage = message;
    this.showTerminalDialog({
      title: 'RETURN UNAVAILABLE',
      kind: 'message',
      caution: true,
      lines: [{ segments: [{ text: message, tone: 'red', font: 'thin' }] }],
    });
  }

  /** Plots an untowed return or approaches the actual home port without teleporting or changing the calendar. */
  private navigateHomeboundRoute(route: HaulHomeboundRoute): void {
    if (this.heavyHaulService.attachedTowPolicy) {
      this.statusMessage = 'Release the external tow before selecting homebound travel.';
      return;
    }
    this.observatoryService.markSystemDestination(route.systemAddress, route.stationName);
    const system = this.stateManager.state === 'system' ? this.stateManager.currentSystem : null;
    const station =
      system && sameHaulAddress(systemAddress(system), route.systemAddress)
        ? system.stations.find((entry) =>
            route.stationId ? entry.id === route.stationId : entry.name === route.stationName
          )
        : null;
    if (station) {
      this.closeShipMenu();
      this.selectNavigationTarget(station, true);
    } else {
      const message = `Homeward route set: ${route.stationName} / X ${route.systemAddress.worldX}, Y ${route.systemAddress.worldY}. Follow the destination bearing in hyperspace; normal fuel applies.`;
      if (this.isShipOperationsRequiredOnSurface()) this.statusMessage = message;
      else this.closeShipMenu(message);
    }
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Builds a world-verified quote once per inspection/action, never in the drawing loop. */
  private buildHaulManifestData(selected?: StarbaseMission): HaulManifestData {
    const save = this.createSaveGame();
    const tow = save.heavyHaul.activeTow;
    const mission = selected ?? (tow ? this.missionProgress.getMission(tow.missionId) : undefined);
    const objective = mission && getHeavyHaulObjective(mission);
    const stage: HaulManifestStage = !mission
      ? 'none'
      : save.completedMissionIds.includes(mission.id)
        ? 'complete'
        : tow?.missionId === mission.id
          ? tow.stage
          : 'available';
    let quote: HaulQuoteResult = { ok: false, quote: null, reasons: ['No external haul selected.'] };
    if (objective && mission) {
      const resupply =
        objective.resupply ??
        (mission.originStarbaseId
          ? { systemAddress: objective.pickup.systemAddress, stationId: mission.originStarbaseId }
          : null);
      try {
        if (!resupply) throw new Error('No certified supply endpoint recorded.');
        const context = resolveHaulQuoteContext(
          save,
          objective.destination.systemAddress,
          resupply,
          this.haulJourneyWorld,
          objective
        );
        quote = quoteHeavyHaul(
          objective,
          context,
          stage === 'attached' ? tow?.remainingSupportFuelUnits : undefined
        );
      } catch (error) {
        quote = {
          ok: false,
          quote: null,
          reasons: [error instanceof Error ? error.message : 'Supply verification failed.'],
        };
      }
    }
    const system = this.stateManager.currentSystem;
    const marker =
      objective &&
      system?.navigationMarkers.find(
        (entry) => entry.id === (stage === 'arrived' ? objective.destination.siteId : objective.pickup.siteId)
      );
    const nearby =
      marker &&
      Math.hypot(
        this.player.position.systemX - marker.systemX,
        this.player.position.systemY - marker.systemY
      ) <= HAUL_RENDEZVOUS_RANGE_M;
    const staging = describeHaulStage(
      stage,
      objective?.route.kind === 'interstellar',
      !!nearby,
      !!system?.isAtEdge(this.player.position.systemX, this.player.position.systemY),
      this.stateManager.state === 'system'
    );
    const receipt = mission
      ? save.heavyHaul.journeyReceipts[`${mission.id}:transit`]
      : Object.values(save.heavyHaul.journeyReceipts).sort((a, b) => b.arrivalSeconds - a.arrivalSeconds)[0];
    const installation =
      receipt && save.infrastructure.find((asset) => asset.sourceMissionId === receipt.missionId);
    return {
      mission,
      stage,
      quote,
      normalFuel: save.player.resources.fuel,
      maximumFuel: save.player.resources.maxFuel,
      remainingSupport:
        stage === 'complete'
          ? 0
          : tow?.missionId === mission?.id
            ? (tow?.remainingSupportFuelUnits ?? 0)
            : (objective?.package.supportFuelCapacityUnits ?? 0),
      departureDate: this.getGameDateTimeLabel(receipt?.departureSeconds ?? this.gameClockElapsedSeconds),
      arrivalDate: this.getGameDateTimeLabel(
        receipt?.arrivalSeconds ?? this.gameClockElapsedSeconds + (quote.quote?.durationSeconds ?? 0)
      ),
      staging,
      receipt,
      recentOutcome: receipt
        ? installation
          ? `Commissioned at ${installation.systemName} / escrow settled`
          : save.heavyHaul.retiredMissionIds.includes(receipt.missionId)
            ? 'Contractor recovery / no payment'
            : 'Arrival recorded / deployment pending'
        : undefined,
    };
  }

  /** Opens from a station board, Operations or journal without advancing the game calendar. */
  private openHaulManifest(mission?: StarbaseMission): void {
    const parent = this.interfaceMode.kind;
    if (parent !== 'none' && parent !== 'ship-menu' && parent !== 'mission-journal') return;
    this.haulManifest.open(this.buildHaulManifestData(mission), parent);
    this.interfaceMode.open('haul-manifest');
    this.statusMessage = '';
    this.terminalOverlay.clear();
    this.astrometricOverlay.clear();
    this.inputManager.clearState();
    this.forceFullRender = true;
    this._publishStatusUpdate();
  }

  /** Restores the parent menu or clears it for an explicitly selected travel approach. */
  private closeHaulManifest(toTravel = false): void {
    const parent = toTravel ? 'none' : this.haulManifest.returnTo;
    if (parent === 'none') this.interfaceMode.close('haul-manifest');
    else this.interfaceMode.open(parent);
    this.haulManifest.reveal.complete();
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Selects only materialized local contacts; remote endpoints become interstellar destination marks. */
  private navigateHaulManifest(): void {
    const data = this.haulManifest.data;
    const mission = data?.mission;
    const objective = mission && getHeavyHaulObjective(mission);
    if (!data || !mission || !objective) return;
    const system = this.stateManager.state === 'system' ? this.stateManager.currentSystem : null;
    const solution = resolveHaulNavigation(
      mission.id,
      objective,
      data.stage,
      system ? systemAddress(system) : null,
      mission.originStarbaseId
    );
    if (solution.localSiteId && system) {
      const target =
        data.stage === 'complete'
          ? system.stations.find((entry) => entry.id === solution.localSiteId)
          : system.navigationMarkers.find((entry) => entry.id === solution.localSiteId);
      if (target) {
        this.closeHaulManifest(true);
        this.selectNavigationTarget(target, true);
        return;
      }
      this.haulManifest.notice = 'Local contact unavailable. Reopen the manifest after entering its system.';
    } else {
      this.observatoryService.markSystemDestination(
        solution.endpoint.systemAddress,
        data.stage === 'complete' ? mission.originStarbaseName : solution.endpoint.systemName
      );
      this.haulManifest.notice =
        data.stage === 'complete'
          ? `Homeward route marked to ${mission.originStarbaseName}. Return using normal, untowed travel.`
          : this.stateManager.state === 'starbase'
            ? 'Destination marked. Undock before engaging local approach.'
            : data.stage === 'available'
              ? 'Destination marked. Accept the contract to reserve local rendezvous contacts.'
              : `Destination marked: ${solution.endpoint.systemName}. Enter the contracted system before local approach.`;
    }
    this.haulManifest.viewOffset = 0;
    this.forceFullRender = true;
  }

  /** Routes exclusive modal controls through durable lifecycle, voyage and commissioning coordinators. */
  private handleHaulManifestInput(): boolean {
    if (!this.interfaceMode.is('haul-manifest')) return false;
    const model = this.haulManifest.createModel(this.renderer.getGridCols(), this.renderer.getGridRows());
    const intent = this.haulManifest.input(this.inputManager, model);
    if (intent === 'close') this.closeHaulManifest();
    else if (intent === 'navigate') this.navigateHaulManifest();
    else if (intent) {
      const mission = this.haulManifest.data?.mission;
      const objective = mission && getHeavyHaulObjective(mission);
      if (mission && objective && this.haulManifest.data) {
        this.showTerminalDialog(createHaulActionDialog(mission, intent, this.haulManifest.data));
      }
    }
    if (this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Executes a confirmed haul operation and keeps its durable outcome visible until acknowledged. */
  private performHaulAction(mission: StarbaseMission, action: HaulManifestAction): void {
    if (action === 'depart') {
      this.beginHaulVoyage(mission);
      return;
    }
    const result =
      action === 'deploy'
        ? this.deployHaulInstallation()
        : commitHaulChange(
            prepareHaulLifecycle(
              this.createSaveGame(),
              action === 'accept' ? { kind: 'accept', mission } : { kind: action },
              this.stateManager.currentSystem,
              this.haulJourneyWorld
            ),
            this.journeyCheckpointWriter,
            (save) => this.applyHaulChange(save)
          );
    this.refreshHaulActionResult(mission, action, result);
    this.showTerminalDialog(createHaulResultDialog(mission, action, result));
  }

  /** Rebuilds the paused readout after domain effects without repeating any transaction. */
  private refreshHaulActionResult(
    mission: StarbaseMission,
    action: HaulManifestAction,
    result: { readonly ok: boolean; readonly message: string },
    openManifest = true
  ): void {
    if (openManifest) this.interfaceMode.open('haul-manifest');
    if (action === 'depart' && result.ok) this.haulManifest.returnTo = 'none';
    this.haulManifest.refresh(
      this.buildHaulManifestData(action === 'recover' && result.ok ? undefined : mission),
      result.message,
      result.ok
    );
    this.statusMessage = result.message;
    if (this.stateManager.state === 'starbase') this.starbaseMode.alert = result.message;
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Verifies staging and equipment before announcing sleep, then freezes the source until blackout. */
  private beginHaulVoyage(mission: StarbaseMission): void {
    const source = this.stateManager.currentSystem;
    const objective = getHeavyHaulObjective(mission);
    const prepared =
      source && objective?.resupply
        ? prepareHaulJourney(
            this.createSaveGame(),
            source,
            { resupply: objective.resupply, expectedQuote: this.haulManifest.data?.quote.quote ?? undefined },
            this.haulJourneyWorld
          )
        : { ok: false as const, message: 'Departure requires the contracted source and supply route.' };
    if (!prepared.ok) {
      this.refreshHaulActionResult(mission, 'depart', prepared);
      this.showTerminalDialog(createHaulResultDialog(mission, 'depart', prepared));
      return;
    }
    this.pendingHomeboundArrival = null;
    this.sleepingHaulCrew = prepared.journey.quote.requiredBerths;
    this.screenTransition.start(
      { mission, journey: prepared.journey },
      {
        preludeSeconds: this.sleepingHaulCrew ? 1.2 : 0.7,
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      }
    );
    this.interfaceMode.close('haul-manifest');
    this.showTerminalDialog(
      createHaulPrelude({
        ...this.haulManifest.data!,
        quote: { ok: true, quote: prepared.journey.quote, reasons: [] },
      })
    );
  }

  /** Drives visual phases while the calendar is paused, committing the prepared voyage once at blackout. */
  private updateHaulVoyageTransition(deltaTime: number): void {
    const phase = this.screenTransition.phase;
    const event = this.screenTransition.update(this.currentVisualDeltaSeconds || deltaTime);
    if (phase === 'prelude' && this.screenTransition.phase !== 'prelude') {
      this.terminalDialog.close();
      this.forceFullRender = true;
    }
    if (event?.kind === 'commit') {
      if ('kind' in event.intent) {
        const journey = event.intent.journey;
        const result = commitPreparedHomeboundJourney(journey, this.journeyCheckpointWriter, (arrival) => {
          this.applyHaulArrival(arrival);
          const port = arrival.system.stations.find((station) => station.id === arrival.stationId);
          if (port) this.selectNavigationTarget(port, false);
        });
        this.statusMessage = result.message;
        if (result.ok) {
          this.pendingHomeboundArrival = journey;
          this.screenTransition.resume();
        } else {
          this.screenTransition.reset();
          this.sleepingHaulCrew = 0;
          this.showHomeboundFailure(result.message);
        }
        this.forceFullRender = true;
        this._publishStatusUpdate();
        return;
      }
      const result = this.commitHaulJourney(event.intent.journey);
      this.refreshHaulActionResult(event.intent.mission, 'depart', result, !result.ok);
      if (result.ok) this.screenTransition.resume();
      else {
        this.screenTransition.reset();
        this.showTerminalDialog(createHaulResultDialog(event.intent.mission, 'depart', result));
      }
      this.forceFullRender = true;
      this._publishStatusUpdate();
    } else if (event?.kind === 'complete') {
      const homebound = this.pendingHomeboundArrival;
      this.pendingHomeboundArrival = null;
      const data = this.haulManifest.data;
      if (homebound)
        this.showTerminalDialog(
          createHomeboundArrivalDialog(
            homebound,
            this.getGameDateTimeLabel(homebound.receipt.departureSeconds),
            this.getGameDateTimeLabel(homebound.receipt.arrivalSeconds)
          )
        );
      else if (data?.receipt)
        this.showTerminalDialog(
          createHaulArrivalDialog({ ...data, receipt: data.receipt }, this.sleepingHaulCrew)
        );
      this.sleepingHaulCrew = 0;
      this.forceFullRender = true;
    }
  }

  /** Lazily owns visited stellar/station phases, including lightweight non-canvas harnesses. */
  private get orbitalHistory(): Map<string, SystemOrbitHistoryRecord> {
    return (this.systemOrbitRegistry ??= new Map());
  }

  /** Gives the application an explicit throwing checkpoint boundary, independent of asynchronous autosave. */
  setJourneyCheckpointWriter(writer: (save: GameSave) => void): void {
    this.journeyCheckpointWriter = writer;
  }

  /** Queries fresh natural worlds without changing generator blueprints or the active system. */
  private get haulJourneyWorld(): HaulOfferWorld {
    return {
      hasStellarSystem: (address) => {
        if (address.systemSlot !== 0) return false;
        const properties = this.systemDataGenerator.getSystemMapProperties(address.worldX, address.worldY, 0);
        return properties.exists && properties.objectKind === 'stellar';
      },
      createSystem: (address) => {
        if (address.systemSlot !== 0) return null;
        const properties = this.systemDataGenerator.getSystemProperties(address.worldX, address.worldY, 0);
        if (!properties.exists || properties.objectKind !== 'stellar') return null;
        return new SolarSystem(properties, address.worldX, address.worldY, this.gameSeedPRNG);
      },
    };
  }

  /** Supplies the future manifest with current, world-verified capability/fuel information. */
  quoteHaulJourney(resupply: HaulResupplyTarget): HaulQuoteResult {
    const active = this.heavyHaulService.createSnapshot().activeTow;
    const mission = active && this.missionProgress.getMission(active.missionId);
    const objective = mission && getHeavyHaulObjective(mission);
    if (!objective) return { ok: false, quote: null, reasons: ['No active heavy-haul contract.'] };
    try {
      const context = resolveHaulQuoteContext(
        this.createSaveGame(),
        objective.destination.systemAddress,
        resupply,
        this.haulJourneyWorld,
        objective
      );
      return this.heavyHaulService.quote(context);
    } catch (error) {
      return {
        ok: false,
        quote: null,
        reasons: [error instanceof Error ? error.message : 'Supply route unavailable.'],
      };
    }
  }

  /** Executes a quoted transfer once; preparing or failing its checkpoint changes no physical gameplay state. */
  departHaulJourney(request: HaulJourneyRequest): { readonly ok: boolean; readonly message: string } {
    const source = this.stateManager.currentSystem;
    if (!source) return { ok: false, message: 'Departure requires the contracted source system.' };
    const prepared = prepareHaulJourney(this.createSaveGame(), source, request, this.haulJourneyWorld);
    if (!prepared.ok) return prepared;
    return this.commitHaulJourney(prepared.journey);
  }

  /** Shares the single durable voyage boundary between immediate callers and the visual transition. */
  private commitHaulJourney(prepared: PreparedHaulJourney): {
    readonly ok: boolean;
    readonly message: string;
  } {
    const result = commitPreparedHaulJourney(prepared, this.journeyCheckpointWriter, (journey) =>
      this.applyHaulArrival(journey)
    );
    this.statusMessage = result.message;
    this._publishStatusUpdate();
    return result;
  }

  /** Applies an already validated, durable checkpoint; no world generation or further resource calculations occur here. */
  private applyHaulArrival(journey: Pick<PreparedHaulJourney, 'save' | 'system' | 'position'>): void {
    const save = journey.save;
    const previousFuel = this.player.resources.fuel;
    this.gameClockElapsedSeconds = save.gameClockElapsedSeconds;
    this.bulkAdvanceSeconds = save.bulkAdvanceSeconds;
    this.planetMutationRegistry = new Map(
      save.planetMutations.map((entry) => [getPlanetMutationKey(entry), cloneSaveValue(entry)])
    );
    this.systemOrbitRegistry = new Map(
      save.systemOrbitHistory.map((entry) => [systemAddressKey(entry), cloneSaveValue(entry)])
    );
    this.heavyHaulService.restoreSnapshot(save.heavyHaul, save.gameClockElapsedSeconds);
    this.infrastructureRegistry.restore(save.infrastructure, save.observatory?.destination);
    this.player.position = cloneSaveValue(save.player.position);
    this.player.render = cloneSaveValue(save.player.render);
    this.player.resources = cloneSaveValue(save.player.resources);
    if (this._observatoryService || save.observatory?.destination)
      this.observatoryService.snapshot.destination = cloneSaveValue(save.observatory?.destination ?? null);
    // The prepared destination already includes its voyage epoch. Do not recapture the departed source at the new clock.
    this.materializedOrbitalSystem = journey.system;
    this.currentZoomLevelIndex = DEFAULT_SYSTEM_ZOOM_INDEX;
    this.inputManager.clearState();
    this.terminalOverlay.clear();
    this.astrometricOverlay.clear();
    this.hyperspaceSurveyService.clearCache();
    this.renderer.invalidateWorldScene();
    this.renderer.clearOverlay();
    this.lastMainRenderSignature = '';
    this.autoScannedSystemName = null;
    this.travelMode.targetMenuSelection = 0;
    this.travelMode.targetMenuOffset = 0;
    this.stateManager.installHaulArrival(journey.system, journey.position);
    this.prepareSystemDepots(journey.system);
    this.lastUpdateTime = performance.now();
    this.forceFullRender = true;
    if (previousFuel !== this.player.resources.fuel)
      eventManager.publish(GameEvents.PLAYER_FUEL_CHANGED, {
        newFuel: this.player.resources.fuel,
        amountChanged: this.player.resources.fuel - previousFuel,
      });
  }

  /** Commits one nearby installation and its escrow payment through the same durable save boundary. */
  deployHaulInstallation(): { readonly ok: boolean; readonly message: string } {
    const system = this.stateManager.currentSystem;
    if (!system) return { ok: false, message: 'Deployment requires the contracted destination system.' };
    const missionId = this.heavyHaulService.createSnapshot().activeTow?.missionId;
    const result = commitHaulChange(
      prepareHaulCommissioning(this.createSaveGame(), system),
      this.journeyCheckpointWriter,
      (save) => this.applyHaulChange(save)
    );
    if (result.ok && missionId) {
      // Replace the retired deployment marker with the delivered station for the next docking action.
      const depot = system.stations.find((station) => station.id === `haul-installation:${missionId}`);
      if (depot) this.selectNavigationTarget(depot, false);
    }
    this.statusMessage = result.message;
    this._publishStatusUpdate();
    return result;
  }

  /** Applies a validated haul checkpoint without repeating payment, refuelling or world generation. */
  private applyHaulChange(save: GameSave): void {
    const credits = this.player.resources.credits;
    const fuel = this.player.resources.fuel;
    this.missionProgress.restoreSnapshot(save);
    this.heavyHaulService.restoreSnapshot(save.heavyHaul, save.gameClockElapsedSeconds);
    this.infrastructureRegistry.restore(save.infrastructure, save.observatory?.destination);
    this.player.resources = cloneSaveValue(save.player.resources);
    if (this._observatoryService || save.observatory?.destination)
      this.observatoryService.snapshot.destination = cloneSaveValue(save.observatory?.destination ?? null);
    const system = this.stateManager.currentSystem;
    if (system) {
      this.infrastructureRegistry.materialize(system, this.bulkAdvanceSeconds ?? 0);
      this.prepareSystemDepots(system);
      this.refreshHaulSites(system);
      this.stateManager.reconcileDockedStation();
    }
    this._observatoryService?.invalidateInfrastructure();
    this.hyperspaceSurveyService.clearCache();
    this.renderer.invalidateWorldScene();
    this.travelMode.approachTargetSignature = null;
    this.terminalOverlay.clear();
    this.astrometricOverlay.clear();
    this.inputManager.clearState();
    this.lastMainRenderSignature = '';
    this.forceFullRender = true;
    if (credits !== this.player.resources.credits)
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: this.player.resources.credits - credits,
      });
    if (fuel !== this.player.resources.fuel)
      eventManager.publish(GameEvents.PLAYER_FUEL_CHANGED, {
        newFuel: this.player.resources.fuel,
        amountChanged: this.player.resources.fuel - fuel,
      });
  }

  /** Returns the paused instrument controller, including lightweight non-canvas harnesses. */
  private get observatoryController(): ObservatoryController {
    return (this._observatoryController ??= new ObservatoryController());
  }

  /** Returns the campaign's independent biology state, also in prototype-based test harnesses. */
  private get xenobiology(): XenobiologyService {
    return (this._xenobiology ??= new XenobiologyService());
  }

  /** Returns the focused local interaction controller. */
  private get encounterController(): SurfaceEncounterController {
    return (this._encounterController ??= new SurfaceEncounterController());
  }

  /** Resolves an active field only while its planetary rover is deployed. */
  private get activeEncounter(): EncounterField | undefined {
    if (this.stateManager.state !== 'planet' || !this.player.terrainVehicle.deployed) return;
    const id = this.xenobiology.snapshot.activeSiteId;
    return id ? this.xenobiology.snapshot.fields[id] : undefined;
  }

  /** Caches biosphere definitions without preventing terrain-ready sites from appearing later. */
  private getBiosphere(planet = this.stateManager.currentPlanet): BiosphereDefinition | null {
    const system = this.stateManager.currentSystem;
    if (!planet || typeof planet.mapSeed !== 'string' || !system || !Array.isArray(system.planets))
      return null;
    const path = findSystemPlanetPath(system, planet);
    if (!path) return null;
    const cache = (this.biosphereCache ??= new WeakMap());
    const ready = planet.isSurfaceReady();
    const prior = cache.get(planet);
    if (prior && prior.ready === ready) return prior.biosphere;
    const generated = prepareBiosphere(planet, system, path);
    const bodyIdentity = `${system.starX},${system.starY},${system.systemSlot}/${path}`;
    const savedFields = Object.values(this.xenobiology.snapshot.fields).filter(
      (field) => field.bodyId.replace(/\/bio\d+$/, '') === bodyIdentity
    );
    const savedSites = savedFields.map((field) => field.site);
    // A visited habitat is evidence, not a fresh generation roll after a biology content update.
    const legacyVisitedWorld =
      savedFields.length && !savedFields.some((field) => field.bodyId === generated?.id);
    const source: BiosphereDefinition | null =
      (!legacyVisitedWorld ? generated : null) ??
      (savedFields.length
        ? {
            id: savedFields[0].bodyId,
            bodyName: planet.name,
            origin: savedFields[0].species[0]?.origin ?? 'native',
            species: [
              ...new Map(
                savedFields.flatMap((field) => field.species).map((species) => [species.id, species])
              ).values(),
            ],
            sites: [],
          }
        : null);
    const recordedSites: BiologySite[] = [];
    // Keep accepted destinations accessible when a content update chooses a different six-site sample.
    for (const mission of this.missionProgress.getActiveMissions()) {
      if (
        mission.systemName !== system.name ||
        (mission.systemAddress && !isMissionSystem(mission.systemAddress, system))
      )
        continue;
      for (const objective of mission.objectives) {
        const location = objective.location;
        if (location?.bodyPath !== path || !location.surface) continue;
        recordedSites.push({
          id: location.surface.siteId,
          x: location.surface.x,
          y: location.surface.y,
          label: location.surface.label,
        });
      }
    }
    const biosphere = source
      ? {
          ...source,
          sites: [
            ...new Map(
              [...source.sites, ...recordedSites, ...savedSites].map((site) => [`${site.x},${site.y}`, site])
            ).values(),
          ],
        }
      : null;
    cache.set(planet, { ready, biosphere });
    return biosphere;
  }

  /** Enters a persistent five-metre field from the regional habitat's actual surface coordinate. */
  private enterBiologySite(): void {
    if (
      this.stateManager.state !== 'planet' ||
      !this.player.terrainVehicle.available ||
      !this.player.terrainVehicle.deployed ||
      this.player.terrainVehicle.onFoot
    ) {
      this.statusMessage = 'Deploy the terrain vehicle before investigating a habitat.';
      return;
    }
    const biosphere = this.getBiosphere();
    const planet = this.stateManager.currentPlanet;
    if (!biosphere || !planet) {
      this.statusMessage = 'No accessible biological signatures detected.';
      return;
    }
    const size = getPlanetMapSize(planet);
    const sites = [...biosphere.sites].sort(
      (a, b) =>
        Math.hypot(
          surfaceLongitudeDelta(this.player.position.surfaceX, a.x, size),
          a.y - this.player.position.surfaceY
        ) -
        Math.hypot(
          surfaceLongitudeDelta(this.player.position.surfaceX, b.x, size),
          b.y - this.player.position.surfaceY
        )
    );
    const site = sites[0];
    if (!site) {
      this.statusMessage = 'Biological signatures present; accessible surface habitats unresolved.';
      return;
    }
    if (
      Math.abs(surfaceLongitudeDelta(this.player.position.surfaceX, site.x, size)) > 1 ||
      Math.abs(site.y - this.player.position.surfaceY) > 1
    ) {
      this.statusMessage = `${site.label}: X${site.x} Y${site.y}. Approach within one regional cell; orbital dossier lists habitats.`;
      this.addSurfaceNotification(this.statusMessage);
      return;
    }
    if ((this.player.terrainVehicle.integrity ?? 100) < 30) {
      this.statusMessage = 'Rover integrity below 30%. Repair at the ship or a port before field operations.';
      return;
    }
    const fields = this.xenobiology.snapshot.fields;
    const field = (fields[site.id] ??= createEncounter(biosphere, site));
    this.missionProgress.resolveBiologicalReferences(fields);
    field.roverX = 16;
    field.roverY = 21;
    this.xenobiology.snapshot.activeSiteId = site.id;
    this.encounterController.reset();
    this.player.terrainVehicle.moving = false;
    this.surfaceMode.closeTransientInterfaces();
    this.interfaceMode.close();
    this.statusMessage = 'Biological field online. Observe contacts before selecting specimens.';
    this.forceFullRender = true;
  }

  /** Applies one local intent; reading, selection and rejected operations do not advance time. */
  private handleEncounterInput(): boolean {
    const field = this.activeEncounter;
    if (!field) return false;
    if (this.encounterController.reveal.isActive && this.inputManager.wasAnyKeyJustPressed()) {
      this.encounterController.reveal.complete();
      this.forceFullRender = true;
      return true;
    }
    if (
      this.inputManager.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF') &&
      ['drive', 'menu'].includes(this.encounterController.interaction.kind)
    ) {
      this.launchFromParkedShip();
      return true;
    }
    const intent = this.encounterController.input(this.inputManager.justPressedActions, field);
    if (this.encounterController.interaction.kind !== 'drive') this.interfaceMode.open('xenobiology');
    else this.interfaceMode.close('xenobiology');
    if (intent?.kind === 'cargo') this.openRoverCargo();
    else if (intent?.kind === 'operations') this.openShipMenu();
    else if (intent?.kind === 'missions') this.openMissionJournal();
    else if (intent?.kind === 'science') this.openScienceLog();
    else if (intent?.kind === 'leave') {
      if (Math.hypot(field.roverX - 16, field.roverY - 21) > 1.5 && this.player.terrainVehicle.fuel >= 0.02)
        this.statusMessage = 'Return to entry X16 Y21 to withdraw.';
      else {
        this.xenobiology.snapshot.activeSiteId = null;
        this.encounterController.reset();
        this.statusMessage = 'Field expedition ended. Cargo and research records retained.';
      }
    } else if (intent?.kind === 'command') {
      this.applyEncounterCommand(field, intent.command);
    }
    if (intent || this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Commits a field operation consistently whether requested by a hotkey, action menu or cargo pickup. */
  private applyEncounterCommand(field: EncounterField, command: EncounterCommand): void {
    const rover = this.player.terrainVehicle;
    if (command.kind === 'move' && rover.fuel < 0.02)
      this.statusMessage = 'Local fuel reserve exhausted; select Leave for emergency withdrawal.';
    else if (
      command.kind === 'harvest' &&
      (this.xenobiology.evidence(
        field.individuals.find((actor) => actor.id === command.targetId)?.speciesId ?? ''
      )?.level ?? 0) < 3
    )
      this.statusMessage = 'Analyse the organism to verify viable reproductive structures first.';
    else {
      const result = (this._encounterSystem ??= new SurfaceEncounterSystem()).act(
        field,
        command,
        rover.cargoHold,
        this.player.ship.stasisClass ?? 1
      );
      this.statusMessage = result.message;
      if (result.elapsedSeconds > 0) {
        this.gameClockElapsedSeconds += result.elapsedSeconds;
        if (command.kind === 'move') rover.fuel = Math.max(0, rover.fuel - 0.02);
        rover.integrity = Math.max(0, (rover.integrity ?? 100) - result.damage);
        if (result.evidence || result.behaviourWitnesses?.length) {
          const system = this.stateManager.currentSystem;
          const body = this.stateManager.currentPlanet;
          const path = system && body ? findSystemPlanetPath(system, body) : null;
          const origin: BiologyOrigin | undefined =
            system && body && path
              ? {
                  systemName: system.name,
                  worldX: system.starX,
                  worldY: system.starY,
                  systemSlot: system.systemSlot,
                  bodyPath: path,
                  bodyName: body.name,
                  surface: {
                    x: field.site.x,
                    y: field.site.y,
                    siteId: field.site.id,
                    label: field.site.label,
                  },
                }
              : undefined;
          if (result.evidence) {
            this.xenobiology.observe(result.evidence.species, result.evidence.level, origin);
            this.missionProgress.recordBiologicalEvidence(
              result.evidence.species.id,
              field.site.id,
              result.evidence.level
            );
            if (result.evidence.collected) this.xenobiology.collected(result.evidence.species);
          }
          const recorded = new Set<string>();
          for (const witness of result.behaviourWitnesses ?? []) {
            if (this.xenobiology.recordBehaviour(witness, origin))
              recorded.add(BEHAVIOUR_OBSERVATION_LABELS[witness.observation.kind]);
            if (this.xenobiology.hasBehaviour(witness.species.id, field.site.id, witness.observation.kind))
              this.missionProgress.recordBehaviourEvidence(
                witness.species.id,
                field.site.id,
                witness.observation.kind
              );
          }
          if (recorded.size) this.statusMessage += ` Field record: ${[...recorded].join(' / ')}.`;
        }
        if (result.evidence?.collected && 'targetId' in command) {
          const container = rover.cargoHold.specimens?.find(
            (item) =>
              item.sourceId === command.targetId &&
              (command.kind === 'harvest'
                ? item.kind === 'propagule'
                : command.kind === 'sample'
                  ? item.kind === 'tissue'
                  : item.kind === 'live' || item.kind === 'dead')
          );
          if (container) this.statusMessage += ` ${this.getSpecimenContractMessage(container)}`;
        }
        if (rover.integrity === 0) {
          rover.integrity = 15;
          this.xenobiology.snapshot.activeSiteId = null;
          this.encounterController.reset();
          this.interfaceMode.close('xenobiology');
          this.statusMessage += ' Emergency retreat to regional entry. Repair required; cargo retained.';
        }
      }
    }
    this.forceFullRender = true;
  }

  /** Prepares the close terrain view and actual vehicle, crew and hold telemetry. */
  private createCurrentEncounterView(field: EncounterField) {
    const rover = this.player.terrainVehicle;
    return createEncounterView(field, this.encounterController.target(field)?.id ?? null, this.xenobiology, {
      power: this.encounterController.power,
      stasisClass: this.player.ship.stasisClass ?? 1,
      integrity: rover.integrity ?? 100,
      cargo: {
        usedM3: this.cargoSystem.getTotalUnits(rover.cargoHold),
        capacityM3: rover.cargoHold.capacity,
      },
      fuel: rover.fuel,
      maxFuel: rover.maxFuel,
      crew: this.player.crew,
      surface: prepareEncounterSurface(field, this.stateManager.currentPlanet ?? undefined),
      bodyName: this.stateManager.currentPlanet?.name,
      menuActive: this.encounterController.interaction.kind === 'menu',
      message: this.statusMessage,
      requests: this.getEncounterRequestLines(field),
      missionRequests: this.getBiologicalFieldRequests(),
    });
  }

  /** Reads all physical specimens, including overflow retained in a stowed rover. */
  private get ownedSpecimens(): SpecimenContainer[] {
    return [
      ...(this.player.cargoHold.specimens ?? []),
      ...(this.player.terrainVehicle.cargoHold.specimens ?? []),
    ];
  }

  /** Reports whether a newly sealed or inspected container actually fulfils an accepted delivery request. */
  private getSpecimenContractMessage(container: SpecimenContainer): string {
    const missions = this.missionProgress.getActiveMissions();
    const matching = missions.find((mission) =>
      mission.objectives.some(
        (objective) => objective.kind === 'specimen' && matchesSpecimenObjective(objective, container)
      )
    );
    if (matching) {
      if (this.missionProgress.getStatus(matching, this.ownedSpecimens) === 'READY')
        return `CONTRACT CLAIMABLE: ${matching.title}. Claim ${matching.rewardCredits} Cr + research at ${matching.originStarbaseName} through Missions or Research.`;
      const counts = this.missionProgress.getObjectiveCounts(matching, this.ownedSpecimens);
      return `Contract contribution aboard: ${matching.title} (${counts.completed}/${counts.total}). J lists remaining objectives.`;
    }
    for (const mission of missions) {
      const related = mission.objectives.filter(
        (item) => item.kind === 'specimen' && item.speciesId === container.species.id
      );
      if (!related.length) continue;
      const shortfalls = this.missionProgress.getObjectiveShortfalls(mission, this.ownedSpecimens);
      const objective = related.find((item) => shortfalls[item.id]);
      if (objective) return `Contract not ready: ${shortfalls[objective.id]}`;
    }
    return 'No outstanding specimen contract matches this container; ordinary research value only.';
  }

  /** Projects only accepted requests matching the selected contact's actual habitat. */
  private getEncounterRequestLines(field: EncounterField): string[] {
    const target = this.encounterController.target(field);
    if (!target || (this.xenobiology.evidence(target.speciesId)?.level ?? 0) < 2) return [];
    return this.missionProgress
      .getSpecimenRequests(target.speciesId, field.site.id)
      .map(
        (mission) =>
          `${biologicalRequirement(mission)} / ${mission.rewardCredits} Cr + research / return to ${mission.originStarbaseName}`
      );
  }

  /** Supplies accepted contract status so field guidance stops requesting material already aboard. */
  private getBiologicalFieldRequests(): BiologicalFieldRequest[] {
    const specimens = this.ownedSpecimens;
    return this.missionProgress
      .getActiveMissions()
      .filter((mission) => mission.type === 'xenobiology')
      .map((mission) => ({
        mission,
        status: this.missionProgress.getStatus(mission, specimens),
        completedObjectiveIds: this.missionProgress.getCompletedObjectiveIds(mission, specimens),
      }));
  }

  /** Reconciles ship or rover specimen ownership before committing shared demand and payment. */
  private submitBiologicalResearch(id: string, starbase: Starbase): void {
    if (id === 'science-log') {
      this.openScienceLog();
      return;
    }
    if (starbase.kind === 'automated-depot') {
      this.starbaseMode.alert = 'No scientific receiving staff at this depot.';
      return;
    }
    const holds = [this.player.cargoHold, this.player.terrainVehicle.cargoHold];
    const container = id.startsWith('sample:')
      ? holds.flatMap((hold) => hold.specimens ?? []).find((item) => `sample:${item.id}` === id)
      : undefined;
    const species =
      container?.species ??
      (id.startsWith('data:') ? this.xenobiology.evidence(id.slice(5))?.species : undefined);
    if (!species || (id.startsWith('sample:') && !container)) {
      this.starbaseMode.alert = 'Research contribution no longer aboard.';
      return;
    }
    const credits = this.xenobiology.submit(species, container);
    if (credits <= 0) {
      this.starbaseMode.alert = 'No additional scientific demand for this contribution.';
      return;
    }
    if (container)
      for (const hold of holds)
        hold.specimens = (hold.specimens ?? []).filter((item) => item.id !== container.id);
    this.player.resources.credits += credits;
    this.statusMessage = this.starbaseMode.alert = `Research accepted: ${species.name}. Award ${credits} Cr.`;
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: credits,
    });
  }

  /** Restores rover armour with an explicit affordable field/port service. */
  private repairRover(): void {
    if (
      this.stateManager.state === 'starbase' &&
      this.stateManager.currentStarbase?.kind === 'automated-depot'
    ) {
      this.openDepotServiceConsole('repair', 'rover');
      return;
    }
    const cost = Math.ceil(
      (100 - (this.player.terrainVehicle.integrity ?? 100)) * ROVER_REPAIR_COST_PER_POINT
    );
    if (this.player.resources.credits < cost) {
      this.statusMessage = `Rover repair requires ${cost} Cr.`;
      return;
    }
    this.player.resources.credits -= cost;
    this.player.terrainVehicle.integrity = 100;
    this.statusMessage = `Rover integrity restored. Cost ${cost} Cr.`;
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: -cost,
    });
  }

  /** Returns mission progression, including for lightweight prototype-based test harnesses. */
  private get missionProgress(): MissionProgressService {
    this._missionProgress ??= new MissionProgressService(() => this.player.cargoHold.items);
    return this._missionProgress;
  }

  /** Returns the transient mission reader without storing menu state in world saves. */
  private get missionJournal(): MissionJournal {
    return (this._missionJournal ??= new MissionJournal());
  }

  /** Returns the serialized predictive surface-generation queue. */
  private get surfacePrefetch(): SurfacePrefetchService {
    this._surfacePrefetch ??= new SurfacePrefetchService();
    return this._surfacePrefetch;
  }

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
  private currentStateUpdateStatus: string = '';
  private lastNotificationSource: string = '';
  private notificationExpiresAt: number = 0;
  private currentVisualDeltaSeconds = 0;
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

  /** Returns the diagnostic terminal without mixing its state with Shipyard tab selection. */
  private get shipRepairConsole(): ShipRepairConsole {
    return (this._shipRepairConsole ??= new ShipRepairConsole());
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

  /** Returns the persistent pan and zoom state for the modal Galaxy instrument. */
  private get galaxyMap(): GalaxyMapController {
    return (this._galaxyMap ??= new GalaxyMapController());
  }

  /** Returns whether the top-down Galaxy instrument currently owns keyboard input. */
  private get galaxyMapOpen(): boolean {
    return this.interfaceMode.is('galaxy-map');
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
    this._scanService = new ScanService();
    this._missionProgress = new MissionProgressService(() => this.player.cargoHold.items);
    this._surfacePrefetch = new SurfacePrefetchService();
    this.renderer = new RendererFacade(
      canvasId,
      statusBarId,
      this.systemDataGenerator,
      this.hyperspaceSurveyService
    );
    this.player = new Player(CONFIG.PLAYER_START_X, CONFIG.PLAYER_START_Y, CONFIG.PLAYER_CHAR, initialSeed);
    this.inputManager = new InputManager();
    this.stateManager = new GameStateManager(this.player, this.gameSeedPRNG, this.systemDataGenerator);
    this.stateManager.setTowPolicy(() => this._heavyHaulService?.attachedTowPolicy ?? null);
    this.stateManager.setLandingTargetProvider(() => {
      const selected = this.getSelectedTarget();
      return selected instanceof Planet || selected instanceof Starbase ? selected : null;
    });
    this.stateManager.setSystemInitializer((system) => this.prepareMaterializedSystem(system));
    this.actionProcessor = new ActionProcessor(this.player, this.stateManager);
    this.terminalOverlay = new TerminalOverlay(); // Initialize terminal overlay
    this.astrometricOverlay = new AstrometricOverlay(this.systemDataGenerator, this.hyperspaceSurveyService);

    // Instantiate systems
    this.movementSystem = new MovementSystem(
      this.player,
      () => this._heavyHaulService?.attachedTowPolicy?.wetMassKg ?? 0,
      () => this.stateManager.state
    );
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
      generationVersion: CONFIG.GALAXY_MODEL_VERSION,
      savedAt: new Date().toISOString(),
      seed: this.gameSeedPRNG.getInitialSeed(),
      gameClockElapsedSeconds: this.gameClockElapsedSeconds,
      bulkAdvanceSeconds: this.bulkAdvanceSeconds ?? 0,
      heavyHaul: this._heavyHaulService?.createSnapshot() ?? createHeavyHaulSnapshot(),
      infrastructure: this.infrastructureRegistry.createSnapshot(),
      player: cloneSaveValue({
        position: this.player.position,
        render: this.player.render,
        resources: this.player.resources,
        cargoHold: this.player.cargoHold,
        terrainVehicle: this.player.terrainVehicle,
        crew: this.player.crew,
        ship: this.player.ship,
      }),
      location: this.createLocationSaveData(),
      systemOrbit: system ? captureSystemOrbit(system) : null,
      systemOrbitHistory: cloneSaveValue([...this.orbitalHistory.values()]),
      planetMutations,
      ...this.missionProgress.createSnapshot(),
      catalogueDiscoveries: this.scanService.createSnapshot(),
      observatory: this._observatoryService?.createSnapshot() ?? createObservatorySnapshot(),
      economy: this.starbaseCommerce.createSnapshot(),
      depots: this._depotService?.createSnapshot() ?? {},
      surveyData: this._surveyData?.createSnapshot() ?? createSurveyDataSnapshot(),
      xenobiology: this.xenobiology.createSnapshot(),
      tutorialHintsShown: [...this.tutorialHintsShown],
    };
  }

  /** Restores validated persistent progress into this freshly constructed game instance. */
  restoreSaveGame(save: GameSave): void {
    if (save.seed !== this.gameSeedPRNG.getInitialSeed()) {
      throw new Error('Save seed does not match the constructed game universe.');
    }
    this._terminalDialog?.close();
    this._screenTransition?.reset();
    this.sleepingHaulCrew = 0;
    this.pendingHomeboundArrival = null;

    const isLegacyGalaxyMigration =
      save.migratedFromGenerationVersion !== undefined &&
      save.migratedFromGenerationVersion < CONFIG.GALAXY_MODEL_VERSION;
    // Restore stock/epochs before resolving a docked depot; otherwise materialisation seeds over the save.
    this.gameClockElapsedSeconds = Math.max(0, save.gameClockElapsedSeconds);
    this.starbaseCommerce.restoreSnapshot(isLegacyGalaxyMigration ? {} : save.economy);
    this.depotService.restoreSnapshot(isLegacyGalaxyMigration ? {} : save.depots);
    this.surveyData.restoreSnapshot(isLegacyGalaxyMigration ? createSurveyDataSnapshot() : save.surveyData);
    // Board refresh must see restored accepted jobs before station materialisation allocates new offer slots.
    this.missionProgress.restoreSnapshot({
      acceptedMissionIds: isLegacyGalaxyMigration ? [] : save.acceptedMissionIds,
      readyMissionIds: isLegacyGalaxyMigration ? [] : save.readyMissionIds,
      completedMissionIds: save.completedMissionIds,
      activeMissions: isLegacyGalaxyMigration ? {} : save.activeMissions,
      missionObjectiveProgress: isLegacyGalaxyMigration ? {} : save.missionObjectiveProgress,
    });
    // Restore deployment identities before a docked location tries to resolve its station.
    this.infrastructureRegistry.restore(
      isLegacyGalaxyMigration ? [] : save.infrastructure,
      isLegacyGalaxyMigration ? null : save.observatory?.destination
    );
    this.bulkAdvanceSeconds = isLegacyGalaxyMigration ? 0 : save.bulkAdvanceSeconds;
    this.systemOrbitRegistry = new Map(
      (isLegacyGalaxyMigration ? [] : save.systemOrbitHistory).map((entry) => [
        systemAddressKey(entry),
        cloneSaveValue(entry),
      ])
    );
    if (!isLegacyGalaxyMigration && save.location.kind !== 'hyperspace' && save.systemOrbit)
      this.orbitalHistory.set(systemAddressKey(save.location), {
        worldX: save.location.worldX,
        worldY: save.location.worldY,
        systemSlot: save.location.systemSlot,
        orbit: cloneSaveValue(save.systemOrbit),
      });
    this.materializedOrbitalSystem = null;
    this.planetMutationRegistry = isLegacyGalaxyMigration
      ? new Map()
      : new Map(
          save.planetMutations.map((mutation) => [getPlanetMutationKey(mutation), cloneSaveValue(mutation)])
        );
    let wasRelocatedFromLegacySystem = false;
    let system: SolarSystem | null;
    try {
      if (isLegacyGalaxyMigration && save.location.kind !== 'hyperspace') {
        // Generated local identities are not comparable across Galaxy model versions, even when
        // the new model happens to place another object at the same coordinate and body path.
        system = this.stateManager.restoreLocation({
          kind: 'hyperspace',
          worldX: save.location.worldX,
          worldY: save.location.worldY,
          systemSlot: 0,
        });
        wasRelocatedFromLegacySystem = true;
      } else {
        system = this.stateManager.restoreLocation(save.location);
      }
    } catch (error) {
      if (!isLegacyGalaxyMigration) throw error;
      logger.warn(
        `[Game] Legacy local location could not be mapped into Galaxy v${CONFIG.GALAXY_MODEL_VERSION}: ${error}`
      );
      // Version-one coordinates may no longer contain the same system. Preserve portable vessel
      // progress and place it safely in hyperspace rather than rejecting the save outright.
      system = this.stateManager.restoreLocation({
        kind: 'hyperspace',
        worldX: save.location.worldX,
        worldY: save.location.worldY,
        systemSlot: 0,
      });
      wasRelocatedFromLegacySystem = true;
    }
    if (system) {
      this.prepareMaterializedSystem(system);
    }

    this.player.position = cloneSaveValue(save.player.position);
    this.player.render = cloneSaveValue(save.player.render);
    this.player.resources = cloneSaveValue(save.player.resources);
    this.player.cargoHold = cloneSaveValue(save.player.cargoHold);
    this.player.terrainVehicle = cloneSaveValue(save.player.terrainVehicle);
    this.player.crew = cloneSaveValue(save.player.crew);
    this.player.ship = cloneSaveValue(save.player.ship);
    // Basic biological stasis is part of the standard survey bay, including earlier personal voyages.
    if (!(this.player.ship.stasisClass ?? 0)) this.player.ship.stasisClass = 1;
    this.xenobiology.restoreSnapshot(
      isLegacyGalaxyMigration ? createXenobiologySnapshot() : save.xenobiology
    );
    this.encounterController.reset();
    if (isLegacyGalaxyMigration) {
      this.player.cargoHold.specimens = [];
      this.player.terrainVehicle.cargoHold.specimens = [];
    }
    if (this.activeEncounter) this.interfaceMode.close();
    this.gameClockElapsedSeconds = Math.max(0, save.gameClockElapsedSeconds);
    this.heavyHaulService.restoreSnapshot(
      isLegacyGalaxyMigration ? createHeavyHaulSnapshot() : save.heavyHaul,
      this.gameClockElapsedSeconds
    );
    if (this.stateManager.currentSystem) this.refreshHaulSites(this.stateManager.currentSystem);
    this.missionProgress.resolveBiologicalReferences(this.xenobiology.snapshot.fields);
    this.scanService.restoreSnapshot(isLegacyGalaxyMigration ? {} : save.catalogueDiscoveries);
    this.observatoryService.restoreSnapshot(
      isLegacyGalaxyMigration
        ? createObservatorySnapshot()
        : (save.observatory ?? createObservatorySnapshot())
    );
    if (!isLegacyGalaxyMigration && save.infrastructure.length)
      this.observatoryService.invalidateInfrastructure();
    this.tutorialHintsShown = new Set(save.tutorialHintsShown);
    this.statusMessage = wasRelocatedFromLegacySystem
      ? 'Legacy voyage loaded. Galactic remapping placed the vessel safely in hyperspace and retired incompatible local records.'
      : isLegacyGalaxyMigration
        ? 'Legacy voyage loaded. Incompatible local surveys, markets, and active contracts were retired.'
        : `Loaded save from ${new Date(save.savedAt).toLocaleString()}.`;
    this.forceFullRender = true;
    this.lastMainRenderSignature = '';
    this._publishStatusUpdate();
  }

  /** Creates a location snapshot whose fields are constrained by the active mode. */
  private createLocationSaveData(): LocationSaveData {
    const base = {
      worldX: this.player.position.worldX,
      worldY: this.player.position.worldY,
      systemSlot: this.stateManager.currentSystem?.systemSlot ?? 0,
    };
    const location = this.stateManager.location;
    if (location.kind === 'hyperspace' || location.kind === 'system') {
      return { ...base, kind: location.kind };
    }
    if (location.kind === 'starbase') {
      return {
        ...base,
        kind: 'starbase',
        stationId: location.starbase.id,
        starbaseName: location.starbase.name,
      };
    }
    const bodyPath = findSystemPlanetPath(location.system, location.planet);
    const orbitReferencePath = findSystemPlanetPath(location.system, location.orbitReference);
    if (!bodyPath || !orbitReferencePath) {
      throw new Error(`Cannot save ${location.kind} state without stable planetary paths.`);
    }
    return { ...base, kind: location.kind, bodyPath, orbitReferencePath };
  }

  /** Captures mutable planet state from the active generated system into the persistent registry. */
  private captureCurrentPlanetMutations(system: SolarSystem | null = this.stateManager.currentSystem): void {
    if (!system) return;
    this.infrastructureRegistry.capture(system);
    for (const mutation of capturePlanetMutations(system)) {
      this.planetMutationRegistry.set(getPlanetMutationKey(mutation), mutation);
    }
    const address = systemAddress(system);
    this.orbitalHistory.set(systemAddressKey(address), { ...address, orbit: captureSystemOrbit(system) });
  }

  /** Applies history and missing bulk time once per materialised instance, not once per mode change. */
  private prepareMaterializedSystem(system: SolarSystem): void {
    if (this.materializedOrbitalSystem === system) return;
    const mutations = [...this.planetMutationRegistry.values()];
    restorePlanetProgress(system, mutations);
    restoreSystemOrbits(
      system,
      this.orbitalHistory.get(systemAddressKey(systemAddress(system)))?.orbit,
      mutations,
      this.bulkAdvanceSeconds ?? 0
    );
    this.infrastructureRegistry.materialize(system, this.bulkAdvanceSeconds ?? 0);
    this.prepareSystemDepots(system);
    if (this._heavyHaulService) this.refreshHaulSites(system);
    this.materializedOrbitalSystem = system;
  }

  /** Reconciles moving rendezvous sites against their saved phases, independently of natural generation. */
  private refreshHaulSites(system: SolarSystem): void {
    const tow = this._heavyHaulService?.createSnapshot().activeTow;
    materializeHaulSites(
      system,
      tow ? this.missionProgress.getMission(tow.missionId) : undefined,
      this.orbitalHistory.get(systemAddressKey(systemAddress(system)))?.orbit,
      this.bulkAdvanceSeconds ?? 0,
      tow?.stage
    );
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
    this._terminalDialog?.close();
    this.forceFullRender = true; // Always force redraw on state change
    this.orbitModeState.invalidateScreen();
    if (newState !== 'orbit') this.orbitModeState.dossier.close();
    this.lastHyperspaceUpdateSignature = '';
    this.lastHyperspaceUpdateStatus = '';
    logger.info(`[Game] State change event received: ${newState}. Forcing full render.`);
    if (this.materializedOrbitalSystem && this.materializedOrbitalSystem !== this.stateManager.currentSystem)
      this.captureCurrentPlanetMutations(this.materializedOrbitalSystem);
    if (!this.stateManager.currentSystem) this.materializedOrbitalSystem = null;
    if (this.stateManager.currentSystem) {
      this.prepareMaterializedSystem(this.stateManager.currentSystem);
      // Local manoeuvring advances the calendar on the same cached system instance; catch up before docking pauses it.
      if (newState === 'starbase') this.prepareSystemDepots(this.stateManager.currentSystem);
      if (newState === 'system') {
        const system = this.stateManager.currentSystem;
        this.scanService.resolveCatalogueTarget(
          `system:${system.starX},${system.starY}`,
          'classified',
          85,
          'passive'
        );
      }
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
        const resolution = this.scanService.resolvePlanet(planet, 'surveyed', 100, 'orbital-survey');
        this.completeMissionsForDiscovery(planet, resolution.current.level);
        const bodies = this.getOrbitBodies();
        const selectedIndex = bodies.indexOf(planet);
        this.orbitModeState.reset(selectedIndex >= 0 ? selectedIndex : 0, getPlanetMapSize(planet));
        this.prefetchInitialOrbitSurfaces();
      } else {
        this.orbitModeState.reset();
      }
    }
    if (newState !== 'planet') {
      this.xenobiology.snapshot.activeSiteId = null;
      this.encounterController.reset();
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
    if (this.screenTransition.isActive) {
      if (data.action === 'TRANSITION_SKIP' || data.action === 'ENTER_SYSTEM') this.screenTransition.skip();
      this.forceFullRender = true;
      return;
    }
    if (this.terminalDialog.isOpen) {
      const model = this.terminalDialog.createModel(this.renderer.getGridCols(), this.renderer.getGridRows());
      const result = this.terminalDialog.action(data.action, model);
      if (result) this.finishTerminalDialog(result);
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('haul-manifest')) {
      if (this.haulManifest.reveal.isActive) this.haulManifest.reveal.complete();
      else {
        this.inputManager.justPressedActions.add(data.action);
        this.handleHaulManifestInput();
        this.inputManager.justPressedActions.delete(data.action);
      }
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('observatory')) {
      if (this.observatoryController.reveal.isActive) this.observatoryController.reveal.complete();
      else {
        this.inputManager.justPressedActions.add(data.action);
        this.handleObservatoryInput();
        this.inputManager.justPressedActions.delete(data.action);
      }
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('ship-repairs')) {
      if (this.shipRepairConsole.reveal.isActive) this.shipRepairConsole.reveal.complete();
      else {
        this.inputManager.justPressedActions.add(data.action);
        this.handleShipRepairInput();
        this.inputManager.justPressedActions.delete(data.action);
      }
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('depot-service')) {
      if (this.depotConsole.reveal.isActive) this.depotConsole.reveal.complete();
      else {
        this.inputManager.justPressedActions.add(data.action);
        this.handleDepotServiceInput();
        this.inputManager.justPressedActions.delete(data.action);
      }
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('survey-exchange')) {
      this.inputManager.justPressedActions.add(data.action);
      this.handleFrontierTerminalInput();
      this.inputManager.justPressedActions.delete(data.action);
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('science-log')) {
      this.inputManager.justPressedActions.add(data.action);
      this.handleScienceLogInput();
      this.inputManager.justPressedActions.delete(data.action);
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('mission-journal')) {
      if (this.missionJournal.reveal.isActive) this.missionJournal.reveal.complete();
      else {
        this.inputManager.justPressedActions.add(data.action);
        this.handleMissionJournalInput();
        this.inputManager.justPressedActions.delete(data.action);
      }
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.shipMenuOpen) {
      this.inputManager.justPressedActions.add(data.action);
      this._handleShipMenuInput();
      this.inputManager.justPressedActions.delete(data.action);
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (this.activeEncounter) {
      this.inputManager.justPressedActions.add(data.action);
      if (this.jettisonConfirmation) this._handleJettisonConfirmationInput();
      else if (this.roverCargoOpen) this._handleRoverCargoInput();
      else if (this.interfaceMode.kind === 'none' || this.interfaceMode.kind === 'xenobiology')
        this.handleEncounterInput();
      this.inputManager.justPressedActions.delete(data.action);
      this.forceFullRender = true;
      this._publishStatusUpdate();
      return;
    }
    if (
      this.popupState !== 'inactive' ||
      (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen) ||
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
          `Bodies: <hl>${planetCount}</hl> | Facilities: <hl>${system.stations.map((station) => station.name).join(', ') || 'None detected'}</hl>`,
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
    this.observatorySearchSerial++;
    this.frontierSearchSerial++;
    this._observatoryService?.cancel();
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
    const rawDeltaTime = Math.max(0, (currentTime - this.lastUpdateTime) / 1000.0);
    const deltaTime = Math.min(0.1, rawDeltaTime);
    // Simulation remains capped after a pause, while visual rotation uses real
    // monotonic elapsed time so a slow machine cannot make planets rotate slowly.
    this.currentVisualDeltaSeconds = rawDeltaTime;
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

  /** Opens diagnostic work orders while retaining the current station Services or Shipyard selection. */
  private openShipRepairConsole(): void {
    const station = this.stateManager.currentStarbase;
    if (this.stateManager.state !== 'starbase' || !station) return;
    if (this.interfaceMode.kind !== 'none') return;
    if (station.kind === 'automated-depot') {
      this.openDepotServiceConsole('repair');
      return;
    }
    this.shipRepairConsole.open();
    this.interfaceMode.open('ship-repairs');
    this.statusMessage = 'Shipyard diagnostic link established.';
    this.forceFullRender = true;
  }

  /** Opens only a real docked robotic facility, preserving the Services tab as its parent. */
  private openDepotServiceConsole(kind: DepotServiceKind, selectedId?: string): void {
    const station = this.stateManager.currentStarbase;
    const system = this.stateManager.currentSystem;
    if (this.stateManager.state !== 'starbase' || station?.kind !== 'automated-depot' || !system) return;
    if (this.interfaceMode.kind !== 'none') return;
    if (kind === 'medical' && !station.capabilities.medical) return;
    this.prepareSystemDepots(system);
    this.starbaseMode.openSection('services');
    this.depotConsole.open(kind, selectedId);
    this.interfaceMode.open('depot-service');
    this.inputManager.clearState();
    this.terminalOverlay.clear();
    this.astrometricOverlay.clear();
    this.forceFullRender = true;
  }

  /** Opens the explicit scientific capability while retaining the current docked station as parent. */
  private openSurveyExchange(): void {
    const station = this.stateManager.currentStarbase;
    const system = this.stateManager.currentSystem;
    if (
      this.interfaceMode.kind !== 'none' ||
      this.stateManager.state !== 'starbase' ||
      !system ||
      !station?.capabilities.surveyExchange
    )
      return;
    this.prepareSystemDepots(system);
    this.frontierTerminal.open();
    this.interfaceMode.open('survey-exchange');
    this.inputManager.clearState();
    this.terminalOverlay.clear();
    this.astrometricOverlay.clear();
    this.forceFullRender = true;
    void this.refreshPublicCharts();
  }

  /** Acquires navigation descriptors only; the downloaded chart path never triggers a scientific scan. */
  private async refreshPublicCharts(): Promise<void> {
    const serial = ++this.frontierSearchSerial;
    this.frontierTerminal.coverage = 'Acquiring public navigation charts...';
    try {
      const contacts = await this.frontierCatalogue.search(
        this.player.position.worldX,
        this.player.position.worldY,
        40,
        () => serial === this.frontierSearchSerial && this.interfaceMode.is('survey-exchange')
      );
      if (!contacts || serial !== this.frontierSearchSerial) return;
      this.frontierTerminal.contacts = contacts.slice(0, 64);
      this.frontierTerminal.coverage = `${this.frontierTerminal.contacts.length} public contacts / 40 ly chart radius`;
    } catch (error) {
      if (serial !== this.frontierSearchSerial) return;
      this.frontierTerminal.coverage = 'Public chart link unavailable; R retries acquisition.';
      logger.warn('[Survey exchange] Catalogue acquisition failed.', error);
    }
    this.forceFullRender = true;
  }

  /** Prepares measured uploads or public charts from distinct provenance owners. */
  private getFrontierTerminalEntries(): FrontierTerminalEntry[] {
    return this.frontierTerminal.tab === 'charts'
      ? createPublicChartEntries(this.surveyData, this.frontierTerminal.contacts)
      : createSurveyUploadEntries(this.surveyData, this.stateManager.currentStarbase?.id ?? '');
  }

  /** Uses the established responsive terminal model and semantic fonts for scientific exchange. */
  private createFrontierTerminalModel(): TextModalTableModel {
    const station = this.stateManager.currentStarbase;
    const storage = this.surveyData.storageStatus();
    return this.frontierTerminal.createModel(
      'ASTROMETRIC EXCHANGE',
      [
        frontierLine(station?.name ?? '', 'cyan', true),
        frontierLine(
          this.frontierTerminal.tab === 'uploads' ? 'MEASURED EVIDENCE' : 'PUBLIC NAVIGATION CHARTS',
          'cyan',
          true
        ),
        frontierLine(
          `Scientific sponsor: ${this.surveyData.availableCredits(station?.id ?? '')} Cr remaining`,
          'amber'
        ),
        frontierLine('Research payments / navigation references / no physical cargo volume', 'muted'),
        ...(storage.evidence >= 4096
          ? [
              frontierLine(
                'Evidence cache full; upload pending records to free measured-data storage.',
                'amber'
              ),
            ]
          : []),
        ...(storage.receipts >= 16384
          ? [
              frontierLine(
                'Payment ledger full; new object payments unavailable. Existing receipts retained.',
                'amber'
              ),
            ]
          : []),
      ],
      this.getFrontierTerminalEntries(),
      this.renderer.getGridCols(),
      this.renderer.getGridRows()
    );
  }

  /** Keeps every key inside the terminal, including reveal skipping and navigation-only chart actions. */
  private handleFrontierTerminalInput(): boolean {
    if (!this.interfaceMode.is('survey-exchange')) return false;
    const station = this.stateManager.currentStarbase;
    if (!station?.capabilities.surveyExchange || this.stateManager.state !== 'starbase') {
      this.closeFrontierTerminal();
      return true;
    }
    const model = this.createFrontierTerminalModel();
    const entries = this.getFrontierTerminalEntries();
    const action = this.frontierTerminal.input(this.inputManager, entries, model.visibleRowCount);
    const selected = entries.find((entry) => entry.id === this.frontierTerminal.selectedId);
    if (action === 'close') this.closeFrontierTerminal();
    else if (action === 'tab') {
      this.frontierTerminal.tab = this.frontierTerminal.tab === 'uploads' ? 'charts' : 'uploads';
      this.frontierTerminal.selectedId = null;
      this.frontierTerminal.viewOffset = 0;
      this.frontierTerminal.notice = '';
    } else if (action === 'refresh') void this.refreshPublicCharts();
    else if (action === 'activate' && selected) {
      if (this.frontierTerminal.tab === 'uploads') {
        const quote = this.surveyData.quote(station.id, selected.id);
        if (quote) this.showTerminalDialog(createSurveyUploadDialog(quote, selected.title));
      } else {
        const downloaded = this.surveyData.download(
          parseSurveyAddress(selected.id),
          selected.title,
          this.gameClockElapsedSeconds,
          (surveyData) => {
            if (this.journeyCheckpointWriter)
              this.journeyCheckpointWriter({ ...this.createSaveGame(), surveyData });
          }
        );
        this.frontierTerminal.notice = downloaded
          ? 'Public chart filed / navigation reference only.'
          : 'Checkpoint failed. Chart was not filed.';
      }
    } else if (action === 'mark' && selected && this.frontierTerminal.tab === 'charts') {
      if (this.surveyData.listCharts().some((entry) => entry.key === selected.id)) {
        this.observatoryService.markSystemDestination(parseSurveyAddress(selected.id), selected.title);
        this.frontierTerminal.notice = `Destination marked: ${selected.title}.`;
      } else this.frontierTerminal.notice = 'Download this chart before marking its navigation reference.';
    }
    if (action || this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Cancels outstanding frontier work and consumes held keys before restoring the parent interface. */
  private closeFrontierTerminal(): void {
    this.frontierSearchSerial++;
    this.frontierTerminal.reveal.complete();
    if (this.frontierTerminal.returnTo === 'ship-menu') this.interfaceMode.open('ship-menu');
    else this.interfaceMode.close();
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Checkpoints evidence, scientific funds and account credits as one outcome before publishing payment. */
  private performSurveyUpload(quote: SurveyUploadQuote): void {
    const station = this.stateManager.currentStarbase;
    if (
      !this.interfaceMode.is('survey-exchange') ||
      !station?.capabilities.surveyExchange ||
      station.id !== quote.stationId
    )
      return;
    const result = this.surveyData.upload(quote, this.player, (outcome) => {
      if (!this.journeyCheckpointWriter) return;
      const save = this.createSaveGame();
      this.journeyCheckpointWriter({
        ...save,
        surveyData: outcome.surveyData,
        player: { ...save.player, resources: outcome.resources },
      });
    });
    this.frontierTerminal.notice = this.statusMessage = this.starbaseMode.alert = result.message;
    if (result.ok)
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: result.credits,
      });
    this.showTerminalDialog({
      title: result.ok ? 'SURVEY EVIDENCE FILED' : 'UPLOAD REFUSED',
      kind: 'message',
      lines: [frontierLine(result.message, result.ok ? 'green' : 'amber')],
    });
  }

  /** Prepares supply-aware work orders without asking presentation to decide how much can be repaired. */
  private createDepotServiceModel(): TextModalTableModel {
    const station = this.stateManager.currentStarbase!;
    const quotes = this.depotService.getQuotes(
      station.id,
      this.depotConsole.kind,
      this.depotConsole.useCargo
    );
    const keys =
      this.depotConsole.kind === 'fuel'
        ? ['HELIUM_3', 'DEUTERIUM_PELLETS']
        : this.depotConsole.kind === 'medical'
          ? ['MEDICAL_SUPPLIES']
          : ['TITANIUM_TRUSS', 'REPAIR_SPARES'];
    return this.depotConsole.createModel(
      station.name,
      quotes,
      keys.map((key) => ({
        name: getTradeItemInfo(key)?.name ?? key,
        units: this.starbaseCommerce.getStock(station.id, key),
      })),
      this.player.resources.credits,
      this.renderer.getGridCols(),
      this.renderer.getGridRows(),
      this.player.crew.map((member) => ({
        name: member.name,
        hitPoints: member.hitPoints,
        maxHitPoints: member.maxHitPoints,
      }))
    );
  }

  /** Consumes all robotic terminal input; reviewing work always goes through an explicit confirmation. */
  private handleDepotServiceInput(): boolean {
    if (!this.interfaceMode.is('depot-service')) return false;
    const station = this.stateManager.currentStarbase;
    if (this.stateManager.state !== 'starbase' || station?.kind !== 'automated-depot') {
      this.interfaceMode.close('depot-service');
      this.depotConsole.reveal.complete();
      this.forceFullRender = true;
      return true;
    }
    const model = this.createDepotServiceModel();
    const intent = this.depotConsole.input(
      this.inputManager,
      this.depotService.getQuotes(station.id, this.depotConsole.kind, this.depotConsole.useCargo),
      model.visibleRowCount
    );
    if (intent?.kind === 'close') {
      this.interfaceMode.close('depot-service');
      this.depotConsole.reveal.complete();
      this.inputManager.clearState();
      this.statusMessage = this.starbaseMode.alert = this.depotConsole.notice || 'Returned to Services.';
    } else if (intent?.kind === 'review') this.showTerminalDialog(createDepotServiceDialog(intent.quote));
    if (intent || this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Persists a prospective work order before applying it, then publishes only its successful resource effects. */
  private performDepotService(quote: DepotServiceQuote): void {
    const station = this.stateManager.currentStarbase;
    if (
      this.stateManager.state !== 'starbase' ||
      station?.kind !== 'automated-depot' ||
      station.id !== quote.stationId
    )
      return;
    const result = this.depotService.purchase(quote, (outcome) => {
      if (!this.journeyCheckpointWriter) return;
      const save = this.createSaveGame();
      this.journeyCheckpointWriter({
        ...save,
        player: { ...save.player, ...outcome.player },
        economy: outcome.economy,
        depots: outcome.depots,
      });
    });
    this.depotConsole.notice = this.statusMessage = this.starbaseMode.alert = result.message;
    this.depotConsole.noticeTone = result.ok ? 'green' : 'red';
    this.publishCommerceEffects(result.effects);
    for (const [elementKey, amountRemoved] of Object.entries(result.cargoConsumed))
      eventManager.publish(GameEvents.PLAYER_CARGO_REMOVED, { elementKey, amountRemoved });
    this.showTerminalDialog({
      title: result.ok ? 'ROBOTIC SERVICE COMPLETE' : 'WORK ORDER REFUSED',
      kind: 'message',
      caution: !result.ok,
      lines: [{ segments: [{ text: result.message, font: 'thin', tone: result.ok ? 'green' : 'red' }] }],
    });
  }

  /** Builds work orders from live ship damage rather than retaining potentially stale prices. */
  private createShipRepairModel(): TextModalTableModel {
    const station = this.stateManager.currentStarbase!;
    return this.shipRepairConsole.createModel(
      this.player,
      station.name,
      getStarbaseShipyardProfile(this.getStationPersistenceKey(station)),
      this.renderer.getGridCols(),
      this.renderer.getGridRows(),
      station.capabilities.repairs === 'basic',
      this.starbaseMode.getSectionLabel()
    );
  }

  /** Gives repair controls exclusive input and commits only affordable, requoted work orders. */
  private handleShipRepairInput(): boolean {
    if (!this.interfaceMode.is('ship-repairs')) return false;
    const station = this.stateManager.currentStarbase;
    if (this.stateManager.state !== 'starbase' || !station) {
      this.interfaceMode.close('ship-repairs');
      this.forceFullRender = true;
      return true;
    }
    const model = this.createShipRepairModel();
    const intent = this.shipRepairConsole.input(
      this.inputManager,
      createRepairQuotes(this.player, station.capabilities.repairs === 'basic'),
      model.visibleRowCount
    );
    if (intent?.kind === 'close') {
      this.interfaceMode.close('ship-repairs');
      this.shipRepairConsole.reveal.complete();
      this.inputManager.clearState();
      this.statusMessage =
        this.shipRepairConsole.notice || `Returned to ${this.starbaseMode.getSectionLabel()}.`;
      this.starbaseMode.alert = this.statusMessage;
    } else if (intent?.kind === 'repair') {
      const result = purchaseRepairs(this.player, intent.target, station.capabilities.repairs === 'basic');
      this.shipRepairConsole.notice = this.statusMessage = result.message;
      this.shipRepairConsole.noticeTone = result.ok ? 'green' : 'red';
      if (result.ok) {
        this.shipRepairConsole.selectedTarget = 'all';
        this.shipRepairConsole.viewOffset = 0;
        eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
          newCredits: this.player.resources.credits,
          amountChanged: -result.cost,
        });
      }
    }
    if (intent || this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
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

    if (
      starbase.kind === 'automated-depot' &&
      this.starbaseMode.sectionId === 'missions' &&
      this.inputManager.wasActionJustPressed('BIOLOGY_COLLECT')
    ) {
      this.reviewDepotCancellation(rows[selectedIndex]?.id);
      return true;
    }

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
      this.starbaseMode.switchSection(-1, starbase);
      this.forceFullRender = true;
      return true;
    }

    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.starbaseMode.switchSection(1, starbase);
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

  /** Routes orbital interaction through its controller and publishes location effects. */
  private _handleOrbitInput(): boolean {
    const parentPlanet = this.stateManager.currentOrbitReferencePlanet;
    if (this.stateManager.state !== 'orbit' || !this.stateManager.currentPlanet || !parentPlanet)
      return false;
    return this.orbitModeState.handleInput(this.inputManager, {
      parentPlanet,
      stars: this.stateManager.currentSystem?.stars ?? [],
      viewportCols: this.renderer.getGridCols(),
      viewportRows: this.renderer.getGridRows(),
      isActive: () =>
        this.stateManager.state === 'orbit' && this.stateManager.currentOrbitReferencePlanet === parentPlanet,
      survey: (body) => {
        const resolution = this.scanService.resolvePlanet(body, 'surveyed', 100, 'orbital-survey');
        this.completeMissionsForDiscovery(body, resolution.current.level);
      },
      prefetch: (bodies) => this.enqueueSurfacePrefetch(bodies),
      leave: () => {
        this.stateManager.leaveOrbit();
        this.publishOrbitLocationStatus();
      },
      land: (body, x, y) => {
        this.stateManager.landFromOrbit(body, x, y);
        this.publishOrbitLocationStatus();
      },
      invalidate: () => {
        this.forceFullRender = true;
      },
    });
  }

  /** Consumes the status produced by an orbital location transition. */
  private publishOrbitLocationStatus(): void {
    if (this.stateManager.statusMessage) {
      this.statusMessage = this.stateManager.statusMessage;
      this.stateManager.statusMessage = '';
    }
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
      this.surfaceMode.roverCargoTextOffset = null;
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
      this.surfaceMode.roverCargoTextOffset = null;
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('PAGE_UP')) {
      const model = this.createRoverCargoModel();
      if (model.dashboard) {
        this.surfaceMode.roverCargoTextOffset = Math.max(0, model.viewOffset - model.visibleRowCount);
        this.forceFullRender = true;
        return true;
      }
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
      const model = this.createRoverCargoModel();
      if (model.dashboard) {
        this.surfaceMode.roverCargoTextOffset = Math.min(
          Math.max(0, model.dashboard.length - model.visibleRowCount),
          model.viewOffset + model.visibleRowCount
        );
        this.forceFullRender = true;
        return true;
      }
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
    if (this.inputManager.wasActionJustPressed('BIOLOGY_SITE') && this.player.terrainVehicle.deployed) {
      this.enterBiologySite();
      this.forceFullRender = true;
      return true;
    }
    if (this.inputManager.wasActionJustPressed('SHIP_MENU')) {
      this.openShipMenu();
      return true;
    }
    if (this.inputManager.wasActionJustPressed('ROVER_CARGO')) {
      this.openRoverCargo();
      return true;
    }

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
    if (this.inputManager.wasActionJustPressed('SHIP_MENU')) {
      this.openShipMenu();
      return true;
    }

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
    if (
      action === 'DEPOT_CANCEL_CONTRACT' &&
      this.stateManager.state === 'starbase' &&
      this.stateManager.currentStarbase?.kind === 'automated-depot' &&
      this.starbaseMode.sectionId === 'missions'
    ) {
      const rows = this.getStarbaseRows(this.stateManager.currentStarbase, 'missions');
      this.reviewDepotCancellation(rows[this.getStarbaseSelection()]?.id);
      return;
    }
    switch (action) {
      case 'TRAVEL_MOVE':
        this.travelMode.commandMoving = true;
        this.statusMessage = `${this.stateManager.state === 'hyperspace' ? 'Interstellar' : 'Planetary'} movement engaged.`;
        return;
      case 'OPEN_SHIP_MENU':
        this.openShipMenu();
        return;
      case 'MISSION_JOURNAL':
        this.openMissionJournal();
        return;
      case 'SCIENCE_LOG':
        this.openScienceLog();
        return;
      case 'OBSERVATORY':
        this.openObservatory();
        return;
      case 'ORBIT_DOSSIER':
        if (this.stateManager.state === 'orbit' && !this.orbitModeState.dossier.isOpen) {
          this.orbitModeState.dossier.open();
          this.forceFullRender = true;
        }
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
      case 'ROVER_LIFE':
        this.enterBiologySite();
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
    if (actionName === 'GALAXY_MAP') {
      this.openGalaxyMap();
      return;
    }
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
      'observatory',
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
      this.prefetchApproachSurfaces(target);
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
    this.prefetchApproachSurfaces(target);
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
            if (surfaceData?.heightmap) {
              const next = surfaceCoordinates(
                this.player.position.surfaceX + dx,
                this.player.position.surfaceY + dy,
                surfaceData.heightmap.length
              );
              if (next.x === this.player.position.surfaceX && next.y === this.player.position.surfaceY) {
                this.statusMessage = 'Latitude boundary reached.';
                return;
              }
              moveData.dy = next.y - this.player.position.surfaceY;
            }
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

  /** Opens and operates the keyboard-first top-down Galaxy instrument. */
  private _handleGalaxyMapInput(): boolean {
    if (!this.galaxyMapOpen) {
      if (
        !this.inputManager.wasActionJustPressed('GALAXY_MAP') ||
        this.interfaceMode.kind !== 'none' ||
        this.popupState !== 'inactive'
      ) {
        return false;
      }
      this.openGalaxyMap();
      return true;
    }

    if (
      this.inputManager.wasActionJustPressed('GALAXY_MAP') ||
      this.inputManager.wasActionJustPressed('QUIT')
    ) {
      this.interfaceMode.close('galaxy-map');
      this.statusMessage = 'Galactic navigation instrument closed.';
      this.forceFullRender = true;
      return true;
    }

    let changed = false;
    if (this.inputManager.wasActionJustPressed('MOVE_LEFT')) {
      this.galaxyMap.pan(-1, 0);
      changed = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_RIGHT')) {
      this.galaxyMap.pan(1, 0);
      changed = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_UP')) {
      this.galaxyMap.pan(0, 1);
      changed = true;
    }
    if (this.inputManager.wasActionJustPressed('MOVE_DOWN')) {
      this.galaxyMap.pan(0, -1);
      changed = true;
    }
    if (
      this.inputManager.wasActionJustPressed('ZOOM_IN') ||
      this.inputManager.wasActionJustPressed('ZOOM_IN_NUMPAD')
    ) {
      this.galaxyMap.zoom(
        1,
        this.systemDataGenerator.getGalaxyModel(),
        this.player.position.worldX,
        this.player.position.worldY
      );
      changed = true;
    }
    if (
      this.inputManager.wasActionJustPressed('ZOOM_OUT') ||
      this.inputManager.wasActionJustPressed('ZOOM_OUT_NUMPAD')
    ) {
      this.galaxyMap.zoom(
        -1,
        this.systemDataGenerator.getGalaxyModel(),
        this.player.position.worldX,
        this.player.position.worldY
      );
      changed = true;
    }
    if (this.inputManager.wasActionJustPressed('GALAXY_RECENTER')) {
      this.galaxyMap.recenterOnPlayer(
        this.systemDataGenerator.getGalaxyModel(),
        this.player.position.worldX,
        this.player.position.worldY
      );
      changed = true;
    }
    if (changed) this.forceFullRender = true;
    return true;
  }

  /** Opens the Galaxy instrument from keyboard or command actions without changing physical location. */
  private openGalaxyMap(): void {
    if (this.interfaceMode.kind !== 'none' || this.popupState !== 'inactive') return;
    this.galaxyMap.reset();
    this.interfaceMode.open('galaxy-map');
    this.travelMode.commandMoving = false;
    this.statusMessage = 'Galactic navigation instrument open.';
    this.forceFullRender = true;
  }

  /** Returns the campaign science terminal, including lightweight non-canvas harnesses. */
  private get scienceLog(): ScienceLog {
    return (this._scienceLog ??= new ScienceLog());
  }

  /** Opens from travel or Operations without changing the player's physical location. */
  private openObservatory(): void {
    const parent = this.interfaceMode.kind;
    if (!['none', 'ship-menu'].includes(parent) || this.popupState !== 'inactive') return;
    if (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen) return;
    if (this.activeEncounter) return;
    this.observatoryController.open(parent === 'ship-menu' ? 'ship-menu' : 'none');
    this.interfaceMode.open('observatory');
    this.travelMode.commandMoving = false;
    this.travelMode.observeCursor = null;
    this.player.terrainVehicle.moving = false;
    this.terminalOverlay.clear();
    this.forceFullRender = true;
    this._observatoryService?.cancel();
    void this.refreshObservatory();
  }

  /** Cancels catalogue acquisition before restoring the parent, consuming any held movement keys. */
  private closeObservatory(): void {
    this.observatorySearchSerial++;
    this.observatoryService.cancel();
    const parent = this.observatoryController.returnTo;
    if (parent === 'ship-menu') this.interfaceMode.open('ship-menu');
    else this.interfaceMode.close('observatory');
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Acquires a bounded preliminary sweep with cancellable yields between expensive physical summaries. */
  private async refreshObservatory(): Promise<void> {
    const serial = ++this.observatorySearchSerial;
    const controller = this.observatoryController;
    const capabilities = getObservatoryCapabilities(this.player.ship);
    const x = this.player.position.worldX;
    const y = this.player.position.worldY;
    controller.contacts = [];
    controller.coverage = 'Acquiring contacts...';
    try {
      const contacts = await this.observatoryService.search(x, y, capabilities, (fraction) => {
        if (serial !== this.observatorySearchSerial) return;
        controller.coverage = `Catalogue acquisition ${Math.round(fraction * 100)}%`;
        this.forceFullRender = true;
      });
      if (!contacts || serial !== this.observatorySearchSerial) return;
      controller.contacts = contacts;
      const medium = this.systemDataGenerator.getInterstellarMediumProperties(x, y);
      const targets = this.observatoryService.selectPreliminaryTargets(
        contacts,
        capabilities,
        medium.sensorRangeMultiplier
      );
      this.forceFullRender = true;
      for (let index = 0; index < targets.length; index++) {
        if (serial !== this.observatorySearchSerial) return;
        const contact = targets[index];
        this.observatoryService.observe(
          contact,
          capabilities,
          x,
          y,
          false,
          this.getCurrentObservatorySystem(contact)
        );
        controller.coverage = `Preliminary spectra ${index + 1}/${targets.length}; ${contacts.length} contacts`;
        this.forceFullRender = true;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (serial !== this.observatorySearchSerial) return;
      for (const entry of Object.values(this.xenobiology.snapshot.evidence))
        for (const origin of entry.origins ?? []) {
          if ((origin.level ?? entry.level) < 2) continue;
          const contact = contacts.find(
            (candidate) =>
              candidate.worldX === origin.worldX &&
              candidate.worldY === origin.worldY &&
              candidate.systemSlot === origin.systemSlot
          );
          if (contact)
            this.observatoryService.recordKnownBiosphere(contact, origin, entry.species.origin === 'native');
        }
      const unmeasured = contacts.filter((contact) => {
        const record = this.observatoryService.snapshot.observations[contact.id];
        return !record || record.biology === 'unmeasured';
      }).length;
      controller.coverage = `${contacts.length} contacts / ${targets.length} readings this sweep / ${capabilities.equipmentClass ? `${unmeasured} unmeasured` : 'suite not fitted'}`;
      this.forceFullRender = true;
      this._publishStatusUpdate();
    } catch (error) {
      if (serial !== this.observatorySearchSerial) return;
      controller.notice = 'Catalogue acquisition failed. Close and reopen to retry.';
      logger.warn('[Observatory] Acquisition failed.', error);
      this.forceFullRender = true;
    }
  }

  /** Prefers the live physical system when observations include the player's current location. */
  private getCurrentObservatorySystem(contact: ObservatoryContact): SolarSystem | null {
    const system = this.stateManager.currentSystem;
    return system &&
      system.starX === contact.worldX &&
      system.starY === contact.worldY &&
      system.systemSlot === contact.systemSlot
      ? system
      : null;
  }

  /** Builds a readonly instrument model using acquired evidence, not undiscovered biological state. */
  private createObservatoryModel(): ObservatoryScreenModel {
    const capabilities = getObservatoryCapabilities(this.player.ship);
    const medium = this.systemDataGenerator.getInterstellarMediumProperties(
      this.player.position.worldX,
      this.player.position.worldY
    );
    return this.observatoryController.createModel(
      this.observatoryService.snapshot,
      { ...capabilities, contactRadiusLy: capabilities.contactRadiusLy * medium.sensorRangeMultiplier },
      this.player.position.worldX,
      this.player.position.worldY,
      this.renderer.getGridCols(),
      this.renderer.getGridRows(),
      (contact) =>
        this.scanService.getCatalogueRecord(`system:${contact.worldX},${contact.worldY}`).observations > 0 ||
        Boolean(this.getCurrentObservatorySystem(contact)) ||
        [...this.planetMutationRegistry.values()].some(
          (entry) =>
            entry.worldX === contact.worldX &&
            entry.worldY === contact.worldY &&
            entry.systemSlot === contact.systemSlot
        )
    );
  }

  /** Resolves instrument actions without advancing surface surveys or specimen mission objectives. */
  private handleObservatoryInput(): boolean {
    if (!this.interfaceMode.is('observatory')) {
      if (!this.inputManager.wasActionJustPressed('OBSERVATORY')) return false;
      this.openObservatory();
      return this.interfaceMode.is('observatory');
    }
    const model = this.createObservatoryModel();
    const intent = this.observatoryController.input(this.inputManager, model);
    const selected = model.contacts.find((contact) => contact.id === model.selectedId);
    if (intent === 'close') this.closeObservatory();
    else if (intent === 'clear') {
      this.observatoryService.snapshot.destination = null;
      this.observatoryController.notice = 'Navigation destination cleared.';
    } else if (intent === 'mark' && selected) {
      this.observatoryService.markDestination(selected);
      this.observatoryController.notice = `Destination: ${selected.name} / X ${selected.worldX} Y ${selected.worldY}`;
    } else if (intent === 'observe' && selected) {
      const result = this.observatoryService.observe(
        selected,
        getObservatoryCapabilities(this.player.ship),
        this.player.position.worldX,
        this.player.position.worldY,
        true,
        this.getCurrentObservatorySystem(selected)
      );
      this.gameClockElapsedSeconds += result.seconds;
      this.observatoryController.notice = !(this.player.ship.observatoryClass ?? 0)
        ? 'Fit an Observatory Suite at a shipyard for planetary spectroscopy.'
        : result.seconds
          ? 'Five-minute integration recorded; catalogue retains best evidence.'
          : 'Exposure complete for this position and instrument. Approach or upgrade for better sensitivity.';
    }
    this.forceFullRender = true;
    return true;
  }

  /** Opens from a safe parent menu or travel, preserving the parent for Escape. */
  private openScienceLog(): void {
    const kind = this.interfaceMode.kind;
    if (!['none', 'ship-menu', 'rover-cargo', 'xenobiology'].includes(kind) || this.popupState !== 'inactive')
      return;
    if (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen) return;
    if (this.activeEncounter && !['drive', 'menu'].includes(this.encounterController.interaction.kind))
      return;
    if (kind !== 'none' && kind !== 'ship-menu' && kind !== 'rover-cargo' && kind !== 'xenobiology') return;
    this.scienceLog.open(kind);
    this.interfaceMode.open('science-log');
    this.forceFullRender = true;
  }

  /** Restores the previous interface and prevents a held Enter from confirming a landing. */
  private closeScienceLog(): void {
    const parent = this.scienceLog.returnTo;
    if (parent === 'none') this.interfaceMode.close('science-log');
    else this.interfaceMode.open(parent);
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Reads one saved discovery site without generating another system. */
  private getScienceOrigin(): BiologyOrigin | undefined {
    return this.scienceLog.origin(
      this.scienceLog.selected(this.scienceLog.entries(this.xenobiology, this.ownedSpecimens))
    );
  }

  /** Resolves a scientific return site only within the current orbital family. */
  private getScienceLandingBody(): Planet | null {
    const origin = this.getScienceOrigin();
    const system = this.stateManager.currentSystem;
    const parent = this.stateManager.currentOrbitReferencePlanet;
    return origin && system && parent && this.stateManager.state === 'orbit'
      ? getRecordedLandingBody(origin, origin, system, parent)
      : null;
  }

  /** Builds a responsive science report from acquired evidence and actual cargo. */
  private createScienceLogModel(): TextModalTableModel {
    return this.scienceLog.createModel(
      this.xenobiology,
      this.ownedSpecimens,
      this.player.ship.stasisClass ?? 1,
      this.renderer.getGridCols(),
      this.renderer.getGridRows(),
      !!this.getScienceLandingBody(),
      this.missionProgress.getActiveMissions(),
      Object.fromEntries(
        this.missionProgress
          .getActiveMissions()
          .map((mission) => [
            mission.id,
            this.missionProgress.getCompletedObjectiveIds(mission, this.ownedSpecimens),
          ])
      )
    );
  }

  /** Handles paused browsing or places the orbital landing cursor at an explicitly recorded site. */
  private handleScienceLogInput(): boolean {
    if (!this.interfaceMode.is('science-log')) {
      if (!this.inputManager.wasActionJustPressed('SCIENCE_LOG')) return false;
      this.openScienceLog();
      return this.interfaceMode.is('science-log');
    }
    const intent = this.scienceLog.input(
      this.inputManager,
      this.scienceLog.entries(this.xenobiology, this.ownedSpecimens),
      this.createScienceLogModel()
    );
    if (intent === 'close') this.closeScienceLog();
    else if (intent === 'landing') {
      const origin = this.getScienceOrigin();
      const body = this.getScienceLandingBody();
      if (!origin || !body)
        this.scienceLog.notice = 'Enter orbit at the recorded planet or its parent to select a habitat.';
      else if (!body.isSurfaceReady()) {
        this.requestSurfacePreparation(body);
        this.scienceLog.notice = 'Preparing destination terrain. Press Enter again when ready.';
      } else if (
        this.orbitModeState.selectLandingSite(
          this.stateManager.currentOrbitReferencePlanet!,
          body,
          origin.surface.x,
          origin.surface.y,
          origin.surface.label
        )
      ) {
        this.statusMessage = this.orbitModeState.alert;
        this.closeScienceLog();
      } else this.scienceLog.notice = 'Recorded coordinates are invalid for this body.';
    }
    if (this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Resolves legacy local destinations from actual generated worlds before reading accepted contracts. */
  private getMissionJournalEntries(): MissionJournalEntry[] {
    if (!this.missionProgress.getActiveCount()) return [];
    const system = this.stateManager.currentSystem;
    if (system) {
      const biospheres = getSystemPlanetPaths(system)
        .map(({ planet }) => this.getBiosphere(planet))
        .filter((entry): entry is BiosphereDefinition => entry !== null);
      this.missionProgress.resolveNavigation(system, biospheres);
    }
    const specimens = this.ownedSpecimens;
    return this.missionProgress.getActiveMissions().map((mission) => ({
      mission,
      status: this.missionProgress.getStatus(mission, specimens),
      ...this.missionProgress.getObjectiveCounts(mission, specimens),
      completedObjectiveIds: this.missionProgress.getCompletedObjectiveIds(mission, specimens),
      objectiveShortfalls: this.missionProgress.getObjectiveShortfalls(mission, specimens),
      haulStage:
        mission.type === 'heavy-haul' ? this.heavyHaulService.createSnapshot().activeTow?.stage : undefined,
    }));
  }

  /** Opens from travel or a safe parent menu, preserving its selection for Escape. */
  private openMissionJournal(): void {
    const kind = this.interfaceMode.kind;
    if (kind !== 'none' && kind !== 'ship-menu' && kind !== 'rover-cargo' && kind !== 'xenobiology') return;
    if (
      this.popupState !== 'inactive' ||
      (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen)
    )
      return;
    if (this.activeEncounter && !['drive', 'menu'].includes(this.encounterController.interaction.kind))
      return;
    this.missionJournal.open(kind);
    this.interfaceMode.open('mission-journal');
    this.forceFullRender = true;
  }

  /** Restores the exact parent interface and prevents held terminal keys leaking into movement. */
  private closeMissionJournal(): void {
    const returnTo = this.missionJournal.returnTo;
    if (returnTo === 'none') this.interfaceMode.close('mission-journal');
    else this.interfaceMode.open(returnTo);
    this.missionJournal.reveal.complete();
    this.inputManager.clearState();
    this.forceFullRender = true;
  }

  /** Determines whether this journal target can be selected in the current orbital family. */
  private getJournalLandingBody(mission: StarbaseMission | undefined): Planet | null {
    const system = this.stateManager.currentSystem;
    const parent = this.stateManager.currentOrbitReferencePlanet;
    return mission && system && parent && this.stateManager.state === 'orbit'
      ? getMissionLandingBody(mission, system, parent, this.missionJournal.landingObjectiveIndex(mission))
      : null;
  }

  /** Prepares the selected mission's landing cursor, never entering orbit or landing automatically. */
  private selectMissionLandingSite(mission: StarbaseMission | undefined): void {
    const body = this.getJournalLandingBody(mission);
    const site =
      mission &&
      getMissionLandingLocation(mission, this.missionJournal.landingObjectiveIndex(mission))?.surface;
    if (!body || !site) {
      this.missionJournal.notice = !site
        ? 'No specific landing coordinates required by this contract.'
        : 'Enter orbit at the destination planet or its parent before selecting this site.';
    } else if (!body.isSurfaceReady()) {
      this.requestSurfacePreparation(body);
      this.missionJournal.notice = 'Preparing destination terrain. Press Enter again when it is ready.';
    } else if (
      this.orbitModeState.selectLandingSite(
        this.stateManager.currentOrbitReferencePlanet!,
        body,
        site.x,
        site.y,
        site.label
      )
    ) {
      const resolution = this.scanService.resolvePlanet(body, 'surveyed', 100, 'orbital-survey');
      this.completeMissionsForDiscovery(body, resolution.current.level);
      this.enqueueSurfacePrefetch(
        this.orbitModeState.getPrefetchWindow(this.stateManager.currentOrbitReferencePlanet!)
      );
      this.statusMessage = this.orbitModeState.alert;
      this.closeMissionJournal();
      return;
    } else {
      this.missionJournal.notice = 'Recorded landing coordinates are not valid for this body.';
    }
    this.missionJournal.viewOffset = 0;
    this.forceFullRender = true;
  }

  /** Gives the mission terminal exclusive input ownership while allowing shortcuts from its parent menus. */
  private handleMissionJournalInput(): boolean {
    if (!this.interfaceMode.is('mission-journal')) {
      if (!this.inputManager.wasActionJustPressed('MISSION_JOURNAL')) return false;
      this.openMissionJournal();
      return this.interfaceMode.is('mission-journal');
    }
    const entries = this.getMissionJournalEntries();
    const model = this.createMissionJournalModel(entries);
    const intent = this.missionJournal.input(this.inputManager, entries, model);
    if (intent === 'close') this.closeMissionJournal();
    else if (intent === 'haul') this.openHaulManifest(this.missionJournal.selected(entries)?.mission);
    else if (intent === 'landing')
      this.selectMissionLandingSite(this.missionJournal.selected(entries)?.mission);
    if (this.inputManager.wasAnyKeyJustPressed()) this.forceFullRender = true;
    return true;
  }

  /** Builds a responsive mission terminal with contextual landing controls. */
  private createMissionJournalModel(entries = this.getMissionJournalEntries()): TextModalTableModel {
    return this.missionJournal.createModel(
      entries,
      this.renderer.getGridCols(),
      this.renderer.getGridRows(),
      !!this.getJournalLandingBody(this.missionJournal.selected(entries)?.mission)
    );
  }

  /** Processes all input for the current frame by calling helper methods. */
  private _processInput(): void {
    if (this.screenTransition.isActive) {
      if (
        ['ENTER_SYSTEM', 'PRIMARY_ACTION', 'QUIT', 'LEAVE_SYSTEM'].some((action) =>
          this.inputManager.wasActionJustPressed(action)
        )
      )
        this.screenTransition.skip();
      return;
    }
    // A prepared transfer freezes funds too; other menus retain the global playtest shortcut.
    if (this.inputManager.wasActionJustPressed('TEST_CREDITS')) {
      const amount = CONFIG.TEST_CREDIT_GRANT;
      this.player.resources.credits += amount;
      this.statusMessage = `Test funds: +${amount.toLocaleString()} Cr.`;
      if (this.stateManager.state === 'starbase') this.starbaseMode.alert = this.statusMessage;
      this.forceFullRender = true;
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: amount,
      });
      this._publishStatusUpdate();
      return;
    }
    if (this.handleTerminalDialogInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (
      this.handleHaulManifestInput() ||
      this.handleShipRepairInput() ||
      this.handleDepotServiceInput() ||
      this.handleFrontierTerminalInput()
    ) {
      this._publishStatusUpdate();
      return;
    }
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
    // The dossier owns all keys, including shortcuts for other instruments.
    if (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen) {
      this._handleOrbitInput();
      this._publishStatusUpdate();
      return;
    }
    if (this.interfaceMode.is('observatory') || this.inputManager.wasActionJustPressed('OBSERVATORY')) {
      if (this.handleObservatoryInput()) {
        this._publishStatusUpdate();
        return;
      }
    }
    if (this.handleScienceLogInput() || this.handleMissionJournalInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleGalaxyMapInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleShipMenuInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this._handleRoverCargoInput()) {
      this._publishStatusUpdate();
      return;
    }
    if (this.handleEncounterInput()) {
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
    if (
      this.inputManager.wasActionJustPressed('BIOLOGY_SITE') &&
      this.stateManager.state === 'orbit' &&
      !this.orbitModeState.dossier.isOpen
    ) {
      const parent = this.stateManager.currentOrbitReferencePlanet;
      if (parent) {
        const body = this.orbitModeState.getSelectedBody(parent);
        if (!hasDiscoveryLevel(body.discovery.level, 'surveyed')) {
          this.statusMessage = 'Orbital survey required to resolve habitat landing coordinates.';
          this.forceFullRender = true;
          return;
        }
        const biosphere = this.getBiosphere(body);
        const sites = biosphere?.sites ?? [];
        if (sites.length) {
          const site = sites[(this.habitatSelection ?? 0) % sites.length];
          this.habitatSelection = (this.habitatSelection ?? 0) + 1;
          this.orbitModeState.mode = 'landing';
          this.orbitModeState.landingX = site.x;
          this.orbitModeState.landingY = site.y;
          const preview = habitatLandingPreview(site, this.xenobiology.snapshot);
          this.orbitModeState.alert =
            this.statusMessage = `${preview[0]}. ${preview[1]}. D dossier; Enter lands.`;
          this.orbitModeState.invalidateScreen();
        } else {
          if (biosphere && !body.isSurfaceReady()) this.requestSurfacePreparation(body);
          this.statusMessage = biosphere
            ? 'Habitat coordinates resolving; press B once surface preparation finishes.'
            : 'No accessible biological signatures.';
        }
        this.forceFullRender = true;
        this._publishStatusUpdate();
      }
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
      } else if (
        target instanceof Planet ||
        target instanceof Starbase ||
        target instanceof NavigationMarker
      ) {
        targetName = target.name;
        if (target instanceof Planet) {
          const confidence = Math.min(
            100,
            78 + getOperationalCapabilities(this.player.crew, this.player.ship).scanConfidenceBonus
          );
          const resolution = this.scanService.resolvePlanet(target, 'observed', confidence, 'local-scan');
          this.completeMissionsForDiscovery(target, resolution.current.level);
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
          if (!(target instanceof Planet)) {
            const discoveryLevel = this.recordLocalCatalogueScan(target as SolarSystem | StellarBody);
            this.completeMissionsForDiscovery(target as SolarSystem | StellarBody, discoveryLevel);
          }
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
    const detectionRadius = props.exists
      ? getStellarDetectionRadii(props).statusRadius
      : phenomenon?.type === 'rogue-planet'
        ? CONFIG.ROGUE_PLANET_VISIBILITY_RADIUS_CELLS
        : CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS;
    const isNavigable =
      (props.exists || isNavigablePhenomenon(phenomenon)) &&
      Math.hypot(cursor.dx, cursor.dy) <= detectionRadius;
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
    const observedStarType = phenomenon?.type === 'neutron-star' ? 'NS' : props.starType;
    const observedKind =
      phenomenon?.type === 'neutron-star'
        ? 'neutron-star'
        : phenomenon?.type === 'rogue-planet'
          ? 'rogue-planet'
          : props.objectKind;
    const quality = this.getInterstellarObservationQuality(cursor, observedKind, detectionRadius);
    const lines = this.formatInterstellarObserveReport(
      target,
      worldX,
      worldY,
      quality,
      observedStarType,
      observedKind
    );
    this.terminalOverlay.addMessageLines(lines);
    this.player.awardCrewExperience('astroscience', quality.confidence >= 60 ? 6 : 3);
    this.player.awardCrewExperience('communication', 2);
    const discoveryLevel: DiscoveryLevel =
      quality.confidence >= 70 ? 'observed' : quality.confidence >= 40 ? 'classified' : 'detected';
    const resolution = this.scanService.resolveCatalogueTarget(
      `system:${worldX},${worldY}`,
      discoveryLevel,
      quality.confidence,
      'long-range'
    );
    this.completeMissionsForDiscovery(target, resolution.current.level);
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
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | 'neutron-star' | null,
    detectionRadius: number
  ): { confidence: number; rangeCells: number; label: string; signature: string; rangeLabel: string } {
    const rangeCells = Math.hypot(cursor.dx, cursor.dy);
    // Stellar source strength is already represented by its flux-based detection horizon.
    const sourceStrength = objectKind === 'neutron-star' ? 0.75 : 1;
    const capabilityBonus = getOperationalCapabilities(
      this.player.crew,
      this.player.ship
    ).scanConfidenceBonus;
    const confidence = Math.max(
      8,
      Math.min(98, Math.round((98 - (80 * rangeCells) / detectionRadius) * sourceStrength + capabilityBonus))
    );
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
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | 'neutron-star' | null
  ): string[] {
    const classLabel =
      objectKind === 'neutron-star'
        ? 'compact stellar remnant'
        : objectKind === 'rogue-planet'
          ? 'planetary-mass object'
          : objectKind === 'brown-dwarf'
            ? 'substellar infrared source'
            : 'stellar source';
    const identity =
      quality.confidence >= 72
        ? objectKind === 'rogue-planet'
          ? `${target.name} / ${classLabel}`
          : `${target.name} ${starType ?? target.starType}`
        : quality.confidence >= 48
          ? `${objectKind === 'neutron-star' ? '' : starType ? `${starType.slice(0, 1)}-class ` : ''}${classLabel}`
          : quality.label;
    const hasRegisteredStation = (target.stations?.length ?? (target.starbase ? 1 : 0)) > 0;
    const hasDeployedFacility =
      Number.isFinite(target.starX) &&
      Number.isFinite(target.starY) &&
      this.infrastructureRegistry.at(systemAddress(target)).length > 0;
    const registeredFacility = hasRegisteredStation || hasDeployedFacility;
    const facilityTrace =
      quality.confidence >= 72 && registeredFacility
        ? 'confirmed'
        : quality.confidence >= 50 && registeredFacility
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
    const horizon = survey.nearestSystemContact?.system
      ? getStellarDetectionRadii(survey.nearestSystemContact.system, survey.medium.sensorRangeMultiplier)
          .statusRadius
      : survey.detectionRadius;
    const confidence = Math.max(12, Math.min(98, Math.round(98 - (80 * range) / horizon)));
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
      range > horizon * 0.7
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
    const confidence = Math.max(
      10,
      Math.min(
        99,
        Math.round(
          82 -
            rangeAu * 7 +
            getOperationalCapabilities(this.player.crew, this.player.ship).scanConfidenceBonus
        )
      )
    );
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

  /** Records a local stellar or system scan and returns its resulting knowledge level. */
  private recordLocalCatalogueScan(target: SolarSystem | StellarBody): DiscoveryLevel {
    const system = this.stateManager.currentSystem;
    const worldX = system?.starX ?? this.player.position.worldX;
    const worldY = system?.starY ?? this.player.position.worldY;
    const key =
      target instanceof SolarSystem ? `system:${worldX},${worldY}` : `star:${worldX},${worldY}/${target.id}`;
    return this.scanService.resolveCatalogueTarget(key, 'observed', 98, 'local-scan').current.level;
  }

  /** Records mission objective progress produced by a discovery update. */
  private completeMissionsForDiscovery(
    target: Planet | SolarSystem | StellarBody,
    discoveryLevel: DiscoveryLevel
  ): void {
    const localSystem = this.stateManager.currentSystem;
    if (localSystem && this.stateManager.state !== 'hyperspace')
      recordLocalSurvey(
        this.surveyData,
        target,
        localSystem,
        discoveryLevel,
        this.gameClockElapsedSeconds ?? 0
      );
    const systemName =
      target instanceof SolarSystem ? target.name : (this.stateManager.currentSystem?.name ?? null);
    const updates = this.missionProgress.recordDiscovery(
      target,
      systemName,
      discoveryLevel,
      target instanceof SolarSystem ? target : (this.stateManager.currentSystem ?? undefined)
    );
    for (const update of updates) {
      const counts = this.missionProgress.getObjectiveCounts(update.mission);
      this.player.awardCrewExperience('astroscience', 5);
      this.statusMessage = update.readyForReturn
        ? `Contract telemetry complete: ${update.mission.title}. Return to ${update.mission.originStarbaseName}.`
        : `Contract updated: ${update.mission.title} (${counts.completed}/${counts.total}).`;
      this.terminalOverlay.addMessage(`<h>${this.statusMessage}</h>`);
      logger.info(
        `[Game] Mission objectives updated: ${update.mission.id} (${counts.completed}/${counts.total}).`
      );
    }
  }

  /** Formats scan results for a star/system */
  private _formatStarScanPopup(target: SolarSystem | StellarBody): string[] {
    const lines: string[] = [];
    const system = target instanceof SolarSystem ? target : null;
    const remnantSystem = system ?? (target.starType === 'NS' ? this.stateManager?.currentSystem : null);
    if (remnantSystem?.isCompactRemnant && (target === remnantSystem || target === remnantSystem.stars[0])) {
      const phenomenon = this.systemDataGenerator.getDeepSpacePhenomenonProperties(
        remnantSystem.starX,
        remnantSystem.starY
      );
      const star = remnantSystem.stars[0];
      return [
        '',
        `<h>--- COMPACT REMNANT SCAN: ${remnantSystem.name} ---</h>`,
        'Classification: <hl>NEUTRON STAR / PULSAR</hl>',
        `Pulse timing: <hl>${phenomenon.signal ?? 'unresolved'}</hl>`,
        `Mass: <hl>~${(star.massKg / SPECTRAL_TYPES.G.mass).toFixed(1)} solar masses</hl>`,
        `Radius: <hl>~${(star.radiusM / 1000).toFixed(0)} km</hl>`,
        `Thermal surface: <hl>~${SPECTRAL_TYPES.NS.temp.toLocaleString()} K</hl> (emission mainly ultraviolet / X-ray)`,
        'No surviving planetary bodies resolved in this local frame.',
        '<h>--- SCAN COMPLETE ---</h>',
        '',
      ];
    }
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
    lines.push(`Classification: <hl>${getStellarStageLabel(star.starType)}</hl>`);
    lines.push(
      `Stellar Age: <hl>~${star.environment.ageGyr.toFixed(star.environment.ageGyr < 0.1 ? 3 : 2)} Gyr</hl>`
    );
    lines.push(
      `${star.environment.evolution && star.environment.evolution.stage !== 'main-sequence' ? 'Birth metallicity' : 'Metallicity'}: <hl>${star.environment.metallicityFeH >= 0 ? '+' : ''}${star.environment.metallicityFeH.toFixed(2)} [Fe/H]</hl>`
    );
    if (starInfo) {
      lines.push(`Temperature: <hl>~${starInfo.temp.toLocaleString()} K</hl>`);
      const relativeLuminosity = star.luminosityW / SOLAR_LUMINOSITY_W;
      lines.push(`Luminosity: <hl>~${relativeLuminosity.toExponential(1)}</hl> (Rel. Sol)`);
      lines.push(`Mass: <hl>~${(star.massKg / SOLAR_MASS_KG).toFixed(2)} Solar Masses</hl>`);
      lines.push(`Radius: <hl>~${(star.radiusM / SOLAR_RADIUS_M).toPrecision(3)} Solar Radii</hl>`);
    } else {
      lines.push(`Temperature: [-W-]Unknown</w>`);
      lines.push(`Luminosity: [-W-]Unknown</w>`);
      lines.push(`Mass: [-W-]Unknown</w>`);
      lines.push(`Radius: [-W-]Unknown</w>`);
    }
    if (system) {
      if (system.galacticContext) {
        lines.push(
          `Galactic Region: <hl>${system.galacticContext.armName ?? 'inter-arm space'}</hl> | Population: <hl>${system.galacticPopulation ?? 'unclassified'}</hl>`
        );
        if (system.galacticContext.cluster) {
          lines.push(
            `Cluster: <hl>${system.galacticContext.cluster.name}</hl> (${system.galacticContext.cluster.kind})`
          );
        }
      }
      lines.push(`System Radius: <hl>${formatDistanceAu(system.edgeRadius)}</hl>`);
      lines.push(
        `One-way Light Time: <hl>${formatLightTimeFromMeters(system.edgeRadius)}</hl> to chart edge`
      );
      lines.push(`Planetary Bodies: <hl>${system.planets.filter((p) => p !== null).length}</hl>`);
      if (system.colonyWorld) {
        lines.push(
          `Human Presence: <hl>${system.settlementStage} terraforming on ${system.colonyWorld.name}</hl>`
        );
      }
      lines.push(
        `Facilities: <hl>${system.stations.map((station) => (station.kind === 'automated-depot' ? 'Automated Depot' : 'Starbase')).join(', ') || 'None Detected'}</hl>`
      );
    }
    lines.push('<h>--- SCAN COMPLETE---</h>');
    lines.push(``);
    return lines;
  }

  // --- Game State Update ---
  /** Updates. */
  private _update(deltaTime: number): void {
    if (this.screenTransition.isActive) {
      this.updateHaulVoyageTransition(deltaTime);
      return;
    }
    if (this.terminalDialog.isOpen) return;
    this.captureCurrentPlanetMutations();
    this.hyperspaceSurveyService?.setInstrumentMultiplier?.(
      getObservatoryCapabilities(this.player.ship).stellarRangeMultiplier
    );
    if (this.interfaceMode.is('survey-exchange')) {
      if (this.frontierTerminal.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (this.interfaceMode.is('observatory')) {
      if (this.observatoryController.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (this.interfaceMode.is('ship-repairs')) {
      if (this.shipRepairConsole.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (this.interfaceMode.is('depot-service')) {
      if (this.depotConsole.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (this.interfaceMode.is('haul-manifest')) {
      if (this.haulManifest.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (this.interfaceMode.is('science-log')) {
      if (this.scienceLog.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (this.interfaceMode.is('mission-journal')) {
      if (this.missionJournal.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    let blockGameUpdates = this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen;
    if (this.activeEncounter) {
      if (this.encounterController.reveal.update(this.currentVisualDeltaSeconds || deltaTime))
        this.forceFullRender = true;
      return;
    }
    if (
      blockGameUpdates &&
      this.orbitModeState.dossier.reveal.update(this.currentVisualDeltaSeconds || deltaTime)
    ) {
      this.forceFullRender = true;
    }
    if (!this.isGameClockPaused()) {
      this.gameClockElapsedSeconds += frameToSimulatedSeconds(deltaTime);
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
        // State updates feed persistent telemetry. Action and error messages retain the
        // dedicated notification line instead of replacing the instrument readings.
        this.currentStateUpdateStatus = stateUpdateStatus;
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
      getObservatoryCapabilities(this.player.ship).stellarRangeMultiplier,
    ].join('|');
    if (viewportSignature === this.lastHyperspaceUpdateSignature) {
      return this.lastHyperspaceUpdateStatus;
    }

    // Telescope processing is bounded and yields between targets, independently of the travel renderer.
    const survey = this.getCurrentHyperspaceSurvey();
    if (this.player.ship.observatoryClass) {
      void this.observatoryService
        .sampleWhileTravelling(
          survey.visibleCells,
          getObservatoryCapabilities(this.player.ship),
          this.player.position.worldX,
          this.player.position.worldY
        )
        .catch((error) => logger.warn('[Observatory] Passive integration failed.', error));
    }
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
    const isNearNavigablePhenomenon = isNavigablePhenomenon(currentPhenomenon);
    const medium = survey.medium;
    const contact = this.toNavigationContact(survey.nearestSystemContact);
    const movementFuelCost =
      CONFIG.HYPERSPACE_MOVE_FUEL_COST *
      getEngineFuelUseMultiplier(this.player.ship.engineClass) *
      getOperationalCapabilities(this.player.crew, this.player.ship).hyperspaceFuelMultiplier;
    const fuelReach = Math.floor(this.player.resources.fuel / Math.max(0.001, movementFuelCost));

    let baseStatus = `Hyperspace | Loc: ${this.player.position.worldX},${this.player.position.worldY} | ISM: ${medium.label} sensors ${(medium.sensorRangeMultiplier * 100).toFixed(0)}%`;
    if (contact) {
      baseStatus += ` | Contact: ${contact.name} ${contact.starType} ${this.formatHyperspaceBearing(contact)} ${contact.rangeCells.toFixed(1)}c/${formatHyperspaceSpan(contact.rangeCells)}`;
      if (contact.objectKind === 'brown-dwarf') baseStatus += ' faint';
      if (contact.hasStarbase) baseStatus += ' Starbase';
    } else {
      baseStatus += ' | Contact: no resolved returns';
    }
    baseStatus += ` | Fuel reach: ${fuelReach} cell${fuelReach === 1 ? '' : 's'} / ${formatHyperspaceSpan(fuelReach)}`;

    if (isNearStar || isNearNavigablePhenomenon) {
      // Only peek if necessary for status display
      const peekedSystem = this.stateManager.peekAtSystem(
        this.player.position.worldX,
        this.player.position.worldY
      );
      if (peekedSystem) {
        const deployed = this.infrastructureRegistry.at(systemAddress(peekedSystem));
        const starbaseText = peekedSystem.stations.length
          ? ' (Station)'
          : deployed.some((asset) => asset.kind === 'automated-depot')
            ? ' (Logistics Depot)'
            : deployed.length
              ? ' (Nav Buoy)'
              : '';
        const objectLabel = peekedSystem.isStarless
          ? 'Free planetary mass'
          : peekedSystem.isCompactRemnant
            ? 'Neutron star'
            : 'Near';
        baseStatus += ` | ${objectLabel} ${peekedSystem.name}${starbaseText}.`;
      } else {
        // Hash indicated star, but peek failed? Log warning.
        logger.warn(
          `[Game:_updateHyperspace] Hash indicated explorable contact at ${this.player.position.worldX},${this.player.position.worldY} but peek failed.`
        );
        baseStatus += ' | Near navigable contact.';
      }
    } else {
      this.stateManager.resetPeekedSystem(); // Clear peek cache if not near star
    }
    this.lastHyperspaceUpdateSignature = viewportSignature;
    this.lastHyperspaceUpdateStatus = baseStatus;
    return baseStatus;
  }

  /** Returns current hyperspace survey. */
  private getCurrentHyperspaceSurvey() {
    this.hyperspaceSurveyService.setInstrumentMultiplier?.(
      getObservatoryCapabilities(this.player.ship).stellarRangeMultiplier
    );
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
    if (
      selectedTarget instanceof Planet &&
      this.player.distanceSqToSystemCoords(selectedTarget.systemX, selectedTarget.systemY) <
        (CONFIG.LANDING_DISTANCE * 8) ** 2
    ) {
      this.prefetchApproachSurfaces(selectedTarget);
    }
    const systemKindLabel = system.isCompactRemnant
      ? 'neutron-star remnant'
      : system.isStarless
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
    targets.push(...system.stations, ...system.navigationMarkers);
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
    targets.push(...system.stations, ...system.navigationMarkers);
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
      columns: ['TYPE', 'NAME', 'HAB', 'RANGE', 'BRG'],
      widths: [8, 22, 7, 10, 5],
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
        this.getTargetHabitationLabel(target),
        formatDistanceAu(distance),
        this.formatBearing(coords.x - this.player.position.systemX, coords.y - this.player.position.systemY),
      ],
      detail: `${this.getTargetName(target)} | ${this.getTargetClassLabel(target)} | ${this.getTargetHabitationDetail(target)} | one-way signal ${formatLightTimeFromMeters(distance)}`,
    };
  }

  /** Opens ship menu. */
  private openShipMenu(): void {
    if (!this.canOpenShipMenu()) {
      this.statusMessage = 'Ship menu unavailable while another interface is active.';
      return;
    }
    this.shipMenuOpen = true;
    if (this.stateManager.state === 'planet') {
      this.player.terrainVehicle.moving = false;
      this.surfaceMode.closeTransientInterfaces();
    }
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
      !this.jettisonConfirmation &&
      (!this.activeEncounter || ['drive', 'menu'].includes(this.encounterController.interaction.kind))
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
    const dy = site.y - this.player.position.surfaceY;
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
      { id: 'operations', label: 'Operations', status: 'ship link' },
      { id: 'pickup', label: 'Pick up', status: 'no local items' },
      { id: 'mine', label: 'Mine', status: `${cargoLoad} m^3` },
      { id: 'scan', label: 'Scan', status: 'local sweep' },
      { id: 'life', label: 'Life', status: this.getBiosphere() ? 'habitats detected' : 'no signatures' },
      { id: 'stun', label: 'Stun', status: 'safe' },
      { id: 'shoot', label: 'Shoot', status: 'safe' },
      { id: 'icon', label: 'Icon', status: 'legend' },
      { id: 'missions', label: 'Missions', status: `${this.missionProgress.getActiveCount()} active` },
      {
        id: 'science',
        label: 'Science log',
        status: `${Object.keys(this.xenobiology.snapshot.evidence).length} records`,
      },
    ];
    if (this.isAtParkedShip()) {
      items.splice(0, 0, { id: 'embark', label: 'Embark', status: 'board ship' });
      if ((this.player.terrainVehicle.integrity ?? 100) < 100)
        items.push({
          id: 'repair',
          label: 'Repair',
          status: `${Math.ceil((100 - (this.player.terrainVehicle.integrity ?? 100)) * ROVER_REPAIR_COST_PER_POINT)} Cr`,
        });
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
        x: surfaceLongitudeDelta(
          this.player.position.surfaceX,
          this.player.terrainVehicle.shipSurfaceX,
          this.stateManager.currentPlanet
            ? getPlanetMapSize(this.stateManager.currentPlanet)
            : CONFIG.PLANET_MAP_BASE_SIZE
        ),
        y: this.player.terrainVehicle.shipSurfaceY - this.player.position.surfaceY,
      },
      shipDistance: this.getParkedShipRangeAndBearing(),
      atShip: this.isAtParkedShip(),
      altitudeBand: this.getCurrentSurfaceAltitudeBand(),
    };
  }

  /** Returns game date time label. */
  private getGameDateTimeLabel(elapsedSeconds = this.gameClockElapsedSeconds): string {
    const date = new Date(Game.GAME_START_UTC_MS + Math.floor(elapsedSeconds) * 1000);
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
    this.surfaceMode.roverCargoTextOffset = 0;
    this.player.terrainVehicle.moving = false;
    const batches =
      this.player.terrainVehicle.cargoHold.specimens?.filter((item) => item.kind === 'propagule') ?? [];
    this.statusMessage = batches.length
      ? `${batches.length} viable ${batches.length === 1 ? 'batch' : 'batches'} aboard in rover stasis. ${this.getSpecimenContractMessage(batches[batches.length - 1])}`
      : this.activeEncounter
        ? 'I opens Cargo. Select a collection action and press Enter to collect; opening this menu collects nothing.'
        : 'Terrain vehicle cargo opened.';
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
    const cols = this.renderer.getGridCols();
    const gridRows = this.renderer.getGridRows();
    const field = this.activeEncounter;
    const wideFooter = biologyDashboard(
      field
        ? [this.statusMessage, 'Up/Down select  Enter use', 'Esc/Left close']
        : ['Up/Down select  Enter drop stack  Esc/Left close'],
      Math.min(cols - 12, 82)
    ).map((line) => line.segments.map((span) => span.text).join(''));
    // Long notices become scrollable content rather than squeezing the cargo list beneath a tall footer.
    const compact = cols < 42 || gridRows - wideFooter.length - 15 < 3;
    const footer = compact
      ? biologyDashboard(['Up/Down select  Enter use', 'PgUp/PgDn read', 'Esc/Left close'], cols - 12).map(
          (line) => line.segments.map((span) => span.text).join('')
        )
      : wideFooter;
    const notice = compact
      ? wrapDashboardLines(
          [{ segments: [{ text: this.statusMessage, tone: 'cyan', font: 'thin' }] }, { segments: [] }],
          cols - 12
        )
      : [];
    const groups = compact
      ? rows.map((row, index) =>
          biologyDashboard(
            [
              `${index === viewport.selectedIndex ? '>' : ' '} ${row.cells[0]}`,
              row.cells.slice(1).join(' / '),
              row.detail ?? '',
              '',
            ],
            cols - 12
          ).map((line) => ({
            segments: line.segments.map((span) => ({ ...span, tone: row.tone ?? span.tone })),
          }))
        )
      : undefined;
    const dashboard = groups ? [...notice, ...groups.flat()] : undefined;
    return {
      title: 'Terrain Vehicle Cargo',
      subtitle: compact
        ? field
          ? 'Contacts / hold'
          : 'Sealed hold'
        : field
          ? 'Collect a nearby contact or inspect sealed containers.'
          : 'Rover hold only. Enter drops selected cargo onto the planet surface.',
      columns: ['CARGO', 'QTY', 'VALUE', 'ACTION'],
      widths: [26, 7, 10, 36],
      rows,
      selectedIndex: this.surfaceMode.roverCargoSelection,
      // Compact cargo uses wrapped text lines, not the wide table's item-row offset.
      viewOffset: groups
        ? (this.surfaceMode.roverCargoTextOffset ??
          notice.length +
            groups.slice(0, viewport.selectedIndex).reduce((count, group) => count + group.length, 0))
        : this.surfaceMode.roverCargoOffset,
      visibleRowCount: dashboard
        ? getDashboardVisibleRows(dashboard.length, gridRows, footer.length)
        : visibleRows,
      detailLineCount: 3,
      dashboard,
      footer,
    };
  }

  /** Returns rover cargo rows. */
  private getRoverCargoRows(): TextTableRow[] {
    const entries = Object.entries(this.player.terrainVehicle.cargoHold.items).filter(
      ([, amount]) => amount > 0
    );
    const held = this.player.terrainVehicle.cargoHold.specimens ?? [];
    const specimens = specimenRows(held, this.xenobiology).map((row, index) => ({
      ...row,
      detail: `${this.getSpecimenContractMessage(held[index])} ${row.detail}`,
    }));
    const pickup: TextTableRow[] = [];
    const field = this.activeEncounter;
    const selected = field ? this.encounterController.target(field) : undefined;
    const nearby = field
      ? field.individuals
          .filter(
            (target) =>
              encounterVisible(field, target) &&
              Math.hypot(target.x - field.roverX, target.y - field.roverY) <= 1.5
          )
          .sort(
            (a, b) =>
              Number(b.id === selected?.id) - Number(a.id === selected?.id) || a.id.localeCompare(b.id)
          )
      : [];
    for (const target of nearby) {
      const species = individualProfile(field!, target);
      const level = this.xenobiology.evidence(species.id)?.level ?? 0;
      if (supportsPropagules(species) && level >= 3) {
        const batch = this.ownedSpecimens.find(
          (item) => item.sourceId === target.id && item.kind === 'propagule'
        );
        const carrier = batch && held.includes(batch) ? 'rover hold' : 'ship hold';
        const refusal =
          propaguleAvailability(species, target) ??
          new SpecimenCargoSystem().canAdd(
            this.player.terrainVehicle.cargoHold,
            createCollectionContainer(field!, target, 'propagule'),
            this.player.ship.stasisClass ?? 1
          );
        pickup.push({
          id: `harvest-propagules:${target.id}`,
          cells: [
            batch ? 'Viable batch collected' : 'Harvest viable propagules',
            '1 batch',
            '--',
            batch ? `ABOARD / ${carrier}` : (refusal ?? 'Enter harvests / 0.1 m^3'),
          ],
          detail: batch
            ? `Batch sealed in ${carrier}; this parent cannot supply another. ${this.getSpecimenContractMessage(batch)}`
            : `${refusal ? `${refusal}. ` : ''}${species.name} / detachable dormant buds / 0.1 m^3 / one stasis slot. ${refusal ? 'No batch was collected from this action.' : 'Enter seals one batch; parent remains intact.'}`,
          disabled: !!refusal,
          tone: batch ? 'cyan' : refusal ? 'amber' : 'green',
        });
      }
      pickup.push({
        id: `collect-organism:${target.id}`,
        cells: [
          isMicrobialPatch(species)
            ? 'Preserve microbial sample'
            : target.id === selected?.id
              ? 'Collect selected organism'
              : 'Collect nearby organism',
          '1',
          '--',
          isMicrobialPatch(species)
            ? 'Seal viable material in stasis'
            : target.state === 'dead'
              ? 'Secure intact remains'
              : 'Place in stasis',
        ],
        detail: isMicrobialPatch(species)
          ? `${level >= 2 ? species.name : 'Selected surface growth'} / 5 g representative material in a sealed 0.1 m^3 field cassette. One stasis slot; preserves viable community material, not an isolated laboratory culture. Surrounding substrate remains in place.`
          : `${level >= 2 ? species.name : 'Selected contact'} / estimated ${species.massKg.toFixed(species.massKg < 1 ? 2 : 1)} kg: transfer one whole organism into rover cargo. Larger mobile organisms must be stunned first. Handling limit 80 kg.`,
        tone: 'green',
      });
    }
    if (entries.length === 0 && specimens.length === 0 && pickup.length === 0) {
      return [{ id: 'empty', cells: ['Rover hold empty', '0', '0', 'No cargo to drop.'], disabled: true }];
    }
    return [
      ...pickup,
      ...specimens,
      ...entries.map(([itemKey, amount]) => {
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
      }),
    ];
  }

  /** Drops the selected rover cargo item onto the current surface cell. */
  private dropSelectedRoverCargo(row: TextTableRow | undefined): void {
    if (!row) return;
    this.surfaceMode.roverCargoTextOffset = 0;
    if (row.disabled) {
      const batch = row.id.startsWith('harvest-propagules:')
        ? this.ownedSpecimens.find(
            (item) =>
              item.sourceId === row.id.slice('harvest-propagules:'.length) && item.kind === 'propagule'
          )
        : undefined;
      this.statusMessage = batch
        ? `Viable batch already aboard; no second harvest. ${this.getSpecimenContractMessage(batch)}`
        : `No collection: ${row.cells[3] ?? row.detail ?? 'Selected entry is unavailable'}.`;
      this.forceFullRender = true;
      return;
    }
    if (row.id.startsWith('harvest-propagules:') && this.activeEncounter) {
      this.applyEncounterCommand(this.activeEncounter, {
        kind: 'harvest',
        targetId: row.id.slice('harvest-propagules:'.length),
      });
      return;
    }
    if (row.id.startsWith('collect-organism:') && this.activeEncounter) {
      this.applyEncounterCommand(this.activeEncounter, {
        kind: 'collect',
        targetId: row.id.slice('collect-organism:'.length),
      });
      return;
    }
    if (row.id.startsWith('specimen:')) {
      const container = this.player.terrainVehicle.cargoHold.specimens?.find(
        (item) => `specimen:${item.id}` === row.id
      );
      if (container) this.openJettisonConfirmation(`rover:${row.id}`, container.volumeM3);
      return;
    }
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
      `Temp ${planet.getCurrentTemperature()} K. Gravity ${planet.gravity.toFixed(2)}g. ${planet.effectiveAtmosphere.density} atmosphere.`
    );
    const resolution = this.scanService.resolvePlanet(planet, 'mapped', 100, 'surface-map');
    this.completeMissionsForDiscovery(planet, resolution.current.level);
    this.statusMessage = 'Surface scan complete.';
    const biosphere = this.getBiosphere();
    if (biosphere?.sites.length) {
      const site = [...biosphere.sites].sort(
        (a, b) =>
          Math.hypot(surfaceLongitudeDelta(x, a.x, size), a.y - y) -
          Math.hypot(surfaceLongitudeDelta(x, b.x, size), b.y - y)
      )[0];
      this.addSurfaceNotification(
        `Biological signature: ${site.label} X${site.x} Y${site.y}. B investigates when nearby.`
      );
    }
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
    const atmosphere = planet.effectiveAtmosphere;
    const primaryGas =
      Object.entries(atmosphere.composition)
        .filter(([, percentage]) => percentage > 0)
        .sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'mixed';
    const sky =
      atmosphere.density === 'None'
        ? 'The sky is black and sharp; shadows fall without haze.'
        : `The ${primaryGas.toLowerCase()}-dominated ${atmosphere.density.toLowerCase()} atmosphere softens the horizon.`;
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
      case 'operations':
        this.openShipMenu();
        break;
      case 'missions':
        this.openMissionJournal();
        break;
      case 'science':
        this.openScienceLog();
        break;
      case 'mine':
        this.openMiningQuantitySelector();
        break;
      case 'scan':
        this.startSurfaceCursorScan();
        break;
      case 'life':
        this.enterBiologySite();
        break;
      case 'repair':
        if (this.isAtParkedShip()) this.repairRover();
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
        this.statusMessage = 'Choose Life at a biological habitat to acquire a local target.';
        break;
      case 'shoot':
        this.statusMessage = 'Choose Life at a biological habitat to acquire a local target.';
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
    const field = this.activeEncounter;
    const transferred = this.transferRoverCargoToShip();
    if (field) {
      // A field can be entered from a neighbouring regional cell. Boarding at its
      // entry places the rover at the actual ship, then releases the local view.
      this.player.position.surfaceX = field.site.x;
      this.player.position.surfaceY = field.site.y;
      this.xenobiology.snapshot.activeSiteId = null;
      this.encounterController.reset();
      this.interfaceMode.close('xenobiology');
    }
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
    if (this.stateManager.state !== 'planet' || !this.isAtParkedShip() || this.player.terrainVehicle.onFoot) {
      this.statusMessage = 'Launch requires being aboard the parked ship.';
      this.forceFullRender = true;
      return;
    }
    const autoEmbarked = this.player.terrainVehicle.deployed;
    if (autoEmbarked) {
      // Intentional convenience: launching at the ship recovers a disembarked rover first,
      // using normal embark rules so cargo overflow and sealed specimens remain aboard.
      this.dockTerrainVehicle();
    }
    this.shipMenuOpen = false;
    this.shipOperations.section = 'main';
    const launched = this.stateManager.launchFromSurfaceToOrbit();
    if (this.stateManager.statusMessage) {
      this.statusMessage = this.stateManager.statusMessage;
      this.stateManager.statusMessage = '';
    }
    if (launched && autoEmbarked) this.statusMessage = `Terrain vehicle auto-embarked. ${this.statusMessage}`;
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

  /** Matches the regional rover or a habitat's local entry to the parked ship. */
  private isAtParkedShip(): boolean {
    const field = this.activeEncounter;
    const x = field?.site.x ?? this.player.position.surfaceX;
    const y = field?.site.y ?? this.player.position.surfaceY;
    return (
      (!field || Math.hypot(field.roverX - 16, field.roverY - 21) <= 1.5) &&
      Math.floor(x) === Math.floor(this.player.terrainVehicle.shipSurfaceX) &&
      Math.floor(y) === Math.floor(this.player.terrainVehicle.shipSurfaceY)
    );
  }

  /** Returns parked ship range and bearing. */
  private getParkedShipRangeAndBearing(): { distanceKm: number; direction: string } {
    const dx = surfaceLongitudeDelta(
      this.player.position.surfaceX,
      this.player.terrainVehicle.shipSurfaceX,
      this.stateManager.currentPlanet
        ? getPlanetMapSize(this.stateManager.currentPlanet)
        : CONFIG.PLANET_MAP_BASE_SIZE
    );
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
    for (const container of [...(this.player.terrainVehicle.cargoHold.specimens ?? [])]) {
      if (
        !new SpecimenCargoSystem().transfer(
          this.player.terrainVehicle.cargoHold,
          this.player.cargoHold,
          container.id,
          this.player.ship.stasisClass ?? 0
        )
      )
        transferred += container.volumeM3;
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
      const lostContainers = this.player.terrainVehicle.cargoHold.specimens?.length ?? 0;
      this.player.terrainVehicle.cargoHold.specimens = [];
      this.statusMessage = 'Terrain vehicle fuel exhausted. Vehicle abandoned; return to the ship on foot.';
      if (lostContainers)
        this.statusMessage += ` ${lostContainers} biological containers lost with the vehicle.`;
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
    if (row.id === 'haul-manifest') {
      this.openHaulManifest();
      return;
    }
    if (row.id === 'homebound') {
      this.openHomeboundVoyage();
      return;
    }
    if (row.id === 'observatory') {
      this.openObservatory();
      return;
    }
    if (row.id === 'science') {
      this.openScienceLog();
      return;
    }
    if (row.id === 'missions' || (this.shipOperations.section === 'log' && row.id === '007')) {
      this.openMissionJournal();
      return;
    }
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
    if (itemKey.startsWith('specimen:')) {
      const specimen = this.player.cargoHold.specimens?.find((item) => `specimen:${item.id}` === itemKey);
      if (specimen) this.openJettisonConfirmation(itemKey, specimen.volumeM3);
      return;
    }
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
    if (itemKey.startsWith('specimen:') || itemKey.startsWith('rover:specimen:')) {
      const rover = itemKey.startsWith('rover:');
      const hold = rover ? this.player.terrainVehicle.cargoHold : this.player.cargoHold;
      const id = itemKey.slice(rover ? 15 : 9);
      const specimen = hold.specimens?.find((item) => item.id === id);
      if (!specimen) return 'Selected biological container is no longer aboard.';
      hold.specimens = (hold.specimens ?? []).filter((item) => item.id !== id);
      return `Disposed of whole ${specimen.kind} container: ${specimen.species.name}. Unrecoverable.`;
    }
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
    subtitle?: string;
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
        const canLaunch = this.isAtParkedShip() && !this.player.terrainVehicle.onFoot;
        const wounded = this.player.crew.filter((member) => member.hitPoints < member.maxHitPoints).length;
        const focus = getShipCompartment(this.currentShipCompartmentId);
        const homeboundAsset = findHaulHomeboundInstallation(this.infrastructureRegistry.createSnapshot());
        const homebound = homeboundAsset?.homeboundRoute ?? this.getHomeboundRoute();
        const canReturnHome = homebound && !this._heavyHaulService?.attachedTowPolicy;
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
          {
            id: 'missions',
            cells: ['Mission Journal', `${this.missionProgress.getActiveCount()} accepted contracts`],
            detail: 'Review destinations, objectives, habitat coordinates and delivery requirements.',
            cellTones: ['cyan', 'green'],
            detailTone: 'cyan',
          },
          {
            id: 'haul-manifest',
            cells: [
              'Heavy-Haul Manifest',
              this._heavyHaulService?.createSnapshot().activeTow?.stage.toUpperCase() ?? 'No external tow',
            ],
            detail:
              'External package, voyage certification, coupling, hypersleep transfer and deployment escrow.',
            cellTones: ['cyan', 'amber'],
            detailTone: 'cyan',
          },
          {
            id: 'homebound',
            cells: [
              'Homebound Travel',
              homebound
                ? canReturnHome
                  ? homebound.stationName
                  : 'Release external tow first'
                : 'No remote haul delivered',
            ],
            detail: homebound
              ? homeboundAsset?.homeboundReceipt
                ? `Automatic return completed. Original port X ${homebound.systemAddress.worldX} / Y ${homebound.systemAddress.worldY} remains available for normal navigation.`
                : `X ${homebound.systemAddress.worldX} / Y ${homebound.systemAddress.worldY}. Review time, normal fuel and hypersleep before an automatic return to the issuing port.`
              : 'Remote deliveries retain their issuing port here after payment and across reloads.',
            cellTones: ['cyan', canReturnHome ? 'green' : 'muted'],
            detailTone: canReturnHome ? 'cyan' : 'muted',
            disabled: !canReturnHome,
          },
          {
            id: 'science',
            cells: [
              'Science Log',
              `${Object.keys(this.xenobiology.snapshot.evidence).length} biological records`,
            ],
            detail:
              'Biological dossiers, return coordinates, remaining research demand and preservation requirements.',
            cellTones: ['cyan', 'green'],
            detailTone: 'cyan',
          },
          {
            id: 'observatory',
            cells: [
              'Observatory',
              this.player.ship.observatoryClass
                ? `Suite Class ${this.player.ship.observatoryClass}`
                : 'Navigation catalogue / suite not fitted',
            ],
            detail:
              'Nearby contacts, distant atmospheric evidence, radio sources and navigation destinations.',
            cellTones: ['cyan', 'green'],
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
              canLaunch
                ? this.player.terrainVehicle.deployed
                  ? 'auto-embark'
                  : 'ready'
                : 'parked ship req.',
            ],
            detail: 'Lift from the landed ship to orbital view.',
            disabled: !canLaunch,
            cellTones: ['cyan', canLaunch ? 'green' : 'amber'],
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
    const shipCargoRows = this.getCargoRows().map(
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
    const canLaunch = onSurface && atShip && !rover.onFoot;
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
          canLaunch ? (rover.deployed ? 'auto-embark' : 'ready') : 'parked ship req.',
          onSurface ? 'orbit' : 'locked',
          'Launch from landed ship to orbital view.',
        ],
        disabled: !canLaunch,
        cellTones: ['cyan', canLaunch ? 'green' : 'amber', onSurface ? 'bright' : 'muted', 'cyan'],
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
    const activeMissionCount = this.missionProgress.getActiveCount();
    const readyMissionCount = this.missionProgress.getReadyCount(this.ownedSpecimens);

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
          formatDiscoveryLevel(planet.discovery.level),
          `${planet.name} | ${planet.getRotationPeriodLabel()} rotation | ${planet.effectiveSurfaceTempMin}-${planet.effectiveSurfaceTempMax} K surface range.`,
          'Current landed body record. Full mineral details require a surface scan.'
        )
      );
    }

    rows.push(
      this.createShipLogRow(
        '007',
        'MISSION',
        readyMissionCount > 0 ? 'RETURN' : activeMissionCount > 0 ? 'ACTIVE' : 'QUIET',
        readyMissionCount > 0
          ? `${readyMissionCount} contract${readyMissionCount === 1 ? '' : 's'} ready for station hand-in.`
          : activeMissionCount > 0
            ? `${activeMissionCount} accepted mission${activeMissionCount === 1 ? '' : 's'} in ship memory.`
            : 'No active contracts. Notice boards may hold new work at starbases.',
        'Enter opens accepted contracts, destination coordinates and delivery instructions.'
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
    const missionCount = this.missionProgress.getActiveCount();
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
    if (target instanceof Starbase) return target.kind === 'automated-depot' ? 'Logistics Depot' : 'Starbase';
    if (target instanceof NavigationMarker)
      return target.kind === 'navigation-buoy'
        ? 'Nav Buoy'
        : target.kind === 'departure'
          ? 'Departure'
          : target.kind === 'pickup'
            ? 'Haul Pickup'
            : 'Deploy Site';
    return `${getStellarStageLabel(target.starType)} ${target.id}`;
  }

  /** Returns target short name. */
  private getTargetShortName(target: NavigationTarget, system: SolarSystem | null): string {
    const baseName = system ? target.name.replace(`${system.name} `, '') : target.name;
    if (!(target instanceof Planet)) return baseName;
    const moonCount = target.moons?.length ?? 0;
    const moonLabel = moonCount === 1 ? '1 moon' : `${moonCount} moons`;
    const suffix = ` (${moonLabel})`;
    return `${baseName.slice(0, Math.max(0, 22 - suffix.length))}${suffix}`;
  }

  /** Returns the compact habitation marker shown by local automatic navigation. */
  private getTargetHabitationLabel(target: NavigationTarget): string {
    if (!(target instanceof Planet) || !target.terraforming) return '-';
    return target.terraforming.stage === 'complete' ? 'COLONY' : 'T-FORM';
  }

  /** Returns a readable habitation description for the selected navigation target. */
  private getTargetHabitationDetail(target: NavigationTarget): string {
    if (target instanceof NavigationMarker)
      return target.kind === 'navigation-buoy'
        ? 'registered navigation transmitter'
        : target.kind === 'departure'
          ? 'fixed strategic departure waypoint'
          : 'contracted orbital rendezvous';
    if (target instanceof Starbase)
      return target.kind === 'automated-depot'
        ? 'uncrewed trade, fuel and basic repairs'
        : 'staffed port services';
    if (!(target instanceof Planet) || !target.terraforming) return 'no registered terraforming';
    return target.terraforming.stage === 'complete'
      ? 'complete terraformed colony'
      : 'partial terraforming project';
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
    if (target instanceof Starbase) return `starbase:${target.id}`;
    if (target instanceof NavigationMarker) return `marker:${target.id}`;
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
    const scannableObject = system.getScannableObjectNear(scanX, scanY);
    const objectThreshold = CONFIG.LANDING_DISTANCE;
    const objectDistanceSq = scannableObject
      ? this.player.distanceSqToSystemCoords(scannableObject.systemX, scannableObject.systemY)
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
      target instanceof Planet || target instanceof Starbase || target instanceof NavigationMarker
        ? 1
        : CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
    return (
      this.player.distanceSqToSystemCoords(coords.x, coords.y) < (CONFIG.LANDING_DISTANCE * multiplier) ** 2
    );
  }

  /** Closes to the actual contact, with physical clearance rather than a fraction of scan range. */
  private getTargetApproachDistance(target: NavigationTarget): number {
    if (target instanceof NavigationMarker || target instanceof Starbase) return 5e7;
    if (target instanceof Planet) return Math.max(5e7, target.diameter * 500 * 3);
    return CONFIG.LANDING_DISTANCE * CONFIG.STAR_SCAN_DISTANCE_MULTIPLIER;
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
      CONFIG.SYSTEM_MOVE_INCREMENT *
        this.getSystemCursorMoveSpeedMultiplier() *
        getTowLocalStepFactor(
          this._heavyHaulService?.attachedTowPolicy?.wetMassKg ?? 0,
          this.player.ship.engineClass
        )
    );
    this.player.position.systemX += (dx / distance) * step;
    this.player.position.systemY += (dy / distance) * step;
    this.player.render.char = this.player.render.directionGlyph;
  }

  /** Advances orbital interaction using the visual clock. */
  private _updateOrbit(deltaTime: number): string {
    const parent = this.stateManager.currentOrbitReferencePlanet;
    if (!this.stateManager.currentPlanet || !parent) return 'Orbit Error: Planet data missing.';
    return this.orbitModeState.update(parent, this.currentVisualDeltaSeconds || deltaTime);
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
    } | Grav: ${planet.gravity.toFixed(2)}g | Rot: ${planet.getRotationPeriodLabel()} | Temp: ${currentTemp}K avg ${planet.effectiveSurfaceTemp}K ${planet.effectiveSurfaceTempMin}-${planet.effectiveSurfaceTempMax}K`; // Show current temp
    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
      if (planet.scanned) {
        status += ` | Scan: ${planet.primaryResource || 'N/A'} (${planet.mineralRichness})`;
      } else {
        status += ` | Scan: ${formatDiscoveryLevel(planet.discovery.level)} (Potential: ${planet.mineralRichness})`;
      }
    } else {
      status += ` | Scan: N/A (${planet.type})`;
    }
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
      this.syncRendererLayoutInvalidation();
      const renderNow = performance.now();
      const mainRenderSignature = this.getMainRenderSignature(renderNow);
      const shouldRenderMainScene = !this.canSkipMainRender(currentState, mainRenderSignature);
      if (shouldRenderMainScene) {
        const renderPrepStart = performance.now();
        const fullCanvasRepaint = this.forceFullRender;
        this.renderer.clear(fullCanvasRepaint);

        // Instruments own the entire foreground; do not stage planet rasters underneath them.
        if (this.interfaceMode.is('observatory'))
          this.renderer.drawObservatory(this.createObservatoryModel());
        else if (!this.interfaceMode.is('haul-manifest'))
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
                if (this.orbitModeState.dossier.isOpen && this.stateManager.currentOrbitReferencePlanet) {
                  this.renderer.drawTextModalTable(
                    this.orbitModeState.createDossier(
                      this.stateManager.currentOrbitReferencePlanet,
                      this.stateManager.currentSystem?.stars ?? [],
                      this.renderer.getGridCols(),
                      this.renderer.getGridRows()
                    )
                  );
                }
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
                      encounter: this.activeEncounter
                        ? this.createCurrentEncounterView(this.activeEncounter)
                        : undefined,
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
        const field = this.activeEncounter;
        if (field && this.interfaceMode.is('xenobiology')) {
          const view = this.createCurrentEncounterView(field);
          const modal = this.encounterController.createModal(
            field,
            this.xenobiology,
            this.renderer.getGridCols(),
            this.renderer.getGridRows(),
            view.scanner,
            this.player.ship.stasisClass ?? 1,
            view.requests,
            { requests: view.missionRequests, scanner: view.scannerDashboard }
          );
          if (modal) this.renderer.drawTextModalTable(modal);
        }
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

        if (this.interfaceMode.is('mission-journal')) {
          this.renderer.drawTextModalTable(this.createMissionJournalModel());
        }
        if (this.interfaceMode.is('science-log'))
          this.renderer.drawTextModalTable(this.createScienceLogModel());
        if (this.interfaceMode.is('ship-repairs'))
          this.renderer.drawTextModalTable(this.createShipRepairModel());
        if (this.interfaceMode.is('depot-service'))
          this.renderer.drawTextModalTable(this.createDepotServiceModel());
        if (this.interfaceMode.is('survey-exchange'))
          this.renderer.drawTextModalTable(this.createFrontierTerminalModel());
        if (this.interfaceMode.is('haul-manifest'))
          this.renderer.drawTextModalTable(
            this.haulManifest.createModel(this.renderer.getGridCols(), this.renderer.getGridRows())
          );

        if (this.quantitySelector) {
          this.renderer.drawTextModalTable(createQuantitySelectorModel(this.quantitySelector));
        }

        if (this.surfaceExtractionSelector) {
          this.renderer.drawTextModalTable(this.createSurfaceExtractionSelectorModel());
        }

        if (this.jettisonConfirmation) {
          this.renderer.drawTextModalTable(this.createJettisonConfirmationModel());
        }

        if (this.galaxyMapOpen) {
          this.renderer.drawGalaxyMap(
            this.galaxyMap.createModel(
              this.systemDataGenerator.getGalaxyModel(),
              this.player.position.worldX,
              this.player.position.worldY
            )
          );
        }

        if (this.terminalDialog.isOpen)
          this.renderer.drawTerminalDialog(
            this.terminalDialog.createModel(this.renderer.getGridCols(), this.renderer.getGridRows())
          );

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
        if (this.screenTransition.isActive) this.renderer.drawScreenFade(this.screenTransition.opacity);
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

  /** Makes a canvas resize visible to the render-signature gate before it may skip a frame. */
  private syncRendererLayoutInvalidation(): void {
    if (!this.renderer.consumeLayoutInvalidation?.()) return;
    this.forceFullRender = true;
    this.lastMainRenderSignature = '';
  }

  /** Returns whether the active interface should hide foreground HUD elements. */
  private shouldSuppressHudForeground(): boolean {
    return (
      this.terminalDialog.isOpen ||
      this.screenTransition.isActive ||
      this.interfaceMode.is('haul-manifest') ||
      this.interfaceMode.is('observatory') ||
      this.interfaceMode.is('ship-repairs') ||
      this.interfaceMode.is('depot-service') ||
      this.interfaceMode.is('survey-exchange') ||
      this.interfaceMode.is('science-log') ||
      this.interfaceMode.is('mission-journal') ||
      Boolean(this.activeEncounter) ||
      this.shipMenuOpen ||
      this.targetMenuOpen ||
      this.galaxyMapOpen ||
      (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen)
    );
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
      this.terminalDialog.isOpen ||
      this.screenTransition.isActive ||
      this.interfaceMode.is('haul-manifest') ||
      this.interfaceMode.is('observatory') ||
      this.interfaceMode.is('depot-service') ||
      this.interfaceMode.is('survey-exchange') ||
      this.interfaceMode.is('science-log') ||
      this.interfaceMode.is('mission-journal') ||
      Boolean(this.activeEncounter) ||
      this.stateManager.state === 'starbase' ||
      (this.stateManager.state === 'orbit' && this.orbitModeState.dossier.isOpen) ||
      this.popupState !== 'inactive' ||
      this.targetMenuOpen ||
      this.galaxyMapOpen ||
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
      this.interfaceMode.is('ship-repairs') ||
      this.interfaceMode.is('depot-service') ||
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
    return (
      this.forceFullRender ||
      this.screenTransition.isActive ||
      now - this.lastOverlayRenderAt >= Game.OVERLAY_RENDER_INTERVAL_MS
    );
  }

  /** Returns main render signature. */
  private getMainRenderSignature(now: number = performance.now()): string {
    if (this.interfaceMode.is('survey-exchange') && !this.terminalDialog.isOpen)
      return [
        'survey-exchange',
        this.frontierTerminal.tab,
        this.frontierTerminal.selectedId,
        this.frontierTerminal.viewOffset,
        this.frontierTerminal.notice,
        this.frontierTerminal.coverage,
        this.frontierTerminal.reveal.progress,
        this.surveyData.revision,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    if (this.terminalDialog.isOpen)
      return [
        'terminal-dialog',
        this.terminalDialog.revision,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    if (this.interfaceMode.is('haul-manifest'))
      return [
        'haul-manifest',
        this.haulManifest.data?.mission?.id,
        this.haulManifest.data?.stage,
        this.haulManifest.viewOffset,
        this.haulManifest.notice,
        this.haulManifest.reveal.progress,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    if (this.interfaceMode.is('observatory'))
      return [
        'observatory',
        this.observatoryController.selectedId,
        this.observatoryController.filters.join(','),
        this.observatoryController.filterGroup,
        this.observatoryController.sort,
        this.observatoryController.detailOffset,
        this.observatoryController.notice,
        this.observatoryController.coverage,
        this.observatoryController.reveal.progress,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    if (this.interfaceMode.is('science-log'))
      return [
        'science-log',
        this.scienceLog.selectedId,
        this.scienceLog.filter,
        this.scienceLog.originIndex,
        this.scienceLog.viewOffset,
        this.scienceLog.notice,
        this.scienceLog.reveal.progress,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    if (this.interfaceMode.is('mission-journal')) {
      return [
        'mission-journal',
        this.missionJournal.selection,
        this.missionJournal.destinationIndex,
        this.missionJournal.viewOffset,
        this.missionJournal.notice,
        this.missionJournal.reveal.progress,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    }
    if (this.galaxyMapOpen) {
      const model = this.galaxyMap.createModel(
        this.systemDataGenerator.getGalaxyModel(),
        this.player.position.worldX,
        this.player.position.worldY
      );
      return [
        'galaxy-map',
        model.centerXpc.toFixed(1),
        model.centerYpc.toFixed(1),
        model.spanPc,
        this.renderer.getGridCols(),
        this.renderer.getGridRows(),
      ].join('|');
    }
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
          this.orbitModeState.dossier.isOpen
            ? `dossier:${this.orbitModeState.dossier.viewOffset}`
            : Math.floor(now / Game.ORBIT_RENDER_INTERVAL_MS),
        ].join('|');
      case 'planet':
        return [
          state,
          this.stateManager.currentPlanet?.name ?? '',
          this.player.position.surfaceX,
          this.player.position.surfaceY,
          this.player.render.char,
          this.stateManager.currentPlanet?.discovery.level ?? 'detected',
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
      `ORBIT RASTER ${stats.scaledDurationMs.toFixed(1)}ms  PIXELS ${stats.scaledPixels}  ITEMS ${stats.scaledGlyphs}`,
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
      `[Game:_render] ${stats.mode} render: ${stats.cellsDrawn} changed cells, ${stats.backgroundsDrawn} bg cells, ${stats.glyphsDrawn} glyphs, ${stats.scaledPixels} raster pixels in ${stats.durationMs.toFixed(2)}ms`
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

    const terminalForeground =
      this.interfaceMode.is('haul-manifest') || this.terminalDialog.isOpen || this.screenTransition.isActive;
    const telemetry = terminalForeground ? undefined : this.createTravelTelemetry(currentCargoTotal);
    const hasStarbase = !terminalForeground && this.stateManager.state === 'starbase';

    const actions = this.getCurrentAvailableActions();
    const commandUpdate = {
      actions,
      primaryActionId: this.choosePrimaryAction(actions)?.id,
      targetName: this.getCommandStripTargetName(),
      commandBar: this.createCommandBarModel(actions),
    };
    const statusSignature = JSON.stringify({ terminalForeground, hasStarbase, telemetry });
    if (statusSignature !== this.lastPublishedStatusSignature) {
      this.lastPublishedStatusSignature = statusSignature;
      eventManager.publish(GameEvents.STATUS_UPDATE_NEEDED, {
        message: telemetry?.notification || '',
        hasStarbase,
        telemetry,
      });
    }

    const commandSignature = JSON.stringify(commandUpdate);
    if (commandSignature !== this.lastPublishedCommandSignature) {
      this.lastPublishedCommandSignature = commandSignature;
      eventManager.publish(GameEvents.COMMAND_STRIP_UPDATE_NEEDED, commandUpdate);
    }
  }

  /** Builds persistent travel readings independently from temporary gameplay messages. */
  private createTravelTelemetry(currentCargoTotal: number): TravelTelemetryModel {
    const state = this.stateManager.state;
    const resources: TelemetryField[] = [
      {
        id: 'fuel',
        label: 'FUEL',
        value: `${this.player.resources.fuel.toFixed(0)}/${this.player.resources.maxFuel.toFixed(0)}`,
        tone:
          this.player.resources.fuel / Math.max(1, this.player.resources.maxFuel) < 0.2
            ? 'warning'
            : 'default',
      },
      {
        id: 'cargo',
        label: 'CARGO',
        value: this.formatCargoLoad(currentCargoTotal, this.player.cargoHold.capacity),
        priority: 'secondary',
      },
      {
        id: 'credits',
        label: 'CR',
        value: this.player.resources.credits.toLocaleString(),
        priority: 'optional',
      },
    ];
    const telemetry: TravelTelemetryModel = {
      mode: state,
      navigation: [],
      target: [],
      environment: [],
      resources,
      ...this.getTelemetryNotification(),
    };

    if (state === 'hyperspace') {
      const survey = this.getCurrentHyperspaceSurvey();
      const contact = this.toNavigationContact(survey.nearestSystemContact);
      const localPhenomenon =
        survey.visibleCells[Math.floor(survey.rows / 2) * survey.cols + Math.floor(survey.cols / 2)]
          ?.phenomenon;
      const movementFuelCost =
        CONFIG.HYPERSPACE_MOVE_FUEL_COST *
        getEngineFuelUseMultiplier(this.player.ship.engineClass) *
        getOperationalCapabilities(this.player.crew, this.player.ship).hyperspaceFuelMultiplier;
      const fuelReach = Math.floor(this.player.resources.fuel / Math.max(0.001, movementFuelCost));
      telemetry.mode = 'HYPERSPACE';
      telemetry.navigation = [
        {
          id: 'mode',
          label: 'NAV',
          compactLabel: 'N',
          value: 'HYPERSPACE',
          compactValue: 'HYPER',
          tone: 'signal',
        },
        {
          id: 'position',
          label: 'POS',
          value: `${this.player.position.worldX},${this.player.position.worldY}`,
          priority: 'secondary',
        },
      ];
      telemetry.target = isNavigablePhenomenon(localPhenomenon)
        ? [
            {
              id: 'contact',
              label: 'CONTACT',
              compactLabel: 'TGT',
              value: `${localPhenomenon!.name} ${localPhenomenon!.type === 'neutron-star' ? 'PULSAR' : 'ROGUE'}`,
              compactValue: localPhenomenon!.name ?? 'LOCAL CONTACT',
              tone: 'signal',
            },
            { id: 'bearing', label: 'BRG', value: 'LOCAL 0.0c', priority: 'secondary' },
          ]
        : contact
          ? [
              {
                id: 'contact',
                label: 'CONTACT',
                compactLabel: 'TGT',
                value: `${contact.name} ${contact.starType}`,
                compactValue: contact.name,
                tone: 'signal',
              },
              {
                id: 'bearing',
                label: 'BRG',
                value: `${this.formatHyperspaceBearing(contact)} ${contact.rangeCells.toFixed(1)}c`,
                priority: 'secondary',
              },
            ]
          : [
              {
                id: 'contact',
                label: 'CONTACT',
                compactLabel: 'TGT',
                value: 'NO RESOLVED CONTACT',
                compactValue: 'NO CONTACT',
                tone: 'muted',
              },
            ];
      telemetry.environment = [
        {
          id: 'medium',
          label: 'ISM',
          value: survey.medium.label,
          compactValue: COMPACT_INTERSTELLAR_MEDIUM_LABELS[survey.medium.kind],
        },
        {
          id: 'sensor',
          label: 'SENSOR',
          value: `${(survey.medium.sensorRangeMultiplier * 100).toFixed(0)}%`,
          priority: 'secondary',
        },
        {
          id: 'reach',
          label: 'RANGE',
          value: formatHyperspaceSpan(fuelReach),
          tone: 'signal',
          priority: 'secondary',
        },
      ];
      const destination = this._observatoryService?.snapshot.destination;
      if (destination) {
        const dx = destination.worldX - this.player.position.worldX;
        const dy = destination.worldY - this.player.position.worldY;
        telemetry.target = [
          {
            id: 'destination',
            label: 'DEST',
            compactLabel: 'DST',
            value: destination.name,
            compactValue: destination.name,
            tone: 'signal',
          },
          {
            id: 'destination-grid',
            label: 'GRID',
            value: `${destination.worldX},${destination.worldY}`,
            priority: 'secondary',
          },
          {
            id: 'destination-range',
            label: 'BRG',
            value: `${this.formatBearing(dx, dy)} / ${observatoryDistanceLy(this.player.position.worldX, this.player.position.worldY, destination).toFixed(1)} ly`,
            priority: 'secondary',
          },
        ];
      }
      return telemetry;
    }

    if (state === 'system') {
      const system = this.stateManager.currentSystem;
      const target = this.getSelectedTarget();
      telemetry.mode = 'SYSTEM TRAVEL';
      telemetry.navigation = [
        {
          id: 'mode',
          label: 'NAV',
          compactLabel: 'N',
          value: 'SYSTEM',
          compactValue: 'SYS',
          tone: 'signal',
        },
        {
          id: 'position',
          label: 'POS',
          value: `${this.player.position.systemX.toExponential(1)},${this.player.position.systemY.toExponential(1)}m`,
          priority: 'secondary',
        },
      ];
      telemetry.target = [
        {
          id: 'target',
          label: 'TARGET',
          value: target ? this.getTargetName(target) : system?.name || 'UNRESOLVED',
          tone: target ? 'signal' : 'muted',
        },
      ];
      telemetry.environment = [
        { id: 'system', label: 'SYSTEM', value: system?.architecture.kind || 'UNKNOWN' },
        {
          id: 'zoom',
          label: 'ZOOM',
          value: `${getSystemZoomFactor(this.currentZoomLevelIndex).toLocaleString(undefined, { maximumFractionDigits: 2 })}x`,
          priority: 'secondary',
        },
      ];
      return telemetry;
    }

    if (state === 'planet') {
      const planet = this.stateManager.currentPlanet;
      const rover = this.player.terrainVehicle;
      const roverState = !rover.available
        ? 'LOST'
        : rover.onFoot
          ? 'ON FOOT'
          : rover.deployed
            ? 'DEPLOYED'
            : 'EMBARKED';
      telemetry.mode = 'SURFACE TRAVEL';
      telemetry.navigation = [
        {
          id: 'mode',
          label: 'NAV',
          compactLabel: 'N',
          value: 'SURFACE',
          compactValue: 'SURF',
          tone: 'signal',
        },
        {
          id: 'position',
          label: 'SITE',
          value: `${this.player.position.surfaceX},${this.player.position.surfaceY}`,
          priority: 'secondary',
        },
      ];
      telemetry.target = [
        { id: 'world', label: 'WORLD', value: planet?.name || 'UNRESOLVED', tone: 'signal' },
      ];
      telemetry.environment = [
        {
          id: 'temperature',
          label: 'TEMP',
          value: planet ? `${planet.getCurrentTemperature()}K` : 'UNKNOWN',
        },
        {
          id: 'gravity',
          label: 'GRAV',
          value: planet ? `${planet.gravity.toFixed(2)}g` : 'UNKNOWN',
          priority: 'secondary',
        },
      ];
      resources.unshift({
        id: 'rover',
        label: 'ROVER',
        value: `${roverState} ${rover.fuel.toFixed(0)}/${rover.maxFuel}`,
        tone: rover.fuel <= 0 ? 'warning' : 'default',
      });
      return telemetry;
    }

    if (state === 'orbit') {
      const body = this.getSelectedOrbitBody();
      telemetry.mode = 'ORBIT';
      telemetry.navigation = [
        { id: 'mode', label: 'NAV', value: 'ORBIT', tone: 'signal' },
        {
          id: 'site',
          label: 'SITE',
          value: `${this.orbitModeState.landingX},${this.orbitModeState.landingY}`,
          priority: 'secondary',
        },
      ];
      telemetry.target = [{ id: 'body', label: 'BODY', value: body?.name || 'UNRESOLVED', tone: 'signal' }];
      telemetry.environment = [{ id: 'mode', label: 'MODE', value: this.orbitModeState.mode.toUpperCase() }];
      return telemetry;
    }

    const starbase = this.stateManager.currentStarbase;
    telemetry.mode = 'STARBASE';
    telemetry.navigation = [{ id: 'mode', label: 'NAV', value: 'DOCKED', tone: 'signal' }];
    telemetry.target = [
      { id: 'station', label: 'STATION', value: starbase?.name || 'UNRESOLVED', tone: 'signal' },
    ];
    telemetry.environment = [{ id: 'panel', label: 'PANEL', value: this.starbaseMode.getSectionLabel() }];
    return telemetry;
  }

  /** Gives player-facing action results a bounded lifetime in the event line. */
  private getTelemetryNotification(): Pick<TravelTelemetryModel, 'notification' | 'notificationTone'> {
    const message = this.statusMessage.trim();
    const isStateReading = !message || message === this.currentStateUpdateStatus;
    const now = performance.now();
    if (!isStateReading && message !== this.lastNotificationSource) {
      this.lastNotificationSource = message;
      this.notificationExpiresAt = now + 6000;
    }
    if (isStateReading || now >= this.notificationExpiresAt) {
      return {};
    }
    const lower = message.toLowerCase();
    return {
      notification: message,
      notificationTone:
        lower.includes('error') || lower.includes('cannot') || lower.includes('fail') ? 'warning' : 'signal',
    };
  }

  /** Creates command bar model. */
  private createCommandBarModel(actions: AvailableAction[]): CommandBarModel {
    if (this.interfaceMode.is('survey-exchange') && !this.terminalDialog.isOpen)
      return this.frontierTerminal.createCommandBar('survey');
    if (this.screenTransition.isActive)
      return {
        context: this.sleepingHaulCrew ? 'crew hypersleep' : 'automatic transit',
        buttons: [commandButton('transition-skip', 'Continue', 'TRANSITION_SKIP', { key: 'Enter' })],
      };
    if (this.terminalDialog.isOpen) return this.terminalDialog.createCommandBar();
    if (this.interfaceMode.is('haul-manifest')) return this.haulManifest.createCommandBar();
    if (this.interfaceMode.is('observatory'))
      return {
        context: 'observatory',
        buttons: [
          commandButton('up', 'Previous', 'MOVE_UP', { key: 'Up' }),
          commandButton('down', 'Next', 'MOVE_DOWN', { key: 'Down' }),
          commandButton('filter-group', 'Filter group', 'CYCLE_TARGET', { key: 'Tab' }),
          commandButton('filter', 'Change filter', 'OBSERVATORY_FILTER', { key: 'Right' }),
          commandButton('observe', 'Observe', 'SCAN', { key: 'V', tone: 'green' }),
          commandButton('destination', 'Destination', 'ENTER_SYSTEM', { key: 'Enter' }),
          commandButton('clear-destination', 'Clear destination', 'BIOLOGY_COLLECT', { key: 'C' }),
          commandButton('return', 'Return', 'QUIT', { key: 'Esc' }),
        ],
      };
    if (this.interfaceMode.is('ship-repairs'))
      return this.shipRepairConsole.createCommandBar(this.starbaseMode.getSectionLabel());
    if (this.interfaceMode.is('depot-service')) return this.depotConsole.createCommandBar();
    if (this.shipMenuOpen)
      return {
        context: 'ship operations',
        buttons: [
          commandButton('up', 'Previous', 'MOVE_UP', { key: 'Up' }),
          commandButton('down', 'Next', 'MOVE_DOWN', { key: 'Down' }),
          commandButton('page-up', 'Previous page', 'PAGE_UP', { key: 'PgUp' }),
          commandButton('page-down', 'Next page', 'PAGE_DOWN', { key: 'PgDn' }),
          commandButton('use', 'Use selected', 'ENTER_SYSTEM', { key: 'Enter', tone: 'green' }),
          commandButton('return', 'Return', 'QUIT', { key: 'Esc' }),
        ],
      };
    if (this.interfaceMode.is('science-log'))
      return {
        context: 'science log',
        buttons: [
          commandButton('previous', 'Previous species', 'MOVE_LEFT', { key: 'Left' }),
          commandButton('next', 'Next species', 'MOVE_RIGHT', { key: 'Right' }),
          commandButton('up', 'Scroll up', 'MOVE_UP', { key: 'Up' }),
          commandButton('down', 'Scroll down', 'MOVE_DOWN', { key: 'Down' }),
          commandButton('filter', 'Filter', 'SCAN_SYSTEM_OBJECT', { key: 'S' }),
          commandButton('origin', 'Habitat', 'BIOLOGY_SITE', { key: 'B' }),
          ...(this.getScienceLandingBody()
            ? [commandButton('landing', 'Landing site', 'ENTER_SYSTEM', { key: 'Enter', tone: 'green' })]
            : []),
          commandButton('return', 'Return', 'QUIT', { key: 'Esc' }),
        ],
      };
    if (this.interfaceMode.is('mission-journal')) {
      const selected = this.missionJournal.selected(this.getMissionJournalEntries());
      return {
        context: 'mission journal',
        targetName: selected?.mission.title,
        buttons: [
          commandButton('previous', 'Previous', 'MOVE_LEFT', { key: 'Left' }),
          commandButton('next', 'Next', 'MOVE_RIGHT', { key: 'Right' }),
          commandButton('scroll-up', 'Scroll up', 'MOVE_UP', { key: 'Up' }),
          commandButton('scroll-down', 'Scroll down', 'MOVE_DOWN', { key: 'Down' }),
          ...(selected && getMissionLandingObjectiveIndices(selected.mission).length > 1
            ? [commandButton('destination', 'Destination', 'BIOLOGY_SITE', { key: 'B' })]
            : []),
          ...(this.getJournalLandingBody(selected?.mission)
            ? [commandButton('landing', 'Landing site', 'ENTER_SYSTEM', { key: 'Enter', tone: 'green' })]
            : []),
          ...(selected?.mission.type === 'heavy-haul'
            ? [
                commandButton('haul-manifest', 'Haul manifest', 'ENTER_SYSTEM', {
                  key: 'Enter',
                  tone: 'green',
                }),
              ]
            : []),
          commandButton('return', 'Return', 'QUIT', { key: 'Esc' }),
        ],
      };
    }
    const state = this.stateManager.state;
    if (state === 'hyperspace') return this.createHyperspaceCommandBar(actions);
    if (state === 'system') return this.createSystemCommandBar(actions);
    if (state === 'planet') return this.createSurfaceCommandBar();
    return {
      context: state,
      targetName: this.getCommandStripTargetName(),
      primaryButtonId: this.choosePrimaryAction(actions)?.id,
      buttons: [
        ...actions
          .filter((action) => action.enabled)
          .slice(0, 7)
          .map((action) => commandButton(action.id, action.label, action.action, { key: action.key })),
        ...(state === 'starbase' &&
        this.stateManager.currentStarbase?.kind === 'automated-depot' &&
        this.starbaseMode.sectionId === 'missions'
          ? [commandButton('cancel-contract', 'Cancel selected job', 'DEPOT_CANCEL_CONTRACT', { key: 'C' })]
          : []),
      ],
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
        commandButton('observatory', 'Observatory', 'OBSERVATORY', { key: CONFIG.KEY_BINDINGS.OBSERVATORY }),
        commandButton('observe', 'Observe', 'OBSERVE_HYPERSPACE', {
          detail: 'Open a reticle for long-range contact observation.',
        }),
        commandButton('missions', 'Missions', 'MISSION_JOURNAL', {
          key: 'J',
          detail: 'Review accepted contracts and destination coordinates.',
        }),
        commandButton('science', 'Science log', 'SCIENCE_LOG', { key: 'X' }),
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
        commandButton('missions', 'Missions', 'MISSION_JOURNAL', {
          key: 'J',
          detail: 'Review accepted contracts and destination coordinates.',
        }),
        commandButton('science', 'Science log', 'SCIENCE_LOG', { key: 'X' }),
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
    if (this.activeEncounter) {
      if (this.jettisonConfirmation)
        return {
          context: 'specimen disposal',
          buttons: [
            commandButton('confirm', 'Confirm disposal', 'ENTER_SYSTEM', { key: 'Enter', tone: 'red' }),
            commandButton('cancel', 'Cancel', 'QUIT', { key: 'Esc' }),
          ],
        };
      if (this.roverCargoOpen)
        return {
          context: 'rover cargo',
          buttons: [
            commandButton('previous', 'Previous', 'MOVE_UP', { key: 'Up' }),
            commandButton('next', 'Next', 'MOVE_DOWN', { key: 'Down' }),
            commandButton('use', 'Use selected', 'ENTER_SYSTEM', { key: 'Enter' }),
            commandButton('close', 'Return to field', 'QUIT', { key: 'Esc' }),
          ],
        };
      const bar = this.encounterController.createCommandBar(this.activeEncounter);
      if (['drive', 'menu'].includes(this.encounterController.interaction.kind))
        bar.rightButtons = [
          commandButton('launch', 'Launch', 'ACTIVATE_LAND_LIFTOFF', {
            key: CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF,
            enabled: this.isAtParkedShip() && !rover.onFoot,
            tone: 'green',
            detail: rover.onFoot
              ? 'Board the terrain vehicle before launching.'
              : this.isAtParkedShip()
                ? 'Auto-embark the terrain vehicle and launch to orbit.'
                : 'Ship must be parked at this habitat; return to entry X16 Y21 to launch.',
          }),
        ];
      return bar;
    }
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
          key: CONFIG.KEY_BINDINGS.ROVER_CARGO,
          detail: `Terrain vehicle cargo ${this.formatCargoLoad(cargo, rover.cargoHold.capacity)} m^3.`,
        }),
        commandButton('operations', 'Operations', 'OPEN_SHIP_MENU', {
          key: CONFIG.KEY_BINDINGS.SHIP_MENU,
          detail: 'Open ship operations through the rover link.',
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
        commandButton('life', 'Life', 'ROVER_LIFE', {
          key: 'B',
          detail: 'Investigate the biological habitat at this regional position.',
        }),
        commandButton('missions', 'Missions', 'MISSION_JOURNAL', {
          key: 'J',
          detail: 'Review habitat coordinates and specimen requirements.',
        }),
        commandButton('science', 'Science log', 'SCIENCE_LOG', { key: 'X' }),
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
      const phenomenon = this.systemDataGenerator.getDeepSpacePhenomenonProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
      if (isNavigablePhenomenon(phenomenon)) return `${phenomenon.name} LOCAL`;
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
    const attachedTow = this._heavyHaulService?.attachedTowPolicy ?? null;
    if (state === 'hyperspace') {
      const currentProps = this.systemDataGenerator.getSystemMapProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
      const currentPhenomenon = this.systemDataGenerator.getDeepSpacePhenomenonProperties(
        this.player.position.worldX,
        this.player.position.worldY
      );
      const isNavigableContact = currentProps.exists || isNavigablePhenomenon(currentPhenomenon);
      const peekedSystem = isNavigableContact
        ? this.stateManager.peekAtSystem(this.player.position.worldX, this.player.position.worldY)
        : null;
      return createAvailableActions({
        state,
        attachedTow,
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
          attachedTow,
          player: this.player,
          system: null,
          planet: null,
          starbase: null,
        });
      }
      const nearbyObject = this.stateManager.getLandableTarget();
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
        attachedTow,
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
        attachedTow,
        player: this.player,
        system: this.stateManager.currentSystem,
        planet: this.stateManager.currentPlanet,
        starbase: null,
      });
    }

    if (state === 'orbit') {
      return createAvailableActions({
        state,
        attachedTow,
        player: this.player,
        system: this.stateManager.currentSystem,
        planet: this.getSelectedOrbitBody(),
        starbase: null,
      });
    }

    const market = this.stateManager.currentStarbase
      ? this.getTradeDepotManifest(this.stateManager.currentStarbase)
      : [];
    return createAvailableActions({
      state,
      attachedTow,
      player: this.player,
      system: this.stateManager.currentSystem,
      planet: null,
      starbase: this.stateManager.currentStarbase,
      currentCargoTotal: this.cargoSystem.getTotalUnits(this.player.cargoHold),
      marketHasItems: market.length > 0,
    });
  }

  /** Returns the local orbital body list from its controller. */
  private getOrbitBodies(): Planet[] {
    return this.orbitModeState.getBodies(this.stateManager.currentOrbitReferencePlanet);
  }

  /** Resolves the controller's selection against the current orbital reference. */
  private getSelectedOrbitBody(): Planet {
    return this.orbitModeState.getSelectedBody(this.stateManager.currentOrbitReferencePlanet);
  }

  /** Starts preparing the approached planet and its first two moons before orbital entry. */
  private prefetchApproachSurfaces(target: NavigationTarget): void {
    if (!(target instanceof Planet)) return;
    const system = this.stateManager.currentSystem;
    const parent = system?.getOrbitParentFor(target) ?? target;
    this.enqueueSurfacePrefetch([parent, ...parent.moons.slice(0, 2)]);
  }

  /** Prepares the primary body and first two moons on initial orbital entry. */
  private prefetchInitialOrbitSurfaces(): void {
    this.enqueueSurfacePrefetch(this.getOrbitBodies().slice(0, 3));
  }

  /** Queues unique planetary rendering data and redraws orbit as bodies become ready. */
  private enqueueSurfacePrefetch(planets: Planet[]): void {
    const unique = [...new Set(planets)];
    this.renderer.prepareOrbitAssets(unique.filter((planet) => planet.isSurfaceReady()));
    this.surfacePrefetch.enqueue(unique, (planet) => {
      this.renderer.prepareOrbitAssets([planet]);
      if (this.stateManager.state === 'orbit' && this.getOrbitBodies().includes(planet)) {
        this.forceFullRender = true;
      }
    });
  }

  /** Builds the orbital view from current location and controller state. */
  private createCurrentOrbitScreen(): OrbitScreenModel {
    const parent = this.stateManager.currentOrbitReferencePlanet ?? this.stateManager.currentPlanet!;
    const base = this.orbitModeState.createScreen(
      parent,
      this.stateManager.currentSystem?.stars ?? [],
      this.statusMessage,
      SIMULATED_SECONDS_PER_REAL_SECOND
    );
    const biosphere = this.getBiosphere(base.selectedBody);
    const surveyedBiosphere = hasDiscoveryLevel(base.selectedBody.discovery.level, 'surveyed') && biosphere;
    const landingSite =
      base.mode === 'landing' && surveyedBiosphere
        ? biosphere?.sites.find((site) => site.x === base.landingCursorX && site.y === base.landingCursorY)
        : undefined;
    // The orbital frame reserves two footer rows; keep habitat and mission hints inside it.
    const screen = {
      ...base,
      footer:
        base.mode === 'landing'
          ? [
              'Arrows site  Enter land  D dossier  J missions  Esc back',
              `${base.footer[1]}${surveyedBiosphere ? '  B habitats' : ''}`,
            ]
          : [base.footer[0], `J missions  X science log${surveyedBiosphere ? '  B habitats' : ''}`],
    };
    this.orbitModeState.dossier.biologyLines = biologySurveyReport(
      base.selectedBody.discovery,
      biosphere,
      this.xenobiology.snapshot,
      {
        temperatureK: base.selectedBody.effectiveSurfaceTemp,
        pressureBar: base.selectedBody.effectiveAtmosphere.pressure,
      },
      base.mode === 'landing' ? { x: base.landingCursorX, y: base.landingCursorY } : undefined
    );
    return {
      ...screen,
      summary: screen.summary.map((line, index) =>
        index === 4
          ? biologySurveySummary(base.selectedBody.discovery, biosphere)
          : index === 5 && landingSite
            ? habitatLandingPreview(landingSite, this.xenobiology.snapshot)[0]
            : line
      ),
    };
  }

  /** Starts worker-backed surface preparation and redraws when the current planet becomes ready. */
  private requestSurfacePreparation(planet: Planet): void {
    if (planet.isSurfaceReady() || this.preparingSurfacePlanet === planet) return;
    this.preparingSurfacePlanet = planet;
    void planet
      .prepareSurfaceReady()
      .then(() => {
        if (this.interfaceMode.is('science-log') && this.getScienceLandingBody() === planet) {
          this.scienceLog.notice = 'Terrain ready. Enter selects the recorded habitat.';
          this.forceFullRender = true;
        }
        if (
          this.interfaceMode.is('mission-journal') &&
          this.getJournalLandingBody(
            this.missionJournal.selected(this.getMissionJournalEntries())?.mission
          ) === planet
        ) {
          this.missionJournal.notice = 'Destination terrain ready. Enter selects the requested landing site.';
          this.forceFullRender = true;
        } else if (this.stateManager.currentPlanet === planet) {
          if (!this.activeEncounter) this.statusMessage = `${planet.name} surface data ready.`;
          this.forceFullRender = true;
        }
      })
      .catch((error) => {
        if (this.interfaceMode.is('science-log') && this.getScienceLandingBody() === planet) {
          this.scienceLog.notice = 'Terrain preparation failed. Enter retries.';
          this.forceFullRender = true;
        }
        if (
          this.interfaceMode.is('mission-journal') &&
          this.getJournalLandingBody(
            this.missionJournal.selected(this.getMissionJournalEntries())?.mission
          ) === planet
        ) {
          this.missionJournal.notice = 'Destination terrain preparation failed. Enter retries; Esc returns.';
          this.forceFullRender = true;
        } else if (this.stateManager.currentPlanet === planet) {
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
    if (row.disabled) {
      this.starbaseMode.alert = row.detail || 'This station service is unavailable.';
      return;
    }
    const market = this.getTradeDepotManifest(starbase);
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
      // Both panels settle against the same research ledger, never the bulk-cargo quantity selector.
      if (row.id.startsWith('sample:')) {
        this.submitBiologicalResearch(row.id, starbase);
        return;
      }
      this.starbaseMode.tradeSelectionIndex = Math.max(
        0,
        market.findIndex((item) => item.itemKey === row.id)
      );
      this.openSellQuantitySelector(row.id);
      return;
    }
    if (this.starbaseMode.sectionId === 'research') {
      if (row.id.startsWith('contract:')) this.settleBiologicalDelivery(row.id.slice(9), starbase);
      else this.submitBiologicalResearch(row.id, starbase);
      return;
    }
    if (this.starbaseMode.sectionId === 'services' && row.id === 'rover-repair') {
      this.repairRover();
      this.starbaseMode.alert = this.statusMessage;
      return;
    }
    if (this.starbaseMode.sectionId === 'services' && row.id === 'refuel') {
      this._handleRefuelRequest();
      this.starbaseMode.alert = this.statusMessage;
      return;
    }
    if (this.starbaseMode.sectionId === 'services' && row.id === 'repair') {
      this.openShipRepairConsole();
      return;
    }
    if (this.starbaseMode.sectionId === 'services' && row.id === 'medical') {
      this.openDepotServiceConsole('medical');
      return;
    }
    if (this.starbaseMode.sectionId === 'services' && row.id === 'chart-exchange') {
      this.openSurveyExchange();
      return;
    }
    if (
      this.starbaseMode.sectionId === 'services' &&
      row.id === 'resources' &&
      starbase.kind === 'automated-depot'
    ) {
      const system = this.stateManager.currentSystem;
      if (!system) return;
      this.prepareSystemDepots(system);
      const record = this.depotService.getRecord(starbase.id);
      if (record)
        this.showTerminalDialog(
          createDepotResourceDialog(
            starbase.name,
            record,
            Object.fromEntries(
              this.starbaseCommerce.getManifest(starbase.id).map((item) => [item.itemKey, item.units])
            )
          )
        );
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
    if (this.starbaseMode.sectionId === 'shipyard' && row.id === 'shipyard:repair') {
      this.openShipRepairConsole();
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
    if (optionId === 'shipyard:repair') {
      this.openShipRepairConsole();
      return;
    }
    const stationKey = this.getStationPersistenceKey(this.stateManager.currentStarbase);
    const profile = getStarbaseShipyardProfile(stationKey);
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
    if (row.id === 'mission-journal') {
      this.openMissionJournal();
      return;
    }
    const system = this.stateManager.currentSystem;
    if (!system) {
      this.starbaseMode.alert = 'Mission board unavailable: local system record missing.';
      return;
    }

    const mission = this.getCurrentStarbaseMissions(starbase).find((candidate) => candidate.id === row.id);
    if (!mission) {
      this.starbaseMode.alert = row.detail || 'No contract selected.';
      return;
    }

    if (mission.type === 'heavy-haul') {
      this.openHaulManifest(mission);
      return;
    }

    const status = this.missionProgress.getStatus(mission, this.ownedSpecimens);
    if (mission.sponsor === 'robotic-depot' && status === 'READY') {
      this.performDepotContract(mission.id, 'settle');
      return;
    }
    if (status === 'COMPLETE') {
      this.starbaseMode.alert = formatMissionDetail(mission, status);
      return;
    }
    if (status === 'READY') {
      if (mission.type === 'xenobiology') {
        this.settleBiologicalDelivery(mission.id, starbase);
        return;
      }
      const handedIn = this.missionProgress.handIn(mission.id, starbase.name, starbase.id);
      if (!handedIn) {
        this.starbaseMode.alert = `Telemetry is complete. Return to ${mission.originStarbaseName} for settlement.`;
        return;
      }
      this.player.resources.credits += handedIn.rewardCredits;
      this.player.awardCrewExperience('communication', 12);
      this.player.awardCrewExperience('astroscience', 8);
      this.starbaseMode.alert = `Contract settled: ${handedIn.title}. Payment ${handedIn.rewardCredits.toLocaleString()} Cr.`;
      this.statusMessage = this.starbaseMode.alert;
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: handedIn.rewardCredits,
      });
      return;
    }
    if (status === 'ACTIVE') {
      if (mission.type === 'xenobiology') this.settleBiologicalDelivery(mission.id, starbase);
      else this.starbaseMode.alert = formatMissionDetail(mission, status);
      return;
    }

    this.showTerminalDialog(createMissionAcceptanceDialog(mission, starbase.id));
  }

  /** Rechecks the issuer and offer before applying an explicit Yes to a normal mission. */
  private confirmMissionAcceptance(mission: StarbaseMission, stationId: string): void {
    const station = this.stateManager.currentStarbase;
    if (
      this.stateManager.state !== 'starbase' ||
      !station ||
      station.id !== stationId ||
      !this.getCurrentStarbaseMissions(station).some((offer) => offer.id === mission.id) ||
      this.missionProgress.getStatus(mission, this.ownedSpecimens) !== 'AVAILABLE' ||
      (mission.sponsor !== 'robotic-depot' && !this.missionProgress.accept(mission))
    ) {
      this.showTerminalDialog(
        createMissionStatusDialog(mission, 'This offer is no longer available at the issuing station.', false)
      );
      return;
    }
    if (mission.sponsor === 'robotic-depot') {
      const system = this.stateManager.currentSystem;
      if (!system) return;
      const result = this.depotContracts.accept(mission, station, system, (outcome) =>
        this.checkpointDepotContract(outcome)
      );
      this.statusMessage = this.starbaseMode.alert = result.message;
      this.showTerminalDialog(createMissionStatusDialog(mission, result.message, result.ok));
      return;
    }
    for (const evidence of Object.values(this.xenobiology.snapshot.evidence)) {
      for (const origin of evidence.origins ?? [])
        if (origin.level !== undefined)
          this.missionProgress.recordBiologicalEvidence(
            evidence.species.id,
            origin.surface.siteId,
            origin.level
          );
      for (const episode of evidence.behaviourObservations ?? [])
        this.missionProgress.recordBehaviourEvidence(evidence.species.id, episode.siteId, episode.kind);
    }
    this.starbaseMode.alert = `Accepted: ${mission.title}. ${mission.objectives[0]?.targetLabel ?? 'Review contract objectives'}.`;
    this.statusMessage = this.starbaseMode.alert;
    this.showTerminalDialog(createMissionStatusDialog(mission, this.starbaseMode.alert, true));
  }

  /** Reads the dedicated robot board or prepares staffed-port offers, retaining authoritative accepted terms. */
  private getCurrentStarbaseMissions(starbase: Starbase): StarbaseMission[] {
    const system = this.stateManager.currentSystem;
    if (!system) return [];
    if (starbase.kind === 'automated-depot') {
      const combined = new Map(
        this.depotContracts.list(starbase, system).map((mission) => [mission.id, mission])
      );
      for (const mission of this.missionProgress.getStationMissions(starbase.name, starbase.id))
        combined.set(mission.id, mission);
      const order = new Map(
        (this.depotService.getRecord(starbase.id)?.jobs?.offers ?? []).map((offer, index) => [
          offer.id,
          index,
        ])
      );
      // Acceptance replaces the selected offer in place; it must not move that row to the end of the board.
      return [...combined.values()].sort(
        (a, b) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size)
      );
    }
    const biospheres: BiosphereDefinition[] = [];
    const pending: Planet[] = [];
    for (const { planet } of getSystemPlanetPaths(system)) {
      const biosphere = this.getBiosphere(planet);
      if (!biosphere) continue;
      biospheres.push(biosphere);
      if (!planet.isSurfaceReady()) pending.push(planet);
    }
    // Use the existing serialized worker queue. Board rendering never invokes synchronous terrain getters.
    this.surfacePrefetch.enqueue(pending.slice(0, 2), () => {
      if (this.stateManager.state === 'starbase' && this.stateManager.currentSystem === system)
        this.forceFullRender = true;
    });
    const contracts = createBiologicalContracts(
      starbase,
      system.name,
      biospheres,
      this.xenobiology.snapshot.fields,
      this.ownedSpecimens,
      this.xenobiology
    );
    const missions = generateStarbaseMissions(starbase, system);
    const haul = this.heavyHaulService.createSnapshot();
    missions.push(
      ...this.haulOffers.list(
        system,
        starbase,
        haul.retiredMissionIds,
        this.missionProgress.getCompletedMissionIds(),
        this.infrastructureRegistry
      )
    );
    for (const contract of contracts) missions.push(resolveMissionNavigation(contract, system, biospheres));
    this.missionProgress.resolveNavigation(system, biospheres);
    const offers = selectStationMissionOffers(
      this.gameSeedPRNG.getInitialSeed(),
      starbase,
      systemAddress(system),
      missions
    );
    // Accepted terms stay visible even if a port's offer budget or local field availability changes.
    const combined = new Map(offers.map((mission) => [mission.id, mission]));
    for (const mission of this.missionProgress.getStationMissions(starbase.name, starbase.id))
      combined.set(mission.id, mission);
    return [...combined.values()];
  }

  /** Persists mission progression, cargo, payment, stock and sponsor escrow as one prospective outcome. */
  private checkpointDepotContract(outcome: DepotContractCheckpoint): void {
    if (!this.journeyCheckpointWriter) return;
    const save = this.createSaveGame();
    this.journeyCheckpointWriter({
      ...save,
      ...outcome.missions,
      depots: outcome.depots,
      economy: outcome.economy,
      player: { ...save.player, resources: outcome.resources, cargoHold: outcome.cargoHold },
    });
  }

  /** Keeps cancellation explicit and separate from Esc, which still departs the station. */
  private reviewDepotCancellation(missionId?: string): void {
    const mission = missionId && this.missionProgress.getMission(missionId);
    if (!mission || mission.sponsor !== 'robotic-depot') return;
    this.showTerminalDialog({
      title: 'CANCEL ROBOT CONTRACT',
      kind: 'confirmation',
      defaultYes: false,
      intent: { kind: 'depot-contract', action: 'cancel', missionId: mission.id },
      lines: [
        { segments: [{ text: mission.title, tone: 'cyan', font: 'thick' }] },
        {
          segments: [
            {
              text: 'Release sponsor escrow and withdraw this job? No payment or cargo transfer.',
              tone: 'amber',
              font: 'thin',
            },
          ],
        },
        {
          segments: [
            {
              text: 'The current offer is retired until the next board refresh.',
              tone: 'muted',
              font: 'thin',
            },
          ],
        },
      ],
    });
  }

  /** Commits funded robot handoffs and publishes only the final receipt and credit/cargo effects. */
  private performDepotContract(missionId: string, action: 'settle' | 'cancel'): void {
    const station = this.stateManager.currentStarbase;
    if (this.stateManager.state !== 'starbase' || station?.kind !== 'automated-depot') return;
    const mission = this.missionProgress.getMission(missionId);
    const result: DepotContractResult =
      action === 'settle'
        ? this.depotContracts.settle(missionId, station, (outcome) => this.checkpointDepotContract(outcome))
        : this.depotContracts.cancel(missionId, station, (outcome) => this.checkpointDepotContract(outcome));
    this.statusMessage = this.starbaseMode.alert = result.message;
    if (result.ok && result.credits)
      eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
        newCredits: this.player.resources.credits,
        amountChanged: result.credits,
      });
    if (result.ok && action === 'settle')
      for (const objective of mission?.objectives ?? [])
        if (objective.kind === 'delivery')
          eventManager.publish(GameEvents.PLAYER_CARGO_REMOVED, {
            elementKey: objective.itemKey,
            amountRemoved: objective.quantity,
          });
    this.showTerminalDialog({
      title: result.ok
        ? action === 'settle'
          ? 'ROBOT CONTRACT SETTLED'
          : 'CONTRACT CANCELLED'
        : 'HANDOFF REFUSED',
      kind: 'message',
      caution: !result.ok,
      lines: [{ segments: [{ text: result.message, tone: result.ok ? 'green' : 'red', font: 'thin' }] }],
    });
  }

  /** Delegates atomic physical delivery, publishing credit and crew effects only after all owners commit. */
  private settleBiologicalDelivery(missionId: string, starbase: Starbase): void {
    const result = deliverBiologicalContract(
      this.missionProgress,
      this.xenobiology,
      {
        station: starbase,
        holds: [this.player.cargoHold, this.player.terrainVehicle.cargoHold],
        resources: this.player.resources,
      },
      missionId
    );
    this.statusMessage = this.starbaseMode.alert = result.message;
    this.forceFullRender = true;
    if (!result.ok) return;
    this.player.awardCrewExperience('communication', 12);
    this.player.awardCrewExperience('astroscience', 8);
    eventManager.publish(GameEvents.PLAYER_CREDITS_CHANGED, {
      newCredits: this.player.resources.credits,
      amountChanged: result.credits,
    });
  }

  /** Puts current cargo readiness before the longer briefing on both station contract panels. */
  private getMissionDetailSegments(mission: StarbaseMission, status: MissionStatus): TextDashboardSegment[] {
    const reasons =
      status === 'ACTIVE'
        ? Object.values(this.missionProgress.getObjectiveShortfalls(mission, this.ownedSpecimens))
        : [];
    const readiness =
      status === 'READY'
        ? `CLAIMABLE: all contributions aboard or recorded. Enter claims payment at ${mission.originStarbaseName}. `
        : reasons.length
          ? `OUTSTANDING: ${reasons.join(' ')} `
          : '';
    return [
      ...(readiness
        ? [
            {
              text: readiness,
              tone: 'amber' as const,
              font: 'thin' as const,
            },
          ]
        : []),
      ...formatMissionDetailSegments(mission, status),
    ];
  }

  /** Returns starbase rows. */
  private getStarbaseRows(starbase: Starbase, sectionId: StarbaseSectionId): StarbaseTableRow[] {
    const stationKey = this.getStationPersistenceKey(starbase);
    const market = this.getTradeDepotManifest(starbase);
    switch (sectionId) {
      case 'overview':
        const serviceRows: StarbaseTableRow[] = starbase.serviceNotice
          ? [
              {
                id: 'commissioning-status',
                cells: ['Robotic services', 'Finite supplies / no staff required'],
                detail: starbase.serviceNotice,
                cellTones: ['cyan', 'amber'],
                detailTone: 'amber',
                disabled: true,
              },
            ]
          : [];
        return [
          ...serviceRows,
          ...getStationSections(starbase)
            .filter((section) => section.id !== 'overview')
            .map((section) => ({
              id: section.id,
              cells: [section.label, this.getSectionStatus(section.id)],
              detail: `${this.getSectionSummary(section.id)} Enter opens ${section.label}.`,
            })),
        ];
      case 'cargo':
        return this.getCargoRows();
      case 'research':
        return [
          {
            id: 'science-log',
            cells: ['Science Log', 'READ', '', 'Ship records'],
            detail: 'Enter opens biological evidence, handling requirements and recorded return sites.',
          },
          ...this.missionProgress
            .getStationMissions(starbase.name, starbase.id)
            .filter((mission) => mission.type === 'xenobiology')
            .map((mission) => ({
              id: `contract:${mission.id}`,
              cells: [
                mission.title,
                biologicalRequirement(mission),
                `${mission.rewardCredits} Cr + research`,
                getMissionStatusLabel(this.missionProgress.getStatus(mission, this.ownedSpecimens)),
              ],
              cellTones:
                this.missionProgress.getStatus(mission, this.ownedSpecimens) === 'READY'
                  ? (['green', 'green', 'green', 'amber'] as TextTone[])
                  : undefined,
              detail: `${formatMissionDetail(mission, this.missionProgress.getStatus(mission, this.ownedSpecimens))} Enter submits all required contributions together; incomplete requests consume nothing.`,
              detailSegments: [
                ...this.getMissionDetailSegments(
                  mission,
                  this.missionProgress.getStatus(mission, this.ownedSpecimens)
                ),
                {
                  text: ' Enter submits all required contributions together; incomplete requests consume nothing.',
                  font: 'thin' as const,
                },
              ],
            })),
          ...researchRows(this.xenobiology, this.ownedSpecimens),
        ];
      case 'buy':
        return market.map((item) => ({
          id: item.itemKey,
          cells: [item.name, String(item.units), String(item.buyPrice), item.category],
          detail: item.description,
        }));
      case 'sell':
        const commodities = Object.entries(this.player.cargoHold.items)
          .filter(([, amount]) => amount > 0)
          .map(([itemKey, amount]) => {
            const quote = this.starbaseCommerce.getTradeQuote(stationKey, itemKey);
            return {
              id: itemKey,
              cells: [
                quote?.name ?? itemKey,
                this.formatCargoAmount(amount),
                quote ? String(quote.sellPrice) : '--',
                quote?.category ?? 'unassayed',
              ],
              detail: quote?.description ?? 'Station assay cannot identify or purchase this cargo.',
              disabled: !quote,
            };
          });
        const sales = [
          ...commodities,
          ...specimenSaleRows(
            this.player.cargoHold.specimens ?? [],
            this.xenobiology,
            starbase.kind !== 'automated-depot'
          ),
          ...specimenSaleRows(
            this.player.terrainVehicle.cargoHold.specimens ?? [],
            this.xenobiology,
            starbase.kind !== 'automated-depot',
            'rover'
          ),
        ];
        return sales.map((row) => {
          const container = this.ownedSpecimens.find((entry) => `sample:${entry.id}` === row.id);
          if (!container) return row;
          const request = this.missionProgress
            .getSpecimenRequests(container.species.id, container.siteId)
            .find((mission) =>
              mission.objectives.some(
                (objective) => objective.kind === 'specimen' && matchesSpecimenObjective(objective, container)
              )
            );
          if (!request) return row;
          return {
            ...row,
            detail: `${row.detail} Contract match: deliver through Research or Missions at ${request.originStarbaseName} for ${request.rewardCredits} Cr + research. Ordinary sale does not fulfil the request.`,
          };
        });
      case 'services':
        const commissioningFuel = this.stateManager.currentSystem
          ? (this.infrastructureRegistry
              .at(systemAddress(this.stateManager.currentSystem))
              .find((asset) => asset.assetId === starbase.id)?.commissioningFuelRemainingUnits ?? 0)
          : 0;
        const repairQuote = createRepairQuotes(this.player, starbase.capabilities.repairs === 'basic')[0];
        if (starbase.kind === 'automated-depot')
          return createDepotServiceRows(
            this.depotService.quote(starbase.id, 'repair', 'all'),
            this.depotService.quote(starbase.id, 'fuel', 'fuel'),
            commissioningFuel,
            starbase.capabilities.medical ? this.depotService.quote(starbase.id, 'medical', 'all') : undefined
          );
        return [
          {
            id: 'rover-repair',
            cells: [
              'Rover armour repair',
              `${Math.ceil((100 - (this.player.terrainVehicle.integrity ?? 100)) * ROVER_REPAIR_COST_PER_POINT)} Cr`,
              `${this.player.terrainVehicle.integrity ?? 100}%`,
              'Restore terrain vehicle integrity.',
            ],
            disabled: (this.player.terrainVehicle.integrity ?? 100) >= 100,
          },
          {
            id: 'refuel',
            cells: [
              'D/He3 reactor refuel',
              commissioningFuel > 0
                ? 'Contractor allowance'
                : `${(1 / CONFIG.FUEL_PER_CREDIT).toFixed(2)}/fuel`,
              'Available',
              commissioningFuel > 0
                ? `${commissioningFuel.toFixed(0)} units free / normal reactor tank only`
                : 'Uses carried He3 + deuterium first, then station fuel stores.',
            ],
          },
          {
            id: 'repair',
            cells: [
              `${starbase.capabilities.repairs === 'full' ? 'Full' : 'Basic'} repair control`,
              `${repairQuote.cost.toLocaleString()} Cr`,
              'Available',
              starbase.capabilities.repairs === 'full'
                ? 'Inspect and restore hull, equipment and terrain vehicle.'
                : 'Drone restoration of hull and rover / no equipment refits.',
            ],
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
        return [
          {
            id: 'mission-journal',
            cells: [
              'Ship mission journal',
              '--',
              '--',
              `${this.missionProgress.getActiveCount()} active`,
              'All accepted contracts and destination coordinates',
            ],
            detail: 'Enter opens the ship mission journal. J is available away from stations too.',
          },
          ...this.getCurrentStarbaseMissions(starbase).map((mission) => {
            const status = this.missionProgress.getStatus(mission, this.ownedSpecimens);
            const progress = this.missionProgress.getObjectiveCounts(mission, this.ownedSpecimens);
            return {
              id: mission.id,
              cells: [
                mission.title,
                `${mission.rewardCredits} Cr`,
                mission.risk,
                status === 'ACTIVE'
                  ? mission.type === 'heavy-haul' &&
                    this.heavyHaulService.createSnapshot().activeTow?.stage === 'arrived'
                    ? 'DEPLOY READY'
                    : `ACTIVE ${progress.completed}/${progress.total}`
                  : getMissionStatusLabel(status),
                mission.summary,
              ],
              detail: formatMissionDetail(mission, status),
              detailSegments: this.getMissionDetailSegments(mission, status),
              cellTones:
                status === 'READY'
                  ? (['green', 'green', 'green', 'amber', 'green'] as TextTone[])
                  : undefined,
            };
          }),
        ];
      case 'shipyard':
        const profile = getStarbaseShipyardProfile(stationKey);
        const repair = createRepairQuotes(this.player)[0];
        return [
          {
            id: 'shipyard:repair',
            cells: ['Repairs / diagnostics', `${repair.cost.toLocaleString()} Cr`, 'OPEN', repair.condition],
            detail:
              'Hull, ship systems and terrain vehicle: inspect condition and authorise individual repairs or complete restoration.',
            tone: 'amber',
            cellTones: ['amber', 'amber', 'green', 'cyan'],
            detailTone: 'cyan',
          },
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
          ...createShipyardUpgradeOptions(this.player.ship, profile)
            .filter((option) => option.id !== 'shipyard:repair')
            .map((option) => ({
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
        ];
      case 'crew':
        return this.getCrewRows(starbase);
    }
  }

  /** Returns cargo rows. */
  private getCargoRows(): StarbaseTableRow[] {
    const specimens = specimenRows(this.player.cargoHold.specimens ?? [], this.xenobiology);
    const bulk = this.getCargoRowsForHold(this.player.cargoHold.items, 'ship');
    return specimens.length ? [...bulk.filter((row) => !row.disabled), ...specimens] : bulk;
  }

  /** Returns shipyard refit rows. */
  private getShipyardRefitRows(starbase: Starbase): StarbaseTableRow[] {
    const ship = this.player.ship;
    const stats = getShipDerivedStats(ship);
    const profile = getStarbaseShipyardProfile(this.getStationPersistenceKey(starbase));
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
          'Drive classes 2-3 are listed below where this yard can certify them. Reactor efficiency and haul capability improve; ordinary cursor speed is unchanged.',
        disabled: true,
      },
      {
        id: 'refit:tow-coupler',
        cells: [
          'External coupler',
          'See below',
          '--',
          (ship.towCouplerClass ?? 0) > 0
            ? `Class ${ship.towCouplerClass}; ${TOW_COUPLERS.find((entry) => entry.equipmentClass === ship.towCouplerClass)?.maximumMassKg.toLocaleString()} kg structural rating`
            : 'Not fitted; external hull mount',
        ],
        detail:
          'Structural rating and fitted drive jointly limit tow mass. Contractor support is separate from ship fuel and cargo.',
        disabled: true,
      },
      {
        id: 'refit:hypersleep',
        cells: [
          'Crew hypersleep',
          'See below',
          '--',
          `${getFunctionalHypersleepBerths(ship)} functional berths / ${this.player.crew.filter((member) => member.hitPoints > 0).length} living crew`,
        ],
        detail:
          'One special-purpose bay supplies crew suspension. Biological specimen stasis does not provide crew berths.',
        disabled: true,
      },
      {
        id: 'refit:survey',
        cells: [
          'Survey suite',
          '--',
          '--',
          `Class ${ship.surveyEquipmentClass}; sensor rating ${stats.sensorRating}`,
        ],
        detail:
          'Integrated spectrometry, terrain radar, and sample analysis. Higher classes improve scan confidence and extraction throughput.',
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
            ? 'Open Repairs / diagnostics at the top of Shipyard to inspect and authorise work orders.'
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
        ? this.starbaseCommerce.getTradeQuote(
            this.getStationPersistenceKey(this.stateManager.currentStarbase),
            itemKey
          )
        : null;
      const value = (marketItem?.sellPrice ?? info?.baseValue ?? 1) * amount;
      return {
        id: itemKey,
        cells: [
          info?.name ?? itemKey,
          this.formatCargoAmount(amount),
          value.toFixed(1),
          marketItem?.category ?? 'mineral',
        ],
        detail: `Estimated lot value ${value.toFixed(1)} Cr.`,
      };
    });
  }

  /** Returns section status. */
  private getSectionStatus(sectionId: StarbaseSectionId): string {
    if (sectionId === 'sell')
      return this.cargoSystem.getTotalUnits(this.player.cargoHold) > 0 ||
        (this.player.terrainVehicle.cargoHold.specimens?.length ?? 0) > 0
        ? 'Ready'
        : 'No cargo';
    if (sectionId === 'missions') {
      const active = this.missionProgress.getActiveCount();
      const ready = this.missionProgress.getReadyCount(this.ownedSpecimens);
      if (ready > 0) return `${ready} Ready`;
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
      sell: 'Sell commodity lots and sealed specimens; biological awards follow scientific demand.',
      research: 'Submit xenobiological data and sealed specimens.',
      services: 'Repair and refuel; robotic medical care at automated depots.',
      notices: 'Read local port bulletins.',
      missions: 'Accept local scan and charting contracts.',
      shipyard: 'Drive refits, tow couplers, crew hypersleep, cargo pods, and defensive fittings.',
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
    return generateRecruitCandidates(
      this.getStationPersistenceKey(starbase),
      this.gameSeedPRNG.getInitialSeed()
    );
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
    const stationKey = this.getStationPersistenceKey(this.stateManager.currentStarbase);
    let result;
    if (totalUnitsSold <= 0) {
      result = this.starbaseCommerce.buyNext(stationKey, this.starbaseMode.tradeSelectionIndex);
      this.starbaseMode.tradeSelectionIndex = result.nextSelectionIndex;
    } else {
      result = this.starbaseCommerce.sellAll(stationKey);
    }
    this.statusMessage = result.message;
    this.publishCommerceEffects(result.effects);
    this._publishStatusUpdate();
  }

  /** Returns trade depot manifest. */
  private getTradeDepotManifest(starbase: Starbase): TradeDepotItem[] {
    return this.starbaseCommerce.getManifest(this.getStationPersistenceKey(starbase));
  }

  /** Returns the stable station key used by local services and persistent economy state. */
  private getStationPersistenceKey(starbase: Starbase | null): string {
    if (!starbase) return 'default-station';
    this.starbaseCommerce.registerStation(starbase.id || starbase.name, starbase.kind);
    return starbase.id || starbase.name;
  }

  /** Returns depot purchase limit. */
  private getDepotPurchaseLimit(itemKey: string, rawLimit: number): number {
    return this.starbaseCommerce.getPurchaseLimit(itemKey, rawLimit);
  }

  /** Opens buy quantity selector. */
  private openBuyQuantitySelector(itemKey: string): void {
    const starbase = this.stateManager.currentStarbase;
    const item = starbase
      ? this.getTradeDepotManifest(starbase).find((candidate) => candidate.itemKey === itemKey)
      : null;
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
    const item = this.starbaseCommerce.getTradeQuote(
      this.getStationPersistenceKey(this.stateManager.currentStarbase),
      itemKey
    );
    const held = this.player.cargoHold.items[itemKey] || 0;
    const name = item?.name ?? this.getTradeItemInfo(itemKey)?.name ?? itemKey;
    if (held <= 0) {
      this.starbaseMode.alert = `No ${name} in cargo.`;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    if (!item) {
      this.starbaseMode.alert = `Station assay cannot identify ${name}.`;
      this.statusMessage = this.starbaseMode.alert;
      return;
    }
    this.openQuantitySelector(
      createQuantitySelector({
        title: 'Sell Cargo',
        subject: `${name} | ${item.sellPrice} Cr/m^3`,
        detail: `${held * item.sellPrice} Cr max return; station resale ${item.buyPrice} Cr/m^3`,
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
      this.getStationPersistenceKey(this.stateManager.currentStarbase),
      itemKey,
      amount
    );
    this.publishCommerceEffects(result.effects);
    return result.message;
  }

  /** Sells depot item. */
  private sellDepotItem(itemKey: string, amount: number): string {
    const result = this.starbaseCommerce.sellItem(
      this.getStationPersistenceKey(this.stateManager.currentStarbase),
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

    const station = this.stateManager.currentStarbase;
    const system = this.stateManager.currentSystem;
    const allowance = system
      ? (this.infrastructureRegistry.at(systemAddress(system)).find((asset) => asset.assetId === station.id)
          ?.commissioningFuelRemainingUnits ?? 0)
      : 0;
    if (allowance > 0 && this.player.resources.fuel < this.player.resources.maxFuel) {
      const result = commitHaulChange(
        prepareCommissioningRefill(this.createSaveGame(), station.id),
        this.journeyCheckpointWriter,
        (save) => this.applyHaulChange(save)
      );
      this.statusMessage = this.starbaseMode.alert = result.message;
      this._publishStatusUpdate();
      return;
    }
    if (station.kind === 'automated-depot') {
      this.openDepotServiceConsole('fuel');
      this.statusMessage = 'Robotic fuel loading: review feedstock and authorise the quote.';
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
