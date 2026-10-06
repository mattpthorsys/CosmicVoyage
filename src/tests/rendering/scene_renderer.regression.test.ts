import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { SceneRenderer } from '../../rendering/scene_renderer';
import { DrawingContext } from '../../rendering/drawing_context';
import { CellFont, ScreenBuffer } from '../../rendering/screen_buffer';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { Player } from '../../core/player';
import type { OrbitStellarSource } from '../../core/orbit_ui';
import type { TextModalTableModel } from '../../core/text_ui';
import { MissionJournal } from '../../core/mission_journal';
import { ShipRepairConsole } from '../../core/ship_repair_console';
import { StarbaseController } from '../../core/starbase_controller';
import { SurfaceEncounterController } from '../../core/modes/surface_encounter_controller';
import { XenobiologyService } from '../../core/xenobiology_service';
import { SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import { ethologyFixture } from '../fixtures/ethology';
import { getStarbaseShipyardProfile } from '../../core/ship_modifications';
import { Planet } from '../../entities/planet';
import { Starbase } from '../../entities/starbase';
import { SolarSystem } from '../../entities/solar_system';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { AU_IN_METERS, GLYPHS } from '../../constants';
import { TEXT_PALETTE } from '../../rendering/text_palette';
import { hexToRgb } from '../../rendering/colour';
import {
  createOrbitAtmosphere,
  sampleOrbitAtmospherePixelTransfer,
} from '../../rendering/scenes/orbit_atmosphere';
import type { OrbitAtmosphere } from '../../rendering/scenes/orbit_atmosphere';
import type { OrbitAtmosphereSampler } from '../../rendering/scenes/orbit_atmosphere_sampler';
import {
  ORBIT_CAMERA_DISTANCE,
  orbitSunDirection,
  projectOrbitSource,
} from '../../rendering/scenes/orbit_lighting';
import {
  GiantAtmosphereRenderer,
  GiantVisualProfile,
} from '../../rendering/scenes/giant_atmosphere_renderer';

type DrawCall = {
  char: string | null;
  x: number;
  y: number;
  fg: string | null | undefined;
  bg: string | null | undefined;
  scaleX?: number;
  scaleY?: number;
  font?: CellFont;
};

/** Creates mock screen buffer. */
function createMockScreenBuffer(
  cols: number,
  rows: number
): { buffer: ScreenBuffer; drawCalls: DrawCall[]; stagedFrames: readonly unknown[][] } {
  const drawCalls: DrawCall[] = [];
  const stagedFrames: unknown[][] = [];
  const buffer = {
    clear: vi.fn(),
    stageCells: vi.fn((cells: readonly unknown[]) => {
      stagedFrames.push(cells.slice());
    }),
    drawChar: vi.fn(
      (
        char: string | null,
        x: number,
        y: number,
        fg?: string | null,
        bg?: string | null,
        font?: CellFont
      ) => {
        drawCalls.push({ char, x, y, fg, bg, font });
      }
    ),
    drawScaledChar: vi.fn(
      (
        char: string | null,
        x: number,
        y: number,
        fg?: string | null,
        bg?: string | null,
        scaleX?: number,
        scaleY?: number
      ) => {
        drawCalls.push({ char, x, y, fg, bg, scaleX, scaleY });
      }
    ),
    occludeScaledGlyphs: vi.fn(),
    drawString: vi.fn(
      (text: string, x: number, y: number, fg?: string | null, bg?: string | null, font?: CellFont) => {
        for (let index = 0; index < text.length; index++) {
          drawCalls.push({ char: text[index], x: x + index, y, fg, bg, font });
        }
      }
    ),
    getCols: vi.fn(() => cols),
    getRows: vi.fn(() => rows),
    getDefaultFgColor: vi.fn(() => CONFIG.DEFAULT_FG_COLOUR),
    getDefaultBgColor: vi.fn(() => CONFIG.DEFAULT_BG_COLOUR),
  } as unknown as ScreenBuffer;

  return { buffer, drawCalls, stagedFrames };
}

/** Creates scene renderer. */
function createSceneRenderer(buffer: ScreenBuffer): SceneRenderer {
  return new SceneRenderer(
    buffer,
    new DrawingContext(buffer),
    new NebulaRenderer(),
    {} as SystemDataGenerator
  );
}

/** Creates solid planet. */
function createSolidPlanet(): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: 'Regression I' },
    type: { value: 'Rock' },
    heightmap: { value: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 4)) },
    heightLevelColors: {
      value: Array.from(
        { length: CONFIG.PLANET_HEIGHT_LEVELS },
        (_, index) => `#${index.toString(16).padStart(2, '0')}4040`
      ),
    },
    surfaceElementMap: { value: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '')) },
    isMined: { value: () => false },
  });
  return planet;
}

/** Creates gas giant planet. */
function createGasGiantPlanet(): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: 'Regression Jovian' },
    type: { value: 'GasGiant' },
    rgbPaletteCache: {
      value: [
        { r: 64, g: 50, b: 38 },
        { r: 142, g: 104, b: 67 },
        { r: 214, g: 176, b: 118 },
        { r: 248, g: 231, b: 187 },
      ],
    },
    surfaceTemp: { value: 430 },
    orbitDistance: { value: 7.5e10 },
    gravity: { value: 2.4 },
    orbitAngle: { value: 1.2 },
    systemPRNG: { value: new PRNG('regression-jovian') },
  });
  return planet;
}

/** Creates ice giant planet. */
function createIceGiantPlanet(
  name = 'Regression Ice Giant',
  surfaceTemp = 78,
  orbitDistance = 2.9e12
): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: name },
    type: { value: 'IceGiant' },
    rgbPaletteCache: {
      value: [
        { r: 74, g: 142, b: 160 },
        { r: 112, g: 190, b: 205 },
        { r: 170, g: 228, b: 230 },
        { r: 92, g: 168, b: 190 },
      ],
    },
    surfaceTemp: { value: surfaceTemp },
    orbitDistance: { value: orbitDistance },
    gravity: { value: 1.1 },
    orbitAngle: { value: 0.7 },
    systemPRNG: { value: new PRNG(`${name}-seed`) },
  });
  return planet;
}

/** Creates orbit planet. */
function createOrbitPlanet(): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: 'Regression Orbit I' },
    type: { value: 'Rock' },
    heightmap: {
      value: Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => (x + y) % 8)),
    },
    heightLevelColors: {
      value: Array.from(
        { length: CONFIG.PLANET_HEIGHT_LEVELS },
        (_, index) => `#${index.toString(16).padStart(2, '0')}7050`
      ),
    },
    diameter: { value: 11000 },
    density: { value: 5.1 },
    gravity: { value: 0.95 },
    surfaceTemp: { value: 288 },
    axialTilt: { value: 0.23 },
    orbitalInclination: { value: 0.03 },
    tidallyLocked: { value: false },
    moons: { value: [] },
    getCurrentTemperature: { value: () => 291 },
  });
  return planet;
}

/** Creates atmospheric orbit planet. */
function createAtmosphericOrbitPlanet(): Planet {
  const planet = createOrbitPlanet();
  Object.defineProperty(planet, 'atmosphere', {
    value: {
      density: 'Dense',
      pressure: 1.1,
      composition: { Nitrogen: 72, Oxygen: 21, Argon: 4, 'Water Vapor': 3 },
    },
  });
  return planet;
}

/** Creates featureless orbit planet. */
function createFeaturelessOrbitPlanet(colour: string = '#B8B8B8', pressure = 0): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: 'Featureless Regression' },
    type: { value: 'Rock' },
    heightmap: { value: Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => 4)) },
    heightLevelColors: { value: Array.from({ length: CONFIG.PLANET_HEIGHT_LEVELS }, () => colour) },
    diameter: { value: 11000 },
    density: { value: 5.1 },
    gravity: { value: 0.95 },
    surfaceTemp: { value: 288 },
    axialTilt: { value: 0.23 },
    orbitalInclination: { value: 0.03 },
    tidallyLocked: { value: false },
    moons: { value: [] },
    atmosphere: { value: { density: pressure > 0 ? 'Thin' : 'None', pressure, composition: {} } },
    getCurrentTemperature: { value: () => 291 },
  });
  return planet;
}

/** Creates system. */
function createSystem(): SolarSystem {
  return {
    name: 'Regression',
    starType: 'G2V',
    architecture: {
      kind: 'single',
      stars: [],
      primaryStarId: 'A',
      binarySeparation: 0,
      outerSeparation: 0,
      habitableLabel: 'A',
    },
    stars: [
      {
        id: 'A',
        name: 'Regression A',
        starType: 'G2V',
        massKg: 1.98847e30,
        radiusM: 6.957e8,
        luminosityW: 3.828e26,
        systemX: 0,
        systemY: 0,
        orbit: null,
        environment: { starType: 'G2V', ageGyr: 4.6, metallicityFeH: 0 },
      },
    ],
    planets: [],
    starbase: null,
    stations: [],
    navigationMarkers: [],
    starX: 0,
    starY: 0,
    systemSlot: 0,
    edgeRadius: 5e12,
    getOrbitCenter: () => ({ x: 0, y: 0 }),
    getNearestStar: () => ({
      id: 'A',
      name: 'Regression A',
      starType: 'G2V',
      massKg: 1.98847e30,
      radiusM: 6.957e8,
      luminosityW: 3.828e26,
      systemX: 0,
      systemY: 0,
      orbit: null,
      environment: { starType: 'G2V', ageGyr: 4.6, metallicityFeH: 0 },
    }),
  } as unknown as SolarSystem;
}

/** Creates render signature. */
function createRenderSignature(drawCalls: DrawCall[]): {
  totalCalls: number;
  chars: Record<string, number>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const chars: Record<string, number> = {};
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const call of drawCalls) {
    const key = call.char ?? '<null>';
    chars[key] = (chars[key] ?? 0) + 1;
    minX = Math.min(minX, call.x);
    minY = Math.min(minY, call.y);
    maxX = Math.max(maxX, call.x);
    maxY = Math.max(maxY, call.y);
  }

  return {
    totalCalls: drawCalls.length,
    chars: Object.fromEntries(Object.entries(chars).sort(([a], [b]) => a.localeCompare(b))),
    bounds: { minX, minY, maxX, maxY },
  };
}

/** Renders text rows. */
function renderTextRows(drawCalls: DrawCall[]): string[] {
  const rows = new Map<number, Map<number, string>>();
  for (const call of drawCalls) {
    if (call.char === null) continue;
    const row = rows.get(call.y) ?? new Map<number, string>();
    row.set(call.x, call.char);
    rows.set(call.y, row);
  }

  return Array.from(rows.entries())
    .sort(([a], [b]) => a - b)
    .map(([, row]) => {
      const maxX = Math.max(...row.keys());
      let line = '';
      for (let x = 0; x <= maxX; x++) line += row.get(x) ?? ' ';
      return line.trimEnd();
    });
}

/** Returns the face of each character in a contiguous text draw. */
function fontsForText(drawCalls: DrawCall[], text: string): CellFont[] {
  for (let start = 0; start <= drawCalls.length - text.length; start++) {
    const cells = drawCalls.slice(start, start + text.length);
    if (cells.map((cell) => cell.char).join('') !== text) continue;
    if (!cells.every((cell, index) => cell.y === cells[0].y && cell.x === cells[0].x + index)) continue;
    return cells.map((cell) => cell.font ?? 'thick');
  }
  throw new Error(`Text not drawn: ${text}`);
}

/** Calculates approximate luminance for a hexadecimal colour. */
function hexLuma(hex: string | null | undefined): number {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex ?? '');
  if (!match) return 0;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Parses a hexadecimal colour into numeric RGB channels. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

describe('SceneRenderer visual regressions', () => {
  it.each([
    [40, 24],
    [120, 60],
  ])(
    'keeps the starting nebula visible and world-anchored through movement in a %ix%i view',
    (cols, rows) => {
      const { buffer, stagedFrames } = createMockScreenBuffer(cols, rows);
      const nebula = new NebulaRenderer();
      const generator = new SystemDataGenerator(new PRNG(CONFIG.SEED));
      const renderer = new SceneRenderer(buffer, new DrawingContext(buffer), nebula, generator);
      const player = new Player();
      renderer.drawHyperspace(player);
      const initial = stagedFrames.at(-1) as { bg: string; char: string | null }[];
      const light = initial.map((cell) => {
        const rgb = hexToRgb(cell.bg);
        return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
      });
      expect(Math.max(...light)).toBeGreaterThan(12);
      expect(light.filter((value) => value > 5).length).toBeGreaterThan(40);
      expect(light.filter((value) => value < 1.5).length).toBeGreaterThan(cols * rows * 0.6);
      expect(
        initial.some(
          (cell, index) => cell.char !== ' ' && cell.char !== player.render.char && light[index] > 5
        )
      ).toBe(true);
      player.position.worldX += 1;
      player.position.worldY += 1;
      renderer.drawHyperspace(player);
      const shifted = stagedFrames.at(-1) as { bg: string }[];
      for (let y = 0; y < rows - 1; y++) {
        for (let x = 0; x < cols - 1; x++) {
          expect(shifted[y * cols + x].bg).toBe(initial[(y + 1) * cols + x + 1].bg);
        }
      }
      renderer.clearCaches();
      nebula.clearCache();
      renderer.drawHyperspace(player);
      expect(stagedFrames.at(-1)).toEqual(shifted);
    }
  );

  it.each(['DA2', 'DC'])('fades %s across its detection boundary in both travel directions', (starType) => {
    const { buffer, stagedFrames } = createMockScreenBuffer(41, 9);
    const generator = {
      getSystemMapProperties: (x: number, y: number) => ({
        exists: x === 17 && y === 0,
        starType,
        name: 'Cool remnant',
        hasStarbase: false,
        objectKind: 'stellar',
      }),
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const renderer = new SceneRenderer(buffer, new DrawingContext(buffer), new NebulaRenderer(), generator);
    const player = new Player();
    const contrasts: number[] = [];
    for (const worldX of [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]) {
      player.position.worldX = worldX;
      player.position.worldY = 0;
      renderer.drawHyperspace(player);
      const shifted = stagedFrames.at(-1) as { char: string | null; fg: string; bg: string }[];
      const contact = shifted[4 * 41 + 20 + 17 - worldX];
      expect(contact.char === ' ').toBe(Math.abs(17 - worldX) > CONFIG.MIN_STAR_DETECTION_RADIUS_CELLS);
      contrasts.push(contact.char === ' ' ? 0 : Math.abs(hexLuma(contact.fg) - hexLuma(contact.bg)));
      renderer.clearCaches();
      renderer.drawHyperspace(player);
      expect(stagedFrames.at(-1)).toEqual(shifted);
    }
    // A glyph's presence alone missed the original full-brightness pop at the horizon.
    expect(contrasts.slice(0, 2)).toEqual([0, 0]);
    expect(contrasts[2]).toBeGreaterThan(0);
    expect(contrasts[2]).toBeLessThan(contrasts[7] * 0.1);
    for (let i = 2; i <= 7; i++) expect(contrasts[i]).toBeGreaterThan(contrasts[i - 1]);
    expect(contrasts.slice(8)).toEqual(contrasts.slice(0, 7).reverse());
  });

  it('fades a distant contact as it enters and leaves the viewport', () => {
    const cols = 21;
    const { buffer, stagedFrames } = createMockScreenBuffer(cols, 21);
    const generator = {
      getSystemMapProperties: (x: number, y: number) => ({
        exists: x === 0 && y === -10,
        starType: 'T5',
        objectKind: 'brown-dwarf',
      }),
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const renderer = new SceneRenderer(buffer, new DrawingContext(buffer), new NebulaRenderer(), generator);
    const player = new Player();
    const contrasts: number[] = [];

    for (const offset of [0, 1, 2, 3, 4, 3, 2, 1, 0]) {
      player.position.worldY = -offset;
      renderer.drawHyperspace(player);
      const frame = stagedFrames.at(-1) as { char: string; fg: string; bg: string }[];
      const contact = frame[offset * cols + 10];
      expect(contact.char).not.toBe(' ');
      contrasts.push(Math.abs(hexLuma(contact.fg) - hexLuma(contact.bg)));
      renderer.clearCaches();
      renderer.drawHyperspace(player);
      expect(stagedFrames.at(-1)).toEqual(frame);
    }

    expect(contrasts[0]).toBe(0);
    for (let index = 1; index <= 4; index++) {
      expect(contrasts[index]).toBeGreaterThan(contrasts[index - 1]);
    }
    expect(contrasts.slice(5)).toEqual(contrasts.slice(0, 4).reverse());
  });

  it('keeps red and orange dwarfs visible across hyperspace travel frames', () => {
    const cols = 101;
    const rows = 15;
    const { buffer, stagedFrames } = createMockScreenBuffer(cols, rows);
    const generator = {
      getSystemMapProperties: (x: number, y: number) => ({
        exists: y === 0 && (x === -45 || x === 45),
        starType: x === -45 ? 'M9V' : 'K9V',
        objectKind: 'stellar',
      }),
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const renderer = new SceneRenderer(buffer, new DrawingContext(buffer), new NebulaRenderer(), generator);
    const player = new Player();

    for (const worldX of [0, 1, 2, 1, 0]) {
      player.position.worldX = worldX;
      renderer.drawHyperspace(player);
      const frame = stagedFrames.at(-1) as { char: string; fg: string; bg: string }[];
      for (const starX of [-45, 45]) {
        const contact = frame[7 * cols + 50 + starX - worldX];
        expect(contact.char).not.toBe(' ');
        expect(contact.fg).not.toBe(contact.bg);
      }
      renderer.clearCaches();
      renderer.drawHyperspace(player);
      expect(stagedFrames.at(-1)).toEqual(frame);
    }
  });

  it('refreshes fading brown and rogue contacts as their range changes in shifted frames', () => {
    const cols = 81;
    const rows = 9;
    const { buffer, stagedFrames } = createMockScreenBuffer(cols, rows);
    const generator = {
      getSystemMapProperties: (x: number, y: number) => ({
        exists: x === 35 && y === 0,
        starType: x === 35 && y === 0 ? 'T5' : null,
        objectKind: x === 35 && y === 0 ? 'brown-dwarf' : null,
      }),
      getDeepSpacePhenomenonProperties: (x: number, y: number) =>
        x === 30 && y === 0
          ? { exists: true, type: 'rogue-planet', char: 'o', colour: '#89C6C8' }
          : { exists: false },
    } as unknown as SystemDataGenerator;
    const nebula = new NebulaRenderer();
    const renderer = new SceneRenderer(buffer, new DrawingContext(buffer), nebula, generator);
    const player = new Player();
    const brownColours: Array<string | null> = [];
    const rogueColours: Array<string | null> = [];

    for (const worldX of [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]) {
      player.position.worldX = worldX;
      renderer.drawHyperspace(player);
      const shifted = stagedFrames.at(-1) as { char: string | null; fg: string | null }[];
      brownColours.push(shifted[4 * cols + 40 + 35 - worldX].fg);
      rogueColours.push(shifted[4 * cols + 40 + 30 - worldX].fg);
      renderer.clearCaches();
      renderer.drawHyperspace(player);
      expect(stagedFrames.at(-1)).toEqual(shifted);
    }

    expect(new Set(brownColours).size).toBeGreaterThan(1);
    expect(new Set(rogueColours).size).toBeGreaterThan(1);
    expect(brownColours.at(-1)).toBe(brownColours[0]);
    expect(rogueColours.at(-1)).toBe(rogueColours[0]);
  });

  it('shifts hyperspace frames by one-cell movement without rebuilding the full viewport', () => {
    const { buffer, stagedFrames } = createMockScreenBuffer(7, 5);
    let mapCalls = 0;
    const generator = {
      getSystemMapProperties: () => {
        mapCalls++;
        return { exists: false, starType: null, name: null, hasStarbase: false, objectKind: null };
      },
      getDeepSpacePhenomenonProperties: () => ({ exists: false }),
    } as unknown as SystemDataGenerator;
    const renderer = new SceneRenderer(buffer, new DrawingContext(buffer), new NebulaRenderer(), generator);
    const player = new Player();

    renderer.drawHyperspace(player);
    const firstStats = renderer.getLastHyperspaceRenderStats();
    const callsAfterFirstFrame = mapCalls;
    player.position.worldX += 1;
    renderer.drawHyperspace(player);
    const shiftedStats = renderer.getLastHyperspaceRenderStats();

    const shiftedCalls = mapCalls - callsAfterFirstFrame;
    const lastFrame = stagedFrames[stagedFrames.length - 1] as Array<{ char: string | null }>;
    const playerGlyphs = lastFrame.filter((cell) => cell.char === player.render.char);
    const centerCell = lastFrame[2 * 7 + 3];

    expect(callsAfterFirstFrame).toBe(35);
    expect(firstStats.mode).toBe('fresh');
    expect(firstStats.cells).toBe(35);
    expect(shiftedStats.mode).toBe('shifted');
    expect(shiftedCalls).toBeLessThanOrEqual(5);
    expect(playerGlyphs).toHaveLength(1);
    expect(centerCell.char).toBe(player.render.char);
  });

  it('draws subtle background stars during interplanetary travel', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(120, 60);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    player.position.systemX = 1.5e11;
    player.position.systemY = -7.5e10;

    renderer.drawSolarSystem(player, createSystem(), CONFIG.SYSTEM_VIEW_SCALE);

    const backgroundStars = drawCalls.filter(
      (call) =>
        call.char === GLYPHS.STAR_DIM && call.bg === CONFIG.DEFAULT_BG_COLOUR && typeof call.fg === 'string'
    );
    expect(backgroundStars.length).toBeGreaterThan(0);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('draws a compact neutron-star marker in the local frame', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(80, 40);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const seed = new PRNG(CONFIG.SEED);
    const generator = new SystemDataGenerator(seed);
    const props = generator.getNeutronStarSystemProperties(-72, -73);
    expect(props).not.toBeNull();
    const system = new SolarSystem(props!, -72, -73, seed);
    player.position.systemX = -0.2 * AU_IN_METERS;
    player.position.systemY = 0;

    renderer.drawSolarSystem(player, system, AU_IN_METERS / 15);

    expect(drawCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ char: '*', x: 43, y: 20, fg: '#AFC8FF' })])
    );
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
  });

  it('centres a depot orbit on its moving host rather than the system origin', () => {
    const { buffer } = createMockScreenBuffer(120, 60);
    const context = new DrawingContext(buffer);
    const drawOrbit = vi.spyOn(context, 'drawOrbit');
    const renderer = new SceneRenderer(buffer, context, new NebulaRenderer(), {} as SystemDataGenerator);
    const player = new Player();
    player.position.systemX = 0;
    player.position.systemY = 0;
    const scale = 1e10;
    const depot = new Starbase('hosted-depot', new PRNG('hosted-depot'), 'Regression', 'automated-depot');
    depot.orbitHost = { kind: 'circumbinary' };
    depot.orbitDistance = 5 * scale;
    depot.systemX = 15 * scale;
    depot.systemY = 4 * scale;
    const system = createSystem();
    Object.defineProperty(system, 'starbase', { value: depot });
    Object.defineProperty(system, 'stations', { value: [depot] });
    const getCentre = vi.spyOn(system, 'getOrbitCenter').mockReturnValue({ x: 10 * scale, y: 4 * scale });
    renderer.drawSolarSystem(player, system, scale);
    expect(getCentre).toHaveBeenCalledWith(depot.orbitHost);
    expect(drawOrbit).toHaveBeenCalledWith(
      70,
      34,
      5,
      GLYPHS.ORBIT_CHAR,
      CONFIG.STARBASE_COLOUR,
      0,
      0,
      119,
      59
    );
  });

  it('does not draw background stars while travelling on a planet surface', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    player.position.surfaceX = 8;
    player.position.surfaceY = 9;

    renderer.drawPlanetSurface(player, createSolidPlanet());

    expect(drawCalls.some((call) => call.char === GLYPHS.STAR_DIM)).toBe(false);
    expect(drawCalls.some((call) => call.char === GLYPHS.BLOCK)).toBe(true);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('does not paint the opposite hemisphere above a regional latitude boundary', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer),
      planet = createSolidPlanet();
    const player = new Player();
    player.position.surfaceY = 0;
    renderer.drawPlanetSurface(player, planet);
    const blocks = drawCalls.filter((call) => call.char === GLYPHS.BLOCK);
    expect(blocks.length).toBeGreaterThan(0);
    expect(Math.min(...blocks.map((call) => call.y))).toBeGreaterThan(1);
  });

  it('draws shared materials on the surface and refreshes landing colours when material data changes', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer) as any;
    const planet = createSolidPlanet();
    const materials = {
      width: 16,
      height: 16,
      sourceWidth: 16,
      sourceHeight: 16,
      indices: new Uint8Array(256),
      palette: ['#736454'],
      strength: 1,
    };
    Object.defineProperty(planet, 'materialMap', { value: materials });
    renderer.drawPlanetSurface(new Player(), planet);
    expect(drawCalls.some((call) => call.char === GLYPHS.BLOCK && call.bg === '#736454')).toBe(true);

    const first = renderer.getOrbitLandingMapColours(
      planet,
      planet.heightmap,
      planet.heightLevelColors,
      null,
      [],
      16,
      16,
      materials
    );
    expect(new Set(first)).toEqual(new Set(['#736454']));
    const replacement = { ...materials, palette: ['#ABCDEF'] };
    const next = renderer.getOrbitLandingMapColours(
      planet,
      planet.heightmap,
      planet.heightLevelColors,
      null,
      [],
      16,
      16,
      replacement
    );
    expect(new Set(next)).toEqual(new Set(['#ABCDEF']));
    expect(next).not.toBe(first);
  });

  it('renders gas giant surfaces with turbulent band and storm variation', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();

    renderer.drawPlanetSurface(player, createGasGiantPlanet());

    const atmosphericCells = drawCalls.filter((call) => call.bg && call.fg === call.bg);
    const uniqueColours = new Set(atmosphericCells.map((call) => call.bg));
    const shadeGlyphs = new Set<string>([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK]);
    const shadedCells = atmosphericCells.filter((call) => shadeGlyphs.has(call.char ?? ''));

    expect(uniqueColours.size).toBeGreaterThan(30);
    expect(shadedCells.length).toBeGreaterThan(200);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
  });

  it('uses distinct realistic texture profiles for gas and ice giants', () => {
    const { buffer } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer) as unknown as {
      sampleGiantPlanetTexture: (
        planet: Planet,
        u: number,
        v: number,
        lon: number,
        lat: number,
        phase: number
      ) => string;
    };
    const gas = createGasGiantPlanet();
    const ice = createIceGiantPlanet('Regression Uranian', 72);
    const gasSamples = [0.18, 0.34, 0.5, 0.66, 0.82].map((u) =>
      hexRgb(renderer.sampleGiantPlanetTexture(gas, u, 0.5, u, 0, 0.2))
    );
    const iceSamples = [0.18, 0.34, 0.5, 0.66, 0.82].map((u) =>
      hexRgb(renderer.sampleGiantPlanetTexture(ice, u, 0.5, u, 0, 0.2))
    );
    /** Calculates the arithmetic mean of sampled numeric values. */
    const average = (samples: { r: number; g: number; b: number }[], channel: 'r' | 'g' | 'b'): number =>
      samples.reduce((sum, sample) => sum + sample[channel], 0) / samples.length;
    /** Returns the observed range of one RGB channel in rendered cells. */
    const channelRange = (samples: { r: number; g: number; b: number }[], channel: 'r' | 'g' | 'b'): number =>
      Math.max(...samples.map((sample) => sample[channel])) -
      Math.min(...samples.map((sample) => sample[channel]));

    expect(average(gasSamples, 'r')).toBeGreaterThan(average(gasSamples, 'b'));
    expect(average(iceSamples, 'b')).toBeGreaterThan(average(iceSamples, 'r'));
    expect(channelRange(gasSamples, 'r') + channelRange(gasSamples, 'g')).toBeGreaterThan(
      channelRange(iceSamples, 'r') + channelRange(iceSamples, 'g')
    );
  });

  it('reuses a deterministic body-fixed giant texture while longitude advances smoothly', () => {
    const renderer = new GiantAtmosphereRenderer();
    const giant = createGasGiantPlanet();
    const palette = giant.rgbPaletteCache ?? [];
    const profile = renderer.getProfile(giant, palette);

    renderer.prepareTexture(giant, palette);
    const first = renderer.sampleBodyFixed(giant, palette, 0.243, 0.47);
    const repeated = renderer.sampleBodyFixed(giant, palette, 0.243, 0.47);
    const nearby = renderer.sampleBodyFixed(giant, palette, 0.245, 0.47);
    const rotated = renderer.sample(giant, palette, 0.243, 0.47, 0.2);

    expect(renderer.getProfile(giant, palette)).toBe(profile);
    expect(repeated).toEqual(first);
    expect(nearby.colour).not.toBe(first.colour);
    expect(rotated.colour).not.toBe(first.colour);
  });

  it('adds sparse narrow cloud ribbons whose visibility responds to giant-planet weather energy', () => {
    const renderer = new GiantAtmosphereRenderer();
    const cold = createIceGiantPlanet('Cold Ribbon Giant', 68);
    const warm = createIceGiantPlanet('Warm Ribbon Giant', 230, 0.55 * AU_IN_METERS);
    const coldProfile = renderer.getProfile(cold, cold.rgbPaletteCache ?? []);
    const warmProfile = renderer.getProfile(warm, warm.rgbPaletteCache ?? []);
    /** Samples atmospheric ribbon strength across a representative field. */
    const sampleField = (planet: Planet, profile: GiantVisualProfile): { peak: number; mean: number } => {
      let peak = 0;
      let total = 0;
      let samples = 0;
      for (let y = 0; y <= 500; y++) {
        for (let x = 0; x <= 80; x++) {
          const strength = renderer.sampleCloudRibbons(
            planet,
            x / 80,
            y / 500,
            profile,
            0.2,
            renderer.getTurbulenceFactor(planet)
          ).strength;
          peak = Math.max(peak, strength);
          total += strength;
          samples++;
        }
      }
      return { peak, mean: total / samples };
    };

    const coldField = sampleField(cold, coldProfile);
    const warmField = sampleField(warm, warmProfile);

    expect(coldField.peak).toBeGreaterThan(0.08);
    expect(coldField.peak).toBeLessThanOrEqual(0.42);
    expect(warmField.mean).toBeGreaterThan(coldField.mean);
  });

  it('keeps starbase interiors free of background star effects', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('regression-base', new PRNG('regression-system'), 'Regression');
    starbase.tradeDisplayRows = ['> Water Ice            B 10 S  8 H 0 volatile'];

    renderer.drawPlanetSurface(player, starbase);

    expect(drawCalls.some((call) => call.char === GLYPHS.STAR_DIM)).toBe(false);
    expect(drawCalls.length).toBeGreaterThan(0);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('renders the starbase operations table with tabs, headings, and scrollbar', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(120, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('regression-base', new PRNG('regression-system'), 'Regression');

    renderer.drawStarbaseInterface(player, starbase, {
      stationName: starbase.name,
      sectionId: 'buy',
      sections: [
        { id: 'overview', label: 'Overview' },
        { id: 'buy', label: 'Buy' },
        { id: 'sell', label: 'Sell' },
      ],
      title: 'Trade Depot - Buy',
      subtitle: 'Regression dockside exchange',
      columns: ['COMMODITY', 'STOCK', 'BUY CR', 'CLASS'],
      widths: [20, 7, 8, 16],
      rows: [
        {
          id: 'water',
          cells: ['Water Ice', '12', '3', 'volatile'],
          detail: 'Bulk water ice for station processing.',
        },
        { id: 'helium', cells: ['Helium-3', '4', '42', 'fuel'], detail: 'Fusion reserve lots.' },
        {
          id: 'drones',
          cells: ['Survey Drones', '2', '180', 'equipment'],
          detail: 'Autonomous mapping packages.',
        },
      ],
      selectedIndex: 1,
      viewOffset: 0,
      visibleRowCount: 3,
      footer: [
        'Cr 1,000   Fuel 500/500   Cargo 0/100',
        'Up/Down select  PgUp/PgDn page  Left/Right sections  Enter use  Esc back',
      ],
    });

    expect(drawCalls.some((call) => call.char === 'C')).toBe(true);
    expect(drawCalls.some((call) => call.char === '█')).toBe(true);
    expect(fontsForText(drawCalls, ' TRADE DEPOT - BUY ')).toEqual(Array(19).fill('thick'));
    expect(fontsForText(drawCalls, 'Water Ice')).toEqual(Array(9).fill('thin'));
    expect(fontsForText(drawCalls, 'Fuel 500/500')).toEqual(Array(12).fill('thin'));
    expect(fontsForText(drawCalls, 'Enter use')).toEqual([
      ...Array(5).fill('thick'),
      ...Array(4).fill('thin'),
    ]);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it.each([
    [120, 54],
    [70, 40],
  ])('preserves styled contract references while wrapping detail rows in a %sx%s port', (cols, rows) => {
    const { buffer, drawCalls } = createMockScreenBuffer(cols, rows);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('reference-port', new PRNG('reference-port'), 'Regression');
    renderer.drawStarbaseInterface(player, starbase, {
      stationName: starbase.name,
      sectionId: 'missions',
      sections: [{ id: 'missions', label: 'Missions' }],
      title: 'Research',
      subtitle: '',
      columns: ['REQUEST'],
      widths: [20],
      rows: [
        {
          id: 'reference',
          cells: ['Live reference'],
          detailSegments: [
            { text: 'CREATURE: ', tone: 'muted', font: 'thin' },
            {
              text: 'bilateral walker / skittish grazer / walking / heterotroph',
              tone: 'cyan',
              font: 'thin',
            },
            { text: ' | Return one live specimen to the issuing station.', tone: 'normal', font: 'thin' },
          ],
        },
      ],
      detailLineCount: 3,
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 1,
      footer: ['Escape return'],
    });
    expect(
      drawCalls.some((call) => call.char === 'w' && call.fg === TEXT_PALETTE.cyan && call.font === 'thin')
    ).toBe(true);
    expect(
      drawCalls.some((call) => call.char === 'o' && call.fg === TEXT_PALETTE.text && call.font === 'thin')
    ).toBe(true);
    expect(Math.max(...drawCalls.map((call) => call.x))).toBeLessThan(cols);
    expect(Math.max(...drawCalls.map((call) => call.y))).toBeLessThan(rows);
  });

  it('autosizes starbase columns to fit long shipyard bay labels when space permits', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(150, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('wide-yard', new PRNG('wide-yard'), 'Regression');

    renderer.drawStarbaseInterface(player, starbase, {
      stationName: starbase.name,
      sectionId: 'shipyard',
      sections: [{ id: 'shipyard', label: 'Shipyard' }],
      title: 'Shipyard',
      subtitle: 'Regression refit yard',
      columns: ['BAY', 'QUOTE', 'ETA', 'WORK ORDER'],
      widths: [8, 8, 5, 18],
      rows: [
        {
          id: 'probe-bay',
          cells: ['Auxiliary probe bay', '12,500 Cr', '18h', 'Install pressure-rated survey probe cradle.'],
          detail: 'Full detail remains available below the table.',
        },
      ],
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 1,
      footer: ['Enter purchase  Esc leave'],
    });

    const renderedRows = renderTextRows(drawCalls);
    expect(renderedRows.some((line) => line.includes('Auxiliary probe bay'))).toBe(true);
  });

  it.each([
    [120, 54],
    [70, 32],
    [70, 24],
  ])('keeps bottom shipyard selections drawn above details and footers in a %sx%s port', (cols, height) => {
    const { buffer, drawCalls } = createMockScreenBuffer(cols, height);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('scroll-yard', new PRNG('scroll-yard'), 'Regression');
    const controller = new StarbaseController();
    controller.openSection('shipyard');
    const orders = Array.from({ length: 40 }, (_, index) => ({
      id: `order-${index}`,
      cells: [`Refit ${String(index).padStart(2, '0')}`, '600 Cr', '1h', 'Install module.'],
      detail: `Work order ${index} details.`,
    }));
    const visibleRows = controller.getVisibleRowCount(height * 12, 12);

    // Exercise the formerly hidden last two rows, then both page directions and the final order.
    for (const delta of [visibleRows - 1, 1, 1, visibleRows, -visibleRows, orders.length]) {
      controller.moveSelection(delta, orders.length, visibleRows);
      const model = controller.createScreen({
        starbase,
        player,
        rows: orders,
        canvasHeight: height * 12,
        charHeight: 12,
        statusMessage: 'Docked.',
      });
      drawCalls.length = 0;
      renderer.drawStarbaseInterface(player, starbase, model);
      const lines = renderTextRows(drawCalls);
      const label = orders[model.selectedIndex].cells[0];
      expect(lines.some((line) => line.includes(`> ${label}`))).toBe(true);

      const marker = drawCalls.find((call) => call.char === '>' && call.fg === TEXT_PALETTE.greenBright)!;
      const alert = drawCalls.find((call) => call.char === 'D' && call.fg === TEXT_PALETTE.amber)!;
      const detail = drawCalls.find((call) => call.char === ':' && call.fg === TEXT_PALETTE.cyan)!;
      expect(marker.y).toBeLessThan(detail.y);
      expect(detail.y).toBeLessThan(alert.y);
      expect(drawCalls.filter((call) => call.char === '│' && call.fg === TEXT_PALETTE.cyanDeep)).toHaveLength(
        model.visibleRowCount
      );
      expect(drawCalls.every((call) => call.x >= 0 && call.x < cols && call.y >= 0 && call.y < height)).toBe(
        true
      );
    }
  });

  it('keeps autosized starbase tables inside narrow viewports', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(70, 32);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('narrow-yard', new PRNG('narrow-yard'), 'Regression');

    renderer.drawStarbaseInterface(player, starbase, {
      stationName: starbase.name,
      sectionId: 'shipyard',
      sections: [{ id: 'shipyard', label: 'Shipyard' }],
      title: 'Shipyard',
      subtitle: 'Regression refit yard',
      columns: ['BAY', 'QUOTE', 'ETA', 'WORK ORDER'],
      widths: [18, 10, 8, 42],
      rows: [
        {
          id: 'long-order',
          cells: [
            'Special purpose bay',
            '88,000 Cr',
            '14d',
            'A deliberately long refit order that cannot fit in a small viewport.',
          ],
          detail: 'Overflow text is described in the detail area when selected.',
        },
      ],
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 1,
      footer: ['Enter purchase  Esc leave'],
    });

    expect(Math.max(...drawCalls.map((call) => call.x))).toBeLessThan(70);
  });

  it('renders reusable modal tables for navigation target selection', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(110, 44);
    const renderer = createSceneRenderer(buffer);

    renderer.drawTextModalTable({
      title: 'Navigation Targets',
      subtitle: 'Regression local target index',
      columns: ['TYPE', 'NAME', 'HAB', 'RANGE', 'BRG'],
      widths: [8, 22, 7, 10, 5],
      rows: [
        {
          id: 'star:A',
          cells: ['Star A', 'Regression A', '-', '0.00 AU', 'HERE'],
          detail: 'Regression A | Star A | no registered terraforming | one-way signal 0.0 light-sec',
        },
        {
          id: 'planet:Arcadia',
          cells: ['Planet', 'Arcadia (2 moons)', 'COLONY', '1.42 AU', 'NE'],
          detail: 'Arcadia | Planet | complete terraformed colony | one-way signal 11.8 light-min',
        },
        {
          id: 'planet:Farpoint',
          cells: ['Planet', 'Farpoint (0 moons)', 'T-FORM', '4.80 AU', 'SW'],
          detail: 'Farpoint | Planet | partial terraforming project | one-way signal 39.9 light-min',
        },
      ],
      selectedIndex: 1,
      viewOffset: 0,
      visibleRowCount: 3,
      footer: ['Up/Down select  Enter approach  Esc/Left/Right cancel'],
    });

    expect(drawCalls.some((call) => call.char === '█')).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('renders dashboard modals as coloured diagrams rather than selectable tables', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(120, 42);
    const renderer = createSceneRenderer(buffer);

    renderer.drawTextModalTable({
      title: 'Ship Status',
      subtitle: 'Regression dashboard',
      columns: ['VESSEL DIAGRAM', 'READOUT'],
      widths: [62, 34],
      rows: [],
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 18,
      dashboard: [
        { segments: [{ text: '┌──── CORE ────┐', tone: 'cyan' }] },
        {
          segments: [
            { text: '│', tone: 'cyan' },
            { text: 'DRIVE TRUNK ', tone: 'green' },
            { text: '[====..]', tone: 'amber' },
            { text: '│', tone: 'cyan' },
          ],
        },
        { segments: [{ text: '└──────────────┘', tone: 'cyan' }] },
      ],
      footer: ['Esc/Left back'],
    });

    expect(buffer.clear).toHaveBeenCalledOnce();
    expect(buffer.clear).toHaveBeenCalledWith(false);
    const renderedRows = renderTextRows(drawCalls);
    expect(renderedRows.join('\n')).toContain('DRIVE TRUNK');
    expect(renderedRows.join('\n')).not.toContain('VESSEL DIAGRAM');
    expect(drawCalls.some((call) => call.char === 'D' && call.fg === TEXT_PALETTE.green)).toBe(true);
    expect(drawCalls.some((call) => call.char === '[' && call.fg === TEXT_PALETTE.amber)).toBe(true);
  });

  it.each([
    [30, 45],
    [48, 20],
    [104, 40],
  ])('keeps the mission terminal inside a %s x %s viewport and masks underlying graphics', (cols, rows) => {
    const { buffer, drawCalls } = createMockScreenBuffer(cols, rows);
    const journal = new MissionJournal();
    journal.reveal.complete();
    const model = journal.createModel([], cols, rows, false);
    createSceneRenderer(buffer).drawTextModalTable(model);
    expect(buffer.occludeScaledGlyphs).toHaveBeenCalledOnce();
    expect(renderTextRows(drawCalls).join('\n')).toContain('MISSION JOURNAL');
    expect(drawCalls.every((call) => call.x >= 0 && call.x < cols && call.y >= 0 && call.y < rows)).toBe(
      true
    );
    expect(drawCalls.some((call) => call.font === 'thin')).toBe(true);
    expect(fontsForText(drawCalls, ' MISSION JOURNAL ')).toEqual(Array(17).fill('thick'));
  });

  it.each([
    [120, 42],
    [76, 24],
    [30, 45],
    [48, 20],
  ])('renders selected repair quotes legibly over a clean scene in a %sx%s terminal', (cols, rows) => {
    const { buffer, drawCalls } = createMockScreenBuffer(cols, rows);
    const player = new Player();
    player.ship.damage.hullIntegrity = 80;
    player.ship.damage.subsystemDamage = { drive: 25, shield: 10 };
    const console = new ShipRepairConsole();
    console.selectedTarget = 'drive';
    const model = console.createModel(
      player,
      'Regression Dock',
      getStarbaseShipyardProfile('Regression Dock'),
      cols,
      rows
    );
    createSceneRenderer(buffer).drawTextModalTable(model);
    const text = renderTextRows(drawCalls).join('\n');
    expect(text).toContain('REPAIR CONTROL');
    expect(text).toContain('Drive');
    expect(text).toContain('450 Cr');
    expect(text).toContain('75% integrity');
    expect(buffer.clear).toHaveBeenCalledWith(false);
    expect(buffer.occludeScaledGlyphs).toHaveBeenCalledOnce();
    expect(drawCalls.every((call) => call.x >= 0 && call.x < cols && call.y >= 0 && call.y < rows)).toBe(
      true
    );
    expect(fontsForText(drawCalls, ' REPAIR CONTROL ')).toEqual(Array(16).fill('thick'));
    expect(fontsForText(drawCalls, '75% integrity')).toEqual(Array(13).fill('thin'));
  });

  it.each([
    [120, 42],
    [48, 20],
    [30, 45],
  ])('keeps witnessed field ethology readable and masks sprites in a %sx%s dossier', (cols, rows) => {
    const f = ethologyFixture();
    const service = new XenobiologyService();
    service.snapshot.fields[f.field.site.id] = f.field;
    service.observe(f.consumer, 2);
    const result = new SurfaceEncounterSystem().act(f.field, { kind: 'wait' }, createDefaultCargo(50), 1);
    service.recordBehaviour(
      result.behaviourWitnesses!.find((entry) => entry.observation.kind === 'feeding')!
    );
    const controller = new SurfaceEncounterController();
    controller.targetId = f.actor.id;
    controller.interaction = { kind: 'dossier', offset: 0 };
    controller.reveal.complete();
    const first = controller.createModal(f.field, service, cols, rows, [])!;
    controller.interaction.offset = first.dashboard!.findIndex((line) =>
      line.segments.some((span) => span.text === 'FIELD ETHOLOGY')
    );
    const model = controller.createModal(f.field, service, cols, rows, [])!;
    const { buffer, drawCalls } = createMockScreenBuffer(cols, rows);
    const before = service.createSnapshot();
    createSceneRenderer(buffer).drawTextModalTable(model);
    expect(renderTextRows(drawCalls).join('\n')).toContain('FIELD ETHOLOGY');
    expect(buffer.clear).toHaveBeenCalledWith(false);
    expect(buffer.occludeScaledGlyphs).toHaveBeenCalledOnce();
    expect(drawCalls.every((call) => call.x >= 0 && call.x < cols && call.y >= 0 && call.y < rows)).toBe(
      true
    );
    expect(fontsForText(drawCalls, 'FIELD ETHOLOGY')).toEqual(Array(14).fill('thick'));
    expect(drawCalls.some((call) => call.font === 'thin' && call.fg === TEXT_PALETTE.green)).toBe(true);
    expect(service.createSnapshot()).toEqual(before);
  });

  it('shows only the scrolled dossier page and a scroll indicator', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(76, 24);
    const renderer = createSceneRenderer(buffer);
    renderer.drawTextModalTable({
      title: 'PLANETARY DOSSIER',
      subtitle: 'Regression World',
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: 18,
      visibleRowCount: 12,
      dashboard: Array.from({ length: 36 }, (_, index) => ({
        segments: [{ text: `DATA LINE ${String(index).padStart(2, '0')}`, tone: 'green' as const }],
      })),
      footer: ['UP/DN scroll  PGUP/DN page', 'ESC return to orbit'],
    });
    const text = renderTextRows(drawCalls).join('\n');
    expect(text).toContain('DATA LINE 18');
    expect(text).not.toContain('DATA LINE 00');
    expect(text).toContain('ESC return');
    expect(fontsForText(drawCalls, ' PLANETARY DOSSIER ')).toEqual(Array(19).fill('thick'));
    expect(fontsForText(drawCalls, 'DATA LINE 18')).toEqual(Array(12).fill('thin'));
    expect(fontsForText(drawCalls, 'ESC return to orbit')).toEqual([
      ...Array(3).fill('thick'),
      ...Array(16).fill('thin'),
    ]);
    expect(drawCalls.some((call) => call.char === '█')).toBe(true);
    expect(buffer.occludeScaledGlyphs).toHaveBeenCalledOnce();
  });

  it.each([
    [30, 45],
    [48, 20],
    [76, 24],
    [120, 42],
  ])('writes dashboard text with a cursor and stable frame in a %sx%s viewport', (cols, rows) => {
    const model: TextModalTableModel = {
      title: 'READOUT',
      subtitle: 'World',
      columns: [],
      widths: [],
      rows: [],
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 2,
      dashboard: [
        {
          segments: [
            { text: 'NAV ', tone: 'cyan', font: 'thick' },
            { text: 'READY', tone: 'green' },
          ],
        },
        { segments: [{ text: 'FLUX 1361', tone: 'amber' }] },
      ],
      footer: ['ESC return to orbit'],
    };
    const frames = [0, 0.3, 1].map((dashboardReveal) => {
      const { buffer, drawCalls } = createMockScreenBuffer(cols, rows);
      createSceneRenderer(buffer).drawTextModalTable({ ...model, dashboardReveal });
      expect(buffer.occludeScaledGlyphs).toHaveBeenCalledOnce();
      expect(drawCalls.every((call) => call.x >= 0 && call.x < cols && call.y >= 0 && call.y < rows)).toBe(
        true
      );
      return drawCalls;
    });
    for (const frame of frames) {
      const text = renderTextRows(frame).join('\n');
      expect(text).toContain('READOUT');
      expect(text).toContain('ESC return to orbit');
      expect(frame.find((call) => call.char === '┌')).toMatchObject(
        frames[0].find((call) => call.char === '┌')!
      );
    }
    const startCursor = frames[0].find(
      (call) => call.char === CONFIG.TRM_CURSOR_CHAR && call.fg === TEXT_PALETTE.greenBright
    )!;
    const writingCursor = frames[1].find(
      (call) => call.char === CONFIG.TRM_CURSOR_CHAR && call.fg === TEXT_PALETTE.greenBright
    )!;
    expect(startCursor).toBeDefined();
    expect(writingCursor).toMatchObject({ x: startCursor.x + 6, y: startCursor.y });
    const partial = renderTextRows(frames[1]).join('\n');
    expect(partial).toContain('NAV RE');
    expect(partial).not.toContain('READY');
    expect(partial).not.toContain('FLUX 1361');
    const complete = renderTextRows(frames[2]).join('\n');
    expect(complete).toContain('NAV READY');
    expect(complete).toContain('FLUX 1361');
    expect(
      frames[2].some((call) => call.char === CONFIG.TRM_CURSOR_CHAR && call.fg === TEXT_PALETTE.greenBright)
    ).toBe(false);
    expect(fontsForText(frames[2], 'NAV READY')).toEqual([
      ...Array(4).fill('thick'),
      ...Array(5).fill('thin'),
    ]);
  });

  it('renders ordinary modal table cells with row and cell tones', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 34);
    const renderer = createSceneRenderer(buffer);

    renderer.drawTextModalTable({
      title: 'Ship Cargo',
      subtitle: 'Regression cargo colours',
      columns: ['BAY / CARGO', 'QTY', 'VALUE', 'LOAD / ACTION'],
      widths: [20, 7, 8, 24],
      rows: [
        {
          id: 'overview',
          cells: ['Hold capacity', '25.0', '100', '[####......] Light'],
          disabled: true,
          cellTones: ['cyan', 'bright', 'bright', 'green'],
          detail: 'Cargo detail line.',
          detailTone: 'cyan',
        },
        {
          id: 'iron',
          cells: ['Bay 01 Iron', '77', '125', 'Enter to arm ejector'],
          cellTones: ['green', 'bright', 'amber', 'cyan'],
          detail: 'Selected cargo.',
          detailTone: 'amber',
        },
      ],
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 2,
      footer: ['Esc/Left back'],
    });

    expect(drawCalls.some((call) => call.char === 'B' && call.fg === TEXT_PALETTE.green)).toBe(true);
    expect(drawCalls.some((call) => call.char === '7' && call.fg === TEXT_PALETTE.textBright)).toBe(true);
    expect(drawCalls.some((call) => call.char === '2' && call.fg === TEXT_PALETTE.amber)).toBe(true);
    expect(drawCalls.some((call) => call.char === 'E' && call.fg === TEXT_PALETTE.cyan)).toBe(true);
  });

  it('samples solid planet textures smoothly across wrapped longitude', () => {
    const { buffer } = createMockScreenBuffer(80, 30);
    const renderer = createSceneRenderer(buffer) as any;
    const heightmap = [
      [20, 100, 140, 220],
      [20, 100, 140, 220],
      [20, 100, 140, 220],
      [20, 100, 140, 220],
    ];

    const planet = {} as Planet;
    const palette = Array.from({ length: 256 }, (_, h) => `#${h.toString(16).padStart(2, '0').repeat(3)}`);
    const seamSample = renderer.sampleSolidPlanetTexture(
      planet,
      heightmap,
      palette,
      null,
      0.999999,
      0.5,
      52,
      1
    );
    const nearStartSample = renderer.sampleSolidPlanetTexture(
      planet,
      heightmap,
      palette,
      null,
      0.000001,
      0.5,
      52,
      1
    );

    expect(Math.abs(seamSample.colour.r - nearStartSample.colour.r)).toBeLessThan(1);
    expect(nearStartSample.colour.r).toBeLessThan(50);
  });

  it('autosizes reusable modal tables without clipping long option names', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(120, 36);
    const renderer = createSceneRenderer(buffer);

    renderer.drawTextModalTable({
      title: 'Ship Cargo',
      subtitle: 'Regression inventory',
      columns: ['SECTION', 'STATUS'],
      widths: [8, 8],
      rows: [
        {
          id: 'cargo-pod',
          cells: ['Forward modular cargo pod bay', 'Loaded and pressure locked'],
          detail: 'The selected row detail is still the place for longer notes.',
        },
      ],
      selectedIndex: 0,
      viewOffset: 0,
      visibleRowCount: 1,
      footer: ['Esc close'],
    });

    const renderedRows = renderTextRows(drawCalls);
    expect(renderedRows.some((line) => line.includes('Forward modular cargo pod bay'))).toBe(true);
  });

  it('renders the orbital operations screen with globe, landing map, and summary panels', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer);
    const planet = createOrbitPlanet();

    renderer.drawOrbitInterface({
      title: 'Orbital Operations',
      subtitle: 'Regression Orbit I local space',
      parentPlanet: planet,
      selectedBody: planet,
      bodies: [{ label: 'Primary', planet, selected: true }],
      mode: 'landing',
      stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
      rotationPhase: 0.35,
      illuminationPhase: 0.35,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      summary: ['ROCKY TERRESTRIAL WORLD', '1.00 AU / star A', '[D] PLANETARY DOSSIER'],
      footer: [
        'Landing site: arrows move cursor, Enter/Space confirms, Esc cancels.',
        'Site X 12  Y 18  Map 32x32',
      ],
    });

    expect(drawCalls.some((call) => call.char === '+')).toBe(true);
    expect(drawCalls.some((call) => call.char === GLYPHS.BLOCK)).toBe(true);
    const orbitText = renderTextRows(drawCalls).join('\n');
    expect(orbitText).toContain('SCAN SUMMARY');
    expect(orbitText).toContain('[D] PLANETARY DOSSIER');
    expect(orbitText).not.toContain('Diameter 11,000 km');
    expect(fontsForText(drawCalls, ' ORBITAL OPERATIONS ')).toEqual(Array(20).fill('thick'));
    expect(fontsForText(drawCalls, 'Regression Orbit I local space')).toEqual(Array(30).fill('thin'));
    expect(fontsForText(drawCalls, 'star A')).toEqual(Array(6).fill('thin'));
    expect(fontsForText(drawCalls, 'X 12  Y 18')).toEqual(Array(10).fill('thin'));
    expect(fontsForText(drawCalls, 'Enter/Space confirms')).toEqual([
      ...Array(5).fill('thick'),
      ...Array(6).fill('thick'),
      ...Array(9).fill('thin'),
    ]);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('keeps the scan and landing map separate on a narrow orbital viewport', () => {
    const planet = createOrbitPlanet();
    for (const mode of ['overview', 'landing'] as const) {
      const { buffer, drawCalls } = createMockScreenBuffer(80, 42);
      const renderer = createSceneRenderer(buffer);
      renderer.drawOrbitInterface({
        title: 'Orbital Operations',
        subtitle: 'Regression Orbit I local space',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [{ label: 'Primary', planet, selected: true }],
        mode,
        stellarSources: [],
        rotationPhase: 0,
        illuminationPhase: 0,
        landingCursorX: 0,
        landingCursorY: 0,
        mapSize: 32,
        summary: ['ROCKY WORLD', '1.00 AU / star A', '[D] PLANETARY DOSSIER'],
        footer: ['D dossier  Enter land  Esc leave'],
      });
      const text = renderTextRows(drawCalls).join('\n');
      expect(text).toContain('ORBITAL VIEW');
      expect(text.includes('SCAN SUMMARY')).toBe(mode === 'overview');
      expect(text.includes('LANDING MAP')).toBe(mode === 'landing');
    }
  });

  it('shows stellar sources as a clipped distant light source in orbital view', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer);
    const planet = createOrbitPlanet();

    renderer.drawOrbitInterface({
      title: 'Orbital Operations',
      subtitle: 'Regression Orbit I local space',
      parentPlanet: planet,
      selectedBody: planet,
      bodies: [{ label: 'Primary', planet, selected: true }],
      mode: 'overview',
      stellarSources: [
        { id: 'A', primary: true, brightness: 1, colour: '#FFFACD' },
        { id: 'B', primary: false, brightness: 0.4, colour: '#FFC864', longitudeOffset: -0.015 },
      ],
      rotationPhase: 0.35,
      illuminationPhase: 0.475,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      summary: ['Regression limb marker.'],
      footer: ['Esc closes orbit.'],
    });

    const stellarSource = drawCalls.find((call) => call.char === GLYPHS.STELLAR_SOURCE);
    expect(stellarSource).toBeDefined();
    expect(stellarSource?.scaleX).toBe(0.5);
    expect(stellarSource?.scaleY).toBe(0.5);
    expect(Number.isInteger(stellarSource?.x)).toBe(false);
    expect(drawCalls.some((call) => call.char === GLYPHS.STAR_BRIGHT)).toBe(false);
    expect(drawCalls.some((call) => call.char === GLYPHS.STAR_DIM)).toBe(true);
    expect(renderTextRows(drawCalls).some((line) => line.includes('SUN'))).toBe(false);
  });

  it('moves the orbital stellar marker between opposite horizons', () => {
    /** Renders at phase. */
    const renderAtPhase = (illuminationPhase: number): DrawCall[] => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const renderer = createSceneRenderer(buffer);
      const planet = createOrbitPlanet();
      renderer.drawOrbitInterface({
        title: 'Orbital Operations',
        subtitle: 'Regression Orbit I local space',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [{ label: 'Primary', planet, selected: true }],
        mode: 'overview',
        stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
        rotationPhase: 0.35,
        illuminationPhase,
        landingCursorX: 12,
        landingCursorY: 18,
        mapSize: 32,
        summary: ['Regression horizon marker.'],
        footer: ['Esc closes orbit.'],
      });
      return drawCalls;
    };

    const leftMarker = renderAtPhase(0.35).find((call) => call.char === GLYPHS.STELLAR_SOURCE);
    const rightMarker = renderAtPhase(0.475).find((call) => call.char === GLYPHS.STELLAR_SOURCE);

    expect(leftMarker).toBeDefined();
    expect(rightMarker).toBeDefined();
    expect(leftMarker!.x).toBeLessThan(rightMarker!.x);
  });

  it('hides the orbital stellar source when it is behind the viewer or planet', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer);
    const planet = createOrbitPlanet();

    /** Draws at phase. */
    const drawAtPhase = (illuminationPhase: number): DrawCall[] => {
      const { buffer: phaseBuffer, drawCalls: phaseDrawCalls } = createMockScreenBuffer(132, 58);
      const phaseRenderer = createSceneRenderer(phaseBuffer);
      phaseRenderer.drawOrbitInterface({
        title: 'Orbital Operations',
        subtitle: 'Regression Orbit I local space',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [{ label: 'Primary', planet, selected: true }],
        mode: 'overview',
        stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
        rotationPhase: 0.35,
        illuminationPhase,
        landingCursorX: 12,
        landingCursorY: 18,
        mapSize: 32,
        summary: ['Regression occultation marker.'],
        footer: ['Esc closes orbit.'],
      });
      return phaseDrawCalls;
    };

    renderer.drawOrbitInterface({
      title: 'Orbital Operations',
      subtitle: 'Regression Orbit I local space',
      parentPlanet: planet,
      selectedBody: planet,
      bodies: [{ label: 'Primary', planet, selected: true }],
      mode: 'overview',
      stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
      rotationPhase: 0.35,
      illuminationPhase: 0,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      summary: ['Regression occultation marker.'],
      footer: ['Esc closes orbit.'],
    });

    expect(drawCalls.some((call) => call.char === GLYPHS.STELLAR_SOURCE)).toBe(false);
    expect(drawAtPhase(0.4).some((call) => call.char === GLYPHS.STELLAR_SOURCE)).toBe(false);
  });

  it("allows an unocculted companion to illuminate the primary star's night hemisphere", () => {
    /** Samples the central surface pixel with or without a second light source. */
    const centreLuma = (relativeFlux: number): number => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const planet = createFeaturelessOrbitPlanet();
      createSceneRenderer(buffer).drawOrbitInterface({
        title: 'Orbital Operations',
        subtitle: '',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [],
        mode: 'overview',
        rotationPhase: 0,
        illuminationPhase: 0.4125,
        stellarSources: [
          { id: 'A', primary: true, relativeFlux: 1, brightness: 1, colour: '#FFFFFF' },
          {
            id: 'B',
            primary: false,
            relativeFlux,
            brightness: 1,
            colour: '#FFFFFF',
            longitudeOffset: Math.PI,
          },
        ],
        landingCursorX: 0,
        landingCursorY: 0,
        mapSize: 32,
        summary: [],
        footer: [],
      });
      return hexLuma(
        drawCalls.find((call) => call.char === GLYPHS.BLOCK && call.x === 24 && call.y === 27)!.fg
      );
    };
    expect(centreLuma(1)).toBeGreaterThan(centreLuma(0) * 3);
    expect(centreLuma(0.01)).toBeLessThan(centreLuma(1));
  });

  it('keeps atmospheric twilight on the globe raster through dawn, eclipse, and dusk', () => {
    /** Renders at phase. */
    const renderAtPhase = (
      illuminationPhase: number,
      atmospheric = true,
      referenceAtmosphere = false
    ): DrawCall[] => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const renderer = createSceneRenderer(buffer);
      if (referenceAtmosphere) {
        const withReferenceSampler = renderer as unknown as {
          getOrbitAtmosphereSampler: (
            air: OrbitAtmosphere | null
          ) => Pick<OrbitAtmosphereSampler, 'samplePixel'> | null;
        };
        withReferenceSampler.getOrbitAtmosphereSampler = (air) =>
          air
            ? { samplePixel: (x, y, size, sun) => sampleOrbitAtmospherePixelTransfer(x, y, size, sun, air) }
            : null;
      }
      const planet = atmospheric ? createAtmosphericOrbitPlanet() : createOrbitPlanet();
      renderer.drawOrbitInterface({
        title: 'Orbital Operations',
        subtitle: 'Regression Orbit I local space',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [{ label: 'Primary', planet, selected: true }],
        mode: 'overview',
        stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
        rotationPhase: 0.35,
        illuminationPhase,
        landingCursorX: 12,
        landingCursorY: 18,
        mapSize: 32,
        summary: ['Regression atmospheric horizon.'],
        footer: ['Esc closes orbit.'],
      });
      return drawCalls;
    };

    /** Selects only globe pixels, excluding the landing map and stellar text glyphs. */
    const globePixels = (phase: number, atmospheric = true): DrawCall[] =>
      renderAtPhase(phase, atmospheric).filter(
        (call) => call.char === GLYPHS.BLOCK && call.scaleX === 0.5 && call.scaleY === 0.5 && call.x < 40
      );
    const signatures: Record<string, string> = {};
    const phasePointTwoDifference = { compared: 0, changedPixels: 0, maxChannelDelta: 0 };
    const initialSun = orbitSunDirection(0);
    const fullPhase = (1 + Math.atan2(initialSun.x, initialSun.z) / (2 * Math.PI)) % 1;
    const midOccultation = 0.5 + Math.atan2(initialSun.x, initialSun.z) / (2 * Math.PI);
    const contactOffset =
      Math.acos(Math.sqrt(1 - 1 / ORBIT_CAMERA_DISTANCE ** 2) / Math.sqrt(1 - initialSun.y ** 2)) /
      (2 * Math.PI);
    const ingress = midOccultation - contactOffset;
    const egress = midOccultation + contactOffset;
    for (const phase of [
      fullPhase,
      (fullPhase + 0.25) % 1,
      0,
      0.2,
      0.35,
      0.36,
      ingress,
      0.4125,
      egress,
      0.465,
      0.475,
      0.65,
    ]) {
      const atmospheric = globePixels(phase);
      const airless = globePixels(phase, false);
      if (phase === 0.2) {
        const reference = renderAtPhase(phase, true, true).filter(
          (call) => call.char === GLYPHS.BLOCK && call.scaleX === 0.5 && call.scaleY === 0.5 && call.x < 40
        );
        expect(reference.map(({ x, y }) => [x, y])).toEqual(atmospheric.map(({ x, y }) => [x, y]));
        for (const [index, pixel] of atmospheric.entries()) {
          const expected = hexToRgb(reference[index].fg);
          const actual = hexToRgb(pixel.fg);
          const maximum = Math.max(
            Math.abs(expected.r - actual.r),
            Math.abs(expected.g - actual.g),
            Math.abs(expected.b - actual.b)
          );
          if (maximum > 0) phasePointTwoDifference.changedPixels++;
          phasePointTwoDifference.maxChannelDelta = Math.max(
            phasePointTwoDifference.maxChannelDelta,
            maximum
          );
          phasePointTwoDifference.compared++;
        }
        expect(phasePointTwoDifference.maxChannelDelta).toBeLessThanOrEqual(1);
      }
      expect(atmospheric.length).toBeGreaterThan(200);
      const positions = new Set(atmospheric.map((call) => `${call.x},${call.y}`));
      expect(airless.every((call) => positions.has(`${call.x},${call.y}`))).toBe(true);
      // A physical atmosphere may extend beyond solid terrain, but not detach from it.
      const planet = createAtmosphericOrbitPlanet();
      const air = createOrbitAtmosphere(
        planet.effectiveAtmosphere.pressure,
        planet.effectiveSurfaceTemp,
        planet.gravity,
        planet.diameter,
        planet.effectiveAtmosphere.composition
      )!;
      const projectedOuter = air.projectedLayers.at(-1)!;
      expect(
        atmospheric.every(
          (call) => Math.hypot(call.x - 24, call.y - 27) <= 12 * projectedOuter + Math.SQRT2 * 0.25
        )
      ).toBe(true);
      expect(atmospheric.every((call) => Number.isInteger(call.x * 2) && Number.isInteger(call.y * 2))).toBe(
        true
      );
      // Include colour and position, unlike character-count signatures that miss misplaced glow.
      signatures[phase] = createHash('sha256').update(JSON.stringify(atmospheric)).digest('hex');
      if (phase === ingress || phase === egress) {
        /** Measures visible warm radiance without promoting nearly-black colour ratios. */
        const warmth = (call: DrawCall): number => {
          const rgb = hexToRgb(call.fg);
          return (rgb.r / 255) ** 2.2 - (rgb.b / 255) ** 2.2;
        };
        const sun = projectOrbitSource(orbitSunDirection(phase * Math.PI * 2))!;
        // Compare the warm arc's centroid, not one raster cell's maximum. Optical
        // depth and subpixel coverage can put that maximum beside the star.
        let total = 0;
        let warmX = 0;
        let warmY = 0;
        let oppositeWarmth = 0;
        for (const call of atmospheric) {
          const weight = Math.max(0, warmth(call));
          const x = (call.x - 24) / 12;
          const y = -(call.y - 27) / 12;
          total += weight;
          warmX += x * weight;
          warmY += y * weight;
          if (x * sun.x + y * sun.y < 0) oppositeWarmth += weight;
        }
        expect(total).toBeGreaterThan(0);
        expect(Math.hypot(warmX / total - sun.x, warmY / total - sun.y)).toBeLessThan(0.2);
        expect(oppositeWarmth).toBeLessThan(total * 0.01);
      }
    }
    expect(phasePointTwoDifference.changedPixels / phasePointTwoDifference.compared).toBeLessThan(0.001);
    const night = globePixels(0.4125);
    const day = globePixels(0);
    expect(Math.max(...night.map((call) => hexLuma(call.fg)))).toBeLessThan(
      Math.max(...day.map((call) => hexLuma(call.fg))) * 0.3
    );
    expect(signatures).toMatchSnapshot();
  });

  it('keeps a partially visible stellar disc outside the limb until it is fully occulted', () => {
    /** Renders an airless contact to isolate finite-disc occultation from gas extinction. */
    const sourceAt = (illuminationPhase: number, angularRadius: number): DrawCall | undefined => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const planet = createFeaturelessOrbitPlanet();
      createSceneRenderer(buffer).drawOrbitInterface({
        title: '',
        subtitle: '',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [],
        mode: 'overview',
        rotationPhase: 0,
        illuminationPhase,
        stellarSources: [
          {
            id: 'A',
            primary: true,
            brightness: 1,
            colour: '#FFFFFF',
            irradianceWm2: 1361,
            temperatureK: 5772,
            angularRadius,
          },
        ],
        landingCursorX: 0,
        landingCursorY: 0,
        mapSize: 32,
        summary: [],
        footer: [],
      });
      return drawCalls.find((call) => call.char === GLYPHS.STELLAR_SOURCE);
    };
    for (const phase of [0.3617394005527416 + 0.0004, 0.4631901620461734 - 0.0004]) {
      expect(sourceAt(phase, 0)).toBeUndefined();
      const partial = sourceAt(phase, 0.00465)!;
      expect(partial).toBeDefined();
      expect(hexLuma(partial.fg)).toBeGreaterThan(0);
      expect(Math.hypot(partial.x - 24, partial.y - 27)).toBeGreaterThan(12);
    }
    expect(sourceAt(0.4125, 0.00465)).toBeUndefined();
  });

  it('keeps bare and tenuous-atmosphere worlds on the same spectral exposure model', () => {
    const solar: OrbitStellarSource = {
      id: 'A',
      primary: true,
      brightness: 1,
      colour: '#FFFFFF',
      irradianceWm2: 1361,
      temperatureK: 5772,
    };
    /** Captures the illuminated centre through the complete orbit renderer. */
    const centre = (pressure: number, stellarSources: OrbitStellarSource[], material = '#B8B8B8') => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const planet = createFeaturelessOrbitPlanet(material, pressure);
      createSceneRenderer(buffer).drawOrbitInterface({
        title: '',
        subtitle: '',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [],
        mode: 'overview',
        rotationPhase: 0,
        illuminationPhase: 0.9124647812994575,
        stellarSources,
        landingCursorX: 0,
        landingCursorY: 0,
        mapSize: 32,
        summary: [],
        footer: [],
      });
      return hexToRgb(
        drawCalls.find((call) => call.char === GLYPHS.BLOCK && call.x === 24 && call.y === 27)!.fg
      );
    };
    const cool = { ...solar, temperatureK: 3000 };
    const triple = [
      cool,
      { ...solar, id: 'B', primary: false, temperatureK: 12000, irradianceWm2: 300, longitudeOffset: 0.3 },
      { ...solar, id: 'C', primary: false, temperatureK: 6000, irradianceWm2: 400, longitudeOffset: -0.5 },
    ];
    for (const sources of [[solar], [cool], triple]) {
      const bare = centre(0, sources);
      const tenuous = centre(1e-8, sources);
      const distantSources = sources.map((source) => ({
        ...source,
        irradianceWm2: source.irradianceWm2! * 1e-10,
      }));
      const distantBare = centre(0, distantSources);
      const distantAir = centre(1e-8, distantSources);
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(bare[channel]).toBeGreaterThan(20);
        expect(Math.abs(tenuous[channel] - bare[channel])).toBeLessThanOrEqual(1);
        expect(Math.abs(distantBare[channel] - bare[channel])).toBeLessThanOrEqual(1);
        expect(Math.abs(distantAir[channel] - tenuous[channel])).toBeLessThanOrEqual(1);
      }
    }
    const neutral = centre(0, [solar]);
    const warm = centre(0, [cool]);
    expect(warm.r / warm.b).toBeGreaterThan(neutral.r / neutral.b);
    expect(centre(0, [solar], '#CCCCCC').g).toBeGreaterThan(centre(0, [solar], '#444444').g * 2);
    expect(centre(0, [{ ...solar, irradianceWm2: 0 }])).toEqual({ r: 0, g: 0, b: 0 });
    expect(centre(1e-8, [{ ...solar, irradianceWm2: 0 }])).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('adapts distant atmospheric worlds without losing stellar spectral differences', () => {
    const solar: OrbitStellarSource = {
      id: 'A',
      primary: true,
      brightness: 1,
      relativeFlux: 1,
      colour: '#FFFFFF',
      irradianceWm2: 1361,
      temperatureK: 5772,
      angularRadius: 0.00465,
    };
    /** Sums decoded globe pixels to compare views under different stellar fluxes. */
    const energy = (stellarSources: OrbitStellarSource[], phase: number): number[] => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const planet = createAtmosphericOrbitPlanet();
      createSceneRenderer(buffer).drawOrbitInterface({
        title: '',
        subtitle: '',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [],
        mode: 'overview',
        rotationPhase: 0.35,
        illuminationPhase: phase,
        stellarSources,
        landingCursorX: 0,
        landingCursorY: 0,
        mapSize: 32,
        summary: [],
        footer: [],
      });
      const result = [0, 0, 0];
      for (const call of drawCalls) {
        if (call.char !== GLYPHS.BLOCK || call.scaleX !== 0.5 || call.x >= 40) continue;
        const colour = hexToRgb(call.fg);
        [colour.r, colour.g, colour.b].forEach((value, i) => {
          result[i] += (value / 255) ** 2.2;
        });
      }
      return result;
    };
    for (const phase of [0.9124647812994575, 0.16246478129945752, 0.3617394005527416]) {
      const background = energy([{ ...solar, irradianceWm2: 0 }], phase);
      /** Removes any unlit baseline before comparing exposed planet light. */
      const scattered = (sources: OrbitStellarSource[]): number[] =>
        energy(sources, phase).map((value, i) => value - background[i]);
      const full = scattered([solar]);
      const binary = scattered([solar, { ...solar, id: 'B', primary: false }]);
      for (const distance of [2, 20, 2000]) {
        const distant = scattered([
          {
            ...solar,
            irradianceWm2: 1361 / distance ** 2,
            angularRadius: 0.00465 / distance,
          },
        ]);
        for (let channel = 0; channel < 3; channel++) {
          expect(full[channel]).toBeGreaterThan(0);
          expect(distant[channel] / full[channel]).toBeCloseTo(1, 1);
          expect(binary[channel] / full[channel]).toBeCloseTo(1, 1);
        }
      }
      const cool = scattered([{ ...solar, temperatureK: 3000 }]);
      expect(cool[2] / cool[0]).toBeLessThan(full[2] / full[0]);
    }
  });

  it.each(['GasGiant', 'IceGiant'])('keeps %s cloud detail above the deep atmosphere', (type) => {
    /** Renders the same optical cloud boundary under different deep reference pressures. */
    const render = (pressure: number) => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const planet = type === 'GasGiant' ? createGasGiantPlanet() : createIceGiantPlanet();
      Object.defineProperties(planet, {
        diameter: { value: type === 'GasGiant' ? 140000 : 50000 },
        moons: { value: [] },
        atmosphere: {
          value: {
            density: 'Dense',
            pressure,
            composition: { Hydrogen: 80, Helium: 18, Methane: 2 },
          },
        },
      });
      createSceneRenderer(buffer).drawOrbitInterface({
        title: '',
        subtitle: '',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [],
        mode: 'overview',
        rotationPhase: 0.35,
        illuminationPhase: 0.9124647812994575,
        stellarSources: [
          {
            id: 'A',
            primary: true,
            brightness: 1,
            colour: '#FFFFFF',
            irradianceWm2: 1361 / 400,
            temperatureK: 5772,
            angularRadius: 0.00465 / 20,
          },
        ],
        landingCursorX: 0,
        landingCursorY: 0,
        mapSize: 32,
        summary: [],
        footer: [],
      });
      return drawCalls.filter((call) => call.char === GLYPHS.BLOCK && call.scaleX === 0.5 && call.x < 40);
    };
    const cloud = render(1);
    expect(render(90)).toEqual(cloud);
    expect(new Set(cloud.map((call) => call.fg)).size).toBeGreaterThan(100);
    const coloured = cloud.filter((call) => {
      const { r, g, b } = hexToRgb(call.fg);
      return Math.max(r, g, b) - Math.min(r, g, b) > 30;
    });
    expect(coloured.length).toBeGreaterThan(200);
  });

  it('renders orbital globe samples as solid colour mini-cells instead of shade glyph bands', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer);
    const planet = createAtmosphericOrbitPlanet();
    renderer.drawOrbitInterface({
      title: 'Orbital Operations',
      subtitle: 'Regression Orbit I local space',
      parentPlanet: planet,
      selectedBody: planet,
      bodies: [{ label: 'Primary', planet, selected: true }],
      mode: 'overview',
      stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
      rotationPhase: 0.35,
      illuminationPhase: 0.2,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      summary: ['Regression solid globe.'],
      footer: ['Esc closes orbit.'],
    });

    const globeCalls = drawCalls.filter(
      (call) =>
        call.char === GLYPHS.BLOCK && call.scaleX === 0.5 && call.scaleY === 0.5 && call.fg === call.bg
    );
    const shadeGlyphs = new Set<string>([GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK]);
    const shadeGlobeCalls = drawCalls.filter(
      (call) =>
        shadeGlyphs.has(call.char ?? '') && call.scaleX === 0.5 && call.scaleY === 0.5 && call.fg === call.bg
    );

    expect(globeCalls.length).toBeGreaterThan(200);
    expect(shadeGlobeCalls).toHaveLength(0);
  });

  it('preserves true black when decoding fallback RGB colours', () => {
    const { buffer } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer) as unknown as {
      hexToRgbFallback: (hex: string) => { r: number; g: number; b: number };
    };

    expect(renderer.hexToRgbFallback('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(renderer.hexToRgbFallback('#00000F')).toEqual({ r: 0, g: 0, b: 15 });
  });

  it('anti-aliases only the orbital globe rim by blending covered planet samples to black', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer);
    const planet = createFeaturelessOrbitPlanet('#D8D8D8');
    renderer.drawOrbitInterface({
      title: 'Orbital Operations',
      subtitle: 'Featureless Regression local space',
      parentPlanet: planet,
      selectedBody: planet,
      bodies: [{ label: 'Primary', planet, selected: true }],
      mode: 'overview',
      stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
      rotationPhase: 0,
      // Keep the source close to the camera axis so limb illumination does not
      // dominate this coverage-only anti-alias regression.
      illuminationPhase: 0.9124647812994575,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      summary: ['Featureless globe edge regression.'],
      footer: ['Esc closes orbit.'],
    });

    const sphereCx = 24;
    const sphereCy = 27;
    const sphereRadius = 12;
    const globeCalls = drawCalls
      .filter(
        (call) =>
          call.char === GLYPHS.BLOCK && call.scaleX === 0.5 && call.scaleY === 0.5 && call.fg === call.bg
      )
      .map((call) => ({
        radius: Math.hypot(call.x - sphereCx, call.y - sphereCy),
        luma: hexLuma(call.fg),
      }))
      .filter((sample) => sample.radius <= sphereRadius + 2.01);
    const interior = globeCalls.filter((sample) => sample.radius <= sphereRadius - 3);
    const rim = globeCalls.filter(
      (sample) => sample.radius > sphereRadius && sample.radius <= sphereRadius + 1.5
    );
    const innerRim = globeCalls.filter(
      (sample) => sample.radius >= sphereRadius - 1.5 && sample.radius <= sphereRadius
    );

    expect(interior.length).toBeGreaterThan(100);
    expect(rim.length).toBeGreaterThan(4);
    expect(Math.max(...rim.map((sample) => sample.luma))).toBeLessThan(
      Math.max(...interior.map((sample) => sample.luma)) * 0.65
    );
    expect(Math.max(...innerRim.map((sample) => sample.luma))).toBeGreaterThan(
      Math.max(...rim.map((sample) => sample.luma))
    );
  });

  it('changes visible globe texture as the orbital viewing phase advances', () => {
    /** Renders signature at phase. */
    const renderSignatureAtPhase = (illuminationPhase: number) => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const renderer = createSceneRenderer(buffer);
      const planet = createOrbitPlanet();
      renderer.drawOrbitInterface({
        title: 'Orbital Operations',
        subtitle: 'Regression Orbit I local space',
        parentPlanet: planet,
        selectedBody: planet,
        bodies: [{ label: 'Primary', planet, selected: true }],
        mode: 'overview',
        stellarSources: [{ id: 'A', primary: true, brightness: 1, colour: '#FFFACD' }],
        rotationPhase: 0,
        illuminationPhase,
        landingCursorX: 12,
        landingCursorY: 18,
        mapSize: 32,
        summary: ['Regression moving hemisphere.'],
        footer: ['Esc closes orbit.'],
      });
      return drawCalls
        .filter(
          (call) =>
            call.char === GLYPHS.BLOCK && call.scaleX === 0.5 && call.scaleY === 0.5 && call.fg === call.bg
        )
        .map((call) => `${call.x.toFixed(1)},${call.y.toFixed(1)}:${call.fg}`)
        .slice(0, 400);
    };

    expect(renderSignatureAtPhase(0.1)).not.toEqual(renderSignatureAtPhase(0.35));
  });

  it('moves the visible poles through the orbit without rotating the screen frame', () => {
    const { buffer } = createMockScreenBuffer(80, 40);
    const renderer = createSceneRenderer(buffer) as unknown as {
      transformOrbitViewNormalToBodyFrame: (
        x: number,
        y: number,
        z: number,
        axialTilt: number,
        orbitPhase: number
      ) => { x: number; y: number; z: number };
    };

    const untiltedQuarterOrbit = renderer.transformOrbitViewNormalToBodyFrame(0, 0, 1, 0, Math.PI / 2);
    expect(untiltedQuarterOrbit.x).toBeCloseTo(1, 8);
    expect(untiltedQuarterOrbit.y).toBeCloseTo(0, 8);
    expect(untiltedQuarterOrbit.z).toBeCloseTo(0, 8);

    const northPoleView = renderer.transformOrbitViewNormalToBodyFrame(0, 0, 1, Math.PI / 4, 0);
    expect(northPoleView.x).toBeCloseTo(0, 8);
    expect(northPoleView.y).toBeCloseTo(Math.SQRT1_2, 8);
    expect(northPoleView.z).toBeCloseTo(Math.SQRT1_2, 8);

    const southPoleView = renderer.transformOrbitViewNormalToBodyFrame(0, 0, 1, Math.PI / 4, Math.PI);
    expect(southPoleView.x).toBeCloseTo(0, 8);
    expect(southPoleView.y).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(southPoleView.z).toBeCloseTo(-Math.SQRT1_2, 8);

    const equatorialView = renderer.transformOrbitViewNormalToBodyFrame(0, 0, 1, Math.PI / 4, Math.PI / 2);
    expect(equatorialView.x).toBeCloseTo(1, 8);
    expect(equatorialView.y).toBeCloseTo(0, 8);
    expect(equatorialView.z).toBeCloseTo(0, 8);
  });

  it('places ocean glint near the specular star-view alignment', () => {
    const { buffer } = createMockScreenBuffer(80, 40);
    const renderer = createSceneRenderer(buffer) as any;
    const surface = {
      normal: { x: 0, y: 0, z: 1 },
      albedo: { r: 30, g: 60, b: 90 },
      reflectiveColour: { r: 220, g: 235, b: 255 },
      liquidCoverage: 1,
    };
    const specular = renderer.getOrbitSurfaceReflectance(surface, { x: 0, y: 0, z: 1 });
    const offAngle = renderer.getOrbitSurfaceReflectance(surface, { x: 0.8, y: 0, z: 0.6 });
    expect(specular.r).toBeGreaterThan(offAngle.r * 5);
    expect(specular.b).toBeGreaterThan(offAngle.b * 5);
  });
});
