import type { EncounterField, EncounterIndividual, StunPower } from '../../entities/biology/biology_types';
import {
  encounterVisible,
  individualSpecies,
  type EncounterCommand,
} from '../../systems/surface_encounter_system';
import { TerminalTextReveal } from '../terminal_text_reveal';
import { biologyDashboard, speciesDescription } from '../xenobiology_ui';
import type { XenobiologyService } from '../xenobiology_service';
import { getDashboardVisibleRows, type TextModalTableModel } from '../text_ui';

type EncounterInteraction =
  | { kind: 'drive' }
  | { kind: 'menu'; index: number }
  | { kind: 'power' }
  | { kind: 'confirm'; targetId: string }
  | { kind: 'dossier' | 'catalogue'; offset: number };
export type EncounterIntent = { kind: 'command'; command: EncounterCommand } | { kind: 'leave' | 'cargo' };
const ACTIONS = [
  'observe',
  'analyse',
  'stun',
  'sample',
  'collect',
  'shoot',
  'wait',
  'dossier',
  'catalogue',
  'cargo',
  'leave',
] as const;

/** Owns mutually exclusive local driving, action menus, weapon preparation and scientific reading. */
export class SurfaceEncounterController {
  interaction: EncounterInteraction = { kind: 'drive' };
  targetId: string | null = null;
  power: StunPower = 1;
  readonly reveal = new TerminalTextReveal();

  /** Resets only presentation state, retaining field actors and local simulation time. */
  reset(): void {
    this.interaction = { kind: 'drive' };
    this.targetId = null;
    this.reveal.complete();
  }

  /** Keeps a visible selection or acquires the nearest visible organism deterministically. */
  target(field: EncounterField): EncounterIndividual | undefined {
    const targets = field.individuals
      .filter((individual) => encounterVisible(field, individual))
      .sort(
        (a, b) =>
          Math.hypot(a.x - field.roverX, a.y - field.roverY) -
            Math.hypot(b.x - field.roverX, b.y - field.roverY) || a.id.localeCompare(b.id)
      );
    const selected = targets.find((individual) => individual.id === this.targetId) ?? targets[0];
    this.targetId = selected?.id ?? null;
    return selected;
  }

  /** Consumes one fresh action, with no held-key fall-through into macro travel or combat. */
  input(actions: ReadonlySet<string>, field: EncounterField): EncounterIntent | undefined {
    const target = this.target(field);
    const confirm = actions.has('ENTER_SYSTEM') || actions.has('PRIMARY_ACTION');
    const cancel = actions.has('QUIT') || actions.has('LEAVE_SYSTEM');
    const state = this.interaction;
    if (state.kind === 'dossier' || state.kind === 'catalogue') {
      if (this.reveal.isActive && actions.size) {
        this.reveal.complete();
        return;
      }
      if (cancel) this.interaction = { kind: 'drive' };
      else
        state.offset = Math.max(
          0,
          state.offset +
            (actions.has('MOVE_DOWN')
              ? 1
              : actions.has('MOVE_UP')
                ? -1
                : actions.has('PAGE_DOWN')
                  ? 8
                  : actions.has('PAGE_UP')
                    ? -8
                    : 0)
        );
      return;
    }
    if (state.kind === 'power') {
      if (cancel) this.interaction = { kind: 'drive' };
      else if (actions.has('MOVE_LEFT')) this.power = Math.max(0, this.power - 1) as StunPower;
      else if (actions.has('MOVE_RIGHT')) this.power = Math.min(2, this.power + 1) as StunPower;
      else if (confirm && target) {
        this.interaction = { kind: 'drive' };
        return { kind: 'command', command: { kind: 'stun', targetId: target.id, power: this.power } };
      }
      return;
    }
    if (state.kind === 'confirm') {
      this.interaction = { kind: 'drive' };
      if (confirm) return { kind: 'command', command: { kind: 'shoot', targetId: state.targetId } };
      return;
    }
    if (state.kind === 'menu') {
      if (cancel) this.interaction = { kind: 'drive' };
      else if (actions.has('MOVE_UP')) state.index = (state.index + ACTIONS.length - 1) % ACTIONS.length;
      else if (actions.has('MOVE_DOWN')) state.index = (state.index + 1) % ACTIONS.length;
      else if (confirm) return this.choose(ACTIONS[state.index], target?.id);
      return;
    }
    if (cancel) return { kind: 'leave' };
    if (confirm) {
      this.interaction = { kind: 'menu', index: 0 };
      return;
    }
    if (actions.has('CYCLE_TARGET')) {
      const visible = field.individuals.filter((individual) => encounterVisible(field, individual));
      this.targetId =
        visible[(visible.findIndex((individual) => individual.id === this.targetId) + 1) % visible.length]
          ?.id ?? null;
      return;
    }
    if (actions.has('SCAN')) return this.choose('observe', target?.id);
    if (actions.has('APPROACH_TARGET')) return this.choose('analyse', target?.id);
    if (actions.has('ORBIT_DOSSIER')) return this.choose('dossier', target?.id);
    if (actions.has('TARGET_MENU')) return this.choose('catalogue', target?.id);
    if (actions.has('SHIP_MENU')) return { kind: 'cargo' };
    const dx = actions.has('MOVE_RIGHT') ? 1 : actions.has('MOVE_LEFT') ? -1 : 0;
    const dy = actions.has('MOVE_DOWN') ? 1 : actions.has('MOVE_UP') ? -1 : 0;
    if (dx || dy) return { kind: 'command', command: { kind: 'move', dx, dy } };
  }

  /** Resolves an explicit menu choice without performing gameplay effects itself. */
  private choose(action: (typeof ACTIONS)[number], targetId?: string): EncounterIntent | undefined {
    this.interaction = { kind: 'drive' };
    if (action === 'leave' || action === 'cargo') return { kind: action };
    if (action === 'wait') return { kind: 'command', command: { kind: 'wait' } };
    if (action === 'catalogue' || (action === 'dossier' && targetId)) {
      this.interaction = { kind: action, offset: 0 };
      this.reveal.start();
      return;
    }
    if (!targetId) return;
    if (action === 'stun') {
      this.interaction = { kind: 'power' };
      return;
    }
    if (action === 'shoot') {
      this.interaction = { kind: 'confirm', targetId };
      return;
    }
    if (action === 'dossier') return;
    return { kind: 'command', command: { kind: action, targetId } };
  }

  /** Prepares a terminal modal; scrolling is clamped against responsive wrapped content. */
  createModal(
    field: EncounterField,
    service: XenobiologyService,
    cols: number,
    rows: number,
    scanner: readonly string[]
  ): TextModalTableModel | undefined {
    const state = this.interaction;
    if (state.kind === 'drive') return;
    const base = { columns: [], widths: [], rows: [], selectedIndex: 0, viewOffset: 0, visibleRowCount: 8 };
    /** Wraps shortcut descriptions to the shared modal's actual footer width. */
    const footer = (...lines: string[]): string[] =>
      biologyDashboard(lines, cols - 10).map((line) => line.segments.map((span) => span.text).join(''));
    if (state.kind === 'menu' && cols < 42) {
      const dashboard = biologyDashboard(
        ACTIONS.map((action, index) => `${index === state.index ? '>' : ' '} ${action.toUpperCase()}`),
        cols - 12
      );
      const shortcuts = footer('UP/DN select', 'ENTER execute / ESC back');
      const visible = getDashboardVisibleRows(dashboard.length, rows, shortcuts.length);
      return {
        ...base,
        title: 'BIO OPERATIONS',
        dashboard,
        visibleRowCount: visible,
        viewOffset: Math.max(0, state.index - visible + 1),
        footer: shortcuts,
      };
    }
    if (state.kind === 'menu')
      return {
        ...base,
        title: 'BIOLOGICAL OPERATIONS',
        columns: ['ACTION'],
        widths: [36],
        rows: ACTIONS.map((action) => ({
          id: action,
          cells: [action.toUpperCase()],
          detail:
            action === 'leave'
              ? 'Return to local entry at X16 Y21 to withdraw.'
              : 'Local time advances only when an operation succeeds.',
        })),
        selectedIndex: state.index,
        viewOffset: Math.max(0, state.index - 7),
        footer: footer('UP/DN select  ENTER execute  ESC back'),
      };
    if (state.kind === 'confirm')
      return {
        ...base,
        title: 'CONFIRM LETHAL DISCHARGE',
        dashboard: biologyDashboard(
          [
            'Lethal operation / irreversible',
            'Target will be killed. Live scientific value will be lost.',
            'ENTER confirm lethal shot / ESC cancel',
          ],
          cols - 12
        ),
        footer: footer('ENTER confirm  ESC cancel'),
      };
    if (state.kind === 'power')
      return {
        ...base,
        title: 'STUNNER / DOSE SELECTION',
        dashboard: biologyDashboard(
          [
            `POWER ${['LOW', 'STANDARD', 'HIGH'][this.power]}`,
            ...scanner,
            'Repeated exposure increases injury and mortality.',
          ],
          cols - 12
        ),
        footer: footer('LEFT/RIGHT dose  ENTER fire  ESC cancel'),
      };
    const target = this.target(field);
    const lines =
      state.kind === 'catalogue'
        ? [
            'XENOBIOLOGY / PERSONAL RECORD',
            ...Object.values(service.snapshot.evidence).flatMap((evidence) => [
              ...speciesDescription(evidence.species, service),
              '',
            ]),
          ]
        : target
          ? [
              'BIOLOGICAL DOSSIER',
              ...speciesDescription(individualSpecies(field, target), service),
              ...scanner.slice(3),
            ]
          : ['No biological target'];
    const dashboard = biologyDashboard(lines, Math.min(88, cols - 12));
    const shortcuts = footer('UP/DN scroll  PGUP/DN page', 'ESC return to field');
    const visible = getDashboardVisibleRows(dashboard.length, rows, shortcuts.length);
    state.offset = Math.min(state.offset, Math.max(0, dashboard.length - visible));
    return {
      ...base,
      title: state.kind === 'catalogue' ? 'XENOBIOLOGY RECORD' : 'BIOLOGICAL DOSSIER',
      dashboard,
      dashboardReveal: this.reveal.progress,
      viewOffset: state.offset,
      visibleRowCount: visible,
      footer: shortcuts,
    };
  }
}
