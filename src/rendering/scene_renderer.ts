// FILE: src/rendering/scene_renderer.ts
// REFACTORED: Extracted solar system object drawing logic into helper methods.
// REFACTORED: Flattened moon drawing loop in drawSolarSystem.

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, ELEMENTS, AU_IN_METERS, SPECTRAL_DISTRIBUTION } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { adjustBrightness, hexToRgb, interpolateColour, rgbToHex, RgbColour } from './colour';
import { SystemDataGenerator } from '../generation/system_data_generator';

interface RenderedStarCell {
  char: string;
  color: string;
}

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

  // --- drawHyperspace --- (no changes from previous step)
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
            const star = this.getRenderedStarCell(systemProps.starType!, worldX, worldY);
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

  // --- drawStarBackground --- (no changes from previous step)
  /** Draws the scrolling star background for the system view. */
  drawStarBackground(player: Player, backgroundBuffer: ScreenBuffer): void {
    const cols = backgroundBuffer.getCols();
    const rows = backgroundBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;
    const baseBgSeed = `${CONFIG.SEED}_star_background`;
    const baseBgPrng = new PRNG(baseBgSeed);
    backgroundBuffer.clear(false);
    CONFIG.STAR_BACKGROUND_LAYERS.forEach((layer, layerIndex) => {
      const { factor: parallaxFactor, density, scale } = layer;
      const scaledPlayerX = player.position.systemX * parallaxFactor;
      const scaledPlayerY = player.position.systemY * parallaxFactor;
      const viewOffsetX = Math.floor(scaledPlayerX / scale);
      const viewOffsetY = Math.floor(scaledPlayerY / scale);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const starFieldX = x + viewOffsetX;
          const starFieldY = y + viewOffsetY;
          const cellSeedString = `${baseBgSeed}_${layerIndex}_${starFieldX}_${starFieldY}`;
          const cellPrng = baseBgPrng.seedNew(cellSeedString);
          if (cellPrng.random() < density) {
            const starType = cellPrng.choice(SPECTRAL_DISTRIBUTION)!;
            const star = this.getRenderedStarCell(starType, starFieldX, starFieldY);
            const starChar = cellPrng.choice(CONFIG.STAR_BACKGROUND_CHARS)!;
            const dimStarColor = this.dimHexColour(star.color, layerIndex === 0 ? 0.34 : 0.24);
            backgroundBuffer.drawChar(starChar, x, y, `${dimStarColor}45`, null);
          }
        }
      }
    });
  }

  private getRenderedStarCell(starType: string, worldX: number, worldY: number): RenderedStarCell {
    const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES['G'];
    const hash = fastHash(worldX, worldY, 0);
    const brightnessFactor = 1.0 + ((hash % 100) / 500.0 - 0.1);
    const starBaseRgb = hexToRgb(starInfo.colour);
    const finalStarRgb = adjustBrightness(starBaseRgb, brightnessFactor);
    return {
      char: starInfo.char,
      color: rgbToHex(finalStarRgb.r, finalStarRgb.g, finalStarRgb.b),
    };
  }

  private dimHexColour(hex: string, factor: number): string {
    const rgb = hexToRgb(hex);
    return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
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

    // --- Calculate Star Position and Radius ---
    const starInfo = SPECTRAL_TYPES[system.starType];
    const starColor = starInfo?.colour || '#FFFFFF';
    const starViewX = Math.floor((0 - viewWorldStartX) / viewScale);
    const starViewY = Math.floor((0 - viewWorldStartY) / viewScale);
    let starRadius = 1; // Default visual radius
    if (starInfo?.radius) {
        starRadius = Math.max(0, Math.round(starInfo.radius / viewScale));
    }

    // --- Draw Star ---
    this._drawStarInSystem(starViewX, starViewY, starRadius, starColor);

    // --- Collect Visible Planets and Moons ---
    const visiblePlanets: VisiblePlanetMarker[] = [];
    const visibleMoons: { moon: Planet, viewX: number, viewY: number, parentViewX: number, parentViewY: number }[] = [];

    system.planets.forEach((planet, planetIndex) => {
      if (!planet) return;

      // Draw Planet Orbit (Helper handles visibility checks)
      this._drawPlanetOrbit(planet, starViewX, starViewY, viewScale);

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
      this._drawStarbaseInSystem(system.starbase, starViewX, starViewY, viewWorldStartX, viewWorldStartY, viewScale);
    }

    this.drawSystemPlanetHud(system, player, visiblePlanets);

    // --- Draw Player --- (Always at center)
    this.screenBuffer.drawChar(player.render.char, viewCenterX, viewCenterY, player.render.fgColor, null);

    // --- Draw Minimap ---
    this.drawSystemMinimap(system, player);
  }

  // --- Private Helper Methods for drawSolarSystem ---

  private _drawStarInSystem(starViewX: number, starViewY: number, starRadius: number, starColor: string): void {
      const cols = this.screenBuffer.getCols();
      const rows = this.screenBuffer.getRows();
      // Draw star only if potentially visible
      if (starViewX + starRadius >= 0 && starViewX - starRadius < cols && starViewY + starRadius >= 0 && starViewY - starRadius < rows) {
          this.drawingContext.drawCircle(starViewX, starViewY, starRadius, GLYPHS.SHADE_DARK, starColor, starColor);
          this.drawingContext.drawOrbit(starViewX, starViewY, starRadius, GLYPHS.SHADE_MEDIUM, starColor, 0, 0, cols - 1, rows - 1);
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

  // --- drawSystemMinimap --- (no changes from previous step)
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
    const starPos = worldToMinimap(0, 0);
    if (starPos) {
        const starInfo = SPECTRAL_TYPES[system.starType];
        const starColor = starInfo?.colour || '#FFFFFF';
        this.screenBuffer.drawChar('*', starPos.x, starPos.y, starColor, CONFIG.DEFAULT_BG_COLOUR);
    }
    if (system.starbase) {
        const sbPos = worldToMinimap(system.starbase.systemX, system.starbase.systemY);
        if (sbPos) { this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbPos.x, sbPos.y, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR); }
    }
    const playerPos = worldToMinimap(player.position.systemX, player.position.systemY);
    if (playerPos) { this.screenBuffer.drawChar(player.render.char, playerPos.x, playerPos.y, player.render.fgColor, CONFIG.DEFAULT_BG_COLOUR); }
  }

  // --- drawPlanetSurface --- (no changes from previous step)
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

  // --- drawSolidPlanetSurface --- (no changes from previous step)
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

  // --- _drawSurfaceOverlay --- (no changes from previous step)
  /** Draws the resource overlay character (%) if applicable for the given cell. */
  private _drawSurfaceOverlay( screenX: number, screenY: number, mapX: number, mapY: number, elementKey: string | null | undefined, terrainColor: string, planet: Planet ): void {
      if (elementKey && elementKey !== '' && !planet.isMined(mapX, mapY)) {
          this.screenBuffer.drawChar( '%', screenX, screenY, '#000000', terrainColor);
      }
  }

  // --- drawGasGiantSurface --- (no changes from previous step)
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

  // --- drawStarbaseInterior --- (no changes from previous step)
  /** Draws the view when docked inside a starbase. */
  private drawStarbaseInterior(player: Player, starbase: Starbase): void {
    logger.debug(`[SceneRenderer.drawStarbaseInterior] Drawing interior: ${starbase.name}`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    this.drawingContext.drawBox(0, 0, cols, rows, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR, ' ');
    const panelWidth = Math.min(72, Math.max(32, cols - 8));
    const panelHeight = Math.min(22, Math.max(14, rows - 6));
    const panelX = Math.max(2, Math.floor((cols - panelWidth) / 2));
    const panelY = Math.max(2, Math.floor((rows - panelHeight) / 2));

    this.drawingContext.drawBox(panelX, panelY, panelWidth, panelHeight, '#00C8FF', CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString(' STARBASE TRADE DEPOT ', panelX + 3, panelY, '#8CFFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(starbase.name.slice(0, panelWidth - 6), panelX + 3, panelY + 2, '#00FFFF', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('-'.repeat(Math.max(1, panelWidth - 6)), panelX + 3, panelY + 4, '#006A6A', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(`[${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] AUTO-TRADE CARGO / BUY DEPOT LOT`, panelX + 4, panelY + 6, '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('[UP/DOWN] SELECT   [ENTER] BUY   [BACKSPACE] SELL', panelX + 4, panelY + 7, '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(`[${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] REFUEL FROM REACTOR TENDER   [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] DEPART`, panelX + 4, panelY + 8, '#B8FFF0', CONFIG.DEFAULT_BG_COLOUR);
    const marketRows = starbase.tradeDisplayRows.slice(0, Math.max(0, panelHeight - 16));
    marketRows.forEach((row, index) => {
      const selected = row.startsWith('>');
      this.screenBuffer.drawString(row.slice(0, panelWidth - 8), panelX + 4, panelY + 10 + index, selected ? '#00FF66' : '#00AA66', CONFIG.DEFAULT_BG_COLOUR);
    });
    this.screenBuffer.drawString(`Cr ${player.resources.credits.toLocaleString().padStart(7)}  Fuel ${player.resources.fuel.toFixed(0).padStart(3)}/${player.resources.maxFuel}`, panelX + 4, panelY + panelHeight - 6, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(`Cargo ${Object.values(player.cargoHold.items).reduce((sum, qty) => sum + qty, 0).toString().padStart(3)}/${player.cargoHold.capacity}`, panelX + 4, panelY + panelHeight - 5, '#FFD66B', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('> MARKET LINK STABLE  > DOCKSIDE CRANES READY', panelX + 4, panelY + panelHeight - 3, '#00AA66', CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawChar(player.render.char, Math.floor(cols / 2), Math.floor(rows / 2), player.render.fgColor, null);
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

  // --- drawHeightmapLegend --- (no changes from previous step)
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

  // --- _drawError --- (no changes from previous step)
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
