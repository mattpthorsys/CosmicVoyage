import { describe, expect, it } from 'vitest';
import { drawSurfaceEncounter, getEncounterLayout } from '../../rendering/surface_encounter_renderer';
import type { CellFont, ScreenBuffer } from '../../rendering/screen_buffer';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import { createEncounterView } from '../../core/xenobiology_ui';
import { XenobiologyService } from '../../core/xenobiology_service';
import { prepareEncounterSurface } from '../../core/encounter_surface';
import { GLYPHS } from '../../constants/visual';
import { createBiologicalReference } from '../../core/biological_mission_guidance';
import type { StarbaseMission } from '../../core/mission_board';
import { TEXT_PALETTE } from '../../rendering/text_palette';

/** Records the final cell plane with the same string-to-cell semantics as the production buffer. */
function display(cols: number, rows: number) {
  const cells = new Map<string, { char: string; fg: string; font: CellFont }>();
  const outside: string[] = [];
  const pixels: { x: number; y: number; colour: string }[] = [];
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
    /** Records the pixel raster independently of the ordinary text plane. */
    drawScaledChar(
      _char: string,
      x: number,
      y: number,
      colour: string,
      _bg: string,
      sx: number,
      sy: number
    ): void {
      if (x < 0 || y < 0 || x + sx > cols || y + sy > rows) outside.push(`${x},${y}`);
      pixels.push({ x, y, colour });
    },
  };
  return { buffer: buffer as unknown as ScreenBuffer, cells, outside, pixels };
}

describe('field survey graphics contracts', () => {
  it.each([
    [120, 42],
    [30, 45],
  ])(
    'renders a visible defensive posture without changing state or escaping the %sx%s field',
    (cols, rows) => {
      const biosphere = generateBiosphere(biologyFixture())!;
      const field = createEncounter(biosphere, { id: 'display', x: 1, y: 1, label: 'Display' });
      const target = field.individuals[1];
      const index = field.species.findIndex((entry) => entry.id === target.speciesId);
      field.species[index] = { ...field.species[index], behaviour: 'territorial', bodyForm: 'walker' };
      field.individuals = [target];
      target.x = field.roverX + 1;
      target.y = field.roverY - 1;
      const service = new XenobiologyService();
      service.observe(field.species[index], 2);
      const presentation = {
        power: 1 as const,
        stasisClass: 1,
        integrity: 100,
        cargo: { usedM3: 0, capacityM3: 50 },
        message: '',
      };
      const normal = display(cols, rows);
      drawSurfaceEncounter(normal.buffer, createEncounterView(field, target.id, service, presentation));
      target.activity = 'displaying';
      const before = structuredClone(field);
      const warning = display(cols, rows);
      drawSurfaceEncounter(warning.buffer, createEncounterView(field, target.id, service, presentation));
      expect(warning.pixels).not.toEqual(normal.pixels);
      expect(warning.outside).toEqual([]);
      expect(field).toEqual(before);
    }
  );
  it.each([
    [120, 42],
    [30, 45],
  ])('keeps confirmed mission markers bounded and distinct from selection in a %sx%s view', (cols, rows) => {
    const screen = display(cols, rows);
    const field = createEncounter(generateBiosphere(biologyFixture())!, {
      id: 'habitat',
      x: 1,
      y: 1,
      label: 'Habitat',
    });
    const target = field.individuals[0];
    target.x = field.roverX + 1;
    target.y = field.roverY - 1;
    const species = field.species.find((entry) => entry.id === target.speciesId)!;
    const mission: StarbaseMission = {
      id: 'live',
      title: 'Live reference',
      type: 'xenobiology',
      issuer: 'Office',
      summary: '',
      detail: '',
      rewardCredits: 900,
      risk: 'Low',
      originStarbaseName: 'Port',
      systemName: 'Fixture',
      objectives: [
        {
          id: 'live',
          kind: 'specimen',
          targetName: species.name,
          targetLabel: 'Live',
          speciesId: species.id,
          siteId: field.site.id,
          requiredKind: 'live',
          minimumQuality: 0.75,
          reference: createBiologicalReference(species),
        },
      ],
    };
    const service = new XenobiologyService();
    const presentation = {
      power: 1 as const,
      stasisClass: 1,
      integrity: 100,
      cargo: { usedM3: 0, capacityM3: 50 },
      message: '',
      missionRequests: [{ mission, status: 'ACTIVE' as const }],
    };
    drawSurfaceEncounter(screen.buffer, createEncounterView(field, target.id, service, presentation));
    expect(
      [...screen.cells.values()].some((cell) => cell.char === '+' && cell.fg === TEXT_PALETTE.greenBright)
    ).toBe(false);
    const unmarkedPixels = [...screen.pixels];
    screen.pixels.length = 0;
    service.observe(species, 2);
    drawSurfaceEncounter(screen.buffer, createEncounterView(field, target.id, service, presentation));
    const layout = getEncounterLayout(cols, rows);
    const fieldMarks = [...screen.cells].filter(([position, cell]) => {
      const [x, y] = position.split(',').map(Number);
      return (
        x < layout.field.width &&
        y >= layout.field.y &&
        y < layout.field.y + layout.field.height &&
        cell.char === '+' &&
        cell.fg === TEXT_PALETTE.greenBright
      );
    });
    expect(fieldMarks.length).toBeGreaterThan(0);
    expect(
      [...screen.cells.values()].some((cell) => cell.char === '[' && cell.fg === TEXT_PALETTE.cyanActive)
    ).toBe(true);
    expect(screen.pixels).toEqual(unmarkedPixels);
    field.site = { ...field.site, id: 'wrong-habitat' };
    drawSurfaceEncounter(screen.buffer, createEncounterView(field, target.id, service, presentation));
    expect(
      [...screen.cells.values()].some((cell) => cell.char === '+' && cell.fg === TEXT_PALETTE.greenBright)
    ).toBe(false);
    expect(screen.outside).toEqual([]);
  });
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
    const presentation = {
      power: 1 as const,
      stasisClass: 1,
      integrity: 82,
      cargo: { usedM3: 12.5, capacityM3: 50 },
      message: 'Biological observation recorded.',
      crew: [
        { name: 'Niko Sato', hitPoints: 21, maxHitPoints: 30 },
        { name: 'Daria Okoye', hitPoints: 27, maxHitPoints: 30 },
        { name: 'Evan Park', hitPoints: 30, maxHitPoints: 30 },
      ],
      surface: prepareEncounterSurface(field),
    };
    const view = createEncounterView(field, field.individuals[2].id, service, presentation);
    drawSurfaceEncounter(screen.buffer, view);
    expect(screen.outside).toEqual([]);
    expect(screen.pixels.some((pixel) => pixel.colour === '#d9f5ec')).toBe(true);
    expect([...screen.cells.values()].some((cell) => cell.char === '#')).toBe(false);
    const layout = getEncounterLayout(cols, rows);
    const terrain = [...screen.cells].filter(([key, cell]) => {
      const [x, y] = key.split(',').map(Number);
      return x < layout.field.width && y >= 2 && y < 2 + layout.field.height && cell.char === GLYPHS.BLOCK;
    });
    expect(terrain.length).toBeGreaterThan(layout.field.width * layout.field.height * 0.8);
    expect([...screen.cells.values()].some((cell) => cell.font === 'thin' && cell.char !== ' ')).toBe(true);
    const textRows = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => screen.cells.get(`${x},${y}`)?.char ?? ' ').join('')
    ).join('\n');
    expect(textRows).toContain('21/30');
    expect(textRows).toContain('m^3');
    expect(textRows).toContain('BIOSENSOR');
    const first = [...screen.cells];
    const raster = [...screen.pixels];
    screen.pixels.length = 0;
    drawSurfaceEncounter(screen.buffer, view);
    expect([...screen.cells]).toEqual(first);
    expect(screen.pixels).toEqual(raster);
    field.roverX--;
    screen.pixels.length = 0;
    drawSurfaceEncounter(
      screen.buffer,
      createEncounterView(field, null, service, { ...presentation, message: 'Step' })
    );
    expect(screen.pixels.some((pixel) => pixel.colour === '#d9f5ec')).toBe(true);
    expect(screen.outside).toEqual([]);
    drawSurfaceEncounter(screen.buffer, {
      ...view,
      menuActive: true,
      message: 'Temperature outside preservation envelope; collect tissue or scan data instead.',
    });
    expect(screen.outside).toEqual([]);
  });
});
