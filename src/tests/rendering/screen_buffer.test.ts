import { describe, expect, it, vi } from 'vitest';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { GLYPHS } from '../../constants';
import { CONFIG } from '../../config';

/** Creates buffer. */
function createBuffer(
  cols: number,
  rows: number
): {
  buffer: ScreenBuffer;
  ctx: {
    font: string;
    clearRect: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
  };
} {
  const ctx = {
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
  const canvas = { width: cols * 8, height: rows * 8 };
  const buffer = new ScreenBuffer(
    canvas as HTMLCanvasElement,
    ctx as unknown as CanvasRenderingContext2D,
    false
  );
  buffer.updateDimensions(cols, rows, 8, 8);
  return { buffer, ctx };
}

describe('ScreenBuffer rendering', () => {
  it('preserves rendered state across staging clears for diff rendering', () => {
    const { buffer, ctx } = createBuffer(4, 2);

    buffer.clear(true);
    buffer.drawChar('@', 1, 0, '#00FF00', '#000000');
    buffer.renderFull();

    ctx.fillRect.mockClear();
    ctx.fillText.mockClear();

    buffer.clear(false);
    buffer.drawChar('@', 1, 0, '#00FF00', '#000000');
    buffer.renderDiff();

    expect(buffer.getLastRenderStats().cellsDrawn).toBe(0);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('diff renders only changed cells after a staging clear', () => {
    const { buffer, ctx } = createBuffer(4, 2);

    buffer.clear(true);
    buffer.drawChar('@', 1, 0, '#00FF00', '#000000');
    buffer.renderFull();

    ctx.fillRect.mockClear();
    ctx.fillText.mockClear();

    buffer.clear(false);
    buffer.drawChar('#', 1, 0, '#00FFFF', '#000000');
    buffer.renderDiff();

    expect(buffer.getLastRenderStats().cellsDrawn).toBe(1);
    expect(ctx.fillText).toHaveBeenCalledOnce();
    expect(ctx.fillText).toHaveBeenCalledWith('#', 8, 0);
  });

  it('renders adjacent font faces separately and treats a font change as a dirty cell', () => {
    const { buffer, ctx } = createBuffer(3, 1);
    const fonts: string[] = [];
    ctx.fillText.mockImplementation(() => fonts.push(ctx.font));

    buffer.clear(true);
    buffer.drawChar('E', 0, 0, '#00FFFF', '#000000');
    buffer.drawString('sc', 1, 0, '#00FFFF', '#000000', 'thin');
    buffer.renderFull();

    expect(ctx.fillText.mock.calls.map(([text]) => text)).toEqual(['E', 'sc']);
    expect(fonts).toEqual([`8px ${CONFIG.FONT_FAMILY}`, `7.2px ${CONFIG.THIN_FONT_FAMILY}`]);

    ctx.fillText.mockClear();
    fonts.length = 0;
    buffer.clear(false);
    buffer.drawString('Esc', 0, 0, '#00FFFF', '#000000', 'thin');
    buffer.renderDiff();

    expect(buffer.getLastRenderStats().cellsDrawn).toBe(1);
    expect(ctx.fillText).toHaveBeenCalledWith('E', 0, 0);
    expect(fonts).toEqual([`7.2px ${CONFIG.THIN_FONT_FAMILY}`]);
  });

  it('can stage a complete precomputed frame', () => {
    const { buffer, ctx } = createBuffer(2, 1);

    buffer.clear(true);
    buffer.stageCells([
      { char: 'A', fg: '#00FF00', bg: 'transparent', isTransparentBg: true },
      { char: ' ', fg: '#FFFFFF', bg: '#001010', isTransparentBg: false },
    ]);
    buffer.renderFull();

    expect(ctx.fillRect).toHaveBeenCalledWith(8, 0, 8, 8);
    expect(ctx.fillText).toHaveBeenCalledWith('A', 0, 0);
  });

  it('renders scaled glyphs at sub-cell size after the normal buffer pass', () => {
    const { buffer, ctx } = createBuffer(2, 1);

    buffer.clear(true);
    buffer.drawScaledChar('@', 0.5, 0, '#00FFFF', '#001010', 0.5, 0.5);
    buffer.renderFull();

    expect(ctx.fillRect).toHaveBeenCalledWith(4, 0, 4, 4);
    expect(ctx.translate).toHaveBeenCalledWith(4, 0);
    expect(ctx.scale).toHaveBeenCalledWith(1, 1);
    expect(ctx.fillText).toHaveBeenCalledWith('@', 0, 0);
  });

  it('renders scaled full blocks as exact rectangles instead of antialiased text glyphs', () => {
    const { buffer, ctx } = createBuffer(2, 1);

    buffer.clear(true);
    buffer.drawScaledChar(GLYPHS.BLOCK, 0.5, 0, '#204060', '#000000', 0.5, 0.5);
    buffer.renderFull();

    expect(ctx.fillRect).toHaveBeenCalledWith(4, 0, 4, 4);
    expect(ctx.fillText).not.toHaveBeenCalledWith(GLYPHS.BLOCK, 0, 0);
  });

  it('keeps scaled glyphs outside an opaque modal but not above its text', () => {
    const { buffer, ctx } = createBuffer(3, 1);
    buffer.clear(true);
    buffer.drawScaledChar('A', 0, 0, '#00FFFF', null, 0.5, 0.5);
    buffer.drawScaledChar('B', 1, 0, '#00FFFF', null, 0.5, 0.5);
    buffer.occludeScaledGlyphs(1, 0, 1, 1);
    buffer.drawChar('M', 1, 0, '#FFFFFF', '#000000');
    buffer.renderFull();

    expect(ctx.fillText).toHaveBeenCalledWith('A', 0, 0);
    expect(ctx.fillText).toHaveBeenCalledWith('M', 8, 0);
    expect(ctx.fillText).not.toHaveBeenCalledWith('B', 0, 0);
    expect(buffer.getLastRenderStats().scaledGlyphs).toBe(1);

    ctx.fillText.mockClear();
    buffer.clear(false);
    buffer.drawScaledChar('B', 1, 0, '#00FFFF', null, 0.5, 0.5);
    buffer.renderDiff();
    expect(ctx.fillText).toHaveBeenCalledWith('B', 0, 0);
  });

  it('batches adjacent same-colour glyphs into one canvas text call', () => {
    const { buffer, ctx } = createBuffer(5, 1);

    buffer.clear(true);
    buffer.drawString('HELLO', 0, 0, '#00FFFF', '#000000');
    buffer.renderFull();

    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith('HELLO', 0, 0);
    expect(buffer.getLastRenderStats().glyphsDrawn).toBe(5);
  });

  it('batches adjacent scaled blocks and avoids duplicate background fills', () => {
    const { buffer, ctx } = createBuffer(2, 1);

    buffer.clear(true);
    buffer.drawScaledChar(GLYPHS.BLOCK, 0, 0, '#204060', '#204060', 0.5, 0.5);
    buffer.drawScaledChar(GLYPHS.BLOCK, 0.5, 0, '#204060', '#204060', 0.5, 0.5);
    buffer.renderFull();

    const scaledBlockCalls = ctx.fillRect.mock.calls.filter(
      ([x, y, width, height]) => x === 0 && y === 0 && width === 8 && height === 4
    );
    expect(scaledBlockCalls).toHaveLength(1);
  });

  it('rasterizes scaled blocks on a dedicated layer without forcing a full main repaint', () => {
    const main = {
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
    const raster = {
      createImageData: vi.fn((width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      })),
      putImageData: vi.fn(),
    };
    const rasterCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => raster),
    };
    const canvas = {
      width: 16,
      height: 8,
      ownerDocument: { createElement: vi.fn(() => rasterCanvas) },
    };
    const layer = {
      font: '',
      textBaseline: '',
      fillStyle: '',
      imageSmoothingEnabled: true,
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    };
    const layerCanvas = { width: 16, height: 8 };
    const buffer = new ScreenBuffer(
      canvas as unknown as HTMLCanvasElement,
      main as unknown as CanvasRenderingContext2D,
      false,
      layerCanvas as HTMLCanvasElement,
      layer as unknown as CanvasRenderingContext2D
    );
    buffer.updateDimensions(2, 1, 8, 8);
    buffer.drawChar('@', 1, 0, '#00FFFF', '#000000');
    buffer.drawScaledChar(GLYPHS.BLOCK, 0, 0, '#204060', '#204060', 0.5, 0.5);
    buffer.renderFull();

    main.fillRect.mockClear();
    main.fillText.mockClear();
    raster.putImageData.mockClear();
    layer.drawImage.mockClear();
    buffer.clear(false);
    buffer.drawChar('@', 1, 0, '#00FFFF', '#000000');
    buffer.drawScaledChar(GLYPHS.BLOCK, 0.5, 0, '#406080', '#406080', 0.5, 0.5);
    buffer.renderDiff();

    expect(buffer.getLastRenderStats().mode).toBe('diff');
    expect(buffer.getLastRenderStats().cellsDrawn).toBe(0);
    expect(buffer.getLastRenderStats().scaledPixels).toBe(1);
    expect(main.fillRect).not.toHaveBeenCalled();
    expect(main.fillText).not.toHaveBeenCalled();
    expect(raster.putImageData).toHaveBeenCalledOnce();
    expect(layer.drawImage).toHaveBeenCalledOnce();
    expect(layer.imageSmoothingEnabled).toBe(false);

    buffer.clear(false);
    buffer.drawChar('@', 1, 0, '#00FFFF', '#000000');
    buffer.drawScaledChar(GLYPHS.BLOCK, 0, 0, '#204060', '#204060', 0.5, 0.5);
    buffer.drawScaledChar(GLYPHS.BLOCK, 0.5, 0, '#406080', '#406080', 0.5, 0.5);
    buffer.occludeScaledGlyphs(0, 0, 0.5, 1);
    buffer.renderDiff();
    const maskedImage = raster.putImageData.mock.calls.at(-1)![0];
    expect(maskedImage.data[3]).toBe(0);
    expect(maskedImage.data[7]).toBe(255);
    expect(buffer.getLastRenderStats().scaledPixels).toBe(1);

    buffer.clear(false);
    buffer.drawChar('@', 1, 0, '#00FFFF', '#000000');
    buffer.drawScaledChar(GLYPHS.BLOCK, 0, 0, '#204060', '#204060', 0.5, 0.5);
    buffer.renderDiff();
    const restoredImage = raster.putImageData.mock.calls.at(-1)![0];
    expect(restoredImage.data[3]).toBe(255);
  });

  it('clears transparent cells when a previous glyph is removed', () => {
    const ctx = {
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
    const canvas = { width: 16, height: 8 };
    const buffer = new ScreenBuffer(
      canvas as HTMLCanvasElement,
      ctx as unknown as CanvasRenderingContext2D,
      true
    );
    buffer.updateDimensions(2, 1, 8, 8);
    buffer.drawChar('@', 0, 0, '#00FFFF', null);
    buffer.renderFull();
    ctx.clearRect.mockClear();

    buffer.clear(false);
    buffer.renderDiff();

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 8, 8);
  });
});
