import type { BiosphereDefinition, EncounterField } from '../entities/biology/biology_types';
import { BEHAVIOUR_OBSERVATION_LABELS } from '../entities/biology/behaviour_observations';
import { habitatForagingIntent } from '../systems/organism_foraging';
import { createEncounter } from '../systems/surface_encounter_system';
import type { Starbase } from '../entities/starbase';
import type { BiologicalBehaviourObjective, StarbaseMission } from './mission_board';
import type { XenobiologyService } from './xenobiology_service';
import { createBiologicalReference } from './biological_mission_guidance';
import { behaviourSources } from '../systems/organism_behaviour';
import { PRNG } from '../utils/prng';

/** Adds at most three finite observation requests, sourced from real contacts or already recorded episodes. */
export function createBehaviourContracts(
  station: Pick<Starbase, 'id' | 'name' | 'kind'>,
  systemName: string,
  biospheres: readonly BiosphereDefinition[],
  fields: Readonly<Record<string, EncounterField>>,
  research: XenobiologyService
): StarbaseMission[] {
  if (station.kind === 'automated-depot') return [];
  const offers: StarbaseMission[] = [];
  const prefix = station.id
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const communities = biospheres.map((biosphere) => ({
    biosphere,
    sites: biosphere.sites
      .filter((site) => !!site.habitat)
      .map((site) => ({ site, field: fields[site.id] ?? createEncounter(biosphere, site) })),
  }));
  for (const kind of ['feeding', 'shelter-use', 'group-retreat'] as const) {
    let offer: StarbaseMission | undefined;
    for (const { biosphere, sites } of communities) {
      for (const species of biosphere.species) {
        if (!species.recognised && (research.evidence(species.id)?.level ?? 0) < 2) continue;
        const suitable = sites.filter(({ site, field }) => {
          if (research.hasBehaviour(species.id, site.id, kind)) return true;
          if ((research.evidence(species.id)?.behaviourObservations?.length ?? 0) >= 128) return false;
          const canonical = field.species.find((entry) => entry.id === species.id);
          if (!canonical) return false;
          const sources = behaviourSources(field, canonical, kind);
          if (kind === 'group-retreat') return sources.length >= 2;
          return sources.some((actor) => {
            // The six-tick cycle has only feeding/resting intents; route each required phase once.
            const phase = new PRNG(field.seed).seedNew(actor.id, 'activity-phase').randomInt(0, 5);
            const tick = ((kind === 'feeding' ? 2 : 0) - phase + 6) % 6;
            const intent = habitatForagingIntent(field, { ...actor, activity: undefined }, canonical, tick);
            return (
              !!intent &&
              (kind === 'feeding'
                ? intent.activity === 'feeding' || intent.activity === 'foraging'
                : intent.activity === 'sheltering' || intent.activity === 'returning')
            );
          });
        });
        const first = suitable[0];
        if (!first) continue;
        const second =
          kind === 'group-retreat' &&
          suitable.find((entry) => entry.site.habitat!.kind !== first.site.habitat!.kind);
        const selected = second ? [first, second] : [first];
        const objectives: BiologicalBehaviourObjective[] = selected.map(({ site }, index) => ({
          id: `behaviour-${index + 1}`,
          kind: 'biology-behaviour',
          speciesId: species.id,
          siteId: site.id,
          targetName: species.name,
          targetLabel: `${BEHAVIOUR_OBSERVATION_LABELS[kind]} / ${species.name} / ${site.label} / X${site.x} Y${site.y}`,
          requiredBehaviour: kind,
          reference: createBiologicalReference(species),
        }));
        offer = {
          id: `${prefix}:mission:bio-behaviour-${kind}`,
          title:
            kind === 'feeding'
              ? 'Feeding behaviour survey'
              : kind === 'shelter-use'
                ? 'Shelter-use survey'
                : second
                  ? 'Coordinated retreat comparison'
                  : 'Coordinated retreat survey',
          type: 'xenobiology',
          issuer: 'Field Ethology Office',
          summary: `Document ${BEHAVIOUR_OBSERVATION_LABELS[kind].toLowerCase()} by ${species.name} on ${biosphere.bodyName}.`,
          detail: `${selected.map(({ site }) => `${site.label}, X${site.x} Y${site.y}`).join(' / ')}. Identify the species, then record visible activity within 40 m using passive instruments. ${kind === 'feeding' ? 'Keep 35-40 m from skittish grazers; allow them to reach a producer patch.' : kind === 'shelter-use' ? 'Observe a contact entering sheltered substrate during its resting phase.' : 'Record at least two group members moving away together; a lone flight or warning timer is insufficient.'} Sources must be active, uninjured, unsampled and free of prior weapon exposure when witnessed. No tissue, cargo or stasis required. ${second ? 'Both contrasting habitats are required; these episodes do not prove a causal adaptation.' : 'One witnessed episode is sufficient; repeated waiting adds no reward.'} Existing records from these exact sites count. Return to ${station.name}. Fixed fee only; ordinary scan/specimen awards remain separate.`,
          rewardCredits: second ? 1100 : kind === 'shelter-use' ? 600 : 650,
          risk: 'Low',
          originStarbaseId: station.id,
          originStarbaseName: station.name,
          systemName,
          objectives,
        };
        break;
      }
      if (offer) break;
    }
    if (offer) offers.push(offer);
  }
  return offers;
}
