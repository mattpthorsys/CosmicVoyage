// src/rendering/scene_renderer.ts
// Complete file including moon rendering logic.

import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS, SPECTRAL_TYPES, PLANET_TYPES, ELEMENTS } from '../constants'; // Removed SPECTRAL_DISTRIBUTION, added ELEMENTS
import { fastHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { adjustBrightness, hexToRgb, interpolateColour, rgbToHex, RgbColour } from './colour'; // Added RgbColour import

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

  /** Draws the hyperspace view (stars, nebulae). */
  drawHyperspace(player: Player, gameSeedPRNG: PRNG): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    // Use position component for world coordinates
    const startWorldX = player.position.worldX - viewCenterX;
    const startWorldY = player.position.worldY - viewCenterY;
    const baseSeedInt = gameSeedPRNG.seed; // Use the raw seed number

    const starPresenceThreshold = Math.floor(
      CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE
    );

    for (let viewY = 0; viewY < rows; viewY++) {
      for (let viewX = 0; viewX < cols; viewX++) {
        const worldX = startWorldX + viewX;
        const worldY = startWorldY + viewY;

        // Get background color considering nebula effect
        const finalBg = this.nebulaRenderer.getBackgroundColor(worldX, worldY);

        // Check for star presence using hash
        const hash = fastHash(worldX, worldY, baseSeedInt);
        const isStarCell = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (isStarCell) {
          // Generate star details using a PRNG seeded for this specific star location
          const starSeed = `star_${worldX},${worldY}`;
          const starPRNG = gameSeedPRNG.seedNew(starSeed); // Use seedNew for deterministic sub-PRNG
          const starType = starPRNG.choice(Object.keys(SPECTRAL_TYPES))!; // Choose from available types
          const starInfo = SPECTRAL_TYPES[starType];

          if (starInfo) {
            // Add slight brightness variation based on hash
            const brightnessFactor = 1.0 + ((hash % 100) / 500.0 - 0.1); // Small variation
            const starBaseRgb = hexToRgb(starInfo.colour);
            const finalStarRgb = adjustBrightness(starBaseRgb, brightnessFactor);
            const finalStarHex = rgbToHex(finalStarRgb.r, finalStarRgb.g, finalStarRgb.b);

            // Draw star character with calculated color, transparent background
            this.screenBuffer.drawChar(starInfo.char, viewX, viewY, finalStarHex, null);
          } else {
            logger.error(`[SceneRenderer.drawHyperspace] Could not find star info for type "${starType}".`);
            // Draw fallback character if star info is missing
            this.screenBuffer.drawChar('?', viewX, viewY, '#FF00FF', null); // Magenta '?'
          }
        } else {
          // No star, just draw the nebula background (or default black if no nebula)
          // Use null character and foreground, let background color fill the cell
          this.screenBuffer.drawChar(null, viewX, viewY, null, finalBg);
        }
      }
    }

    // Draw player character on top, using render component data
    this.screenBuffer.drawChar(
      player.render.char,
      viewCenterX,
      viewCenterY,
      player.render.fgColor,
      null // Player has transparent background in hyperspace
    );
  }

  /** Draws the scrolling star background for the system view. */
  drawStarBackground(player: Player, backgroundBuffer: ScreenBuffer): void {
    const cols = backgroundBuffer.getCols();
    const rows = backgroundBuffer.getRows();
    if (cols <= 0 || rows <= 0) return;

    const baseBgSeed = `${CONFIG.SEED}_star_background`; // Use main game seed + context
    const baseBgPrng = new PRNG(baseBgSeed); // Use a separate PRNG for background

    // Clear the background buffer before drawing new stars
    backgroundBuffer.clear(false); // Clear internal buffer state, don't touch canvas pixels yet

    CONFIG.STAR_BACKGROUND_LAYERS.forEach((layer, layerIndex) => {
      // Use the drastically reduced factors from config
      const { factor: parallaxFactor, density, scale } = layer;

      // Calculate offset based on player's system position (now in meters)
      // The offset needs to be scaled appropriately for the parallax factor
      // Since system coords are huge, the effective offset calculation might need care
      // Let's scale the coordinate *before* applying the factor to avoid massive intermediate numbers
      const scaledPlayerX = player.position.systemX / (CONFIG.SYSTEM_VIEW_SCALE * 100); // Example scaling down
      const scaledPlayerY = player.position.systemY / (CONFIG.SYSTEM_VIEW_SCALE * 100); // Example scaling down

      // Offset now depends on scaled player coords and the layer's factor & scale
      const viewOffsetX = Math.floor(scaledPlayerX * parallaxFactor * scale);
      const viewOffsetY = Math.floor(scaledPlayerY * parallaxFactor * scale);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const starFieldX = x + viewOffsetX;
          const starFieldY = y + viewOffsetY;

          // Use PRNG seeded for this specific cell and layer
          const cellSeedString = `${baseBgSeed}_${layerIndex}_${starFieldX}_${starFieldY}`;
          // Use baseBgPrng.seedNew to ensure determinism based on position
          const cellPrng = baseBgPrng.seedNew(cellSeedString);
          const starCheck = cellPrng.random();

          if (starCheck < density) {
            const starChar = cellPrng.choice(CONFIG.STAR_BACKGROUND_CHARS)!;
            const starColor = cellPrng.choice(CONFIG.STAR_BACKGROUND_COLORS)!;
            // Draw directly to the background buffer with transparent background
            backgroundBuffer.drawChar(starChar, x, y, starColor, null);
          }
          // No need for an else clause if buffer was cleared initially
        }
      }
    });
  }


  /** Draws the solar system view, including moons. */
  drawSolarSystem(player: Player, system: SolarSystem): void {
    logger.debug(`[SceneRenderer.drawSolarSystem] Drawing system: ${system.name} (${system.starType})`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    // Use the scale factor configured for meters per cell
    const viewScale = CONFIG.SYSTEM_VIEW_SCALE; // Now represents meters/cell
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);

    // Calculate view boundaries in meters
    // Use player's system position component (in meters)
    const viewWorldStartX = player.position.systemX - viewCenterX * viewScale;
    const viewWorldStartY = player.position.systemY - viewCenterY * viewScale;

    // Clear main buffer (only internal state, background buffer was drawn separately)
    this.screenBuffer.clear(false);

    // --- Draw Star ---
    const starInfo = SPECTRAL_TYPES[system.starType];
    const starColor = starInfo?.colour || '#FFFFFF';
    // Calculate star's position on screen (center of system is 0,0 meters)
    const starViewX = Math.floor((0 - viewWorldStartX) / viewScale);
    const starViewY = Math.floor((0 - viewWorldStartY) / viewScale);

    // Determine star draw radius based on type (visual representation)
    let starRadius = 1; // Default size
    switch (system.starType) {
        case 'O': starRadius = 7; break;
        case 'B': starRadius = 6; break;
        case 'A': starRadius = 5; break;
        case 'F': starRadius = 4; break;
        case 'G': starRadius = 4; break;
        case 'K': starRadius = 3; break;
        case 'M': starRadius = 2; break;
    }
    logger.debug(`[SceneRenderer.drawSolarSystem] Star type ${system.starType}, using draw radius ${starRadius}`);
    // Draw star circle and orbit outline
    this.drawingContext.drawCircle(starViewX, starViewY, starRadius, GLYPHS.SHADE_DARK, starColor, starColor);
    this.drawingContext.drawOrbit(starViewX, starViewY, starRadius, GLYPHS.SHADE_MEDIUM, starColor, 0, 0, cols - 1, rows - 1);


    // --- Draw Planets AND Moons ---
    system.planets.forEach((planet) => {
      if (!planet) return;

      // --- Draw Planet Orbit ---
      // Convert planet orbit distance (meters) to screen radius
      const orbitViewRadius = Math.round(planet.orbitDistance / viewScale);
      if (orbitViewRadius > 1) {
        this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.ORBIT_COLOUR_MAIN, 0, 0, cols - 1, rows - 1);
      }

      // --- Draw Planet ---
      // Convert planet absolute position (meters) to screen coordinates
      const planetViewX = Math.floor((planet.systemX - viewWorldStartX) / viewScale);
      const planetViewY = Math.floor((planet.systemY - viewWorldStartY) / viewScale);
      const planetColor = PLANET_TYPES[planet.type]?.terrainColours[4] || '#CCCCCC';
      // Optional: Draw planet slightly larger if it has moons
      const planetDrawRadius = (planet.moons && planet.moons.length > 0) ? 1 : 0;
      this.drawingContext.drawCircle(planetViewX, planetViewY, planetDrawRadius, GLYPHS.PLANET_ICON, planetColor, null); // Null BG for transparency

      // --- Draw Moons (Nested Loop) ---
      if (planet.moons) {
        planet.moons.forEach(moon => {
          // Convert moon absolute position (meters) to screen coordinates
          const moonViewX = Math.floor((moon.systemX - viewWorldStartX) / viewScale);
          const moonViewY = Math.floor((moon.systemY - viewWorldStartY) / viewScale);
          // Check if moon is within view bounds before drawing
          if (moonViewX >= 0 && moonViewX < cols && moonViewY >= 0 && moonViewY < rows) {
            const moonColor = PLANET_TYPES[moon.type]?.terrainColours[6] || '#999999'; // Use a dimmer color
            // Draw moon as a simple character with transparent background
            this.screenBuffer.drawChar('.', moonViewX, moonViewY, moonColor, null); // Use '.' for moon
          }
        });
      } // --- End Moons ---
    }); // End planet loop

    // --- Draw Starbase ---
    if (system.starbase) {
      const sb = system.starbase;
      const orbitViewRadius = Math.round(sb.orbitDistance / viewScale); // Use meter distance
      if (orbitViewRadius > 1) {
        this.drawingContext.drawOrbit(starViewX, starViewY, orbitViewRadius, GLYPHS.ORBIT_CHAR, CONFIG.STARBASE_COLOUR, 0, 0, cols - 1, rows - 1);
      }
      // Convert starbase position (meters) to screen coordinates
      const sbViewX = Math.floor((sb.systemX - viewWorldStartX) / viewScale);
      const sbViewY = Math.floor((sb.systemY - viewWorldStartY) / viewScale);
      this.drawingContext.drawCircle(sbViewX, sbViewY, 0, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOUR, null); // Null BG
    }

    // --- Draw Player ---
    // Player is always at the center of the view
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      viewCenterX,
      viewCenterY,
      player.render.fgColor, // Use render component color
      null // Player has transparent background in system view
    );

    // --- Draw Minimap ---
    this.drawSystemMinimap(system, player); // Draw minimap last
  }

  /** Draws the minimap for the solar system view, including moons. */
  private drawSystemMinimap(system: SolarSystem, player: Player): void {
    const cols = this.screenBuffer.getCols();
    const mapWidth = Math.floor(cols * CONFIG.MINIMAP_SIZE_FACTOR);
    const mapHeight = mapWidth; // Keep it square
    if (mapWidth <= 0 || mapHeight <= 0) return;

    const mapStartX = cols - mapWidth - 1; // Top-right corner
    const mapStartY = 1;

    // System edgeRadius is already in meters
    const worldRadius_m = system.edgeRadius;
    // Calculate scale: meters per minimap cell
    const mapScale_m_per_cell = (2 * worldRadius_m) / Math.min(mapWidth, mapHeight);

    if (mapScale_m_per_cell <= 0 || !Number.isFinite(mapScale_m_per_cell)) {
      logger.warn(`[SceneRenderer.drawSystemMinimap] Invalid map scale: ${mapScale_m_per_cell}. Aborting minimap.`);
      return;
    }

    // Draw minimap border
    this.drawingContext.drawBox(mapStartX - 1, mapStartY - 1, mapWidth + 2, mapHeight + 2, '#888888', CONFIG.DEFAULT_BG_COLOUR);

    // Helper to convert world meters to minimap cell coordinates
    const worldToMinimap = (worldX_m: number, worldY_m: number): { x: number; y: number } | null => {
      // Center the map around (0,0) world coordinates
      const mapX = Math.floor(worldX_m / mapScale_m_per_cell + mapWidth / 2);
      const mapY = Math.floor(worldY_m / mapScale_m_per_cell + mapHeight / 2);
      // Check if within minimap bounds
      if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
        return { x: mapStartX + mapX, y: mapStartY + mapY };
      }
      return null; // Off the minimap
    };

    // Clear minimap area (draw background)
    for (let y = 0; y < mapHeight; ++y) {
      for (let x = 0; x < mapWidth; ++x) {
        this.screenBuffer.drawChar(null, mapStartX + x, mapStartY + y, null, CONFIG.DEFAULT_BG_COLOUR);
      }
    }

    // --- Draw Planets AND Moons on Minimap ---
    system.planets.forEach(p => {
      if (!p) return;
      const planetPos = worldToMinimap(p.systemX, p.systemY); // Use meter coordinates
      if (planetPos) {
        // Draw Planet
        const planetIcon = '.'; // Use dot for planets on minimap
        const planetColor = PLANET_TYPES[p.type]?.terrainColours[4] || '#CCCCCC';
        this.screenBuffer.drawChar(planetIcon, planetPos.x, planetPos.y, planetColor, CONFIG.DEFAULT_BG_COLOUR);

        // Draw Moons (optional, might be too cluttered)
        /* // Uncomment to draw moons on minimap
        if (p.moons) {
            p.moons.forEach(moon => {
                const moonPos = worldToMinimap(moon.systemX, moon.systemY); // Use absolute meter coords
                if (moonPos && (moonPos.x !== planetPos.x || moonPos.y !== planetPos.y)) {
                   const moonColor = PLANET_TYPES[moon.type]?.terrainColours[6] || '#777777';
                   this.screenBuffer.drawChar(',', moonPos.x, moonPos.y, moonColor, CONFIG.DEFAULT_BG_COLOUR); // Use comma
                }
            });
        }
        */
      }
    }); // End planet loop

    // --- Draw Star ---
    const starPos = worldToMinimap(0, 0); // Star at origin (0,0) meters
    if (starPos) {
      const starInfo = SPECTRAL_TYPES[system.starType];
      const starColor = starInfo?.colour || '#FFFFFF';
      this.screenBuffer.drawChar('*', starPos.x, starPos.y, starColor, CONFIG.DEFAULT_BG_COLOUR);
    }

    // --- Draw Starbase ---
    if (system.starbase) {
      const sbPos = worldToMinimap(system.starbase.systemX, system.starbase.systemY); // Use meter coords
      if (sbPos) {
        this.screenBuffer.drawChar(GLYPHS.STARBASE_ICON, sbPos.x, sbPos.y, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR);
      }
    }

    // --- Draw Player ---
    const playerPos = worldToMinimap(player.position.systemX, player.position.systemY); // Use meter coords
    if (playerPos) {
      this.screenBuffer.drawChar(
          player.render.char, // Use player's current character
          playerPos.x,
          playerPos.y,
          player.render.fgColor, // Use player's color
          CONFIG.DEFAULT_BG_COLOUR // Ensure background is drawn
       );
    }
  }


  /** Draws the surface view for planets or starbases. */
  drawPlanetSurface(player: Player, landedObject: Planet | Starbase): void {
    // Check the type of the landed object
    if (landedObject instanceof Planet) {
      // If it's a Planet, check its type for rendering specifics
      if (landedObject.type === 'GasGiant' || landedObject.type === 'IceGiant') {
        this.drawGasGiantSurface(player, landedObject);
      } else {
        this.drawSolidPlanetSurface(player, landedObject);
      }
    } else if (landedObject instanceof Starbase) {
      // If it's a Starbase, draw its interior
      this.drawStarbaseInterior(player, landedObject);
    } else {
      // Log an error if the object type is unknown or unexpected
      logger.error(
        `[SceneRenderer.drawPlanetSurface] Unknown object type for surface rendering: ${typeof landedObject}`
      );
      // Optionally draw an error message to the screen
      this.screenBuffer.clear(true);
      this.drawingContext.drawBox(0,0, this.screenBuffer.getCols(), this.screenBuffer.getRows(), '#FF0000', '#000000', 'E');
      this.screenBuffer.drawString("Error: Unknown object landed on!", 2, 2, '#FF0000', '#000000');
    }
  }

  /** Draws the surface of a solid planet. */
  private drawSolidPlanetSurface(player: Player, planet: Planet): void {
    logger.debug(`[SceneRenderer.drawSolidPlanetSurface] Rendering surface: ${planet.name} (${planet.type})`);
    // Use getters which handle lazy loading via ensureSurfaceReady
    const map = planet.heightmap;
    const heightColors = planet.heightLevelColors;
    const elementMap = planet.surfaceElementMap;

    // Check if essential data is available after trying to ensure it's ready
    if (!map || !heightColors || !elementMap) {
      logger.error(`[SceneRenderer.drawSolidPlanetSurface] Surface data missing after ensureSurfaceReady for ${planet.name}.`);
      // Draw error state or return
      this.screenBuffer.clear(true);
      this.drawingContext.drawBox(0,0, this.screenBuffer.getCols(), this.screenBuffer.getRows(), '#FF0000', '#000000', '!');
      this.screenBuffer.drawString(`Error: Surface data missing for ${planet.name}`, 2, 2, '#FF0000', '#000000');
      return;
    }

    const mapSize = map.length;
    if (mapSize <= 0) {
        logger.error(`[SceneRenderer.drawSolidPlanetSurface] Invalid map size (${mapSize}) for ${planet.name}.`);
        return;
    }

    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    // Use player's surface position component
    const startMapX = Math.floor(player.position.surfaceX - viewCenterX);
    const startMapY = Math.floor(player.position.surfaceY - viewCenterY);

    // Clear main buffer (internal state only)
    this.screenBuffer.clear(false);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const mapX = startMapX + x;
        const mapY = startMapY + y;
        // Wrap coordinates for toroidal map
        const wrappedMapX = ((mapX % mapSize) + mapSize) % mapSize;
        const wrappedMapY = ((mapY % mapSize) + mapSize) % mapSize;

        // --- Draw Terrain Block (Main Buffer) ---
        let height = map[wrappedMapY]?.[wrappedMapX] ?? 0;
        height = Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(height)));
        const terrainColor = heightColors[height] || '#FF00FF'; // Fallback color
        // Draw terrain first, filling the cell background
        this.screenBuffer.drawChar(GLYPHS.BLOCK, x, y, terrainColor, terrainColor);

        // --- Draw Element Overlay Directly to Main Buffer ---
        const elementKey = elementMap[wrappedMapY]?.[wrappedMapX];
        // Draw overlay only if element exists AND location hasn't been mined
        if (elementKey && elementKey !== '' && !planet.isMined(wrappedMapX, wrappedMapY)) {
          // Use a distinct overlay character and color (e.g., dark grey '%')
          // Draw it *over* the terrain block, making the terrain the effective background
          this.screenBuffer.drawChar(
            '%',            // Character for overlay
            x,              // Screen X
            y,              // Screen Y
            '#444444',      // Foreground: Dark Grey
            null            // Background: null (transparent - lets terrainColor show through)
          );
        }
      }
    }

    // Draw player character (on main buffer, should be drawn last within its cell)
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      viewCenterX,
      viewCenterY,
      player.render.fgColor, // Use render component color
      null // Player has transparent background on surface
    );
    // Draw heightmap legend (on main buffer)
    this.drawHeightmapLegend(planet);
  }

  /** Draws the "surface" view for a gas giant. */
  private drawGasGiantSurface(player: Player, planet: Planet): void {
    logger.debug(`[SceneRenderer.drawGasGiantSurface] Drawing atmospheric view: ${planet.name}`);
    // Use getter for palette cache
    const palette = planet.rgbPaletteCache;

    if (!palette) {
      logger.error(`[SceneRenderer.drawGasGiantSurface] RGB Palette cache missing for ${planet.name}.`);
       // Draw error state or return
      this.screenBuffer.clear(true);
      this.drawingContext.drawBox(0,0, this.screenBuffer.getCols(), this.screenBuffer.getRows(), '#FF00FF', '#000000', '?');
      this.screenBuffer.drawString(`Error: Palette missing for ${planet.name}`, 2, 2, '#FF00FF', '#000000');
      return;
    }

    const numColors = palette.length;
    if (numColors < 1) {
        logger.error(`[SceneRenderer.drawGasGiantSurface] RGB Palette cache is empty for ${planet.name}.`);
        return;
    }

    const rows = this.screenBuffer.getCols(); // Typo? Should be getRows()
    const cols = this.screenBuffer.getRows(); // Typo? Should be getCols()
    // Corrected:
    // const rows = this.screenBuffer.getRows();
    // const cols = this.screenBuffer.getCols();

    // Use a PRNG seeded specifically for gas giant visuals, derived from planet's PRNG
    const visualPrng = planet.systemPRNG.seedNew("gas_surface_visuals");

    // Clear main buffer (internal state only)
    this.screenBuffer.clear(false);

    for (let y = 0; y < rows; y++) {
      // Determine base colors for interpolation based on vertical position
      const baseColorIndex = Math.floor((y / rows) * (numColors -1)); // Ensure index stays within bounds
      const colour1 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex))];
      const colour2 = palette[Math.max(0, Math.min(numColors - 1, baseColorIndex + 1))];

      for (let x = 0; x < cols; x++) {
        // Use noise or other functions for horizontal variation and swirling effects
        // Example using sine waves and PRNG for variation:
        const interpFactor = (visualPrng.random() + Math.sin(x * 0.1 + y * 0.05 + visualPrng.random() * Math.PI * 2) * 0.4 + 0.5) % 1.0;
        const bandColor = interpolateColour(colour1, colour2, Math.max(0, Math.min(1, interpFactor)));

        // Add brightness variation
        const brightness = 0.8 + visualPrng.random() * 0.4; // Random brightness flicker/variation
        const finalColorRgb = adjustBrightness(bandColor, brightness);
        const finalColorHex = rgbToHex(finalColorRgb.r, finalColorRgb.g, finalColorRgb.b);

        // Choose a character for texture
        const char = visualPrng.choice([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK, ' '])!;

        // Draw the cell, filling background with the same color
        this.screenBuffer.drawChar(char, x, y, finalColorHex, finalColorHex);
      }
    }

    // Draw player character centered
    this.screenBuffer.drawChar(
      player.render.char,
      Math.floor(cols / 2),
      Math.floor(rows / 2),
      player.render.fgColor,
      null // Player has transparent background over gas giant clouds
    );
  }

  /** Draws the view when docked inside a starbase. */
  private drawStarbaseInterior(player: Player, starbase: Starbase): void {
    logger.debug(`[SceneRenderer.drawStarbaseInterior] Drawing interior: ${starbase.name}`);
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();

    // Clear main buffer (internal state only)
    this.screenBuffer.clear(false);

    // Draw docking bay box and text
    this.drawingContext.drawBox(0, 0, cols, rows, CONFIG.STARBASE_COLOUR, CONFIG.DEFAULT_BG_COLOUR, ' '); // Fill with space
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

    // Draw player character centered
    this.screenBuffer.drawChar(
      player.render.char, // Use render component char
      Math.floor(cols / 2),
      Math.floor(rows / 2),
      player.render.fgColor, // Use render component color
      null // Player has transparent background inside starbase
    );
  }

  /** Draws a legend for the heightmap colours on the planet surface view. */
  private drawHeightmapLegend(planet: Planet): void {
    // Use getter for height colors
    const heightColors = planet.heightLevelColors;
    if (!heightColors || heightColors.length === 0) return; // Don't draw if no colors

    const rows = this.screenBuffer.getRows();
    const cols = this.screenBuffer.getCols();
    const legendWidth = 1; // Width of the legend bar in cells
    const legendHeight = Math.min(rows - 4, 20); // Max height, leaving space top/bottom
    const startX = cols - legendWidth - 2; // Position from right edge
    const startY = Math.floor((rows - legendHeight) / 2); // Center vertically
    const numColors = heightColors.length;

    // Draw the color bar
    for (let i = 0; i < legendHeight; i++) {
      // Map legend bar position (0 to legendHeight-1) to color index (0 to numColors-1)
      const colourIndex = Math.floor(((i / (legendHeight - 1)) * (numColors - 1)));
      const colour = heightColors[Math.max(0, Math.min(numColors - 1, colourIndex))] || '#FF00FF'; // Clamp index safely
      for (let w = 0; w < legendWidth; ++w) {
        this.screenBuffer.drawChar(GLYPHS.BLOCK, startX + w, startY + i, colour, colour); // Fill cell
      }
    }

    // Draw labels (with transparent background)
    this.screenBuffer.drawString("High", startX - 4, startY, CONFIG.DEFAULT_FG_COLOUR, null);
    this.screenBuffer.drawString("Low", startX - 3, startY + legendHeight - 1, CONFIG.DEFAULT_FG_COLOUR, null);
  }
} // End SceneRenderer class
