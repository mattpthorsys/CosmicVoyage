import type { SpeciesDefinition } from '../entities/biology/biology_types';
import { PRNG } from '../utils/prng';

export interface PixelSprite {
  readonly frames: readonly (readonly string[])[];
  readonly palette: readonly string[];
}

const SPRITES = {
  frond: ['.2..2.', '..22..', '.2332.', '..11..'],
  mat: ['......', '.2222.', '233332', '.1111.'],
  colony: ['..22..', '.2332.', '223322', '.1111.'],
  walker: ['.2..2.', '.2332.', '..11..', '.1..1.'],
  radial: ['..22..', '.2332.', '231132', '.1..1.'],
  ambush: ['.2..2.', '233332', '.1111.', '1....1'],
  fan: ['2.22.2', '.2332.', '..11..', '.1111.'],
  rosette: ['..22..', '233332', '.2112.', '..11..'],
  tripod: ['..22..', '.2332.', '.1..1.', '1.11.1'],
  burrower: ['......', '.2332.', '231132', '.1..1.'],
} as const;

export const ROVER_SPRITE: PixelSprite = {
  frames: [['1.22.1', '123321', '123321', '1.22.1']],
  palette: ['#1b2428', '#71c7cd', '#d9f5ec'],
};

/** Bakes tiny four-colour silhouettes once; visual variation never advances a gameplay RNG. */
export function createOrganismSprite(species: SpeciesDefinition, sizeScale = 1): PixelSprite {
  const prng = new PRNG(species.id).seedNew('silhouette');
  const sessile = species.behaviour === 'sessile';
  const pattern = species.bodyForm
    ? SPRITES[species.bodyForm]
    : sessile
      ? SPRITES[(prng.choice(['frond', 'mat', 'colony']) ?? 'frond') as 'frond' | 'mat' | 'colony']
      : species.behaviour === 'ambush'
        ? SPRITES.ambush
        : species.symmetry === 'radial'
          ? SPRITES.radial
          : SPRITES.walker;
  const colours = sessile
    ? ['#203a34', '#66a882', '#bfdba2', '#e0d99c']
    : species.covering.includes('shell')
      ? ['#302f38', '#aca3bc', '#e1d3c2', '#e9f7ee']
      : ['#303932', '#b9bb86', '#e0d5a3', '#eef7d8'];
  const second: string[] = [...pattern];
  if (!sessile) second[3] = species.bodyForm === 'tripod' ? '.1111.' : '.1..1.';
  // A small highlight is an observed surface feature, not a disclosure of hidden physiology.
  const first: string[] = [...pattern];
  first[1] = first[1].replace('3', '4');
  second[1] = second[1].replace('3', '4');
  return { frames: [first, second].map((frame) => sizeSilhouette(frame, sizeScale)), palette: colours };
}

/** Fits size variation within the stable six-by-four sprite footprint, preserving field spacing. */
function sizeSilhouette(frame: readonly string[], sizeScale: number): readonly string[] {
  if (sizeScale === 1 || sizeScale > 1.3) return frame;
  const width = sizeScale < 0.7 ? 4 : 5;
  const height = sizeScale < 0.7 ? 3 : 4;
  const left = Math.floor((6 - width) / 2);
  return Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 6 }, (_, x) => {
      if (x < left || x >= left + width || y < 4 - height) return '.';
      return frame[Math.min(3, Math.floor(((y - (4 - height)) * 4) / height))][
        Math.min(5, Math.floor(((x - left) * 6) / width))
      ];
    }).join('')
  );
}
