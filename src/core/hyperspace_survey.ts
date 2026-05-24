import { CONFIG } from '../config';
import {
  DeepSpacePhenomenonProperties,
  InterstellarMediumProperties,
  SystemDataGenerator,
  SystemMapProperties,
} from '../generation/system_data_generator';

export interface HyperspaceSurveyCell {
  worldX: number;
  worldY: number;
  rangeCells: number;
  system: SystemMapProperties;
  phenomenon: DeepSpacePhenomenonProperties | null;
}

export interface HyperspaceSurveyContact {
  kind: 'system' | 'phenomenon';
  dx: number;
  dy: number;
  distSq: number;
  system?: SystemMapProperties;
  phenomenon?: DeepSpacePhenomenonProperties;
}

export interface HyperspaceSurveyStarbaseMarker {
  x: number;
  y: number;
  distanceCells: number;
}

export interface HyperspaceSurvey {
  signature: string;
  worldX: number;
  worldY: number;
  cols: number;
  rows: number;
  medium: InterstellarMediumProperties;
  detectionRadius: number;
  visibleCells: HyperspaceSurveyCell[];
  contacts: HyperspaceSurveyContact[];
  overlayContacts: HyperspaceSurveyContact[];
  nearestSystemContact: HyperspaceSurveyContact | null;
  starbaseMarkers: HyperspaceSurveyStarbaseMarker[];
}

interface ContactRadii {
  statusRadius: number;
  overlayRadius: number;
}

const EMPTY_PHENOMENON: DeepSpacePhenomenonProperties = {
  exists: false,
  type: null,
  name: null,
  classification: null,
  signal: null,
  char: null,
  colour: null,
  rarity: null,
};

export class HyperspaceSurveyService {
  private readonly systemDataGenerator: SystemDataGenerator;
  private cellCache: Map<string, Omit<HyperspaceSurveyCell, 'rangeCells'>> = new Map();
  private surveyCache: HyperspaceSurvey | null = null;
  private overlayContactsCache: { signature: string; contacts: HyperspaceSurveyContact[] } | null = null;
  private readonly maxCellCacheSize = 80000;

  constructor(systemDataGenerator: SystemDataGenerator) {
    this.systemDataGenerator = systemDataGenerator;
  }

  clearCache(): void {
    this.cellCache.clear();
    this.surveyCache = null;
    this.overlayContactsCache = null;
  }

  getSurvey(worldX: number, worldY: number, cols: number, rows: number): HyperspaceSurvey {
    const safeCols = Math.max(1, Math.floor(cols));
    const safeRows = Math.max(1, Math.floor(rows));
    const medium = this.systemDataGenerator.getInterstellarMediumProperties(worldX, worldY);
    const detectionRadius = Math.max(
      4,
      Math.ceil(CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS * medium.sensorRangeMultiplier)
    );
    const signature = `${worldX},${worldY}|${safeCols}x${safeRows}|${medium.sensorRangeMultiplier.toFixed(3)}`;
    if (this.surveyCache?.signature === signature) return this.surveyCache;

    const viewCenterX = Math.floor(safeCols / 2);
    const viewCenterY = Math.floor(safeRows / 2);
    const startWorldX = worldX - viewCenterX;
    const startWorldY = worldY - viewCenterY;
    const visibleCells = new Array<HyperspaceSurveyCell>(safeCols * safeRows);
    const starbaseMarkers: HyperspaceSurveyStarbaseMarker[] = [];

    for (let y = 0; y < safeRows; y++) {
      for (let x = 0; x < safeCols; x++) {
        const cellWorldX = startWorldX + x;
        const cellWorldY = startWorldY + y;
        const rangeCells = Math.hypot(x - viewCenterX, y - viewCenterY);
        const cell = this.getCell(cellWorldX, cellWorldY, rangeCells);
        visibleCells[y * safeCols + x] = cell;
        if (x > 0 && x < safeCols - 1 && cell.system.exists && cell.system.hasStarbase) {
          starbaseMarkers.push({ x, y, distanceCells: rangeCells });
        }
      }
    }

    const scanRadius = Math.max(detectionRadius, Math.ceil(CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS * medium.sensorRangeMultiplier));
    const nearestSystemContact = this.findNearestSystemContact(worldX, worldY, scanRadius, medium.sensorRangeMultiplier);
    const contacts = nearestSystemContact ? [nearestSystemContact] : [];

    const survey: HyperspaceSurvey = {
      signature,
      worldX,
      worldY,
      cols: safeCols,
      rows: safeRows,
      medium,
      detectionRadius,
      visibleCells,
      contacts,
      overlayContacts: [],
      nearestSystemContact,
      starbaseMarkers,
    };
    this.surveyCache = survey;
    return survey;
  }

  getOverlayContacts(survey: HyperspaceSurvey): HyperspaceSurveyContact[] {
    if (this.overlayContactsCache?.signature === survey.signature) {
      return this.overlayContactsCache.contacts;
    }

    const contacts: HyperspaceSurveyContact[] = [];
    const scanRadius = Math.max(
      survey.detectionRadius,
      Math.ceil(CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS * survey.medium.sensorRangeMultiplier)
    );

    for (let dy = -scanRadius; dy <= scanRadius; dy++) {
      for (let dx = -scanRadius; dx <= scanRadius; dx++) {
        const distSq = dx * dx + dy * dy;
        const range = Math.sqrt(distSq);
        const cell = this.getCell(survey.worldX + dx, survey.worldY + dy, range);
        if (cell.system.exists && cell.system.name && cell.system.starType) {
          const radii = this.getContactRadii(cell.system, survey.medium.sensorRangeMultiplier);
          if (range <= radii.overlayRadius) {
            contacts.push({ kind: 'system', dx, dy, distSq, system: cell.system });
          }
          continue;
        }
        if (cell.phenomenon?.exists && range <= survey.detectionRadius) {
          contacts.push({ kind: 'phenomenon', dx, dy, distSq, phenomenon: cell.phenomenon });
        }
      }
    }

    contacts.sort(this.compareContacts);
    this.overlayContactsCache = { signature: survey.signature, contacts };
    survey.overlayContacts = contacts;
    return contacts;
  }

  private findNearestSystemContact(
    worldX: number,
    worldY: number,
    scanRadius: number,
    sensorRangeMultiplier: number
  ): HyperspaceSurveyContact | null {
    let best: HyperspaceSurveyContact | null = null;
    let bestRange = Number.POSITIVE_INFINITY;

    for (let radius = 0; radius <= scanRadius; radius++) {
      const shellContacts: HyperspaceSurveyContact[] = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const distSq = dx * dx + dy * dy;
          const range = Math.sqrt(distSq);
          if (range > scanRadius || range > bestRange) continue;
          const cell = this.getCell(worldX + dx, worldY + dy, range);
          if (!cell.system.exists || !cell.system.name || !cell.system.starType) continue;
          const radii = this.getContactRadii(cell.system, sensorRangeMultiplier);
          if (range > radii.statusRadius) continue;
          shellContacts.push({ kind: 'system', dx, dy, distSq, system: cell.system });
        }
      }

      if (shellContacts.length > 0) {
        shellContacts.sort(this.compareContacts);
        best = shellContacts[0];
        bestRange = Math.sqrt(best.distSq);
      }

      if (best && radius >= Math.ceil(bestRange)) {
        return best;
      }
    }

    return best;
  }

  private getContactRadii(system: SystemMapProperties, sensorRangeMultiplier: number): ContactRadii {
    return {
      statusRadius:
        (system.objectKind === 'brown-dwarf' ? CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS : 18) *
        sensorRangeMultiplier,
      overlayRadius:
        (system.objectKind === 'brown-dwarf' ? CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS : 9) *
        sensorRangeMultiplier,
    };
  }

  private getCell(worldX: number, worldY: number, rangeCells: number): HyperspaceSurveyCell {
    const key = `${worldX},${worldY}`;
    let cached = this.cellCache.get(key);
    if (!cached) {
      const system = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
      const phenomenon = system.exists
        ? EMPTY_PHENOMENON
        : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
      cached = { worldX, worldY, system, phenomenon };
      if (this.cellCache.size >= this.maxCellCacheSize) {
        const firstKey = this.cellCache.keys().next().value;
        if (firstKey !== undefined) this.cellCache.delete(firstKey);
      }
      this.cellCache.set(key, cached);
    }
    return { ...cached, rangeCells };
  }

  private compareContacts(a: HyperspaceSurveyContact, b: HyperspaceSurveyContact): number {
    const distDelta = a.distSq - b.distSq;
    if (distDelta !== 0) return distDelta;
    const aName = a.system?.name ?? a.phenomenon?.name ?? '';
    const bName = b.system?.name ?? b.phenomenon?.name ?? '';
    return aName.localeCompare(bName);
  }
}
