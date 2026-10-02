import type { TextDashboardLine, TextDashboardSegment } from './text_ui';

export interface TerminalTextFrame {
  lines: TextDashboardLine[];
  cursor: { row: number; column: number } | null;
}

/** Runs a skippable presentation timer independently of simulation time or text layout. */
export class TerminalTextReveal {
  private elapsedSeconds: number;

  /** Starts idle; callers explicitly begin each reveal with start(). */
  constructor(readonly durationSeconds = 1.5) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw new RangeError('Terminal reveal duration must be positive and finite.');
    this.elapsedSeconds = durationSeconds;
  }

  /** Returns normalized progress for the renderer's current visible text. */
  get progress(): number {
    return Math.min(1, this.elapsedSeconds / this.durationSeconds);
  }

  /** Reports whether another presentation frame is needed. */
  get isActive(): boolean {
    return this.elapsedSeconds < this.durationSeconds;
  }

  /** Begins or restarts the effect without changing any source text. */
  start(): void {
    this.elapsedSeconds = 0;
  }

  /** Shows all text immediately and retires the writing cursor. */
  complete(): void {
    this.elapsedSeconds = this.durationSeconds;
  }

  /** Advances real presentation time, retaining fractional steps at high frame rates. */
  update(deltaSeconds: number): boolean {
    if (!this.isActive || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
    this.elapsedSeconds = Math.min(this.durationSeconds, this.elapsedSeconds + deltaSeconds);
    return true;
  }
}

/** Reveals a viewport's styled text in reading order without mutating its full layout. */
export function revealTerminalLines(
  lines: readonly TextDashboardLine[],
  progress: number,
  width = Infinity
): TerminalTextFrame {
  const columns = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : Infinity;
  const lengths = lines.map((line) =>
    Math.min(
      columns,
      line.segments.reduce((sum, segment) => sum + segment.text.length, 0)
    )
  );
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 1;
  // Newline steps let the cursor cross blank rows and leave fully written lines.
  let remaining = Math.floor(fraction * lengths.reduce((sum, length) => sum + length + 1, 0));
  const revealed: TextDashboardLine[] = [];
  for (let row = 0; row < lines.length; row++) {
    const length = lengths[row];
    const count = Math.min(length, remaining);
    revealed.push(sliceTerminalLine(lines[row], count));
    if (fraction < 1 && remaining <= length) {
      const cursor =
        count < columns
          ? { row, column: count }
          : row + 1 < lines.length
            ? { row: row + 1, column: 0 }
            : null;
      return { lines: revealed, cursor };
    }
    remaining -= length + 1;
  }
  return { lines: revealed, cursor: null };
}

/** Clips spans by terminal cells while preserving their colour and font metadata. */
function sliceTerminalLine(line: TextDashboardLine, count: number): TextDashboardLine {
  const segments: TextDashboardSegment[] = [];
  for (const segment of line.segments) {
    if (count <= 0) break;
    const text = segment.text.slice(0, count);
    if (text) segments.push({ ...segment, text });
    count -= text.length;
  }
  return { ...line, segments };
}
