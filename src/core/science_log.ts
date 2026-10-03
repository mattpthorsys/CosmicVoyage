import type { BiologyOrigin, SpeciesEvidence, SpecimenContainer } from '../entities/biology/biology_types';
import type { InputManager } from './input_manager';
import type { MissionJournalReturn } from './mission_journal';
import { TerminalTextReveal } from './terminal_text_reveal';
import { createBiologicalDossier } from './xenobiology_ui';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import type { XenobiologyService } from './xenobiology_service';
import {
  clampIndex,
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardLine,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

const FILTERS = ['ALL', 'NOVEL', 'UNSUBMITTED', 'ABOARD'] as const;

/** Presents acquired evidence and explicit return coordinates without exposing unvisited biological data. */
export class ScienceLog {
  returnTo: MissionJournalReturn = 'none';
  selectedId: string | null = null;
  originIndex = 0;
  filter = 0;
  viewOffset = 0;
  notice = '';
  readonly reveal = new TerminalTextReveal();

  /** Opens a paused record, preserving the last selected species. */
  open(returnTo: MissionJournalReturn): void {
    this.returnTo = returnTo;
    this.viewOffset = 0;
    this.notice = '';
    this.reveal.start();
  }

  /** Filters only saved observations; cargo and demand are read without mutation. */
  entries(service: XenobiologyService, cargo: readonly SpecimenContainer[]): SpeciesEvidence[] {
    return Object.values(service.snapshot.evidence)
      .filter((entry) => {
        if (this.filter === 1)
          return entry.level >= 2 && service.status(entry.species) === 'UNKNOWN TO SCIENCE';
        if (this.filter === 2) return entry.level > entry.submittedLevel;
        if (this.filter === 3) return cargo.some((container) => container.species.id === entry.species.id);
        return true;
      })
      .sort((a, b) => a.species.id.localeCompare(b.species.id));
  }

  /** Retains selection by identity as filters or submissions change the visible list. */
  selected(entries: readonly SpeciesEvidence[]): SpeciesEvidence | undefined {
    const selected = entries.find((entry) => entry.species.id === this.selectedId) ?? entries[0];
    this.selectedId = selected?.species.id ?? null;
    return selected;
  }

  /** Selects one recorded origin, including managed species encountered at several colonies. */
  origin(entry: SpeciesEvidence | undefined): BiologyOrigin | undefined {
    this.originIndex = clampIndex(this.originIndex, entry?.origins?.length ?? 0);
    return entry?.origins?.[this.originIndex];
  }

  /** Gives the terminal exclusive fresh-key ownership and uses the first key to finish reveal. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    entries: readonly SpeciesEvidence[],
    model: TextModalTableModel
  ): 'close' | 'landing' | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('SCIENCE_LOG')) return 'close';
    if (input.wasActionJustPressed('ENTER_SYSTEM') || input.wasActionJustPressed('PRIMARY_ACTION'))
      return 'landing';
    if (input.wasActionJustPressed('SCAN_SYSTEM_OBJECT')) {
      this.filter = (this.filter + 1) % FILTERS.length;
      this.selectedId = null;
      this.originIndex = this.viewOffset = 0;
      return;
    }
    const selected = this.selected(entries);
    if (input.wasActionJustPressed('BIOLOGY_SITE')) {
      this.originIndex = (this.originIndex + 1) % Math.max(1, selected?.origins?.length ?? 0);
      this.viewOffset = 0;
      return;
    }
    const cycle = input.wasActionJustPressed('MOVE_LEFT')
      ? -1
      : input.wasActionJustPressed('MOVE_RIGHT') || input.wasActionJustPressed('CYCLE_TARGET')
        ? 1
        : 0;
    if (cycle && entries.length) {
      const index = entries.findIndex((entry) => entry.species.id === selected?.species.id);
      this.selectedId = entries[(index + cycle + entries.length) % entries.length].species.id;
      this.originIndex = this.viewOffset = 0;
      this.notice = '';
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

  /** Builds a coloured report combining existing dossiers with provenance, handling and submission history. */
  createModel(
    service: XenobiologyService,
    cargo: readonly SpecimenContainer[],
    stasisClass: number,
    cols: number,
    rows: number,
    canLand: boolean
  ): TextModalTableModel {
    const entries = this.entries(service, cargo);
    const entry = this.selected(entries);
    const origin = this.origin(entry);
    const width = Math.max(16, Math.min(88, cols - 12));
    const lines: TextDashboardLine[] = [];
    /** Writes one semantic line before wrapping so narrow terminals retain every word. */
    const line = (text: string, tone: TextTone = 'normal', heading = false): void => {
      lines.push({ segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] });
    };
    if (!entry) {
      line('NO MATCHING RECORDS', 'cyan', true);
      line(
        'Observe a surface contact to retain its biological record. S changes the record filter.',
        'muted'
      );
    } else {
      line('EXPEDITION RECORD', 'cyan', true);
      if (origin) {
        line(`${origin.bodyName} / ${origin.systemName}`, 'bright');
        line(`HYPERSPACE X ${origin.worldX} Y ${origin.worldY} / contact ${origin.systemSlot + 1}`, 'green');
        line(`${origin.surface.label} / surface X ${origin.surface.x} Y ${origin.surface.y}`, 'cyan');
        line(`Recorded habitat ${this.originIndex + 1}/${entry.origins!.length}`, 'muted');
      } else
        line(
          'Earlier observation has no recorded coordinates. Observe again to record a return site.',
          'muted'
        );
      line(
        `Personal collection: ${entry.collected ? 'YES' : 'NO'} / aboard: ${cargo.filter((container) => container.species.id === entry.species.id).length}`,
        'green'
      );
      line(
        `Submitted evidence: ${['NONE', 'PRELIMINARY', 'OBSERVED', 'ANALYSED'][entry.submittedLevel]}`,
        'muted'
      );
      const demand = service.snapshot.demand[entry.species.id];
      line(`Physical submissions: ${demand?.samples ?? 0}`, 'muted');
      if (entry.level >= 2) {
        line(
          `Preservation: ${stasisCompatibility(entry.species, stasisClass) ?? 'typical adult compatible'}`,
          'amber'
        );
        line('Individual size and available cargo/stasis slots can change capture feasibility.', 'muted');
        for (const kind of ['tissue', 'dead', 'live'] as const) {
          const value = service.quote(entry.species, {
            id: 'estimate',
            sourceId: 'uncollected-estimate',
            siteId: '',
            species: entry.species,
            kind,
            quality: 1,
            volumeM3: 0.1,
          }).credits;
          line(`Next ${kind} reference: approximately ${value.toLocaleString()} Cr at full quality`, 'amber');
        }
      }
      lines.push(...createBiologicalDossier(entry.species, service, width));
    }
    if (this.notice) lines.unshift({ segments: [{ text: this.notice, tone: 'amber' }] });
    const dashboard = wrapDashboardLines(lines, width);
    const footer = wrapDashboardLines(
      [
        {
          segments: [
            {
              text: `LEFT/RIGHT species  UP/DN scroll  PGUP/DN page  S filter  B habitat  ${canLand ? 'ENTER landing site  ' : ''}ESC return`,
            },
          ],
        },
      ],
      width
    ).map((item) => item.segments.map((span) => span.text).join(''));
    const visibleRowCount = getDashboardVisibleRows(dashboard.length, rows, footer.length);
    this.viewOffset = Math.min(this.viewOffset, Math.max(0, dashboard.length - visibleRowCount));
    return {
      title: 'SCIENCE LOG',
      subtitle: `${FILTERS[this.filter]} / ${entries.length} / HELD`,
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
