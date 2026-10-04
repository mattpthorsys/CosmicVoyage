import type { EncounterField, SpecimenContainer } from './biology_types';
import { samePreservationRequirements } from './preservation';
import { supportsPropagules, PROPAGULE_VOLUME_M3 } from './propagules';
import { isMicrobialPatch, MICROBIAL_SAMPLE_MASS_KG, MICROBIAL_CASSETTE_VOLUME_M3 } from './biology_rules';

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
    container.species.cellularity === canonical.cellularity &&
    container.species.contactRepresentation === canonical.contactRepresentation &&
    container.species.energySource === canonical.energySource &&
    container.species.surfaceExpression === canonical.surfaceExpression &&
    (!isMicrobialPatch(canonical) ||
      (container.materialMassKg === MICROBIAL_SAMPLE_MASS_KG &&
        container.volumeM3 === MICROBIAL_CASSETTE_VOLUME_M3)) &&
    (container.kind !== 'propagule' ||
      (supportsPropagules(canonical) &&
        supportsPropagules(container.species) &&
        container.volumeM3 === PROPAGULE_VOLUME_M3 &&
        container.quality === 1 &&
        container.species.reproduction?.kind === canonical.reproduction?.kind &&
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
