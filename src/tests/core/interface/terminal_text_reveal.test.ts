import { describe, expect, it } from 'vitest';
import { TerminalTextReveal, revealTerminalLines } from '../../../core/terminal_text_reveal';
import type { TextDashboardLine } from '../../../core/text_ui';

const lines: TextDashboardLine[] = [
  {
    segments: [
      { text: 'NAV ', tone: 'cyan', font: 'thick' },
      { text: 'READY', tone: 'green', font: 'thin' },
    ],
  },
  { segments: [] },
  { segments: [{ text: 'FLUX', tone: 'amber' }] },
];

describe('reusable terminal text reveal', () => {
  it('starts idle, writes in 1.5 seconds, and can restart or complete immediately', () => {
    const reveal = new TerminalTextReveal();
    expect(reveal.progress).toBe(1);
    expect(reveal.isActive).toBe(false);
    reveal.start();
    expect(reveal.progress).toBe(0);
    expect(reveal.update(0.75)).toBe(true);
    expect(reveal.progress).toBe(0.5);
    expect(reveal.update(0.75)).toBe(true);
    expect(reveal.progress).toBe(1);
    expect(reveal.update(1)).toBe(false);
    reveal.start();
    reveal.update(0.1);
    reveal.complete();
    expect(reveal.isActive).toBe(false);
    expect(reveal.progress).toBe(1);
  });

  it('retains fractional time at high frame rates and rejects invalid timing', () => {
    const reveal = new TerminalTextReveal(2);
    reveal.start();
    for (let frame = 0; frame < 240; frame++) reveal.update(1 / 240);
    expect(reveal.progress).toBeCloseTo(0.5, 10);
    for (const delta of [NaN, Infinity, -1, 0]) expect(reveal.update(delta)).toBe(false);
    expect(reveal.progress).toBeCloseTo(0.5, 10);
    reveal.update(10);
    expect(reveal.progress).toBe(1);
    for (const duration of [NaN, Infinity, -1, 0])
      expect(() => new TerminalTextReveal(duration)).toThrow(RangeError);
  });

  it('reveals styled spans without mutating the complete source text', () => {
    const original = structuredClone(lines);
    const frame = revealTerminalLines(lines, 6 / 16);
    expect(frame).toEqual({
      lines: [{ segments: [lines[0].segments[0], { text: 'RE', tone: 'green', font: 'thin' }] }],
      cursor: { row: 0, column: 6 },
    });
    expect(lines).toEqual(original);
    expect(revealTerminalLines(lines, 1)).toEqual({ lines, cursor: null });
  });

  it('crosses newline and blank rows with a single correctly positioned cursor', () => {
    expect(revealTerminalLines(lines, 0).cursor).toEqual({ row: 0, column: 0 });
    expect(revealTerminalLines(lines, 9 / 16).cursor).toEqual({ row: 0, column: 9 });
    expect(revealTerminalLines(lines, 10 / 16).cursor).toEqual({ row: 1, column: 0 });
    expect(revealTerminalLines(lines, 11 / 16).cursor).toEqual({ row: 2, column: 0 });
    expect(revealTerminalLines(lines, 13 / 16).cursor).toEqual({ row: 2, column: 2 });
  });

  it('clips hidden columns before timing and keeps the cursor inside the viewport', () => {
    const wide = [{ segments: [{ text: 'ABCDE', tone: 'cyan' as const }] }, { segments: [{ text: 'DONE' }] }];
    const frame = revealTerminalLines(wide, 0.4, 4);
    expect(frame.lines[0].segments[0].text).toBe('ABCD');
    expect(frame.cursor).toEqual({ row: 1, column: 0 });
    expect(revealTerminalLines(wide.slice(0, 1), 0.9, 4).cursor).toBeNull();
    expect(revealTerminalLines(wide, 1, 4).lines[1].segments[0].text).toBe('DONE');
  });

  it('handles empty content and bounds malformed progress', () => {
    expect(revealTerminalLines([], 0)).toEqual({ lines: [], cursor: null });
    expect(revealTerminalLines(lines, -1).cursor).toEqual({ row: 0, column: 0 });
    for (const progress of [1, 10, NaN, Infinity])
      expect(revealTerminalLines(lines, progress)).toEqual({ lines, cursor: null });
  });
});
