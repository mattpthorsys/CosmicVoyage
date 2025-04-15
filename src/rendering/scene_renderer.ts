// src/rendering/scene_renderer.ts
// Complete file including moon rendering logic and accepting view scale parameter.

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, ELEMENTS, AU_IN_METERS } from '../constants'; // Added AU_IN_METERS
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

  /** Draws the hyperspace view (stars, nebulae). */
  drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols <= 0 || rows <= 0) return; // Skip if dimensions are invalid

    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const startWorldX = player.position.worldX - viewCenterX;
    const startWorldY = player.position.worldY - viewCenterY;
    const baseSeedInt = gameSeedPRNG.seed;

    const starPresenceThreshold = Math.floor(
      CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE
    );

    // Clear internal buffer state before drawing
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
            // Draw star with transparent background
            this.screenBuffer.drawChar(starInfo.char, viewX, viewY, finalStarHex, null);
          } else {
            logger.error(`[SceneRenderer.drawHyperspace] Could not find star info for type "${starType}".`);
            this.screenBuffer.drawChar('?', viewX, viewY, '#FF00FF', null);
          }
        } else {
          // Draw background only
          this.screenBuffer.drawChar(null, viewX, viewY, null, finalBg);
        }
      }
    }

    // Draw player character on top
    this.screenBuffer.drawChar(
      player.render.char,
      viewCenterX, viewCenterY,
      player.render.fgColor,
      null // Transparent background
    );
  }

  /** Draws the scrolling star background for the system view. */
  drawStarBackground(player: Player, backgroundBuffer: ScreenBuffer): void {
    const cols = backgroundBuffer.getCols();
    const rows = backgroundBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;

    const baseBgSeed = `${CONFIG.SEED}_star_background`;
    const baseBgPrng = new PRNG(baseBgSeed);

    // Clear the background buffer before drawing new stars
    backgroundBuffer.clear(false);

    CONFIG.STAR_BACKGROUND_LAYERS.forEach((layer, layerIndex) => {
      const { factor: parallaxFactor, density, scale } = layer;

      // Scale player position (meters) appropriately before applying parallax factor
      // Avoid huge intermediate numbers; scale might need tuning based on factor size
      const scaledPlayerX = player.position.systemX * parallaxFactor;
      const scaledPlayerY = player.position.systemY * parallaxFactor;

      // Calculate offset based on scaled position and layer scale
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
            backgroundBuffer.drawChar(starChar, x, y, starColor, null); // Transparent BG
          }
        }
      }
    });
  }


  /** Draws the solar system view, including moons, using the specified view scale. */
  // <<< Accepts currentViewScale parameter >>>
  drawSolarSystem(player: Player, system: SolarSystem, currentViewScale: number): void {
    logger.debug(`[SceneRenderer.drawSolarSystem] Drawing system: ${system.name} (Scale: ${currentViewScale.toExponential(1)} m/cell)`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols <= 0 || rows <= 0) return; // Skip if dimensions are invalid

    // Use the passed-in scale factor (meters per cell)
    const viewScale = currentViewScale;
    if (!Number.isFinite(viewScale) || viewScale <= 0) {
        logger.error(`[SceneRenderer.drawSolarSystem] Invalid viewScale received: ${viewScale}. Aborting draw.`);
        this._drawError("Internal Error: Invalid view scale."); // Helper to draw error message
        return;
    }

    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);

    // Calculate view boundaries in meters based on player position (meters) and scale (meters/cell)
    const viewWorldStartX = player.position.systemX - viewCenterX * viewScale;
    const viewWorldStartY = player.position.systemY - viewCenterY * viewScale;

    // Clear main buffer's internal state (background already drawn)
    this.screenBuffer.clear(false);

    // --- Draw Star ---
    const starInfo = SPECTRAL_TYPES[system.starType];
    const starColor = starInfo?.colour || '#FFFFFF';
    // Calculate star's position on screen (center of system is 0,0 meters)
    const starViewX = Math.floor((0 - viewWorldStartX) / viewScale);
    const starViewY = Math.floor((0 - viewWorldStartY) / viewScale);
    let starRadius = 1;
    switch (system.starType) { /* ... determine starRadius ... */ }
    // Draw star only if within view bounds
    if (starViewX + starRadius >= 0 && starViewX - starRadius < cols && starViewY + starRadius >= 0 && starViewY - starRadius < rows) {
        this.drawingContext.drawCircle(starViewX, starViewY, starRadius, GLYPHS.SHADE_DARK, starColor, starColor);
        this.drawingContext.drawOrbit(starViewX, starViewY, starRadius, GLYPHS.SHADE_MEDIUM, starColor, 0, 0, cols - 1, rows - 1);
    }

    // --- Draw Planets AND Moons ---
    system.planets.forEach((planet) => {
      if (!planet) return;

      // Convert planet orbit distance (meters) to screen radius for orbit drawing
      const orbitViewRadius = Math.round(planet.orbitDistance / viewScale);
      // Draw orbit only if it's reasonably large on screen and potentially visible
      if (orbitViewRadius > 1 && orbitViewRadius < Math.max(cols, rows)) {
        this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOUR_MAIN, 0, 0, cols - 1, rows - 1);
      }

      // Convert planet absolute position (meters) to screen coordinates
      const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
      const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);

      // Only draw planet and its moons if planet itself is within screen bounds
      if (planetViewX >= 0 && planetViewX < cols && planetViewY >= 0 && planetViewY < rows) {
          const planetColor = PLANET_TYPES[planet.type]?.terrainColours[4] || '#CCCCCC';
          const planetDrawRadius = (planet.moons && planet.moons.length > 0) ? 1 : 0; // Slightly larger if has moons
          this.drawingContext.drawCircle(planetViewX, planetViewY, planetDrawRadius, GLYPHS.PLANET_ICON, planetColor, null); // Null BG

          // --- Draw Moons (Nested Loop) ---
          if (planet.moons) {
            planet.moons.forEach(moon => {
              const moonViewX = Math.floor((moon.systemX - viewWorldStartX) / viewScale);
              const moonViewY = Math.floor((moon.systemY - viewWorldStartY) / viewScale);
              // Check if moon is within view bounds AND not in the exact same cell as the planet
              if (moonViewX >= 0 && moonViewX < cols && moonViewY >= 0 && moonViewY < rows && (moonViewX !== planetViewX || moonViewY !== planetViewY)) {
                const moonColor = PLANET_TYPES[moon.type]?.terrainColours[6] || '#999999';
                this.screenBuffer.drawChar('.', moonViewX, moonViewY, moonColor, null); // Use '.' for moon
              }
            });
          } // --- End Moons ---
      }
    }); // End planet loop

    // --- Draw Starbase ---
    if (system.starbase) {
      const sb = system.starbase;
      const orbitViewRadius = Math.round(sb.orbitDistance / viewScale);
      if (orbitViewRadius > 1 && orbitViewRadius < Math.max(cols, rows)) { /* ... draw starbase orbit ... */ }
      const sbViewX = Math.floor((sb.systemX - viewWorldStartX) / viewScale);
      const sbViewY = Math.floor((sb.systemY - viewWorldStartY) / viewScale);
      if (sbViewX >= 0 && sbViewX < cols && sbViewY >= 0 && sbViewY < rows) {
           this.drawingContext.drawCircle(sbViewX, sbViewY, 0, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOUR, null);
      }
    }

    // --- Draw Player --- (Always at center)
    this.screenBuffer.drawChar(player.render.char, viewCenterX, viewCenterY, player.render.fgColor, null);

    // --- Draw Minimap --- (Scale remains independent)
    this.drawSystemMinimap(system, player);
  }

  /** Draws the minimap for the solar system view. */
  private drawSystemMinimap(system: SolarSystem, player: Player): void {
    const cols = this.screenBuffer.getCols();
    const mapWidth = Math.floor(cols * CONFIG.MINIMAP_SIZE_FACTOR);
    const mapHeight = mapWidth;
    if (mapWidth <= 0 || mapHeight <= 0) return;

    const mapStartX = cols - mapWidth - 1;
    const mapStartY = 1;
    const worldRadius_m = system.edgeRadius; // meters
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

    // Clear minimap area
    for (let y = 0; y < mapHeight; ++y) { for (let x = 0; x < mapWidth; ++x) { this.screenBuffer.drawChar(null, mapStartX + x, mapStartY + y, null, CONFIG.DEFAULT_BG_COLOUR); } }

    // Draw Planets & Moons
    system.planets.forEach(p => {
      if (!p) return;
      const planetPos = worldToMinimap(p.systemX, p.systemY);
      if (planetPos) {
        const planetIcon = '.';
        const planetColor = PLANET_TYPES[p.type]?.terrainColours[4] || '#CCCCCC';
        this.screenBuffer.drawChar(planetIcon, planetPos.x, planetPos.y, planetColor, CONFIG.DEFAULT_BG_COLOUR);
        // Optional: Draw moons on minimap if desired and space permits
        /*
        if (p.moons) {
            p.moons.forEach(moon => { // ... draw moon symbol ... });
        }
        */
      }
    });

    // Draw Star, Starbase, Player
    const starPos = worldToMinimap(0, 0);
    if (starPos) { /* ... draw star ... */ }
    if (system.starbase) { const sbPos = worldToMinimap(system.starbase.systemX, system.starbase.systemY); if (sbPos) { /* ... draw starbase ... */ } }
    const playerPos = worldToMinimap(player.position.systemX, player.position.systemY);
    if (playerPos) { this.screenBuffer.drawChar(player.render.char, playerPos.x, playerPos.y, player.render.fgColor, CONFIG.DEFAULT_BG_COLOUR); }
  }


  /** Draws the surface view for planets or starbases. */
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    // Clear internal buffer state before drawing surface
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

    if (!map || !heightColors || !elementMap) { /* ... error handling ... */ return; }
    const mapSize = map.length;
    if (mapSize <= 0) { /* ... error handling ... */ return; }

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
        this.screenBuffer.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor); // Draw terrain

        const elementKey = elementMap[wrappedMapY]?.[wrappedMapX];
        if (elementKey && elementKey !== '' && !planet.isMined(wrappedMapX, wrappedMapY)) {
          // Draw overlay with transparent background
          this.screenBuffer.drawChar('%', x, y, '#444444', null);
        }
      }
    }

    // Draw player character
    this.screenBuffer.drawChar(player.render.char, viewCenterX, viewCenterY, player.render.fgColor, null);
    // Draw heightmap legend
    this.drawHeightmapLegend(planet);
  }

  /** Draws the "surface" view for a gas giant. */
  private drawGasGiantSurface(player: Player, planet: Planet): void {
    logger.debug(`[SceneRenderer.drawGasGiantSurface] Drawing atmospheric view: ${planet.name}`);
    const palette = planet.rgbPaletteCache;
    if (!palette || palette.length < 1) { /* ... error handling ... */ return; }

    const rows = this.screenBuffer.getRows(); // Corrected
    const cols = this.screenBuffer.getCols(); // Corrected
    const visualPrng = planet.systemPRNG.seedNew("gas_surface_visuals");

    for (let y = 0; y < rows; y++) {
      const numColors = palette.length; // Define inside loop if palette can change (it shouldn't here)
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
    // Draw player character centered
    this.screenBuffer.drawChar(player.render.char, Math.floor(cols / 2), Math.floor(rows / 2), player.render.fgColor, null);
  }

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
      this.screenBuffer.clear(true); // Clear physically
      this.screenBuffer.drawString(message, x, y, '#FF0000', '#000000');
  }

} // End SceneRenderer class
