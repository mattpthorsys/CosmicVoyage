import { describe, expect, it } from 'vitest';
import { DepotServiceConsole, createDepotServiceDialog } from '../../../core/depot_service_console';
import type { DepotServiceQuote } from '../../../core/depot_types';

/** Supplies a readonly work order so presentation tests never depend on a generated market. */
function quoteFixture(targetId = 'all'): DepotServiceQuote {
  return {
    stationId: 'depot',
    revision: 0,
    kind: 'repair',
    targetId,
    label: targetId === 'all' ? 'Hull / rover restoration' : 'Hull structural repair',
    useCargo: false,
    condition: 'Hull 60 / 100',
    requestedUnits: 40,
    completedUnits: 20,
    unitLabel: 'integrity points',
    cost: 300,
    stationSupplies: { REPAIR_SPARES: 2 },
    cargoSupplies: {},
    work: [{ id: 'hull', from: 60, to: 80 }],
    shortfalls: ['Hull: limited by Workshop Spares.'],
    inputSignature: 'fixture',
  };
}

/** Represents one physical keypress, including the production reveal-skip contract. */
function press(action: string) {
  return { wasActionJustPressed: (key: string) => key === action, wasAnyKeyJustPressed: () => true };
}

describe('robotic service terminal', () => {
  it('consumes the first key only to finish writing, rather than authorising work', () => {
    const console = new DepotServiceConsole();
    console.open('repair');
    expect(console.input(press('ENTER_SYSTEM'), [quoteFixture()], 12)).toBeUndefined();
    expect(console.reveal.isActive).toBe(false);
    expect(console.input(press('ENTER_SYSTEM'), [quoteFixture()], 12)).toEqual({
      kind: 'review',
      quote: quoteFixture(),
    });
  });

  it('keeps cargo supplementation opt-in and resets it when another terminal opens', () => {
    const console = new DepotServiceConsole();
    console.open('repair');
    console.reveal.complete();
    console.input(press('CYCLE_TARGET'), [quoteFixture()], 12);
    expect(console.useCargo).toBe(true);
    console.open('fuel');
    expect(console.useCargo).toBe(false);
    expect(console.selectedId).toBe('fuel');
  });

  it('uses a No-default confirmation showing real work, price, supplies and shortages', () => {
    const quote = quoteFixture();
    const dialog = createDepotServiceDialog(quote);
    expect(dialog.kind).toBe('confirmation');
    expect(dialog.defaultYes).toBe(false);
    expect(dialog.intent).toEqual({ kind: 'depot-service', quote });
    const text = dialog.lines.flatMap((entry) => entry.segments.map((segment) => segment.text)).join('\n');
    expect(text).toContain('20 / 40 integrity points');
    expect(text).toContain('300 Cr');
    expect(text).toContain('Workshop Spares');
    expect(text).toContain('limited by');
  });

  it('does not offer a confirmation for a fully unavailable work order', () => {
    const dialog = createDepotServiceDialog({
      ...quoteFixture(),
      completedUnits: 0,
      cost: 0,
      stationSupplies: {},
      work: [],
    });
    expect(dialog.kind).toBe('message');
    expect(dialog.intent).toBeUndefined();
  });

  it.each([
    [140, 50],
    [80, 32],
    [40, 24],
    [24, 16],
  ])('wraps styled terminal facts within %i x %i', (cols, rows) => {
    const console = new DepotServiceConsole();
    console.open('repair');
    console.reveal.complete();
    const model = console.createModel(
      'Remote Frontier Logistics Depot',
      [quoteFixture()],
      [{ name: 'Workshop Spares', units: 2 }],
      1000,
      cols,
      rows
    );
    const width = Math.min(78, cols - (cols < 90 ? 8 : 12));
    expect(
      model.dashboard?.every(
        (entry) => entry.segments.reduce((sum, segment) => sum + segment.text.length, 0) <= width
      )
    ).toBe(true);
    expect(model.visibleRowCount).toBeGreaterThan(0);
    expect(model.footer?.every((text) => text.length <= width)).toBe(true);
    expect(
      model.dashboard
        ?.flatMap((entry) => entry.segments)
        .some((segment) => segment.font === 'thin' && segment.tone === 'amber')
    ).toBe(true);
    expect(
      model.dashboard
        ?.flatMap((entry) => entry.segments)
        .some((segment) => segment.font === 'thick' && segment.tone === 'cyan')
    ).toBe(true);
  });

  it('allows paging through narrow reports without snapping back to the selected work order', () => {
    const console = new DepotServiceConsole();
    console.open('repair');
    console.reveal.complete();
    const quotes = [quoteFixture(), quoteFixture('hull')];
    const model = console.createModel(
      'Remote Frontier Logistics Depot',
      quotes,
      [{ name: 'Workshop Spares', units: 2 }],
      1000,
      24,
      16
    );
    console.input(press('PAGE_DOWN'), quotes, model.visibleRowCount);
    const paged = console.createModel(
      'Remote Frontier Logistics Depot',
      quotes,
      [{ name: 'Workshop Spares', units: 2 }],
      1000,
      24,
      16
    );
    expect(paged.viewOffset).toBeGreaterThan(0);
    expect(console.selectedId).toBe('all');
  });

  it('shows colour-coded clinical vitals, including unavailable treatment for nonliving crew', () => {
    const console = new DepotServiceConsole();
    console.open('medical');
    const quote = { ...quoteFixture(), kind: 'medical' as const, unitLabel: 'health points' };
    const model = console.createModel(
      'Robotic Clinic',
      [quote],
      [{ name: 'Medical Supplies', units: 1 }],
      1000,
      80,
      40,
      [
        { name: 'Injured crew', hitPoints: 30, maxHitPoints: 100 },
        { name: 'Lost crew', hitPoints: 0, maxHitPoints: 100 },
      ]
    );
    const segments = model.dashboard?.flatMap((entry) => entry.segments) ?? [];
    const text = segments.map((segment) => segment.text).join('\n');
    expect(model.title).toBe('MEDICAL BAY');
    expect(text).toContain('CREW VITALS');
    expect(text).toContain('30/100 HP');
    expect(text).toContain('No lifesigns');
    expect(segments.some((segment) => segment.tone === 'red')).toBe(true);
    expect(segments.some((segment) => segment.tone === 'amber')).toBe(true);
  });
});
