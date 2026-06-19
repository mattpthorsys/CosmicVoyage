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
import { AU_IN_METERS, GLYPHS } from '../../constants';
import { TEXT_PALETTE } from '../../rendering/text_palette';
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
    drawChar: vi.fn((char: string | null, x: number, y: number, fg?: string | null, bg?: string | null) => {
      drawCalls.push({ char, x, y, fg, bg });
    }),
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
function createFeaturelessOrbitPlanet(colour: string = '#B8B8B8'): Planet {
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
    atmosphere: { value: { density: 'None', pressure: 0, composition: {} } },
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
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
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
      columns: ['TYPE', 'NAME', 'RANGE', 'BRG'],
      widths: [8, 24, 10, 5],
      rows: [
        {
          id: 'star:A',
          cells: ['Star A', 'Regression A', '0.00 AU', 'HERE'],
          detail: 'Regression A | Star A | one-way signal 0.0 light-sec',
        },
        {
          id: 'planet:Regression I',
          cells: ['Planet', 'I (2 moons)', '1.42 AU', 'NE'],
          detail: 'Regression I | Planet | one-way signal 11.8 light-min',
        },
        {
          id: 'planet:Regression II',
          cells: ['Planet', 'II (0 moons)', '4.80 AU', 'SW'],
          detail: 'Regression II | Planet | one-way signal 39.9 light-min',
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

    const renderedRows = renderTextRows(drawCalls);
    expect(renderedRows.join('\n')).toContain('DRIVE TRUNK');
    expect(renderedRows.join('\n')).not.toContain('VESSEL DIAGRAM');
    expect(drawCalls.some((call) => call.char === 'D' && call.fg === TEXT_PALETTE.green)).toBe(true);
    expect(drawCalls.some((call) => call.char === '[' && call.fg === TEXT_PALETTE.amber)).toBe(true);
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

    const seamSample = renderer.sampleWrappedHeight(heightmap, 0.99, 0.5);
    const nearStartSample = renderer.sampleWrappedHeight(heightmap, 0.01, 0.5);

    expect(seamSample.height).toBeLessThan(50);
    expect(nearStartSample.height).toBeLessThan(50);
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
      description: [
        'Regression Orbit I is a stable rocky test body with a restrained scan summary.',
        'Landing map and orbital sphere should remain visually framed.',
      ],
      telemetry: [
        'Body Regression Orbit I',
        'Class Rock | Diameter 11,000 km | Density 5.10 g/cm3',
        'Tilt 13.2 deg | Incl 1.7 deg | Free rotation',
      ],
      footer: [
        'Landing site: arrows move cursor, Enter/Space confirms, Esc cancels.',
        'Site X 12  Y 18  Map 32x32',
      ],
    });

    expect(drawCalls.some((call) => call.char === '+')).toBe(true);
    expect(drawCalls.some((call) => call.char === GLYPHS.BLOCK)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
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
        { id: 'B', primary: false, brightness: 0.4, colour: '#FFC864' },
      ],
      rotationPhase: 0.35,
      illuminationPhase: 0.555,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      description: ['Regression limb marker.'],
      telemetry: ['Body Regression Orbit I'],
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
        description: ['Regression horizon marker.'],
        telemetry: ['Body Regression Orbit I'],
        footer: ['Esc closes orbit.'],
      });
      return drawCalls;
    };

    const leftMarker = renderAtPhase(0.27).find((call) => call.char === GLYPHS.STELLAR_SOURCE);
    const rightMarker = renderAtPhase(0.555).find((call) => call.char === GLYPHS.STELLAR_SOURCE);

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
        description: ['Regression occultation marker.'],
        telemetry: ['Body Regression Orbit I'],
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
      description: ['Regression occultation marker.'],
      telemetry: ['Body Regression Orbit I'],
      footer: ['Esc closes orbit.'],
    });

    expect(drawCalls.some((call) => call.char === GLYPHS.STELLAR_SOURCE)).toBe(false);
    expect(drawAtPhase(0.4).some((call) => call.char === GLYPHS.STELLAR_SOURCE)).toBe(false);
  });

  it('adds a fading atmospheric horizon glow near orbital sunrise and sunset', () => {
    /** Renders at phase. */
    const renderAtPhase = (illuminationPhase: number, atmospheric = true): DrawCall[] => {
      const { buffer, drawCalls } = createMockScreenBuffer(132, 58);
      const renderer = createSceneRenderer(buffer);
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
        description: ['Regression atmospheric horizon.'],
        telemetry: ['Body Regression Orbit I'],
        footer: ['Esc closes orbit.'],
      });
      return drawCalls;
    };

    /** Counts rendered cells in the left atmospheric horizon band. */
    const countLeftHorizonBand = (calls: DrawCall[]): number =>
      calls.filter(
        (call) =>
          call.char === GLYPHS.BLOCK &&
          call.scaleX === 0.5 &&
          call.scaleY === 0.5 &&
          call.y >= 15 &&
          call.y <= 39 &&
          call.x >= 11 &&
          call.x <= 13.5
      ).length;
    /** Counts atmosphere cells extending beyond the solid globe. */
    const countAtmosphericExtra = (illuminationPhase: number): number =>
      countLeftHorizonBand(renderAtPhase(illuminationPhase)) -
      countLeftHorizonBand(renderAtPhase(illuminationPhase, false));
    const horizonExtra = countAtmosphericExtra(0.278);
    const oldShadeGlyphs = renderAtPhase(0.278).filter(
      (call) =>
        (call.char === GLYPHS.SHADE_LIGHT || call.char === GLYPHS.SHADE_MEDIUM) &&
        call.scaleX === 0.5 &&
        call.scaleY === 0.5
    );

    expect(horizonExtra).toBeGreaterThan(2);
    expect(oldShadeGlyphs).toHaveLength(0);
    expect(countAtmosphericExtra(0.31)).toBeLessThan(horizonExtra);
    expect(countAtmosphericExtra(0.4)).toBeLessThan(2);
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
      description: ['Regression solid globe.'],
      telemetry: ['Body Regression Orbit I'],
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
      illuminationPhase: 0.2,
      landingCursorX: 12,
      landingCursorY: 18,
      mapSize: 32,
      description: ['Featureless globe edge regression.'],
      telemetry: ['Body Featureless Regression'],
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

  it('compresses atmospheric globe highlights without affecting airless worlds', () => {
    const { buffer } = createMockScreenBuffer(132, 58);
    const renderer = createSceneRenderer(buffer) as unknown as {
      capAtmosphericGlobeHighlight: (
        planet: Planet,
        colour: { r: number; g: number; b: number },
        lightGlyph: number
      ) => { r: number; g: number; b: number };
    };
    const atmosphericPlanet = createAtmosphericOrbitPlanet();
    const airlessPlanet = createOrbitPlanet();
    Object.defineProperty(airlessPlanet, 'atmosphere', {
      value: { density: 'None', pressure: 0, composition: {} },
    });
    const bright = { r: 245, g: 235, b: 220 };

    const atmospheric = renderer.capAtmosphericGlobeHighlight(atmosphericPlanet, bright, 0.98);
    const airless = renderer.capAtmosphericGlobeHighlight(airlessPlanet, bright, 0.98);

    expect(atmospheric.r).toBeLessThan(bright.r);
    expect(atmospheric.g).toBeLessThan(bright.g);
    expect(airless).toEqual(bright);
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
        stellarSources: [],
        rotationPhase: 0,
        illuminationPhase,
        landingCursorX: 12,
        landingCursorY: 18,
        mapSize: 32,
        description: ['Regression moving hemisphere.'],
        telemetry: ['Body Regression Orbit I'],
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
    const subsolarLongitude = -0.55;
    const subsolarLatitude = 0.12;
    const cosSunLat = Math.cos(subsolarLatitude);
    const sunVector = {
      x: cosSunLat * Math.sin(subsolarLongitude),
      y: Math.sin(subsolarLatitude),
      z: cosSunLat * Math.cos(subsolarLongitude),
    };
    const halfLength = Math.hypot(sunVector.x, sunVector.y, sunVector.z + 1);
    const specularLongitude = Math.atan2(sunVector.x / halfLength, (sunVector.z + 1) / halfLength);
    const specularLatitude = Math.asin(sunVector.y / halfLength);

    const specular = renderer.calculateLiquidGlint(specularLongitude, specularLatitude, 0.98);
    const offAngle = renderer.calculateLiquidGlint(specularLongitude + 1.2, specularLatitude + 0.45, 0.98);

    expect(specular).toBeGreaterThan(0.05);
    expect(offAngle).toBeLessThan(specular * 0.1);
  });
});
