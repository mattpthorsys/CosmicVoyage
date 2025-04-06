// src/rendering/scene_renderer.ts

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES } from '../constants';
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { adjustBrightness, hexToRgb, interpolateColour, rgbToHex } from './colour';

/** Contains methods for rendering specific game scenes/states. */
export class SceneRenderer {
  private screenBuffer: ScreenBuffer;
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

  /** Draws the hyperspace view (stars, nebulae). */
  drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
    //logger.debug('[SceneRenderer.drawHyperspace] Drawing...');
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startWorldX = player.worldX - viewCenterX;
    const startWorldY = player.worldY - viewCenterY;
    const baseSeedInt = gameSeedPRNG.seed;
    const starPresenceThreshold = Math.floor(
      CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE
    );

    // Loop through visible grid cells
    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const worldX = startWorldX + viewX;
        const worldY = startWorldY + viewY;

        // --- Draw Nebula Background ---
        const finalBg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);

        // --- Draw Stars (on top of nebula) ---
        const hash = fastHash(worldX, worldY, baseSeedInt);
        const isStarCell =
          (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (isStarCell) {
          // Generate star details using a PRNG seeded specifically for this star location
          const starSeed = `star_${worldX},${worldY}`;
          const starPRNG = gameSeedPRNG.seedNew(starSeed);
          const starType = starPRNG.choice(Object.keys(SPECTRAL_TYPES))!;
          const starInfo = SPECTRAL_TYPES[starType];

          if (starInfo) {
            // Adjust brightness slightly based on hash for twinkling effect?
            const brightnessFactor = 1.0 + ((hash % 100) / 500.0 - 0.1);
            const starBaseRgb = hexToRgb(starInfo.color);
            const finalStarRgb = adjustBrightness(
              starBaseRgb,
              brightnessFactor
            );
            const finalStarHex = rgbToHex(
              finalStarRgb.r,
              finalStarRgb.g,
              finalStarRgb.b
            );
            // Draw star character with transparent background over the nebula
            this.screenBuffer.drawChar(starInfo.char, viewX, viewY, finalStarHex, null);
          } else {
            this.screenBuffer.drawChar('?', viewX, viewY, '#FF00FF', null); // Fallback
          }
        } else {
          // Not a star cell, just draw the background
          this.screenBuffer.drawChar(null, viewX, viewY, null, finalBg);
        }
      }
    }

    // Draw player character last, on top
    this.screenBuffer.drawChar(
      player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null
    );
  }

  /** Draws the solar system view. */
  drawSolarSystem(player: Player, system: SolarSystem): void {
    logger.debug(
      `[SceneRenderer.drawSolarSystem] Drawing system: ${system.name} (${system.starType})`
    );
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewScale = CONFIG.SYSTEM_VIEW_SCALE;
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const viewWorldStartX = player.systemX - viewCenterX * viewScale;
    const viewWorldStartY = player.systemY - viewCenterY * viewScale;

    // --- Clear background (to black) ---
    // This replaces renderer.clear(false). If a different background is desired,
    // draw it here cell by cell.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.screenBuffer.drawChar(null, x, y, null, CONFIG.DEFAULT_BG_COLOR);
      }
    }

    // --- Draw Star ---
    const starInfo = SPECTRAL_TYPES[system.starType];
    const starColor = starInfo?.color || '#FFFFFF';
    const starChar = starInfo?.char || '*';
    const starViewX = Math.floor((0 - viewWorldStartX) / viewScale);
    const starViewY = Math.floor((0 - viewWorldStartY) / viewScale);
    this.drawingContext.drawCircle(starViewX, starViewY, 1, starChar, starColor, starColor);

    // --- Draw Orbits and Planets/Starbase ---
    system.planets.forEach((planet) => {
      if (!planet) return;
      const orbitViewRadius = Math.round(planet.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
        this.drawingContext.drawOrbit(
          starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOR_MAIN
        );
      }
      const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
      const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);
      const planetColor = PLANET_TYPES[planet.type]?.colors[4] || '#CCCCCC';
      this.drawingContext.drawCircle(
        planetViewX, planetViewY, 0, GLYPHS.PLANET_ICON, planetColor, planetColor
      );
    });

    if (system.starbase) {
      const sb = system.starbase;
      const orbitViewRadius = Math.round(sb.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
        this.drawingContext.drawOrbit(
          starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOR
        );
      }
      const sbViewX = Math.floor((sb.systemX - viewWorldStartX) / viewScale);
      const sbViewY = Math.floor((sb.systemY - viewWorldStartY) / viewScale);
      this.drawingContext.drawCircle(
        sbViewX, sbViewY, 0, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOR, CONFIG.STARBASE_COLOR
      );
    }

    // --- Draw Player Ship ---
    this.screenBuffer.drawChar(
      player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null
    );

    // --- Draw Minimap ---
    this.drawSystemMinimap(system, player);
  }

  /** Draws the minimap for the solar system view. */
  private drawSystemMinimap(system: SolarSystem, player: Player): void {
    // logger.debug('[SceneRenderer.drawSystemMinimap] Drawing...'); // Noisy
    const cols = this.screenBuffer.getCols();
    const mapWidth = Math.floor(cols * CONFIG.MINIMAP_SIZE_FACTOR);
    const mapHeight = mapWidth;
    if (mapWidth <= 0 || mapHeight <= 0) return; // Don't draw if too small

    const mapStartX = cols - mapWidth - 1;
    const mapStartY = 1;
    const worldRadius = system.edgeRadius;
    const mapScale = (2 * worldRadius) / Math.min(mapWidth, mapHeight);

    if (mapScale <= 0 || !Number.isFinite(mapScale)) {
      logger.warn(
        `[SceneRenderer.drawSystemMinimap] Invalid map scale: ${mapScale}. Aborting minimap.`
      );
      return;
    }

    // Draw border and clear background
    this.drawingContext.drawBox(mapStartX - 1, mapStartY - 1, mapWidth + 2, mapHeight + 2, '#888888', null);
    for (let y = 0; y < mapHeight; ++y) {
      for (let x = 0; x < mapWidth; ++x) {
        this.screenBuffer.drawChar(null, mapStartX + x, mapStartY + y, null, this.screenBuffer.getDefaultBgColor());
      }
    }

    // Helper to convert world coords to minimap screen coords
    const worldToMinimap = (worldX: number, worldY: number): { x: number; y: number } | null => {
      const mapX = Math.floor(worldX / mapScale + mapWidth / 2);
      const mapY = Math.floor(worldY / mapScale + mapHeight / 2);
      if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
        return { x: mapStartX + mapX, y: mapStartY + mapY };
      }
      return null;
    };

    // Draw star
    const starPos = worldToMinimap(0, 0);
    if (starPos) {
      const starInfo = SPECTRAL_TYPES[system.starType];
      this.screenBuffer.drawChar(starInfo?.char || '*', starPos.x, starPos.y, starInfo?.color || '#FFFFFF', null);
    }
    // Draw planets
    system.planets.forEach(p => {
      if (!p) return;
      const planetPos = worldToMinimap(p.systemX, p.systemY);
      if (planetPos) {
        const planetColor = PLANET_TYPES[p.type]?.colors[4] || '#CCCCCC';
        this.screenBuffer.drawChar(GLYPHS.PLANET_ICON, planetPos.x, planetPos.y, planetColor, null);
      }
    });
    // Draw starbase
    if (system.starbase) {
      const sbPos = worldToMinimap(system.starbase.systemX, system.starbase.systemY);
      if (sbPos) {
        this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbPos.x, sbPos.y, CONFIG.STARBASE_COLOR, null);
      }
    }
    // Draw player
    const playerPos = worldToMinimap(player.systemX, player.systemY);
    if (playerPos) {
      this.screenBuffer.drawChar(CONFIG.PLAYER_CHAR, playerPos.x, playerPos.y, CONFIG.PLAYER_COLOR, null);
    }
  }

  /** Draws the surface view for planets or starbases. */
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    // Delegate based on type
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
      // Optionally draw an error message on screenBuffer
    }
  }

  /** Draws the surface of a solid planet. */
  private drawSolidPlanetSurface(player: Player, planet: Planet): void {
    logger.debug(
      `[SceneRenderer.drawSolidPlanetSurface] Rendering surface: ${planet.name} (${planet.type})`
    );
    // Ensure surface data is ready (heightmap/colors) - this should have been called by Game before changing state
    if (!planet.heightmap || !planet.heightLevelColors) {
      logger.error(
        `[SceneRenderer.drawSolidPlanetSurface] Surface data missing for ${planet.name}. Ensure ensureSurfaceReady was called.`
      );
      // Draw error state?
      return;
    }

    const map = planet.heightmap;
    const heightColors = planet.heightLevelColors;
    const mapSize = map.length;
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startMapX = Math.floor(player.surfaceX - viewCenterX);
    const startMapY = Math.floor(player.surfaceY - viewCenterY);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const mapX = startMapX + x;
        const mapY = startMapY + y;
        // Wrap coordinates for toroidal map
        const wrappedMapX = ((mapX % mapSize) + mapSize) % mapSize;
        const wrappedMapY = ((mapY % mapSize) + mapSize) % mapSize;

        // Get height value, clamping to valid range
        let height = map[wrappedMapY]?.[wrappedMapX] ?? 0;
        height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height)));

        // Get color for the height level
        const terrainColor = heightColors[height] || '#FF00FF'; // Fallback pink

        // Draw terrain block
        this.screenBuffer.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor);
      }
    }

    // Draw player character at the center
    this.screenBuffer.drawChar(
      player.char, viewCenterX, viewCenterY, CONFIG.PLAYER_COLOR, null
    );

    // Draw heightmap legend
    this.drawHeightmapLegend(planet);
  }

  /** Draws the "surface" view for a gas giant. */
  private drawGasGiantSurface(player: Player, planet: Planet): void {
    logger.debug(
      `[SceneRenderer.drawGasGiantSurface] Drawing atmospheric view: ${planet.name}`
    );
    // Ensure palette cache is ready - should have been called by Game
    if (!planet.rgbPaletteCache) {
      logger.error(
        `[SceneRenderer.drawGasGiantSurface] RGB Palette cache missing for ${planet.name}.`
      );
      return;
    }

    const palette = planet.rgbPaletteCache;
    const numColors = palette.length;
    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    // Use a static PRNG for consistent visuals per planet
    const staticPrng = planet.systemPRNG.seedNew("gas_surface_static");

    for (let y = 0; y < rows; y++) {
      const baseColorIndex = Math.floor((y / rows) * numColors);
      const color1 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex))];
      const color2 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex + 1))];

      for (let x = 0; x < cols; x++) {
        // Combine noise and sine waves for swirling effect
        const interpFactor =
          (staticPrng.random() +
            Math.sin(x * 0.1 + y * 0.05 + staticPrng.random() * 5) * 0.3 +
            0.5) % 1.0;
        const bandColor = interpolateColour(
          color1, color2, Math.max(0, Math.min(1, interpFactor))
        );

        // Add brightness variation
        const brightness = 0.8 + staticPrng.random() * 0.4;
        const finalColorRgb = adjustBrightness(bandColor, brightness);
        const finalColorHex = rgbToHex(finalColorRgb.r, finalColorRgb.g, finalColorRgb.b);

        // Choose a shade character
        const char = staticPrng.choice([
          GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK, ' '
        ])!;

        this.screenBuffer.drawChar(char, x, y, finalColorHex, finalColorHex);
      }
    }

    // Draw player
    this.screenBuffer.drawChar(
      player.char, Math.floor(cols / 2), Math.floor(rows / 2), CONFIG.PLAYER_COLOR, null
    );
  }

  /** Draws the view when docked inside a starbase. */
  private drawStarbaseInterior(player: Player, starbase: Starbase): void {
    logger.debug(
      `[SceneRenderer.drawStarbaseInterior] Drawing interior: ${starbase.name}`
    );
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();

    // Draw background box
    this.drawingContext.drawBox(0, 0, cols, rows, CONFIG.STARBASE_COLOR, null, ' ', null, '#111111');

    // Draw text elements
    this.screenBuffer.drawString('== Starbase Docking Bay ==', 5, 3, CONFIG.STARBASE_COLOR, null);
    this.screenBuffer.drawString('Services:', 5, 6, CONFIG.DEFAULT_FG_COLOR, null);
    this.screenBuffer.drawString(
      `- [${CONFIG.KEY_BINDINGS.TRADE.toUpperCase()}] Trade Commodities`, 7, 8, CONFIG.DEFAULT_FG_COLOR, null
    );
    this.screenBuffer.drawString(
      `- [${CONFIG.KEY_BINDINGS.REFUEL.toUpperCase()}] Refuel Ship`, 7, 9, CONFIG.DEFAULT_FG_COLOR, null
    );
    this.screenBuffer.drawString(
      `Press [${CONFIG.KEY_BINDINGS.ACTIVATE_LAND_LIFTOFF.toUpperCase()}] to depart.`, 5, 12, CONFIG.DEFAULT_FG_COLOR, null
    );

    // Draw player
    this.screenBuffer.drawChar(
      player.char, Math.floor(cols / 2), Math.floor(rows / 2), CONFIG.PLAYER_COLOR, null
    );
  }

  /** Draws a legend for the heightmap colors on the planet surface view. */
  private drawHeightmapLegend(planet: Planet): void {
    if (!planet.heightLevelColors || planet.heightLevelColors.length === 0) return;

    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    const legendWidth = 1;
    const legendHeight = Math.min(rows - 2, 20); // Max height 20 or available rows
    const startX = cols - legendWidth - 1; // Right edge
    const startY = Math.floor((rows - legendHeight) / 2); // Centered vertically
    const numColors = planet.heightLevelColors.length;

    for (let i = 0; i < legendHeight; i++) {
      // Map legend bar position to color index
      const colorIndex = Math.floor(((i / (legendHeight - 1)) * (numColors - 1)));
      const color = planet.heightLevelColors[colorIndex] || '#FF00FF'; // Fallback pink

      // Draw swatch block
      for (let w = 0; w < legendWidth; ++w) {
        this.screenBuffer.drawChar(GLYPHS.BLOCK, startX + w, startY + i, color, color);
      }
    }
    // Optional min/max labels
    this.screenBuffer.drawString("High", startX - 4, startY, CONFIG.DEFAULT_FG_COLOR, null);
    this.screenBuffer.drawString("Low", startX - 3, startY + legendHeight - 1, CONFIG.DEFAULT_FG_COLOR, null);
  }
}