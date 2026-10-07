import { describe, expect, it } from 'vitest';
import { FrontierTerminal, frontierLine, type FrontierTerminalEntry } from '../../../core/frontier_terminal';
import { SurveyDataService } from '../../../core/survey_data_service';
import { createPublicChartEntries } from '../../../core/survey_exchange_console';

/** Supplies semantic terminal records with long text to exercise actual responsive wrapping and paging. */
function entries(): FrontierTerminalEntry[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: String(index),
    title: `Remote astrometric reference ${index}`,
    status: 'UNREAD',
    tone: 'green',
    lines: [
      frontierLine('SCIENTIFIC REPORT', 'cyan', true),
      frontierLine(
        'A distant autonomous logistics node / resources and observations remain available in its local terminal.'
      ),
    ],
  }));
}

/** Presents pressed actions without held keys or browser dependencies. */
function input(action: string) {
  return {
    wasAnyKeyJustPressed: () => true,
    wasActionJustPressed: (candidate: string) => candidate === action,
  };
}

describe('frontier terminal presentation', () => {
  it('keeps acquisition actions disabled until a real entry can be selected', () => {
    const terminal = new FrontierTerminal();
    terminal.open();
    expect(
      terminal.createCommandBar('communications').buttons.find((button) => button.id === 'frontier-use')
        ?.enabled
    ).toBe(false);
    terminal.createModel('COMMUNICATIONS', [], entries(), 80, 30);
    expect(
      terminal.createCommandBar('communications').buttons.find((button) => button.id === 'frontier-use')
        ?.enabled
    ).toBe(true);
  });
  it('consumes the first key solely to complete reveal, including an action or Escape', () => {
    const terminal = new FrontierTerminal();
    terminal.open();
    expect(terminal.input(input('ENTER_SYSTEM'), entries(), 10)).toBeUndefined();
    expect(terminal.reveal.isActive).toBe(false);
    expect(terminal.input(input('ENTER_SYSTEM'), entries(), 10)).toBe('activate');
  });

  it('wraps fonts and colours inside narrow and desktop layouts without clipping text', () => {
    for (const cols of [28, 60, 100, 140]) {
      const terminal = new FrontierTerminal();
      terminal.open();
      const model = terminal.createModel(
        'COMMUNICATIONS',
        [frontierLine('OPERATIONAL REPORT', 'cyan', true)],
        entries(),
        cols,
        30
      );
      const width = Math.max(1, Math.min(78, cols - (cols < 90 ? 8 : 12)));
      expect(
        model.dashboard!.every(
          (line) => line.segments.reduce((sum, segment) => sum + segment.text.length, 0) <= width
        )
      ).toBe(true);
      expect(model.dashboard!.flatMap((line) => line.segments).some((span) => span.font === 'thin')).toBe(
        true
      );
      expect(
        model
          .dashboard!.flatMap((line) => line.segments)
          .some((span) => span.font === 'thick' && span.tone === 'cyan')
      ).toBe(true);
    }
  });

  it('keeps identity selection through reordered data and resets paging when selecting a different object', () => {
    const terminal = new FrontierTerminal();
    terminal.open();
    terminal.reveal.complete();
    const source = entries();
    terminal.createModel('EXCHANGE', [], source, 40, 20);
    terminal.input(input('MOVE_DOWN'), source, 6);
    expect(terminal.selectedId).toBe('1');
    terminal.createModel('EXCHANGE', [], [...source].reverse(), 40, 20);
    expect(terminal.selectedId).toBe('1');
    terminal.input(input('PAGE_DOWN'), source, 6);
    expect(terminal.viewOffset).toBe(6);
    terminal.input(input('MOVE_DOWN'), source, 6);
    expect(terminal.viewOffset).toBe(0);
  });

  it('lists public charts without creating measured science or a paid record', () => {
    const service = new SurveyDataService();
    const records = createPublicChartEntries(service, [
      {
        worldX: 7,
        worldY: 9,
        systemSlot: 0,
        name: 'Public reference',
        distanceLy: 3,
        spectralType: 'G2V',
        stationKind: null,
      },
    ]);
    expect(
      records[0].lines
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('resale value');
    expect(service.listEvidence()).toHaveLength(0);
    expect(service.createSnapshot().paid).toEqual({});
  });
});
