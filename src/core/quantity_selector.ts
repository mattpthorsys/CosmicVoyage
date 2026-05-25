import { TextModalTableModel } from './text_ui';

export interface QuantitySelectorState<Context = unknown> {
  title: string;
  subject: string;
  detail: string;
  unitLabel: string;
  min: number;
  max: number;
  value: number;
  step: number;
  context: Context;
}

export function createQuantitySelector<Context>(args: {
  title: string;
  subject: string;
  detail: string;
  unitLabel?: string;
  min?: number;
  max: number;
  value?: number;
  step?: number;
  context: Context;
}): QuantitySelectorState<Context> {
  const min = Math.max(1, Math.floor(args.min ?? 1));
  const max = Math.max(min, Math.floor(args.max));
  return {
    title: args.title,
    subject: args.subject,
    detail: args.detail,
    unitLabel: args.unitLabel ?? 'units',
    min,
    max,
    value: clampQuantity(args.value ?? max, min, max),
    step: Math.max(1, Math.floor(args.step ?? Math.max(1, Math.round(max / 10)))),
    context: args.context,
  };
}

export function adjustQuantitySelector<Context>(
  selector: QuantitySelectorState<Context>,
  delta: number
): QuantitySelectorState<Context> {
  return {
    ...selector,
    value: clampQuantity(selector.value + delta, selector.min, selector.max),
  };
}

export function setQuantitySelectorValue<Context>(
  selector: QuantitySelectorState<Context>,
  value: number
): QuantitySelectorState<Context> {
  return {
    ...selector,
    value: clampQuantity(value, selector.min, selector.max),
  };
}

export function createQuantitySelectorModel(selector: QuantitySelectorState): TextModalTableModel {
  const remaining = selector.max - selector.value;
  return {
    title: selector.title,
    subtitle: selector.subject,
    columns: ['AMOUNT', 'LIMIT', 'REMAINING', 'TRANSFER'],
    widths: [12, 12, 12, 34],
    rows: [
      {
        id: 'amount',
        cells: [
          `${selector.value} ${selector.unitLabel}`,
          `${selector.max}`,
          String(remaining),
          `${formatQuantityGauge(selector.value, selector.max, 22)} ${selector.detail}`,
        ],
      },
    ],
    selectedIndex: 0,
    viewOffset: 0,
    visibleRowCount: 1,
    footer: [
      'Left/Right adjust  PgUp/PgDn step  Up max  Down min',
      'Enter confirm  Esc cancel',
    ],
  };
}

function clampQuantity(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function formatQuantityGauge(value: number, max: number, width: number): string {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const filled = Math.round(ratio * width);
  return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
}
