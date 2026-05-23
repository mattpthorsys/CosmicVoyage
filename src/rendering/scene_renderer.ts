import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, ELEMENTS, AU_IN_METERS } from '../constants';
import { logger } from '../utils/logger';
import { adjustBrightness, interpolateColour, rgbToHex } from './colour';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { createSystemTravelStarfield, getRenderedStarCell } from './starfield';
import { StarbaseScreenModel } from '../core/starbase_ui';

interface VisiblePlanetMarker {
  planet: Planet;
  viewX: number;
  viewY: number;
  marker: string;
}

/** Contains methods for rendering specific game scenes/states. */
export class SceneRenderer {
  private screenBuffer: ScreenBuffer; // Main buffer for primary content
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;
  private systemDataGenerator: SystemDataGenerator;

  constructor(
    screenBuffer: ScreenBuffer,
    drawingContext: DrawingContext,
    nebulaRenderer: NebulaRenderer,
    systemDataGenerator: SystemDataGenerator
  ) {
    this.screenBuffer = screenBuffer;
    this.drawingContext = drawingContext;
    this.nebulaRenderer = nebulaRenderer;
    this.systemDataGenerator = systemDataGenerator;
    logger.debug('[SceneRenderer] Instance created.');
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
    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const worldX = startWorldX + viewX;
        const worldY = startWorldY + viewY;
        const finalBg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);
        const systemProps = this.systemDataGenerator.getSystemProperties(worldX, worldY);

        if (systemProps.exists) {
          const starInfo = SPECTRAL_TYPES[systemProps.starType!];

          if (starInfo) {
            const star = getRenderedStarCell(systemProps.starType!, worldX, worldY);
            this.screenBuffer.drawChar(star.char, viewX, viewY, star.color, null);
          } else {
            logger.error(`[SceneRenderer.drawHyperspace] Could not find star info for final determined type "${systemProps.starType}" at [${worldX}, ${worldY}].`);
            this.screenBuffer.drawChar('?', viewX, viewY, '#FF00FF', null);
          }
        } else {
          this.screenBuffer.drawChar(null, viewX, viewY, null, finalBg);
        }
      }
    }

    this.screenBuffer.drawChar(player.render.char, viewCenterX, viewCenterY, player.render.fgColor, null);
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
      const planetColor = PLANET_TYPES[planet.type]?.terrainColours[4] || '#CCCCCC';
      this.screenBuffer.drawChar(marker, planetViewX, planetViewY, '#000000', planetColor);
  }

  private getPlanetMarker(index: number): string {
    return '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index] ?? '?';
  }

  private _drawMoonBody(moon: Planet, moonViewX: number, moonViewY: number, viewScale: number): void {
      // Moons are only drawn if visible and not exactly overlapping parent (checked in caller)
      // Determine moon glyph based on zoom? For now, always '.'
      const moonGlyph = '.';
      const moonColor = PLANET_TYPES[moon.type]?.terrainColours[6] || '#999999';
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
      const planetColor = PLANET_TYPES[item.planet.type]?.terrainColours[4] || '#CCCCCC';
      const distanceAu = Math.sqrt(player.distanceSqToSystemCoords(item.planet.systemX, item.planet.systemY)) / AU_IN_METERS;
      const bearing = this.formatBearing(item.planet.systemX - player.position.systemX, item.planet.systemY - player.position.systemY);
      const name = item.planet.name.replace(`${system.name} `, '');
      const label = `${item.marker} ${name.padEnd(5).slice(0, 5)} ${distanceAu.toFixed(2).padStart(5)}AU ${bearing}`;
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
        const planetColor = PLANET_TYPES[p.type]?.terrainColours[4] || '#CCCCCC';
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
  }

  /** Draws the surface view for planets or starbases. */
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    this.screenBuffer.clear(false);
    if (landedObject instanceof Planet) {
      if (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant') {
        this.drawGasGiantSurface(player, landedObject);
      } else {
        this.drawSolidPlanetSurface(player, landedObject);
      }
    } else if (landedObject instanceof Starbase) {
      this.drawStarbaseInterior(player, landedObject);
    } else {
      logger.error(`[SceneRenderer.drawPlanetSurface] Unknown object type: ${typeof landedObject}`);
      this._drawError("Error: Unknown object landed on!");
    }
  }

  /** Draws the surface of a solid planet. */
  private drawSolidPlanetSurface(player: Player, planet: Planet): void {
    logger.debug(`[SceneRenderer.drawSolidPlanetSurface] Rendering surface: ${planet.name} (${planet.type})`);
    const map = planet.heightmap;
    const heightColors = planet.heightLevelColors;
    const elementMap = planet.surfaceElementMap;
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
    const startMapX = Math.floor(player.position.surfaceX - Math.floor(viewport.width / 2));
    const startMapY = Math.floor(player.position.surfaceY - Math.floor(viewport.height / 2));
    for (let y = 0; y < viewport.height; y++) {
      for (let x = 0; x < viewport.width; x++) {
        const mapX = startMapX + x;
        const mapY = startMapY + y;
        const wrappedMapX = ((mapX % mapSize) + mapSize) % mapSize;
        const wrappedMapY = ((mapY % mapSize) + mapSize) % mapSize;
        let height = map[wrappedMapY]?.[wrappedMapX] ?? 0;
        height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height)));
        const terrainColor = heightColors[height] || '#FF00FF';
        const screenX = viewport.x + x;
        const screenY = viewport.y + y;
        this.screenBuffer.drawChar(GLYPHS.BLOCK, screenX, screenY, terrainColor, terrainColor);
        const elementKey = elementMap[wrappedMapY]?.[wrappedMapX];
        this._drawSurfaceOverlay(screenX, screenY, wrappedMapX, wrappedMapY, elementKey, terrainColor, planet);
      }
    }
    this.screenBuffer.drawChar(
      player.render.char,
      viewport.x + Math.floor(viewport.width / 2),
      viewport.y + Math.floor(viewport.height / 2),
      player.render.fgColor,
      null
    );
    this.drawSurfaceHud(player, planet, viewport);
    this.drawHeightmapLegend(planet);
  }

  private getSurfaceViewport(cols: number, rows: number): { x: number; y: number; width: number; height: number } {
    const width = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_WIDTH, Math.max(1, cols - 4)));
    const height = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_HEIGHT, Math.max(1, rows - 4)));
    return {
      x: Math.max(1, Math.floor((cols - width) / 2)),
      y: Math.max(1, Math.floor((rows - height) / 2)),
      width,
      height,
    };
  }

  /** Draws the resource overlay character (%) if applicable for the given cell. */
  private _drawSurfaceOverlay( screenX: number, screenY: number, mapX: number, mapY: number, elementKey: string | null | undefined, terrainColor: string, planet: Planet ): void {
      if (elementKey && elementKey !== '' && !planet.isMined(mapX, mapY)) {
          this.screenBuffer.drawChar( '%', screenX, screenY, '#000000', terrainColor);
      }
  }

  /** Draws the "surface" view for a gas giant. */
  private drawGasGiantSurface(player: Player, planet: Planet): void {
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
    const visualPrng = planet.systemPRNG.seedNew("gas_surface_visuals");
    for (let y = 0; y < viewport.height; y++) {
      const numColors = palette.length;
      const baseColorIndex = Math.floor((y / viewport.height) * (numColors -1));
      const colour1 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex))];
      const colour2 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex + 1))];
      for (let x = 0; x < viewport.width; x++) {
        const interpFactor = (visualPrng.random() + Math.sin(x * 0.1 + y * 0.05 + visualPrng.random() * Math.PI * 2) * 0.4 + 0.5) % 1.0;
        const bandColor = interpolateColour(colour1, colour2, Math.max(0, Math.min(1, interpFactor)));
        const brightness = 0.8 + visualPrng.random() * 0.4;
        const finalColorRgb = adjustBrightness(bandColor, brightness);
        const finalColorHex = rgbToHex(finalColorRgb.r, finalColorRgb.g, finalColorRgb.b);
        const char = visualPrng.choice([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK, ' '])!;
        this.screenBuffer.drawChar(char, viewport.x + x, viewport.y + y, finalColorHex, finalColorHex);
      }
    }
    this.screenBuffer.drawChar(
      player.render.char,
      viewport.x + Math.floor(viewport.width / 2),
      viewport.y + Math.floor(viewport.height / 2),
      player.render.fgColor,
      null
    );
    this.drawSurfaceHud(player, planet, viewport);
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
    const panelWidth = Math.min(112, Math.max(48, cols - 6));
    const panelHeight = Math.min(34, Math.max(18, rows - 5));
    const panelX = Math.max(2, Math.floor((cols - panelWidth) / 2));
    const panelY = Math.max(2, Math.floor((rows - panelHeight) / 2));

    this.drawingContext.drawBox(panelX, panelY, panelWidth, panelHeight, '#00C8FF', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(` ${model.title.toUpperCase()} `, panelX + 3, panelY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(model.stationName.slice(0, panelWidth - 6), panelX + 3, panelY + 2, '#00FFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(model.subtitle.slice(0, panelWidth - 6), panelX + 3, panelY + 3, '#9FFFE0', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('-'.repeat(Math.max(1, panelWidth - 6)), panelX + 3, panelY + 4, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);

    let tabX = panelX + 4;
    model.sections.forEach((section) => {
      const active = section.id === model.sectionId;
      const label = active ? `[${section.label}]` : ` ${section.label} `;
      if (tabX + label.length < panelX + panelWidth - 2) {
        this.screenBuffer.drawString(label, tabX, panelY + 6, active ? '#001010' : '#00AA66', active ? '#00FFFF' : CONFIG.DEFAULT_BG_COLOUR);
      }
      tabX += label.length + 1;
    });

    const tableX = panelX + 4;
    const tableY = panelY + 8;
    const tableWidth = panelWidth - 9;
    const visibleRows = Math.max(1, Math.min(model.visibleRowCount, panelY + panelHeight - 6 - tableY));
    this.drawStarbaseHeader(model, tableX, tableY, tableWidth);
    this.drawStarbaseRows(model, tableX, tableY + 2, tableWidth, visibleRows);
    this.drawTextScrollbar(tableX + tableWidth + 1, tableY + 2, visibleRows, model.rows.length, model.viewOffset);

    if (model.alert) {
      this.screenBuffer.drawString(model.alert.slice(0, panelWidth - 8), panelX + 4, panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
      const blink = Math.floor(performance.now() / 450) % 2 === 0;
      if (blink) this.screenBuffer.drawChar('_', panelX + 4 + Math.min(model.alert.length, panelWidth - 9), panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
    }
    model.footer.forEach((line, index) => {
      this.screenBuffer.drawString(line.slice(0, panelWidth - 8), panelX + 4, panelY + panelHeight - 3 + index, index === 0 ? '#FFD66B' : '#5FC8FF', CONFIG.DEFAULT_BG_COLOUR);
    });
    this.screenBuffer.drawChar(player.render.char, Math.floor(cols / 2), Math.floor(rows / 2), player.render.fgColor, null);
  }

  private drawStarbaseHeader(model: StarbaseScreenModel, x: number, y: number, tableWidth: number): void {
    let cursorX = x;
    model.columns.forEach((column, index) => {
      const width = model.widths[index] ?? 12;
      this.screenBuffer.drawString(column.padEnd(width).slice(0, width), cursorX, y, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
      cursorX += width + 1;
    });
    this.screenBuffer.drawString('-'.repeat(Math.max(1, tableWidth)), x, y + 1, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);
  }

  private drawStarbaseRows(model: StarbaseScreenModel, x: number, y: number, tableWidth: number, visibleRows: number): void {
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
    if (selectedRow?.detail && y + visibleRows + 1 < this.screenBuffer.getRows()) {
      this.screenBuffer.drawString(selectedRow.detail.slice(0, tableWidth), x, y + visibleRows + 1, '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    }
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
    const label = ` ${planet.name}  X:${Math.floor(player.position.surfaceX)} Y:${Math.floor(player.position.surfaceY)} `;
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
