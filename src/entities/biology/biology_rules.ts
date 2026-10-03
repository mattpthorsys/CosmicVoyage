import type { SpeciesDefinition } from './biology_types';

/** Allows small, non-aggressive organisms to share a five-metre rover cell and be handled without stun. */
export function canShareRoverCell(species: SpeciesDefinition): boolean {
  return (
    species.massKg <= 5 &&
    species.sizeM <= 0.5 &&
    ['sessile', 'passive', 'skittish'].includes(species.behaviour)
  );
}
