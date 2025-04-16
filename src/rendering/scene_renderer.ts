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
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, ELEMENTS, AU_IN_METERS } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { adjustBrightness, hexToRgb, interpolateColour, rgbToHex, RgbColour } from './colour';

/** Contains methods for rendering specific game scenes/states. */
export class SceneRenderer {
  private screenBuffer: ScreenBuffer; // Main buffer for primary content
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;

  constructor(
    screenBuffer: ScreenBuffer,
    drawingContext: DrawingContext,
    nebulaRenderer: NebulaRenderer
  ) {
    this.screenBuffer = screenBuffer;
    this.drawingContext = drawingContext;
    this.nebulaRenderer = nebulaRenderer;
    logger.debug('[SceneRenderer] Instance created.');
  }

  // --- drawHyperspace --- (no changes from previous step)
  /** Draws the hyperspace view (stars, nebulae). */
  drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;

    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startWorldX = player.position.worldX - viewCenterX;
    const startWorldY = player.position.worldY - viewCenterY;
    const baseSeedInt = gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(
      CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE
    );
    this.screenBuffer.clear(false);
    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const worldX = startWorldX + viewX;
        const worldY = startWorldY + viewY;
        const finalBg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);
        const hash = fastHash(worldX, worldY, baseSeedInt);
        const isStarCell = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        if (isStarCell) {
          const starSeed = `star_${worldX},${worldY}`;
          const starPRNG = gameSeedPRNG.seedNew(starSeed);
          const starType = starPRNG.choice(Object.keys(SPECTRAL_TYPES))!;
          const starInfo = SPECTRAL_TYPES[starType];
          if (starInfo) {
            const brightnessFactor = 1.0 + ((hash % 100) / 500.0 - 0.1);
            const starBaseRgb = hexToRgb(starInfo.colour);
            const finalStarRgb = adjustBrightness(starBaseRgb, brightnessFactor);
            const finalStarHex = rgbToHex(finalStarRgb.r, finalStarRgb.g, finalStarRgb.b);
            this.screenBuffer.drawChar(starInfo.char, viewX, viewY, finalStarHex, null);
          } else {
            logger.error(`[SceneRenderer.drawHyperspace] Could not find star info for type "${starType}".`);
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
            const starChar = cellPrng.choice(CONFIG.STAR_BACKGROUND_CHARS)!;
            const starColor = cellPrng.choice(CONFIG.STAR_BACKGROUND_COLORS)!;
            backgroundBuffer.drawChar(starChar, x, y, starColor, null);
          }
        }
      }
    });
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
    const visiblePlanets: { planet: Planet, viewX: number, viewY: number }[] = [];
    const visibleMoons: { moon: Planet, viewX: number, viewY: number, parentViewX: number, parentViewY: number }[] = [];

    system.planets.forEach((planet) => {
      if (!planet) return;

      // Draw Planet Orbit (Helper handles visibility checks)
      this._drawPlanetOrbit(planet, starViewX, starViewY, viewScale);

      // Calculate Planet Position
      const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
      const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);

      // Check if planet is in view
      if (planetViewX >= 0 && planetViewX < cols && planetViewY >= 0 && planetViewY < rows) {
          visiblePlanets.push({ planet, viewX: planetViewX, viewY: planetViewY });

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
        this._drawPlanetBody(item.planet, item.viewX, item.viewY, viewScale);
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
      // Draw orbit only if it's reasonably large on screen and potentially visible
      if (orbitViewRadius > 1 && orbitViewRadius < Math.max(cols, rows)) {
          this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOUR_MAIN, 0, 0, cols - 1, rows - 1);
      }
  }

  private _drawPlanetBody(planet: Planet, planetViewX: number, planetViewY: number, viewScale: number): void {
      const planetColor = PLANET_TYPES[planet.type]?.terrainColours[4] || '#CCCCCC';
      // Simple representation: 'O' if it has moons AND is zoomed in enough, 'o' otherwise
      const planetGlyph = (planet.moons && planet.moons.length > 0 && viewScale < CONFIG.SYSTEM_VIEW_SCALE / 10) ? GLYPHS.PLANET_ICON : 'o';
      this.screenBuffer.drawChar(planetGlyph, planetViewX, planetViewY, planetColor, null); // Null BG
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
      if (orbitViewRadius > 1 && orbitViewRadius < Math.max(cols, rows)) {
          this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOUR, 0, 0, cols - 1, rows - 1);
      }
      const sbViewX = Math.floor((starbase.systemX - viewWorldStartX) / viewScale);
      const sbViewY = Math.floor((starbase.systemY - viewWorldStartY) / viewScale);
      if (sbViewX >= 0 && sbViewX < cols && sbViewY >= 0 && sbViewY < rows) {
           this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbViewX, sbViewY, CONFIG.STARBASE_COLOUR, null);
      }
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
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startMapX = Math.floor(player.position.surfaceX - viewCenterX);
    const startMapY = Math.floor(player.position.surfaceY - viewCenterY);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const mapX = startMapX + x;
        const mapY = startMapY + y;
        const wrappedMapX = ((mapX % mapSize) + mapSize) % mapSize;
        const wrappedMapY = ((mapY % mapSize) + mapSize) % mapSize;
        let height = map[wrappedMapY]?.[wrappedMapX] ?? 0;
        height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height)));
        const terrainColor = heightColors[height] || '#FF00FF';
        this.screenBuffer.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor);
        const elementKey = elementMap[wrappedMapY]?.[wrappedMapX];
        this._drawSurfaceOverlay(x, y, wrappedMapX, wrappedMapY, elementKey, terrainColor, planet);
      }
    }
    this.screenBuffer.drawChar(player.render.char, viewCenterX, viewCenterY, player.render.fgColor, null);
    this.drawHeightmapLegend(planet);
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
    const visualPrng = planet.systemPRNG.seedNew("gas_surface_visuals");
    for (let y = 0; y < rows; y++) {
      const numColors = palette.length;
      const baseColorIndex = Math.floor((y / rows) * (numColors -1));
      const colour1 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex))];
      const colour2 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex + 1))];
      for (let x = 0; x < cols; x++) {
        const interpFactor = (visualPrng.random() + Math.sin(x * 0.1 + y * 0.05 + visualPrng.random() * Math.PI * 2) * 0.4 + 0.5) % 1.0;
        const bandColor = interpolateColour(colour1, colour2, Math.max(0, Math.min(1, interpFactor)));
        const brightness = 0.8 + visualPrng.random() * 0.4;
        const finalColorRgb = adjustBrightness(bandColor, brightness);
        const finalColorHex = rgbToHex(finalColorRgb.r, finalColorRgb.g, finalColorRgb.b);
        const char = visualPrng.choice([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK, ' '])!;
        this.screenBuffer.drawChar(char, x, y, finalColorHex, finalColorHex);
      }
    }
    this.screenBuffer.drawChar(player.render.char, Math.floor(cols / 2), Math.floor(rows / 2), player.render.fgColor, null);
  }

  // --- drawStarbaseInterior --- (no changes from previous step)
  /** Draws the view when docked inside a starbase. */
  private drawStarbaseInterior(player: Player, starbase: Starbase): void {
    logger.debug(`[SceneRenderer.drawStarbaseInterior] Drawing interior: ${starbase.name}`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    this.drawingContext.drawBox(0, 0, cols, rows, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString('== Starbase Docking Bay ==', 5, 3, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('Services:', 5, 6, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(`- [${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade Commodities`, 7, 8, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(`- [${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel Ship`, 7, 9, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(`Press [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] to depart.`, 5, 12, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawChar(player.render.char, Math.floor(cols / 2), Math.floor(rows / 2), player.render.fgColor, null);
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