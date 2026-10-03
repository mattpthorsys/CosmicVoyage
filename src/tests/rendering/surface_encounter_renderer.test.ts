import { describe, expect, it } from 'vitest';
import { drawSurfaceEncounter } from '../../rendering/surface_encounter_renderer';
import type { CellFont, ScreenBuffer } from '../../rendering/screen_buffer';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import { createEncounterView } from '../../core/xenobiology_ui';
import { XenobiologyService } from '../../core/xenobiology_service';

/** Records the final cell plane with the same string-to-cell semantics as the production buffer. */
function display(cols: number, rows: number) {
  const cells = new Map<string, { char: string; fg: string; font: CellFont }>();
  const outside: string[] = [];
  const buffer = {
    /** Returns the fixture column count. */
    getCols(): number {
      return cols;
    },
    /** Returns the fixture row count. */
    getRows(): number {
      return rows;
    },
    /** Records one bounded cell, retaining unexpected writes as test failures. */
    drawChar(char: string, x: number, y: number, fg = '', _bg = '', font: CellFont = 'thick'): void {
      if (x < 0 || x >= cols || y < 0 || y >= rows) outside.push(`${x},${y}`);
      else cells.set(`${x},${y}`, { char, fg, font });
    },
    /** Applies ordinary per-cell string drawing. */
    drawString(text: string, x: number, y: number, fg = '', bg = '', font: CellFont = 'thick'): void {
      [...text].forEach((char, index) => buffer.drawChar(char, x + index, y, fg, bg, font));
    },
  };
  return { buffer: buffer as unknown as ScreenBuffer, cells, outside };
}

describe('field survey graphics contracts', () => {
  it.each([
    [120, 42],
    [76, 36],
    [48, 48],
    [30, 45],
  ])('keeps contacts, scanner and footer bounded in a %sx%s display', (cols, rows) => {
    const screen = display(cols, rows),
      biosphere = generateBiosphere(biologyFixture())!;
    const field = createEncounter(biosphere, { id: 'site', x: 1, y: 1, label: 'Habitat 1' });
    const service = new XenobiologyService();
    biosphere.species.forEach((species) => service.observe(species, 3));
    const view = createEncounterView(
      field,
      field.individuals[2].id,
      service,
      1,
      1,
      100,
      '0.0/50',
      'Biological observation recorded.'
    );
    drawSurfaceEncounter(screen.buffer, view);
    expect(screen.outside).toEqual([]);
    expect([...screen.cells.values()].filter((cell) => cell.char === '@')).toHaveLength(1);
    expect([...screen.cells.values()].some((cell) => cell.font === 'thin' && cell.char !== ' ')).toBe(true);
    const first = [...screen.cells];
    drawSurfaceEncounter(screen.buffer, view);
    expect([...screen.cells]).toEqual(first);
    const roverCell = [...screen.cells].find(([, cell]) => cell.char === '@')![0];
    field.roverX--;
    drawSurfaceEncounter(screen.buffer, createEncounterView(field, null, service, 1, 1, 100, '0/50', 'Step'));
    expect([...screen.cells.values()].filter((cell) => cell.char === '@')).toHaveLength(1);
    if (cols >= 90) expect(screen.cells.get(roverCell)?.char).not.toBe('@');
  });
});
