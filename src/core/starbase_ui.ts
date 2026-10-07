import { Player } from './player';
import { Starbase } from '../entities/starbase';
import { setSelection, TextMenuSection, TextTableModel, TextTableRow } from './text_ui';
import { CargoSystem } from '../systems/cargo_systems';

export type StarbaseSectionId =
  | 'overview'
  | 'cargo'
  | 'buy'
  | 'sell'
  | 'research'
  | 'services'
  | 'notices'
  | 'missions'
  | 'shipyard'
  | 'crew';

export type StarbaseSection = TextMenuSection<StarbaseSectionId>;
export type StarbaseTableRow = TextTableRow;

export interface StarbaseScreenModel extends TextTableModel {
  stationName: string;
  sectionId: StarbaseSectionId;
  sections: StarbaseSection[];
  title: string;
  subtitle: string;
  footer: string[];
  alert?: string;
}

export const STARBASE_SECTIONS: StarbaseSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 'research', label: 'Research' },
  { id: 'services', label: 'Services' },
  { id: 'notices', label: 'Notices' },
  { id: 'missions', label: 'Missions' },
  { id: 'shipyard', label: 'Shipyard' },
  { id: 'crew', label: 'Crew' },
];

/** Shares the frame's row budget between starbase scrolling and drawing. */
export function getStarbaseTableLayout(
  viewportRows: number,
  detailLineCount = 1
): { panelHeight: number; visibleRowCount: number } {
  const panelHeight = Math.min(34, Math.max(18, viewportRows - 5));
  const detailRows = Math.max(0, Math.min(4, Math.floor(detailLineCount)));
  // Reserve headings, tabs, table headers, detail spacing, alert, and both footer lines.
  return { panelHeight, visibleRowCount: Math.max(1, panelHeight - 17 - detailRows) };
}

/** Returns only the panels supported by a station's declared mechanical capabilities. */
export function getStationSections(starbase: Starbase): StarbaseSection[] {
  return STARBASE_SECTIONS.filter((section) => {
    if (section.id === 'research') return starbase.kind !== 'automated-depot';
    // Prototype-based tests and imported legacy saves may briefly expose a pre-capability station.
    if (!starbase.capabilities) return true;
    if (section.id === 'missions') return starbase.capabilities.missions;
    if (section.id === 'shipyard') return starbase.capabilities.shipyard;
    if (section.id === 'crew') return starbase.capabilities.crew;
    return true;
  });
}

/** Creates starbase screen model. */
export function createStarbaseScreenModel(args: {
  starbase: Starbase;
  player: Player;
  sectionId: StarbaseSectionId;
  selectedIndex: number;
  viewOffset: number;
  visibleRowCount: number;
  rows: StarbaseTableRow[];
  columns: string[];
  widths: number[];
  title: string;
  subtitle: string;
  detailLineCount?: number;
  alert?: string;
}): StarbaseScreenModel {
  const cargoTotal = new CargoSystem().getTotalUnits(args.player.cargoHold);
  const viewport = setSelection(args.selectedIndex, args.rows.length, args.visibleRowCount, args.viewOffset);
  const footer = [
    `Cr ${args.player.resources.credits.toLocaleString()}   Fuel ${args.player.resources.fuel.toFixed(0)}/${args.player.resources.maxFuel}   Cargo ${cargoTotal}/${args.player.cargoHold.capacity} m^3`,
    `Up/Down select  PgUp/PgDn page  Left/Right sections  Enter use${args.starbase.kind === 'automated-depot' && args.sectionId === 'missions' ? '  C cancel job' : ''}  L depart`,
  ];

  return {
    stationName: args.starbase.name,
    sectionId: args.sectionId,
    sections: getStationSections(args.starbase),
    title: args.title,
    subtitle: args.subtitle,
    columns: args.columns,
    widths: args.widths,
    rows: args.rows,
    ...viewport,
    visibleRowCount: args.visibleRowCount,
    detailLineCount: args.detailLineCount,
    footer,
    alert: args.alert,
  };
}
