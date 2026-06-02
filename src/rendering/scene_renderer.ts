import { CellState, ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, ELEMENTS, AU_IN_METERS } from '../constants';
import { logger } from '../utils/logger';
import { adjustBrightness, interpolateColour, rgbToHex, RgbColour } from './colour';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { createSystemTravelStarfield, getRenderedStarCell } from './starfield';
import { StarbaseScreenModel } from '../core/starbase_ui';
import { OrbitScreenModel } from '../core/orbit_ui';
import { TextMenuSection, TextModalTableModel, TextTableModel } from '../core/text_ui';
import { formatDistanceAu, formatLightTimeFromMeters } from '../utils/space_scale';
import { HyperspaceSurveyCell, HyperspaceSurveyService } from '../core/hyperspace_survey';

interface VisiblePlanetMarker {
  planet: Planet;
  viewX: number;
  viewY: number;
  marker: string;
}

interface HyperspaceTile {
  bg: string;
  starChar: string | null;
  starColor: string | null;
}

interface HyperspaceFrameCache {
  cols: number;
  rows: number;
  startWorldX: number;
  startWorldY: number;
  cells: CellState[];
}

type GiantAtmosphereSample = {
  colour: string;
  brightness: number;
  storm: number;
  texture: number;
  edge: number;
};

interface TextTableLayout {
  model: TextTableModel;
  tableWidth: number;
}

interface SolidTextureSample {
  colour: string;
  liquid: boolean;
  reflectiveColour?: string;
}

export interface SurfaceVehicleOverlayModel {
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
  items: Array<{ id?: string; label: string; status: string; tone?: 'normal' | 'green' | 'red' | 'muted' }>;
  mapExpanded?: boolean;
  surfaceCellScale?: number;
  scanCursor?: { dx: number; dy: number };
  ship?: { x: number; y: number };
  shipDistance?: { distanceKm: number; direction: string };
  atShip?: boolean;
  altitudeBand?: { low: string; high: string; current: string };
  crew: Array<{ name: string; hitPoints: number; maxHitPoints: number }>;
}

/** Contains methods for rendering specific game scenes/states. */
export class SceneRenderer {
  private screenBuffer: ScreenBuffer; // Main buffer for primary content
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;
  private systemDataGenerator: SystemDataGenerator;
  private hyperspaceSurveyService: HyperspaceSurveyService | null;
  private hyperspaceTileCache: Map<string, HyperspaceTile> = new Map();
  private hyperspaceFrameCache: HyperspaceFrameCache | null = null;
  private readonly maxHyperspaceTileCacheSize = 60000;

  constructor(
    screenBuffer: ScreenBuffer,
    drawingContext: DrawingContext,
    nebulaRenderer: NebulaRenderer,
    systemDataGenerator: SystemDataGenerator,
    hyperspaceSurveyService: HyperspaceSurveyService | null = null
  ) {
    this.screenBuffer = screenBuffer;
    this.drawingContext = drawingContext;
    this.nebulaRenderer = nebulaRenderer;
    this.systemDataGenerator = systemDataGenerator;
    this.hyperspaceSurveyService = hyperspaceSurveyService;
    logger.debug('[SceneRenderer] Instance created.');
  }

  clearCaches(): void {
    this.hyperspaceTileCache.clear();
    this.hyperspaceFrameCache = null;
  }

  /** Draws the hyperspace view (stars, nebulae). */
  drawHyperspace(player: Player): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;

    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startWorldX = player.position.worldX - viewCenterX;
    const startWorldY = player.position.worldY - viewCenterY;

    this.screenBuffer.clear(false);
    if (
      this.hyperspaceFrameCache &&
      this.hyperspaceFrameCache.cols === cols &&
      this.hyperspaceFrameCache.rows === rows &&
      this.hyperspaceFrameCache.startWorldX === startWorldX &&
      this.hyperspaceFrameCache.startWorldY === startWorldY
    ) {
      this.stageHyperspaceCells(this.hyperspaceFrameCache.cells, viewCenterX, viewCenterY, player);
      return;
    }

    const shiftedCells = this.tryShiftHyperspaceFrame(startWorldX, startWorldY, cols, rows, viewCenterX, viewCenterY);
    if (shiftedCells) {
      this.hyperspaceFrameCache = { cols, rows, startWorldX, startWorldY, cells: shiftedCells };
      this.stageHyperspaceCells(shiftedCells, viewCenterX, viewCenterY, player);
      return;
    }

    const survey = this.hyperspaceSurveyService?.getSurvey(player.position.worldX, player.position.worldY, cols, rows);
    const cells = this.createHyperspaceBackgroundCells(cols, rows, startWorldX, startWorldY, viewCenterX, viewCenterY, survey?.visibleCells);
    this.hyperspaceFrameCache = { cols, rows, startWorldX, startWorldY, cells };
    this.stageHyperspaceCells(cells, viewCenterX, viewCenterY, player);
  }

  private createHyperspaceBackgroundCells(
    cols: number,
    rows: number,
    startWorldX: number,
    startWorldY: number,
    viewCenterX: number,
    viewCenterY: number,
    surveyCells?: readonly HyperspaceSurveyCell[]
  ): CellState[] {
    const cells = new Array<CellState>(cols * rows);
    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const surveyCell = surveyCells?.[viewY * cols + viewX];
        const worldX = surveyCell?.worldX ?? startWorldX + viewX;
        const worldY = surveyCell?.worldY ?? startWorldY + viewY;
        const rangeCells = surveyCell?.rangeCells ?? Math.hypot(viewX - viewCenterX, viewY - viewCenterY);
        const tile = surveyCell
          ? this.getHyperspaceTileFromSurveyCell(surveyCell)
          : this.getHyperspaceTile(worldX, worldY, rangeCells);
        const index = viewY * cols + viewX;

        if (tile.starChar) {
          cells[index] = this.createCell(tile.starChar, tile.starColor, CONFIG.TRANSPARENT_COLOUR, true);
        } else {
          cells[index] = this.createCell(' ', CONFIG.DEFAULT_FG_COLOUR, tile.bg, false);
        }
      }
    }
    return cells;
  }

  private tryShiftHyperspaceFrame(
    startWorldX: number,
    startWorldY: number,
    cols: number,
    rows: number,
    viewCenterX: number,
    viewCenterY: number
  ): CellState[] | null {
    const previous = this.hyperspaceFrameCache;
    if (!previous || previous.cols !== cols || previous.rows !== rows || previous.cells.length !== cols * rows) {
      return null;
    }

    const deltaX = startWorldX - previous.startWorldX;
    const deltaY = startWorldY - previous.startWorldY;
    if (deltaX === 0 && deltaY === 0) return previous.cells;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) return null;

    const cells = new Array<CellState>(cols * rows);
    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const sourceX = viewX + deltaX;
        const sourceY = viewY + deltaY;
        const index = viewY * cols + viewX;
        if (sourceX >= 0 && sourceX < cols && sourceY >= 0 && sourceY < rows) {
          const previousRange = Math.hypot(sourceX - viewCenterX, sourceY - viewCenterY);
          const currentRange = Math.hypot(viewX - viewCenterX, viewY - viewCenterY);
          if (this.getHyperspaceRangeBand(previousRange) === this.getHyperspaceRangeBand(currentRange)) {
            cells[index] = previous.cells[sourceY * cols + sourceX];
            continue;
          }
        }

        const worldX = startWorldX + viewX;
        const worldY = startWorldY + viewY;
        const tile = this.getHyperspaceTile(worldX, worldY, Math.hypot(viewX - viewCenterX, viewY - viewCenterY));
        cells[index] = tile.starChar
          ? this.createCell(tile.starChar, tile.starColor, CONFIG.TRANSPARENT_COLOUR, true)
          : this.createCell(' ', CONFIG.DEFAULT_FG_COLOUR, tile.bg, false);
      }
    }
    return cells;
  }

  private getHyperspaceRangeBand(rangeCells: number): number {
    if (rangeCells <= 12) return 0;
    if (rangeCells <= CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS) return 1;
    if (rangeCells <= CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS) return 2;
    return 3;
  }

  private stageHyperspaceCells(
    backgroundCells: readonly CellState[],
    viewCenterX: number,
    viewCenterY: number,
    player: Player
  ): void {
    const cells = backgroundCells.slice();
    cells[viewCenterY * this.screenBuffer.getCols() + viewCenterX] = this.createCell(
      player.render.char,
      player.render.fgColor,
      CONFIG.TRANSPARENT_COLOUR,
      true
    );
    this.screenBuffer.stageCells(cells);
  }

  private createCell(char: string | null, fg: string | null, bg: string | null, isTransparentBg: boolean): CellState {
    return {
      char: char || ' ',
      fg: fg || CONFIG.DEFAULT_FG_COLOUR,
      bg: isTransparentBg ? CONFIG.TRANSPARENT_COLOUR : (bg || CONFIG.DEFAULT_BG_COLOUR),
      isTransparentBg,
    };
  }

  private getHyperspaceTile(worldX: number, worldY: number, rangeCells: number): HyperspaceTile {
    const key = `${worldX},${worldY}|${Math.floor(rangeCells)}`;
    const cached = this.hyperspaceTileCache.get(key);
    if (cached) return cached;

    const bg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);
    const systemProps = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
    const phenomenon = systemProps.exists
      ? null
      : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
    const tile = this.createHyperspaceTile(bg, systemProps, phenomenon, worldX, worldY, rangeCells);

    if (this.hyperspaceTileCache.size >= this.maxHyperspaceTileCacheSize) {
      const firstKey = this.hyperspaceTileCache.keys().next().value;
      if (firstKey !== undefined) this.hyperspaceTileCache.delete(firstKey);
    }
    this.hyperspaceTileCache.set(key, tile);
    return tile;
  }

  private getHyperspaceTileFromSurveyCell(cell: HyperspaceSurveyCell): HyperspaceTile {
    const key = `${cell.worldX},${cell.worldY}|${Math.floor(cell.rangeCells)}`;
    const cached = this.hyperspaceTileCache.get(key);
    if (cached) return cached;

    const bg = this.nebulaRenderer.getBackgroundColor(cell.worldX, cell.worldY);
    const tile = this.createHyperspaceTile(bg, cell.system, cell.phenomenon, cell.worldX, cell.worldY, cell.rangeCells);
    if (this.hyperspaceTileCache.size >= this.maxHyperspaceTileCacheSize) {
      const firstKey = this.hyperspaceTileCache.keys().next().value;
      if (firstKey !== undefined) this.hyperspaceTileCache.delete(firstKey);
    }
    this.hyperspaceTileCache.set(key, tile);
    return tile;
  }

  private createHyperspaceTile(
    bg: string,
    systemProps: { exists: boolean; starType: string | null; objectKind: 'stellar' | 'brown-dwarf' | null },
    phenomenon: { exists: boolean; char: string | null; colour: string | null; type: string | null } | null,
    worldX: number,
    worldY: number,
    rangeCells: number
  ): HyperspaceTile {
    let tile: HyperspaceTile;
    if (systemProps.exists) {
      const starInfo = SPECTRAL_TYPES[systemProps.starType!];
      if (starInfo) {
        const isBrownDwarf = systemProps.objectKind === 'brown-dwarf';
        if (isBrownDwarf && rangeCells > CONFIG.BROWN_DWARF_DETECTION_RADIUS_CELLS) {
          tile = { bg, starChar: null, starColor: null };
        } else {
          const star = getRenderedStarCell(systemProps.starType!, worldX, worldY);
          tile = {
            bg,
            starChar: star.char,
            starColor: isBrownDwarf ? this.dimHexColour(star.color, rangeCells <= 12 ? 0.75 : 0.42) : star.color,
          };
        }
      } else {
        logger.error(`[SceneRenderer.drawHyperspace] Could not find star info for final determined type "${systemProps.starType}" at [${worldX}, ${worldY}].`);
        tile = { bg, starChar: '?', starColor: '#FF00FF' };
      }
    } else {
      if (phenomenon?.exists && phenomenon.char && phenomenon.colour && rangeCells <= CONFIG.DEEP_SPACE_PHENOMENA_DETECTION_RADIUS_CELLS) {
        const dimFactor = phenomenon.type === 'ancient-signal' ? 0.62 : phenomenon.type === 'neutron-star' ? 0.85 : 0.45;
        tile = { bg, starChar: phenomenon.char, starColor: this.dimHexColour(phenomenon.colour, dimFactor) };
      } else {
        tile = { bg, starChar: null, starColor: null };
      }
    }
    return tile;
  }

  private dimHexColour(hex: string, factor: number): string {
    const normalized = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value * factor)));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`.toUpperCase();
  }

  private drawSystemTravelStarfield(player: Player): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;

    for (const cell of createSystemTravelStarfield(cols, rows, player.position.systemX, player.position.systemY)) {
      this.screenBuffer.drawChar(cell.char, cell.x, cell.y, cell.color, CONFIG.DEFAULT_BG_COLOUR);
    }
  }

  // --- drawSolarSystem (Refactored) ---
  /** Draws the solar system view, including moons, using the specified view scale. */
  drawSolarSystem(player: Player, system: SolarSystem, currentViewScale: number): void {
    logger.debug(`[SceneRenderer.drawSolarSystem] Drawing system: ${system.name} (Scale: ${currentViewScale.toExponential(1)} m/cell)`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;

    const viewScale = currentViewScale;
    if (!Number.isFinite(viewScale) || viewScale <= 0) {
        logger.error(`[SceneRenderer.drawSolarSystem] Invalid viewScale received: ${viewScale}. Aborting draw.`);
        this._drawError("Internal Error: Invalid view scale.");
        return;
    }

    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const viewWorldStartX = player.position.systemX - viewCenterX * viewScale;
    const viewWorldStartY = player.position.systemY - viewCenterY * viewScale;

    this.screenBuffer.clear(false); // Clear main buffer's internal state
    this.drawSystemTravelStarfield(player);

    // --- Draw Stars ---
    system.stars.forEach((star) => {
      const starInfo = SPECTRAL_TYPES[star.starType];
      const starColor = starInfo?.colour || '#FFFFFF';
      const starViewX = Math.floor((star.systemX - viewWorldStartX) / viewScale);
      const starViewY = Math.floor((star.systemY - viewWorldStartY) / viewScale);
      const starRadius = starInfo?.radius ? Math.max(0, Math.round(starInfo.radius / viewScale)) : 1;
      this._drawStarInSystem(starViewX, starViewY, starRadius, starColor, star.id);
    });

    // --- Collect Visible Planets and Moons ---
    const visiblePlanets: VisiblePlanetMarker[] = [];
    const visibleMoons: { moon: Planet, viewX: number, viewY: number, parentViewX: number, parentViewY: number }[] = [];

    system.planets.forEach((planet, planetIndex) => {
      if (!planet) return;

      // Draw Planet Orbit (Helper handles visibility checks)
      const orbitCenter = system.getOrbitCenter(planet.orbitHost);
      const orbitCenterViewX = Math.floor((orbitCenter.x - viewWorldStartX) / viewScale);
      const orbitCenterViewY = Math.floor((orbitCenter.y - viewWorldStartY) / viewScale);
      this._drawPlanetOrbit(planet, orbitCenterViewX, orbitCenterViewY, viewScale);

      // Calculate Planet Position
      const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
      const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);

      // Check if planet is in view
      if (planetViewX >= 0 && planetViewX < cols && planetViewY >= 0 && planetViewY < rows) {
          visiblePlanets.push({ planet, viewX: planetViewX, viewY: planetViewY, marker: this.getPlanetMarker(planetIndex) });

          // Check Moons if planet is visible
          if (planet.moons) {
              planet.moons.forEach(moon => {
                  const moonViewX = Math.floor((moon.systemX - viewWorldStartX) / viewScale);
                  const moonViewY = Math.floor((moon.systemY - viewWorldStartY) / viewScale);
                  // Check if moon is in view
                  if (moonViewX >= 0 && moonViewX < cols && moonViewY >= 0 && moonViewY < rows) {
                      visibleMoons.push({ moon, viewX: moonViewX, viewY: moonViewY, parentViewX: planetViewX, parentViewY: planetViewY });
                  }
              });
          }
      }
    });

    // --- Draw Planets ---
    visiblePlanets.forEach(item => {
        this._drawPlanetBody(item.planet, item.viewX, item.viewY, item.marker);
    });

    // --- Draw Moons --- (After Planets)
    visibleMoons.forEach(item => {
        // Don't draw moon if it occupies the exact same cell as its parent planet
        if (item.viewX !== item.parentViewX || item.viewY !== item.parentViewY) {
            this._drawMoonBody(item.moon, item.viewX, item.viewY, viewScale);
        }
    });

    // --- Draw Starbase ---
    if (system.starbase) {
      const barycenterViewX = Math.floor((0 - viewWorldStartX) / viewScale);
      const barycenterViewY = Math.floor((0 - viewWorldStartY) / viewScale);
      this._drawStarbaseInSystem(system.starbase, barycenterViewX, barycenterViewY, viewWorldStartX, viewWorldStartY, viewScale);
    }

    this.drawSystemPlanetHud(system, player, visiblePlanets);

    // --- Draw Player --- (Always at center)
    this.screenBuffer.drawChar(player.render.char, viewCenterX, viewCenterY, player.render.fgColor, null);

    // --- Draw Minimap ---
    this.drawSystemMinimap(system, player);
  }

  // --- Private Helper Methods for drawSolarSystem ---

  private _drawStarInSystem(starViewX: number, starViewY: number, starRadius: number, starColor: string, label?: string): void {
      const cols = this.screenBuffer.getCols();
      const rows = this.screenBuffer.getRows();
      // Draw star only if potentially visible
      if (starViewX + starRadius >= 0 && starViewX - starRadius < cols && starViewY + starRadius >= 0 && starViewY - starRadius < rows) {
          this.drawingContext.drawCircle(starViewX, starViewY, starRadius, GLYPHS.SHADE_DARK, starColor, starColor);
          this.drawingContext.drawOrbit(starViewX, starViewY, starRadius, GLYPHS.SHADE_MEDIUM, starColor, 0, 0, cols - 1, rows - 1);
          if (label && starViewX + 1 < cols && starViewY >= 0 && starViewY < rows) {
            this.screenBuffer.drawString(label, starViewX + 1, starViewY, starColor, null);
          }
      }
  }

  private _drawPlanetOrbit(planet: Planet, starViewX: number, starViewY: number, viewScale: number): void {
      const cols = this.screenBuffer.getCols();
      const rows = this.screenBuffer.getRows();
      const orbitViewRadius = Math.round(planet.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
          this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOUR_MAIN, 0, 0, cols - 1, rows - 1);
      }
  }

  private _drawPlanetBody(planet: Planet, planetViewX: number, planetViewY: number, marker: string): void {
      const planetColor = this.getPlanetDisplayColour(planet.type);
      this.screenBuffer.drawChar(marker, planetViewX, planetViewY, '#000000', planetColor);
  }

  private getPlanetMarker(index: number): string {
    return '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index] ?? '?';
  }

  private _drawMoonBody(moon: Planet, moonViewX: number, moonViewY: number, viewScale: number): void {
      // Moons are only drawn if visible and not exactly overlapping parent (checked in caller)
      // Determine moon glyph based on zoom? For now, always '.'
      const moonGlyph = '.';
      const moonColor = this.getPlanetDisplayColour(moon.type);
      this.screenBuffer.drawChar(moonGlyph, moonViewX, moonViewY, moonColor, null);
  }

  private _drawStarbaseInSystem(starbase: Starbase, starViewX: number, starViewY: number, viewWorldStartX: number, viewWorldStartY: number, viewScale: number): void {
      const cols = this.screenBuffer.getCols();
      const rows = this.screenBuffer.getRows();
      const orbitViewRadius = Math.round(starbase.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
          this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOUR, 0, 0, cols - 1, rows - 1);
      }
      const sbViewX = Math.floor((starbase.systemX - viewWorldStartX) / viewScale);
      const sbViewY = Math.floor((starbase.systemY - viewWorldStartY) / viewScale);
      if (sbViewX >= 0 && sbViewX < cols && sbViewY >= 0 && sbViewY < rows) {
           this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbViewX, sbViewY, '#001010', CONFIG.STARBASE_COLOUR);
      }
  }

  private drawSystemPlanetHud(system: SolarSystem, player: Player, visiblePlanets: VisiblePlanetMarker[]): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols < 46 || rows < 14 || visiblePlanets.length === 0) return;

    const panelWidth = Math.min(34, cols - 2);
    const maxRows = Math.min(visiblePlanets.length, 7);
    const panelHeight = maxRows + 3;
    const startX = 1;
    const startY = 1;

    this.drawingContext.drawBox(startX, startY, panelWidth, panelHeight, '#3EA6A6', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(' NAV TARGETS ', startX + 2, startY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);

    visiblePlanets.slice(0, maxRows).forEach((item, row) => {
      const planetColor = this.getPlanetDisplayColour(item.planet.type);
      const distanceAu = Math.sqrt(player.distanceSqToSystemCoords(item.planet.systemX, item.planet.systemY)) / AU_IN_METERS;
      const lightTime = formatLightTimeFromMeters(Math.sqrt(player.distanceSqToSystemCoords(item.planet.systemX, item.planet.systemY)))
        .replace(' light-', '')
        .replace('light-', '');
      const bearing = this.formatBearing(item.planet.systemX - player.position.systemX, item.planet.systemY - player.position.systemY);
      const name = item.planet.name.replace(`${system.name} `, '');
      const label = `${item.marker} ${name.padEnd(5).slice(0, 5)} ${distanceAu.toFixed(2).padStart(5)}AU ${lightTime.padStart(7).slice(0, 7)} ${bearing}`;
      const y = startY + 2 + row;
      this.screenBuffer.drawChar(item.marker, startX + 2, y, '#000000', planetColor);
      this.screenBuffer.drawString(label.slice(2, panelWidth - 4), startX + 4, y, '#9FFFE0', CONFIG.DEFAULT_BG_COLOUR);
    });
  }

  private formatBearing(dx: number, dy: number): string {
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'HERE';
    const horizontal = dx > 0 ? 'E' : dx < 0 ? 'W' : '';
    const vertical = dy > 0 ? 'S' : dy < 0 ? 'N' : '';
    return `${vertical}${horizontal}` || 'HERE';
  }

  private drawSystemMinimap(system: SolarSystem, player: Player): void {
    const cols = this.screenBuffer.getCols();
    const mapWidth = Math.floor(cols * CONFIG.MINIMAP_SIZE_FACTOR);
    const mapHeight = mapWidth;
    if (mapWidth <= 0 || mapHeight <= 0) return;
    const mapStartX = cols - mapWidth - 1;
    const mapStartY = 1;
    const worldRadius_m = system.edgeRadius;
    const mapScale_m_per_cell = (2 * worldRadius_m) / Math.min(mapWidth, mapHeight);
    if (mapScale_m_per_cell <= 0 || !Number.isFinite(mapScale_m_per_cell)) { return; }
    this.drawingContext.drawBox(mapStartX - 1, mapStartY - 1, mapWidth + 2, mapHeight + 2, '#888888', CONFIG.DEFAULT_BG_COLOUR);
    const title = system.isStarless ? ' LOCAL FRAME ' : ' LOCAL SYSTEM ';
    this.screenBuffer.drawString(title.slice(0, mapWidth), mapStartX + 1, mapStartY - 1, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    const worldToMinimap = (worldX_m: number, worldY_m: number): { x: number; y: number } | null => {
      const mapX = Math.floor(worldX_m / mapScale_m_per_cell + mapWidth / 2);
      const mapY = Math.floor(worldY_m / mapScale_m_per_cell + mapHeight / 2);
      if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
        return { x: mapStartX + mapX, y: mapStartY + mapY };
      }
      return null;
    };
    for (let y = 0; y < mapHeight; ++y) { for (let x = 0; x < mapWidth; ++x) { this.screenBuffer.drawChar(null, mapStartX + x, mapStartY + y, null, CONFIG.DEFAULT_BG_COLOUR); } }
    system.planets.forEach(p => {
      if (!p) return;
      const planetPos = worldToMinimap(p.systemX, p.systemY);
      if (planetPos) {
        const planetIcon = '.';
        const planetColor = this.getPlanetDisplayColour(p.type);
        this.screenBuffer.drawChar(planetIcon, planetPos.x, planetPos.y, planetColor, CONFIG.DEFAULT_BG_COLOUR);
      }
    });
    system.stars.forEach((star) => {
      const starPos = worldToMinimap(star.systemX, star.systemY);
      if (starPos) {
        const starInfo = SPECTRAL_TYPES[star.starType];
        const starColor = starInfo?.colour || '#FFFFFF';
        this.screenBuffer.drawChar(star.id === 'A' ? '*' : star.id.toLowerCase(), starPos.x, starPos.y, starColor, CONFIG.DEFAULT_BG_COLOUR);
      }
    });
    if (system.starbase) {
        const sbPos = worldToMinimap(system.starbase.systemX, system.starbase.systemY);
        if (sbPos) { this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbPos.x, sbPos.y, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR); }
    }
    const playerPos = worldToMinimap(player.position.systemX, player.position.systemY);
    if (playerPos) { this.screenBuffer.drawChar(player.render.char, playerPos.x, playerPos.y, player.render.fgColor, CONFIG.DEFAULT_BG_COLOUR); }
    const scaleText = `1 cell ${formatDistanceAu(mapScale_m_per_cell)}`;
    this.screenBuffer.drawString(scaleText.slice(0, mapWidth), mapStartX, mapStartY + mapHeight + 1, '#777777', CONFIG.DEFAULT_BG_COLOUR);
  }

  private getPlanetDisplayColour(planetType: string): string {
    switch (planetType) {
      case 'Molten':
        return '#FF6A00';
      case 'Rock':
        return '#9A9488';
      case 'Oceanic':
        return '#3380FF';
      case 'Lunar':
        return '#B8B8B8';
      case 'GasGiant':
        return '#D6A15B';
      case 'IceGiant':
        return '#66D6FF';
      case 'Frozen':
        return '#D8FFFF';
      case 'Hycean':
        return '#70D8D0';
      case 'Greenhouse':
        return '#D7B063';
      case 'CarbonRich':
        return '#8A7E6A';
      case 'Chthonian':
        return '#BF7A5E';
      case 'Cryovolcanic':
        return '#A0D8C8';
      case 'DwarfIce':
        return '#C8D8E8';
      default:
        return PLANET_TYPES[planetType]?.terrainColours[4] || '#CCCCCC';
    }
  }

  /** Draws the surface view for planets or starbases. */
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase, surfaceOverlay?: SurfaceVehicleOverlayModel): void {
    this.screenBuffer.clear(false);
    if (landedObject instanceof Planet) {
      if (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant') {
        this.drawGasGiantSurface(player, landedObject, surfaceOverlay);
      } else {
        this.drawSolidPlanetSurface(player, landedObject, surfaceOverlay);
      }
    } else if (landedObject instanceof Starbase) {
      this.drawStarbaseInterior(player, landedObject);
    } else {
      logger.error(`[SceneRenderer.drawPlanetSurface] Unknown object type: ${typeof landedObject}`);
      this._drawError("Error: Unknown object landed on!");
    }
  }

  /** Draws the surface of a solid planet. */
  private drawSolidPlanetSurface(player: Player, planet: Planet, surfaceOverlay?: SurfaceVehicleOverlayModel): void {
    logger.debug(`[SceneRenderer.drawSolidPlanetSurface] Rendering surface: ${planet.name} (${planet.type})`);
    const map = planet.heightmap;
    const heightColors = planet.heightLevelColors;
    const elementMap = planet.surfaceElementMap;
    const liquidOverlay = this.getPlanetLiquidOverlay(planet);
    if (!map || !heightColors || !elementMap) {
      logger.error(`[SceneRenderer.drawSolidPlanetSurface] Surface data missing for ${planet.name}.`);
      this._drawError(`Surface Error: Missing Data for ${planet.name}`);
      return;
    }
    const mapSize = map.length;
    if (mapSize <= 0) {
        logger.error(`[SceneRenderer.drawSolidPlanetSurface] Invalid map size ${mapSize} for ${planet.name}.`);
        this._drawError(`Surface Error: Invalid Map Size for ${planet.name}`);
        return;
    }
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewport = this.getSurfaceViewport(cols, rows);
    this.drawingContext.drawBox(
      viewport.x - 1,
      viewport.y - 1,
      viewport.width + 2,
      viewport.height + 2,
      '#606060',
      CONFIG.DEFAULT_BG_COLOUR,
      null
    );
    const cellScale = Math.max(1, surfaceOverlay?.surfaceCellScale ?? CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE);
    const centerX = Math.floor(viewport.width / 2);
    const centerY = Math.floor(viewport.height / 2);
    const startMapX = Math.floor(player.position.surfaceX - Math.floor(centerX / cellScale));
    const startMapY = Math.floor(player.position.surfaceY - Math.floor(centerY / cellScale));
    for (let y = 0; y < viewport.height; y++) {
      for (let x = 0; x < viewport.width; x++) {
        const mapX = startMapX + Math.floor(x / cellScale);
        const mapY = startMapY + Math.floor(y / cellScale);
        const wrappedMapX = ((mapX % mapSize) + mapSize) % mapSize;
        const wrappedMapY = ((mapY % mapSize) + mapSize) % mapSize;
        let height = map[wrappedMapY]?.[wrappedMapX] ?? 0;
        height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height)));
        const submerged = !!liquidOverlay && height <= liquidOverlay.seaLevel;
        const terrainColor = submerged
          ? liquidOverlay.colour
          : heightColors[height] || '#FF00FF';
        const screenX = viewport.x + x;
        const screenY = viewport.y + y;
        this.screenBuffer.drawChar(GLYPHS.BLOCK, screenX, screenY, terrainColor, terrainColor);
        const elementKey = elementMap[wrappedMapY]?.[wrappedMapX];
        const isCellCenter = x % cellScale === Math.floor(cellScale / 2) && y % cellScale === Math.floor(cellScale / 2);
        if (!submerged && isCellCenter) this._drawSurfaceOverlay(screenX, screenY, wrappedMapX, wrappedMapY, elementKey, terrainColor, planet);
      }
    }
    if (surfaceOverlay?.ship) this.drawParkedShipMarker(surfaceOverlay.ship, viewport, surfaceOverlay.surfaceCellScale);
    this.screenBuffer.drawChar(
      player.render.char,
      viewport.x + Math.floor(viewport.width / 2),
      viewport.y + Math.floor(viewport.height / 2),
      player.render.fgColor,
      null
    );
    if (surfaceOverlay?.scanCursor) this.drawSurfaceScanCursor(surfaceOverlay.scanCursor, viewport);
    this.drawSurfaceHud(player, planet, viewport);
    if (surfaceOverlay) this.drawSurfaceVehicleOverlay(surfaceOverlay, viewport);
    if (this.screenBuffer.getCols() < 96) this.drawHeightmapLegend(planet);
  }

  private getSurfaceViewport(cols: number, rows: number): { x: number; y: number; width: number; height: number } {
    const sidebarWidth = cols >= 96 ? 24 : 0;
    const width = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_WIDTH, Math.max(1, cols - sidebarWidth - 5)));
    const height = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_HEIGHT, Math.max(1, rows - 11)));
    return {
      x: Math.max(1, Math.floor((cols - sidebarWidth - width) / 2)),
      y: 2,
      width,
      height,
    };
  }

  private getPlanetLiquidOverlay(planet: Planet) {
    if (
      !Object.prototype.hasOwnProperty.call(planet, '_surfaceData') &&
      !Object.prototype.hasOwnProperty.call(planet, '_surfaceGenerator')
    ) {
      return null;
    }
    try {
      return planet.surfaceLiquid ?? null;
    } catch {
      return null;
    }
  }

  /** Draws the resource overlay character (%) if applicable for the given cell. */
  private _drawSurfaceOverlay( screenX: number, screenY: number, mapX: number, mapY: number, elementKey: string | null | undefined, terrainColor: string, planet: Planet ): void {
      if (elementKey && elementKey !== '' && !planet.isMined(mapX, mapY)) {
          this.screenBuffer.drawChar( '%', screenX, screenY, '#000000', terrainColor);
      }
  }

  /** Draws the "surface" view for a gas giant. */
  private drawGasGiantSurface(player: Player, planet: Planet, surfaceOverlay?: SurfaceVehicleOverlayModel): void {
    logger.debug(`[SceneRenderer.drawGasGiantSurface] Drawing atmospheric view: ${planet.name}`);
    const palette = planet.rgbPaletteCache;
    if (!palette || palette.length < 1) {
        logger.error(`[SceneRenderer.drawGasGiantSurface] RGB Palette cache missing or empty for ${planet.name}.`);
        this._drawError(`Atmosphere Error: Missing Data for ${planet.name}`);
        return;
    }
    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    const viewport = this.getSurfaceViewport(cols, rows);
    this.drawingContext.drawBox(
      viewport.x - 1,
      viewport.y - 1,
      viewport.width + 2,
      viewport.height + 2,
      '#606060',
      CONFIG.DEFAULT_BG_COLOUR,
      null
    );
    const phase = this.wrapUnit((planet.orbitAngle ?? 0) / (Math.PI * 2));

    for (let y = 0; y < viewport.height; y++) {
      const latitude = y / Math.max(1, viewport.height - 1);
      for (let x = 0; x < viewport.width; x++) {
        const longitude = x / Math.max(1, viewport.width - 1);
        const sample = this.sampleGiantAtmosphere(planet, palette, longitude, latitude, phase);
        const char = this.getGiantAtmosphereGlyph(sample);
        this.screenBuffer.drawChar(char, viewport.x + x, viewport.y + y, sample.colour, sample.colour);
      }
    }
    if (surfaceOverlay?.ship) this.drawParkedShipMarker(surfaceOverlay.ship, viewport, surfaceOverlay.surfaceCellScale);
    this.screenBuffer.drawChar(
      player.render.char,
      viewport.x + Math.floor(viewport.width / 2),
      viewport.y + Math.floor(viewport.height / 2),
      player.render.fgColor,
      null
    );
    if (surfaceOverlay?.scanCursor) this.drawSurfaceScanCursor(surfaceOverlay.scanCursor, viewport);
    this.drawSurfaceHud(player, planet, viewport);
    if (surfaceOverlay) this.drawSurfaceVehicleOverlay(surfaceOverlay, viewport);
  }

  private getGasGiantTurbulenceFactor(planet: Planet): number {
    const tempStress = Math.max(0, Math.min(1, (planet.surfaceTemp - 120) / 520));
    const proximityStress = Math.max(0, Math.min(1, (1.6e11 - planet.orbitDistance) / 1.3e11));
    const massStress = Math.max(0, Math.min(1, (planet.gravity - 1.2) / 2.8));
    const typeFactor = planet.type === 'GasGiant' ? 0.22 : 0.11;
    const heatResponse = planet.type === 'GasGiant' ? 0.34 : 0.24;
    return Math.max(0.05, Math.min(0.9, typeFactor + tempStress * heatResponse + proximityStress * 0.3 + massStress * 0.2));
  }

  private sampleGiantAtmosphere(
    planet: Planet,
    palette: RgbColour[],
    longitude01: number,
    latitude01: number,
    phase01: number
  ): GiantAtmosphereSample {
    const safePalette = palette.length > 0 ? palette : [{ r: 96, g: 128, b: 128 }];
    const turbulence = this.getGasGiantTurbulenceFactor(planet);
    const isIceGiant = planet.type === 'IceGiant';
    const bandCount = isIceGiant ? 8 : 16;
    const lat = Math.max(0, Math.min(1, latitude01));
    const lon = this.wrapUnit(longitude01);
    const equatorDistance = Math.abs(lat - 0.5) * 2;
    const jetStrength = (1 - equatorDistance * 0.35) * turbulence;
    const phase = phase01 * Math.PI * 2;
    const differentialDrift = (0.018 + turbulence * 0.028) * Math.sin((lat - 0.5) * Math.PI * 3);
    const shearedLon = this.wrapUnit(lon + differentialDrift + phase01 * (0.08 + jetStrength * 0.04));

    const wave1 = Math.sin(lat * Math.PI * bandCount + Math.sin(shearedLon * Math.PI * 2 + phase) * jetStrength * 0.55);
    const wave2 = Math.sin(lat * Math.PI * (bandCount * 0.52 + 2.3) + shearedLon * Math.PI * 3.2 - phase * 0.4);
    const fineWave =
      Math.sin(shearedLon * Math.PI * 18 + lat * Math.PI * 19 + phase * 0.7) *
      Math.sin(lat * Math.PI * (bandCount + 5)) *
      turbulence;
    const bandDisplacement = wave1 * 0.018 + wave2 * 0.01 + fineWave * (isIceGiant ? 0.006 : 0.011);
    const bandPosition = Math.max(0, Math.min(0.999, lat + bandDisplacement));
    const colourFloat = bandPosition * (safePalette.length - 1);
    const index1 = Math.max(0, Math.min(safePalette.length - 1, Math.floor(colourFloat)));
    const index2 = Math.max(0, Math.min(safePalette.length - 1, index1 + 1));
    const bandEdge = Math.abs(wave1);
    const colourMix = Math.max(0, Math.min(1, colourFloat - index1 + fineWave * 0.09));
    let base = interpolateColour(safePalette[index1], safePalette[index2], colourMix);

    const storm = this.sampleGiantStormField(planet, shearedLon, lat, phase01, turbulence);
    const mottling =
      Math.sin(shearedLon * Math.PI * 34 + lat * Math.PI * 11 - phase * 0.9) * 0.035 +
      Math.sin(shearedLon * Math.PI * 71 + lat * Math.PI * 41 + phase * 1.3) * 0.02;
    const polarDimming = isIceGiant ? equatorDistance * 0.06 : equatorDistance * 0.1;
    const bandContrast = (isIceGiant ? 0.07 : 0.12) * Math.sin(lat * Math.PI * bandCount);
    let brightness = 0.93 + bandContrast + mottling * turbulence - polarDimming;
    brightness += storm * (isIceGiant ? 0.16 : 0.24);

    if (storm > 0.08) {
      const stormTint = isIceGiant ? { r: 200, g: 245, b: 255 } : { r: 255, g: 238, b: 205 };
      base = interpolateColour(base, stormTint, Math.min(0.42, storm * 0.5));
    }

    const final = adjustBrightness(base, Math.max(0.54, Math.min(1.42, brightness)));
    const texture = Math.abs(fineWave) + bandEdge * 0.45 + Math.max(0, storm) * 0.85 + turbulence * Math.abs(mottling) * 5;
    return {
      colour: rgbToHex(final.r, final.g, final.b),
      brightness,
      storm,
      texture,
      edge: bandEdge,
    };
  }

  private sampleGiantStormField(
    planet: Planet,
    longitude01: number,
    latitude01: number,
    phase01: number,
    turbulence: number
  ): number {
    const isIceGiant = planet.type === 'IceGiant';
    const stormCount = isIceGiant ? 3 : 7;
    let field = 0;
    for (let index = 0; index < stormCount; index++) {
      const seed = `${planet.name}:${planet.type}:storm:${index}`;
      const baseLon = this.hashUnit(seed + ':lon');
      const baseLat = 0.16 + this.hashUnit(seed + ':lat') * 0.68;
      const direction = index % 2 === 0 ? 1 : -1;
      const drift = direction * phase01 * (0.015 + this.hashUnit(seed + ':drift') * 0.025);
      const stormLon = this.wrapUnit(baseLon + drift);
      const stormLat = baseLat + Math.sin(phase01 * Math.PI * 2 + index) * turbulence * 0.012;
      const rx = (isIceGiant ? 0.055 : 0.07) + this.hashUnit(seed + ':rx') * (isIceGiant ? 0.045 : 0.08);
      const ry = (isIceGiant ? 0.012 : 0.018) + this.hashUnit(seed + ':ry') * (isIceGiant ? 0.018 : 0.035);
      const lonDelta = this.shortestUnitDelta(longitude01, stormLon) / rx;
      const latDelta = (latitude01 - stormLat) / ry;
      const oval = Math.max(0, 1 - lonDelta * lonDelta - latDelta * latDelta);
      if (oval <= 0) continue;

      const spiral = Math.sin(lonDelta * 5.4 + latDelta * 2.2 + this.hashUnit(seed + ':spin') * Math.PI * 2);
      const eye = Math.max(0, 1 - lonDelta * lonDelta * 8 - latDelta * latDelta * 8);
      const strength = (0.35 + this.hashUnit(seed + ':strength') * 0.65) * turbulence;
      field += Math.pow(oval, 1.8) * strength * (0.55 + spiral * 0.18) - eye * strength * 0.18;
    }
    return Math.max(-0.15, Math.min(1, field));
  }

  private getGiantAtmosphereGlyph(sample: GiantAtmosphereSample): string {
    if (sample.storm > 0.22) return GLYPHS.SHADE_DARK;
    if (sample.texture > 0.95) return GLYPHS.SHADE_DARK;
    if (sample.texture > 0.62 || sample.edge > 0.82) return GLYPHS.SHADE_MEDIUM;
    if (sample.texture > 0.32 || sample.brightness < 0.78) return GLYPHS.SHADE_LIGHT;
    return ' ';
  }

  private shortestUnitDelta(value: number, target: number): number {
    const delta = this.wrapUnit(value - target + 0.5) - 0.5;
    return delta;
  }

  private hashUnit(seed: string): number {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
  }

  /** Draws the view when docked inside a starbase. */
  private drawStarbaseInterior(player: Player, starbase: Starbase): void {
    this.drawStarbaseInterface(player, starbase, {
      stationName: starbase.name,
      sectionId: 'overview',
      sections: [{ id: 'overview', label: 'Overview' }],
      title: 'STARBASE TRADE DEPOT',
      subtitle: starbase.name,
      columns: ['STATUS'],
      widths: [60],
      rows: starbase.tradeDisplayRows.map((row, index) => ({ id: String(index), cells: [row] })),
      selectedIndex: starbase.selectedTradeIndex,
      viewOffset: 0,
      visibleRowCount: Math.max(1, this.screenBuffer.getRows() - 16),
      footer: [`Cr ${player.resources.credits.toLocaleString()}  Fuel ${player.resources.fuel.toFixed(0)}/${player.resources.maxFuel}`],
    });
  }

  drawStarbaseInterface(player: Player, starbase: Starbase, model: StarbaseScreenModel): void {
    logger.debug(`[SceneRenderer.drawStarbaseInterior] Drawing interior: ${starbase.name}`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    this.drawingContext.drawBox(0, 0, cols, rows, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR, ' ');
    const maxPanelWidth = Math.max(48, cols - 4);
    const tableLayout = this.resolveTextTableLayout(model, maxPanelWidth - 9);
    const renderModel = { ...model, widths: tableLayout.model.widths };
    const defaultPanelWidth = Math.min(112, Math.max(48, cols - 6));
    const panelWidth = Math.min(maxPanelWidth, Math.max(defaultPanelWidth, tableLayout.tableWidth + 9));
    const panelHeight = Math.min(34, Math.max(18, rows - 5));
    const panelX = Math.max(2, Math.floor((cols - panelWidth) / 2));
    const panelY = Math.max(2, Math.floor((rows - panelHeight) / 2));

    this.drawingContext.drawBox(panelX, panelY, panelWidth, panelHeight, '#00C8FF', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(` ${renderModel.title.toUpperCase()} `, panelX + 3, panelY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(renderModel.stationName.slice(0, panelWidth - 6), panelX + 3, panelY + 2, '#00FFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(renderModel.subtitle.slice(0, panelWidth - 6), panelX + 3, panelY + 3, '#9FFFE0', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('-'.repeat(Math.max(1, panelWidth - 6)), panelX + 3, panelY + 4, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);

    this.drawTextTabs(renderModel.sections, renderModel.sectionId, panelX + 4, panelY + 6, panelX + panelWidth - 2);

    const tableX = panelX + 4;
    const tableY = panelY + 8;
    const tableWidth = panelWidth - 9;
    const detailRows = this.getTextTableDetailLineCount(model);
    const visibleRows = Math.max(1, Math.min(model.visibleRowCount, panelHeight - 17 - detailRows));
    this.drawTextTableHeader(renderModel, tableX, tableY, tableWidth);
    this.drawTextTableRows(renderModel, tableX, tableY + 2, tableWidth, visibleRows);
    this.drawTextScrollbar(tableX + tableWidth + 1, tableY + 2, visibleRows, model.rows.length, model.viewOffset);

    if (renderModel.alert) {
      this.screenBuffer.drawString(renderModel.alert.slice(0, panelWidth - 8), panelX + 4, panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
      const blink = Math.floor(performance.now() / 450) % 2 === 0;
      if (blink) this.screenBuffer.drawChar('_', panelX + 4 + Math.min(renderModel.alert.length, panelWidth - 9), panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
    }
    renderModel.footer.forEach((line, index) => {
      this.screenBuffer.drawString(line.slice(0, panelWidth - 8), panelX + 4, panelY + panelHeight - 3 + index, index === 0 ? '#FFD66B' : '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);
    });
    this.screenBuffer.drawChar(player.render.char, Math.floor(cols / 2), Math.floor(rows / 2), player.render.fgColor, null);
  }

  drawTextModalTable(model: TextModalTableModel): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols < 42 || rows < 16) return;

    const detailRows = this.getTextTableDetailLineCount(model);
    const tableLayout = this.resolveTextTableLayout(model, cols - 12);
    const renderModel = { ...model, widths: tableLayout.model.widths };
    const tableWidth = Math.max(34, tableLayout.tableWidth);
    const footerRows = model.footer?.length ?? 0;
    const visibleRows = Math.max(1, Math.min(model.visibleRowCount, rows - 12 - footerRows - detailRows));
    const panelWidth = Math.min(cols - 4, tableWidth + 8);
    const panelHeight = Math.min(rows - 4, visibleRows + footerRows + 10 + detailRows);
    const panelX = Math.floor((cols - panelWidth) / 2);
    const panelY = Math.floor((rows - panelHeight) / 2);
    const tableX = panelX + 4;
    const tableY = panelY + 5;

    this.drawingContext.drawBox(panelX, panelY, panelWidth, panelHeight, '#3EA6A6', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(` ${renderModel.title} `.slice(0, panelWidth - 4), panelX + 3, panelY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    if (renderModel.subtitle) {
      this.screenBuffer.drawString(renderModel.subtitle.slice(0, panelWidth - 6), panelX + 3, panelY + 2, '#00AA66', CONFIG.DEFAULT_BG_COLOUR);
    }

    this.drawTextTableHeader(renderModel, tableX, tableY, tableWidth);
    this.drawTextTableRows(renderModel, tableX, tableY + 2, tableWidth, visibleRows);
    this.drawTextScrollbar(panelX + panelWidth - 3, tableY + 2, visibleRows, renderModel.rows.length, renderModel.viewOffset);

    const footerY = panelY + panelHeight - Math.max(2, footerRows + 1);
    (model.footer ?? []).forEach((line, index) => {
      this.screenBuffer.drawString(line.slice(0, panelWidth - 6), panelX + 3, footerY + index, '#777777', CONFIG.DEFAULT_BG_COLOUR);
    });
  }

  drawOrbitInterface(model: OrbitScreenModel): void {
    logger.debug(`[SceneRenderer.drawOrbitInterface] Drawing orbit screen: ${model.selectedBody.name}`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    this.screenBuffer.clear(false);
    this.drawingContext.drawBox(0, 0, cols, rows, '#008A9A', CONFIG.DEFAULT_BG_COLOUR, ' ');

    const panelWidth = Math.min(126, Math.max(64, cols - 4));
    const panelHeight = Math.min(46, Math.max(32, Math.floor(rows * 0.78)));
    const panelX = Math.max(2, Math.floor((cols - panelWidth) / 2));
    const panelY = Math.max(1, Math.floor((rows - panelHeight) / 3));
    this.drawingContext.drawBox(panelX, panelY, panelWidth, panelHeight, '#00C8FF', CONFIG.DEFAULT_BG_COLOUR, ' ');

    this.screenBuffer.drawString(` ${model.title.toUpperCase()} `, panelX + 3, panelY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(model.selectedBody.name.slice(0, panelWidth - 6), panelX + 3, panelY + 2, '#00FFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(model.subtitle.slice(0, panelWidth - 6), panelX + 3, panelY + 3, '#9FFFE0', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('-'.repeat(Math.max(1, panelWidth - 6)), panelX + 3, panelY + 4, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);

    let bodyTabX = panelX + 4;
    model.bodies.forEach((body) => {
      const label = body.selected ? `[${body.label}]` : ` ${body.label} `;
      if (bodyTabX + label.length < panelX + panelWidth - 2) {
        this.screenBuffer.drawString(label, bodyTabX, panelY + 6, body.selected ? '#001010' : '#00AA66', body.selected ? '#00FFFF' : CONFIG.DEFAULT_BG_COLOUR);
      }
      bodyTabX += label.length + 1;
    });

    const contentTop = panelY + 8;
    const contentBottom = panelY + panelHeight - 6;
    const contentHeight = Math.max(12, contentBottom - contentTop + 1);
    const leftColumnWidth = Math.max(28, Math.min(38, Math.floor(panelWidth * 0.3)));
    const sphereRadius = Math.max(5, Math.min(13, Math.floor((leftColumnWidth - 8) / 2), Math.floor((contentHeight - 8) / 2)));
    const sphereBoxHeight = contentHeight;
    const sphereCx = panelX + 3 + Math.floor(leftColumnWidth / 2);
    const sphereCy = contentTop + 3 + sphereRadius;
    this.drawingContext.drawBox(panelX + 3, contentTop, leftColumnWidth, sphereBoxHeight, '#006A6A', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(' ORBITAL VIEW ', panelX + 5, contentTop, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.drawRotatingPlanetSphere(model, sphereCx, sphereCy, sphereRadius);
    this.drawOrbitViewReadout(model, panelX + 5, contentTop + sphereBoxHeight - 3, leftColumnWidth - 4);

    const mapWidth = Math.max(20, Math.min(32, Math.floor(panelWidth * 0.25)));
    const mapHeight = Math.max(10, Math.min(20, contentHeight - 4));
    const mapX = panelX + panelWidth - mapWidth - 6;
    const mapY = contentTop;
    this.drawingContext.drawBox(mapX - 1, mapY, mapWidth + 2, mapHeight + 4, model.mode === 'landing' ? '#00FFFF' : '#006A6A', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(' LANDING MAP ', mapX + 1, mapY, model.mode === 'landing' ? '#8CFFFF' : '#00AA66', CONFIG.DEFAULT_BG_COLOUR);
    this.drawOrbitLandingMap(model, mapX, mapY + 2, mapWidth, mapHeight);

    const descX = panelX + leftColumnWidth + 8;
    const descY = contentTop;
    const descWidth = Math.max(30, mapX - descX - 3);
    const descHeight = Math.max(10, contentBottom - descY + 1);
    this.drawingContext.drawBox(descX - 1, descY, descWidth + 2, descHeight, '#006A6A', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(' SCAN SUMMARY ', descX + 1, descY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    const lines = [
      ...this.formatOrbitSummaryLines(model.telemetry, descWidth - 2),
      '',
      ...this.formatOrbitSummaryLines(model.description, descWidth - 2),
    ];
    lines.slice(0, descHeight - 3).forEach((line, index) => {
      this.screenBuffer.drawString(line.slice(0, descWidth - 2), descX + 1, descY + 2 + index, index < 3 ? '#9FFFE0' : '#00AA66', CONFIG.DEFAULT_BG_COLOUR);
    });

    if (model.alert) {
      this.screenBuffer.drawString(model.alert.slice(0, panelWidth - 8), panelX + 4, panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
      const blink = Math.floor(performance.now() / 450) % 2 === 0;
      if (blink) this.screenBuffer.drawChar('_', panelX + 4 + Math.min(model.alert.length, panelWidth - 9), panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
    }
    model.footer.forEach((line, index) => {
      this.screenBuffer.drawString(line.slice(0, panelWidth - 8), panelX + 4, panelY + panelHeight - 3 + index, index === 0 ? '#5FC8FF' : '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
    });
  }

  private drawRotatingPlanetSphere(model: OrbitScreenModel, cx: number, cy: number, radius: number): void {
    const planet = model.selectedBody;
    const phase = model.rotationPhase * Math.PI * 2;
    const solidMap = planet.type === 'GasGiant' || planet.type === 'IceGiant' ? null : planet.heightmap;
    const solidColours = planet.type === 'GasGiant' || planet.type === 'IceGiant' ? null : planet.heightLevelColors;
    const detailScale = 0.5;
    const detailRadius = radius / detailScale;
    for (let dy = -detailRadius; dy <= detailRadius; dy++) {
      for (let dx = -detailRadius; dx <= detailRadius; dx++) {
        const nx = dx / detailRadius;
        const ny = dy / detailRadius;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const z = Math.sqrt(Math.max(0, 1 - d));
        const lon = Math.atan2(nx, z) + phase;
        const lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
        const textureX = this.wrapUnit(lon / (Math.PI * 2) + 0.5);
        const textureY = this.mercatorTextureY(lat);
        const solidSample = solidMap && solidColours
          ? this.sampleSolidPlanetTexture(planet, textureX, textureY)
          : null;
        const colour = solidSample?.colour ?? this.sampleGiantPlanetTexture(planet, textureX, textureY, lon, lat, phase);
        const light = this.calculateGlobeLighting(planet, lon, lat, z);
        const brightness = solidSample?.liquid
          ? this.calculateLiquidGlobeBrightness(light.brightness, lon, lat, z)
          : light.brightness;
        const baseColour = adjustBrightness(this.hexToRgbFallback(colour), brightness);
        const finalColour = solidSample?.liquid && solidSample.reflectiveColour
          ? interpolateColour(baseColour, this.hexToRgbFallback(solidSample.reflectiveColour), this.calculateLiquidGlint(lon, lat, z) * light.glyph)
          : baseColour;
        const char = light.glyph < 0.22 ? GLYPHS.SHADE_DARK : light.glyph < 0.48 ? GLYPHS.SHADE_MEDIUM : light.glyph < 0.72 ? GLYPHS.SHADE_LIGHT : GLYPHS.BLOCK;
        this.screenBuffer.drawScaledChar(
          char,
          cx + dx * detailScale,
          cy + dy * detailScale,
          rgbToHex(finalColour.r, finalColour.g, finalColour.b),
          CONFIG.DEFAULT_BG_COLOUR,
          detailScale,
          detailScale
        );
      }
    }
  }

  private calculateGlobeLighting(planet: Planet, longitude: number, latitude: number, viewNormalZ: number): { brightness: number; glyph: number } {
    const subsolarLongitude = -0.55;
    const subsolarLatitude = 0.12;
    const incidence =
      Math.sin(latitude) * Math.sin(subsolarLatitude) +
      Math.cos(latitude) * Math.cos(subsolarLatitude) * Math.cos(longitude - subsolarLongitude);
    const mu0 = Math.max(0, incidence);
    const terminator = Math.max(0, Math.min(1, mu0 / 0.14));
    const dayMask = terminator * terminator * (3 - 2 * terminator);
    const nightMask = 1 - dayMask;
    const mu = Math.max(0.03, viewNormalZ);
    const isGiant = planet.type === 'GasGiant' || planet.type === 'IceGiant';
    const atmosphere = planet.atmosphere;
    const pressure = atmosphere?.pressure ?? 0;
    const density = atmosphere?.density ?? 'None';
    const hasDenseAir = pressure >= 0.75 || density === 'Dense' || density === 'Thick' || density === 'Superdense';
    const isAirlessRegolith = planet.type === 'Lunar' || planet.type === 'DwarfIce' || planet.type === 'Chthonian' || density === 'None' || density === 'Trace';

    if (isGiant) {
      const day = Math.pow(mu0, 0.62);
      const limb = 0.55 + 0.45 * Math.pow(mu, 0.7);
      const twilight = (1 - nightMask) * 0.05 * (1 - mu);
      const brightness = Math.max(0.09, Math.min(1.18, 0.09 + day * limb * 1.02 + twilight));
      return { brightness, glyph: Math.max(0.04, Math.min(1, day * (0.72 + 0.28 * mu))) };
    }

    if (isAirlessRegolith) {
      const litFace = dayMask * (0.88 + 0.12 * Math.pow(mu, 0.35));
      const brightness = Math.max(0.06, Math.min(1.08, 0.06 + litFace * 1.02));
      return { brightness, glyph: Math.max(0.03, Math.min(1, litFace)) };
    }

    const atmosphereStrength = hasDenseAir ? 1 : 0.45;
    const day = Math.pow(mu0, hasDenseAir ? 0.52 : 0.78);
    const limb = hasDenseAir ? 0.78 + 0.22 * mu : 0.66 + 0.34 * mu;
    const haze = dayMask * (1 - mu) * 0.08 * atmosphereStrength + nightMask * 0.025 * atmosphereStrength * (1 - mu);
    const brightness = Math.max(0.07, Math.min(1.16, 0.07 + day * limb * 0.99 + haze));
    return { brightness, glyph: Math.max(0.07, Math.min(1, day * (0.84 + 0.16 * mu) + haze)) };
  }

  private sampleSolidPlanetTexture(planet: Planet, u: number, v: number): SolidTextureSample {
    const heightmap = planet.heightmap;
    const heightColours = planet.heightLevelColors;
    if (!heightmap || !heightColours) return { colour: '#88BBBB', liquid: false };
    const mapSize = heightmap.length;
    if (mapSize <= 0) return { colour: '#88BBBB', liquid: false };
    const mapX = Math.floor(this.wrapUnit(u) * mapSize) % mapSize;
    const mapY = Math.max(0, Math.min(mapSize - 1, Math.floor(v * mapSize)));
    const height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(heightmap[mapY]?.[mapX] ?? 0)));
    const liquid = this.getPlanetLiquidOverlay(planet);
    if (liquid && height <= liquid.seaLevel) {
      return {
        colour: liquid.colour,
        liquid: true,
        reflectiveColour: liquid.reflectiveColour,
      };
    }
    return { colour: heightColours[height] ?? '#88BBBB', liquid: false };
  }

  private sampleGiantPlanetTexture(planet: Planet, u: number, _v: number, _lon: number, lat: number, phase: number): string {
    const paletteHex = PLANET_TYPES[planet.type]?.terrainColours ?? ['#557777', '#669999', '#88BBBB', '#AADDDD'];
    const palette = paletteHex.map((colour) => this.hexToRgbFallback(colour));
    const lat01 = Math.max(0, Math.min(1, 0.5 - lat / Math.PI));
    const phase01 = this.wrapUnit(phase / (Math.PI * 2));
    return this.sampleGiantAtmosphere(planet, palette, u, lat01, phase01).colour;
  }

  private calculateLiquidGlobeBrightness(baseBrightness: number, longitude: number, latitude: number, viewNormalZ: number): number {
    return Math.max(0.05, Math.min(1.32, baseBrightness + this.calculateLiquidGlint(longitude, latitude, viewNormalZ) * 0.22));
  }

  private calculateLiquidGlint(longitude: number, latitude: number, viewNormalZ: number): number {
    const subsolarLongitude = -0.55;
    const subsolarLatitude = 0.12;
    const incidence =
      Math.sin(latitude) * Math.sin(subsolarLatitude) +
      Math.cos(latitude) * Math.cos(subsolarLatitude) * Math.cos(longitude - subsolarLongitude);
    const sunVisible = Math.max(0, incidence);
    const view = Math.max(0, viewNormalZ);
    const alignment = Math.max(0, 1 - Math.abs(longitude - subsolarLongitude) * 0.42 - Math.abs(latitude - subsolarLatitude) * 0.7);
    return Math.pow(sunVisible * view * alignment, 4.2);
  }

  private mercatorTextureY(latitudeRad: number): number {
    const limitedLat = Math.max(-1.45, Math.min(1.45, latitudeRad));
    const mercatorY = 0.5 - Math.log(Math.tan(Math.PI / 4 + limitedLat / 2)) / (Math.PI * 2);
    return Math.max(0, Math.min(1, mercatorY));
  }

  private wrapUnit(value: number): number {
    return ((value % 1) + 1) % 1;
  }

  private drawOrbitViewReadout(model: OrbitScreenModel, x: number, y: number, width: number): void {
    const phaseText = `ROT ${Math.floor((model.rotationPhase % 1) * 360).toString().padStart(3)} DEG`;
    const modeText = model.mode === 'landing' ? 'LANDING SOLUTION' : 'SURVEY HOLD';
    this.screenBuffer.drawString(phaseText.slice(0, width), x, y, '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(modeText.slice(0, width), x, y + 1, model.mode === 'landing' ? '#FFD66B' : '#00AA66', CONFIG.DEFAULT_BG_COLOUR);
  }

  private formatOrbitSummaryLines(paragraphs: string[], width: number): string[] {
    const lines: string[] = [];
    paragraphs.forEach((paragraph, index) => {
      if (index > 0) lines.push('');
      lines.push(...this.wrapText(paragraph, width));
    });
    return lines;
  }

  private drawOrbitLandingMap(model: OrbitScreenModel, x: number, y: number, width: number, height: number): void {
    const planet = model.selectedBody;
    const isGiant = planet.type === 'GasGiant' || planet.type === 'IceGiant';
    const map = isGiant ? null : planet.heightmap;
    const colours = planet.heightLevelColors;
    const palette = PLANET_TYPES[planet.type]?.terrainColours ?? ['#4A7777', '#6A9999', '#9FCCCC'];
    const detailScale = 0.5;
    const detailWidth = Math.max(1, Math.floor(width / detailScale));
    const detailHeight = Math.max(1, Math.floor(height / detailScale));
    const cursorX = Math.round((model.landingCursorX / Math.max(1, model.mapSize - 1)) * (detailWidth - 1));
    const cursorY = Math.round((model.landingCursorY / Math.max(1, model.mapSize - 1)) * (detailHeight - 1));
    for (let row = 0; row < detailHeight; row++) {
      for (let col = 0; col < detailWidth; col++) {
        const mapX = Math.floor((col / Math.max(1, detailWidth - 1)) * (model.mapSize - 1));
        const mapY = Math.floor((row / Math.max(1, detailHeight - 1)) * (model.mapSize - 1));
        let colour = this.sampleGiantMapBand(planet, palette, col, row, detailWidth, detailHeight, model.rotationPhase);
        if (map && colours) {
          const heightValue = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(map[mapY]?.[mapX] ?? 0)));
          const liquid = this.getPlanetLiquidOverlay(planet);
          colour = liquid && heightValue <= liquid.seaLevel
            ? liquid.colour
            : colours[heightValue] ?? colour;
        }
        if (col === cursorX && row === cursorY) {
          this.screenBuffer.drawScaledChar(
            '+',
            x + col * detailScale,
            y + row * detailScale,
            '#001010',
            model.mode === 'landing' ? '#00FFFF' : '#00AA66',
            detailScale,
            detailScale
          );
        } else {
          this.screenBuffer.drawScaledChar(
            GLYPHS.BLOCK,
            x + col * detailScale,
            y + row * detailScale,
            colour,
            colour,
            detailScale,
            detailScale
          );
        }
      }
    }
    this.screenBuffer.drawString(`X ${model.landingCursorX.toString().padStart(3)} Y ${model.landingCursorY.toString().padStart(3)}`.slice(0, width), x, y + height + 1, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
  }

  private sampleGiantMapBand(
    planet: Planet,
    palette: string[],
    col: number,
    row: number,
    width: number,
    height: number,
    rotationPhase: number
  ): string {
    if (planet.type !== 'GasGiant' && planet.type !== 'IceGiant') {
      return palette[row % palette.length] ?? '#669999';
    }
    const latitude = row / Math.max(1, height - 1);
    const longitude = col / Math.max(1, width - 1);
    const rgbPalette = palette.map((colour) => this.hexToRgbFallback(colour));
    return this.sampleGiantAtmosphere(planet, rgbPalette, longitude, latitude, rotationPhase).colour;
  }

  private wrapText(text: string, width: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    words.forEach((word) => {
      if ((line + ' ' + word).trim().length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    });
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
  }

  private hexToRgbFallback(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '').slice(0, 6).padEnd(6, '8');
    return {
      r: Number.parseInt(clean.slice(0, 2), 16) || 128,
      g: Number.parseInt(clean.slice(2, 4), 16) || 128,
      b: Number.parseInt(clean.slice(4, 6), 16) || 128,
    };
  }

  private drawTextTabs<Id extends string>(
    sections: TextMenuSection<Id>[],
    activeId: Id,
    x: number,
    y: number,
    maxX: number
  ): void {
    let cursorX = x;
    sections.forEach((section) => {
      const active = section.id === activeId;
      const label = active ? `[${section.label}]` : ` ${section.label} `;
      if (cursorX + label.length < maxX) {
        this.screenBuffer.drawString(
          label,
          cursorX,
          y,
          active ? '#001010' : '#00AA66',
          active ? '#00FFFF' : CONFIG.DEFAULT_BG_COLOUR
        );
      }
      cursorX += label.length + 1;
    });
  }

  private drawTextTableHeader(model: TextTableModel, x: number, y: number, tableWidth: number): void {
    let cursorX = x;
    model.columns.forEach((column, index) => {
      const width = model.widths[index] ?? 12;
      this.screenBuffer.drawString(column.padEnd(width).slice(0, width), cursorX, y, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
      cursorX += width + 1;
    });
    this.screenBuffer.drawString('-'.repeat(Math.max(1, tableWidth)), x, y + 1, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);
  }

  private resolveTextTableLayout(model: TextTableModel, maxTableWidth: number): TextTableLayout {
    const columnCount = Math.max(
      model.columns.length,
      model.widths.length,
      ...model.rows.map((row) => row.cells.length),
      1
    );
    const minimumWidths = Array.from({ length: columnCount }, (_, index) => {
      const headerWidth = model.columns[index]?.length ?? 0;
      const configuredWidth = model.widths[index] ?? 12;
      return Math.max(4, Math.min(configuredWidth, Math.max(4, headerWidth)));
    });
    const desiredWidths = minimumWidths.map((minimumWidth, index) => {
      const configuredWidth = model.widths[index] ?? 12;
      const headerWidth = model.columns[index]?.length ?? 0;
      const widestCell = model.rows.reduce((widest, row) => Math.max(widest, (row.cells[index] ?? '').length), 0);
      return Math.max(minimumWidth, configuredWidth, headerWidth, widestCell);
    });
    const widths = this.clampTextTableWidths(desiredWidths, minimumWidths, maxTableWidth);
    return {
      model: { ...model, widths },
      tableWidth: this.getTextTableWidth(widths),
    };
  }

  private clampTextTableWidths(desiredWidths: number[], minimumWidths: number[], maxTableWidth: number): number[] {
    const gapWidth = Math.max(0, desiredWidths.length - 1);
    if (desiredWidths.reduce((sum, width) => sum + width, 0) + gapWidth <= maxTableWidth) {
      return desiredWidths.slice();
    }

    const availableCellWidth = Math.max(desiredWidths.length * 4, maxTableWidth - gapWidth);
    const softColumnCap = Math.max(18, Math.floor(availableCellWidth * 0.48));
    const widths = desiredWidths.map((width, index) => Math.max(minimumWidths[index] ?? 4, Math.min(width, softColumnCap)));

    while (this.getTextTableWidth(widths) > maxTableWidth) {
      let shrinkIndex = -1;
      let shrinkWidth = -1;
      for (let index = widths.length - 1; index >= 0; index--) {
        const minimumWidth = minimumWidths[index] ?? 4;
        if (widths[index] > minimumWidth && widths[index] > shrinkWidth) {
          shrinkIndex = index;
          shrinkWidth = widths[index];
        }
      }
      if (shrinkIndex < 0) break;
      widths[shrinkIndex]--;
    }

    while (this.getTextTableWidth(widths) > maxTableWidth) {
      let shrinkIndex = -1;
      let shrinkWidth = -1;
      for (let index = widths.length - 1; index >= 0; index--) {
        if (widths[index] > 4 && widths[index] > shrinkWidth) {
          shrinkIndex = index;
          shrinkWidth = widths[index];
        }
      }
      if (shrinkIndex < 0) break;
      widths[shrinkIndex]--;
    }

    return widths;
  }

  private getTextTableWidth(widths: number[]): number {
    return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1);
  }

  private drawTextTableRows(model: TextTableModel, x: number, y: number, tableWidth: number, visibleRows: number): void {
    const rows = model.rows.slice(model.viewOffset, model.viewOffset + visibleRows);
    if (rows.length === 0) {
      this.screenBuffer.drawString('No records available.'.slice(0, tableWidth), x, y, '#506060', CONFIG.DEFAULT_BG_COLOUR);
      return;
    }
    rows.forEach((row, rowIndex) => {
      const absoluteIndex = model.viewOffset + rowIndex;
      const selected = absoluteIndex === model.selectedIndex;
      const fg = row.disabled ? '#506060' : selected ? '#001010' : '#00AA66';
      const bg = selected ? '#00FF66' : CONFIG.DEFAULT_BG_COLOUR;
      this.screenBuffer.drawChar(selected ? '>' : ' ', x - 2, y + rowIndex, selected ? '#00FF66' : '#006A6A', CONFIG.DEFAULT_BG_COLOUR);
      let cursorX = x;
      row.cells.forEach((cell, index) => {
        const width = model.widths[index] ?? 12;
        this.screenBuffer.drawString(cell.padEnd(width).slice(0, width), cursorX, y + rowIndex, fg, bg);
        cursorX += width + 1;
      });
    });
    const selectedRow = model.rows[model.selectedIndex];
    const detailLineCount = this.getTextTableDetailLineCount(model);
    if (selectedRow?.detail && detailLineCount > 0 && y + visibleRows + 1 < this.screenBuffer.getRows()) {
      const detailWidth = Math.max(1, tableWidth - 3);
      const detailLines = this.wrapText(selectedRow.detail, detailWidth).slice(0, detailLineCount);
      const detailColour = '#7FD8FF';
      detailLines.forEach((line, index) => {
        const detailY = y + visibleRows + 1 + index;
        if (detailY >= this.screenBuffer.getRows()) return;
        this.screenBuffer.drawString(' '.repeat(tableWidth), x, detailY, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);
        this.screenBuffer.drawString(index === 0 ? '::' : '  ', x, detailY, detailColour, CONFIG.DEFAULT_BG_COLOUR);
        this.screenBuffer.drawString(line.slice(0, detailWidth), x + 3, detailY, detailColour, CONFIG.DEFAULT_BG_COLOUR);
      });
    }
  }

  private getTextTableDetailLineCount(model: TextTableModel): number {
    return Math.max(0, Math.min(4, Math.floor(model.detailLineCount ?? 1)));
  }

  private drawTextScrollbar(x: number, y: number, height: number, totalRows: number, offset: number): void {
    if (height <= 0) return;
    for (let i = 0; i < height; i++) this.screenBuffer.drawChar('│', x, y + i, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);
    if (totalRows <= height) {
      for (let i = 0; i < height; i++) this.screenBuffer.drawChar('█', x, y + i, '#00AAAA', CONFIG.DEFAULT_BG_COLOUR);
      return;
    }
    const thumbHeight = Math.max(1, Math.floor((height / totalRows) * height));
    const maxOffset = Math.max(1, totalRows - height);
    const thumbY = y + Math.floor((offset / maxOffset) * (height - thumbHeight));
    for (let i = 0; i < thumbHeight; i++) this.screenBuffer.drawChar('█', x, thumbY + i, '#00FFFF', CONFIG.DEFAULT_BG_COLOUR);
  }

  private drawSurfaceHud(
    player: Player,
    planet: Planet,
    viewport: { x: number; y: number; width: number; height: number }
  ): void {
    const mapSize = Math.max(1, planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE);
    const lat = 90 - (Math.max(0, Math.min(mapSize - 1, player.position.surfaceY)) / Math.max(1, mapSize - 1)) * 180;
    const lon = (player.position.surfaceX / mapSize) * 360 - 180;
    const label = ` ${planet.name}  ${this.formatSurfaceCoordinate(lat, 'NS')} x ${this.formatSurfaceCoordinate(lon, 'EW')}  GRID ${Math.floor(player.position.surfaceX)},${Math.floor(player.position.surfaceY)} `;
    const clippedLabel = label.slice(0, Math.max(0, viewport.width - 2));
    this.screenBuffer.drawString(clippedLabel, viewport.x + 1, viewport.y - 1, '#9FFFE0', CONFIG.DEFAULT_BG_COLOUR);

    const footer = '  N ^   S v   W <   E >  ';
    const footerX = viewport.x + Math.max(1, viewport.width - footer.length - 1);
    this.screenBuffer.drawString(footer, footerX, viewport.y + viewport.height, '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);

    const crossX = viewport.x + Math.floor(viewport.width / 2);
    const crossY = viewport.y + Math.floor(viewport.height / 2);
    this.screenBuffer.drawChar('+', crossX - 1, crossY, '#001010', '#00FFFF');
    this.screenBuffer.drawChar('+', crossX + 1, crossY, '#001010', '#00FFFF');
    this.screenBuffer.drawChar('+', crossX, crossY - 1, '#001010', '#00FFFF');
    this.screenBuffer.drawChar('+', crossX, crossY + 1, '#001010', '#00FFFF');
  }

  private formatSurfaceCoordinate(value: number, axis: 'NS' | 'EW'): string {
    const direction = axis === 'NS'
      ? value < 0 ? 'S' : 'N'
      : value < 0 ? 'W' : 'E';
    return `${Math.abs(value).toFixed(1)}${direction}`;
  }

  private drawSurfaceVehicleOverlay(
    model: SurfaceVehicleOverlayModel,
    viewport: { x: number; y: number; width: number; height: number }
  ): void {
    const panelX = viewport.x;
    const panelY = viewport.y + viewport.height + 2;
    const panelWidth = viewport.width;
    if (panelY >= this.screenBuffer.getRows() - 1) return;
    const notifications = model.notifications.length > 0 ? model.notifications : ['Surface systems nominal.'];
    this.drawingContext.drawBox(panelX - 1, panelY - 1, panelWidth + 2, 6, '#006A6A', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString('NOTIFICATIONS', panelX + 2, panelY - 1, '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);
    for (let index = 0; index < 4; index++) {
      const line = (notifications[index] ?? '').slice(0, panelWidth - 4);
      this.screenBuffer.drawString(line, panelX + 2, panelY + index, index === 0 ? '#FFD66B' : '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    }

    if (!model.deployed) {
      const line = model.onFoot
        ? 'On foot. Return to the parked ship to embark.'
        : model.available
          ? 'Terrain vehicle embarked. Open ship operations to disembark.'
          : 'Terrain vehicle lost. Replacement required at a starport shipyard.';
      this.screenBuffer.drawString(line.slice(0, panelWidth - 4), panelX + 2, panelY + 5, '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);
      this.drawSurfaceCrewSidebar(model, viewport);
      return;
    }

    const menuY = panelY + 6;
    if (menuY >= this.screenBuffer.getRows()) return;
    const fuelPct = model.maxFuel > 0 ? Math.round((Math.max(0, model.fuel) / model.maxFuel) * 100) : 0;
    const fuel = `FUEL ${model.fuel.toFixed(1)}/${model.maxFuel} ${fuelPct}%`;
    const cargo = `CARGO ${model.cargo}/${model.cargoCapacity} m^3`;
    const mode = model.mapExpanded ? 'MAP' : model.moving ? 'MOVING' : 'STOPPED';
    this.screenBuffer.drawString(`${mode}  ${fuel}  ${cargo}`.slice(0, panelWidth), panelX + 1, menuY, model.moving ? '#9FFFE0' : '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);

    let cursorX = panelX + 1;
    const rowY = menuY + 1;
    for (let index = 0; index < model.items.length; index++) {
      const item = model.items[index];
      const selected = index === model.selectedIndex && !model.moving;
      const label = ` ${item.label.toUpperCase()} `;
      const baseFg = item.tone === 'green' ? '#7CFFD0' : '#9FFFE0';
      const selectedBg = item.tone === 'green' ? '#00C878' : '#9FFFE0';
      const fg = selected ? '#001010' : baseFg;
      const bg = selected ? selectedBg : CONFIG.DEFAULT_BG_COLOUR;
      if (cursorX + label.length >= panelX + panelWidth) break;
      this.screenBuffer.drawString(label, cursorX, rowY, fg, bg);
      cursorX += label.length + 1;
    }
    const selected = model.items[model.selectedIndex];
    if (selected && rowY + 1 < this.screenBuffer.getRows()) {
      const hint = model.atShip && selected.label.toLowerCase() !== 'embark'
        ? `${selected.label}: ${selected.status} | At ship: select EMBARK to board.`
        : `${selected.label}: ${selected.status}`;
      this.screenBuffer.drawString(hint.slice(0, panelWidth), panelX + 1, rowY + 1, '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    }
    this.drawSurfaceCrewSidebar(model, viewport);
  }

  private drawSurfaceScanCursor(cursor: { dx: number; dy: number }, viewport: { x: number; y: number; width: number; height: number }): void {
    const scale = Math.max(1, CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE);
    const x = viewport.x + Math.floor(viewport.width / 2) + cursor.dx * scale;
    const y = viewport.y + Math.floor(viewport.height / 2) + cursor.dy * scale;
    if (x < viewport.x || x >= viewport.x + viewport.width || y < viewport.y || y >= viewport.y + viewport.height) return;
    const lit = Math.floor(performance.now() / 350) % 2 === 0;
    const fg = lit ? '#FFD66B' : '#806A30';
    const bg = lit ? null : CONFIG.DEFAULT_BG_COLOUR;
    if (y > viewport.y) this.screenBuffer.drawChar('^', x, y - 1, fg, bg);
    if (y < viewport.y + viewport.height - 1) this.screenBuffer.drawChar('v', x, y + 1, fg, bg);
    if (x > viewport.x) this.screenBuffer.drawChar('<', x - 1, y, fg, bg);
    if (x < viewport.x + viewport.width - 1) this.screenBuffer.drawChar('>', x + 1, y, fg, bg);
  }

  private drawParkedShipMarker(ship: { x: number; y: number }, viewport: { x: number; y: number; width: number; height: number }, surfaceCellScale?: number): void {
    const scale = Math.max(1, surfaceCellScale ?? CONFIG.PLANET_SURFACE_CELL_VIEW_SCALE);
    const x = viewport.x + Math.floor(viewport.width / 2) + Math.round(ship.x * scale);
    const y = viewport.y + Math.floor(viewport.height / 2) + Math.round(ship.y * scale);
    if (x < viewport.x || x >= viewport.x + viewport.width || y < viewport.y || y >= viewport.y + viewport.height) return;
    const phase = (Math.sin((performance.now() / 1000) * Math.PI * 2) + 1) / 2;
    const colour = phase > 0.66 ? '#8CFFFF' : phase > 0.33 ? '#50C8C8' : '#2A807C';
    this.screenBuffer.drawChar('S', x, y, '#001010', colour);
    if (x > viewport.x) this.screenBuffer.drawChar('<', x - 1, y, colour, null);
    if (x < viewport.x + viewport.width - 1) this.screenBuffer.drawChar('>', x + 1, y, colour, null);
  }

  private drawSurfaceCrewSidebar(model: SurfaceVehicleOverlayModel, viewport: { x: number; y: number; width: number; height: number }): void {
    const x = viewport.x + viewport.width + 3;
    const rows = this.screenBuffer.getRows();
    const width = Math.max(0, this.screenBuffer.getCols() - x - 2);
    if (width < 16) return;
    const height = Math.min(rows - 4, viewport.height + 8);
    this.drawingContext.drawBox(x - 1, viewport.y - 1, width + 2, height, '#006A6A', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString('SURFACE TELEMETRY', x + 1, viewport.y - 1, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    let row = viewport.y + 1;
    if (model.shipDistance) {
      const km = model.shipDistance.distanceKm >= 100 ? model.shipDistance.distanceKm.toFixed(0) : model.shipDistance.distanceKm.toFixed(1);
      this.screenBuffer.drawString(`SHIP ${km} km`.slice(0, width), x, row++, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
      this.screenBuffer.drawString(`BRG  ${model.shipDistance.direction}`.slice(0, width), x, row++, '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    }
    if (model.altitudeBand) {
      this.screenBuffer.drawString(`RELIEF ${model.altitudeBand.current}`.slice(0, width), x, row++, '#9FFFE0', CONFIG.DEFAULT_BG_COLOUR);
      this.screenBuffer.drawString(`${model.altitudeBand.low} / ${model.altitudeBand.high}`.slice(0, width), x, row++, '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);
    }
    row++;
    model.crew.slice(0, Math.max(0, viewport.y + height - row - 1)).forEach((member, index) => {
      const dead = member.hitPoints <= 0;
      const hp = dead ? 'DEAD' : `${member.hitPoints}/${member.maxHitPoints}`;
      const fg = dead ? '#FF6060' : member.hitPoints < member.maxHitPoints * 0.4 ? '#FFD66B' : '#9FFFE0';
      const nameWidth = Math.max(5, width - hp.length - 3);
      this.screenBuffer.drawString(`${member.name.slice(0, nameWidth).padEnd(nameWidth)} ${hp}`.slice(0, width), x, row + index, fg, CONFIG.DEFAULT_BG_COLOUR);
    });
  }

  /** Draws a legend for the heightmap colours on the planet surface view. */
  private drawHeightmapLegend(planet: Planet): void {
    const heightColors = planet.heightLevelColors;
    if (!heightColors || heightColors.length === 0) return;
    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    const legendWidth = 1;
    const legendHeight = Math.min(rows - 4, 20);
    const startX = cols - legendWidth - 2;
    const startY = Math.floor((rows - legendHeight) / 2);
    const numColors = heightColors.length;
    for (let i = 0; i < legendHeight; i++) {
      const colourIndex = Math.floor(((i / (legendHeight - 1)) * (numColors - 1)));
      const colour = heightColors[Math.max(0, Math.min(numColors - 1, colourIndex))] || '#FF00FF';
      for (let w = 0; w < legendWidth; ++w) { this.screenBuffer.drawChar(GLYPHS.BLOCK, startX + w, startY + i, colour, colour); }
    }
    this.screenBuffer.drawString("High", startX - 4, startY, CONFIG.DEFAULT_FG_COLOUR, null);
    this.screenBuffer.drawString("Low", startX - 3, startY + legendHeight - 1, CONFIG.DEFAULT_FG_COLOUR, null);
  }

  /** Helper to draw an error message centered on the screen */
  private _drawError(message: string): void {
      const cols = this.screenBuffer.getCols();
      const rows = this.screenBuffer.getRows();
      const x = Math.floor((cols - message.length) / 2);
      const y = Math.floor(rows / 2);
      this.screenBuffer.clear(true);
      this.screenBuffer.drawString(message, x, y, '#FF0000', '#000000');
  }

} // End SceneRenderer class
