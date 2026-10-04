import type { EncounterField, SpecimenContainer } from './biology_types';
import { samePreservationRequirements } from './preservation';

/** Confirms typed material, parent identity and physical history without requiring the parent to remain alive. */
export function hasSpecimenProvenance(container: SpecimenContainer, field: EncounterField): boolean {
  const source = field.individuals.find((actor) => actor.id === container.sourceId);
  const canonical = field.species.find((species) => species.id === source?.speciesId);
  return !!(
    source &&
    canonical &&
    container.siteId === field.site.id &&
    source.speciesId === container.species.id &&
    field.bodyId === container.species.bodyId &&
    samePreservationRequirements(container.species, canonical) &&
    (container.kind !== 'propagule' ||
      (container.species.reproduction?.kind === canonical.reproduction?.kind &&
        container.species.reproduction?.baselineSamples === canonical.reproduction?.baselineSamples)) &&
    (container.kind === 'propagule'
      ? source.propagulesHarvested
      : container.kind === 'tissue'
        ? source.sampled
        : source.state === 'collected') &&
    container.sizeScale === source.sizeScale &&
    container.mineralisation === source.mineralisation
  );
}
