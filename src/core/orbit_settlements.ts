import type { Planet } from '../entities/planet';
import { readReadySurfaceData } from '../entities/planet/surface_data';
import { getSettlementCatalog, type SettlementIdentity } from '../entities/planet/settlement_identity';
import { surfaceMapDegrees } from '../utils/surface_coordinates';
import {
  clampIndex,
  getDashboardVisibleRows,
  wrapDashboardLines,
  type TextDashboardLine,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

/** Reads mapped colony identities without generating a surface from a UI or renderer. */
export function getPlanetSettlementCatalog(body: Planet): readonly SettlementIdentity[] {
  return getSettlementCatalog(readReadySurfaceData(body)?.settlements);
}

/** Owns the directory selection and responsive terminal content, not landing or simulation state. */
export class OrbitSettlements {
  selectedIndex = 0;
  viewOffset = 0;
  error = '';

  /** Starts a fresh local directory while preserving the current landing cursor outside this model. */
  reset(): void {
    this.selectedIndex = 0;
    this.viewOffset = 0;
    this.error = '';
  }

  /** Resolves selection against the current layer, including a replaced terraforming revision. */
  selected(body: Planet): SettlementIdentity | undefined {
    const catalog = getPlanetSettlementCatalog(body);
    this.selectedIndex = clampIndex(this.selectedIndex, catalog.length);
    return catalog[this.selectedIndex];
  }

  /** Moves through sites rather than through their wrapped description rows. */
  move(body: Planet, delta: number): void {
    this.selectedIndex = clampIndex(this.selectedIndex + delta, getPlanetSettlementCatalog(body).length);
  }

  /** Builds a coloured list or a scrollable settlement dossier in the same paused modal shell. */
  createModel(
    body: Planet,
    detail: boolean,
    cols: number,
    rows: number,
    detailOffset: number,
    reveal: number
  ): TextModalTableModel {
    const fullWidth = cols < 36;
    const width = Math.max(1, Math.min(88, cols - (fullWidth ? 8 : 12)));
    const footer =
      cols < 36
        ? detail
          ? ['UP/DN scroll', 'Enter site', 'D/Esc list']
          : ['UP/DN select', 'D dossier', 'Enter site', 'U/Esc orbit']
        : detail
          ? ['UP/DN scroll  PGUP/DN page', 'Enter landing site  D/Esc directory']
          : ['UP/DN select  PGUP/DN page', 'D dossier  Enter landing site', 'U/Esc return to orbit'];
    const selected = this.selected(body);
    const catalog = getPlanetSettlementCatalog(body);
    const layer = readReadySurfaceData(body)?.settlements;
    const lines: TextDashboardLine[] = [];
    /** Adds a wrapped line with its scientific or navigational colour preserved. */
    const line = (text: string, tone: TextTone = 'normal', heading = false): void => {
      lines.push(
        ...wrapDashboardLines([{ segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] }], width)
      );
    };
    if (this.error) line(this.error, 'red');
    let selectedStart = 0;
    let selectedEnd = 0;
    if (detail && selected && layer) {
      line(selected.name.toUpperCase(), 'cyan', true);
      line(selected.classification, 'green');
      line('');
      line('MAPPED CHARACTER', 'cyan', true);
      line(selected.description);
      line('');
      line('BODY-FIXED POSITION', 'cyan', true);
      line(`Regional X ${selected.x} / Y ${selected.y}`, 'amber');
      const degrees = surfaceMapDegrees(
        selected.site.x,
        selected.site.y,
        layer.sourceWidth,
        layer.sourceHeight
      );
      line(
        `Latitude ${degrees.latitude.toFixed(2)} deg / longitude ${degrees.longitude.toFixed(2)} deg`,
        'green'
      );
      line(`Map ${layer.sourceWidth} x ${layer.sourceHeight} / Mercator`, 'muted');
      line('');
      line('URBAN FOOTPRINT', 'cyan', true);
      line(`${selected.site.patches.length} mapped district patches`);
      const radius = Math.max(
        0,
        ...selected.site.patches.map((patch) => Math.max(patch.radiusXKm, patch.radiusYKm))
      );
      if (radius > 0) line(`Largest district semi-axis ${radius.toFixed(1)} km`, 'green');
      line('Regional coverage is fractional; a map cell is not a city-sized tile.', 'muted');
      line('');
      line('SURFACE OPERATIONS', 'cyan', true);
      line('Regional landing reference only. Population and surface services are not catalogued.', 'muted');
      if (selected.site.archetype === 'sealed')
        line('Pressure-isolated habitat; external life support still depends on local air.', 'amber');
    } else if (catalog.length) {
      catalog.forEach((entry, index) => {
        const start = lines.length;
        line(
          `${index === this.selectedIndex ? '>' : ' '} ${entry.name}`,
          index === this.selectedIndex ? 'cyan' : 'bright',
          true
        );
        line(entry.classification, 'green');
        line(`X ${entry.x} / Y ${entry.y}`, 'amber');
        line('');
        if (index === this.selectedIndex) {
          selectedStart = start;
          selectedEnd = lines.length - 1;
        }
      });
    } else {
      const pending =
        !body.isSurfaceReady() && Boolean(body.terraforming) && !['GasGiant', 'IceGiant'].includes(body.type);
      if (!this.error)
        line(pending ? 'Preparing settlement atlas...' : 'No mapped surface settlements.', 'amber');
      line(
        'Only established surface colonies appear in this directory. Orbital depots are listed separately.',
        'muted'
      );
    }
    const visible = getDashboardVisibleRows(lines.length, rows, footer.length);
    if (!detail) {
      if (selectedStart < this.viewOffset) this.viewOffset = selectedStart;
      if (selectedEnd >= this.viewOffset + visible)
        this.viewOffset = Math.min(selectedStart, selectedEnd - visible + 1);
    }
    const offset = Math.max(0, Math.min(detail ? detailOffset : this.viewOffset, lines.length - visible));
    if (!detail) this.viewOffset = offset;
    return {
      title: detail ? 'SETTLEMENT DOSSIER' : 'SETTLEMENT DIRECTORY',
      subtitle: `${body.name} / ${catalog.length} mapped sites`,
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: this.selectedIndex,
      viewOffset: offset,
      visibleRowCount: visible,
      dashboard: lines,
      footer,
      dashboardFullWidth: fullWidth,
      dashboardReveal: reveal,
    };
  }
}
