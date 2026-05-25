import { CONFIG } from '../config';
import { MineralRichness } from '../constants';
import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { Starbase } from '../entities/starbase';
import { StellarBody } from '../entities/stellar_body';
import { Player } from './player';
import { GameState } from './game_state_manager';

export type AvailableActionCategory = 'movement' | 'navigation' | 'target' | 'surface' | 'commerce' | 'utility';

export interface AvailableAction {
  id: string;
  label: string;
  key: string;
  action: string;
  category: AvailableActionCategory;
  priority: number;
  enabled: boolean;
  targetName?: string;
  reason?: string;
}

export interface AvailableActionContext {
  state: GameState;
  player: Player;
  system: SolarSystem | null;
  planet: Planet | null;
  starbase: Starbase | null;
  isNearHyperspaceSystem?: boolean;
  nearbySystemName?: string;
  nearbyObject?: Planet | Starbase | null;
  nearbyStar?: StellarBody | null;
  selectedTargetName?: string | null;
  hasSelectedTarget?: boolean;
  isNearSystemEdge?: boolean;
  currentCargoTotal?: number;
  marketHasItems?: boolean;
}

export function createAvailableActions(context: AvailableActionContext): AvailableAction[] {
  const actions: AvailableAction[] = [
    action('primary', 'Do Best Action', CONFIG.KEY_BINDINGS.PRIMARY_ACTION, 'PRIMARY_ACTION', 'utility', 0, true),
    moveAction(context.state),
  ];

  switch (context.state) {
    case 'hyperspace':
      if (context.isNearHyperspaceSystem) {
        actions.push(action('enter-system', 'Enter System', CONFIG.KEY_BINDINGS.ENTER_SYSTEM, 'ENTER_SYSTEM', 'navigation', 10, true, context.nearbySystemName));
        actions.push(action('scan-system', 'Scan System', CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT, 'SCAN_SYSTEM_OBJECT', 'target', 20, true, context.nearbySystemName));
      } else {
        actions.push(action('scan-local', 'Scan Local Space', CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT, 'SCAN_SYSTEM_OBJECT', 'target', 20, true));
      }
      actions.push(action('boost', 'Boost Drift', CONFIG.KEY_BINDINGS.BOOST, 'BOOST', 'movement', 82, true));
      actions.push(action('fine-control', 'Fine Drift', CONFIG.KEY_BINDINGS.FINE_CONTROL, 'FINE_CONTROL', 'movement', 83, true));
      break;
    case 'system':
      actions.push(action('cycle-target', 'Cycle Target', CONFIG.KEY_BINDINGS.CYCLE_TARGET, 'CYCLE_TARGET', 'target', 6, true, context.selectedTargetName ?? undefined));
      actions.push(action('target-menu', 'Target Menu', CONFIG.KEY_BINDINGS.TARGET_MENU, 'TARGET_MENU', 'target', 7, true, context.selectedTargetName ?? undefined));
      if (context.hasSelectedTarget) {
        actions.push(action('approach-target', 'Approach Target', CONFIG.KEY_BINDINGS.APPROACH_TARGET, 'APPROACH_TARGET', 'navigation', 35, true, context.selectedTargetName ?? undefined));
      }
      if (context.nearbyObject) {
        const label = context.nearbyObject instanceof Starbase ? 'Dock' : 'Orbit';
        actions.push(action('land-dock', label, CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF, 'ACTIVATE_LAND_LIFTOFF', 'navigation', 10, true, context.nearbyObject.name));
        actions.push(action('scan-object', 'Scan', CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT, 'SCAN_SYSTEM_OBJECT', 'target', 20, true, context.nearbyObject.name));
      } else if (context.nearbyStar) {
        actions.push(action('scan-star', 'Scan Star', CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT, 'SCAN_SYSTEM_OBJECT', 'target', 20, true, context.nearbyStar.name));
      }
      if (context.isNearSystemEdge) {
        actions.push(action('leave-system', 'Leave System', CONFIG.KEY_BINDINGS.LEAVE_SYSTEM, 'LEAVE_SYSTEM', 'navigation', 15, true));
      }
      actions.push(action('zoom-in', 'Zoom In', CONFIG.KEY_BINDINGS.ZOOM_IN, 'ZOOM_IN', 'utility', 80, true));
      actions.push(action('zoom-out', 'Zoom Out', CONFIG.KEY_BINDINGS.ZOOM_OUT, 'ZOOM_OUT', 'utility', 81, true));
      break;
    case 'orbit':
      actions.push(action('select-body', 'Select Body', 'Left/Right', 'MOVE', 'target', 6, true, context.planet?.name));
      actions.push(action('landing-site', 'Landing Site', CONFIG.KEY_BINDINGS.ENTER_SYSTEM, 'ENTER_SYSTEM', 'navigation', 10, true, context.planet?.name));
      actions.push(action('land-from-orbit', 'Land', CONFIG.KEY_BINDINGS.PRIMARY_ACTION, 'PRIMARY_ACTION', 'navigation', 11, true, context.planet?.name));
      actions.push(action('break-orbit', 'Break Orbit', CONFIG.KEY_BINDINGS.QUIT, 'QUIT', 'navigation', 20, true, context.planet?.name));
      break;
    case 'planet':
      actions.push(action('liftoff', 'Liftoff', CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF, 'ACTIVATE_LAND_LIFTOFF', 'navigation', 10, true, context.planet?.name));
      if (context.planet && context.planet.type !== 'GasGiant' && context.planet.type !== 'IceGiant') {
        if (!context.planet.scanned) {
          actions.push(action('scan-surface', 'Scan Surface', CONFIG.KEY_BINDINGS.SCAN, 'SCAN', 'surface', 20, true, context.planet.name));
        } else if (
          context.planet.mineralRichness !== MineralRichness.NONE &&
          !context.planet.isMined(context.player.position.surfaceX, context.player.position.surfaceY)
        ) {
          actions.push(action('mine', 'Mine', CONFIG.KEY_BINDINGS.MINE, 'MINE', 'surface', 20, true, context.planet.name));
        }
      }
      break;
    case 'starbase':
      actions.push(action('section-left', 'Prev Section', CONFIG.KEY_BINDINGS.MOVE_LEFT, 'MOVE_LEFT', 'navigation', 6, true));
      actions.push(action('section-right', 'Next Section', CONFIG.KEY_BINDINGS.MOVE_RIGHT, 'MOVE_RIGHT', 'navigation', 7, true));
      actions.push(action('use-starbase-row', 'Use Selected', CONFIG.KEY_BINDINGS.ENTER_SYSTEM, 'ENTER_SYSTEM', 'commerce', 10, true, context.starbase?.name));
      actions.push(action('cancel-starbase-panel', 'Cancel', CONFIG.KEY_BINDINGS.QUIT, 'QUIT', 'navigation', 11, true, context.starbase?.name));
      actions.push(action('refuel', 'Refuel', CONFIG.KEY_BINDINGS.REFUEL, 'REFUEL', 'commerce', 20, true, context.starbase?.name));
      actions.push(action('depart', 'Depart', CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF, 'ACTIVATE_LAND_LIFTOFF', 'navigation', 30, true, context.starbase?.name));
      break;
  }
  actions.push(action('help', 'Help', CONFIG.KEY_BINDINGS.HELP, 'HELP', 'utility', 95, true));
  actions.push(action('profiler', 'Profiler', CONFIG.KEY_BINDINGS.TOGGLE_PROFILER, 'TOGGLE_PROFILER', 'utility', 96, true));

  return actions.sort((a, b) => a.priority - b.priority);
}

export function formatAvailableActions(actions: AvailableAction[], maxActions: number = 4): string {
  return actions
    .filter((availableAction) => availableAction.enabled)
    .slice(0, maxActions)
    .map((availableAction) => `[${formatKey(availableAction.key)}] ${availableAction.label}`)
    .join(' / ');
}

function moveAction(state: GameState): AvailableAction {
  return action(
    'move',
    state === 'starbase' ? 'Select' : state === 'orbit' ? 'Select Site' : 'Move',
    state === 'starbase' ? 'Up/Down' : 'Arrows',
    'MOVE',
    'movement',
    state === 'starbase' ? 5 : 90,
    true
  );
}

function action(
  id: string,
  label: string,
  key: string,
  actionName: string,
  category: AvailableActionCategory,
  priority: number,
  enabled: boolean,
  targetName?: string,
  reason?: string
): AvailableAction {
  return { id, label, key, action: actionName, category, priority, enabled, targetName, reason };
}

function formatKey(key: string): string {
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') return 'ARROWS';
  if (key === 'Up/Down') return 'UP/DOWN';
  return key.toUpperCase();
}
