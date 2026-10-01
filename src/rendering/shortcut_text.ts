import { ScreenBuffer, CellFont } from './screen_buffer';

const KEY_PATTERN =
  /\b(?:Numpad \d(?:\/\d)*|PGUP\/DN|UP\/DN|PgUp\/PgDn|Up\/Down|Left\/Right|PageUp|PageDown|Backspace|Arrows?|Enter|Space|Esc|Home|Ctrl|Shift|Tab|NumLock|ESC|ENTER|SPACE|TAB|HOME|CTRL|SHIFT|BACKSPACE|F\d{1,2})\b|\b[A-Z](?:\/[A-Z])?\b|\+\/-|\?/g;

/** Marks key names within a command hint, leaving the accompanying prose thin. */
export function getShortcutFontMask(text: string, leadingColumn = false): boolean[] {
  const mask = Array<boolean>(text.length).fill(false);
  for (const match of text.matchAll(KEY_PATTERN)) {
    const start = match.index ?? 0;
    for (let index = start; index < start + match[0].length; index++) mask[index] = true;
  }
  for (let index = 1; index < text.length - 1; index++) {
    if (text[index] === '/' && mask[index - 1] && mask[index + 1]) mask[index] = true;
  }
  if (leadingColumn) {
    const prefix = /^\s*\S+(?=\s{2,})/.exec(text);
    if (prefix) {
      for (let index = 0; index < prefix[0].length; index++) mask[index] = true;
    }
  }
  return mask;
}

/** Draws shortcut names in the display face and their descriptions in the terminal face. */
export function drawShortcutText(
  buffer: ScreenBuffer,
  text: string,
  x: number,
  y: number,
  fg: string,
  bg: string
): void {
  const mask = getShortcutFontMask(text);
  for (let start = 0; start < text.length; ) {
    const font: CellFont = mask[start] ? 'thick' : 'thin';
    let end = start + 1;
    while (end < text.length && mask[end] === mask[start]) end++;
    buffer.drawString(text.slice(start, end), x + start, y, fg, bg, font);
    start = end;
  }
}
