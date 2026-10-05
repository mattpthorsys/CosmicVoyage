import type {
  BiosphereDefinition,
  EncounterField,
  IndividualSizeClass,
  SpecimenContainer,
  SpeciesDefinition,
  IndividualMineralisation,
} from '../entities/biology/biology_types';
import { individualSizeClass, isMicrobialPatch } from '../entities/biology/biology_rules';
import { createEncounter } from '../systems/surface_encounter_system';
import type { Starbase } from '../entities/starbase';
import type { MissionObjective, StarbaseMission } from './mission_board';
import { isBiologicalMissionObjective } from './mission_board';
import { createBiologicalReference } from './biological_mission_guidance';
import type { XenobiologyService } from './xenobiology_service';

/** Offers finite paired studies only when both advertised contributions exist or are already obtainable records. */
export function createComparativeBiologicalContracts(
  station: Pick<Starbase, 'id' | 'name' | 'kind'>,
  systemName: string,
  biospheres: readonly BiosphereDefinition[],
  fields: Readonly<Record<string, EncounterField>>,
  owned: readonly SpecimenContainer[],
  research: XenobiologyService
): StarbaseMission[] {
  if (station.kind === 'automated-depot') return [];
  const offers: StarbaseMission[] = [];
  const prefix = station.id
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  for (const biosphere of biospheres) {
    if (offers.length === 2) break;
    const sites = biosphere.sites
      .filter((site) => !!site.habitat)
      .map((site) => ({ site, field: fields[site.id] ?? createEncounter(biosphere, site) }));
    if (!offers.some((mission) => mission.id.endsWith('size-comparison'))) {
      for (const { site, field } of sites) {
        const species = field.species.find(
          (entry) =>
            entry.recognised &&
            !isMicrobialPatch(entry) &&
            ['small', 'large'].every((size) =>
              hasTissueSource(field, entry, size as IndividualSizeClass, owned, research)
            )
        );
        if (!species) continue;
        const objectives: MissionObjective[] = (['small', 'large'] as const).map((sizeClass) => ({
          id: `${sizeClass}-tissue`,
          kind: 'specimen',
          speciesId: species.id,
          siteId: site.id,
          targetName: species.name,
          targetLabel: `${sizeClass.toUpperCase()} tissue / ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y}`,
          requiredKind: 'tissue',
          minimumQuality: 0.6,
          sizeClass,
          reference: createBiologicalReference(species),
        }));
        offers.push(
          study(
            station,
            systemName,
            `${prefix}:mission:bio-size-comparison`,
            'Comparative size reference',
            `Small and large ${species.name}: ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
            `${site.label}. Supply tissue from two distinct individuals: one SMALL, one LARGE, both at least 60% quality. Size describes relative mass, not an assumed life stage or a rare-specimen premium. No stasis is required. Deliver the complete pair to ${station.name}; partial delivery consumes nothing.`,
            objectives,
            1000
          )
        );
        break;
      }
    }
    if (!offers.some((mission) => mission.id.endsWith('habitat-comparison'))) {
      for (const species of biosphere.species.filter((entry) => entry.recognised)) {
        const suitable = sites.filter(
          ({ site, field }) =>
            field.individuals.some(
              (actor) => actor.speciesId === species.id && actor.state !== 'collected'
            ) ||
            research
              .evidence(species.id)
              ?.origins?.some((origin) => origin.surface.siteId === site.id && origin.level === 3)
        );
        const first = suitable[0];
        const second =
          first && suitable.find((entry) => entry.site.habitat!.kind !== first.site.habitat!.kind);
        if (!first || !second) continue;
        const objectives: MissionObjective[] = [first, second].map(({ site }, index) => ({
          id: `habitat-analysis-${index + 1}`,
          kind: 'biology-data',
          speciesId: species.id,
          siteId: site.id,
          targetName: species.name,
          targetLabel: `ANALYSIS ${index + 1} / ${species.name} / ${site.label} / X${site.x} Y${site.y}`,
          requiredEvidenceLevel: 3,
          reference: createBiologicalReference(species),
        }));
        offers.push(
          study(
            station,
            systemName,
            `${prefix}:mission:bio-habitat-comparison`,
            'Comparative habitat profile',
            `Analyse ${species.name} at two contrasting habitats on ${biosphere.bodyName}.`,
            `${first.site.label} compared with ${second.site.label}. Acquire close biochemical analysis at both advertised sites, within 25 m of an organism. Existing analysis from each specific site counts; a strong scan elsewhere does not. These are field observations, not proof that habitat caused an adaptation. No cargo or stasis required. Return the complete pair to ${station.name}.`,
            objectives,
            1100
          )
        );
        break;
      }
    }
  }
  return offers;
}

/** Requests a bounded reference pair only when both covering forms exist or are already aboard. */
export function createMineralisationComparison(
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
      const field = fields[site.id] ?? createEncounter(biosphere, site);
      const species = field.species.find(
        (entry) =>
          ['silica', 'mineral'].includes(entry.structuralMaterial ?? 'organic') &&
          (entry.recognised || (research.evidence(entry.id)?.level ?? 0) >= 2) &&
          (['standard', 'reinforced'] as const).every(
            (form) =>
              field.individuals.some(
                (actor) =>
                  actor.speciesId === entry.id &&
                  actor.state !== 'collected' &&
                  !actor.sampled &&
                  (actor.mineralisation ?? 'standard') === form &&
                  actor.injury <= 0.85
              ) ||
              owned.some(
                (container) =>
                  container.species.id === entry.id &&
                  container.siteId === site.id &&
                  container.kind === 'tissue' &&
                  container.quality >= 0.7 &&
                  (container.mineralisation ?? 'standard') === form &&
                  !research.snapshot.demand[entry.id]?.contributions.includes(`${container.sourceId}:tissue`)
              )
          )
      );
      if (!species) continue;
      const objectives: MissionObjective[] = (['standard', 'reinforced'] as IndividualMineralisation[]).map(
        (mineralisation) => ({
          id: `${mineralisation}-covering`,
          kind: 'specimen',
          speciesId: species.id,
          siteId: site.id,
          targetName: species.name,
          targetLabel: `${mineralisation.toUpperCase()} covering / TISSUE / ${species.name} / X${site.x} Y${site.y}`,
          requiredKind: 'tissue',
          minimumQuality: 0.7,
          mineralisation,
          reference: createBiologicalReference(species),
        })
      );
      return [
        study(
          station,
          systemName,
          `${station.id}:mission:bio-covering-comparison`,
          'Mineral covering comparison',
          `Compare two covering forms of ${species.name} on ${biosphere.bodyName}.`,
          `Collect tissue from one STANDARD and one REINFORCED covering at ${site.label}, X${site.x} Y${site.y}; quality at least 70%. Observation identifies the external difference. Reinforcement changes mass and handling, but does not establish a new species or its genetic cause. No stasis required. Deliver both together to ${station.name}; partial delivery consumes nothing.`,
          objectives,
          1200
        ),
      ];
    }
  return [];
}

/** Checks source lifecycle and measured size, including eligible containers already in the expedition holds. */
function hasTissueSource(
  field: EncounterField,
  species: SpeciesDefinition,
  size: IndividualSizeClass,
  owned: readonly SpecimenContainer[],
  research: XenobiologyService
): boolean {
  return (
    field.individuals.some(
      (actor) =>
        actor.speciesId === species.id &&
        actor.state !== 'collected' &&
        !actor.sampled &&
        individualSizeClass(actor.sizeScale) === size &&
        Math.max(0.2, 1 - actor.injury * 0.35) >= 0.6
    ) ||
    owned.some(
      (container) =>
        container.species.id === species.id &&
        container.siteId === field.site.id &&
        container.kind === 'tissue' &&
        container.quality >= 0.6 &&
        individualSizeClass(container.sizeScale) === size &&
        !research.snapshot.demand[species.id]?.contributions.includes(`${container.sourceId}:tissue`)
    )
  );
}

/** Keeps a paired request within the existing station, mission, destination and finite-payment contracts. */
function study(
  station: Pick<Starbase, 'id' | 'name'>,
  systemName: string,
  id: string,
  title: string,
  summary: string,
  detail: string,
  objectives: MissionObjective[],
  rewardCredits: number
): StarbaseMission {
  return {
    id,
    title,
    summary,
    detail,
    objectives,
    rewardCredits,
    type: 'xenobiology',
    issuer: 'Comparative Biology Office',
    risk: objectives.some(
      (objective) =>
        isBiologicalMissionObjective(objective) &&
        ['territorial', 'ambush'].includes(objective.reference?.behaviour ?? '')
    )
      ? 'Med'
      : 'Low',
    originStarbaseId: station.id,
    originStarbaseName: station.name,
    systemName,
  };
}
