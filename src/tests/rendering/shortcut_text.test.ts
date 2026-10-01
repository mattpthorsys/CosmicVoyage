import { describe, expect, it } from 'vitest';
import { getShortcutFontMask } from '../../rendering/shortcut_text';

/** Returns the characters marked as thick by the shortcut formatter. */
function thickText(text: string, leadingColumn = false): string {
  const mask = getShortcutFontMask(text, leadingColumn);
  return [...text].filter((_, index) => mask[index]).join('');
}

describe('shortcut typography', () => {
  it('marks key labels but not their explanations', () => {
    expect(thickText('UP/DN scroll  PGUP/DN page')).toBe('UP/DNPGUP/DN');
    expect(thickText('ESC return to orbit')).toBe('ESC');
    expect(thickText('Enter/Space confirms, Esc cancels')).toBe('Enter/SpaceEsc');
  });

  it('recognizes a help action key in its leading column', () => {
    expect(thickText('s          Scan current contact', true)).toBe('s');
    expect(thickText('Fuel 500/500  Cargo 0/100')).toBe('');
  });
});
