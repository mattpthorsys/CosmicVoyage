import type { EncounterIndividual, SpeciesDefinition } from './biology_types';

export const PROPAGULE_VOLUME_M3 = 0.1;
export const PROPAGULE_MASS_KG = 0.005;

/** Adds the prototype capability to existing compatible mat taxa without changing identities or harvest history. */
export function withMatReproduction(species: SpeciesDefinition): SpeciesDefinition {
  if (
    species.reproduction ||
    species.bodyForm !== 'mat' ||
    species.behaviour !== 'sessile' ||
    species.metabolism === 'heterotroph' ||
    (species.preservation?.solvent ?? 'water') !== 'water'
  )
    return species;
  return {
    ...species,
    reproduction: {
      kind: 'dormant-buds',
      baselineSamples: species.origin === 'introduced' ? 2 : species.recognised ? 1 : 0,
    },
  };
}

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
  if (source.state !== 'active') return 'Viable buds require a living, active parent; find another mat';
  if (source.sampled) return 'Tissue was already taken from this mat; harvest buds from an unsampled mat';
  if (source.exposure > 0) return 'Weapon exposure invalidated this batch; find an unexposed mat';
  if (source.injury > 0) return 'This mat is injured; harvest buds from an unharmed mat';
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
