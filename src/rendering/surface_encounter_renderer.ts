import type { EncounterViewModel } from '../core/xenobiology_ui';
import { biologyDashboard } from '../core/xenobiology_ui';
import { CONFIG } from '../config';
import { DrawingContext } from './drawing_context';
import type { ScreenBuffer } from './screen_buffer';
import { TEXT_PALETTE } from './text_palette';
import { drawShortcutText } from './shortcut_text';

/** Draws a bounded local field, with a responsive sensor panel and no regional/starfield effects. */
export function drawSurfaceEncounter(buffer: ScreenBuffer, model: EncounterViewModel): void {
  const cols = buffer.getCols(),
    rows = buffer.getRows();
  const bg = CONFIG.DEFAULT_BG_COLOUR;
  const drawing = new DrawingContext(buffer);
  drawing.drawBox(0, 0, cols, rows, TEXT_PALETTE.cyanDeep, bg, ' ');
  buffer.drawString(model.title.slice(0, cols - 4), 2, 0, TEXT_PALETTE.cyanSignal, bg);
  const wide = cols >= 90;
  const scaleX = wide ? 2 : 1;
  const fieldWidth = Math.min(32, Math.floor((wide ? cols - 43 : cols - 4) / scaleX));
  const fieldHeight = Math.min(24, Math.max(3, rows - (wide ? 9 : 19)));
  const mapX = 2,
    mapY = 3;
  const left = Math.max(0, Math.min(32 - fieldWidth, model.rover.x - Math.floor(fieldWidth / 2)));
  const top = Math.max(0, Math.min(24 - fieldHeight, model.rover.y - Math.floor(fieldHeight / 2)));
  // Crop the camera only, not the encounter's physical coordinates or passability.
  for (let y = 0; y < fieldHeight; y++)
    for (let x = 0; x < fieldWidth; x++) {
      const cell = model.terrain[y + top]?.[x + left];
      buffer.drawChar(
        cell === '#' ? '#' : '.',
        mapX + x * scaleX,
        mapY + y,
        cell === '#' ? '#456167' : '#172e2b',
        bg
      );
    }
  /** Projects a visible field position into the clipped local camera. */
  const position = (x: number, y: number): [number, number] | null =>
    x >= left && x < left + fieldWidth && y >= top && y < top + fieldHeight
      ? [mapX + (x - left) * scaleX, mapY + y - top]
      : null;
  const entry = position(16, 21);
  if (entry) buffer.drawChar('<', entry[0], entry[1], TEXT_PALETTE.cyanSignal, bg);
  for (const actor of model.actors) {
    const p = position(actor.x, actor.y);
    if (!p) continue;
    const colour =
      actor.state === 'dead'
        ? '#82898c'
        : actor.state === 'stunned'
          ? '#e4cf75'
          : actor.dangerous
            ? '#f99576'
            : '#74ca91';
    buffer.drawChar(
      actor.state === 'dead' ? '%' : actor.glyph,
      p[0],
      p[1],
      colour,
      actor.selected ? '#153f43' : bg
    );
    if (actor.selected && scaleX > 1) buffer.drawChar('<', p[0] + 1, p[1], TEXT_PALETTE.cyanSignal, bg);
  }
  const rover = position(model.rover.x, model.rover.y);
  if (rover) buffer.drawChar('@', rover[0], rover[1], '#c0f9ef', bg);
  buffer.drawString(`X${model.rover.x} Y${model.rover.y} / ENTRY X16 Y21`, 2, 1, '#70bdad', bg, 'thin');
  const sensorX = wide ? mapX + fieldWidth * scaleX + 3 : 2;
  const sensorY = wide ? 3 : mapY + fieldHeight + 1;
  const sensorWidth = cols - sensorX - 2;
  const sensorHeight = wide ? rows - sensorY - 7 : Math.min(8, rows - sensorY - 7);
  buffer.drawString('BIOSENSOR', sensorX, sensorY, TEXT_PALETTE.cyanSignal, bg);
  const lines = biologyDashboard(model.scanner, sensorWidth);
  for (let index = 0; index < Math.max(0, sensorHeight - 1) && index < lines.length; index++) {
    buffer.drawString(
      lines[index].segments.map((segment) => segment.text).join(''),
      sensorX,
      sensorY + 1 + index,
      '#8bdbb1',
      bg,
      'thin'
    );
  }
  const footer = rows - 6;
  model.status.forEach((line, index) =>
    buffer.drawString(line.slice(0, cols - 4), 2, footer + index, '#7ab9bd', bg, 'thin')
  );
  buffer.drawString(model.message.slice(0, cols - 4), 2, rows - 4, '#dfcb80', bg, 'thin');
  const shortcuts =
    cols >= 70
      ? [
          'Arrows drive  TAB target  V observe  A analyse  ENTER operations',
          'D dossier  N species  O cargo  ESC withdraw at entry',
        ]
      : ['Arrows drive  TAB target  V scan  A analyse', 'ENTER ops  D dossier  N species  O cargo  ESC exit'];
  shortcuts.forEach((line, index) =>
    drawShortcutText(buffer, line.slice(0, cols - 4), 2, rows - 3 + index, '#77c6de', bg)
  );
}
