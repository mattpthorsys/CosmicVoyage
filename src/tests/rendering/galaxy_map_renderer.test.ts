import { describe, expect, it, vi } from 'vitest';
import { MilkyWayModel, type GalaxyFieldSample } from '../../generation/milky_way_model';
import {
  GalaxyMapRenderer,
  getGalaxyFieldColour,
  getGalaxyMapSpans,
} from '../../rendering/galaxy_map_renderer';
import { GalaxyMapController } from '../../core/galaxy_map';
import { ScreenBuffer } from '../../rendering/screen_buffer';

const BASE_FIELD: GalaxyFieldSample = {
  density: 1,
  oldStellarDensity: 1,
  youngStellarDensity: 0,
  bulgeDensity: 0,
  barDensity: 0,
  stellarArmInfluence: 0,
  armInfluence: 0,
  gasDensity: 0,
  dustDensity: 0,
  dustLaneDensity: 0,
  texture: 0.5,
  insideMainDisk: true,
};

/** Converts a rendered hexadecimal colour into numeric RGB channels. */
function parseHex(colour: string): readonly [number, number, number] {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

describe('Galaxy map palette', () => {
  it('does not illuminate empty arm masks or impose a luminous disk edge', () => {
    expect(
      getGalaxyFieldColour({ ...BASE_FIELD, oldStellarDensity: 0, stellarArmInfluence: 1, armInfluence: 1 })
    ).toBeNull();
    const dim = getGalaxyFieldColour({ ...BASE_FIELD, oldStellarDensity: 0.02 });
    expect(Math.max(...parseHex(dim!))).toBeLessThan(3);
    expect(getGalaxyFieldColour({ ...BASE_FIELD, insideMainDisk: false })).toEqual(
      getGalaxyFieldColour(BASE_FIELD)
    );
  });

  it('preserves smooth brightness changes instead of quantizing the disk into rings', () => {
    const colours = new Set(
      Array.from({ length: 100 }, (_, i) =>
        getGalaxyFieldColour({ ...BASE_FIELD, oldStellarDensity: 0.2 + i * 0.025 })
      )
    );
    expect(colours.size).toBeGreaterThan(80);
  });

  it('keeps old stellar light warm while giving young arm complexes a cooler signal', () => {
    const oldColour = getGalaxyFieldColour(BASE_FIELD);
    const youngColour = getGalaxyFieldColour({
      ...BASE_FIELD,
      youngStellarDensity: 0.85,
      stellarArmInfluence: 0.4,
      armInfluence: 1,
    });

    expect(oldColour).not.toBeNull();
    expect(youngColour).not.toBeNull();
    const [oldRed, , oldBlue] = parseHex(oldColour!);
    const [youngRed, , youngBlue] = parseHex(youngColour!);
    expect(oldRed).toBeGreaterThan(oldBlue);
    expect(youngBlue - youngRed).toBeGreaterThan(oldBlue - oldRed);
  });

  it('attenuates dusty arm lanes without turning their pixels into hard black contours', () => {
    const clearColour = getGalaxyFieldColour({
      ...BASE_FIELD,
      youngStellarDensity: 0.7,
      armInfluence: 1,
    });
    const dustyColour = getGalaxyFieldColour({
      ...BASE_FIELD,
      youngStellarDensity: 0.7,
      armInfluence: 1,
      dustDensity: 1,
      dustLaneDensity: 1,
    });

    expect(clearColour).not.toBeNull();
    expect(dustyColour).not.toBeNull();
    const clearBrightness = parseHex(clearColour!).reduce((sum, channel) => sum + channel, 0);
    const dustyBrightness = parseHex(dustyColour!).reduce((sum, channel) => sum + channel, 0);
    expect(dustyBrightness).toBeLessThan(clearBrightness);
    expect(dustyBrightness).toBeGreaterThan(0);
  });
});

/** Creates a real staging buffer with a recording canvas for raster contract tests. */
function createRasterHarness(cols: number, rows: number) {
  const context = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
  };
  const buffer = new ScreenBuffer(
    { width: cols * 8, height: rows * 8 } as HTMLCanvasElement,
    context as unknown as CanvasRenderingContext2D,
    false
  );
  buffer.updateDimensions(cols, rows, 8, 8);
  const pixels = vi.spyOn(buffer, 'drawScaledChar');
  const galaxy = new MilkyWayModel('haunting beauty');
  const samples = vi.spyOn(galaxy, 'sampleGalaxyField');
  const renderer = new GalaxyMapRenderer(buffer, galaxy);
  const model = new GalaxyMapController().createModel(galaxy, 0, 0);
  return { buffer, context, pixels, samples, renderer, model };
}

describe('Galaxy raster', () => {
  it.each([
    [100, 70],
    [48, 90],
    [40, 24],
  ])('clips all half-cell pixels and crosshair ticks in a %ix%i viewport', (cols, rows) => {
    const { renderer, model, pixels, buffer, context } = createRasterHarness(cols, rows);
    const spans = getGalaxyMapSpans(model.spanPc, (cols - 4) * 2, (rows - 9) * 2);
    expect(Math.min(spans.horizontalSpanPc, spans.verticalSpanPc)).toBe(model.spanPc);
    expect(spans.horizontalSpanPc / (cols - 4)).toBeCloseTo(spans.verticalSpanPc / (rows - 9), 8);
    // Place the crosshair at the upper left: its outer ticks must not paint the frame.
    renderer.draw({ ...model, playerXpc: -spans.horizontalSpanPc / 2, playerYpc: spans.verticalSpanPc / 2 });
    expect(pixels.mock.calls.filter((call) => call[3] === '#5FFFF0')).toHaveLength(5);
    expect(pixels.mock.calls.length).toBeGreaterThan(100);
    for (const [, x, y, , , width, height] of pixels.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(cols - 2);
      expect(y).toBeGreaterThanOrEqual(3);
      expect(y).toBeLessThan(rows - 6);
      expect(width).toBe(0.5);
      expect(height).toBe(0.5);
    }
    buffer.renderFull();
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.fillText.mock.calls.some(([text]) => String(text).includes('MILKY WAY'))).toBe(true);
  });

  it('reuses static samples for player movement and invalidates them for pan, zoom, resize and explicit clearing', () => {
    const { renderer, model, samples, buffer } = createRasterHarness(40, 24);
    renderer.draw(model);
    expect(samples).toHaveBeenCalledTimes(36 * 2 * 15 * 2);
    samples.mockClear();
    renderer.draw({ ...model, playerXpc: 500 });
    expect(samples).not.toHaveBeenCalled();
    for (const changed of [{ ...model, centerXpc: 100 }, { ...model, spanPc: 16000 }, model]) {
      samples.mockClear();
      renderer.draw(changed);
      expect(samples).toHaveBeenCalledTimes(36 * 2 * 15 * 2);
    }
    samples.mockClear();
    buffer.updateDimensions(48, 28, 8, 8);
    renderer.draw(model);
    expect(samples).toHaveBeenCalledTimes(44 * 2 * 19 * 2);
    samples.mockClear();
    renderer.clearCache();
    renderer.draw(model);
    expect(samples).toHaveBeenCalledTimes(44 * 2 * 19 * 2);
  });

  it('matches the reviewed default-seed raster fingerprint, including colours and projected positions', () => {
    const { renderer, model, pixels } = createRasterHarness(80, 60);
    renderer.draw(model);
    let hash = 2166136261;
    for (const character of JSON.stringify(pixels.mock.calls)) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    expect({ pixels: pixels.mock.calls.length, hash: hash >>> 0 }).toMatchSnapshot();
  });
});
