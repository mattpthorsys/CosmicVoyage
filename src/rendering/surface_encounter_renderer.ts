import type { EncounterViewModel } from '../core/xenobiology_ui';
import { biologyDashboard } from '../core/xenobiology_ui';
import { CONFIG } from '../config';
import { GLYPHS } from '../constants/visual';
import type { ScreenBuffer } from './screen_buffer';
import { TEXT_PALETTE, textToneColour } from './text_palette';
import { wrapDashboardLines, type TextDashboardSegment } from '../core/text_ui';
import { drawShortcutText } from './shortcut_text';
import { ROVER_SPRITE, type PixelSprite } from './encounter_sprites';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Allocates an unframed surface and telemetry band, stacking the latter only on narrow displays. */
export function getEncounterLayout(
  cols: number,
  rows: number,
  footerRows = 2
): {
  field: Region;
  panel: Region;
  wide: boolean;
} {
  const wide = cols >= 64;
  const height = Math.max(1, rows - 2 - footerRows);
  const panelWidth = Math.min(32, Math.max(24, Math.floor(cols * 0.34)));
  if (wide)
    return {
      wide,
      field: { x: 0, y: 2, width: cols - panelWidth - 1, height },
      panel: { x: cols - panelWidth, y: 2, width: panelWidth, height },
    };
  const fieldHeight = Math.min(14, Math.max(4, Math.floor(height * 0.38)));
  return {
    wide,
    field: { x: 0, y: 2, width: cols, height: fieldHeight },
    panel: { x: 0, y: fieldHeight + 3, width: cols, height: Math.max(1, height - fieldHeight - 1) },
  };
}

/** Draws a pixel silhouette through the existing nearest-neighbour raster, clipped before queuing. */
function drawSprite(
  buffer: ScreenBuffer,
  sprite: PixelSprite,
  x: number,
  y: number,
  pixelScale: number,
  frame: number,
  clip: Region,
  state = 'active',
  displaying = false
): void {
  const pattern =
    displaying && state === 'active' && sprite.displayFrame
      ? sprite.displayFrame
      : sprite.frames[state === 'active' ? frame % sprite.frames.length : 0];
  const palette =
    state === 'dead'
      ? ['#343537', '#74767b', '#b4b5b0', '#d4d3c8']
      : state === 'stunned'
        ? ['#473c29', '#bd9e54', '#e8d899', '#fff4c9']
        : sprite.palette;
  for (let row = 0; row < pattern.length; row++)
    for (let col = 0; col < pattern[row].length; col++) {
      const index = Number(pattern[row][col]) - 1;
      if (index < 0 || !Number.isInteger(index)) continue;
      const px = x + col * pixelScale,
        py = y + row * pixelScale;
      if (
        px < clip.x ||
        py < clip.y ||
        px + pixelScale > clip.x + clip.width ||
        py + pixelScale > clip.y + clip.height
      )
        continue;
      const colour = palette[index];
      buffer.drawScaledChar(GLYPHS.BLOCK, px, py, colour, colour, pixelScale, pixelScale);
    }
}

/** Draws the habitat as a close surface view, retaining native terrain colours and pixel-sized organisms. */
export function drawSurfaceEncounter(buffer: ScreenBuffer, model: EncounterViewModel): void {
  const cols = buffer.getCols(),
    rows = buffer.getRows(),
    bg = CONFIG.DEFAULT_BG_COLOUR;
  const messages = biologyDashboard([model.message], cols - 2).map((line) =>
    line.segments.map((segment) => segment.text).join('')
  );
  const menuLines = model.menuActive
    ? biologyDashboard(['LEFT/RIGHT select  ENTER use  ESC drive'], cols - 2).map((line) =>
        line.segments.map((segment) => segment.text).join('')
      )
    : [];
  const footerRows = Math.min(rows - 8, Math.max(2, messages.length + menuLines.length));
  const { field, panel, wide } = getEncounterLayout(cols, rows, footerRows);
  buffer.drawString(model.title.toUpperCase().slice(0, cols - 2), 1, 0, TEXT_PALETTE.textBright, bg);
  buffer.drawString(model.status.join(' / ').slice(0, cols - 2), 1, 1, TEXT_PALETTE.textMuted, bg, 'thin');
  const tileX = Math.max(3, Math.ceil(field.width / 32)),
    tileY = Math.max(2, Math.ceil(field.height / 24));
  const visibleX = Math.ceil(field.width / tileX),
    visibleY = Math.ceil(field.height / tileY);
  const left = Math.max(0, Math.min(32 - visibleX, model.rover.x - Math.floor(visibleX / 2)));
  const top = Math.max(0, Math.min(24 - visibleY, model.rover.y - Math.floor(visibleY / 2)));
  // Visual zoom/camera never changes the field's five-metre collision or actor coordinates.
  for (let y = 0; y < field.height; y++)
    for (let x = 0; x < field.width; x++) {
      const cx = left + Math.floor(x / tileX),
        cy = top + Math.floor(y / tileY);
      const colour = model.surface?.colours[cy]?.[cx] ?? model.surface?.groundColour ?? '#63856d';
      buffer.drawChar(GLYPHS.BLOCK, field.x + x, field.y + y, colour, colour);
      const obstacle = model.terrain[cy]?.[cx] === '#';
      // Map edges are not painted as a rectangular fence; interior obstacles read as outcrops.
      if (obstacle && cx > 0 && cx < 31 && cy > 0 && cy < 23 && x % tileX === 1 && y % tileY === 0)
        buffer.drawChar('^', field.x + x, field.y + y, '#c4c5a9', colour);
    }
  /** Projects a physical field position into the zoomed surface camera. */
  const point = (x: number, y: number): [number, number] => [
    field.x + (x - left) * tileX,
    field.y + (y - top) * tileY,
  ];
  const entry = point(16, 21);
  if (
    entry[0] >= field.x &&
    entry[0] + 2 < field.x + field.width &&
    entry[1] >= field.y &&
    entry[1] < field.y + field.height
  )
    buffer.drawString('[<]', entry[0], entry[1], TEXT_PALETTE.amber, null);
  for (const actor of model.actors) {
    const p = point(actor.x, actor.y);
    drawSprite(buffer, actor.sprite, p[0], p[1], 0.5, model.turn, field, actor.state, actor.displaying);
    if (actor.state === 'stunned') {
      const markerY = p[1] > field.y ? p[1] - 1 : p[1] + Math.ceil(actor.sprite.frames[0].length * 0.5);
      if (
        p[0] >= field.x &&
        p[0] + 2 <= field.x + field.width &&
        markerY >= field.y &&
        markerY < field.y + field.height
      )
        buffer.drawString('zZ', p[0], markerY, TEXT_PALETTE.amber, null, 'thin');
    }
    // The office marker follows this camera projection, while cyan brackets retain selection ownership.
    if (
      actor.missionTarget &&
      p[0] + 3 >= field.x &&
      p[0] + 4 <= field.x + field.width &&
      p[1] >= field.y &&
      p[1] < field.y + field.height
    )
      buffer.drawChar('+', p[0] + 3, p[1], TEXT_PALETTE.greenBright, null, 'thin');
    if (
      actor.selected &&
      p[0] - 1 >= field.x &&
      p[0] + 3 < field.x + field.width &&
      p[1] >= field.y &&
      p[1] + 1 < field.y + field.height
    ) {
      buffer.drawChar('[', p[0] - 1, p[1], TEXT_PALETTE.cyanActive, null, 'thin');
      buffer.drawChar(']', p[0] + 3, p[1] + 1, TEXT_PALETTE.cyanActive, null, 'thin');
    }
  }
  const rover = point(model.rover.x, model.rover.y);
  drawSprite(buffer, ROVER_SPRITE, rover[0], rover[1], 0.5, 0, field);
  if (wide)
    for (let row = panel.y; row < panel.y + panel.height; row++)
      buffer.drawChar(GLYPHS.BOX.V, panel.x - 1, row, TEXT_PALETTE.cyanDeep, bg);
  drawTelemetry(buffer, model, panel, wide);
  let row = rows - footerRows;
  for (const line of menuLines) drawShortcutText(buffer, line, 1, row++, TEXT_PALETTE.cyan, bg);
  for (const line of messages) {
    if (row >= rows) break;
    buffer.drawString(line, 1, row++, TEXT_PALETTE.amber, bg, 'thin');
  }
}

/** Draws real crew health, hold utilisation and a short evidence-limited creature assessment. */
function drawTelemetry(buffer: ScreenBuffer, model: EncounterViewModel, panel: Region, wide: boolean): void {
  const bg = CONFIG.DEFAULT_BG_COLOUR,
    x = panel.x + 1,
    width = panel.width - 2;
  const limit = panel.y + panel.height - 1;
  let y = panel.y;
  /** Wraps a paragraph within this panel without writing into its neighbouring terrain. */
  const text = (value: string, colour: string = TEXT_PALETTE.text, heading = false): void => {
    const lines = biologyDashboard([value], width);
    for (const line of lines) {
      if (y >= limit) break;
      buffer.drawString(
        line.segments.map((span) => span.text).join(''),
        x,
        y++,
        colour,
        bg,
        heading ? 'thick' : 'thin'
      );
    }
  };
  /** Wraps semantic highlights without leaking text into the terrain or reserving extra panel space. */
  const styled = (segments: readonly TextDashboardSegment[]): void => {
    for (const line of wrapDashboardLines([{ segments: [...segments] }], width)) {
      if (y >= limit) break;
      let cursor = x;
      for (const span of line.segments) {
        buffer.drawString(
          span.text,
          cursor,
          y,
          textToneColour(span.tone ?? 'normal'),
          bg,
          span.font ?? 'thin'
        );
        cursor += span.text.length;
      }
      y++;
    }
  };
  /** Writes a fixed-width utilisation bar whose label and numeric value remain independent. */
  const bar = (percent: number, colour: string): void => {
    const size = Math.max(4, width - 8),
      filled = Math.round((Math.max(0, Math.min(100, percent)) * size) / 100);
    text('[' + '|'.repeat(filled) + '.'.repeat(size - filled) + '] ' + percent + '%', colour);
  };
  if (wide) {
    text('FIELD TELEMETRY', TEXT_PALETTE.cyan, true);
    y++;
    text('ROVER INTEGRITY', TEXT_PALETTE.textMuted);
    bar(model.integrity, model.integrity < 40 ? TEXT_PALETTE.red : TEXT_PALETTE.greenSoft);
    text('FUEL ' + model.fuelPercent + '%', TEXT_PALETTE.textMuted);
    y++;
    text('CARGO / ' + model.cargo.percent + '%', TEXT_PALETTE.cyan, true);
    bar(model.cargo.percent, model.cargo.percent > 90 ? TEXT_PALETTE.amber : TEXT_PALETTE.text);
    text(
      model.cargo.usedM3.toFixed(1) + ' / ' + model.cargo.capacityM3.toFixed(1) + ' m^3',
      TEXT_PALETTE.amber
    );
    y++;
    text('CREW HEALTH', TEXT_PALETTE.cyan, true);
  } else {
    text('ROVER ' + model.integrity + '% / FUEL ' + model.fuelPercent + '%', TEXT_PALETTE.greenSoft);
    text(
      'CARGO ' +
        model.cargo.percent +
        '% / ' +
        model.cargo.usedM3.toFixed(1) +
        '/' +
        model.cargo.capacityM3.toFixed(0) +
        ' m^3',
      TEXT_PALETTE.amber
    );
  }
  for (const member of model.crew) {
    const hp = member.hitPoints + '/' + member.maxHitPoints;
    const nameWidth = Math.max(4, width - hp.length - 1);
    text(
      member.name.slice(0, nameWidth).padEnd(nameWidth) + ' ' + hp,
      member.hitPoints < member.maxHitPoints * 0.4 ? TEXT_PALETTE.red : TEXT_PALETTE.text
    );
  }
  y++;
  text('BIOSENSOR', TEXT_PALETTE.cyan, true);
  const quote = wide
    ? model.scanner.find((line) => line.startsWith('Cr data') || line.startsWith('Value unresolved'))
    : undefined;
  const assessmentRows = biologyDashboard(
    [
      model.targetName,
      model.targetStatus,
      ...model.missionGuidance.map((line) => line.segments.map((span) => span.text).join('')),
      model.brief,
      model.targetMass,
      model.targetRange,
      quote ?? '',
      ...model.requests,
    ],
    width
  ).length;
  // A magnified silhouette is optional; never trade away the actual assessment to fit a portrait.
  if (wide && model.targetSprite && y + 6 + assessmentRows <= limit) {
    const actor = model.actors.find((item) => item.selected);
    drawSprite(
      buffer,
      model.targetSprite,
      x + Math.floor((width - 6) / 2),
      y + 1,
      1,
      model.turn,
      panel,
      actor?.state,
      actor?.displaying
    );
    y += 6;
  }
  text(model.targetName, textToneColour(model.targetNameTone), true);
  text(
    model.targetStatus,
    model.targetStatus.includes('UNKNOWN') ? TEXT_PALETTE.amber : TEXT_PALETTE.greenSoft
  );
  for (const line of model.missionGuidance) styled(line.segments);
  if (model.briefSegments.length) styled(model.briefSegments);
  else text(model.brief);
  if (model.targetMassSegments.length) styled(model.targetMassSegments);
  else text(model.targetMass, TEXT_PALETTE.textMuted);
  text(
    model.targetRange,
    model.actors.some((actor) => actor.selected && actor.state === 'stunned')
      ? TEXT_PALETTE.amber
      : TEXT_PALETTE.cyan
  );
  if (quote) text(quote, TEXT_PALETTE.amber);
  for (const request of model.requests) text(request, TEXT_PALETTE.amber);
  drawShortcutText(buffer, '[D] dossier  [O] cargo'.slice(0, width), x, limit, TEXT_PALETTE.cyan, bg);
}
