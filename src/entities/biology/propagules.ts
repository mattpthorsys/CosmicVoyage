import type { EncounterIndividual, SpeciesDefinition } from './biology_types';

export const PROPAGULE_VOLUME_M3 = 0.1;
export const PROPAGULE_MASS_KG = 0.005;

/** Restricts the first reproductive commodity to one water-based, sessile mat body family. */
export function supportsPropagules(species: SpeciesDefinition): boolean {
  return (
    species.reproduction?.kind === 'dormant-buds' &&
    species.bodyForm === 'mat' &&
    species.behaviour === 'sessile' &&
    species.metabolism !== 'heterotroph' &&
    (species.preservation?.solvent ?? 'water') === 'water'
  );
}

/** Requires an unharmed living source; tissue extraction and weapon exposure invalidate this batch. */
export function propaguleAvailability(
  species: SpeciesDefinition,
  source: EncounterIndividual
): string | null {
  if (!supportsPropagules(species)) return 'No verified detachable propagules for this organism';
  if (source.propagulesHarvested) return 'This source has already supplied its viable batch';
  if (source.state !== 'active' || source.injury > 0 || source.exposure > 0 || source.sampled)
    return 'Viable buds require an active, unharmed, unsampled source';
  return null;
}

/** Buds are detachable, not a substrate sample: preserve native conditions without carrying the parent. */
export function propagulePreservationProfile(species: SpeciesDefinition): SpeciesDefinition {
  return {
    ...species,
    massKg: PROPAGULE_MASS_KG,
    sizeM: 0.01,
    preservation: { solvent: species.preservation?.solvent ?? 'water', retainsSubstrate: false },
  };
}
