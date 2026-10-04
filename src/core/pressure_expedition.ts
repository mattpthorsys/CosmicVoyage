import type {
  BiosphereDefinition,
  EncounterField,
  SpecimenContainer,
} from '../entities/biology/biology_types';
import type { Starbase } from '../entities/starbase';
import { createEncounter, individualProfile } from '../systems/surface_encounter_system';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import { createBiologicalReference } from './biological_mission_guidance';
import type { StarbaseMission } from './mission_board';
import type { XenobiologyService } from './xenobiology_service';

/** Offers one finite equipment-gated reference from actual contacts or eligible material already aboard. */
export function createPressureExpedition(
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
          entry.origin === 'native' &&
          entry.preservation?.retainsSubstrate &&
          (entry.recognised || (research.evidence(entry.id)?.level ?? 0) >= 2) &&
          !stasisCompatibility(entry, 3) &&
          (field.individuals.some(
            (actor) =>
              actor.speciesId === entry.id &&
              ['active', 'stunned'].includes(actor.state) &&
              actor.injury <= 0.7 &&
              !stasisCompatibility(individualProfile(field, actor), 3)
          ) ||
            owned.some(
              (container) =>
                container.species.id === entry.id &&
                container.siteId === site.id &&
                container.kind === 'live' &&
                container.quality >= 0.75 &&
                !stasisCompatibility(container.species, 3, container.sizeScale, container.mineralisation) &&
                !research.snapshot.demand[entry.id]?.contributions.includes(`${container.sourceId}:live`)
            ))
      );
      if (!species) continue;
      return [
        {
          id: `${station.id}:mission:bio-pressure-reference`,
          title: 'Pressure-preserved reference',
          type: 'xenobiology',
          issuer: 'Environmental Biology Office',
          summary: `Live ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y}.`,
          detail: `${site.label}: ${site.habitat.description} Preserve an attached colonial sample and its isolated native substrate at ${species.pressureBar.toFixed(1)} bar. Fit the Pressure-preserving cradle (Shipyard, 4,200 Cr); ordinary extended stasis cannot retain this habitat. Minimum quality 75%. Deliver one live container to ${station.name}; 1,600 Cr finite contract fee plus remaining ordinary research value. Observation, analysis and tissue remain useful without the upgrade, but do not fulfil this live request. Ambient pressure is not proof of obligate piezophily.`,
          rewardCredits: 1600,
          risk: 'Low',
          originStarbaseId: station.id,
          originStarbaseName: station.name,
          systemName,
          objectives: [
            {
              id: 'pressure-reference',
              kind: 'specimen',
              speciesId: species.id,
              siteId: site.id,
              targetName: species.name,
              targetLabel: `LIVE pressure-preserved ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y} / quality >=75%`,
              requiredKind: 'live',
              minimumQuality: 0.75,
              reference: createBiologicalReference(species),
            },
          ],
        },
      ];
    }
  return [];
}
