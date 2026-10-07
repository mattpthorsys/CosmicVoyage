import { afterEach, describe, expect, it, vi } from 'vitest';
import { Planet } from '../../entities/planet';
import { SolarSystem } from '../../entities/solar_system';
import type { SurfaceData } from '../../entities/planet/surface_generator';
import {
  getSurfaceGenerationProvider,
  setSurfaceGenerationProvider,
} from '../../entities/planet/surface_generation_provider';
import type { SurfaceSettlementLayer } from '../../entities/planet/surface_settlements';
import { Player } from '../../core/player';
import { createOrbitScreenModel } from '../../core/orbit_ui';
import { PRNG } from '../../utils/prng';
import { AU_IN_METERS } from '../../constants/physics';
import { GLYPHS } from '../../constants/visual';
import { CONFIG } from '../../config';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { SceneRenderer } from '../../rendering/scene_renderer';
import { RendererFacade } from '../../rendering/renderer_facade';
import { DrawingContext } from '../../rendering/drawing_context';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { createPlayerViewSnapshot } from '../../rendering/scene_view_model';
import { rasterBufferFixture, type RasterFrame } from '../fixtures/raster_buffer';
import {
  settlementLayerFixture,
  settlementTerrainFixture,
  settlementTerraformingFixture,
} from '../fixtures/settlements';

const originalProvider = getSurfaceGenerationProvider();
afterEach(() => {
  setSurfaceGenerationProvider(originalProvider);
  vi.restoreAllMocks();
});

/** Provides enough bounded regional artwork to test masking both inside and outside a popup. */
function cityLayer(): SurfaceSettlementLayer {
  return settlementLayerFixture(
    Array.from({ length: 11 }, (_, row) =>
      Array.from({ length: 15 }, (_, col) => ({
        x: 25 + col,
        y: 27 + row,
        coverage: 0.8,
        emission: 0.4,
        siteIndex: 0,
      }))
    ).flat()
  );
}

/** Prepares a real Planet through its generation boundary using controlled dry surface inputs. */
function preparedPlanet(layer: SurfaceSettlementLayer | null = cityLayer()) {
  const surface: SurfaceData = {
    heightmap: settlementTerrainFixture('dry').heightmap,
    heightLevelColors: Array<string>(256).fill('#4D7660'),
    surfaceElementMap: Array.from({ length: 65 }, () => Array<string>(65).fill('')),
    rgbPaletteCache: null,
    liquidOverlay: null,
    settlements: layer,
  };
  const planet = new Planet(
    'Transition colony',
    'Rock',
    AU_IN_METERS,
    0,
    new PRNG('city-transitions'),
    'G2V'
  );
  setSurfaceGenerationProvider({ generateSurfaceData: () => surface });
  planet.ensureSurfaceReady();
  return { planet, surface };
}

/** Uses actual scene and buffer compositing on independent terminal and raster canvas adapters. */
function display(cols = 120, rows = 64) {
  const capture = rasterBufferFixture(cols, rows);
  const root = new PRNG(CONFIG.SEED);
  const generator = new SystemDataGenerator(root);
  const context = new DrawingContext(capture.buffer);
  const renderer = new SceneRenderer(capture.buffer, context, new NebulaRenderer(), generator);
  const facade = Object.assign(Object.create(RendererFacade.prototype), {
    screenBuffer: capture.buffer,
    drawingContext: context,
  }) as RendererFacade;
  const player = new Player();
  player.position.surfaceX = player.position.surfaceY = 32;
  return { ...capture, renderer, facade, player, generator, root };
}

/** Counts visible raster pixels in terminal-cell bounds to detect stale artwork or invalid masking. */
function opaqueCount(
  frame: RasterFrame,
  rect?: { x: number; y: number; width: number; height: number }
): number {
  let count = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (
        rect &&
        (x < rect.x * 2 ||
          x >= (rect.x + rect.width) * 2 ||
          y < rect.y * 2 ||
          y >= (rect.y + rect.height) * 2)
      )
        continue;
      if (frame.data[(y * frame.width + x) * 4 + 3]) count++;
    }
  }
  return count;
}

/** Creates ordinary orbital operations without introducing a scan or generating surface data. */
function orbitModel(planet: Planet) {
  return createOrbitScreenModel({
    parentPlanet: planet,
    selectedBody: planet,
    selectedIndex: 0,
    mode: 'landing',
    landingCursorX: 32,
    landingCursorY: 32,
    rotationPhase: 0,
    illuminationPhase: 0,
  });
}

describe('settlement scene transitions', () => {
  it.each([
    ['opening', 0.65],
    ['active', 1],
    ['closing', 0.65],
  ] as const)('masks the %s popup and restores the exact city raster on close', (state, progress) => {
    const { planet } = preparedPlanet();
    const { buffer, renderer, facade, player, frame } = display();
    const snapshot = createPlayerViewSnapshot(player);
    const masks = vi.spyOn(buffer, 'occludeScaledGlyphs');
    renderer.drawPlanetSurface(snapshot, planet);
    buffer.renderFull();
    const before = frame();
    renderer.drawPlanetSurface(snapshot, planet);
    facade.drawPopup(
      ['SETTLEMENT SURVEY', ...Array<string>(12).fill('Prepared regional structures and pads')],
      state,
      progress,
      1000
    );
    const [x, y, width, height] = masks.mock.calls.at(-1)!;
    const rect = { x, y, width, height };
    expect(opaqueCount(before, rect)).toBeGreaterThan(0);
    buffer.renderDiff();
    expect(opaqueCount(frame(), rect)).toBe(0);
    expect(opaqueCount(frame())).toBeGreaterThan(0);
    renderer.drawPlanetSurface(snapshot, planet);
    buffer.renderDiff();
    expect(frame()).toEqual(before);
  });

  it('clears city pixels on loading and a switch to a city-free body, then restores them without streaks', () => {
    const { planet } = preparedPlanet();
    const natural = preparedPlanet(null).planet;
    const { buffer, renderer, player, frame } = display();
    const snapshot = createPlayerViewSnapshot(player);
    renderer.drawPlanetSurface(snapshot, planet);
    buffer.renderFull();
    const inhabited = frame();
    expect(opaqueCount(inhabited)).toBeGreaterThan(0);
    renderer.drawSurfaceLoading(planet.name);
    buffer.renderDiff();
    expect(opaqueCount(frame())).toBe(0);
    renderer.drawPlanetSurface(snapshot, natural);
    buffer.renderDiff();
    expect(opaqueCount(frame())).toBe(0);
    renderer.drawPlanetSurface(snapshot, planet);
    buffer.renderDiff();
    expect(frame()).toEqual(inhabited);
  });

  it('reframes cities after resize and matches a freshly created renderer at the new dimensions', () => {
    const { planet } = preparedPlanet();
    const current = display();
    const snapshot = createPlayerViewSnapshot(current.player);
    current.renderer.drawPlanetSurface(snapshot, planet);
    current.buffer.renderFull();
    current.resize(40, 45);
    current.renderer.clearCaches();
    current.renderer.drawPlanetSurface(snapshot, planet);
    current.buffer.renderFull();
    const fresh = display(40, 45);
    fresh.renderer.drawPlanetSurface(snapshot, planet);
    fresh.buffer.renderFull();
    expect(opaqueCount(current.frame())).toBeGreaterThan(0);
    expect(current.frame()).toEqual(fresh.frame());
  });

  it('discards both old-grid staged artwork and masks if resize interrupts a frame', () => {
    const f = rasterBufferFixture(4, 4);
    f.buffer.drawScaledChar(GLYPHS.BLOCK, 0, 0, '#123456', '#123456', 0.5, 0.5);
    f.buffer.occludeScaledGlyphs(1, 0, 1, 1);
    f.resize(2, 2);
    f.buffer.drawScaledChar(GLYPHS.BLOCK, 1, 0, '#FEDCBA', '#FEDCBA', 0.5, 0.5);
    f.buffer.renderFull();
    const result = f.frame();
    expect(opaqueCount(result)).toBe(1);
    expect([...result.data.slice(8, 12)]).toEqual([254, 220, 186, 255]);
  });

  it('clears every city raster pixel on return to ordinary system travel', () => {
    const { planet } = preparedPlanet();
    const f = display();
    const snapshot = createPlayerViewSnapshot(f.player);
    f.renderer.drawPlanetSurface(snapshot, planet);
    f.buffer.renderFull();
    expect(opaqueCount(f.frame())).toBeGreaterThan(0);
    const x = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
    const y = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
    const system = new SolarSystem(f.generator.getSystemProperties(x, y), x, y, f.root);
    f.renderer.drawSolarSystem(snapshot, system, AU_IN_METERS / 10);
    f.buffer.renderDiff();
    expect(opaqueCount(f.frame())).toBe(0);
  });

  it('keeps warm orbital textures across view invalidation and rebuilds only changed surface inputs', () => {
    const { planet } = preparedPlanet();
    const f = display();
    const textures = (
      f.renderer as unknown as {
        solidPlanetOrbitTextureRenderer: { buildBaseLevel: (...args: unknown[]) => unknown };
      }
    ).solidPlanetOrbitTextureRenderer;
    const build = vi.spyOn(textures, 'buildBaseLevel');
    f.renderer.prepareOrbitAssets([planet]);
    f.renderer.drawOrbitInterface(orbitModel(planet));
    f.buffer.renderFull();
    expect(build).toHaveBeenCalledOnce();
    f.resize(100, 54);
    f.renderer.clearCaches();
    f.renderer.drawOrbitInterface(orbitModel(planet));
    f.buffer.renderFull();
    expect(build).toHaveBeenCalledOnce();
    planet.applyTerraforming(settlementTerraformingFixture('partial'));
    const ensure = vi.spyOn(planet, 'ensureSurfaceReady');
    const prepare = vi.spyOn(planet, 'prepareSurfaceReady');
    f.renderer.prepareOrbitAssets([planet]);
    f.renderer.drawOrbitInterface(orbitModel(planet));
    expect(ensure).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledOnce();
    planet.ensureSurfaceReady();
    f.renderer.prepareOrbitAssets([planet]);
    // This controlled provider retains identical source identities; the valid
    // cached texture can be reused even though the Planet's request revision changed.
    expect(build).toHaveBeenCalledOnce();
    const replacement = preparedPlanet(null).surface;
    setSurfaceGenerationProvider({ generateSurfaceData: () => replacement });
    planet.applyTerraforming(settlementTerraformingFixture('complete'));
    planet.ensureSurfaceReady();
    f.renderer.prepareOrbitAssets([planet]);
    f.renderer.drawOrbitInterface(orbitModel(planet));
    expect(build).toHaveBeenCalledTimes(2);
  });
});
