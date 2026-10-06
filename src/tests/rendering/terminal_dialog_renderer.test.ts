import { describe, expect, it, vi } from 'vitest';
import { ScreenBuffer, type CellState } from '../../rendering/screen_buffer';
import { drawTerminalDialog } from '../../rendering/terminal_dialog_renderer';
import { TerminalDialog } from '../../core/terminal_dialog';
import { RendererFacade } from '../../rendering/renderer_facade';

describe('terminal dialog drawing', () => {
  it.each([
    [140, 50],
    [80, 32],
    [40, 24],
    [24, 16],
  ])('covers scene/raster inside its frame with readable typography at %i x %i', (cols, rows) => {
    const buffer = new ScreenBuffer(
      { width: cols * 8, height: rows * 12 } as HTMLCanvasElement,
      { clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D
    );
    buffer.updateDimensions(cols, rows, 8, 12);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) buffer.drawChar('@', x, y, '#FF0000', '#FF0000');
    const dialog = new TerminalDialog<string>();
    dialog.open({
      title: 'ACCEPT MISSION',
      kind: 'confirmation',
      intent: 'accept',
      defaultYes: true,
      lines: [{ segments: [{ text: 'Payment 1,400 Cr', font: 'thin', tone: 'amber' }] }],
    });
    const model = dialog.createModel(cols, rows);
    const occlusion = vi.spyOn(buffer, 'occludeScaledGlyphs');
    drawTerminalDialog(buffer, model);
    const left = Math.floor((cols - model.width) / 2),
      top = Math.floor((rows - model.height) / 2);
    expect(occlusion).toHaveBeenCalledWith(left, top, model.width, model.height);
    const cells = (buffer as unknown as { newBuffer: CellState[] }).newBuffer;
    for (let y = top; y < top + model.height; y++)
      for (let x = left; x < left + model.width; x++) expect(cells[y * cols + x].char).not.toBe('@');
    const grid = Array.from({ length: rows }, (_, y) =>
      cells
        .slice(y * cols, (y + 1) * cols)
        .map((cell) => cell.char ?? ' ')
        .join('')
    ).join('\n');
    expect(grid).toContain('ACCEPT MISSION');
    expect(grid).toContain('[Y] YES');
    expect(grid).toContain('[N] NO');
    const body = cells.slice((top + 3) * cols + left + 3, (top + 3) * cols + left + 19);
    expect(body.map((cell) => cell.char).join('')).toBe('Payment 1,400 Cr');
    expect(body.every((cell) => cell.font === 'thin')).toBe(true);
    expect(cells[0].char).toBe('@');
  });

  it('fades the whole foreground canvas with clamped opacity and restores context state', () => {
    const opacities: number[] = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(() => {
        opacities.push(ctx.globalAlpha);
      }),
    };
    const renderer = Object.assign(Object.create(RendererFacade.prototype), {
      overlayCtx: ctx,
      overlayCanvas: { width: 640, height: 480 },
    }) as RendererFacade;
    renderer.drawScreenFade(0);
    renderer.drawScreenFade(0.5);
    renderer.drawScreenFade(2);
    renderer.drawScreenFade(Number.NaN);
    expect(opacities).toEqual([0.5, 1]);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });
});
