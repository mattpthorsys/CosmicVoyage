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
  confirmation: HaulManifestAction | null = null;
  readonly reveal = new TerminalTextReveal();

  /** Begins one inspection; quote computation happens at this boundary, not during every render. */
  open(data: HaulManifestData, returnTo: HaulManifestReturn): void {
    this.data = data;
    this.returnTo = returnTo;
    this.viewOffset = 0;
    this.notice = '';
    this.confirmation = null;
    this.reveal.start();
  }

  /** Refreshes after a transition or failed revalidation without concealing its result behind another reveal. */
  refresh(data: HaulManifestData, message: string, ok: boolean): void {
    this.data = data;
    this.notice = message;
    this.noticeTone = ok ? 'green' : 'red';
    this.confirmation = null;
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

  /** Consumes reveal-skipping keys and requires a second explicit confirmation for irreversible actions. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    model: TextModalTableModel
  ): HaulManifestIntent | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM')) {
      if (this.confirmation) {
        this.confirmation = null;
        return;
      }
      return 'close';
    }
    if (input.wasActionJustPressed('TARGET_MENU') && this.primary()) {
      this.confirmation = null;
      return 'navigate';
    }
    if (
      input.wasActionJustPressed('BIOLOGY_COLLECT') &&
      ['awaiting-pickup', 'attached', 'arrived'].includes(this.data?.stage ?? '')
    ) {
      this.confirmation = 'recover';
      this.viewOffset = 0;
      return;
    }
    if (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION')) {
      if (this.confirmation) {
        const action = this.confirmation;
        this.confirmation = null;
        return action;
      }
      this.confirmation = this.primary();
      this.viewOffset = 0;
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
                'confirm',
                this.confirmation
                  ? `Confirm ${this.confirmation}`
                  : primary === 'depart'
                    ? 'Begin voyage'
                    : `${primary[0].toUpperCase()}${primary.slice(1)}`,
                'ENTER_SYSTEM',
                { key: 'Enter', tone: this.confirmation === 'recover' ? 'red' : 'green' }
              ),
              commandButton('navigate', 'Route / approach', 'TARGET_MENU', { key: 'N' }),
            ]
          : []),
        ...(['awaiting-pickup', 'attached', 'arrived'].includes(this.data?.stage ?? '')
          ? [commandButton('recover', 'Contractor recovery', 'BIOLOGY_COLLECT', { key: 'C', tone: 'red' })]
          : []),
        commandButton('return', this.confirmation ? 'Cancel confirmation' : 'Return', 'QUIT', { key: 'Esc' }),
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
    if (this.confirmation) {
      line(
        `CONFIRM ${this.confirmation.toUpperCase()}`,
        this.confirmation === 'recover' ? 'red' : 'amber',
        true
      );
      line(
        this.confirmation === 'recover'
          ? 'Package and support tank will be recovered. No payment; offer permanently retired.'
          : this.confirmation === 'depart'
            ? `Advance ${formatHaulDuration(data?.quote.quote?.durationSeconds ?? 0)} of voyage time. Crew and normal reactor fuel remain secured.`
            : this.confirmation === 'deploy'
              ? 'Commission this installation, release the contractor tank and settle escrow once.'
              : this.confirmation === 'accept'
                ? "Reserve this job as the ship's one active external haul."
                : 'Attach the external package and its sealed propulsion-support tank.',
        'amber'
      );
      line('ENTER confirm / ESC cancel', 'green');
      line('');
    }
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
    const width = Math.max(1, Math.min(88, cols - 12));
    const dashboard = wrapDashboardLines(lines, width);
    const footer = wrapDashboardLines(
      [{ segments: [{ text: 'UP/DN scroll  PGUP/DN page  ESC return' }] }],
      width
    ).map((entry) => entry.segments.map((segment) => segment.text).join(''));
    const visibleRowCount = getDashboardVisibleRows(dashboard.length, rows, footer.length);
    this.viewOffset = Math.min(this.viewOffset, Math.max(0, dashboard.length - visibleRowCount));
    return {
      title: 'HEAVY-HAUL MANIFEST',
      subtitle: 'INFRASTRUCTURE LOGISTICS / ESCROW LINK',
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount,
      dashboard,
      dashboardReveal: this.reveal.progress,
      footer,
    };
  }
}
