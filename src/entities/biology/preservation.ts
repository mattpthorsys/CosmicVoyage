import type { BiologicalSolvent, SpeciesDefinition } from './biology_types';

export interface PreservationKit {
  readonly id: number;
  readonly label: string;
  readonly cost: number;
  readonly temperatureK: readonly [number, number];
  readonly pressureBar: readonly [number, number];
  readonly solvents: readonly BiologicalSolvent[];
  readonly retainsSubstrate: boolean;
  readonly liveSlots: number;
}

// These are ship equipment specifications. Stasis remains a reliable science-fiction abstraction.
export const PRESERVATION_KITS: readonly PreservationKit[] = [
  {
    id: 1,
    label: 'Basic biological stasis',
    cost: 700,
    temperatureK: [280, 315],
    pressureBar: [0.3, 2],
    solvents: ['water'],
    retainsSubstrate: false,
    liveSlots: 2,
  },
  {
    id: 2,
    label: 'Extended biological stasis',
    cost: 1900,
    temperatureK: [273, 345],
    pressureBar: [0.04, 12],
    solvents: ['water'],
    retainsSubstrate: false,
    liveSlots: 6,
  },
  {
    id: 3,
    label: 'Pressure-preserving cradle',
    cost: 4200,
    temperatureK: [273, 345],
    pressureBar: [0.04, 30],
    solvents: ['water'],
    retainsSubstrate: true,
    liveSlots: 6,
  },
];

/** Resolves a known capability profile; arbitrary higher classes do not automatically support all chemistry. */
export function preservationKit(id: number): PreservationKit | undefined {
  return PRESERVATION_KITS.find((kit) => kit.id === id);
}

/** Formats the same physical capabilities used by capture and transfer, including native-substrate isolation. */
export function preservationKitDescription(kit: PreservationKit): string {
  return `${kit.liveSlots} live slots per carrier; ${kit.temperatureK.join('-')} K, ${kit.pressureBar.join('-')} bar${kit.retainsSubstrate ? '; native substrate isolation' : ''}`;
}

/** Explains a physiological containment requirement without guessing chemistry from descriptive text. */
export function preservationRequirementDescription(species: SpeciesDefinition): string {
  return `${species.preservation?.solvent ?? 'water'} solvent / ${species.temperatureK.toFixed(0)} K / ${species.pressureBar.toFixed(2)} bar${species.preservation?.retainsSubstrate ? ' / pressure-preserving native substrate required' : ''}`;
}

/** Rejects container metadata that would bypass the source organism's actual environmental requirements. */
export function samePreservationRequirements(a: SpeciesDefinition, b: SpeciesDefinition): boolean {
  return (
    a.temperatureK === b.temperatureK &&
    a.pressureBar === b.pressureBar &&
    (a.preservation?.solvent ?? 'water') === (b.preservation?.solvent ?? 'water') &&
    (a.preservation?.retainsSubstrate ?? false) === (b.preservation?.retainsSubstrate ?? false)
  );
}
