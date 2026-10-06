import type { InputManager } from './input_manager';
import type { MissionStatus, StarbaseMission } from './mission_board';
import {
  biologicalReferenceDescription,
  getMissionStatusLabel,
  isBiologicalMissionObjective,
} from './mission_board';
import { getMissionLandingObjectiveIndices } from './mission_navigation';
import { TerminalTextReveal } from './terminal_text_reveal';
import { BEHAVIOUR_OBSERVATION_LABELS } from '../entities/biology/behaviour_observations';
import type { ActiveTowRecord } from './heavy_haul_types';
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
  completedObjectiveIds?: readonly string[];
  objectiveShortfalls?: Readonly<Record<string, string>>;
  haulStage?: ActiveTowRecord['stage'];
}

export type MissionJournalReturn = 'none' | 'ship-menu' | 'rover-cargo' | 'xenobiology';

/** Owns a read-only, paused mission terminal independently of travel and station selection. */
export class MissionJournal {
  returnTo: MissionJournalReturn = 'none';
  selection = 0;
  viewOffset = 0;
  destinationIndex = 0;
  notice = '';
  readonly reveal = new TerminalTextReveal();

  /** Starts at the last inspected contract while resetting its terminal page. */
  open(returnTo: MissionJournalReturn): void {
    this.returnTo = returnTo;
    this.viewOffset = 0;
    this.destinationIndex = 0;
    this.notice = '';
    this.reveal.start();
  }

  /** Resolves the selected contract after hand-ins or restored sessions change the list. */
  selected(entries: readonly MissionJournalEntry[]): MissionJournalEntry | undefined {
    this.selection = clampIndex(this.selection, entries.length);
    return entries[this.selection];
  }

  /** Resolves the chosen actual objective, since size comparisons share a destination but habitat studies do not. */
  landingObjectiveIndex(mission: StarbaseMission): number {
    const indices = getMissionLandingObjectiveIndices(mission);
    this.destinationIndex = clampIndex(this.destinationIndex, indices.length);
    return indices[this.destinationIndex] ?? 0;
  }

  /** Consumes terminal controls, including the first key used to finish its rapid text reveal. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    entries: readonly MissionJournalEntry[],
    model: TextModalTableModel
  ): 'close' | 'landing' | 'haul' | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('MISSION_JOURNAL')) return 'close';
    if (
      entries.length &&
      (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION'))
    )
      return this.selected(entries)?.mission.type === 'heavy-haul' ? 'haul' : 'landing';
    if (input.wasActionJustPressed('BIOLOGY_SITE')) {
      const mission = this.selected(entries)?.mission;
      if (mission) {
        const destinations = getMissionLandingObjectiveIndices(mission);
        this.destinationIndex = (this.destinationIndex + 1) % Math.max(1, destinations.length);
        this.viewOffset = 0;
        this.notice = '';
      }
      return;
    }
    const cycle = input.wasActionJustPressed('MOVE_LEFT')
      ? -1
      : input.wasActionJustPressed('MOVE_RIGHT') || input.wasActionJustPressed('CYCLE_TARGET')
        ? 1
        : 0;
    if (cycle && entries.length) {
      this.selection = (this.selection + cycle + entries.length) % entries.length;
      this.viewOffset = 0;
      this.destinationIndex = 0;
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
        entry.haulStage === 'arrived'
          ? 'READY TO DEPLOY / escrow settles at installation'
          : `${getMissionStatusLabel(status)} / objectives ${entry.completed}/${entry.total}`,
        status === 'READY' || entry.haulStage === 'arrived' ? 'green' : 'amber'
      );
      if (status === 'READY' && mission.type !== 'heavy-haul')
        line(
          `All contributions ready. Claim payment at ${mission.originStarbaseName} through ${mission.type === 'xenobiology' ? 'Missions or Research' : 'Missions'}.`,
          'green'
        );
      else if (status === 'ACTIVE') {
        for (const reason of Object.values(entry.objectiveShortfalls ?? {})) line(reason, 'amber');
      }
      line(mission.summary);
      const references = new Set<string>();
      for (const objective of mission.objectives) {
        if (!isBiologicalMissionObjective(objective)) continue;
        if (references.has(objective.speciesId)) continue;
        references.add(objective.speciesId);
        line('REFERENCE ORGANISM', 'cyan', true);
        line(biologicalReferenceDescription(objective), 'cyan');
      }
      line('');
      line('DESTINATION', 'cyan', true);
      line(`System: ${mission.systemName}`);
      const landingIndex = this.landingObjectiveIndex(mission);
      const destinations = getMissionLandingObjectiveIndices(mission);
      if (destinations.length > 1)
        line(
          `LANDING TARGET ${this.destinationIndex + 1}/${destinations.length}: ${mission.objectives[landingIndex].location!.surface!.label}`,
          'cyan'
        );
      const address = mission.systemAddress;
      line(
        address
          ? `Hyperspace: X ${address.worldX}  Y ${address.worldY} / contact ${address.systemSlot + 1}`
          : 'Hyperspace coordinates not recorded; revisit the issuing system to resolve.',
        address ? 'green' : 'amber'
      );
      for (const [index, objective] of mission.objectives.entries()) {
        line('');
        const complete = entry.completedObjectiveIds
          ? entry.completedObjectiveIds.includes(objective.id)
          : status === 'READY' || status === 'COMPLETE';
        const prefix = `${mission.objectives.length > 1 && index === landingIndex ? '> ' : ''}${complete ? 'COMPLETE' : 'NEEDED'} / `;
        line(`${prefix}${objective.targetLabel}`, complete ? 'green' : 'amber');
        const location = objective.location;
        if (location) line(`Body: ${location.bodyName}`, 'cyan');
        if (location?.surface) {
          line(`Habitat: ${location.surface.label}`);
          line(`Surface: X ${location.surface.x}  Y ${location.surface.y}`, 'green');
        } else if (isBiologicalMissionObjective(objective)) {
          line('Exact habitat coordinates pending local surface data.', 'muted');
        } else if (objective.kind === 'haul') {
          line(
            `Pickup: ${objective.pickup.systemName} / X ${objective.pickup.systemAddress.worldX} Y ${objective.pickup.systemAddress.worldY}`,
            'cyan'
          );
          line(
            `Deployment: ${objective.destination.systemName} / X ${objective.destination.systemAddress.worldX} Y ${objective.destination.systemAddress.worldY}`,
            'green'
          );
          line(
            `External wet mass: ${objective.package.wetMassKg.toLocaleString()} kg / escrow paid on deployment.`,
            'amber'
          );
        } else if (
          objective.kind === 'scan' &&
          objective.targetType === 'planet' &&
          objective.requiredDiscoveryLevel === 'mapped'
        ) {
          line('Landing: any accessible surface site.', 'green');
        }
        if (objective.kind === 'specimen')
          line(
            `Required: ${objective.sizeClass ? `${objective.sizeClass.toUpperCase()} ` : ''}${objective.requiredKind.toUpperCase()} / quality at least ${Math.round(objective.minimumQuality * 100)}%`,
            'green'
          );
        else if (objective.kind === 'biology-data')
          line('Required: detailed biochemical field analysis at this habitat; no capture needed.', 'green');
        else if (objective.kind === 'biology-behaviour')
          line(
            `Required: witnessed ${BEHAVIOUR_OBSERVATION_LABELS[objective.requiredBehaviour].toLowerCase()} at this habitat / passive instruments / no capture.`,
            'green'
          );
      }
      line('');
      line('DELIVERY', 'cyan', true);
      line(
        mission.type === 'heavy-haul'
          ? 'Settlement: commission at destination / no issuer return'
          : `Return to: ${mission.originStarbaseName}`,
        'green'
      );
      line(`Issuer: ${mission.issuer}`, 'muted');
      line(
        `Payment: ${mission.rewardCredits.toLocaleString()} Cr${mission.objectives.every((objective) => objective.kind === 'biology-behaviour') ? ' / fixed field-study fee' : mission.type === 'xenobiology' ? ' + remaining research value' : ''}`,
        'amber'
      );
      line(`Risk: ${mission.risk}`, mission.risk === 'High' ? 'red' : 'muted');
      line('');
      line('BRIEFING', 'cyan', true);
      line(mission.detail);
      if (status === 'READY' && mission.type !== 'heavy-haul')
        line('Delivery ready. Return to the issuing station to claim payment.', 'green');
    }
    if (this.notice) {
      lines.splice(Math.min(2, lines.length), 0, { segments: [{ text: this.notice, tone: 'amber' }] });
    }
    const width = Math.max(16, Math.min(88, cols - 12));
    const dashboard = wrapDashboardLines(lines, width);
    const footer = wrapDashboardLines(
      [
        {
          segments: [
            {
              text: `Left/Right contract  UP/DN scroll  PGUP/DN page${entry && getMissionLandingObjectiveIndices(entry.mission).length > 1 ? '  B destination' : ''}`,
            },
          ],
        },
        {
          segments: [
            {
              text: `${entry?.mission.type === 'heavy-haul' ? 'ENTER haul manifest  ' : canSelectLanding ? 'ENTER select landing site  ' : ''}ESC return  J close`,
            },
          ],
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
