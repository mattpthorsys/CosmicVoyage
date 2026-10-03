import { describe, expect, it } from 'vitest';
import {
  moveSelection,
  moveSelectionInRows,
  setSelection,
  TextTableRow,
  wrapDashboardLines,
} from '../../../core/text_ui';

describe('text UI selection viewport', () => {
  it('preserves colours and fonts across word wrapping and long unbroken values', () => {
    const rows = wrapDashboardLines(
      [
        {
          segments: [
            { text: 'MASS ', font: 'thick', tone: 'cyan' },
            { text: '80-120 kilograms', font: 'thin', tone: 'amber' },
          ],
        },
        { segments: [] },
        { segments: [{ text: 'ABCDEFGHIJKLMNOP' }] },
      ],
      9
    );
    expect(rows.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= 9)).toBe(
      true
    );
    expect(rows[0].segments[0]).toMatchObject({ text: 'MASS', font: 'thick', tone: 'cyan' });
    expect(rows.flatMap((line) => line.segments).find((span) => span.text === 'kilograms')?.tone).toBe(
      'amber'
    );
    expect(rows.some((line) => !line.segments.length)).toBe(true);
  });
  it('keeps selected rows visible while moving down', () => {
    const viewport = moveSelection(2, 1, 10, 3, 0);

    expect(viewport).toEqual({ selectedIndex: 3, viewOffset: 1 });
  });

  it('keeps selected rows visible while paging up', () => {
    const viewport = setSelection(2, 20, 5, 8);

    expect(viewport).toEqual({ selectedIndex: 2, viewOffset: 2 });
  });

  it('clamps empty lists to a stable selection', () => {
    const viewport = setSelection(12, 0, 5, 7);

    expect(viewport).toEqual({ selectedIndex: 0, viewOffset: 0 });
  });

  it('skips separator rows while preserving movement bounds', () => {
    const rows: TextTableRow[] = [
      { id: 'first', cells: ['First'] },
      { id: 'heading', cells: ['Heading'], skipSelection: true },
      { id: 'second', cells: ['Second'] },
      { id: 'end-heading', cells: ['End'], skipSelection: true },
    ];

    expect(moveSelectionInRows(0, 1, rows, 3, 0)).toEqual({ selectedIndex: 2, viewOffset: 0 });
    expect(moveSelectionInRows(2, -1, rows, 3, 0)).toEqual({ selectedIndex: 0, viewOffset: 0 });
    expect(moveSelectionInRows(2, 1, rows, 3, 0)).toEqual({ selectedIndex: 2, viewOffset: 0 });
  });
});
