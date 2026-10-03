import type { EncounterField, EncounterIndividual, StunPower } from '../../entities/biology/biology_types';
import {
  encounterVisible,
  individualSpecies,
  type EncounterCommand,
} from '../../systems/surface_encounter_system';
import { TerminalTextReveal } from '../terminal_text_reveal';
import { biologyDashboard, createBiologicalDossier } from '../xenobiology_ui';
import type { XenobiologyService } from '../xenobiology_service';
import { getDashboardVisibleRows, type TextModalTableModel } from '../text_ui';
import { ENCOUNTER_ACTIONS, type EncounterAction } from '../encounter_actions';
import { commandButton, type CommandBarModel } from '../command_bar';

type EncounterInteraction =
  | { kind: 'drive' }
  | { kind: 'menu'; index: number }
  | { kind: 'power' }
  | { kind: 'confirm'; targetId: string }
  | { kind: 'dossier' | 'catalogue'; offset: number };
export type EncounterIntent =
  | { kind: 'command'; command: EncounterCommand }
  | { kind: 'leave' | 'cargo' | 'missions' | 'science' };

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
    if (actions.has('CYCLE_TARGET')) {
      const visible = field.individuals.filter((individual) => encounterVisible(field, individual));
      this.targetId =
        visible[(visible.findIndex((individual) => individual.id === this.targetId) + 1) % visible.length]
          ?.id ?? null;
      return;
    }
    if (state.kind === 'menu') {
      if (cancel) this.interaction = { kind: 'drive' };
      else if (actions.has('MOVE_UP') || actions.has('MOVE_LEFT'))
        state.index = (state.index + ENCOUNTER_ACTIONS.length - 1) % ENCOUNTER_ACTIONS.length;
      else if (actions.has('MOVE_DOWN') || actions.has('MOVE_RIGHT'))
        state.index = (state.index + 1) % ENCOUNTER_ACTIONS.length;
      else if (confirm) return this.choose(ENCOUNTER_ACTIONS[state.index].kind, target?.id);
      else {
        const shortcut = ENCOUNTER_ACTIONS.find((item) => actions.has(item.action));
        if (shortcut) return this.choose(shortcut.kind, target?.id);
      }
      return;
    }
    if (cancel) return { kind: 'leave' };
    if (confirm) {
      this.interaction = { kind: 'menu', index: 0 };
      return;
    }
    const shortcut = ENCOUNTER_ACTIONS.find((item) => actions.has(item.action));
    if (shortcut) return this.choose(shortcut.kind, target?.id);
    const dx = actions.has('MOVE_RIGHT') ? 1 : actions.has('MOVE_LEFT') ? -1 : 0;
    const dy = actions.has('MOVE_DOWN') ? 1 : actions.has('MOVE_UP') ? -1 : 0;
    if (dx || dy) return { kind: 'command', command: { kind: 'move', dx, dy } };
  }

  /** Resolves an explicit menu choice without performing gameplay effects itself. */
  private choose(action: EncounterAction, targetId?: string): EncounterIntent | undefined {
    this.interaction = { kind: 'drive' };
    if (action === 'leave' || action === 'cargo' || action === 'missions' || action === 'science')
      return { kind: action };
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

  /** Exposes the actual bottom action menu and replaces it with safe controls while a modal owns input. */
  createCommandBar(field: EncounterField): CommandBarModel {
    const state = this.interaction;
    const context = 'biological field';
    if (state.kind === 'power')
      return {
        context,
        buttons: [
          commandButton('dose-down', 'Lower dose', 'MOVE_LEFT', { key: 'Left' }),
          commandButton('dose-up', 'Raise dose', 'MOVE_RIGHT', { key: 'Right' }),
          commandButton('fire', 'Fire stunner', 'ENTER_SYSTEM', { key: 'Enter', tone: 'green' }),
          commandButton('cancel', 'Cancel', 'QUIT', { key: 'Esc' }),
        ],
      };
    if (state.kind === 'confirm')
      return {
        context,
        buttons: [
          commandButton('confirm', 'Confirm lethal shot', 'ENTER_SYSTEM', { key: 'Enter', tone: 'red' }),
          commandButton('cancel', 'Cancel', 'QUIT', { key: 'Esc' }),
        ],
      };
    if (state.kind === 'dossier' || state.kind === 'catalogue')
      return {
        context,
        buttons: [
          commandButton('page-up', 'Previous page', 'PAGE_UP', { key: 'PgUp' }),
          commandButton('page-down', 'Next page', 'PAGE_DOWN', { key: 'PgDn' }),
          commandButton('cancel', 'Return to field', 'QUIT', { key: 'Esc' }),
        ],
      };
    const target = this.target(field);
    return {
      context,
      leftButtons: [
        commandButton('target', 'Target', 'CYCLE_TARGET', { key: 'Tab' }),
        commandButton('actions', 'Actions', 'ENTER_SYSTEM', { key: 'Enter' }),
      ],
      selectedButtonId: state.kind === 'menu' ? ENCOUNTER_ACTIONS[state.index].kind : undefined,
      buttons: ENCOUNTER_ACTIONS.map((item) =>
        commandButton(item.kind, item.label, item.action, {
          key: item.key,
          enabled:
            ['cargo', 'leave', 'wait', 'catalogue', 'missions', 'science'].includes(item.kind) || !!target,
          tone: item.kind === 'shoot' ? 'red' : item.kind === 'collect' ? 'green' : 'normal',
        })
      ),
    };
  }

  /** Prepares a terminal modal; scrolling is clamped against responsive wrapped content. */
  createModal(
    field: EncounterField,
    service: XenobiologyService,
    cols: number,
    rows: number,
    scanner: readonly string[],
    stasisClass = 1,
    requests: readonly string[] = []
  ): TextModalTableModel | undefined {
    const state = this.interaction;
    if (state.kind === 'drive' || state.kind === 'menu') return;
    const base = { columns: [], widths: [], rows: [], selectedIndex: 0, viewOffset: 0, visibleRowCount: 8 };
    /** Wraps shortcut descriptions to the shared modal's actual footer width. */
    const footer = (...lines: string[]): string[] =>
      biologyDashboard(lines, cols - 10).map((line) => line.segments.map((span) => span.text).join(''));
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
    const width = Math.min(72, cols - 12);
    const dashboard =
      state.kind === 'catalogue'
        ? Object.values(service.snapshot.evidence).flatMap((evidence) => [
            ...createBiologicalDossier(evidence.species, service, width),
            { segments: [] },
          ])
        : target
          ? createBiologicalDossier(individualSpecies(field, target), service, width, {
              field,
              target,
              power: this.power,
              stasisClass,
              requests,
            })
          : biologyDashboard(['No biological target'], width);
    if (!dashboard.length) dashboard.push(...biologyDashboard(['No biological records yet.'], width));
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
