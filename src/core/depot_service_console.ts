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
  type TextTableRow,
} from './text_ui';
import type { DepotDialogIntent, DepotServiceKind, DepotServiceQuote, DepotRecord } from './depot_types';
import type { TerminalDialogSpec } from './terminal_dialog';
import { getTradeItemInfo } from './starbase_commerce';
import type { CrewMember } from './crew';

export type DepotConsoleIntent =
  | { readonly kind: 'close' }
  | { readonly kind: 'review'; readonly quote: DepotServiceQuote };

/** Creates a semantic terminal paragraph with explicit thin/thick font roles. */
function line(text: string, tone: TextTone = 'normal', heading = false): TextDashboardLine {
  return { segments: text ? [{ text, tone, font: heading ? 'thick' : 'thin' }] : [] };
}

/** Shows real extraction sources and shared stocks in a scrollable, paused resource report. */
export function createDepotResourceDialog(
  stationName: string,
  record: DepotRecord,
  stock: Readonly<Record<string, number>>
): TerminalDialogSpec<DepotDialogIntent> {
  return {
    title: 'DEPOT RESOURCE REPORT',
    kind: 'message',
    lines: [
      line(stationName, 'cyan', true),
      line(`Operational update: ${(record.lastUpdatedSeconds / 86400).toFixed(1)} elapsed days`, 'muted'),
      line('EXTRACTION', 'cyan', true),
      ...(record.extraction?.length
        ? record.extraction.flatMap((output) => [
            line(getTradeItemInfo(output.itemKey)?.name ?? output.itemKey, 'green', true),
            line(`Source: ${output.sourceBodyName}`, 'cyan'),
            line(`${output.unitsPerMonth} m^3 / 30 days; autonomous surface collection`, 'muted'),
            line(`${stock[output.itemKey] ?? 0} m^3 stored / ${output.capacity} m^3 mining cap`, 'amber'),
          ])
        : [line('Supply-dependent / no suitable nearby extraction source', 'amber')]),
      line('Full mining stores suspend collection; surplus is not banked.', 'muted'),
      line('SERVICE RESERVES', 'cyan', true),
      ...['TITANIUM_TRUSS', 'REPAIR_SPARES', 'MEDICAL_SUPPLIES', 'HELIUM_3', 'DEUTERIUM_PELLETS'].map((key) =>
        line(
          `${getTradeItemInfo(key)?.name ?? key}: ${stock[key] ?? 0} m^3`,
          (stock[key] ?? 0) > 0 ? 'green' : 'amber'
        )
      ),
      line('Manufactured supplies and reactor feedstock require deliveries.', 'muted'),
    ],
  };
}

/** Presents finite robotic work without treating a stock shortage as a permanently disabled service. */
export function createDepotServiceRows(
  repair: DepotServiceQuote,
  fuel: DepotServiceQuote,
  commissioningFuel: number,
  medical?: DepotServiceQuote
): TextTableRow[] {
  return [
    {
      id: 'resources',
      cells: ['Resource report', '--', 'ONLINE', 'Extraction sources / reserves / storage limits.'],
      detail: 'Review autonomous collection and the finite stocks shared by trade and services.',
      cellTones: ['cyan', 'muted', 'green', 'normal'],
    },
    {
      id: 'repair',
      cells: [
        'Robotic repair bay',
        `${repair.cost.toLocaleString()} Cr`,
        repair.completedUnits > 0 ? 'READY' : repair.requestedUnits ? 'LIMITED' : 'NOMINAL',
        'Hull / secured rover; finite materials and workshop spares.',
      ],
      detail: `${repair.completedUnits} / ${repair.requestedUnits} integrity points available. ${repair.shortfalls.join(' ')}`,
      cellTones: ['cyan', 'amber', repair.completedUnits > 0 ? 'green' : 'amber', 'normal'],
    },
    {
      id: 'refuel',
      cells: [
        'D/He3 reactor loading',
        commissioningFuel > 0 ? 'Contractor allowance' : `${fuel.cost.toLocaleString()} Cr`,
        commissioningFuel > 0 || fuel.completedUnits > 0 ? 'READY' : fuel.requestedUnits ? 'LIMITED' : 'FULL',
        commissioningFuel > 0
          ? `${commissioningFuel.toFixed(0)} units / restricted reactor allowance`
          : 'Finite helium-3 / deuterium; cargo supplement is optional.',
      ],
      detail:
        commissioningFuel > 0
          ? 'Commissioning fuel is separate from saleable depot stock.'
          : `${fuel.completedUnits.toFixed(0)} / ${fuel.requestedUnits.toFixed(0)} reactor units available. ${fuel.shortfalls.join(' ')}`,
      cellTones: [
        'cyan',
        'amber',
        commissioningFuel > 0 || fuel.completedUnits > 0 ? 'green' : 'amber',
        'normal',
      ],
    },
    ...(medical
      ? [
          {
            id: 'medical',
            cells: [
              'Robotic medical bay',
              `${medical.cost.toLocaleString()} Cr`,
              medical.completedUnits > 0 ? 'READY' : medical.requestedUnits ? 'LIMITED' : 'NOMINAL',
              'Trauma care / finite sterile supplies.',
            ],
            detail: `${medical.completedUnits} / ${medical.requestedUnits} health points available. ${medical.shortfalls.join(' ')}`,
            cellTones: [
              'cyan',
              'amber',
              medical.completedUnits > 0 ? 'green' : 'amber',
              'normal',
            ] as TextTone[],
          },
        ]
      : []),
  ];
}

/** Describes exact supplies before a confirmed work order may consume any stock or ship cargo. */
export function createDepotServiceDialog(quote: DepotServiceQuote): TerminalDialogSpec<DepotDialogIntent> {
  const possible = quote.completedUnits > 0;
  return {
    title: possible ? 'AUTHORISE ROBOTIC SERVICE' : 'SERVICE UNAVAILABLE',
    kind: possible ? 'confirmation' : 'message',
    intent: possible ? { kind: 'depot-service', quote } : undefined,
    defaultYes: false,
    lines: [
      line(quote.label, 'cyan', true),
      line(quote.condition, 'muted'),
      line(
        `${quote.completedUnits.toLocaleString()} / ${quote.requestedUnits.toLocaleString()} ${quote.unitLabel}`,
        possible ? 'green' : 'amber'
      ),
      line(`Total ${quote.cost.toLocaleString()} Cr`, 'amber'),
      ...Object.entries(quote.stationSupplies).map(([key, units]) =>
        line(`Depot: ${units} m^3 ${getTradeItemInfo(key)?.name ?? key}`, 'cyan')
      ),
      ...Object.entries(quote.cargoSupplies).map(([key, units]) =>
        line(`Ship cargo: ${units} m^3 ${getTradeItemInfo(key)?.name ?? key}`, 'amber')
      ),
      ...quote.shortfalls.map((text) => line(text, 'amber')),
      ...(possible
        ? [
            line('Supplies are issued as sealed service batches.', 'muted'),
            line('Authorise this work order and its listed supplies?', 'green'),
          ]
        : []),
    ],
  };
}

/** Owns a paused supply-aware service terminal; all prices and work come from prepared domain quotes. */
export class DepotServiceConsole {
  kind: DepotServiceKind = 'repair';
  selectedId = 'all';
  useCargo = false;
  viewOffset = 0;
  notice = '';
  noticeTone: TextTone = 'green';
  readonly reveal = new TerminalTextReveal();
  private followSelection = false;

  /** Opens a fresh terminal with cargo supplementation disabled until explicitly selected. */
  open(kind: DepotServiceKind, selectedId = kind === 'fuel' ? 'fuel' : 'all'): void {
    this.kind = kind;
    this.selectedId = selectedId;
    this.useCargo = false;
    this.viewOffset = 0;
    this.notice = '';
    this.reveal.start();
    this.followSelection = selectedId !== 'all';
  }

  /** Consumes terminal controls, including reveal skipping, without applying any gameplay work. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    quotes: readonly DepotServiceQuote[],
    visibleRows: number
  ): DepotConsoleIntent | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM'))
      return { kind: 'close' };
    if (input.wasActionJustPressed('CYCLE_TARGET')) {
      this.useCargo = !this.useCargo;
      this.notice = '';
      return;
    }
    const reviewAll = this.kind !== 'fuel' && input.wasActionJustPressed('APPROACH_TARGET');
    if (
      reviewAll ||
      input.wasActionJustPressed('ENTER_SYSTEM') ||
      input.wasActionJustPressed('PRIMARY_ACTION')
    ) {
      const quote = quotes.find((candidate) => candidate.targetId === (reviewAll ? 'all' : this.selectedId));
      if (quote) return { kind: 'review', quote };
    }
    const selectionDelta = input.wasActionJustPressed('MOVE_UP')
      ? -1
      : input.wasActionJustPressed('MOVE_DOWN')
        ? 1
        : 0;
    if (selectionDelta) {
      const index = Math.max(
        0,
        quotes.findIndex((quote) => quote.targetId === this.selectedId)
      );
      this.selectedId = quotes[clampIndex(index + selectionDelta, quotes.length)]?.targetId ?? 'all';
      this.followSelection = true;
      this.notice = '';
    }
    const pageDelta = input.wasActionJustPressed('PAGE_UP')
      ? -visibleRows
      : input.wasActionJustPressed('PAGE_DOWN')
        ? visibleRows
        : 0;
    if (pageDelta) {
      this.viewOffset += pageDelta;
      this.followSelection = false;
    }
  }

  /** Exposes all service controls through the same clickable command bar as keyboard input. */
  createCommandBar(): CommandBarModel {
    return {
      context: 'robotic service',
      buttons: [
        commandButton('previous', 'Previous', 'MOVE_UP', { key: 'Up' }),
        commandButton('next', 'Next', 'MOVE_DOWN', { key: 'Down' }),
        commandButton('page-up', 'Previous page', 'PAGE_UP', { key: 'PgUp' }),
        commandButton('page-down', 'Next page', 'PAGE_DOWN', { key: 'PgDn' }),
        commandButton('cargo', 'Cargo supplement', 'CYCLE_TARGET', {
          key: 'Tab',
          tone: this.useCargo ? 'green' : 'normal',
        }),
        commandButton('review', 'Review selected', 'ENTER_SYSTEM', { key: 'Enter', tone: 'green' }),
        ...(this.kind !== 'fuel'
          ? [commandButton('all', 'Review all', 'APPROACH_TARGET', { key: 'A' })]
          : []),
        commandButton('return', 'Services', 'QUIT', { key: 'Esc' }),
      ],
    };
  }

  /** Wraps diagnostic facts and quotes to the actual grid, keeping selection and manual paging independent. */
  createModel(
    stationName: string,
    quotes: readonly DepotServiceQuote[],
    supplies: readonly { readonly name: string; readonly units: number }[],
    credits: number,
    cols: number,
    rows: number,
    patients: readonly Pick<CrewMember, 'name' | 'hitPoints' | 'maxHitPoints'>[] = []
  ): TextModalTableModel {
    const fullWidth = cols < 90;
    const width = Math.max(1, Math.min(78, cols - (fullWidth ? 8 : 12)));
    const lines: TextDashboardLine[] = [];
    /** Preserves semantic font and colour spans through measured terminal wrapping. */
    const add = (text: string, tone: TextTone = 'normal', heading = false): void => {
      lines.push(...wrapDashboardLines([line(text, tone, heading)], width));
    };
    add(stationName, 'cyan', true);
    add(
      this.kind === 'fuel'
        ? 'D/He3 loader / finite feedstock'
        : this.kind === 'medical'
          ? 'Human trauma protocol / autonomous care'
          : 'Robotic bay / hull & secured rover'
    );
    add(`Account ${credits.toLocaleString()} Cr`, 'amber');
    add(
      `${this.useCargo ? '[X]' : '[ ]'} Supplement shortages from ship cargo`,
      this.useCargo ? 'amber' : 'muted'
    );
    if (this.notice) add(this.notice, this.noticeTone);
    add('');
    add('DEPOT SUPPLIES', 'cyan', true);
    for (const supply of supplies)
      add(`${supply.name} / ${supply.units.toLocaleString()} m^3`, supply.units > 0 ? 'green' : 'amber');
    add('');
    if (this.kind === 'medical') {
      add('CREW VITALS', 'cyan', true);
      for (const member of patients) {
        const fraction = Math.max(0, Math.min(1, member.hitPoints / member.maxHitPoints));
        const filled = Math.round(fraction * 10);
        add(member.name, 'cyan');
        add(
          `[${'='.repeat(filled)}${'.'.repeat(10 - filled)}] ${member.hitPoints}/${member.maxHitPoints} HP`,
          member.hitPoints <= 0 ? 'red' : fraction < 1 ? 'amber' : 'green'
        );
        if (member.hitPoints <= 0) add('No lifesigns / treatment unavailable', 'red');
      }
      if (!patients.length) add('No crew manifest', 'muted');
      add('');
    }
    add('WORK ORDERS', 'cyan', true);
    if (!quotes.some((quote) => quote.targetId === this.selectedId))
      this.selectedId = quotes[0]?.targetId ?? 'all';
    let selectedStart = 0;
    let selectedEnd = 0;
    for (const quote of quotes) {
      const selected = quote.targetId === this.selectedId;
      const start = lines.length;
      lines.push(
        ...wrapDashboardLines(
          [
            {
              segments: [
                { text: selected ? '> ' : '  ', font: 'thick', tone: selected ? 'green' : 'muted' },
                { text: quote.label, font: 'thick', tone: selected ? 'bright' : 'cyan' },
              ],
            },
          ],
          width
        )
      );
      add(quote.condition, 'muted');
      add(
        `${quote.completedUnits.toLocaleString()} / ${quote.requestedUnits.toLocaleString()} ${quote.unitLabel}`,
        quote.completedUnits > 0 ? 'green' : 'muted'
      );
      add(
        `${quote.cost.toLocaleString()} Cr / ${quote.completedUnits < quote.requestedUnits ? 'limited work' : 'full service'}`,
        'amber'
      );
      for (const shortage of quote.shortfalls) add(shortage, quote.completedUnits > 0 ? 'amber' : 'muted');
      if (selected) {
        selectedStart = start;
        selectedEnd = lines.length;
      }
      add('');
    }
    const footer = wrapDashboardLines(
      [line('Enter review / Esc back'), line('Tab cargo / PgUp/PgDn')],
      width
    ).map((entry) => entry.segments.map((segment) => segment.text).join(''));
    const visibleRows = getDashboardVisibleRows(lines.length, rows, footer.length);
    this.viewOffset = Math.max(0, Math.min(this.viewOffset, lines.length - visibleRows));
    if (this.followSelection) {
      if (selectedEnd - selectedStart > visibleRows) this.viewOffset = selectedStart;
      else if (selectedEnd > this.viewOffset + visibleRows) this.viewOffset = selectedEnd - visibleRows;
      if (selectedStart < this.viewOffset) this.viewOffset = selectedStart;
      this.followSelection = false;
    }
    return {
      title: this.kind === 'fuel' ? 'FUEL BAY' : this.kind === 'medical' ? 'MEDICAL BAY' : 'REPAIR BAY',
      subtitle: 'ROBOTIC SERVICE',
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount: visibleRows,
      dashboard: lines,
      dashboardFullWidth: fullWidth,
      dashboardReveal: this.reveal.progress,
      footer,
    };
  }
}
