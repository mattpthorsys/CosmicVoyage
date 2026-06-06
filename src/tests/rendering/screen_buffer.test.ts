import { describe, expect, it, vi } from 'vitest';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { GLYPHS } from '../../constants';

function createBuffer(cols: number, rows: number): {
  buffer: ScreenBuffer;
  ctx: {
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
  const buffer = new ScreenBuffer(canvas as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, false);
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
});
