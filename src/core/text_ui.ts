export interface TextMenuSection<Id extends string = string> {
  id: Id;
  label: string;
}

export type TextTone = 'normal' | 'muted' | 'cyan' | 'green' | 'amber' | 'red' | 'bright';

export interface TextTableRow {
  id: string;
  cells: string[];
  detail?: string;
  disabled?: boolean;
  tone?: TextTone;
  cellTones?: TextTone[];
  detailTone?: TextTone;
}

export interface TextTableModel {
  columns: string[];
  widths: number[];
  rows: TextTableRow[];
  selectedIndex: number;
  viewOffset: number;
  visibleRowCount: number;
  detailLineCount?: number;
}

export type TextDashboardTone = TextTone;

export interface TextDashboardSegment {
  text: string;
  tone?: TextDashboardTone;
}

export interface TextDashboardLine {
  segments: TextDashboardSegment[];
}

export interface TextModalTableModel extends TextTableModel {
  title: string;
  subtitle?: string;
  footer?: string[];
  dashboard?: TextDashboardLine[];
}

export interface SelectionViewport {
  selectedIndex: number;
  viewOffset: number;
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function clampOffset(offset: number, rowCount: number, visibleRows: number): number {
  return Math.max(0, Math.min(offset, Math.max(0, rowCount - Math.max(1, visibleRows))));
}

export function moveSelection(
  currentIndex: number,
  delta: number,
  rowCount: number,
  visibleRows: number,
  currentOffset: number
): SelectionViewport {
  return setSelection(currentIndex + delta, rowCount, visibleRows, currentOffset);
}

export function setSelection(
  index: number,
  rowCount: number,
  visibleRows: number,
  currentOffset: number
): SelectionViewport {
  const selectedIndex = clampIndex(index, rowCount);
  const safeVisibleRows = Math.max(1, visibleRows);
  let viewOffset = clampOffset(currentOffset, rowCount, safeVisibleRows);

  if (selectedIndex < viewOffset) viewOffset = selectedIndex;
  if (selectedIndex >= viewOffset + safeVisibleRows) viewOffset = selectedIndex - safeVisibleRows + 1;

  return {
    selectedIndex,
    viewOffset: clampOffset(viewOffset, rowCount, safeVisibleRows),
  };
}
