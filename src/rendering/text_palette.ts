// Central writing/UI colour palette. Star, planet, nebula, terrain, and liquid
// colours intentionally live elsewhere because they represent physical objects.
import type { TextTone } from '../core/text_ui';
export const TEXT_PALETTE = {
  background: '#000000',
  panelBackground: '#001010',
  panelBackgroundRaised: '#001818',
  panelBackgroundDanger: '#240808',
  inverseText: '#001010',

  text: '#9FFFE0',
  textStrong: '#D8FFF6',
  textBright: '#8CFFFF',
  textDim: '#506060',
  textMuted: '#2F6F68',
  textSoft: '#B8FFF0',

  cyan: '#5FC8FF',
  cyanSoft: '#7FD8FF',
  cyanDeep: '#006A6A',
  cyanBorder: '#3EA6A6',
  cyanBorderBright: '#00C8FF',
  cyanSignal: '#00CCAA',
  cyanActive: '#00FFFF',

  green: '#00AA66',
  greenBright: '#00FF66',
  greenAction: '#00C878',
  greenSoft: '#7CFFD0',
  greenFlashDim: '#48C8A8',
  greenFlashBright: '#A8FFE8',

  amber: '#FFD66B',
  amberDim: '#806A30',
  red: '#FF6677',
  redSoft: '#FF8A7A',
  redBorder: '#8A3030',
} as const;

export type TextPaletteKey = keyof typeof TEXT_PALETTE;

/** Maps semantic terminal tones consistently across table, dossier and field renderers. */
export function textToneColour(tone: TextTone): string {
  switch (tone) {
    case 'muted':
      return TEXT_PALETTE.textMuted;
    case 'cyan':
      return TEXT_PALETTE.cyan;
    case 'green':
      return TEXT_PALETTE.green;
    case 'match':
      return TEXT_PALETTE.greenBright;
    case 'amber':
      return TEXT_PALETTE.amber;
    case 'red':
      return TEXT_PALETTE.red;
    case 'bright':
      return TEXT_PALETTE.textBright;
    default:
      return TEXT_PALETTE.text;
  }
}
