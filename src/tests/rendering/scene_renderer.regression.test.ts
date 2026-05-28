import { describe, expect, it, vi } from 'vitest';
import { SceneRenderer } from '../../rendering/scene_renderer';
import { DrawingContext } from '../../rendering/drawing_context';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { Player } from '../../core/player';
import { Planet } from '../../entities/planet';
import { Starbase } from '../../entities/starbase';
import { SolarSystem } from '../../entities/solar_system';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import { CONFIG } from '../../config';
import { GLYPHS } from '../../constants';

type DrawCall = {
  char: string | null;
  x: number;
  y: number;
  fg: string | null | undefined;
  bg: string | null | undefined;
};

function createMockScreenBuffer(cols: number, rows: number): { buffer: ScreenBuffer; drawCalls: DrawCall[]; stagedFrames: readonly unknown[][] } {
  const drawCalls: DrawCall[] = [];
  const stagedFrames: readonly unknown[][] = [];
  const buffer = {
    clear: vi.fn(),
    stageCells: vi.fn((cells: readonly unknown[]) => {
      stagedFrames.push(cells.slice());
    }),
    drawChar: vi.fn((char: string | null, x: number, y: number, fg?: string | null, bg?: string | null) => {
      drawCalls.push({ char, x, y, fg, bg });
    }),
    drawScaledChar: vi.fn((char: string | null, x: number, y: number, fg?: string | null, bg?: string | null) => {
      drawCalls.push({ char, x, y, fg, bg });
    }),
    drawString: vi.fn((text: string, x: number, y: number, fg?: string | null, bg?: string | null) => {
      for (let index = 0; index < text.length; index++) {
        drawCalls.push({ char: text[index], x: x + index, y, fg, bg });
      }
    }),
    getCols: vi.fn(() => cols),
    getRows: vi.fn(() => rows),
    getDefaultFgColor: vi.fn(() => CONFIG.DEFAULT_FG_COLOUR),
    getDefaultBgColor: vi.fn(() => CONFIG.DEFAULT_BG_COLOUR),
  } as unknown as ScreenBuffer;

  return { buffer, drawCalls, stagedFrames };
}

function createSceneRenderer(buffer: ScreenBuffer): SceneRenderer {
  return new SceneRenderer(
    buffer,
    new DrawingContext(buffer),
    new NebulaRenderer(),
    {} as SystemDataGenerator
  );
}

function createSolidPlanet(): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: 'Regression I' },
    type: { value: 'Rock' },
    heightmap: { value: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 4)) },
    heightLevelColors: {
      value: Array.from({ length: CONFIG.PLANET_HEIGHT_LEVELS }, (_, index) => `#${index.toString(16).padStart(2, '0')}4040`),
    },
    surfaceElementMap: { value: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '')) },
    isMined: { value: () => false },
  });
  return planet;
}

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

function createOrbitPlanet(): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: 'Regression Orbit I' },
    type: { value: 'Rock' },
    heightmap: { value: Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => (x + y) % 8)) },
    heightLevelColors: {
      value: Array.from({ length: CONFIG.PLANET_HEIGHT_LEVELS }, (_, index) => `#${index.toString(16).padStart(2, '0')}7050`),
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

function createSystem(): SolarSystem {
  return {
    name: 'Regression',
    starType: 'G2V',
    architecture: { kind: 'single', stars: [], primaryStarId: 'A', binarySeparation: 0, outerSeparation: 0, habitableLabel: 'A' },
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

describe('SceneRenderer visual regressions', () => {
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
    const callsAfterFirstFrame = mapCalls;
    player.position.worldX += 1;
    renderer.drawHyperspace(player);

    const shiftedCalls = mapCalls - callsAfterFirstFrame;
    const lastFrame = stagedFrames[stagedFrames.length - 1] as Array<{ char: string | null }>;
    const playerGlyphs = lastFrame.filter((cell) => cell.char === player.render.char);
    const centerCell = lastFrame[2 * 7 + 3];

    expect(callsAfterFirstFrame).toBe(35);
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
      (call) => call.char === GLYPHS.STAR_DIM && call.bg === CONFIG.DEFAULT_BG_COLOUR && typeof call.fg === 'string'
    );
    expect(backgroundStars.length).toBeGreaterThan(0);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
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

  it('renders gas giant surfaces with turbulent band and storm variation', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();

    renderer.drawPlanetSurface(player, createGasGiantPlanet());

    const atmosphericCells = drawCalls.filter((call) => call.bg && call.fg === call.bg);
    const uniqueColours = new Set(atmosphericCells.map((call) => call.bg));
    const shadedCells = atmosphericCells.filter((call) =>
      [GLYPHS.SHADE_LIGHT, GLYPHS.SHADE_MEDIUM, GLYPHS.SHADE_DARK].includes(call.char ?? '')
    );

    expect(uniqueColours.size).toBeGreaterThan(30);
    expect(shadedCells.length).toBeGreaterThan(200);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
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
        { id: 'water', cells: ['Water Ice', '12', '3', 'volatile'], detail: 'Bulk water ice for station processing.' },
        { id: 'helium', cells: ['Helium-3', '4', '42', 'fuel'], detail: 'Fusion reserve lots.' },
        { id: 'drones', cells: ['Survey Drones', '2', '180', 'equipment'], detail: 'Autonomous mapping packages.' },
      ],
      selectedIndex: 1,
      viewOffset: 0,
      visibleRowCount: 3,
      footer: ['Cr 1,000   Fuel 500/500   Cargo 0/100', 'Up/Down select  PgUp/PgDn page  Left/Right sections  Enter use  Esc back'],
    });

    expect(drawCalls.some((call) => call.char === 'C')).toBe(true);
    expect(drawCalls.some((call) => call.char === '█')).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('renders reusable modal tables for navigation target selection', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(110, 44);
    const renderer = createSceneRenderer(buffer);

    renderer.drawTextModalTable({
      title: 'Navigation Targets',
      subtitle: 'Regression local target index',
      columns: ['TYPE', 'NAME', 'RANGE', 'BRG'],
      widths: [8, 24, 10, 5],
      rows: [
        { id: 'star:A', cells: ['Star A', 'Regression A', '0.00 AU', 'HERE'], detail: 'Regression A | Star A | one-way signal 0.0 light-sec' },
        { id: 'planet:Regression I', cells: ['Planet', 'I (2 moons)', '1.42 AU', 'NE'], detail: 'Regression I | Planet | one-way signal 11.8 light-min' },
        { id: 'planet:Regression II', cells: ['Planet', 'II (0 moons)', '4.80 AU', 'SW'], detail: 'Regression II | Planet | one-way signal 39.9 light-min' },
      ],
      selectedIndex: 1,
      viewOffset: 0,
      visibleRowCount: 3,
      footer: ['Up/Down select  Enter approach  Esc/Left/Right cancel'],
    });

    expect(drawCalls.some((call) => call.char === '█')).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
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
      rotationPhase: 0.35,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      description: [
        'Regression Orbit I is a stable rocky test body with a restrained scan summary.',
        'Landing map and orbital sphere should remain visually framed.',
      ],
      telemetry: ['Body Regression Orbit I', 'Class Rock | Diameter 11,000 km | Density 5.10 g/cm3', 'Tilt 13.2 deg | Incl 1.7 deg | Free rotation'],
      footer: ['Landing site: arrows move cursor, Enter/Space confirms, Esc cancels.', 'Site X 12  Y 18  Map 32x32'],
    });

    expect(drawCalls.some((call) => call.char === '+')).toBe(true);
    expect(drawCalls.some((call) => call.char === GLYPHS.BLOCK)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });
});
