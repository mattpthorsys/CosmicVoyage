import { CONFIG } from '../config';
import { AvailableAction } from './available_actions';
import { GameState } from './game_state_manager';

/** Creates help reference lines. */
export function createHelpReferenceLines(state: GameState, actions: AvailableAction[]): string[] {
  return [
    'COSMIC VOYAGE REFERENCE',
    '',
    `CURRENT MODE: ${formatModeName(state)}`,
    ...formatCurrentActions(actions),
    '',
    'TRAVEL',
    `${formatKey(CONFIG.KEY_BINDINGS.MOVE_UP)}/ARROWS  Move ship, cursor, or current menu selection`,
    `${formatKey(CONFIG.KEY_BINDINGS.FINE_CONTROL)}  Fine control for careful movement`,
    `${formatKey(CONFIG.KEY_BINDINGS.BOOST)}  Boost drift in hyperspace`,
    `${formatKey(CONFIG.KEY_BINDINGS.PRIMARY_ACTION)}  Perform the best available action`,
    '',
    'HYPERSPACE',
    `${formatKey(CONFIG.KEY_BINDINGS.ENTER_SYSTEM)}  Enter a star system when on a contact`,
    `${formatKey(CONFIG.KEY_BINDINGS.SCAN_SYSTEM_OBJECT)}  Scan local space or current contact`,
    `Numpad 1/3/7/9  Diagonal drift, works with NumLock off`,
    `${formatKey(CONFIG.KEY_BINDINGS.TOGGLE_PROFILER)}  Toggle performance profiler`,
    '',
    'SYSTEM',
    `${formatKey(CONFIG.KEY_BINDINGS.CYCLE_TARGET)}  Cycle navigation target`,
    `${formatKey(CONFIG.KEY_BINDINGS.TARGET_MENU)}  Open navigation target menu`,
    `${formatKey(CONFIG.KEY_BINDINGS.SHIP_MENU)}  Open ship operations menu`,
    `${formatKey(CONFIG.KEY_BINDINGS.APPROACH_TARGET)}  Approach selected target automatically`,
    `${formatKey(CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF)}  Orbit planet or dock at starbase when close`,
    `${formatKey(CONFIG.KEY_BINDINGS.ZOOM_IN)}/${formatKey(CONFIG.KEY_BINDINGS.ZOOM_OUT)}  Zoom system view`,
    '',
    'ORBIT / SURFACE / STARBASE',
    `Orbit: Left/Right choose body, Enter or Space selects landing, Esc breaks orbit`,
    `Surface: ${formatKey(CONFIG.KEY_BINDINGS.SCAN)} scan, ${formatKey(CONFIG.KEY_BINDINGS.MINE)} mine, ${formatKey(CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF)} liftoff`,
    `Starbase: arrows select, PgUp/PgDn page, Left/Right sections, Enter use, Esc cancel`,
    '',
    'Esc, arrows, Enter, Backspace, or ? closes this panel.',
    CONFIG.POPUP_CLOSE_TEXT,
  ];
}

/** Formats current actions. */
function formatCurrentActions(actions: AvailableAction[]): string[] {
  const visibleActions = actions
    .filter((action) => action.enabled)
    .filter((action) => action.id !== 'help')
    .slice(0, 8);

  if (visibleActions.length === 0) return ['No immediate contextual actions.'];

  return [
    'AVAILABLE NOW',
    ...visibleActions.map(
      (action) =>
        `${formatKey(action.key).padEnd(10)} ${action.label}${action.targetName ? `: ${action.targetName}` : ''}`
    ),
  ];
}

/** Formats mode name. */
function formatModeName(state: GameState): string {
  switch (state) {
    case 'hyperspace':
      return 'Hyperspace';
    case 'system':
      return 'Planetary Travel';
    case 'orbit':
      return 'Orbit';
    case 'planet':
      return 'Surface';
    case 'starbase':
      return 'Starbase';
  }
}

/** Formats key. */
function formatKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')
    return 'Arrows';
  if (key === 'Control') return 'Ctrl';
  return key;
}
