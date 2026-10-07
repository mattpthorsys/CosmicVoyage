import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { GLYPHS } from '../../constants/visual';
import type { OrbitScreenModel } from '../../core/orbit_ui';
import { Player } from '../../core/player';
import { Planet } from '../../entities/planet';
import type { SurfaceSettlementLayer } from '../../entities/planet/surface_settlements';
import type { SystemDataGenerator } from '../../generation/system_data_generator';
import { DrawingContext } from '../../rendering/drawing_context';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { SceneRenderer, type SurfaceVehicleOverlayModel } from '../../rendering/scene_renderer';
import { createPlayerViewSnapshot } from '../../rendering/scene_view_model';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { projectSettlementLandingSite } from '../../rendering/scenes/settlement_surface_renderer';
import { TEXT_PALETTE } from '../../rendering/text_palette';
import { settlementLayerFixture, settlementTerrainFixture } from '../fixtures/settlements';

interface MapHooks {
  drawOrbitLandingMap(model: OrbitScreenModel, x: number, y: number, width: number, height: number): void;
  getOrbitLandingMapColours(
    planet: Planet,
    map: number[][],
    colours: string[],
    liquid: null,
    palette: string[],
    width: number,
    height: number,
    materials: null,
    settlements: SurfaceSettlementLayer | null
  ): string[];
  getSurfaceViewport(cols: number, rows: number): { x: number; y: number; width: number; height: number };
}

/** Exercises the real buffer's compositing and clipping, recording its actual rectangle output. */
function display(cols = 120, rows = 64) {
  const context = {
    font: '',
    textBaseline: '',
    fillStyle: '',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
  };
  const canvas = { width: cols * 8, height: rows * 8 } as HTMLCanvasElement;
  const buffer = new ScreenBuffer(canvas, context as unknown as CanvasRenderingContext2D);
  buffer.updateDimensions(cols, rows, 8, 8);
  const renderer = new SceneRenderer(
    buffer,
    new DrawingContext(buffer),
    new NebulaRenderer(),
    {} as SystemDataGenerator
  );
  // Test-only hooks retain the production implementation while exposing map cache identity.
  const hooks = renderer as unknown as MapHooks;
  return {
    buffer,
    context,
    renderer,
    hooks,
    ground: vi.spyOn(buffer, 'drawChar'),
    raster: vi.spyOn(buffer, 'drawScaledChar'),
    viewport: hooks.getSurfaceViewport(cols, rows),
  };
}

/** Supplies ready terrain and decorative metadata without invoking generation from a frame. */
function planetFixture(
  layer = settlementLayerFixture([{ x: 35, y: 32, coverage: 0.8, emission: 0.4, siteIndex: 0 }])
) {
  const planet = Object.create(Planet.prototype) as Planet;
  const map = settlementTerrainFixture('dry').heightmap;
  const colours = Array<string>(CONFIG.PLANET_HEIGHT_LEVELS).fill('#4D7660');
  const resources = Array.from({ length: 65 }, () => Array<string>(65).fill(''));
  Object.defineProperties(planet, {
    name: { value: 'Settlement fixture' },
    type: { value: 'Rock' },
    heightmap: { value: map },
    heightLevelColors: { value: colours },
    surfaceElementMap: { value: resources },
    settlements: { value: layer, writable: true },
    isMined: { value: () => false },
  });
  const player = new Player();
  player.position.surfaceX = 32;
  player.position.surfaceY = 32;
  return { planet, map, colours, resources, layer, player };
}

/** Builds the existing map contract without requiring unrelated planetary statistics. */
function orbitModel(planet: Planet, x: number, y: number): OrbitScreenModel {
  return {
    title: 'Orbital Operations',
    subtitle: '',
    parentPlanet: planet,
    selectedBody: planet,
    bodies: [],
    mode: 'landing',
    stellarSources: [],
    rotationPhase: 0,
    illuminationPhase: 0,
    landingCursorX: x,
    landingCursorY: y,
    mapSize: 65,
    summary: [],
    footer: [],
  };
}

/** Supplies normal surface controls at fixed positions over settlement artwork. */
function vehicleOverlay(): SurfaceVehicleOverlayModel {
  return {
    dateTime: '2200-01-01',
    notifications: [],
    deployed: true,
    moving: false,
    available: true,
    onFoot: false,
    fuel: 100,
    maxFuel: 100,
    cargo: 0,
    cargoCapacity: 20,
    selectedIndex: 0,
    items: [],
    crew: [],
    surfaceCellScale: 3,
    ship: { x: 2, y: 0 },
    scanCursor: { dx: -2, dy: 1 },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('production landing-map and surface city rendering', () => {
  it('places the landing cursor on the shared site without rebuilding the map when the cursor moves', () => {
    const { hooks, raster } = display();
    const { planet, map, colours, layer } = planetFixture();
    const args: Parameters<MapHooks['getOrbitLandingMapColours']> = [
      planet,
      map,
      colours,
      null,
      [],
      88,
      72,
      null,
      layer,
    ];
    const cached = hooks.getOrbitLandingMapColours(...args);
    const site = layer.sites[0];
    const centre = projectSettlementLandingSite(site, 65, 65, 88, 72);
    expect(cached[centre.y * 88 + centre.x]).toBe('#F1C98B');
    hooks.drawOrbitLandingMap(orbitModel(planet, Math.floor(site.x), Math.floor(site.y)), 2, 2, 44, 36);
    expect(raster.mock.calls.filter(([char]) => char === '+')).toEqual([
      [
        '+',
        2 + centre.x * 0.5,
        2 + centre.y * 0.5,
        TEXT_PALETTE.inverseText,
        TEXT_PALETTE.cyanActive,
        0.5,
        0.5,
      ],
    ]);
    hooks.drawOrbitLandingMap(orbitModel(planet, 10, 10), 2, 2, 44, 36);
    expect(hooks.getOrbitLandingMapColours(...args)).toBe(cached);
    expect(cached[centre.y * 88 + centre.x]).toBe('#F1C98B');
  });

  it('refreshes cached symbols on city arrival, removal, replacement, revision and viewport resize', () => {
    const { hooks } = display();
    const { planet, map, colours, layer } = planetFixture();
    /** Reads the production cache with selectable settlement metadata and raster dimensions. */
    const read = (cities: SurfaceSettlementLayer | null, width = 32) =>
      hooks.getOrbitLandingMapColours(planet, map, colours, null, [], width, 32, null, cities);
    const natural = read(null);
    const inhabited = read(layer);
    expect(inhabited).not.toBe(natural);
    expect(inhabited).not.toEqual(natural);
    expect(read(layer)).toBe(inhabited);
    const replaced = read({ ...layer });
    expect(replaced).not.toBe(inhabited);
    expect(replaced).toEqual(inhabited);
    const original = read(layer);
    Object.assign(layer, { version: layer.version + 1 });
    expect(read(layer)).not.toBe(original);
    const resized = read(layer, 16);
    expect(resized).toHaveLength(16 * 32);
    expect(read(null)).toEqual(natural);
  });

  it.each([
    [120, 64],
    [40, 45],
  ])('keeps artwork within the %sx%s travel viewport and leaves natural cells unchanged', (cols, rows) => {
    const { buffer, renderer, raster, ground, viewport } = display(cols, rows);
    const { planet, player } = planetFixture();
    buffer.clear(true);
    renderer.drawPlanetSurface(createPlayerViewSnapshot(player), planet);
    const originalGround = ground.mock.calls.slice();
    expect(raster.mock.calls.length).toBeGreaterThan(0);
    for (const [, x, y, , , sx, sy] of raster.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(viewport.x);
      expect(y).toBeGreaterThanOrEqual(viewport.y);
      expect(x + sx!).toBeLessThanOrEqual(viewport.x + viewport.width);
      expect(y + sy!).toBeLessThanOrEqual(viewport.y + viewport.height);
    }
    ground.mockClear();
    raster.mockClear();
    Object.defineProperty(planet, 'settlements', { value: null });
    buffer.clear(false);
    renderer.drawPlanetSurface(createPlayerViewSnapshot(player), planet);
    expect(raster.mock.calls).toEqual([]);
    expect(ground.mock.calls).toEqual(originalGround);
    expect(ground.mock.calls.some(([char]) => char === GLYPHS.STAR_DIM)).toBe(false);
  });

  it('moves the same prepared city with the ground rather than leaving a screen-fixed decoration', () => {
    const { buffer, renderer, raster } = display();
    const { planet, player } = planetFixture();
    buffer.clear(true);
    renderer.drawPlanetSurface(createPlayerViewSnapshot(player), planet);
    const original = raster.mock.calls.slice();
    raster.mockClear();
    player.position.surfaceX++;
    buffer.clear(false);
    renderer.drawPlanetSurface(createPlayerViewSnapshot(player), planet);
    expect(raster.mock.calls).toEqual(original.map(([char, x, y, ...rest]) => [char, x - 3, y, ...rest]));
  });

  it.each([
    [120, 64],
    [40, 45],
  ])('composites actual city rectangles below foreground glyphs at %sx%s', (cols, rows) => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const cells = Array.from({ length: 11 }, (_, row) =>
      Array.from({ length: 15 }, (_, col) => ({
        x: 25 + col,
        y: 27 + row,
        coverage: 0.8,
        emission: 0.4,
        siteIndex: 0,
      }))
    ).flat();
    const { planet, player, resources } = planetFixture(settlementLayerFixture(cells));
    resources[30][30] = 'Iron';
    const { buffer, renderer, context, ground } = display(cols, rows);
    buffer.clear(true);
    renderer.drawPlanetSurface(createPlayerViewSnapshot(player), planet, vehicleOverlay());
    buffer.renderFull();
    // Half-cell blocks are emitted after the terminal pass by the real buffer;
    // these rectangles, rather than only draw order, must avoid foreground cells.
    const cityPixels = context.fillRect.mock.calls.filter(([, , , height]) => height === 4);
    expect(cityPixels.length).toBeGreaterThan(0);
    const foreground = ground.mock.calls.filter(
      ([char]) => char !== GLYPHS.BLOCK && (char ?? '').trim().length > 0
    );
    expect(foreground.some(([char]) => char === '%')).toBe(true);
    expect(foreground.some(([char]) => char === 'S')).toBe(true);
    expect(foreground.some(([char]) => char === '^')).toBe(true);
    for (const [, x, y] of foreground) {
      expect(
        cityPixels.some(
          ([px, py, width, height]) =>
            px < (x + 1) * 8 && px + width > x * 8 && py < (y + 1) * 8 && py + height > y * 8
        )
      ).toBe(false);
    }
  });
});
