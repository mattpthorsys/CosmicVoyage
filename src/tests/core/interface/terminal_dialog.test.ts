import { describe, expect, it } from 'vitest';
import { TerminalDialog } from '../../../core/terminal_dialog';

/** Opens a confirmation with enough content to exercise responsive scrolling. */
function confirmation(defaultYes = true) {
  const dialog = new TerminalDialog<string>();
  dialog.open({
    title: 'ACCEPT MISSION',
    kind: 'confirmation',
    intent: 'accept',
    defaultYes,
    lines: [
      {
        segments: [
          {
            text: 'A research contract with a long biological description. '.repeat(10),
            font: 'thin',
            tone: 'cyan',
          },
        ],
      },
    ],
  });
  return dialog;
}

describe('foreground terminal dialogs', () => {
  it.each(['DIALOG_NO', 'QUIT', 'LEAVE_SYSTEM'])('cancels with %s without emitting acceptance', (action) => {
    const dialog = confirmation();
    expect(dialog.action(action, dialog.createModel(80, 32))).toEqual({ kind: 'dismiss', intent: undefined });
    expect(dialog.isOpen).toBe(false);
    expect(dialog.action('DIALOG_YES', dialog.createModel(80, 32))).toBeUndefined();
  });

  it('confirms once with Y and supports an explicitly selected No on Enter', () => {
    const dialog = confirmation();
    const model = dialog.createModel(80, 32);
    expect(dialog.action('DIALOG_YES', model)).toEqual({ kind: 'confirm', intent: 'accept' });
    expect(dialog.action('DIALOG_YES', model)).toBeUndefined();
    const other = confirmation();
    other.action('MOVE_RIGHT', other.createModel(80, 32));
    expect(other.selectedYes).toBe(false);
    expect(other.action('ENTER_SYSTEM', other.createModel(80, 32))).toMatchObject({ kind: 'dismiss' });
  });

  it('recognises physical N before its normal navigation binding can select a target', () => {
    const dialog = confirmation();
    expect(
      dialog.input(
        {
          wasKeyJustPressed: (key) => key === 'n',
          wasActionJustPressed: (action) => action === 'TARGET_MENU',
        },
        dialog.createModel(80, 32)
      )
    ).toMatchObject({ kind: 'dismiss' });
    expect(dialog.isOpen).toBe(false);
  });

  it('ignores unrelated gameplay commands and keeps notices visible until explicit acknowledgement', () => {
    const dialog = new TerminalDialog<string>();
    dialog.open({ title: 'HAUL ARRIVAL', kind: 'message', dismissIntent: 'receipt', lines: [] });
    expect(dialog.action('REFUEL', dialog.createModel(80, 32))).toBeUndefined();
    expect(dialog.isOpen).toBe(true);
    expect(dialog.action('ENTER_SYSTEM', dialog.createModel(80, 32))).toEqual({
      kind: 'dismiss',
      intent: 'receipt',
    });
  });

  it.each([
    [140, 50],
    [80, 32],
    [40, 24],
    [24, 16],
  ])('fits and scrolls at %i x %i without losing styled text', (cols, rows) => {
    const dialog = confirmation(false);
    const model = dialog.createModel(cols, rows);
    expect(model.width).toBeLessThanOrEqual(cols);
    expect(model.height).toBeLessThanOrEqual(rows);
    expect(
      [...model.title, ...model.lines].every(
        (line) => line.segments.reduce((n, span) => n + span.text.length, 0) <= model.width - 6
      )
    ).toBe(true);
    dialog.action('PAGE_DOWN', model);
    expect(dialog.viewOffset > 0).toBe(model.lineCount > model.visibleRows);
    expect(
      dialog
        .createModel(cols, rows)
        .lines.flatMap((line) => line.segments)
        .every((span) => span.font === 'thin')
    ).toBe(true);
    dialog.action('PAGE_UP', dialog.createModel(cols, rows));
    expect(dialog.viewOffset).toBe(0);
  });
});
