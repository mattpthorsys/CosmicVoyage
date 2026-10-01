import { describe, expect, it, vi } from 'vitest';
import { RendererFacade } from '../../rendering/renderer_facade';
import type { CellFont } from '../../rendering/screen_buffer';

describe('popup typography', () => {
  it('keeps titles and shortcut names thick while descriptions use the thin face', () => {
    const drawn: { char: string; font: CellFont }[] = [];
    const facade = Object.assign(Object.create(RendererFacade.prototype), {
      screenBuffer: {
        getCols: () => 80,
        getRows: () => 30,
        drawChar: (char: string, _x: number, _y: number, _fg: string, _bg: string, font: CellFont) => {
          drawn.push({ char, font });
        },
      },
      drawingContext: { drawBox: vi.fn() },
    }) as RendererFacade;

    facade.drawPopup(
      ['PLANETARY DOSSIER', 'ESC return to orbit', 'Atmosphere: nitrogen', 'd          Open dossier'],
      'active',
      1,
      1000
    );

    expect(drawn.slice(0, 17).every(({ font }) => font === 'thick')).toBe(true);
    const escapeLine = drawn.slice(17, 36);
    expect(escapeLine.slice(0, 3).every(({ font }) => font === 'thick')).toBe(true);
    expect(escapeLine.slice(3).every(({ font }) => font === 'thin')).toBe(true);
    expect(drawn.slice(36, 56).every(({ font }) => font === 'thin')).toBe(true);
    expect(drawn[56]).toEqual({ char: 'd', font: 'thick' });
  });
});
