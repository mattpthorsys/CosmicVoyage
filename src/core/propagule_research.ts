import type {
  BiosphereDefinition,
  EncounterField,
  SpecimenContainer,
} from '../entities/biology/biology_types';
import { propaguleAvailability } from '../entities/biology/propagules';
import { hasSpecimenProvenance } from '../entities/biology/specimen_provenance';
import { createEncounter } from '../systems/surface_encounter_system';
import { propaguleCompatibility } from '../systems/specimen_cargo_system';
import type { Starbase } from '../entities/starbase';
import type { StarbaseMission } from './mission_board';
import type { XenobiologyService } from './xenobiology_service';
import { createBiologicalReference } from './biological_mission_guidance';

/** Offers one finite reproductive reference at a staffed port, using an obtainable or already-owned batch. */
export function createPropaguleContract(
  station: Pick<Starbase, 'id' | 'name' | 'kind'>,
  systemName: string,
  biospheres: readonly BiosphereDefinition[],
  fields: Readonly<Record<string, EncounterField>>,
  owned: readonly SpecimenContainer[],
  research: XenobiologyService
): StarbaseMission[] {
  if (station.kind === 'automated-depot') return [];
  for (const biosphere of biospheres)
    for (const site of biosphere.sites) {
      if (!site.habitat) continue;
      const field = fields[site.id] ?? createEncounter(biosphere, site);
      const species = field.species.find(
        (entry) =>
          entry.recognised &&
          !propaguleCompatibility(entry, 1) &&
          (field.individuals.some(
            (source) => source.speciesId === entry.id && !propaguleAvailability(entry, source)
          ) ||
            owned.some(
              (container) =>
                container.species.id === entry.id &&
                container.siteId === site.id &&
                container.kind === 'propagule' &&
                container.quality >= 0.8 &&
                hasSpecimenProvenance(container, field) &&
                !research.snapshot.demand[entry.id]?.contributions.includes(`${container.sourceId}:propagule`)
            ))
      );
      if (!species) continue;
      const prefix = station.id
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      return [
        {
          id: `${prefix}:mission:bio-propagules`,
          title: 'Viable mat propagules',
          type: 'xenobiology',
          issuer: 'Xenobiology Survey Office',
          summary: `Viable buds of ${species.name} / ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
          detail: `${site.label}: ${site.habitat.description} Analyse a living mat, approach within 7.5 m, then harvest its detachable dormant buds through Cargo. An active, unharmed, unsampled source is required; leave the parent in place. One finite batch per source. Basic stasis compatible; 0.1 m^3 and one preservation slot. Deliver to ${station.name} for a 750 Cr fee plus remaining reproductive research value. Tissue, a dead parent or a live adult cannot replace viable reproductive material. This regional reference does not renew species novelty.`,
          rewardCredits: 750,
          risk: 'Low',
          originStarbaseId: station.id,
          originStarbaseName: station.name,
          systemName,
          objectives: [
            {
              id: 'viable-buds',
              kind: 'specimen',
              speciesId: species.id,
              siteId: site.id,
              targetName: species.name,
              targetLabel: `Viable propagules / ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y}`,
              requiredKind: 'propagule',
              minimumQuality: 0.8,
              reference: createBiologicalReference(species),
            },
          ],
        },
      ];
    }
  return [];
}
