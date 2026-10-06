import type { TerminalDialogModel } from '../core/terminal_dialog';
import type { TextDashboardLine } from '../core/text_ui';
import { CONFIG } from '../config';
import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { TEXT_PALETTE, textToneColour } from './text_palette';

/** Draws a centred terminal choice above every staged scene, including the scaled orbital raster. */
export function drawTerminalDialog(buffer: ScreenBuffer, model: TerminalDialogModel): void {
  const cols = buffer.getCols(),
    rows = buffer.getRows();
  if (cols < 22 || rows < 16) return;
  const x = Math.floor((cols - model.width) / 2),
    y = Math.floor((rows - model.height) / 2);
  const context = new DrawingContext(buffer);
  buffer.occludeScaledGlyphs(x, y, model.width, model.height);
  context.drawBox(
    x,
    y,
    model.width,
    model.height,
    model.caution ? TEXT_PALETTE.amber : TEXT_PALETTE.cyanBorder,
    CONFIG.DEFAULT_BG_COLOUR,
    ' '
  );
  /** Draws styled spans to one fixed-grid line without allowing text through the frame. */
  const drawLine = (line: TextDashboardLine, row: number): void => {
    let column = x + 3;
    for (const span of line.segments) {
      const colour = textToneColour(span.tone ?? 'normal');
      const text = span.text.slice(0, Math.max(0, x + model.width - 3 - column));
      buffer.drawString(text, column, row, colour, CONFIG.DEFAULT_BG_COLOUR, span.font ?? 'thin');
      column += text.length;
    }
  };
  model.title.forEach((line, index) => drawLine(line, y + 1 + index));
  const contentY = y + model.title.length + 2;
  model.lines.forEach((line, index) => drawLine(line, contentY + index));
  if (model.lineCount > model.visibleRows) {
    buffer.drawChar(
      model.viewOffset > 0 ? '^' : ' ',
      x + model.width - 2,
      contentY,
      TEXT_PALETTE.cyan,
      CONFIG.DEFAULT_BG_COLOUR
    );
    buffer.drawChar(
      model.viewOffset + model.visibleRows < model.lineCount ? 'v' : ' ',
      x + model.width - 2,
      contentY + model.visibleRows - 1,
      TEXT_PALETTE.cyan,
      CONFIG.DEFAULT_BG_COLOUR
    );
  }
  const choiceY = y + model.height - 3;
  if (model.kind === 'confirmation') {
    const start = x + Math.floor((model.width - 15) / 2);
    const yesColour = model.caution ? TEXT_PALETTE.red : TEXT_PALETTE.greenBright;
    buffer.drawString(
      '[Y] YES',
      start,
      choiceY,
      model.selectedYes ? CONFIG.DEFAULT_BG_COLOUR : yesColour,
      model.selectedYes ? yesColour : CONFIG.DEFAULT_BG_COLOUR,
      'thick'
    );
    buffer.drawString(
      '[N] NO',
      start + 9,
      choiceY,
      model.selectedYes ? TEXT_PALETTE.cyan : CONFIG.DEFAULT_BG_COLOUR,
      model.selectedYes ? CONFIG.DEFAULT_BG_COLOUR : TEXT_PALETTE.cyan,
      'thick'
    );
  } else {
    buffer.drawString('ENTER', x + 3, choiceY, TEXT_PALETTE.cyan, CONFIG.DEFAULT_BG_COLOUR, 'thick');
    buffer.drawString(
      model.kind === 'progress' ? ' skip' : ' continue',
      x + 8,
      choiceY,
      TEXT_PALETTE.text,
      CONFIG.DEFAULT_BG_COLOUR,
      'thin'
    );
  }
}
