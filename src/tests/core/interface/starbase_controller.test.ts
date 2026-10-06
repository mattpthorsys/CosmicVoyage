import { describe, expect, it } from 'vitest';
import { Player } from '../../../core/player';
import { StarbaseController } from '../../../core/starbase_controller';
import { Starbase } from '../../../entities/starbase';
import { PRNG } from '../../../utils/prng';

/** Creates starbase. */
function createStarbase(): Starbase {
  return new Starbase('Controller Dock', new PRNG('starbase-controller'), 'Controller System');
}

describe('StarbaseController', () => {
  it('owns section navigation and independent selection viewports', () => {
    const controller = new StarbaseController();

    controller.switchSection(1);
    expect(controller.sectionId).toBe('cargo');
    controller.moveSelection(7, 20, 6);
    expect(controller.getSelection()).toBe(7);
    expect(controller.getOffset()).toBe(2);

    controller.switchSection(1);
    expect(controller.sectionId).toBe('buy');
    expect(controller.getSelection()).toBe(0);
    expect(controller.getOffset()).toBe(0);

    controller.switchSection(-1);
    expect(controller.sectionId).toBe('cargo');
    expect(controller.getSelection()).toBe(7);
    expect(controller.getOffset()).toBe(2);
  });

  it('wraps sections and resets panel state on cancellation', () => {
    const controller = new StarbaseController();

    controller.switchSection(-1);
    expect(controller.sectionId).toBe('crew');
    controller.cancelPanel();

    expect(controller.sectionId).toBe('overview');
    expect(controller.alert).toBe('Cancelled current panel.');
  });

  it('builds a clamped starbase screen model from supplied rows', () => {
    const controller = new StarbaseController();
    const starbase = createStarbase();
    const player = new Player();
    controller.openSection('buy');
    controller.selectionBySection.buy = 9;
    controller.offsetBySection.buy = 9;

    const model = controller.createScreen({
      starbase,
      player,
      rows: [
        { id: 'one', cells: ['One', '1', '2', 'cargo'] },
        { id: 'two', cells: ['Two', '2', '3', 'cargo'] },
      ],
      canvasHeight: 360,
      charHeight: 12,
      statusMessage: 'Docked.',
    });

    expect(model.title).toBe('Trade Depot - Buy');
    expect(model.columns).toEqual(['COMMODITY', 'STOCK', 'BUY CR', 'CLASS']);
    expect(model.selectedIndex).toBe(1);
    expect(model.viewOffset).toBe(0);
    expect(model.alert).toBe('Docked.');
    expect(controller.getSelection()).toBe(1);
    expect(controller.getOffset()).toBe(0);
  });

  it('computes bounded visible row counts from the terminal dimensions', () => {
    const controller = new StarbaseController();
    controller.openSection('shipyard');

    expect(controller.getVisibleRowCount(120, 12)).toBe(1);
    expect(controller.getVisibleRowCount(360, 12)).toBe(7);
    expect(controller.getVisibleRowCount(1200, 12)).toBe(16);
    controller.openSection('missions');
    expect(controller.getVisibleRowCount(1200, 12)).toBe(14);
    controller.openSection('sell');
    expect(controller.getVisibleRowCount(1200, 12)).toBe(15);
  });

  it.each([24, 30, 40, 54])('keeps every arrow and page selection visible in a %s-row shipyard', (height) => {
    const controller = new StarbaseController();
    controller.openSection('shipyard');
    const visibleRows = controller.getVisibleRowCount(height * 12, 12);

    for (const delta of [...Array(36).fill(1), visibleRows, visibleRows, -visibleRows, -1]) {
      controller.moveSelection(delta, 40, visibleRows);
      expect(controller.getSelection()).toBeGreaterThanOrEqual(controller.getOffset());
      expect(controller.getSelection()).toBeLessThan(controller.getOffset() + visibleRows);
      expect(controller.getOffset()).toBeLessThanOrEqual(40 - visibleRows);
    }
  });

  it('reconciles the selected row after shrinking the viewport without losing its alert', () => {
    const controller = new StarbaseController();
    controller.openSection('shipyard');
    controller.moveSelection(15, 40, controller.getVisibleRowCount(54 * 12, 12));
    expect(controller.getOffset()).toBe(0);
    controller.alert = 'Refit complete.';

    const model = controller.createScreen({
      starbase: createStarbase(),
      player: new Player(),
      rows: Array.from({ length: 40 }, (_, index) => ({ id: `order-${index}`, cells: [`Order ${index}`] })),
      canvasHeight: 28 * 12,
      charHeight: 12,
      statusMessage: '',
    });

    expect(model.visibleRowCount).toBe(5);
    expect(model.selectedIndex).toBe(15);
    expect(model.viewOffset).toBe(11);
    expect(controller.getOffset()).toBe(model.viewOffset);
    expect(model.alert).toBe('Refit complete.');
    expect(controller.alert).toBe('Refit complete.');
  });
});
