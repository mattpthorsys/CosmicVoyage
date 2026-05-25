import { describe, expect, it } from 'vitest';
import {
  adjustQuantitySelector,
  createQuantitySelector,
  createQuantitySelectorModel,
  setQuantitySelectorValue,
} from './quantity_selector';

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
});
