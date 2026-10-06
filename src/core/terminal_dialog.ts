import type { InputManager } from './input_manager';
import { commandButton, type CommandBarModel } from './command_bar';
import { wrapDashboardLines, type TextDashboardLine } from './text_ui';

export interface TerminalDialogSpec<Intent> {
  readonly title: string;
  readonly lines: readonly TextDashboardLine[];
  readonly kind: 'confirmation' | 'message' | 'progress';
  readonly intent?: Intent;
  readonly dismissIntent?: Intent;
  readonly defaultYes?: boolean;
  readonly caution?: boolean;
}

export interface TerminalDialogModel {
  readonly title: readonly TextDashboardLine[];
  readonly lines: readonly TextDashboardLine[];
  readonly width: number;
  readonly height: number;
  readonly viewOffset: number;
  readonly lineCount: number;
  readonly visibleRows: number;
  readonly kind: TerminalDialogSpec<unknown>['kind'];
  readonly selectedYes: boolean;
  readonly caution: boolean;
}

export type TerminalDialogResult<Intent> =
  | { readonly kind: 'confirm'; readonly intent: Intent }
  | {
      readonly kind: 'dismiss';
      readonly intent?: Intent;
    };

/** Owns a paused terminal notice or explicit choice without replacing its parent interface. */
export class TerminalDialog<Intent> {
  private spec: TerminalDialogSpec<Intent> | null = null;
  selectedYes = false;
  viewOffset = 0;
  revision = 0;

  /** Reports whether the dialog owns foreground input. */
  get isOpen(): boolean {
    return this.spec !== null;
  }

  /** Starts a new choice or notice; confirmation keys are cleared by the outer owner. */
  open(spec: TerminalDialogSpec<Intent>): void {
    this.spec = spec;
    this.selectedYes = spec.defaultYes ?? false;
    this.viewOffset = 0;
    this.revision++;
  }

  /** Removes only the dialog, leaving its parent menu intact. */
  close(): void {
    this.spec = null;
    this.viewOffset = 0;
    this.revision++;
  }

  /** Handles physical Y/N independently of their normal gameplay bindings. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasKeyJustPressed'>,
    model: TerminalDialogModel
  ): TerminalDialogResult<Intent> | undefined {
    if (input.wasKeyJustPressed('y')) return this.action('DIALOG_YES', model);
    if (input.wasKeyJustPressed('n')) return this.action('DIALOG_NO', model);
    for (const action of [
      'DIALOG_YES',
      'DIALOG_NO',
      'QUIT',
      'LEAVE_SYSTEM',
      'ENTER_SYSTEM',
      'PRIMARY_ACTION',
      'MOVE_LEFT',
      'MOVE_RIGHT',
      'CYCLE_TARGET',
      'MOVE_UP',
      'MOVE_DOWN',
      'PAGE_UP',
      'PAGE_DOWN',
    ]) {
      if (input.wasActionJustPressed(action)) return this.action(action, model);
    }
  }

  /** Shares the same selection and dismissal rules between keyboard and clickable controls. */
  action(action: string, model: TerminalDialogModel): TerminalDialogResult<Intent> | undefined {
    const spec = this.spec;
    if (!spec || spec.kind === 'progress') return;
    const yes =
      action === 'DIALOG_YES' ||
      (spec.kind === 'confirmation' &&
        this.selectedYes &&
        (action === 'ENTER_SYSTEM' || action === 'PRIMARY_ACTION'));
    const dismiss =
      ['DIALOG_NO', 'QUIT', 'LEAVE_SYSTEM'].includes(action) ||
      action === 'ENTER_SYSTEM' ||
      action === 'PRIMARY_ACTION';
    if (yes && spec.kind === 'confirmation' && spec.intent !== undefined) {
      this.close();
      return { kind: 'confirm', intent: spec.intent };
    }
    if (dismiss) {
      this.close();
      return { kind: 'dismiss', intent: spec.dismissIntent };
    }
    if (spec.kind === 'confirmation' && ['MOVE_LEFT', 'MOVE_RIGHT', 'CYCLE_TARGET'].includes(action)) {
      this.selectedYes = action === 'MOVE_LEFT' ? true : action === 'MOVE_RIGHT' ? false : !this.selectedYes;
      this.revision++;
    }
    const delta =
      action === 'MOVE_UP'
        ? -1
        : action === 'MOVE_DOWN'
          ? 1
          : action === 'PAGE_UP'
            ? -model.visibleRows
            : action === 'PAGE_DOWN'
              ? model.visibleRows
              : 0;
    if (delta) {
      this.viewOffset = Math.max(0, Math.min(this.viewOffset + delta, model.lineCount - model.visibleRows));
      this.revision++;
    }
  }

  /** Wraps both heading and body to the exact interior available on the current text grid. */
  createModel(cols: number, rows: number): TerminalDialogModel {
    const spec = this.spec;
    const width = Math.max(8, Math.min(78, cols - 2));
    const interior = Math.max(1, width - 6);
    const title = wrapDashboardLines(
      [{ segments: [{ text: spec?.title ?? '', font: 'thick', tone: 'cyan' }] }],
      interior
    );
    const lines = wrapDashboardLines(spec?.lines ?? [], interior);
    const visibleRows = Math.max(1, Math.min(lines.length, rows - title.length - 9));
    this.viewOffset = Math.max(0, Math.min(this.viewOffset, lines.length - visibleRows));
    return {
      title,
      lines: lines.slice(this.viewOffset, this.viewOffset + visibleRows),
      width,
      height: Math.min(rows - 2, title.length + visibleRows + 7),
      viewOffset: this.viewOffset,
      lineCount: lines.length,
      visibleRows,
      kind: spec?.kind ?? 'message',
      selectedYes: this.selectedYes,
      caution: spec?.caution ?? false,
    };
  }

  /** Publishes explicit Yes/No choices, or one acknowledgement for a persistent notice. */
  createCommandBar(): CommandBarModel {
    const spec = this.spec;
    const confirmation = spec?.kind === 'confirmation';
    return {
      context: spec?.title ?? 'terminal',
      selectedButtonId:
        spec?.kind === 'progress'
          ? 'transition-skip'
          : confirmation
            ? this.selectedYes
              ? 'dialog-yes'
              : 'dialog-no'
            : 'dialog-continue',
      buttons:
        spec?.kind === 'progress'
          ? [commandButton('transition-skip', 'Continue', 'TRANSITION_SKIP', { key: 'Enter' })]
          : [
              ...(confirmation
                ? [
                    commandButton('dialog-yes', 'Yes', 'DIALOG_YES', {
                      key: 'Y',
                      tone: spec?.caution ? 'red' : 'green',
                    }),
                    commandButton('dialog-no', 'No', 'DIALOG_NO', { key: 'N' }),
                  ]
                : [
                    commandButton('dialog-continue', 'Continue', 'ENTER_SYSTEM', {
                      key: 'Enter',
                      tone: 'green',
                    }),
                  ]),
              commandButton('dialog-up', 'Scroll up', 'MOVE_UP', { key: 'Up' }),
              commandButton('dialog-down', 'Scroll down', 'MOVE_DOWN', { key: 'Down' }),
              commandButton('dialog-close', confirmation ? 'Cancel' : 'Close', 'QUIT', { key: 'Esc' }),
            ],
    };
  }
}
