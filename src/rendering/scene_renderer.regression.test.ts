import { describe, expect, it, vi } from 'vitest';
import { SceneRenderer } from './scene_renderer';
import { DrawingContext } from './drawing_context';
import { ScreenBuffer } from './screen_buffer';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { SolarSystem } from '../entities/solar_system';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS } from '../constants';

type DrawCall = {
  char: string | null;
  x: number;
  y: number;
  fg: string | null | undefined;
  bg: string | null | undefined;
};

function createMockScreenBuffer(cols: number, rows: number): { buffer: ScreenBuffer; drawCalls: DrawCall[] } {
  const drawCalls: DrawCall[] = [];
  const buffer = {
    clear: vi.fn(),
    drawChar: vi.fn((char: string | null, x: number, y: number, fg?: string | null, bg?: string | null) => {
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

  return { buffer, drawCalls };
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
  it('draws subtle background stars during interplanetary travel', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(120, 60);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    player.position.systemX = 1.5e11;
    player.position.systemY = -7.5e10;

    renderer.drawSolarSystem(player, createSystem(), CONFIG.SYSTEM_VIEW_SCALE);

    const backgroundStars = drawCalls.filter(
      (call) => call.char === '.' && call.bg === CONFIG.DEFAULT_BG_COLOUR && typeof call.fg === 'string'
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

    expect(drawCalls.some((call) => call.char === '.')).toBe(false);
    expect(drawCalls.some((call) => call.char === GLYPHS.BLOCK)).toBe(true);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });

  it('keeps starbase interiors free of background star effects', () => {
    const { buffer, drawCalls } = createMockScreenBuffer(100, 54);
    const renderer = createSceneRenderer(buffer);
    const player = new Player();
    const starbase = new Starbase('regression-base', new PRNG('regression-system'), 'Regression');
    starbase.tradeDisplayRows = ['> Water Ice            B 10 S  8 H 0 volatile'];

    renderer.drawPlanetSurface(player, starbase);

    expect(drawCalls.some((call) => call.char === '.')).toBe(false);
    expect(drawCalls.length).toBeGreaterThan(0);
    expect(drawCalls.some((call) => call.char === player.render.char)).toBe(true);
    expect(createRenderSignature(drawCalls)).toMatchSnapshot();
  });
});
