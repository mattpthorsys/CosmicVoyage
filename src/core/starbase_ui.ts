import { Player } from './player';
import { Starbase } from '../entities/starbase';
import { clampIndex, TextMenuSection, TextTableModel, TextTableRow } from './text_ui';

export type StarbaseSectionId =
  | 'overview'
  | 'cargo'
  | 'buy'
  | 'sell'
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
  { id: 'services', label: 'Services' },
  { id: 'notices', label: 'Notices' },
  { id: 'missions', label: 'Missions' },
  { id: 'shipyard', label: 'Shipyard' },
  { id: 'crew', label: 'Crew' },
];

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
  const cargoTotal = Object.values(args.player.cargoHold.items).reduce((sum, quantity) => sum + quantity, 0);
  const maxOffset = Math.max(0, args.rows.length - args.visibleRowCount);
  const footer = [
    `Cr ${args.player.resources.credits.toLocaleString()}   Fuel ${args.player.resources.fuel.toFixed(0)}/${args.player.resources.maxFuel}   Cargo ${cargoTotal}/${args.player.cargoHold.capacity} m^3`,
    'Up/Down select  PgUp/PgDn page  Left/Right sections  Enter use  L depart',
  ];

  return {
    stationName: args.starbase.name,
    sectionId: args.sectionId,
    sections: STARBASE_SECTIONS,
    title: args.title,
    subtitle: args.subtitle,
    columns: args.columns,
    widths: args.widths,
    rows: args.rows,
    selectedIndex: clampIndex(args.selectedIndex, args.rows.length),
    viewOffset: Math.max(0, Math.min(args.viewOffset, maxOffset)),
    visibleRowCount: args.visibleRowCount,
    detailLineCount: args.detailLineCount,
    footer,
    alert: args.alert,
  };
}
