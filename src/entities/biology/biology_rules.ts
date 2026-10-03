import type { IndividualSizeClass, SpeciesDefinition } from './biology_types';

/** Converts a stored mass scale into one consistent physical profile without changing species identity. */
export function individualPhysicalProfile(species: SpeciesDefinition, sizeScale = 1): SpeciesDefinition {
  if (sizeScale === 1) return species;
  // Similar proportions: linear dimensions vary with the cube root of mass, not directly with mass.
  return { ...species, massKg: species.massKg * sizeScale, sizeM: species.sizeM * Math.cbrt(sizeScale) };
}

/** Names an observed size class without asserting an unmeasured life stage. */
export function individualSizeLabel(sizeScale = 1): string {
  return `${individualSizeClass(sizeScale)} individual`;
}

/** Classifies measured relative mass without identifying age, sex or scientific novelty. */
export function individualSizeClass(sizeScale = 1): IndividualSizeClass {
  return sizeScale < 0.7 ? 'small' : sizeScale > 1.3 ? 'large' : 'typical';
}

/** Allows small, non-aggressive organisms to share a five-metre rover cell and be handled without stun. */
export function canShareRoverCell(species: SpeciesDefinition): boolean {
  return (
    species.massKg <= 5 &&
    species.sizeM <= 0.5 &&
    ['sessile', 'passive', 'skittish'].includes(species.behaviour)
  );
}
