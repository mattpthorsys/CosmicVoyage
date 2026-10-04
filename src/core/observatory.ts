import { CONFIG } from '../config';
import type { InputManager } from './input_manager';
import { TerminalTextReveal } from './terminal_text_reveal';
import { wrapDashboardLines, type TextDashboardLine, type TextTone } from './text_ui';
import type {
  ObservatoryCapabilities,
  ObservatoryContact,
  ObservatoryObservation,
  ObservatorySnapshot,
} from './observatory_types';

const SIGNAL_FILTERS = [
  'ALL SIGNALS',
  'BIO CANDIDATES',
  'CATALOGUED BIO',
  'TECH SIGNALS',
  'UNIDENTIFIED',
  'UNMEASURED',
  'NATIVE RECORDS',
  'MANAGED RECORDS',
] as const;
const HOST_FILTERS = ['ALL HOSTS', 'SINGLE', 'BINARY', 'TRIPLE', 'G/K HOSTS', 'REMNANTS'] as const;
const SURVEY_FILTERS = ['ALL CONTACTS', 'UNVISITED', 'OBSERVED', 'TEMPERATE'] as const;

export interface ObservatoryLayout {
  plotWidth: number;
  readoutX: number;
  readoutWidth: number;
  listRows: number;
  detailRows: number;
}

export interface ObservatoryScreenModel {
  contacts: readonly ObservatoryContact[];
  selectedId: string | null;
  selectedIndex: number;
  viewOffset: number;
  filterLabels: readonly string[];
  filterGroup: number;
  worldX: number;
  worldY: number;
  radiusLy: number;
  equipmentClass: number;
  coverage: string;
  notice: string;
  sortLabel: string;
  details: readonly TextDashboardLine[];
  detailOffset: number;
  reveal: number;
  observations: Readonly<Record<string, ObservatoryObservation>>;
  destinationId: string | null;
  layout: ObservatoryLayout;
}

/** Allocates stable contact, report and plot regions from available terminal cells. */
export function getObservatoryLayout(cols: number, rows: number): ObservatoryLayout {
  const plotWidth = cols >= 100 ? Math.floor(cols * 0.48) : 0;
  const readoutX = plotWidth ? plotWidth + 2 : 2;
  const readoutWidth = Math.max(8, cols - readoutX - 2);
  const availableRows = Math.max(4, rows - 13);
  const listRows = Math.max(2, Math.min(9, Math.floor(availableRows * 0.38)));
  return {
    plotWidth,
    readoutX,
    readoutWidth,
    listRows,
    detailRows: Math.max(1, availableRows - listRows - 2),
  };
}

/** Owns only terminal selection, filters and presentation; evidence belongs to the survey service. */
export class ObservatoryController {
  contacts: ObservatoryContact[] = [];
  selectedId: string | null = null;
  filters = [0, 0, 0];
  filterGroup = 0;
  sort = 0;
  viewOffset = 0;
  detailOffset = 0;
  coverage = 'Acquiring contacts...';
  notice = '';
  returnTo: 'none' | 'ship-menu' = 'none';
  readonly reveal = new TerminalTextReveal(1);

  /** Opens without discarding remembered filters or the selected stable contact identity. */
  open(returnTo: 'none' | 'ship-menu'): void {
    this.returnTo = returnTo;
    this.notice = '';
    this.detailOffset = 0;
    this.reveal.start();
  }

  /** Applies combined filters to acquired evidence before sorting or pagination. */
  filtered(
    state: ObservatorySnapshot,
    visited: (contact: ObservatoryContact) => boolean
  ): ObservatoryContact[] {
    return this.contacts
      .filter((contact) => {
        const record = state.observations[contact.id];
        const biology = record?.biology;
        const technology = record?.technology;
        if (this.filters[0] === 1 && !['candidate', 'strong'].includes(biology ?? '')) return false;
        if (this.filters[0] === 2 && biology !== 'catalogued') return false;
        if (this.filters[0] === 3 && !['registered', 'unidentified'].includes(technology ?? '')) return false;
        if (this.filters[0] === 4 && technology !== 'unidentified') return false;
        if (this.filters[0] === 6 && record?.origin !== 'native') return false;
        if (this.filters[0] === 7 && record?.origin !== 'managed') return false;
        if (this.filters[0] === 5 && record && !['unmeasured', 'insufficient'].includes(record.biology))
          return false;
        if (
          this.filters[1] >= 1 &&
          this.filters[1] <= 3 &&
          contact.multiplicity !== ['single', 'binary', 'triple'][this.filters[1] - 1]
        )
          return false;
        if (this.filters[1] === 4 && !/^[GK]/.test(contact.system?.starType ?? '')) return false;
        if (this.filters[1] === 5 && !/^(WD|NS|BH)/.test(contact.system?.starType ?? '')) return false;
        if (this.filters[2] === 1 && visited(contact)) return false;
        if (this.filters[2] === 2 && !record) return false;
        if (
          this.filters[2] === 3 &&
          !record?.features.some((feature) => feature.includes('temperate candidate'))
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (this.sort === 1) {
          const difference = interest(state.observations[b.id]) - interest(state.observations[a.id]);
          if (difference) return difference;
        }
        if (this.sort === 2) return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        return a.distanceLy - b.distanceLy || a.id.localeCompare(b.id);
      });
  }

  /** Retains selection after observations, filtering or catalogue refreshes alter the list. */
  selected(contacts: readonly ObservatoryContact[]): ObservatoryContact | undefined {
    if (!contacts.length) return undefined;
    const contact = contacts.find((entry) => entry.id === this.selectedId) ?? contacts[0];
    this.selectedId = contact?.id ?? null;
    return contact;
  }

  /** Consumes all modal keys, preventing movement, landing or other menus from leaking through. */
  input(
    input: Pick<InputManager, 'wasActionJustPressed' | 'wasAnyKeyJustPressed'>,
    model: ObservatoryScreenModel
  ): 'close' | 'observe' | 'mark' | 'clear' | undefined {
    if (this.reveal.isActive && input.wasAnyKeyJustPressed()) {
      this.reveal.complete();
      return;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('OBSERVATORY')) return 'close';
    if (input.wasActionJustPressed('SCAN')) return 'observe';
    if (input.wasActionJustPressed('ENTER_SYSTEM')) return 'mark';
    if (input.wasActionJustPressed('BIOLOGY_COLLECT')) return 'clear';
    if (input.wasActionJustPressed('CYCLE_TARGET')) {
      this.filterGroup = (this.filterGroup + 1) % 3;
      return;
    }
    if (input.wasActionJustPressed('SCAN_SYSTEM_OBJECT')) this.sort = (this.sort + 1) % 3;
    const filterDelta = input.wasActionJustPressed('MOVE_LEFT')
      ? -1
      : input.wasActionJustPressed('MOVE_RIGHT') || input.wasActionJustPressed('OBSERVATORY_FILTER')
        ? 1
        : 0;
    if (filterDelta) {
      const count = [SIGNAL_FILTERS.length, HOST_FILTERS.length, SURVEY_FILTERS.length][this.filterGroup];
      this.filters[this.filterGroup] = (this.filters[this.filterGroup] + filterDelta + count) % count;
      this.viewOffset = this.detailOffset = 0;
      return;
    }
    const scroll = input.wasActionJustPressed('PAGE_UP')
      ? -model.layout.detailRows
      : input.wasActionJustPressed('PAGE_DOWN')
        ? model.layout.detailRows
        : 0;
    if (scroll) {
      this.detailOffset = Math.max(
        0,
        Math.min(this.detailOffset + scroll, Math.max(0, model.details.length - model.layout.detailRows))
      );
      return;
    }
    const delta = input.wasActionJustPressed('MOVE_UP')
      ? -1
      : input.wasActionJustPressed('MOVE_DOWN')
        ? 1
        : 0;
    if (delta && model.contacts.length) {
      const index = Math.max(0, Math.min(model.contacts.length - 1, model.selectedIndex + delta));
      this.selectedId = model.contacts[index].id;
      this.detailOffset = 0;
    }
  }

  /** Builds a readonly responsive instrument model without generating worlds or changing evidence. */
  createModel(
    state: ObservatorySnapshot,
    capabilities: ObservatoryCapabilities,
    x: number,
    y: number,
    cols: number,
    rows: number,
    visited: (contact: ObservatoryContact) => boolean
  ): ObservatoryScreenModel {
    const contacts = this.filtered(state, visited);
    const selected = this.selected(contacts);
    const selectedIndex = Math.max(
      0,
      contacts.findIndex((contact) => contact.id === selected?.id)
    );
    const layout = getObservatoryLayout(cols, rows);
    this.viewOffset = Math.max(0, Math.min(this.viewOffset, Math.max(0, contacts.length - layout.listRows)));
    if (selectedIndex < this.viewOffset) this.viewOffset = selectedIndex;
    if (selectedIndex >= this.viewOffset + layout.listRows)
      this.viewOffset = selectedIndex - layout.listRows + 1;
    const details = wrapDashboardLines(
      observatoryReadout(selected, selected ? state.observations[selected.id] : undefined),
      layout.readoutWidth
    );
    this.detailOffset = Math.max(
      0,
      Math.min(this.detailOffset, Math.max(0, details.length - layout.detailRows))
    );
    return {
      contacts,
      selectedId: this.selectedId,
      selectedIndex,
      viewOffset: this.viewOffset,
      filterLabels: [
        SIGNAL_FILTERS[this.filters[0]],
        HOST_FILTERS[this.filters[1]],
        SURVEY_FILTERS[this.filters[2]],
      ],
      filterGroup: this.filterGroup,
      worldX: x,
      worldY: y,
      radiusLy: capabilities.contactRadiusLy,
      equipmentClass: capabilities.equipmentClass,
      coverage: this.coverage,
      notice: this.notice,
      sortLabel: ['RANGE', 'INTEREST', 'NAME'][this.sort],
      details,
      detailOffset: this.detailOffset,
      reveal: this.reveal.progress,
      observations: state.observations,
      destinationId: state.destination
        ? `${state.destination.kind}:${state.destination.worldX},${state.destination.worldY},${state.destination.systemSlot}`
        : null,
      layout,
    };
  }
}

/** Scores visible evidence only; undiscovered life cannot influence an interest sort. */
function interest(record: ObservatoryObservation | undefined): number {
  return record?.technology === 'unidentified'
    ? 5
    : record?.biology === 'strong'
      ? 4
      : record?.biology === 'candidate'
        ? 3
        : record?.biology === 'catalogued'
          ? 2
          : record
            ? 1
            : 0;
}

/** Gives each evidence state a concise label without equating nondetection with a sterile world. */
export function observatoryBiologyLabel(record: ObservatoryObservation | undefined): string {
  return (
    {
      unmeasured: 'UNMEASURED',
      insufficient: 'INSUFFICIENT',
      'no-signal': 'NO DIAGNOSTIC SIGNAL',
      candidate: 'BIO CANDIDATE',
      strong: 'STRONG CANDIDATE',
      catalogued: 'CATALOGUED BIOSPHERE',
    } as const
  )[record?.biology ?? 'unmeasured'];
}

/** Formats measured data and model-dependent interpretation as separately coloured report lines. */
export function observatoryReadout(
  contact: ObservatoryContact | undefined,
  record: ObservatoryObservation | undefined
): TextDashboardLine[] {
  const lines: TextDashboardLine[] = [];
  /** Appends one semantic line before the caller wraps it to the available report width. */
  const line = (text: string, tone: TextTone = 'normal', heading = false): void => {
    lines.push({ segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] });
  };
  if (!contact) {
    line('NO MATCHING CONTACTS', 'cyan', true);
    line('Coverage includes unmeasured targets; absence of a signal does not exclude life.', 'muted');
    return lines;
  }
  line(contact.name, 'bright', true);
  line(`GRID ${contact.worldX},${contact.worldY} / ${contact.distanceLy.toFixed(1)} ly`, 'green');
  line(`${contact.system?.starType ?? 'RADIO'} / ${contact.multiplicity.toUpperCase()}`, 'cyan');
  const population = contact.system?.stellarPopulation;
  if (population) {
    const age = Math.round(population.ageGyr * 2) / 2;
    line(
      `Stellar model: ~${Math.max(0.05, age).toFixed(1)} Gyr; [Fe/H] ~${population.metallicityFeH.toFixed(1)}`,
      'muted'
    );
  }
  line('');
  line('SPECTRAL ASSESSMENT', 'cyan', true);
  line(
    observatoryBiologyLabel(record),
    record?.biology === 'strong' ? 'green' : record?.biology === 'candidate' ? 'amber' : 'muted'
  );
  if (!record) {
    line('No planetary spectrum recorded.', 'muted');
    return lines;
  }
  line(
    `Measurement quality: ${record.quality >= 0.7 ? 'HIGH' : record.quality >= 0.4 ? 'MODERATE' : record.quality >= 0.15 ? 'LOW' : 'LIMITED'} / exposure ${record.exposure}/3`,
    'green'
  );
  if (record.bodyName) line(`Resolved source: ${record.bodyName}`, 'cyan');
  for (const feature of record.features)
    line(feature, feature.includes('candidate') || feature.includes('alternatives') ? 'amber' : 'normal');
  line(
    `Technology: ${record.technology === 'registered' ? 'REGISTERED HUMAN' : record.technology === 'unidentified' ? 'UNIDENTIFIED SOURCE' : record.technology === 'no-signal' ? 'NO SIGNAL DETECTED' : 'UNMEASURED'}`,
    record.technology === 'unidentified' ? 'amber' : 'cyan'
  );
  line(
    `Recorded from ${record.observedFromX},${record.observedFromY} at ${record.rangeLy.toFixed(1)} ly / Class ${record.equipmentClass}`,
    'muted'
  );
  line(`Light-travel lookback: ~${record.rangeLy.toFixed(1)} years`, 'muted');
  line(`Projection: ${CONFIG.HYPERSPACE_CELL_LIGHT_YEARS} ly per navigation cell`, 'muted');
  return lines;
}
