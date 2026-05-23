import { Player } from './player';
import { Starbase } from '../entities/starbase';

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

export interface StarbaseSection {
  id: StarbaseSectionId;
  label: string;
}

export interface StarbaseTableRow {
  id: string;
  cells: string[];
  detail?: string;
  disabled?: boolean;
}

export interface StarbaseScreenModel {
  stationName: string;
  sectionId: StarbaseSectionId;
  sections: StarbaseSection[];
  title: string;
  subtitle: string;
  columns: string[];
  widths: number[];
  rows: StarbaseTableRow[];
  selectedIndex: number;
  viewOffset: number;
  visibleRowCount: number;
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
  alert?: string;
}): StarbaseScreenModel {
  const cargoTotal = Object.values(args.player.cargoHold.items).reduce((sum, quantity) => sum + quantity, 0);
  const maxOffset = Math.max(0, args.rows.length - args.visibleRowCount);
  const footer = [
    `Cr ${args.player.resources.credits.toLocaleString()}   Fuel ${args.player.resources.fuel.toFixed(0)}/${args.player.resources.maxFuel}   Cargo ${cargoTotal}/${args.player.cargoHold.capacity}`,
    'Up/Down select  PgUp/PgDn page  Left/Right sections  Enter use  Esc back  L depart',
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
    footer,
    alert: args.alert,
  };
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
