import type { InputManager } from './input_manager';
import type { MissionStatus, StarbaseMission } from './mission_board';
import { biologicalReferenceDescription } from './mission_board';
import { TerminalTextReveal } from './terminal_text_reveal';
import {
  clampIndex,
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardLine,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

export interface MissionJournalEntry {
  mission: StarbaseMission;
  status: MissionStatus;
  completed: number;
  total: number;
}

export type MissionJournalReturn = 'none' | 'ship-menu' | 'rover-cargo' | 'xenobiology';

/** Owns a read-only, paused mission terminal independently of travel and station selection. */
export class MissionJournal {
  returnTo: MissionJournalReturn = 'none';
  selection = 0;
  viewOffset = 0;
  notice = '';
  readonly reveal = new TerminalTextReveal();

  /** Starts at the last inspected contract while resetting its terminal page. */
  open(returnTo: MissionJournalReturn): void {
    this.returnTo = returnTo;
    this.viewOffset = 0;
    this.notice = '';
    this.reveal.start();
  }

  /** Resolves the selected contract after hand-ins or restored sessions change the list. */
  selected(entries: readonly MissionJournalEntry[]): MissionJournalEntry | undefined {
    this.selection = clampIndex(this.selection, entries.length);
    return entries[this.selection];
  }

  /** Consumes terminal controls, including the first key used to finish its rapid text reveal. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    entries: readonly MissionJournalEntry[],
    model: TextModalTableModel
  ): 'close' | 'landing' | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('MISSION_JOURNAL')) return 'close';
    if (
      entries.length &&
      (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION'))
    )
      return 'landing';
    const cycle = input.wasActionJustPressed('MOVE_LEFT')
      ? -1
      : input.wasActionJustPressed('MOVE_RIGHT') || input.wasActionJustPressed('CYCLE_TARGET')
        ? 1
        : 0;
    if (cycle && entries.length) {
      this.selection = (this.selection + cycle + entries.length) % entries.length;
      this.viewOffset = 0;
      this.notice = '';
      this.reveal.complete();
      return;
    }
    const delta = input.wasActionJustPressed('MOVE_UP')
      ? -1
      : input.wasActionJustPressed('MOVE_DOWN')
        ? 1
        : input.wasActionJustPressed('PAGE_UP')
          ? -model.visibleRowCount
          : input.wasActionJustPressed('PAGE_DOWN')
            ? model.visibleRowCount
            : 0;
    this.viewOffset = Math.max(
      0,
      Math.min(this.viewOffset + delta, Math.max(0, (model.dashboard?.length ?? 0) - model.visibleRowCount))
    );
  }

  /** Builds colour-coded destination, objective and delivery details that wrap instead of truncating. */
  createModel(
    entries: readonly MissionJournalEntry[],
    cols: number,
    rows: number,
    canSelectLanding: boolean
  ): TextModalTableModel {
    const entry = this.selected(entries);
    const lines: TextDashboardLine[] = [];
    /** Adds one semantic terminal row; wrapping preserves its colour and weight. */
    const line = (text: string, tone: TextTone = 'bright', heading = false): void => {
      lines.push({ segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] });
    };
    if (!entry) {
      line('NO ACTIVE CONTRACTS', 'cyan', true);
      line('Accept a contract from a staffed station mission board.', 'muted');
    } else {
      const { mission, status } = entry;
      line(mission.title, 'cyan', true);
      line(
        `${status} / objectives ${entry.completed}/${entry.total}`,
        status === 'READY' ? 'green' : 'amber'
      );
      line(mission.summary);
      for (const objective of mission.objectives) {
        if (objective.kind === 'scan') continue;
        line('REFERENCE ORGANISM', 'cyan', true);
        line(biologicalReferenceDescription(objective), 'cyan');
      }
      line('');
      line('DESTINATION', 'cyan', true);
      line(`System: ${mission.systemName}`);
      const address = mission.systemAddress;
      line(
        address
          ? `Hyperspace: X ${address.worldX}  Y ${address.worldY} / contact ${address.systemSlot + 1}`
          : 'Hyperspace coordinates not recorded; revisit the issuing system to resolve.',
        address ? 'green' : 'amber'
      );
      for (const objective of mission.objectives) {
        line('');
        line(objective.targetLabel, 'amber');
        const location = objective.location;
        if (location) line(`Body: ${location.bodyName}`, 'cyan');
        if (location?.surface) {
          line(`Habitat: ${location.surface.label}`);
          line(`Surface: X ${location.surface.x}  Y ${location.surface.y}`, 'green');
        } else if (objective.kind !== 'scan') {
          line('Exact habitat coordinates pending local surface data.', 'muted');
        } else if (
          objective.kind === 'scan' &&
          objective.targetType === 'planet' &&
          objective.requiredDiscoveryLevel === 'mapped'
        ) {
          line('Landing: any accessible surface site.', 'green');
        }
        if (objective.kind === 'specimen')
          line(
            `Required: ${objective.requiredKind.toUpperCase()} / quality at least ${Math.round(objective.minimumQuality * 100)}%`,
            'green'
          );
        else if (objective.kind === 'biology-data')
          line('Required: detailed biochemical field analysis at this habitat; no capture needed.', 'green');
      }
      line('');
      line('DELIVERY', 'cyan', true);
      line(`Return to: ${mission.originStarbaseName}`, 'green');
      line(`Issuer: ${mission.issuer}`, 'muted');
      line(
        `Payment: ${mission.rewardCredits.toLocaleString()} Cr${mission.type === 'xenobiology' ? ' + remaining research value' : ''}`,
        'amber'
      );
      line(`Risk: ${mission.risk}`, mission.risk === 'High' ? 'red' : 'muted');
      line('');
      line('BRIEFING', 'cyan', true);
      line(mission.detail);
      if (status === 'READY')
        line('Delivery ready. Return to the issuing station to claim payment.', 'green');
    }
    if (this.notice) {
      lines.splice(Math.min(2, lines.length), 0, { segments: [{ text: this.notice, tone: 'amber' }] });
    }
    const width = Math.max(16, Math.min(88, cols - 12));
    const dashboard = wrapDashboardLines(lines, width);
    const footer = wrapDashboardLines(
      [
        { segments: [{ text: 'Left/Right contract  UP/DN scroll  PGUP/DN page' }] },
        {
          segments: [{ text: `${canSelectLanding ? 'ENTER select landing site  ' : ''}ESC return  J close` }],
        },
      ],
      width
    ).map((item) => item.segments.map((span) => span.text).join(''));
    const visibleRowCount = getDashboardVisibleRows(dashboard.length, rows, footer.length);
    this.viewOffset = Math.min(this.viewOffset, Math.max(0, dashboard.length - visibleRowCount));
    return {
      title: 'MISSION JOURNAL',
      subtitle: `${entries.length ? `${this.selection + 1}/${entries.length} ACTIVE` : 'NO ACTIVE'} / HELD`,
      footer,
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount,
      dashboard,
      dashboardReveal: this.reveal.progress,
    };
  }
}
