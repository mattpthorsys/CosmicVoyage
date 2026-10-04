import { describe, expect, it, vi } from 'vitest';
import { ScreenBuffer, type CellState } from '../../rendering/screen_buffer';
import { drawObservatory } from '../../rendering/observatory_renderer';
import { ObservatoryController } from '../../core/observatory';
import { createObservatorySnapshot, getObservatoryCapabilities } from '../../core/observatory_types';
import { createDefaultShipModifications } from '../../core/ship_modifications';
import { observatoryContactFixture, observatoryObservationFixture } from '../fixtures/observatory';
import { CONFIG } from '../../config';

/** Constructs a real terminal staging buffer with an observable drawing boundary. */
function harness(cols: number, rows: number) {
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() };
  const buffer = new ScreenBuffer(
    { width: cols * 8, height: rows * 12 } as HTMLCanvasElement,
    context as unknown as CanvasRenderingContext2D
  );
  buffer.updateDimensions(cols, rows, 8, 12);
  const controller = new ObservatoryController();
  controller.contacts = [observatoryContactFixture()];
  const state = createObservatorySnapshot();
  state.observations[controller.contacts[0].id] = observatoryObservationFixture(controller.contacts[0]);
  const model = controller.createModel(
    state,
    getObservatoryCapabilities(createDefaultShipModifications()),
    0,
    0,
    cols,
    rows,
    () => false
  );
  return { buffer, model };
}

describe('observatory drawing contract', () => {
  it.each([
    [140, 50],
    [80, 40],
    [40, 24],
    [24, 16],
  ])('owns the full %i x %i screen and leaves no physical-scene characters behind', (cols, rows) => {
    const { buffer, model } = harness(cols, rows);
    const occlusion = vi.spyOn(buffer, 'occludeScaledGlyphs');
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) buffer.drawChar('@', x, y, '#FF0000', '#FF0000');
    drawObservatory(buffer, model);
    const cells = (buffer as unknown as { newBuffer: CellState[] }).newBuffer;
    expect(cells.every((cell) => cell.char !== '@' && cell.bg === CONFIG.DEFAULT_BG_COLOUR)).toBe(true);
    expect(occlusion).toHaveBeenCalledWith(0, 0, cols, rows);
    expect(cells.some((cell) => cell.font === 'thin')).toBe(true);
    const title = cells.slice(cols + 2, cols + 13);
    expect(title.map((cell) => cell.char).join('')).toBe('OBSERVATORY');
    expect(title.every((cell) => (cell.font ?? 'thick') === 'thick')).toBe(true);
  });

  it('keeps selected contact, measurement text and controls in nonoverlapping regions', () => {
    const { buffer, model } = harness(140, 50);
    const draws = vi.spyOn(buffer, 'drawChar');
    drawObservatory(buffer, model);
    for (const [char, x, y] of draws.mock.calls) {
      if (!char || char === ' ') continue;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(140);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(50);
    }
    const cells = (buffer as unknown as { newBuffer: CellState[] }).newBuffer;
    const footer = cells
      .slice(48 * 140)
      .map((cell) => cell.char)
      .join('');
    expect(footer).toContain('Observe');
    expect(footer).toContain('Return');
  });
});
