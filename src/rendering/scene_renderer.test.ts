/* FILE: src/rendering/scene_renderer.ts */
// src/rendering/scene_renderer.ts (Check if mined before drawing overlay)

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, SPECTRAL_DISTRIBUTION, ELEMENTS } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { adjustBrightness, hexToRgb, interpolateColour, rgbToHex } from './colour';

/** Contains methods for rendering specific game scenes/states. */
export class SceneRenderer {
  private screenBuffer: ScreenBuffer; // Main buffer for primary content
  private drawingContext: DrawingContext;
  private nebulaRenderer: NebulaRenderer;

  constructor(
    screenBuffer: ScreenBuffer, // This is the MAIN buffer
    drawingContext: DrawingContext,
    nebulaRenderer: NebulaRenderer
  ) {
    this.screenBuffer = screenBuffer;
    this.drawingContext = drawingContext; // Uses the main buffer
    this.nebulaRenderer = nebulaRenderer;
    logger.debug('[SceneRenderer] Instance created.');
  }

  // ... drawHyperspace, drawStarBackground, drawSolarSystem, drawSystemMinimap remain the same ...
  /** Draws the hyperspace view (stars, nebulae). */
  drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
    // ... (Hyperspace drawing logic remains the same) ...
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startWorldX = player.position.worldX - viewCenterX;
    const startWorldY = player.position.worldY - viewCenterY;
    const baseSeedInt = gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(
      CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE
    );
    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const worldX = startWorldX + viewX;
        const worldY = startWorldY + viewY;
        const finalBg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);
        const hash = fastHash(worldX, worldY, baseSeedInt);
        const isStarCell =
          (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        if (isStarCell) {
          const starSeed = `star_${worldX},${worldY}`;
          const starPRNG = gameSeedPRNG.seedNew(starSeed);
          const starType = starPRNG.choice(SPECTRAL_DISTRIBUTION)!;
          const starInfo = SPECTRAL_TYPES[starType];
          if (starInfo) {
            const brightnessFactor = 1.0 + ((hash % 100) / 500.0 - 0.1);
            const starBaseRgb = hexToRgb(starInfo.colour);
            const finalStarRgb = adjustBrightness(starBaseRgb, brightnessFactor);
            const finalStarHex = rgbToHex(finalStarRgb.r, finalStarRgb.g, finalStarRgb.b);
            this.screenBuffer.drawChar(starInfo.char, viewX, viewY, finalStarHex, null); // Null BG
          } else {
            logger.error(`[SceneRenderer.drawHyperspace] Could not find star info for type "${starType}" chosen from distribution.`);
            this.screenBuffer.drawChar('?', viewX, viewY, '#FF00FF', null); // Fallback, Null BG
          }
        } else {
          this.screenBuffer.drawChar(null, viewX, viewY, null, finalBg); // Solid BG
        }
      }
    }
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      viewCenterX,
      viewCenterY,
      player.render.fgColor, // Use render component color
      null // Null BG
    );
  }

  /** ADDED: Draws the scrolling star background for the system view. */
  drawStarBackground(player: Player, backgroundBuffer: ScreenBuffer): void {
    // ... (Star background drawing logic remains the same) ...
    const cols = backgroundBuffer.getCols();
    const rows = backgroundBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;
    const baseBgSeed = `${CONFIG.SEED}_star_background`;
    const baseBgPrng = new PRNG(baseBgSeed);
    CONFIG.STAR_BACKGROUND_LAYERS.forEach((layer, layerIndex) => {
      const { factor: parallaxFactor, density, scale } = layer;
      const viewOffsetX = Math.floor(player.position.systemX * parallaxFactor / scale);
      const viewOffsetY = Math.floor(player.position.systemY * parallaxFactor / scale);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const starFieldX = x + viewOffsetX;
          const starFieldY = y + viewOffsetY;
          const cellSeedString = `${baseBgSeed}_${layerIndex}_${starFieldX}_${starFieldY}`;
          const cellPrng = baseBgPrng.seedNew(cellSeedString);
          const starCheck = cellPrng.random();
          if (starCheck < density) {
            const starChar = cellPrng.choice(CONFIG.STAR_BACKGROUND_CHARS)!;
            const starColor = cellPrng.choice(CONFIG.STAR_BACKGROUND_COLORS)!;
            backgroundBuffer.drawChar(starChar, x, y, starColor, null);
          } else {
            backgroundBuffer.drawChar(null, x, y, null, null);
          }
        }
      }
    });
  }


  /** Draws the solar system view. */
  drawSolarSystem(player: Player, system: SolarSystem): void {
    // ... (Solar system drawing logic remains the same) ...
    logger.debug(
      `[SceneRenderer.drawSolarSystem] Drawing system: ${system.name} (${system.starType})`
    );
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewScale = CONFIG.SYSTEM_VIEW_SCALE;
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const viewWorldStartX = player.position.systemX - viewCenterX * viewScale;
    const viewWorldStartY = player.position.systemY - viewCenterY * viewScale;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.screenBuffer.drawChar(null, x, y, null, null);
      }
    }
    const starInfo = SPECTRAL_TYPES[system.starType];
    const starColor = starInfo?.colour || '#FFFFFF';
    const starViewX = Math.floor((0 - viewWorldStartX) / viewScale);
    const starViewY = Math.floor((0 - viewWorldStartY) / viewScale);
    let starRadius = 1;
    switch (system.starType) {
      case 'O': starRadius = 7; break;
      case 'B': starRadius = 6; break;
      case 'A': starRadius = 5; break;
      case 'F': starRadius = 4; break;
      case 'G': starRadius = 4; break;
      case 'K': starRadius = 3; break;
      case 'M': starRadius = 2; break;
      default: starRadius = 1;
    }
    logger.debug(`[SceneRenderer.drawSolarSystem] Star type ${system.starType}, using radius ${starRadius}`);
    this.drawingContext.drawCircle(
      starViewX, starViewY, starRadius, GLYPHS.SHADE_DARK, starColor, starColor
    );
    this.drawingContext.drawOrbit(
      starViewX, starViewY, starRadius, GLYPHS.SHADE_MEDIUM, starColor, 0, 0, cols - 1, rows - 1
    );
    system.planets.forEach((planet) => {
      if (!planet) return;
      const orbitViewRadius = Math.round(planet.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
        this.drawingContext.drawOrbit(
          starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOUR_MAIN, 0, 0, cols - 1, rows - 1
        );
      }
      const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
      const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);
      const planetColor = PLANET_TYPES[planet.type]?.terrainColours[4] || '#CCCCCC';
      this.drawingContext.drawCircle(
        planetViewX, planetViewY, 0, GLYPHS.PLANET_ICON, planetColor, null
      );
    });
    if (system.starbase) {
      const sb = system.starbase;
      const orbitViewRadius = Math.round(sb.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
        this.drawingContext.drawOrbit(
          starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOUR, 0, 0, cols - 1, rows - 1
        );
      }
      const sbViewX = Math.floor((sb.systemX - viewWorldStartX) / viewScale);
      const sbViewY = Math.floor((sb.systemY - viewWorldStartY) / viewScale);
      this.drawingContext.drawCircle(
        sbViewX, sbViewY, 0, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOUR, null
      );
    }
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      viewCenterX,
      viewCenterY,
      player.render.fgColor, // Use render component color
      null // Null BG
    );
    this.drawSystemMinimap(system, player);
  }

  /** Draws the minimap for the solar system view. */
  private drawSystemMinimap(system: SolarSystem, player: Player): void {
    // ... (Minimap drawing logic remains the same) ...
    const cols = this.screenBuffer.getCols();
    const mapWidth = Math.floor(cols * CONFIG.MINIMAP_SIZE_FACTOR);
    const mapHeight = mapWidth;
    if (mapWidth <= 0 || mapHeight <= 0) return;
    const mapStartX = cols - mapWidth - 1;
    const mapStartY = 1;
    const worldRadius = system.edgeRadius;
    const mapScale = (2 * worldRadius) / Math.min(mapWidth, mapHeight);
    if (mapScale <= 0 || !Number.isFinite(mapScale)) {
      logger.warn(`[SceneRenderer.drawSystemMinimap] Invalid map scale: ${mapScale}. Aborting minimap.`);
      return;
    }
    this.drawingContext.drawBox(mapStartX - 1, mapStartY - 1, mapWidth + 2, mapHeight + 2, '#888888', CONFIG.DEFAULT_BG_COLOUR);
    const worldToMinimap = (worldX: number, worldY: number): { x: number; y: number } | null => {
      const mapX = Math.floor(worldX / mapScale + mapWidth / 2);
      const mapY = Math.floor(worldY / mapScale + mapHeight / 2);
      if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
        return { x: mapStartX + mapX, y: mapStartY + mapY };
      }
      return null;
    };
    for (let y = 0; y < mapHeight; ++y) {
      for (let x = 0; x < mapWidth; ++x) {
        this.screenBuffer.drawChar(null, mapStartX + x, mapStartY + y, null, CONFIG.DEFAULT_BG_COLOUR);
      }
    }
    system.planets.forEach(p => {
      if (!p) return;
      const planetPos = worldToMinimap(p.systemX, p.systemY);
      if (planetPos) {
        let planetIcon = '.';
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
      if (sbPos) {
        this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbPos.x, sbPos.y, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
      }
    }
    const playerPos = worldToMinimap(player.position.systemX, player.position.systemY);
    if (playerPos) {
      this.screenBuffer.drawChar(CONFIG.PLAYER_CHAR, playerPos.x, playerPos.y, CONFIG.PLAYER_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    }
  }

  /** Draws the surface view for planets or starbases. */
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    // ... (Delegate logic remains the same) ...
    if (landedObject instanceof Planet) {
      if (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant') {
        this.drawGasGiantSurface(player, landedObject);
      } else {
        this.drawSolidPlanetSurface(player, landedObject);
      }
    } else if (landedObject instanceof Starbase) {
      this.drawStarbaseInterior(player, landedObject);
    } else {
      logger.error(
        `[SceneRenderer.drawPlanetSurface] Unknown object type for surface rendering: ${typeof landedObject}`
      );
    }
  }

  /** Draws the surface of a solid planet. */
  private drawSolidPlanetSurface(player: Player, planet: Planet): void {
    logger.debug(
      `[SceneRenderer.drawSolidPlanetSurface] Rendering surface: ${planet.name} (${planet.type})`
    );
    const map = planet.heightmap;
    const heightColors = planet.heightLevelColors;
    const elementMap = planet.surfaceElementMap; // Use getter

    if (!map || !heightColors || !elementMap) {
      logger.error(
        `[SceneRenderer.drawSolidPlanetSurface] Surface data missing (heightmap, colors, or element map) for ${planet.name}. Ensure ensureSurfaceReady was called.`
      );
      return;
    }

    const mapSize = map.length;
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

        // --- Draw Terrain Block (Main Buffer) ---
        let height = map[wrappedMapY]?.[wrappedMapX] ?? 0;
        height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height)));
        const terrainColor = heightColors[height] || '#FF00FF';
        this.screenBuffer.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor); // Draw terrain first

        // --- FIXED & UPDATED: Draw Element Overlay Directly to Main Buffer ---
        const elementKey = elementMap[wrappedMapY]?.[wrappedMapX];
        // *** NEW: Check if mined before drawing overlay ***
        if (elementKey && elementKey !== '' && !planet.isMined(wrappedMapX, wrappedMapY)) {
          this.screenBuffer.drawChar(
            '%',            // Character for overlay
            x,              // Screen X
            y,              // Screen Y
            '#000000',      // Foreground: Black
            terrainColor    // Background: Use terrain color
          );
        }
        // *** END NEW ***
      }
    }

    // Draw player character
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      viewCenterX,
      viewCenterY,
      player.render.fgColor, // Use render component color
      null // Player has transparent background on surface
    );
    // Draw heightmap legend
    this.drawHeightmapLegend(planet);
  }

  /** Draws the "surface" view for a gas giant. */
  private drawGasGiantSurface(player: Player, planet: Planet): void {
    // ... (Gas giant drawing logic remains the same) ...
    logger.debug(
      `[SceneRenderer.drawGasGiantSurface] Drawing atmospheric view: ${planet.name}`
    );
    if (!planet.rgbPaletteCache) {
      logger.error(`[SceneRenderer.drawGasGiantSurface] RGB Palette cache missing for ${planet.name}.`);
      return;
    }
    const palette = planet.rgbPaletteCache;
    const numColors = palette.length;
    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    const staticPrng = planet.systemPRNG.seedNew("gas_surface_static");
    for (let y = 0; y < rows; y++) {
      const baseColorIndex = Math.floor((y / rows) * numColors);
      const colour1 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex))];
      const colour2 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex + 1))];
      for (let x = 0; x < cols; x++) {
        const interpFactor = (staticPrng.random() + Math.sin(x * 0.1 + y * 0.05 + staticPrng.random() * 5) * 0.3 + 0.5) % 1.0;
        const bandColor = interpolateColour(colour1, colour2, Math.max(0, Math.min(1, interpFactor)));
        const brightness = 0.8 + staticPrng.random() * 0.4;
        const finalColorRgb = adjustBrightness(bandColor, brightness);
        const finalColorHex = rgbToHex(finalColorRgb.r, finalColorRgb.g, finalColorRgb.b);
        const char = staticPrng.choice([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK, ' '])!;
        this.screenBuffer.drawChar(char, x, y, finalColorHex, finalColorHex);
      }
    }
    this.screenBuffer.drawChar(
      player.render.char,
      Math.floor(cols / 2),
      Math.floor(rows / 2),
      player.render.fgColor,
      null // Transparent background for player on gas giant
    );
  }

  /** Draws the view when docked inside a starbase. */
  private drawStarbaseInterior(player: Player, starbase: Starbase): void {
    // ... (Starbase interior drawing logic remains the same) ...
    logger.debug(
      `[SceneRenderer.drawStarbaseInterior] Drawing interior: ${starbase.name}`
    );
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    this.drawingContext.drawBox(0, 0, cols, rows, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR, ' ');
    this.screenBuffer.drawString('== Starbase Docking Bay ==', 5, 3, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString('Services:', 5, 6, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
    this.screenBuffer.drawString(
      `- [${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade Commodities`, 7, 8, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR
    );
    this.screenBuffer.drawString(
      `- [${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel Ship`, 7, 9, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR
    );
    this.screenBuffer.drawString(
      `Press [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] to depart.`, 5, 12, CONFIG.DEFAULT_FG_COLOUR, CONFIG.DEFAULT_BG_COLOUR
    );
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      Math.floor(cols / 2),
      Math.floor(rows / 2),
      player.render.fgColor, // Use render component color
      null // Transparent background inside starbase
    );
  }

  /** Draws a legend for the heightmap colours on the planet surface view. */
  private drawHeightmapLegend(planet: Planet): void {
    // ... (Heightmap legend drawing logic remains the same) ...
    if (!planet.heightLevelColors || planet.heightLevelColors.length === 0) return;
    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    const legendWidth = 1;
    const legendHeight = Math.min(rows - 2, 20);
    const startX = cols - legendWidth - 1;
    const startY = Math.floor((rows - legendHeight) / 2);
    const numColors = planet.heightLevelColors.length;
    for (let i = 0; i < legendHeight; i++) {
      const colourIndex = Math.floor(((i / (legendHeight - 1)) * (numColors - 1)));
      const colour = planet.heightLevelColors[colourIndex] || '#FF00FF';
      for (let w = 0; w < legendWidth; ++w) {
        this.screenBuffer.drawChar(GLYPHS.BLOCK, startX + w, startY + i, colour, colour);
      }
    }
    this.screenBuffer.drawString("High", startX - 4, startY, CONFIG.DEFAULT_FG_COLOUR, null);
    this.screenBuffer.drawString("Low", startX - 3, startY + legendHeight - 1, CONFIG.DEFAULT_FG_COLOUR, null);
  }
}