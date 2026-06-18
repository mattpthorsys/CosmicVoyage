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
  targetMenuSelection = 0;
  targetMenuOffset = 0;

  resetForState(state: 'hyperspace' | 'system' | 'orbit' | 'planet' | 'starbase'): void {
    this.currentTargetIndex = 0;
    this.currentTargetSignature = '';
    this.approachTargetSignature = null;
    this.observeCursor = null;
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
  roverCargoSelection = 0;
  roverCargoOffset = 0;
  mapExpanded = false;
  legendSelection = 0;
  legendOffset = 0;
  scanCursor: { dx: number; dy: number } | null = null;
  notifications: string[] = [];

  closeTransientInterfaces(): void {
    this.mapExpanded = false;
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
  section: ShipMenuSection = 'main';
  selection = 0;
  offset = 0;
  selectionBySection: Partial<Record<ShipMenuSection, number>> = {};
  offsetBySection: Partial<Record<ShipMenuSection, number>> = {};
  jettisonItemKey: string | null = null;

  close(): void {
    this.section = 'main';
    this.selection = 0;
    this.offset = 0;
    this.selectionBySection = {};
    this.offsetBySection = {};
    this.jettisonItemKey = null;
  }
}

export type ActiveInterface<Quantity, Extraction, Confirmation> =
  | { readonly kind: 'none' }
  | { readonly kind: 'popup' }
  | { readonly kind: 'target-menu' }
  | { readonly kind: 'ship-menu' }
  | { readonly kind: 'rover-cargo' }
  | { readonly kind: 'surface-legend' }
  | { readonly kind: 'quantity'; readonly state: Quantity }
  | { readonly kind: 'surface-extraction'; readonly state: Extraction }
  | { readonly kind: 'jettison-confirmation'; readonly state: Confirmation };

export class InterfaceModeController<Quantity, Extraction, Confirmation> {
  private _active: ActiveInterface<Quantity, Extraction, Confirmation> = Object.freeze({ kind: 'none' });

  get active(): ActiveInterface<Quantity, Extraction, Confirmation> {
    return this._active;
  }

  get kind(): ActiveInterface<Quantity, Extraction, Confirmation>['kind'] {
    return this._active.kind;
  }

  is(kind: ActiveInterface<Quantity, Extraction, Confirmation>['kind']): boolean {
    return this._active.kind === kind;
  }

  open(kind: Exclude<ActiveInterface<Quantity, Extraction, Confirmation>['kind'], 'none' | 'quantity' | 'surface-extraction' | 'jettison-confirmation'>): void {
    this._active = Object.freeze({ kind }) as ActiveInterface<Quantity, Extraction, Confirmation>;
  }

  openQuantity(state: Quantity): void {
    this._active = Object.freeze({ kind: 'quantity', state });
  }

  openSurfaceExtraction(state: Extraction): void {
    this._active = Object.freeze({ kind: 'surface-extraction', state });
  }

  openJettisonConfirmation(state: Confirmation): void {
    this._active = Object.freeze({ kind: 'jettison-confirmation', state });
  }

  close(kind?: ActiveInterface<Quantity, Extraction, Confirmation>['kind']): void {
    if (kind && this._active.kind !== kind) return;
    this._active = Object.freeze({ kind: 'none' });
  }

  get quantity(): Quantity | null {
    return this._active.kind === 'quantity' ? this._active.state : null;
  }

  get surfaceExtraction(): Extraction | null {
    return this._active.kind === 'surface-extraction' ? this._active.state : null;
  }

  get jettisonConfirmation(): Confirmation | null {
    return this._active.kind === 'jettison-confirmation' ? this._active.state : null;
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
