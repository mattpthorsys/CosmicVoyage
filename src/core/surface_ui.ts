import { CONFIG } from '../config';
import { wrapDashboardLines, type TextDashboardLine } from './text_ui';

export interface SurfaceCrewReading {
  name: string;
  hitPoints: number;
  maxHitPoints: number;
}

export interface SurfaceVehicleOverlayModel {
  dateTime: string;
  notifications: string[];
  deployed: boolean;
  moving: boolean;
  available: boolean;
  onFoot: boolean;
  fuel: number;
  maxFuel: number;
  cargo: number;
  cargoCapacity: number;
  selectedIndex: number;
  items: Array<{
    id?: string;
    label: string;
    status: string;
    key?: string;
    tone?: 'normal' | 'green' | 'red' | 'muted';
  }>;
  mapExpanded?: boolean;
  surfaceCellScale?: number;
  scanCursor?: { dx: number; dy: number };
  ship?: { x: number; y: number };
  shipDistance?: { distanceKm: number; direction: string };
  atShip?: boolean;
  altitudeBand?: { low: string; high: string; current: string };
  settlement?: string;
  crew: SurfaceCrewReading[];
}

export interface SurfaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SurfaceScreenLayout {
  viewport: SurfaceRect;
  sidebar: SurfaceRect | null;
  resourcesY: number;
  resourceRows: number;
  settlementY: number;
  settlementRows: number;
  dateY: number | null;
  shipY: number | null;
  crewY: number | null;
  crewRows: number;
  notificationsY: number;
  commandsY: number;
  detailY: number;
  controlsY: number;
}

/** Wraps compact crew identities and exact health values without clipping damaged members out of view. */
export function createSurfaceCrewLines(
  crew: readonly SurfaceCrewReading[],
  width: number
): TextDashboardLine[] {
  return crew.flatMap((member) => {
    const parts = member.name.trim().split(/\s+/);
    const name = parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : member.name;
    const health = member.hitPoints <= 0 ? 'DEAD' : `${member.hitPoints}/${member.maxHitPoints}`;
    const tone =
      member.hitPoints <= 0 ? 'red' : member.hitPoints < member.maxHitPoints * 0.4 ? 'amber' : 'green';
    return wrapDashboardLines(
      [
        {
          segments: [
            { text: `${name}  `, tone: 'muted' },
            { text: health, tone },
          ],
        },
      ],
      width
    );
  });
}

/** Reserves all footer rows before allocating terrain; rendering and scan limits share this geometry. */
export function createSurfaceScreenLayout(
  cols: number,
  rows: number,
  crew: readonly SurfaceCrewReading[] = []
): SurfaceScreenLayout {
  const sidebarWidth = cols >= 96 ? 24 : 0;
  const width = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_WIDTH, cols - sidebarWidth - 5));
  const x = Math.max(1, Math.floor((cols - sidebarWidth - width) / 2));
  const resourceRows = width >= 68 ? 1 : width >= 32 ? 2 : 3;
  const settlementRows = width < 32 ? 2 : 1;
  const crewRows = sidebarWidth ? 0 : Math.max(2, Math.min(6, createSurfaceCrewLines(crew, width).length));
  const footerRows = resourceRows + settlementRows + (sidebarWidth ? 0 : 2 + crewRows) + 6;
  const headerRows = width < 32 ? 5 : 4;
  const viewport = {
    x,
    y: headerRows,
    width,
    height: Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_HEIGHT, rows - headerRows - 1 - footerRows)),
  };
  const resourcesY = viewport.y + viewport.height + 1;
  const settlementY = resourcesY + resourceRows;
  const dateY = sidebarWidth ? null : settlementY + settlementRows;
  const shipY = dateY === null ? null : dateY + 1;
  const crewY = shipY === null ? null : shipY + 1;
  const notificationsY = settlementY + settlementRows + (sidebarWidth ? 0 : 2 + crewRows);
  return {
    viewport,
    sidebar: sidebarWidth
      ? { x: x + width + 3, y: viewport.y, width: cols - x - width - 5, height: rows - viewport.y - 1 }
      : null,
    resourcesY,
    resourceRows,
    settlementY,
    settlementRows,
    dateY,
    shipY,
    crewY,
    crewRows,
    notificationsY,
    commandsY: notificationsY + 2,
    detailY: notificationsY + 3,
    controlsY: notificationsY + 5,
  };
}

/** Names only existing direct action bindings; Enter still activates the selected command. */
export function getSurfaceActionKey(id: string): string | undefined {
  const keys: Record<string, string> = {
    map: CONFIG.KEY_BINDINGS.GALAXY_MAP,
    cargo: CONFIG.KEY_BINDINGS.ROVER_CARGO,
    operations: CONFIG.KEY_BINDINGS.SHIP_MENU,
    mine: CONFIG.KEY_BINDINGS.MINE,
    scan: CONFIG.KEY_BINDINGS.SCAN,
    life: CONFIG.KEY_BINDINGS.BIOLOGY_SITE,
    missions: CONFIG.KEY_BINDINGS.MISSION_JOURNAL,
    science: CONFIG.KEY_BINDINGS.SCIENCE_LOG,
  };
  return keys[id]?.toUpperCase();
}

/** Selects a horizontal command window that always contains the current action. */
export function createSurfaceCommandWindow(
  items: readonly SurfaceVehicleOverlayModel['items'][number][],
  selectedIndex: number,
  width: number
): { start: number; end: number; labels: string[] } {
  const labels = items.map((item) => `${item.key ? `[${item.key}] ` : ''}${item.label.toUpperCase()}`);
  if (!items.length) return { start: 0, end: 0, labels };
  let start = Math.max(0, Math.min(items.length - 1, selectedIndex));
  let end = start + 1;
  let used = labels[start].length;
  const available = Math.max(1, width - 4);
  while (start > 0 && used + labels[start - 1].length + 2 <= available) {
    used += labels[--start].length + 2;
  }
  while (end < items.length && used + labels[end].length + 2 <= available) {
    used += labels[end++].length + 2;
  }
  return { start, end, labels };
}
