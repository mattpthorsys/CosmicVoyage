import type { SpeciesEvidence } from '../entities/biology/biology_types';
import type { TextDashboardLine, TextTone } from './text_ui';

interface Character {
  label: string;
  level: number;
  value: (entry: SpeciesEvidence) => string;
  structural?: boolean;
}

const CHARACTERS: readonly Character[] = [
  { label: 'Body symmetry', level: 2, value: (entry) => entry.species.symmetry, structural: true },
  {
    label: 'External form',
    level: 2,
    value: (entry) => entry.species.bodyForm ?? 'unresolved',
    structural: true,
  },
  {
    label: 'Appendages',
    level: 2,
    value: (entry) => (entry.species.anatomy ? String(entry.species.anatomy.appendages) : 'unresolved'),
    structural: true,
  },
  { label: 'Ecological role', level: 2, value: (entry) => entry.species.role },
  { label: 'Locomotion', level: 2, value: (entry) => entry.species.locomotion },
  { label: 'Organisation', level: 3, value: (entry) => entry.species.organisation, structural: true },
  { label: 'Covering', level: 3, value: (entry) => entry.species.covering, structural: true },
  { label: 'Senses', level: 3, value: (entry) => entry.species.senses, structural: true },
  { label: 'Chemistry', level: 3, value: (entry) => entry.species.chemistry },
];

/** Orders acquired counterparts by origin and observed resemblance without consulting hidden lineage. */
export function comparisonCandidates(
  primary: SpeciesEvidence,
  records: readonly SpeciesEvidence[]
): SpeciesEvidence[] {
  return records
    .filter((entry) => entry.level >= 2 && entry.species.id !== primary.species.id)
    .sort(
      (a, b) =>
        Number(b.species.bodyId === primary.species.bodyId) -
          Number(a.species.bodyId === primary.species.bodyId) ||
        observedMatches(primary, b) - observedMatches(primary, a) ||
        a.species.id.localeCompare(b.species.id)
    );
}

/** Counts only measured structural characters, excluding ecology and unacquired chemistry. */
function observedMatches(a: SpeciesEvidence, b: SpeciesEvidence): number {
  return CHARACTERS.filter(
    (character) =>
      character.structural &&
      a.level >= character.level &&
      b.level >= character.level &&
      character.value(a) !== 'unresolved' &&
      character.value(a) === character.value(b)
  ).length;
}

/** Presents paired observations and qualitative inference, never a measured probability of alien ancestry. */
export function speciesComparisonLines(
  primary: SpeciesEvidence,
  counterpart?: SpeciesEvidence
): TextDashboardLine[] {
  const lines: TextDashboardLine[] = [];
  /** Preserves semantic colours while leaving wrapping to the shared terminal layout. */
  const line = (text: string, tone: TextTone = 'normal', heading = false): void => {
    lines.push({ segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] });
  };
  line('COMPARATIVE BIOLOGY', 'cyan', true);
  if (primary.level < 2) {
    line('Identify this contact before comparing recorded organisms.', 'amber');
    return lines;
  }
  if (!counterpart) {
    line('Observe a second species to establish a comparison record.', 'amber');
    return lines;
  }
  line(`A / ${primary.species.name}`, 'bright');
  line(`B / ${counterpart.species.name}`, 'cyan');
  const matches = observedMatches(primary, counterpart);
  const sameBody = primary.species.bodyId === counterpart.species.bodyId;
  line(sameBody ? 'Shared recorded biosphere' : 'Different recorded origins', 'muted');
  line(
    matches >= 4 && primary.level === 3 && counterpart.level === 3 && sameBody
      ? 'Multiple structural similarities support a provisional affinity.'
      : matches >= 2
        ? 'Possible morphological affinity.'
        : 'No resolved structural affinity.',
    matches >= 2 ? 'green' : 'amber'
  );
  line('Similarity can reflect convergence. Common ancestry remains unconfirmed.', 'muted');
  for (const character of CHARACTERS) {
    line(character.label.toUpperCase(), 'cyan', true);
    const a = primary.level >= character.level ? character.value(primary) : 'unresolved';
    const b = counterpart.level >= character.level ? character.value(counterpart) : 'unresolved';
    const tone =
      a === b && a !== 'unresolved' ? 'green' : a === 'unresolved' || b === 'unresolved' ? 'muted' : 'amber';
    line(`A ${a}`, tone);
    line(`B ${b}`, tone);
  }
  line('RECORDED HABITATS', 'cyan', true);
  for (const [label, entry] of [
    ['A', primary],
    ['B', counterpart],
  ] as const)
    line(
      `${label} ${entry.origins?.map((origin) => origin.surface.label).join('; ') || 'No site coordinates recorded'}`,
      'cyan'
    );
  line('Compare recorded traits; additional analysis may resolve missing structure and chemistry.', 'muted');
  return lines;
}
