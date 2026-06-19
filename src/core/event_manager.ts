import type { AvailableAction } from './available_actions';
import type { CommandBarModel } from './command_bar';
import type { GameState } from './game_state_manager';
import type { Planet } from '../entities/planet';
import type { SolarSystem } from '../entities/solar_system';
import type { Starbase } from '../entities/starbase';
import type { MoveRequestData } from '../systems/movement_system';

export interface GameStateChangedEvent {
  previousState: GameState;
  state: GameState;
}

export interface StatusUpdateEvent {
  message: string;
  hasStarbase: boolean;
}

export interface CommandStripUpdateEvent {
  actions: AvailableAction[];
  primaryActionId?: string;
  targetName?: string;
  commandBar?: CommandBarModel;
}

export interface CommandBarActionSelectedEvent {
  id: string;
  action: string;
}

export interface GameEventMap {
  gameStateChanged: GameStateChangedEvent;
  systemEntered: SolarSystem;
  systemLeft: undefined;
  planetLanded: Planet;
  planetOrbitEntered: Planet;
  starbaseDocked: Starbase;
  liftOff: undefined;
  enterSystemRequested: undefined;
  leaveSystemRequested: undefined;
  landRequested: undefined;
  liftoffRequested: undefined;
  tradeRequested: undefined;
  refuelRequested: undefined;
  mineRequested: undefined;
  moveRequested: MoveRequestData;
  playerMoved: {
    oldPos: unknown;
    newPos: unknown;
    context: 'world' | 'system' | 'surface';
  };
  playerCargoAdded: {
    elementKey: string;
    amount?: number;
    amountAdded?: number;
    items?: Record<string, number>;
    newAmount?: number;
    newTotal?: number;
    newTotalCargo?: number;
  };
  playerCargoRemoved: {
    elementKey: string;
    amountRemoved: number;
  };
  playerCargoSold: {
    items?: Record<string, number>;
    itemsSold?: Record<string, number>;
    creditsEarned: number;
    newCredits?: number;
  };
  playerFuelChanged: {
    newFuel: number;
    maxFuel?: number;
    amountChanged: number;
  };
  playerCreditsChanged: {
    newCredits: number;
    amountChanged: number;
  };
  actionFailed: {
    action: string;
    reason: string;
  };
  statusUpdateNeeded: StatusUpdateEvent;
  commandStripUpdateNeeded: CommandStripUpdateEvent;
  commandBarActionSelected: CommandBarActionSelectedEvent;
  popupStateChanged: {
    newState: 'inactive' | 'opening' | 'active' | 'closing';
    content?: string[];
  };
  logDownloadRequested: undefined;
  gameQuit: undefined;
}

export type GameEventName = keyof GameEventMap;
export type Unsubscribe = () => void;
type Listener<Payload> = (data: Payload) => void;
type PublishArgs<Payload> = undefined extends Payload ? [data?: Payload] : [data: Payload];

/**
 * Synchronous typed event bus for cross-component notifications.
 * Subscriptions return an idempotent disposer so lifecycle cleanup cannot
 * depend on reproducing the original callback identity.
 */
export class EventManager<EventMap extends object> {
  private readonly listeners = new Map<keyof EventMap, Set<Listener<EventMap[keyof EventMap]>>>();

  /** Subscribes to. */
  subscribe<EventName extends keyof EventMap>(
    eventName: EventName,
    callback: Listener<EventMap[EventName]>
  ): Unsubscribe {
    const eventListeners = this.listeners.get(eventName) ?? new Set();
    eventListeners.add(callback as Listener<EventMap[keyof EventMap]>);
    this.listeners.set(eventName, eventListeners);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      eventListeners.delete(callback as Listener<EventMap[keyof EventMap]>);
      if (eventListeners.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  /** Publishes. */
  publish<EventName extends keyof EventMap>(
    eventName: EventName,
    ...[data]: PublishArgs<EventMap[EventName]>
  ): void {
    const eventListeners = this.listeners.get(eventName);
    if (!eventListeners) return;

    [...eventListeners].forEach((callback) => {
      try {
        callback(data as EventMap[keyof EventMap]);
      } catch (error) {
        console.error(`[EventManager] Error in listener for event "${String(eventName)}":`, error);
      }
    });
  }

  /** Clears all. */
  clearAll(): void {
    this.listeners.clear();
  }
}

export const eventManager = new EventManager<GameEventMap>();

export const GameEvents = {
  GAME_STATE_CHANGED: 'gameStateChanged',
  SYSTEM_ENTERED: 'systemEntered',
  SYSTEM_LEFT: 'systemLeft',
  PLANET_LANDED: 'planetLanded',
  PLANET_ORBIT_ENTERED: 'planetOrbitEntered',
  STARBASE_DOCKED: 'starbaseDocked',
  LIFT_OFF: 'liftOff',
  ENTER_SYSTEM_REQUESTED: 'enterSystemRequested',
  LEAVE_SYSTEM_REQUESTED: 'leaveSystemRequested',
  LAND_REQUESTED: 'landRequested',
  LIFTOFF_REQUESTED: 'liftoffRequested',
  TRADE_REQUESTED: 'tradeRequested',
  REFUEL_REQUESTED: 'refuelRequested',
  MINE_REQUESTED: 'mineRequested',
  MOVE_REQUESTED: 'moveRequested',
  PLAYER_MOVED: 'playerMoved',
  PLAYER_CARGO_ADDED: 'playerCargoAdded',
  PLAYER_CARGO_REMOVED: 'playerCargoRemoved',
  PLAYER_CARGO_SOLD: 'playerCargoSold',
  PLAYER_FUEL_CHANGED: 'playerFuelChanged',
  PLAYER_CREDITS_CHANGED: 'playerCreditsChanged',
  ACTION_FAILED: 'actionFailed',
  STATUS_UPDATE_NEEDED: 'statusUpdateNeeded',
  COMMAND_STRIP_UPDATE_NEEDED: 'commandStripUpdateNeeded',
  COMMAND_BAR_ACTION_SELECTED: 'commandBarActionSelected',
  POPUP_STATE_CHANGED: 'popupStateChanged',
  LOG_DOWNLOAD_REQUESTED: 'logDownloadRequested',
  GAME_QUIT: 'gameQuit',
} as const satisfies Record<string, GameEventName>;
