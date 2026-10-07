import type { InputManager } from './input_manager';
import { commandButton, type CommandBarModel } from './command_bar';
import { TerminalTextReveal } from './terminal_text_reveal';
import {
  clampIndex,
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardLine,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

export interface FrontierTerminalEntry {
  id: string;
  title: string;
  status: string;
  tone: TextTone;
  lines: TextDashboardLine[];
}

export type FrontierTerminalAction = 'close' | 'activate' | 'mark' | 'tab' | 'refresh';

/** Builds semantic terminal spans that preserve the established thick-heading/thin-body font roles. */
export function frontierLine(text: string, tone: TextTone = 'normal', heading = false): TextDashboardLine {
  return { segments: text ? [{ text, tone, font: heading ? 'thick' : 'thin' }] : [] };
}

/** Owns selection, scrolling and fast terminal reveal for frontier information panels. */
export class FrontierTerminal {
  readonly reveal = new TerminalTextReveal();
  selectedId: string | null = null;
  viewOffset = 0;
  notice = '';
  coverage = '';
  returnTo: 'none' | 'ship-menu' = 'none';
  tab: 'uploads' | 'charts' = 'uploads';
  contacts: import('./frontier_catalogue').FrontierCatalogueContact[] = [];

  /** Opens with fresh presentation state, keeping previously measured science in its domain owner. */
  open(parent: 'none' | 'ship-menu' = 'none'): void {
    this.returnTo = parent;
    this.selectedId = null;
    this.viewOffset = 0;
    this.notice = '';
    this.coverage = '';
    this.tab = 'uploads';
    this.contacts = [];
    this.reveal.start();
  }

  /** Consumes reveal skipping before handling an action and keeps object selection independent of text paging. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    entries: readonly FrontierTerminalEntry[],
    visibleRows: number
  ): FrontierTerminalAction | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM')) return 'close';
    if (input.wasActionJustPressed('CYCLE_TARGET')) return 'tab';
    if (input.wasActionJustPressed('REFUEL')) return 'refresh';
    if (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION'))
      return 'activate';
    if (input.wasActionJustPressed('APPROACH_TARGET')) return 'mark';
    const delta = input.wasActionJustPressed('MOVE_UP')
      ? -1
      : input.wasActionJustPressed('MOVE_DOWN')
        ? 1
        : 0;
    if (delta) {
      const index = Math.max(
        0,
        entries.findIndex((entry) => entry.id === this.selectedId)
      );
      this.selectedId = entries[clampIndex(index + delta, entries.length)]?.id ?? null;
      this.viewOffset = 0;
    }
    if (input.wasActionJustPressed('PAGE_UP')) this.viewOffset -= visibleRows;
    if (input.wasActionJustPressed('PAGE_DOWN')) this.viewOffset += visibleRows;
  }

  /** Prepares one readable dossier and a small neighbouring index rather than wrapping thousands of records per frame. */
  createModel(
    title: string,
    status: readonly TextDashboardLine[],
    entries: readonly FrontierTerminalEntry[],
    cols: number,
    rows: number
  ): TextModalTableModel {
    if (!entries.some((entry) => entry.id === this.selectedId)) this.selectedId = entries[0]?.id ?? null;
    const index = entries.findIndex((entry) => entry.id === this.selectedId);
    const selected = entries[index];
    const fullWidth = cols < 90;
    const width = Math.max(1, Math.min(78, cols - (fullWidth ? 8 : 12)));
    const lines = [...status];
    if (this.coverage) lines.push(frontierLine(this.coverage, 'muted'));
    if (this.notice) lines.push(frontierLine(this.notice, 'amber'));
    lines.push(frontierLine(''));
    if (!selected) lines.push(frontierLine('No records available.', 'muted'));
    else {
      lines.push(frontierLine(`INDEX / ${index + 1} OF ${entries.length}`, 'cyan', true));
      for (const entry of entries.slice(Math.max(0, index - 2), index + 3)) {
        lines.push({
          segments: [
            { text: entry.id === selected.id ? '> ' : '  ', font: 'thick', tone: 'green' },
            { text: entry.title, font: 'thin', tone: entry.id === selected.id ? 'bright' : 'muted' },
            { text: ` / ${entry.status}`, font: 'thin', tone: entry.tone },
          ],
        });
      }
      lines.push(frontierLine(''), frontierLine(selected.title, 'cyan', true), ...selected.lines);
    }
    const dashboard = wrapDashboardLines(lines, width);
    const visibleRows = getDashboardVisibleRows(dashboard.length, rows, 0);
    this.viewOffset = Math.max(0, Math.min(this.viewOffset, dashboard.length - visibleRows));
    return {
      title,
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount: visibleRows,
      dashboard,
      dashboardFullWidth: fullWidth,
      dashboardReveal: this.reveal.progress,
    };
  }

  /** Publishes contextual actions with the same keys used by foreground input. */
  createCommandBar(kind: 'survey' | 'communications'): CommandBarModel {
    const charts = kind === 'survey' && this.tab === 'charts';
    return {
      context: kind,
      buttons: [
        commandButton('frontier-up', 'Previous', 'MOVE_UP', { key: 'Up' }),
        commandButton('frontier-down', 'Next', 'MOVE_DOWN', { key: 'Down' }),
        ...(kind === 'survey'
          ? [
              commandButton('frontier-tab', charts ? 'Measured data' : 'Public charts', 'CYCLE_TARGET', {
                key: 'Tab',
              }),
            ]
          : []),
        commandButton(
          'frontier-use',
          kind === 'communications' ? 'Mark destination' : charts ? 'Download chart' : 'Review upload',
          'ENTER_SYSTEM',
          { key: 'Enter', tone: 'green' }
        ),
        ...(charts
          ? [commandButton('frontier-mark', 'Mark filed chart', 'APPROACH_TARGET', { key: 'A' })]
          : []),
        ...(charts || kind === 'communications'
          ? [commandButton('frontier-refresh', 'Refresh link', 'REFUEL', { key: 'R' })]
          : []),
        commandButton('frontier-page-up', 'Page up', 'PAGE_UP', { key: 'PgUp' }),
        commandButton('frontier-page-down', 'Page down', 'PAGE_DOWN', { key: 'PgDn' }),
        commandButton('frontier-close', 'Return', 'QUIT', { key: 'Esc' }),
      ],
    };
  }
}
