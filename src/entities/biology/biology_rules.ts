import type { IndividualSizeClass, IndividualMineralisation, SpeciesDefinition } from './biology_types';

/** Identifies a microbial sampling site by typed biology, never by a mat sprite or description string. */
export function isMicrobialPatch(species: SpeciesDefinition): boolean {
  return species.cellularity === 'unicellular' && species.contactRepresentation === 'colony-patch';
}

/** Names measured size without mistaking aggregate microbial biomass for an individual organism. */
export function contactSizeLabel(species: SpeciesDefinition, sizeScale = 1): string {
  return isMicrobialPatch(species)
    ? `${individualSizeClass(sizeScale)} patch`
    : individualSizeLabel(sizeScale);
}

/** Converts a stored mass scale into one consistent physical profile without changing species identity. */
export function individualPhysicalProfile(
  species: SpeciesDefinition,
  sizeScale = 1,
  mineralisation?: IndividualMineralisation
): SpeciesDefinition {
  const reinforced = mineralisation === 'reinforced';
  if (sizeScale === 1 && !reinforced) return species;
  // Similar proportions: linear dimensions vary with the cube root of mass, not directly with mass.
  return {
    ...species,
    massKg: species.massKg * sizeScale * (reinforced ? 1.15 : 1),
    sizeM: species.sizeM * Math.cbrt(sizeScale) * (reinforced ? 1.025 : 1),
    armour: reinforced ? Math.min(0.8, species.armour + 0.12) : species.armour,
  };
}

/** Names an external individual character without granting species novelty or asserting its genetic cause. */
export function mineralisationLabel(value?: IndividualMineralisation): string {
  return value === 'reinforced' ? 'reinforced mineral covering' : 'standard covering';
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
