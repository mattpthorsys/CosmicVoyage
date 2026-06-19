import { Player } from './player';
import {
  createStarbaseScreenModel,
  StarbaseScreenModel,
  StarbaseSectionId,
  StarbaseTableRow,
  STARBASE_SECTIONS,
} from './starbase_ui';
import { moveSelection } from './text_ui';
import { Starbase } from '../entities/starbase';

export interface StarbaseSectionMeta {
  title: string;
  subtitle: string;
  columns: string[];
  widths: number[];
}

export interface StarbaseScreenContext {
  starbase: Starbase;
  player: Player;
  rows: StarbaseTableRow[];
  canvasHeight: number;
  charHeight: number;
  statusMessage: string;
}

export class StarbaseController {
  tradeSelectionIndex = 0;
  sectionId: StarbaseSectionId = 'overview';
  selectionBySection: Record<string, number> = {};
  offsetBySection: Record<string, number> = {};
  alert = '';

  /** Resets. */
  reset(): void {
    this.sectionId = 'overview';
    this.alert = '';
  }

  /** Returns selection. */
  getSelection(): number {
    return this.selectionBySection[this.sectionId] ?? 0;
  }

  /** Returns offset. */
  getOffset(): number {
    return this.offsetBySection[this.sectionId] ?? 0;
  }

  /** Moves selection. */
  moveSelection(delta: number, rowCount: number, visibleRows: number): void {
    const viewport = moveSelection(this.getSelection(), delta, rowCount, visibleRows, this.getOffset());
    this.selectionBySection[this.sectionId] = viewport.selectedIndex;
    this.offsetBySection[this.sectionId] = viewport.viewOffset;
    this.alert = '';
  }

  /** Switches section. */
  switchSection(delta: number): void {
    const currentIndex = STARBASE_SECTIONS.findIndex((section) => section.id === this.sectionId);
    const nextIndex = (currentIndex + delta + STARBASE_SECTIONS.length) % STARBASE_SECTIONS.length;
    this.sectionId = STARBASE_SECTIONS[nextIndex].id;
    this.alert = '';
  }

  /** Returns whether cel panel is allowed. */
  cancelPanel(): void {
    this.sectionId = 'overview';
    this.alert = 'Cancelled current panel.';
  }

  /** Opens section. */
  openSection(sectionId: StarbaseSectionId): void {
    this.sectionId = sectionId;
    this.alert = '';
  }

  /** Returns section label. */
  getSectionLabel(): string {
    return STARBASE_SECTIONS.find((section) => section.id === this.sectionId)?.label ?? 'Operations';
  }

  /** Returns visible row count. */
  getVisibleRowCount(canvasHeight: number, charHeight: number): number {
    const rows = Math.max(1, Math.floor(canvasHeight / Math.max(1, charHeight)));
    return Math.max(6, Math.min(18, rows - 18));
  }

  /** Creates screen. */
  createScreen(context: StarbaseScreenContext): StarbaseScreenModel {
    const visibleRowCount = this.getVisibleRowCount(context.canvasHeight, context.charHeight);
    const meta = this.getSectionMeta(context.starbase);
    return createStarbaseScreenModel({
      starbase: context.starbase,
      player: context.player,
      sectionId: this.sectionId,
      selectedIndex: this.getSelection(),
      viewOffset: this.getOffset(),
      visibleRowCount,
      rows: context.rows,
      columns: meta.columns,
      widths: meta.widths,
      title: meta.title,
      subtitle: meta.subtitle,
      detailLineCount: this.sectionId === 'overview' ? 2 : 1,
      alert: this.alert || context.statusMessage,
    });
  }

  /** Returns section meta. */
  getSectionMeta(starbase: Starbase): StarbaseSectionMeta {
    const baseSubtitle = `${starbase.name} | ${new Date(0).toISOString().slice(11, 16)} station time`;
    switch (this.sectionId) {
      case 'overview':
        return {
          title: 'Starbase Operations',
          subtitle: baseSubtitle,
          columns: ['PORT SECTION', 'STATUS'],
          widths: [24, 18],
        };
      case 'cargo':
        return {
          title: 'Cargo Manifest',
          subtitle: 'All cargo currently aboard your vessel.',
          columns: ['ITEM', 'QTY', 'VALUE', 'CLASS'],
          widths: [26, 7, 9, 18],
        };
      case 'buy':
        return {
          title: 'Trade Depot - Buy',
          subtitle: 'Purchase selected depot stock with Enter.',
          columns: ['COMMODITY', 'STOCK', 'BUY CR', 'CLASS'],
          widths: [26, 7, 9, 20],
        };
      case 'sell':
        return {
          title: 'Trade Depot - Sell',
          subtitle: 'Sell selected cargo lots with Enter.',
          columns: ['CARGO', 'HELD', 'SELL CR', 'CLASS'],
          widths: [26, 7, 9, 20],
        };
      case 'services':
        return {
          title: 'Port Services',
          subtitle: 'Station services and ship logistics.',
          columns: ['SERVICE', 'COST', 'STATUS', 'NOTES'],
          widths: [22, 10, 14, 34],
        };
      case 'notices':
        return {
          title: 'Station Notices',
          subtitle: 'Local bulletins, advisories, and dockmaster traffic.',
          columns: ['DATE', 'PRIORITY', 'NOTICE'],
          widths: [10, 10, 58],
        };
      case 'missions':
        return {
          title: 'Mission Board',
          subtitle: 'Local contracts authorised by station offices.',
          columns: ['CONTRACT', 'PAY', 'RISK', 'STATUS', 'SUMMARY'],
          widths: [22, 9, 7, 10, 32],
        };
      case 'shipyard':
        return {
          title: 'Shipyard',
          subtitle: 'Superstructure slots, installed modules, and refit orders.',
          columns: ['BAY', 'QUOTE', 'ETA', 'WORK ORDER'],
          widths: [22, 10, 8, 48],
        };
      case 'crew':
        return {
          title: 'Crew Roster',
          subtitle: 'Recruitment, personnel records, and starbase training.',
          columns: ['NAME', 'ROLE', 'COST/PTS', 'PROFILE'],
          widths: [20, 16, 9, 39],
        };
    }
  }
}
