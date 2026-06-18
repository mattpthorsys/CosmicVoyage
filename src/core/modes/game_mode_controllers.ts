import { CONFIG } from '../../config';
import { OrbitInteractionMode } from '../orbit_ui';
import { StarbaseSectionId } from '../starbase_ui';

export type TravelObserveCursor = { mode: 'hyperspace' | 'system'; dx: number; dy: number };

export type ShipMenuSection =
  | 'main'
  | 'deck'
  | 'stations'
  | 'cargo'
  | 'crew'
  | 'status'
  | 'log'
  | 'rover'
  | 'jettison';

export class TravelModeController {
  currentTargetIndex = 0;
  currentTargetSignature = '';
  approachTargetSignature: string | null = null;
  commandMoving = true;
  commandSelection = 0;
  observeCursor: TravelObserveCursor | null = null;
  targetMenuOpen = false;
  targetMenuSelection = 0;
  targetMenuOffset = 0;

  resetForState(state: 'hyperspace' | 'system' | 'orbit' | 'planet' | 'starbase'): void {
    this.currentTargetIndex = 0;
    this.currentTargetSignature = '';
    this.approachTargetSignature = null;
    this.observeCursor = null;
    this.targetMenuOpen = false;
    if (state === 'hyperspace' || state === 'system') {
      this.commandMoving = true;
      this.commandSelection = 0;
    }
  }
}

export class OrbitModeController {
  selectedBodyIndex = 0;
  mode: OrbitInteractionMode = 'overview';
  landingX = Math.floor(CONFIG.PLANET_MAP_BASE_SIZE / 2);
  landingY = Math.floor(CONFIG.PLANET_MAP_BASE_SIZE / 2);
  alert = '';
  elapsedSeconds = 0;

  reset(selectedBodyIndex = 0, mapSize = CONFIG.PLANET_MAP_BASE_SIZE): void {
    this.selectedBodyIndex = Math.max(0, selectedBodyIndex);
    this.mode = 'overview';
    this.landingX = Math.floor(mapSize / 2);
    this.landingY = Math.floor(mapSize / 2);
    this.alert = '';
    this.elapsedSeconds = 0;
  }
}

export class SurfaceModeController {
  roverMenuSelection = 0;
  roverCargoOpen = false;
  roverCargoSelection = 0;
  roverCargoOffset = 0;
  mapExpanded = false;
  legendOpen = false;
  legendSelection = 0;
  legendOffset = 0;
  scanCursor: { dx: number; dy: number } | null = null;
  notifications: string[] = [];

  closeTransientInterfaces(): void {
    this.roverCargoOpen = false;
    this.mapExpanded = false;
    this.legendOpen = false;
    this.scanCursor = null;
  }

  resetForDeparture(): void {
    this.closeTransientInterfaces();
    this.notifications = [];
  }
}

export class StarbaseModeController {
  tradeSelectionIndex = 0;
  sectionId: StarbaseSectionId = 'overview';
  selectionBySection: Record<string, number> = {};
  offsetBySection: Record<string, number> = {};
  alert = '';

  reset(): void {
    this.sectionId = 'overview';
    this.alert = '';
  }
}

export class ShipOperationsController {
  open = false;
  section: ShipMenuSection = 'main';
  selection = 0;
  offset = 0;
  selectionBySection: Partial<Record<ShipMenuSection, number>> = {};
  offsetBySection: Partial<Record<ShipMenuSection, number>> = {};
  jettisonItemKey: string | null = null;

  close(): void {
    this.open = false;
    this.section = 'main';
    this.selection = 0;
    this.offset = 0;
    this.selectionBySection = {};
    this.offsetBySection = {};
    this.jettisonItemKey = null;
  }
}

export class GameModeDispatcher {
  dispatch<T>(
    state: 'hyperspace' | 'system' | 'orbit' | 'planet' | 'starbase',
    handlers: Record<'hyperspace' | 'system' | 'orbit' | 'planet' | 'starbase', () => T>
  ): T {
    return handlers[state]();
  }
}
