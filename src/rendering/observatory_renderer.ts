import { CONFIG } from '../config';
import { GLYPHS } from '../constants/visual';
import { getRenderedStarCell } from './starfield';
import type { ObservatoryScreenModel } from '../core/observatory';
import { observatoryBiologyLabel } from '../core/observatory';
import { revealTerminalLines } from '../core/terminal_text_reveal';
import type { ObservatoryContact } from '../core/observatory_types';
import { ScreenBuffer } from './screen_buffer';
import { TEXT_PALETTE, textToneColour } from './text_palette';
import { drawShortcutText } from './shortcut_text';

/** Draws a full-screen instrument with exclusive ownership of every underlying raster and text cell. */
export function drawObservatory(buffer: ScreenBuffer, model: ObservatoryScreenModel): void {
  const cols = buffer.getCols();
  const rows = buffer.getRows();
  const bg = CONFIG.DEFAULT_BG_COLOUR;
  buffer.occludeScaledGlyphs(0, 0, cols, rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) buffer.drawChar(' ', x, y, null, bg);
  if (cols < 20 || rows < 14) {
    buffer.drawString('OBSERVATORY', 1, 1, TEXT_PALETTE.cyan, bg);
    buffer.drawString('Esc return', 1, 3, TEXT_PALETTE.text, bg, 'thin');
    return;
  }
  /** Clips only compact fixed-format instrument labels, never the scientific report. */
  const text = (
    value: string,
    x: number,
    y: number,
    colour: string = TEXT_PALETTE.text,
    thick = false,
    width = cols - x - 1
  ): void => {
    if (y >= 0 && y < rows)
      buffer.drawString(value.slice(0, Math.max(0, width)), x, y, colour, bg, thick ? 'thick' : 'thin');
  };
  text('OBSERVATORY', 2, 1, TEXT_PALETTE.textBright, true);
  text(
    `${model.equipmentClass ? `SUITE CLASS ${model.equipmentClass}` : 'NAVIGATION CATALOGUE'} / GRID ${model.worldX},${model.worldY} / SEARCH ${model.radiusLy.toFixed(0)} ly`,
    2,
    2,
    TEXT_PALETTE.greenSoft
  );
  const narrow = cols < 64;
  let filterX = 2;
  model.filterLabels.forEach((label, index) => {
    if (narrow && index !== model.filterGroup) return;
    const value = `${index === model.filterGroup ? '[' : ' '}${label}${index === model.filterGroup ? ']' : ' '} `;
    text(value, filterX, 4, index === model.filterGroup ? TEXT_PALETTE.amber : TEXT_PALETTE.textMuted);
    filterX += value.length;
  });
  for (let x = 2; x < cols - 2; x++) buffer.drawChar(GLYPHS.BOX.H, x, 5, TEXT_PALETTE.cyanDeep, bg);
  if (model.layout.plotWidth) drawPlot(buffer, model);
  const { readoutX: x, readoutWidth: width, listRows, detailRows } = model.layout;
  text(`CONTACTS ${model.contacts.length} / ${model.sortLabel}`, x, 6, TEXT_PALETTE.cyan, true, width);
  model.contacts.slice(model.viewOffset, model.viewOffset + listRows).forEach((contact, index) => {
    const selected = contact.id === model.selectedId;
    const record = model.observations[contact.id];
    const flag =
      record?.technology === 'unidentified'
        ? '?'
        : record?.biology === 'strong'
          ? 'B'
          : record?.biology === 'candidate'
            ? 'b'
            : record?.biology === 'catalogued'
              ? 'C'
              : '.';
    const prefix = `${selected ? '>' : ' '} ${contact.distanceLy.toFixed(1).padStart(5)} ${flag} `;
    text(
      prefix + contact.name,
      x,
      7 + index,
      selected
        ? TEXT_PALETTE.textBright
        : flag === '?' || flag === 'b'
          ? TEXT_PALETTE.amber
          : TEXT_PALETTE.greenSoft,
      false,
      width
    );
  });
  const detailY = 8 + listRows;
  const visible = model.details.slice(model.detailOffset, model.detailOffset + detailRows);
  const frame = revealTerminalLines(visible, model.reveal, width);
  frame.lines.forEach((line, index) => {
    let atX = x;
    for (const segment of line.segments) {
      buffer.drawString(
        segment.text,
        atX,
        detailY + index,
        textToneColour(segment.tone ?? 'normal'),
        bg,
        segment.font ?? 'thin'
      );
      atX += segment.text.length;
    }
  });
  if (frame.cursor)
    buffer.drawChar(
      '_',
      x + frame.cursor.column,
      detailY + frame.cursor.row,
      TEXT_PALETTE.greenBright,
      bg,
      'thin'
    );
  if (model.details.length > detailRows)
    text(
      `${model.detailOffset + 1}-${Math.min(model.details.length, model.detailOffset + detailRows)}/${model.details.length} / PgUp PgDn`,
      x,
      rows - 5,
      TEXT_PALETTE.textMuted,
      false,
      width
    );
  text(
    model.notice || model.coverage,
    2,
    rows - 4,
    model.notice ? TEXT_PALETTE.amber : TEXT_PALETTE.greenSoft
  );
  const footer =
    cols < 90
      ? cols < 40
        ? ['Up/Dn Tab <> PgUp/Dn', 'V Enter C Esc']
        : ['Up/Dn contacts Tab group <> filter', 'V scan Enter mark C clear Esc return']
      : [
          'Up/Down contacts   Tab filter group   Left/Right filter   S sort   PgUp/PgDn report',
          '[V] Observe   [Enter] Mark destination   [C] Clear destination   [Esc] Return',
        ];
  footer.forEach((line, index) =>
    drawShortcutText(buffer, line.slice(0, cols - 4), 2, rows - 2 + index, TEXT_PALETTE.cyan, bg)
  );
}

/** Projects the bounded local catalogue with physically equal horizontal and vertical scale. */
function drawPlot(buffer: ScreenBuffer, model: ObservatoryScreenModel): void {
  const bg = CONFIG.DEFAULT_BG_COLOUR;
  const width = model.layout.plotWidth;
  const top = 7;
  const bottom = buffer.getRows() - 8;
  const centerX = width / 2;
  const centerY = (top + bottom) / 2;
  const cw = Math.max(1, buffer.getCharWidthPx());
  const ch = Math.max(1, buffer.getCharHeightPx());
  const scale = Math.min((width - 8) * cw, (bottom - top - 2) * ch) / Math.max(1, 2 * model.radiusLy);
  /** Maps one reachable catalogue contact into the sparse plot's terminal cells. */
  const position = (contact: ObservatoryContact): { x: number; y: number } => ({
    x: Math.round(
      centerX + ((contact.worldX - model.worldX) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS * scale) / cw
    ),
    y: Math.round(
      centerY + ((contact.worldY - model.worldY) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS * scale) / ch
    ),
  });
  buffer.drawString('LOCAL ASTROMETRY', 2, 6, TEXT_PALETTE.cyan, bg);
  buffer.drawString('^ COREWARD', 2, top, TEXT_PALETTE.textMuted, bg, 'thin');
  for (let y = 6; y <= buffer.getRows() - 5; y++)
    buffer.drawChar(GLYPHS.BOX.V, width, y, TEXT_PALETTE.cyanDeep, bg);
  /** Draws stellar photospheres consistently with travel, adding evidence markers outside the glyph. */
  const drawContact = (contact: ObservatoryContact, selected: boolean): void => {
    const p = position(contact);
    const star = contact.system?.starType
      ? getRenderedStarCell(contact.system.starType, contact.worldX, contact.worldY)
      : { char: '?', color: TEXT_PALETTE.amber };
    buffer.drawChar(star.char, p.x, p.y, star.color, bg);
    if (selected || contact.id === model.destinationId) {
      buffer.drawChar('[', p.x - 1, p.y, selected ? TEXT_PALETTE.cyanActive : TEXT_PALETTE.amber, bg);
      buffer.drawChar(']', p.x + 1, p.y, selected ? TEXT_PALETTE.cyanActive : TEXT_PALETTE.amber, bg);
    } else if (['candidate', 'strong'].includes(model.observations[contact.id]?.biology ?? ''))
      buffer.drawChar('.', p.x, p.y + 1, TEXT_PALETTE.greenBright, bg);
  };
  for (const contact of model.contacts) if (contact.id !== model.selectedId) drawContact(contact, false);
  const selected = model.contacts.find((contact) => contact.id === model.selectedId);
  if (selected) {
    drawContact(selected, true);
    buffer.drawString(selected.name.slice(0, width - 4), 2, bottom + 2, TEXT_PALETTE.textBright, bg, 'thin');
    buffer.drawString(
      observatoryBiologyLabel(model.observations[selected.id]).slice(0, width - 4),
      2,
      bottom + 3,
      TEXT_PALETTE.amber,
      bg,
      'thin'
    );
  }
  // Keep the player's fix legible even when the selected system occupies the current coordinate.
  buffer.drawChar('+', Math.round(centerX), Math.round(centerY), TEXT_PALETTE.greenBright, bg);
}
