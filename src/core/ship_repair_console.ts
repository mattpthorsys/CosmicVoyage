import type { Player } from './player';
import type { InputManager } from './input_manager';
import { commandButton, type CommandBarModel } from './command_bar';
import {
  createShipRepairOrders,
  getShipDerivedStats,
  repairShipDamage,
  ROVER_REPAIR_COST_PER_POINT,
  type ShipDamageSubsystem,
  type StarbaseShipyardProfile,
} from './ship_modifications';
import { TerminalTextReveal } from './terminal_text_reveal';
import {
  clampIndex,
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardLine,
  type TextDashboardSegment,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

type RepairAccount = Pick<Player, 'ship' | 'terrainVehicle' | 'resources'>;
export type RepairTarget = 'all' | 'hull' | 'rover' | ShipDamageSubsystem;
export interface RepairQuote {
  target: RepairTarget;
  label: string;
  condition: string;
  cost: number;
}
export type RepairConsoleIntent = { kind: 'close' } | { kind: 'repair'; target: RepairTarget };

/** Quotes only current damage, including a secured rover at the same established port service rate. */
export function createRepairQuotes(player: RepairAccount, basic = false): RepairQuote[] {
  const orders: RepairQuote[] = createShipRepairOrders(player.ship)
    .filter((order) => !basic || order.target === 'hull')
    .map((order) => ({
      target: order.target,
      label: order.label,
      condition: `${order.integrityPercent}% integrity`,
      cost: order.cost,
    }));
  const rover = player.terrainVehicle;
  const integrity = Math.max(0, Math.min(100, rover.integrity ?? 100));
  if (rover.available && integrity < 100)
    orders.push({
      target: 'rover',
      label: 'Terrain vehicle',
      condition: `${Math.round(integrity)}% integrity`,
      cost: Math.ceil((100 - integrity) * ROVER_REPAIR_COST_PER_POINT),
    });
  return [
    {
      target: 'all',
      label: basic ? 'Basic hull / rover restoration' : 'Complete restoration',
      condition: orders.length ? `${orders.length} damaged systems` : 'All systems nominal',
      cost: orders.reduce((total, order) => total + order.cost, 0),
    },
    ...orders,
  ];
}

/** Requotes at purchase time and performs an affordable work order without touching unrelated damage. */
export function purchaseRepairs(
  player: RepairAccount,
  target: RepairTarget,
  basic = false
): { ok: boolean; cost: number; message: string } {
  const quote = createRepairQuotes(player, basic).find((order) => order.target === target);
  if (!quote || quote.cost <= 0)
    return { ok: false, cost: 0, message: 'No repair work required for this selection.' };
  if (player.resources.credits < quote.cost)
    return {
      ok: false,
      cost: 0,
      message: `Insufficient credits. Required ${quote.cost.toLocaleString()} Cr.`,
    };
  if (target === 'all') {
    if (basic) player.ship.damage.hullIntegrity = player.ship.damage.maxHullIntegrity;
    else repairShipDamage(player.ship);
    if (player.terrainVehicle.available) player.terrainVehicle.integrity = 100;
  } else if (target === 'hull') player.ship.damage.hullIntegrity = player.ship.damage.maxHullIntegrity;
  else if (target === 'rover') player.terrainVehicle.integrity = 100;
  else delete player.ship.damage.subsystemDamage[target];
  player.resources.credits -= quote.cost;
  return {
    ok: true,
    cost: quote.cost,
    message: `${quote.label} restored. Paid ${quote.cost.toLocaleString()} Cr.`,
  };
}

/** Owns the yard's paused, scrollable diagnostic terminal independently of station tab selection. */
export class ShipRepairConsole {
  selectedTarget: RepairTarget = 'all';
  viewOffset = 0;
  notice = '';
  noticeTone: TextTone = 'green';
  readonly reveal = new TerminalTextReveal();

  /** Starts a fresh diagnostic readout without committing any work orders. */
  open(): void {
    this.selectedTarget = 'all';
    this.viewOffset = 0;
    this.notice = '';
    this.reveal.start();
  }

  /** Consumes controls exclusively; the first key completes the diagnostic text reveal. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    quotes: readonly RepairQuote[],
    visibleRows: number
  ): RepairConsoleIntent | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM'))
      return { kind: 'close' };
    if (input.wasActionJustPressed('APPROACH_TARGET')) return { kind: 'repair', target: 'all' };
    if (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION'))
      return { kind: 'repair', target: this.selectedTarget };
    const delta = input.wasActionJustPressed('MOVE_UP')
      ? -1
      : input.wasActionJustPressed('MOVE_DOWN')
        ? 1
        : input.wasActionJustPressed('PAGE_UP')
          ? -Math.max(1, Math.floor(visibleRows / 3))
          : input.wasActionJustPressed('PAGE_DOWN')
            ? Math.max(1, Math.floor(visibleRows / 3))
            : 0;
    if (!delta) return;
    const index = Math.max(
      0,
      quotes.findIndex((quote) => quote.target === this.selectedTarget)
    );
    this.selectedTarget = quotes[clampIndex(index + delta, quotes.length)]?.target ?? 'all';
    this.notice = '';
  }

  /** Exposes the same work-order controls to the clickable bottom menu. */
  createCommandBar(returnLabel = 'Shipyard'): CommandBarModel {
    return {
      context: 'repair control',
      buttons: [
        commandButton('previous', 'Previous system', 'MOVE_UP', { key: 'Up' }),
        commandButton('next', 'Next system', 'MOVE_DOWN', { key: 'Down' }),
        commandButton('page-up', 'Previous page', 'PAGE_UP', { key: 'PgUp' }),
        commandButton('page-down', 'Next page', 'PAGE_DOWN', { key: 'PgDn' }),
        commandButton('repair', 'Repair selected', 'ENTER_SYSTEM', { key: 'Enter', tone: 'green' }),
        commandButton('all', 'Repair all', 'APPROACH_TARGET', { key: 'A', tone: 'green' }),
        commandButton('return', returnLabel, 'QUIT', { key: 'Esc' }),
      ],
    };
  }

  /** Builds a colour-coded diagnostic display and keeps each selected work order fully in view. */
  createModel(
    player: RepairAccount,
    stationName: string,
    profile: StarbaseShipyardProfile,
    cols: number,
    rows: number,
    basic = false,
    returnLabel = basic ? 'Services' : 'Shipyard'
  ): TextModalTableModel {
    const width = Math.max(1, Math.min(72, cols - 12));
    const quotes = createRepairQuotes(player, basic);
    if (!quotes.some((quote) => quote.target === this.selectedTarget)) this.selectedTarget = 'all';
    const lines: TextDashboardLine[] = [];
    /** Adds a terminal paragraph while preserving semantic colours through word wrapping. */
    const line = (text: string, tone: TextTone = 'normal', heading = false): void => {
      lines.push(
        ...wrapDashboardLines(
          [{ segments: text ? [{ text, tone, font: heading ? 'thick' : 'thin' }] : [] }],
          width
        )
      );
    };
    /** Displays a normalized condition bar, independent of the selected work order. */
    const condition = (label: string, percent: number): void => {
      const value = Math.max(0, Math.min(100, Math.round(percent)));
      const filled = Math.round(value / 10);
      line(
        `${label} [${'='.repeat(filled)}${'.'.repeat(10 - filled)}] ${value}%`,
        value < 40 ? 'red' : value < 90 ? 'amber' : 'green'
      );
    };
    line(stationName, 'cyan', true);
    condition('HULL ', getShipDerivedStats(player.ship).hullIntegrityPercent);
    if (player.terrainVehicle.available) condition('ROVER', player.terrainVehicle.integrity ?? 100);
    else line('ROVER / vehicle absent', 'muted');
    line(`RESTORATION QUOTE ${quotes[0].cost.toLocaleString()} Cr`, quotes[0].cost ? 'amber' : 'green');
    line(`ACCOUNT ${player.resources.credits.toLocaleString()} Cr`, 'cyan');
    line('Diagnostic link stable', 'muted');
    line('');
    line('WORK ORDERS', 'cyan', true);
    let selectedStart = lines.length;
    let selectedEnd = selectedStart;
    for (const quote of quotes) {
      const selected = quote.target === this.selectedTarget;
      const start = lines.length;
      const segments: TextDashboardSegment[] = [
        { text: selected ? '> ' : '  ', tone: selected ? 'green' : 'muted', font: 'thick' },
        { text: quote.label, tone: selected ? 'bright' : 'cyan', font: 'thick' },
        {
          text: ` / ${quote.cost.toLocaleString()} Cr`,
          tone: quote.cost > player.resources.credits ? 'red' : 'amber',
          font: 'thin',
        },
      ];
      lines.push(...wrapDashboardLines([{ segments }], width));
      line(`  ${quote.condition}`, quote.cost ? 'normal' : 'green');
      if (selected && this.notice) line(this.notice, this.noticeTone);
      if (selected) {
        selectedStart = start;
        selectedEnd = lines.length;
      }
      line('');
    }
    const footer = wrapDashboardLines(
      [
        { segments: [{ text: 'UP/DN select  PGUP/DN page' }] },
        { segments: [{ text: `ENTER repair  A repair all  ESC ${returnLabel}` }] },
      ],
      width
    ).map((entry) => entry.segments.map((segment) => segment.text).join(''));
    const visibleRows = getDashboardVisibleRows(lines.length, rows, footer.length);
    const maxOffset = Math.max(0, lines.length - visibleRows);
    this.viewOffset = Math.max(0, Math.min(this.viewOffset, maxOffset));
    if (selectedEnd > this.viewOffset + visibleRows) this.viewOffset = selectedEnd - visibleRows;
    if (selectedStart < this.viewOffset) this.viewOffset = selectedStart;
    return {
      title: 'REPAIR CONTROL',
      subtitle: basic
        ? 'AUTOMATED DRONES / HULL & ROVER SERVICE'
        : `${profile.label} / ${profile.repairQuality.toUpperCase()} SERVICE`,
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount: visibleRows,
      dashboard: lines,
      dashboardReveal: this.reveal.progress,
      footer,
    };
  }
}
