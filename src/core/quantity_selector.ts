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
  precision: number;
  context: Context;
}

/** Creates quantity selector. */
export function createQuantitySelector<Context>(args: {
  title: string;
  subject: string;
  detail: string;
  unitLabel?: string;
  min?: number;
  max: number;
  value?: number;
  step?: number;
  precision?: number;
  context: Context;
}): QuantitySelectorState<Context> {
  const precision = Math.max(0, Math.min(3, Math.floor(args.precision ?? 0)));
  const min = roundQuantity(
    Math.max(precision > 0 ? 0.1 : 1, args.min ?? (precision > 0 ? 0.1 : 1)),
    precision
  );
  const max = Math.max(min, roundQuantity(args.max, precision));
  const defaultStep = precision > 0 ? 0.1 : Math.max(1, Math.round(max / 10));
  return {
    title: args.title,
    subject: args.subject,
    detail: args.detail,
    unitLabel: args.unitLabel ?? 'units',
    min,
    max,
    value: clampQuantity(args.value ?? max, min, max, precision),
    step: roundQuantity(Math.max(precision > 0 ? 0.1 : 1, args.step ?? defaultStep), precision),
    precision,
    context: args.context,
  };
}

/** Adjusts a quantity selector while respecting its minimum and maximum. */
export function adjustQuantitySelector<Context>(
  selector: QuantitySelectorState<Context>,
  delta: number
): QuantitySelectorState<Context> {
  return {
    ...selector,
    value: clampQuantity(selector.value + delta, selector.min, selector.max, selector.precision),
  };
}

/** Updates quantity selector value. */
export function setQuantitySelectorValue<Context>(
  selector: QuantitySelectorState<Context>,
  value: number
): QuantitySelectorState<Context> {
  return {
    ...selector,
    value: clampQuantity(value, selector.min, selector.max, selector.precision),
  };
}

/** Creates quantity selector model. */
export function createQuantitySelectorModel(selector: QuantitySelectorState): TextModalTableModel {
  const remaining = selector.max - selector.value;
  const valueText = formatQuantity(selector.value, selector.precision);
  const maxText = formatQuantity(selector.max, selector.precision);
  const remainingText = formatQuantity(remaining, selector.precision);
  return {
    title: selector.title,
    subtitle: selector.subject,
    columns: ['AMOUNT', 'LIMIT', 'REMAINING', 'TRANSFER'],
    widths: [12, 12, 12, 34],
    rows: [
      {
        id: 'amount',
        cells: [
          `${valueText} ${selector.unitLabel}`,
          maxText,
          remainingText,
          `${formatQuantityGauge(selector.value, selector.max, 22)} ${selector.detail}`,
        ],
      },
    ],
    selectedIndex: 0,
    viewOffset: 0,
    visibleRowCount: 1,
    footer: ['Left/Right adjust  PgUp/PgDn step  Up max  Down min', 'Enter confirm  Esc cancel'],
  };
}

/** Clamps quantity. */
function clampQuantity(value: number, min: number, max: number, precision: number = 0): number {
  return roundQuantity(Math.max(min, Math.min(max, value)), precision);
}

/** Rounds a selectable quantity to its configured precision. */
function roundQuantity(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

/** Formats quantity. */
function formatQuantity(value: number, precision: number): string {
  return precision > 0 ? value.toFixed(precision) : String(Math.round(value));
}

/** Formats quantity gauge. */
function formatQuantityGauge(value: number, max: number, width: number): string {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const filled = Math.round(ratio * width);
  return `[${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}]`;
}
