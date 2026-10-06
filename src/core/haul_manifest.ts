import { AU_IN_METERS } from '../constants/physics';
import type { InputManager } from './input_manager';
import { commandButton, type CommandBarModel } from './command_bar';
import type { ActiveTowRecord, HaulJourneyReceipt, HaulQuoteResult } from './heavy_haul_types';
import { getHeavyHaulObjective, type StarbaseMission } from './mission_board';
import { TerminalTextReveal } from './terminal_text_reveal';
import {
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardLine,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

export type HaulManifestStage = 'available' | ActiveTowRecord['stage'] | 'complete' | 'none';
export type HaulManifestAction = 'accept' | 'couple' | 'depart' | 'deploy' | 'recover';
export interface HaulManifestData {
  readonly mission?: StarbaseMission;
  readonly stage: HaulManifestStage;
  readonly quote: HaulQuoteResult;
  readonly normalFuel: number;
  readonly maximumFuel: number;
  readonly remainingSupport: number;
  readonly departureDate: string;
  readonly arrivalDate: string;
  readonly staging: string;
  readonly receipt?: HaulJourneyReceipt;
  readonly recentOutcome?: string;
}
export type HaulManifestReturn = 'none' | 'ship-menu' | 'mission-journal';
export type HaulManifestIntent = 'close' | 'navigate' | HaulManifestAction;

/** Formats strategic time without concealing short jobs behind rounded days or long jobs behind seconds. */
export function formatHaulDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.ceil(seconds / 60))} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
  if (seconds < 365.25 * 86400) return `${(seconds / 86400).toFixed(1)} days`;
  return `${(seconds / (365.25 * 86400)).toFixed(2)} years`;
}

/** A paused terminal presentation; it emits intents, never moves a vessel or mutates contract owners. */
export class HaulManifest {
  returnTo: HaulManifestReturn = 'none';
  data: HaulManifestData | null = null;
  viewOffset = 0;
  notice = '';
  noticeTone: TextTone = 'amber';
  readonly reveal = new TerminalTextReveal();

  /** Begins one inspection; quote computation happens at this boundary, not during every render. */
  open(data: HaulManifestData, returnTo: HaulManifestReturn): void {
    this.data = data;
    this.returnTo = returnTo;
    this.viewOffset = 0;
    this.notice = '';
    this.reveal.start();
  }

  /** Refreshes after a transition or failed revalidation without concealing its result behind another reveal. */
  refresh(data: HaulManifestData, message: string, ok: boolean): void {
    this.data = data;
    this.notice = message;
    this.noticeTone = ok ? 'green' : 'red';
    this.viewOffset = 0;
    this.reveal.complete();
  }

  /** Resolves the one context-specific primary action, never treating an arrived package as a new departure. */
  primary(): HaulManifestAction | null {
    switch (this.data?.stage) {
      case 'available':
        return 'accept';
      case 'awaiting-pickup':
        return 'couple';
      case 'attached':
        return 'depart';
      case 'arrived':
        return 'deploy';
      default:
        return null;
    }
  }

  /** Consumes reveal-skipping keys and emits actions for the outer owner's explicit Yes/No dialog. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    model: TextModalTableModel
  ): HaulManifestIntent | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM')) {
      return 'close';
    }
    if (input.wasActionJustPressed('TARGET_MENU') && (this.primary() || this.data?.stage === 'complete')) {
      return 'navigate';
    }
    if (
      input.wasActionJustPressed('BIOLOGY_COLLECT') &&
      ['awaiting-pickup', 'attached', 'arrived'].includes(this.data?.stage ?? '')
    ) {
      return 'recover';
    }
    if (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION')) {
      return this.primary() ?? undefined;
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

  /** Exposes all supported controls in the clickable command strip using their existing context-bound keys. */
  createCommandBar(): CommandBarModel {
    const primary = this.primary();
    return {
      context: 'heavy-haul manifest',
      targetName: this.data?.mission?.title,
      buttons: [
        commandButton('scroll-up', 'Scroll up', 'MOVE_UP', { key: 'Up' }),
        commandButton('scroll-down', 'Scroll down', 'MOVE_DOWN', { key: 'Down' }),
        commandButton('page-up', 'Previous page', 'PAGE_UP', { key: 'PgUp' }),
        commandButton('page-down', 'Next page', 'PAGE_DOWN', { key: 'PgDn' }),
        ...(primary
          ? [
              commandButton(
                'primary',
                primary === 'depart' ? 'Begin voyage' : `${primary[0].toUpperCase()}${primary.slice(1)}`,
                'ENTER_SYSTEM',
                { key: 'Enter', tone: 'green' }
              ),
            ]
          : []),
        ...(primary || this.data?.stage === 'complete'
          ? [
              commandButton(
                'navigate',
                this.data?.stage === 'complete' ? 'Route home' : 'Route / approach',
                'TARGET_MENU',
                { key: 'N' }
              ),
            ]
          : []),
        ...(['awaiting-pickup', 'attached', 'arrived'].includes(this.data?.stage ?? '')
          ? [commandButton('recover', 'Contractor recovery', 'BIOLOGY_COLLECT', { key: 'C', tone: 'red' })]
          : []),
        commandButton('return', 'Return', 'QUIT', { key: 'Esc' }),
      ],
    };
  }

  /** Builds a wrapped, colour-coded dossier with strong headers and thin terminal measurements. */
  createModel(cols: number, rows: number): TextModalTableModel {
    const data = this.data;
    const mission = data?.mission;
    const objective = mission && getHeavyHaulObjective(mission);
    const lines: TextDashboardLine[] = [];
    /** Adds a semantic paragraph; responsive wrapping is done once after assembling the dossier. */
    const line = (text: string, tone: TextTone = 'normal', heading = false): void => {
      lines.push({ segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] });
    };
    if (this.notice) {
      line(this.notice, this.noticeTone);
      line('');
    }
    if (!data || !mission || !objective) {
      line('NO ACTIVE EXTERNAL HAUL', 'cyan', true);
      line('Infrastructure Logistics / staffed port mission boards', 'muted');
      if (data?.receipt) {
        line('');
        line('LATEST VOYAGE RECEIPT', 'cyan', true);
        line(
          `Elapsed ${formatHaulDuration(data.receipt.durationSeconds)} / support ${data.receipt.supportFuelConsumedUnits.toFixed(0)} units`,
          'green'
        );
        line(`Depart ${data.departureDate}`, 'muted');
        line(`Arrive ${data.arrivalDate}`, 'green');
        line(data.recentOutcome ?? 'Receipt recorded', 'amber');
      }
    } else {
      line(mission.title, 'cyan', true);
      line(
        data.stage === 'arrived'
          ? 'READY TO DEPLOY'
          : data.stage === 'complete'
            ? 'COMMISSIONED / ESCROW PAID'
            : data.stage.toUpperCase().replace('-', ' '),
        data.stage === 'arrived' || data.stage === 'complete' ? 'green' : 'amber'
      );
      line(`ESCROW ${mission.rewardCredits.toLocaleString()} Cr / settlement at deployment`, 'amber');
      line(data.staging, 'green');
      line('');
      line('ROUTE SOLUTION', 'cyan', true);
      for (const [label, endpoint] of [
        ['PICKUP', objective.pickup],
        ['DEPLOY', objective.destination],
      ] as const) {
        line(`${label} / ${endpoint.systemName}`, 'cyan');
        line(
          `X ${endpoint.systemAddress.worldX} / Y ${endpoint.systemAddress.worldY} / contact ${endpoint.systemAddress.systemSlot + 1}`,
          'green'
        );
        line(
          `${(endpoint.orbit.radiusM / AU_IN_METERS).toFixed(2)} AU / ${endpoint.orbit.host.kind}${endpoint.orbit.host.starId ? ` star ${endpoint.orbit.host.starId}` : ''}`,
          'muted'
        );
      }
      if (objective.route.kind === 'interstellar') {
        line('');
        line('HOMEWARD ROUTE / OPTIONAL', 'cyan', true);
        line(mission.originStarbaseName, 'green');
        line(
          `X ${objective.pickup.systemAddress.worldX} / Y ${objective.pickup.systemAddress.worldY} / return untowed`,
          'green'
        );
        line('Payment at deployment / normal reactor fuel reserved for the route home', 'muted');
      }
      line('');
      line('EXTERNAL PACKAGE', 'cyan', true);
      line(`${objective.targetName} / ${objective.package.sizeClass.toUpperCase()}`, 'green');
      line(
        `Dry ${objective.package.dryMassKg.toLocaleString()} kg / wet ${objective.package.wetMassKg.toLocaleString()} kg`,
        'amber'
      );
      line(
        `Minimum drive C${objective.package.minimumEngineClass} / coupler C${objective.package.minimumCouplerClass}`
      );
      line('External tow / no internal cargo volume occupied', 'muted');
      const quote = data.quote.quote;
      if (quote) {
        line('');
        line('VOYAGE & CERTIFICATION', 'cyan', true);
        line(
          `Duration ${formatHaulDuration(quote.durationSeconds)} / ${quote.requiredBerths ? 'CREW HYPERSLEEP' : 'SHORT TRANSFER'}`,
          'amber'
        );
        line(`Depart ${data.departureDate}`, 'muted');
        line(`Arrive ${data.arrivalDate}`, 'green');
        line(`Certified tow limit ${quote.maximumTowMassKg.toLocaleString()} kg`);
        line(
          `Hypersleep ${quote.functionalBerths} functional berths / ${quote.requiredBerths} required`,
          quote.functionalBerths >= quote.requiredBerths ? 'green' : 'red'
        );
        line(
          `Local handling ${(quote.localStepFactor * 100).toFixed(0)}% / strategic drive load calculated separately`,
          'muted'
        );
        line('');
        line('SEALED PROPULSION SUPPORT', 'cyan', true);
        line(
          data.stage === 'complete'
            ? 'Contractor tank released / no remaining ship connection'
            : `Contractor tank ${data.remainingSupport.toFixed(0)} / ${objective.package.supportFuelCapacityUnits.toFixed(0)} units`,
          'green'
        );
        line(`Transit ${quote.transitFuelUnits.toFixed(0)} units / approach reserve retained`, 'muted');
        line(
          `Normal reactor ${data.normalFuel.toFixed(0)} / ${data.maximumFuel.toFixed(0)} units / transit debit ZERO`,
          'green'
        );
        line(
          `Onward reserve ${quote.onwardFuelRequiredUnits.toFixed(0)} units / verified supply port`,
          'amber'
        );
        if (objective.package.commissioningFuelAllowanceUnits)
          line(
            `Depot commissioning refill ${objective.package.commissioningFuelAllowanceUnits} units / normal tank only`,
            'green'
          );
      }
      if (data.stage !== 'arrived' && data.stage !== 'complete') {
        line('');
        line('DEPARTURE AUDIT', 'cyan', true);
        if (data.quote.ok) line('Equipment, crew and propulsion support certified', 'green');
        else for (const reason of data.quote.reasons) line(reason, 'red');
      }
      if (data.receipt) {
        line('');
        line('VOYAGE RECEIPT', 'cyan', true);
        line(
          `Elapsed ${formatHaulDuration(data.receipt.durationSeconds)} / support ${data.receipt.supportFuelConsumedUnits.toFixed(0)} units`,
          'green'
        );
        line('Recorded once / no repeat transit or escrow', 'muted');
      }
      line('');
      line('CONTRACT TERMS', 'cyan', true);
      line(mission.detail);
    }
    const dashboardFullWidth = cols < 54;
    const width = Math.max(1, Math.min(88, cols - (dashboardFullWidth ? 8 : 12)));
    const dashboard = wrapDashboardLines(lines, width);
    const footer = wrapDashboardLines(
      [{ segments: [{ text: 'UP/DN scroll  PGUP/DN page  ESC return' }] }],
      width
    ).map((entry) => entry.segments.map((segment) => segment.text).join(''));
    const visibleRowCount = getDashboardVisibleRows(dashboard.length, rows, footer.length);
    this.viewOffset = Math.min(this.viewOffset, Math.max(0, dashboard.length - visibleRowCount));
    return {
      title: 'HEAVY-HAUL MANIFEST',
      subtitle: 'LOGISTICS / ESCROW',
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount,
      dashboard,
      dashboardFullWidth,
      dashboardReveal: this.reveal.progress,
      footer,
    };
  }
}
