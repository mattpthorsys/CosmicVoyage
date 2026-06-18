import { describe, expect, it } from 'vitest';
import { Player } from '../../../core/player';
import { StarbaseController } from '../../../core/starbase_controller';
import { Starbase } from '../../../entities/starbase';
import { PRNG } from '../../../utils/prng';

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
  });

  it('computes bounded visible row counts from the terminal dimensions', () => {
    const controller = new StarbaseController();

    expect(controller.getVisibleRowCount(120, 12)).toBe(6);
    expect(controller.getVisibleRowCount(360, 12)).toBe(12);
    expect(controller.getVisibleRowCount(1200, 12)).toBe(18);
  });
});
