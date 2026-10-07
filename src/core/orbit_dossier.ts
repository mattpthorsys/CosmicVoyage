import { ELEMENTS } from '../constants/resources';
import { describePlanetType, type Planet } from '../entities/planet';
import { isBreathableTerraformingProfile } from '../entities/habitability';
import { formatDistanceAu, formatLightTimeFromMeters } from '../utils/space_scale';
import { formatDiscoveryLevel, hasDiscoveryLevel } from './discovery';
import { getOrbitReferenceLabel, type OrbitStellarSource } from './orbit_ui';
import { TerminalTextReveal } from './terminal_text_reveal';
import { getPlanetSettlementCatalog, OrbitSettlements } from './orbit_settlements';
import {
  getDashboardVisibleRows,
  type TextDashboardLine,
  type TextModalTableModel,
  type TextTone,
} from './text_ui';

const EARTH_MASS_KG = 5.9722e24;
const FOOTER = ['UP/DN scroll  PGUP/DN page', 'ESC return to orbit'];

/** Keeps the detailed orbital readout independent of the landing and body-selection modes. */
export class OrbitDossier {
  biologyLines: string[] = [];
  isOpen = false;
  viewOffset = 0;
  readonly reveal = new TerminalTextReveal();
  readonly settlements = new OrbitSettlements();
  view: 'planet' | 'settlement-directory' | 'settlement-dossier' = 'planet';
  session = 0;

  /** Opens at the first line for the currently selected body. */
  open(): void {
    this.session++;
    this.view = 'planet';
    this.isOpen = true;
    this.viewOffset = 0;
    this.reveal.start();
  }

  /** Restores normal orbital controls. */
  close(): void {
    this.session++;
    this.isOpen = false;
    this.viewOffset = 0;
    this.reveal.complete();
  }

  /** Reuses the dossier's pause and raster occlusion for the settlement atlas. */
  openSettlements(): void {
    this.session++;
    this.view = 'settlement-directory';
    this.isOpen = true;
    this.viewOffset = 0;
    this.settlements.reset();
    this.reveal.complete();
  }

  /** Switches directory/detail without resetting the selected site. */
  showSettlementDetail(detail: boolean): void {
    this.view = detail ? 'settlement-dossier' : 'settlement-directory';
    this.viewOffset = 0;
    if (detail) this.reveal.start();
    else this.reveal.complete();
  }

  /** Moves by lines or one viewport, without allowing an empty final page. */
  scroll(delta: number, lineCount: number, viewportRows: number, footerRows = FOOTER.length): void {
    const visible = getDashboardVisibleRows(lineCount, viewportRows, footerRows);
    this.viewOffset = Math.max(0, Math.min(this.viewOffset + delta, Math.max(0, lineCount - visible)));
  }

  /** Prepares a responsive, scrollable terminal dossier. */
  createModel(
    body: Planet,
    parent: Planet,
    sources: readonly OrbitStellarSource[],
    viewportCols: number,
    viewportRows: number
  ): TextModalTableModel {
    if (this.view !== 'planet') {
      const model = this.settlements.createModel(
        body,
        this.view === 'settlement-dossier',
        viewportCols,
        viewportRows,
        this.viewOffset,
        this.reveal.progress
      );
      if (this.view === 'settlement-dossier') this.viewOffset = model.viewOffset;
      return model;
    }
    const width = Math.max(16, Math.min(88, viewportCols - 12));
    const dashboard = buildOrbitDossierLines(body, parent, sources, width);
    if (this.biologyLines.length)
      dashboard.splice(
        0,
        0,
        { segments: [{ text: ' BIOLOGICAL SIGNATURES ', tone: 'cyan', font: 'thick' }] },
        ...this.biologyLines.flatMap((line) =>
          wrapValue(line, width).map((text) => ({ segments: [{ text, tone: 'green' as const }] }))
        ),
        { segments: [{ text: '' }] }
      );
    const visible = getDashboardVisibleRows(dashboard.length, viewportRows, FOOTER.length);
    this.viewOffset = Math.min(this.viewOffset, Math.max(0, dashboard.length - visible));
    return {
      title: 'PLANETARY DOSSIER',
      subtitle: body.name,
      footer: FOOTER,
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: this.viewOffset,
      visibleRowCount: visible,
      dashboard,
      dashboardReveal: this.reveal.progress,
    };
  }
}

/** Builds only the data unlocked by the body's current survey level. */
export function buildOrbitDossierLines(
  body: Planet,
  parent: Planet,
  sources: readonly OrbitStellarSource[],
  width: number
): TextDashboardLine[] {
  const lines: TextDashboardLine[] = [];
  const labelWidth = Math.min(18, Math.max(15, Math.floor(width * 0.37)));
  /** Adds a numbered section rule without exceeding the terminal width. */
  const heading = (index: number, title: string): void => {
    if (lines.length) lines.push({ segments: [{ text: '' }] });
    const text = ` ${String(index).padStart(2, '0')}  ${title} `;
    lines.push({
      segments: [{ text: text + '─'.repeat(Math.max(0, width - text.length)), tone: 'cyan', font: 'thick' }],
    });
  };
  /** Splits a labelled statistic into aligned continuation rows. */
  const field = (label: string, value: string, tone: TextTone = 'bright'): void => {
    const prefix = label.padEnd(labelWidth - 1) + ' ';
    const available = Math.max(1, width - labelWidth);
    wrapValue(value || 'None', available).forEach((part, index) => {
      lines.push({
        segments: [
          { text: index === 0 ? prefix : ' '.repeat(labelWidth), tone: 'muted' },
          { text: part, tone },
        ],
      });
    });
  };

  heading(1, 'IDENTIFICATION');
  field('Class', describePlanetType(body.type));
  field(
    'Survey',
    `${formatDiscoveryLevel(body.discovery.level)} / ${body.discovery.confidence}% confidence`,
    'green'
  );
  field('System role', body === parent ? 'Primary body' : `Satellite of ${parent.name}`);
  field('Satellites', String(body.moons.length));

  heading(2, 'ORBIT AND SPIN');
  field('Host', body.orbitDistance > 0 ? getOrbitReferenceLabel(body, parent) : 'Interstellar / unbound');
  field('Orbit radius', body.orbitDistance > 0 ? formatDistanceAu(body.orbitDistance) : 'None');
  if (body.orbitDistance > 0) {
    field('Light time', formatLightTimeFromMeters(body.orbitDistance));
  }
  field('Inclination', `${((body.orbitalInclination * 180) / Math.PI).toFixed(1)} deg (nominal)`);
  field('Rotation', body.getRotationPeriodLabel());
  field('Spin state', body.tidallyLocked ? 'Tidally locked' : 'Free rotation');
  field('Axial tilt', `${((body.axialTilt * 180) / Math.PI).toFixed(1)} deg`);

  heading(3, 'PHYSICAL PROFILE');
  field('Diameter', `${body.diameter.toLocaleString()} km`);
  const earthMass = body.mass / EARTH_MASS_KG;
  field('Mass', `${earthMass < 0.01 ? earthMass.toExponential(2) : earthMass.toFixed(2)} Earth masses`);
  field('Density', `${body.density.toFixed(2)} g/cm3`);
  field('Gravity', `${body.gravity.toFixed(2)} g`);
  field('Escape speed', `${(body.escapeVelocity / 1000).toFixed(2)} km/s`);
  field('Magnetic field', `${body.magneticFieldStrength.toFixed(2)} microtesla`);

  heading(4, 'ENERGY AND CLIMATE');
  if (sources.length) {
    const totalFlux = sources.reduce((sum, source) => sum + (source.irradianceWm2 ?? 0), 0);
    field('Stellar flux', `${totalFlux.toFixed(totalFlux < 10 ? 2 : 0)} W/m2`);
    for (const source of sources) {
      field(`Star ${source.id}`, `${(source.irradianceWm2 ?? 0).toPrecision(3)} W/m2`, 'green');
    }
  } else {
    field('Stellar flux', 'No local stellar source', 'amber');
  }
  field('Mean temp', `${body.effectiveSurfaceTemp} K`);
  field('Temp range', `${body.effectiveSurfaceTempMin}-${body.effectiveSurfaceTempMax} K`);

  if (hasDiscoveryLevel(body.discovery.level, 'surveyed')) {
    heading(5, 'ATMOSPHERE AND SURFACE');
    const atmosphere = body.effectiveAtmosphere;
    field('Pressure', `${atmosphere.pressure < 0.001 ? '~0' : atmosphere.pressure.toFixed(3)} bar`);
    field('Density class', atmosphere.density);
    const gases = Object.entries(atmosphere.composition)
      .filter(([gas, percentage]) => gas !== 'None' && percentage > 0.1)
      .sort((left, right) => right[1] - left[1]);
    field(
      'Composition',
      gases.length
        ? gases.map(([gas, percentage]) => `${gas} ${percentage.toFixed(1)}%`).join(', ')
        : 'None / trace'
    );
    field('Hydrosphere', body.effectiveHydrosphere);
    field('Lithosphere', body.lithosphere);

    heading(6, 'RESOURCE SURVEY');
    field('Richness', body.mineralRichness);
    field('Primary', body.primaryResource || 'No dominant resource');
    const sampled = hasDiscoveryLevel(body.discovery.level, 'sampled');
    const elements = Object.entries(body.elementAbundance)
      .filter(([, percentage]) => percentage > 0.1)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([key, percentage]) =>
        sampled ? `${ELEMENTS[key]?.name || key} ${percentage.toFixed(1)}%` : ELEMENTS[key]?.name || key
      );
    field(sampled ? 'Assay' : 'Signatures', elements.join(', ') || 'No significant signatures');
  } else {
    heading(5, 'SURVEY STATUS');
    field('Composition', 'Orbital survey required', 'amber');
    field('Resources', 'Orbital survey required', 'amber');
  }

  if (body.terraforming) {
    heading(7, 'HUMAN ACTIVITY');
    field('Terraforming', body.terraforming.stage);
    field('Biosphere', body.terraforming.biosphereStage);
    field(
      'Surface air',
      isBreathableTerraformingProfile(body.terraforming)
        ? 'Breathable managed atmosphere'
        : 'Life support required',
      'amber'
    );
    const climate = body.terraforming.climate;
    if (climate) {
      field(
        'Flux envelope',
        `${climate.minStellarFluxWm2.toFixed(0)}-${climate.maxStellarFluxWm2.toFixed(0)} W/m2`
      );
      field('Bond albedo', climate.bondAlbedo.toFixed(2));
      field('Greenhouse', `~${climate.greenhouseWarmingK.toFixed(0)} K warming`);
      field(
        'Orbital aid',
        `${climate.radiativeControlWm2 >= 0 ? '+' : ''}${climate.radiativeControlWm2.toFixed(1)} W/m2 global absorbed flux`
      );
    }
    field('Support', body.terraforming.engineeringSupport.join(', '));
    field(
      'Settlements',
      body.isSurfaceReady()
        ? `${getPlanetSettlementCatalog(body).length} mapped / U directory`
        : 'Atlas pending / U prepare directory',
      'green'
    );
  }
  return lines;
}

/** Wraps values by cells so narrow viewports never silently discard statistics. */
function wrapValue(value: string, width: number): string[] {
  const result: string[] = [];
  let line = '';
  for (let word of value.trim().split(/\s+/)) {
    while (word.length > width) {
      if (line) result.push(line);
      line = '';
      result.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (line && line.length + word.length + 1 > width) {
      result.push(line);
      line = '';
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result.length ? result : [''];
}
