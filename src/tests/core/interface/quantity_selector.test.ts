import { describe, expect, it } from 'vitest';
import {
  adjustQuantitySelector,
  createQuantitySelector,
  createQuantitySelectorModel,
  setQuantitySelectorValue,
} from '../../../core/quantity_selector';

describe('quantity selector', () => {
  it('clamps values and exposes a reusable text modal model', () => {
    const selector = createQuantitySelector({
      title: 'Sell Cargo',
      subject: 'Water Ice',
      detail: 'station transfer',
      max: 12,
      value: 20,
      context: { type: 'sell', itemKey: 'WATER_ICE' },
    });

    expect(selector.value).toBe(12);
    expect(adjustQuantitySelector(selector, -20).value).toBe(1);
    expect(setQuantitySelectorValue(selector, 6).value).toBe(6);

    const model = createQuantitySelectorModel(selector);
    expect(model.title).toBe('Sell Cargo');
    expect(model.columns).toEqual(['AMOUNT', 'LIMIT', 'REMAINING', 'TRANSFER']);
    expect(model.rows[0].cells[0]).toBe('12 units');
    expect(model.footer.join(' ')).toContain('Enter confirm');
  });

  it('supports one-decimal selectors for fractional mineral deposits', () => {
    const selector = createQuantitySelector({
      title: 'Mine Deposit',
      subject: 'Iron | surface extraction',
      detail: 'remaining local seam',
      unitLabel: 'm^3',
      max: 0.5,
      value: 0.25,
      step: 0.1,
      precision: 1,
      context: { type: 'mine' },
    });

    expect(selector.min).toBe(0.1);
    expect(selector.value).toBe(0.3);
    expect(adjustQuantitySelector(selector, -0.2).value).toBe(0.1);

    const model = createQuantitySelectorModel(selector);
    expect(model.rows[0].cells[0]).toBe('0.3 m^3');
    expect(model.rows[0].cells[1]).toBe('0.5');
  });
});
