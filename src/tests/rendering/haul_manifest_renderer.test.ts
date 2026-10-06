import { describe, expect, it, vi } from 'vitest';
import { ScreenBuffer, type CellState } from '../../rendering/screen_buffer';
import { SceneRenderer } from '../../rendering/scene_renderer';
import { DrawingContext } from '../../rendering/drawing_context';
import { NebulaRenderer } from '../../rendering/nebula_renderer';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import { HaulManifest } from '../../core/haul_manifest';
import { heavyHaulMissionFixture, heavyHaulContextFixture } from '../fixtures/heavy_haul_contracts';
import { getHeavyHaulObjective } from '../../core/mission_board';
import { quoteHeavyHaul } from '../../core/tow_performance';

describe('haul terminal drawing contract', () => {
  it.each([
    [140, 50],
    [80, 32],
    [40, 24],
    [24, 16],
  ])('replaces prior scene glyphs at %i x %i and retains terminal typography', (cols, rows) => {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() };
    const buffer = new ScreenBuffer(
      { width: cols * 8, height: rows * 12 } as HTMLCanvasElement,
      context as unknown as CanvasRenderingContext2D
    );
    buffer.updateDimensions(cols, rows, 8, 12);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) buffer.drawChar('@', x, y, '#FF0000', '#FF0000');
    const renderer = new SceneRenderer(
      buffer,
      new DrawingContext(buffer),
      new NebulaRenderer(),
      new SystemDataGenerator(new PRNG('haul-render'))
    );
    const mission = heavyHaulMissionFixture('local');
    const manifest = new HaulManifest();
    manifest.open(
      {
        mission,
        stage: 'arrived',
        quote: quoteHeavyHaul(getHeavyHaulObjective(mission)!, heavyHaulContextFixture()),
        normalFuel: 450,
        maximumFuel: 500,
        remainingSupport: 10,
        departureDate: '01 Jan 3015',
        arrivalDate: '02 Jan 3015',
        staging: 'Deployment contact in range',
      },
      'none'
    );
    manifest.reveal.complete();
    renderer.drawTextModalTable(manifest.createModel(cols, rows));
    const cells = (buffer as unknown as { newBuffer: CellState[] }).newBuffer;
    expect(cells.every((cell) => cell.char !== '@' && cell.bg !== '#FF0000')).toBe(true);
    expect(cells.some((cell) => cell.font === 'thin')).toBe(true);
    expect(cells.some((cell) => (cell.font ?? 'thick') === 'thick' && cell.char !== ' ')).toBe(true);
  });
});
