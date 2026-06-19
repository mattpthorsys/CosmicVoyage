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
  skipSelection?: boolean;
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

/** Clamps index. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/** Clamps offset. */
export function clampOffset(offset: number, rowCount: number, visibleRows: number): number {
  return Math.max(0, Math.min(offset, Math.max(0, rowCount - Math.max(1, visibleRows))));
}

/** Moves selection. */
export function moveSelection(
  currentIndex: number,
  delta: number,
  rowCount: number,
  visibleRows: number,
  currentOffset: number
): SelectionViewport {
  return setSelection(currentIndex + delta, rowCount, visibleRows, currentOffset);
}

/** Moves selection in rows. */
export function moveSelectionInRows(
  currentIndex: number,
  delta: number,
  rows: TextTableRow[],
  visibleRows: number,
  currentOffset: number
): SelectionViewport {
  if (rows.length === 0) return setSelection(0, 0, visibleRows, currentOffset);
  const current = findSelectableRowIndex(rows, clampIndex(currentIndex, rows.length), delta >= 0 ? 1 : -1);
  const baseIndex = current >= 0 ? current : clampIndex(currentIndex, rows.length);
  if (delta === 0) {
    const selectedIndex = findNearestSelectableRowIndex(rows, baseIndex, 1);
    return setSelection(
      selectedIndex >= 0 ? selectedIndex : baseIndex,
      rows.length,
      visibleRows,
      currentOffset
    );
  }

  const direction = delta > 0 ? 1 : -1;
  const targetIndex = clampIndex(baseIndex + delta, rows.length);
  const selectedIndex = findSelectableRowIndex(rows, targetIndex, direction);
  if (selectedIndex < 0) return setSelection(baseIndex, rows.length, visibleRows, currentOffset);
  return setSelection(selectedIndex, rows.length, visibleRows, currentOffset);
}

/** Finds selectable row index. */
function findSelectableRowIndex(rows: TextTableRow[], startIndex: number, direction: 1 | -1): number {
  for (let index = startIndex; index >= 0 && index < rows.length; index += direction) {
    if (!rows[index].skipSelection) return index;
  }
  return -1;
}

/** Finds nearest selectable row index. */
function findNearestSelectableRowIndex(
  rows: TextTableRow[],
  startIndex: number,
  preferredDirection: 1 | -1
): number {
  const preferred = findSelectableRowIndex(rows, startIndex, preferredDirection);
  if (preferred >= 0) return preferred;
  return findSelectableRowIndex(rows, startIndex, preferredDirection === 1 ? -1 : 1);
}

/** Updates selection. */
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
