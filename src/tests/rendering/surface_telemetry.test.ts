import { describe, expect, it, vi } from 'vitest';
import {
  createSurfaceCommandWindow,
  createSurfaceScreenLayout,
  type SurfaceVehicleOverlayModel,
} from '../../core/surface_ui';
import { DrawingContext } from '../../rendering/drawing_context';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { SurfaceTelemetryRenderer } from '../../rendering/scenes/surface_telemetry_renderer';
import { TEXT_PALETTE } from '../../rendering/text_palette';

/** Uses the production terminal buffer to record exact text bounds and action highlighting. */
function display(cols: number, rows: number) {
  const canvas = { width: cols * 8, height: rows * 8 } as HTMLCanvasElement;
  const context = {
    font: '',
    textBaseline: '',
    fillStyle: '',
    fillText: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  };
  const buffer = new ScreenBuffer(canvas, context as unknown as CanvasRenderingContext2D);
  buffer.updateDimensions(cols, rows, 8, 8);
  const renderer = new SurfaceTelemetryRenderer(buffer, new DrawingContext(buffer));
  return { renderer, text: vi.spyOn(buffer, 'drawString') };
}

/** Supplies enough commands to reproduce a selected action scrolling beyond the original visible row. */
function readings(): SurfaceVehicleOverlayModel {
  return {
    dateTime: '01 Jan 2200 AD 00:00',
    notifications: ['A weak biological signal was detected nearby.'],
    deployed: true,
    moving: false,
    available: true,
    onFoot: false,
    fuel: 75,
    maxFuel: 100,
    cargo: 5,
    cargoCapacity: 20,
    selectedIndex: 7,
    items: [
      { id: 'map', label: 'Map', key: 'G', status: 'local' },
      { id: 'move', label: 'Move', status: 'ready' },
      { id: 'cargo', label: 'Cargo', key: 'I', status: '5.0/20 m^3' },
      { id: 'operations', label: 'Operations', key: 'O', status: 'ship link' },
      { id: 'mine', label: 'Mine', key: 'M', status: 'ready' },
      { id: 'scan', label: 'Scan', key: 'V', status: 'local sweep' },
      { id: 'missions', label: 'Missions', key: 'J', status: '3 active' },
      { id: 'science', label: 'Science log', key: 'X', status: '12 records' },
    ],
    crew: [
      { name: 'Alex Chen', hitPoints: 100, maxHitPoints: 100 },
      { name: 'Maya Singh', hitPoints: 0, maxHitPoints: 100 },
    ],
    shipDistance: { distanceKm: 12.8, direction: 'NW' },
    settlement: 'Meridian Habitat 01',
  };
}

describe('responsive surface telemetry', () => {
  it.each([
    [24, 24],
    [40, 45],
    [80, 45],
    [120, 64],
  ])('keeps text and the last selected action on screen at %sx%s', (cols, rows) => {
    const model = readings();
    const layout = createSurfaceScreenLayout(cols, rows, model.crew);
    const { renderer, text } = display(cols, rows);
    renderer.draw(model, layout);
    for (const [value, x, y] of text.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + value.length).toBeLessThanOrEqual(cols);
      expect(y).toBeLessThan(rows);
      const terrain = layout.viewport;
      expect(y < terrain.y || y >= terrain.y + terrain.height || x >= terrain.x + terrain.width).toBe(true);
    }
    const actions = text.mock.calls.filter(([, , y]) => y === layout.commandsY);
    expect(actions.map(([value]) => value).join('')).toContain('SCIENCE LOG');
    expect(actions.some(([, , , , background]) => background === TEXT_PALETTE.cyanActive)).toBe(true);
    const rendered = text.mock.calls.map(([value]) => value).join(' ');
    expect(rendered).toContain('DEAD');
    expect(rendered).toContain('25%');
    expect(rendered).toContain('5.0/20 m^3');
    expect(rendered).toContain('SECTOR');
    expect(layout.controlsY).toBeLessThan(rows);
  });

  it('keeps every command visible when selected, including commands after the first window', () => {
    const { items } = readings();
    for (const width of [19, 35, 75, 91]) {
      for (let selected = 0; selected < items.length; selected++) {
        const window = createSurfaceCommandWindow(items, selected, width);
        expect(window.start).toBeLessThanOrEqual(selected);
        expect(window.end).toBeGreaterThan(selected);
        const content = window.labels.slice(window.start, window.end).join('  ');
        expect(content.length).toBeLessThanOrEqual(width - 4);
      }
    }
  });

  it('preserves a casualty warning in a small footer with an unusually large crew', () => {
    const model = readings();
    model.crew = Array.from({ length: 12 }, (_, index) => ({
      name: `Crew ${index}`,
      hitPoints: index === 11 ? 0 : 100,
      maxHitPoints: 100,
    }));
    const layout = createSurfaceScreenLayout(40, 45, model.crew);
    const { renderer, text } = display(40, 45);
    renderer.draw(model, layout);
    expect(text.mock.calls.map(([value]) => value).join(' ')).toContain('DEAD');
    expect(layout.controlsY).toBeLessThan(45);
    expect(layout.viewport.height).toBeGreaterThan(0);
  });
});
