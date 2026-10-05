import type {
  BiosphereDefinition,
  EncounterField,
  SpecimenContainer,
} from '../entities/biology/biology_types';
import type { Starbase } from '../entities/starbase';
import type { CargoComponent, ResourceComponent } from './components';
import { createEncounter, individualProfile } from '../systems/surface_encounter_system';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import {
  allocateSpecimenObjectives,
  specimenObjectiveShortfall,
  isBiologicalMissionObjective,
  type StarbaseMission,
} from './mission_board';
import type { MissionProgressService } from './mission_progress';
import type { XenobiologyService } from './xenobiology_service';
import { createBiologicalReference } from './biological_mission_guidance';
import { createComparativeBiologicalContracts, createMineralisationComparison } from './comparative_biology';
import { createPressureExpedition } from './pressure_expedition';
import { hasSpecimenProvenance } from '../entities/biology/specimen_provenance';
import { createPropaguleContract } from './propagule_research';
import { createBehaviourContracts } from './behaviour_research';
import { BEHAVIOUR_OBSERVATION_LABELS } from '../entities/biology/behaviour_observations';
import { isMicrobialPatch } from '../entities/biology/biology_rules';

export interface BiologicalDeliveryContext {
  readonly station: Pick<Starbase, 'id' | 'name' | 'kind'>;
  readonly holds: readonly CargoComponent[];
  readonly resources: Pick<ResourceComponent, 'credits'>;
}

export type BiologicalDeliveryResult =
  | { readonly ok: false; readonly message: string }
  | {
      readonly ok: true;
      readonly message: string;
      readonly credits: number;
      readonly containerId?: string;
      readonly containerIds?: readonly string[];
    };

/** Formats the actual acquisition requirement for field, journal and station readouts. */
export function biologicalRequirement(mission: StarbaseMission): string {
  if (mission.objectives.length > 1) {
    if (mission.objectives.every((objective) => objective.kind === 'biology-data'))
      return `${mission.objectives.length} HABITAT ANALYSES / no cargo required`;
    return mission.objectives
      .map((objective) =>
        objective.kind === 'specimen'
          ? `${objective.mineralisation ? `${objective.mineralisation.toUpperCase()} ` : ''}${objective.sizeClass ? `${objective.sizeClass.toUpperCase()} ` : ''}${objective.requiredKind.toUpperCase()}`
          : objective.kind === 'biology-behaviour'
            ? BEHAVIOUR_OBSERVATION_LABELS[objective.requiredBehaviour].toUpperCase()
            : 'ANALYSIS'
      )
      .join(' + ');
  }
  const objective = mission.objectives[0];
  return objective?.kind === 'specimen'
    ? `${objective.requiredKind.toUpperCase()} / quality >=${Math.round(objective.minimumQuality * 100)}%`
    : objective?.kind === 'biology-data'
      ? 'DETAILED FIELD ANALYSIS / no cargo required'
      : objective?.kind === 'biology-behaviour'
        ? `${BEHAVIOUR_OBSERVATION_LABELS[objective.requiredBehaviour].toUpperCase()} / no cargo required`
        : 'Biological contribution';
}

/** Offers one finite habitat-reference request only when a real compatible specimen remains obtainable. */
export function createBiologicalContract(
  station: Pick<Starbase, 'id' | 'name' | 'kind'>,
  systemName: string,
  biospheres: readonly BiosphereDefinition[],
  fields: Readonly<Record<string, EncounterField>>,
  owned: readonly SpecimenContainer[] = []
): StarbaseMission | null {
  if (station.kind === 'automated-depot') return null;
  const sites = biospheres
    .flatMap((biosphere) => biosphere.sites.map((site) => ({ biosphere, site })))
    .filter(({ site }) => !!site.habitat)
    .sort(
      (a, b) =>
        Number(b.site.habitat?.kind === 'moist-margin') - Number(a.site.habitat?.kind === 'moist-margin') ||
        a.site.id.localeCompare(b.site.id)
    );
  for (const { biosphere, site } of sites) {
    const field = fields[site.id] ?? createEncounter(biosphere, site);
    const species = [...field.species]
      .sort((a, b) => Number(!!b.socialBehaviour) - Number(!!a.socialBehaviour))
      .find(
        (entry) =>
          entry.recognised &&
          !stasisCompatibility(entry, 1) &&
          (field.individuals.some(
            (actor) =>
              actor.speciesId === entry.id &&
              ['active', 'stunned'].includes(actor.state) &&
              actor.injury <= 0.7 &&
              !stasisCompatibility(individualProfile(field, actor), 1)
          ) ||
            owned.some(
              (container) =>
                container.siteId === site.id &&
                container.species.id === entry.id &&
                container.kind === 'live' &&
                container.quality >= 0.75 &&
                !stasisCompatibility(container.species, 1, container.sizeScale, container.mineralisation)
            ))
      );
    if (!species) continue;
    const id = station.id
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return {
      id: `${id}:mission:bio-reference`,
      title: 'Habitat reference specimen',
      type: 'xenobiology',
      issuer: 'Xenobiology Survey Office',
      summary: `${isMicrobialPatch(species) ? 'Viable microbial material:' : 'Live'} ${species.name} from ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
      detail: `${site.label}: ${site.habitat!.description} A regional reference is needed, not a new-species claim. Basic stasis compatible. Minimum specimen quality 75%. Deliver one sealed live container to ${station.name}; 900 Cr contract fee plus remaining ordinary research value. Tissue or dead material does not satisfy this request.`,
      rewardCredits: 900,
      risk: ['territorial', 'ambush'].includes(species.behaviour) ? 'Med' : 'Low',
      originStarbaseId: station.id,
      originStarbaseName: station.name,
      systemName,
      objectives: [
        {
          id: 'live-reference',
          kind: 'specimen',
          targetName: species.name,
          targetLabel: `${isMicrobialPatch(species) ? 'Viable material /' : 'Live'} ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y} / quality >=75%`,
          speciesId: species.id,
          siteId: site.id,
          requiredKind: 'live',
          minimumQuality: 0.75,
          reference: createBiologicalReference(species),
        },
      ],
    };
  }
  return null;
}

/** Offers bounded alternatives using actual remaining contacts, samples, or already acquired field evidence. */
export function createBiologicalContracts(
  station: Pick<Starbase, 'id' | 'name' | 'kind'>,
  systemName: string,
  biospheres: readonly BiosphereDefinition[],
  fields: Readonly<Record<string, EncounterField>>,
  owned: readonly SpecimenContainer[],
  research: XenobiologyService
): StarbaseMission[] {
  if (station.kind === 'automated-depot') return [];
  const live = createBiologicalContract(station, systemName, biospheres, fields, owned);
  const offers: StarbaseMission[] = live ? [live] : [];
  const prefix = station.id
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  for (const request of ['analysis', 'tissue'] as const) {
    let offer: StarbaseMission | undefined;
    for (const biosphere of biospheres) {
      for (const site of biosphere.sites) {
        if (!site.habitat) continue;
        const field = fields[site.id] ?? createEncounter(biosphere, site);
        const species = field.species.find(
          (entry) =>
            entry.recognised &&
            (field.individuals.some(
              (actor) =>
                actor.speciesId === entry.id &&
                actor.state !== 'collected' &&
                (request === 'analysis' || (!actor.sampled && Math.max(0.2, 1 - actor.injury * 0.35) >= 0.6))
            ) ||
              (request === 'tissue'
                ? owned.some(
                    (container) =>
                      container.species.id === entry.id &&
                      container.siteId === site.id &&
                      container.kind === 'tissue' &&
                      container.quality >= 0.6
                  )
                : research
                    .evidence(entry.id)
                    ?.origins?.some((origin) => origin.surface.siteId === site.id && origin.level === 3)))
        );
        if (!species) continue;
        const analysis = request === 'analysis';
        offer = {
          id: `${prefix}:mission:bio-${request}`,
          title: analysis
            ? 'Habitat biochemical profile'
            : isMicrobialPatch(species)
              ? 'Habitat microbial material reference'
              : 'Habitat tissue reference',
          type: 'xenobiology',
          issuer: 'Xenobiology Survey Office',
          summary: `${analysis ? 'Analyse' : 'Sample'} ${species.name} on ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
          detail: `${site.label}: ${site.habitat.description} ${analysis ? 'Record detailed analysis within 25 m at this habitat; remote preliminary scans and observations from other sites do not count. No physical collection required.' : isMicrobialPatch(species) ? 'Deliver one sealed microbial material sample from this habitat with quality at least 60%. No stasis required; use the material sampling action, not viable preservation.' : 'Deliver one sealed tissue sample from this habitat with quality at least 60%. No stasis required; an intact or live organism is a different contribution.'} Return to ${station.name}. Finite contract fee plus any remaining ordinary research value; prior scientific submissions do not renew novelty.`,
          rewardCredits: analysis ? 450 : 550,
          risk: ['territorial', 'ambush'].includes(species.behaviour) ? 'Med' : 'Low',
          originStarbaseId: station.id,
          originStarbaseName: station.name,
          systemName,
          objectives: [
            analysis
              ? {
                  id: 'field-analysis',
                  kind: 'biology-data',
                  speciesId: species.id,
                  siteId: site.id,
                  targetName: species.name,
                  targetLabel: `Detailed analysis / ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y}`,
                  requiredEvidenceLevel: 3,
                  reference: createBiologicalReference(species),
                }
              : {
                  id: 'tissue-reference',
                  kind: 'specimen',
                  speciesId: species.id,
                  siteId: site.id,
                  targetName: species.name,
                  targetLabel: `${isMicrobialPatch(species) ? 'Microbial material' : 'Tissue'} / ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y} / quality >=60%`,
                  requiredKind: 'tissue',
                  minimumQuality: 0.6,
                  reference: createBiologicalReference(species),
                },
          ],
        };
        break;
      }
      if (offer) break;
    }
    if (offer) offers.push(offer);
  }
  return [
    ...offers,
    ...createComparativeBiologicalContracts(station, systemName, biospheres, fields, owned, research),
    ...createMineralisationComparison(station, systemName, biospheres, fields, owned, research),
    ...createPressureExpedition(station, systemName, biospheres, fields, owned, research),
    ...createBehaviourContracts(station, systemName, biospheres, fields, research),
    ...createPropaguleContract(station, systemName, biospheres, fields, owned, research),
  ];
}

/** Validates every contribution before settling a complete request and consuming its assigned containers atomically. */
export function deliverBiologicalContract(
  progress: MissionProgressService,
  research: XenobiologyService,
  context: BiologicalDeliveryContext,
  missionId: string
): BiologicalDeliveryResult {
  const mission = progress.getMission(missionId);
  if (
    !mission ||
    mission.type !== 'xenobiology' ||
    !mission.objectives.length ||
    mission.objectives.some((objective) => !isBiologicalMissionObjective(objective))
  )
    return { ok: false, message: 'No active biological delivery request.' };
  if (context.station.kind === 'automated-depot')
    return { ok: false, message: 'No scientific receiving staff at this depot.' };
  if (
    mission.originStarbaseId
      ? mission.originStarbaseId !== context.station.id
      : mission.originStarbaseName !== context.station.name
  )
    return { ok: false, message: `Return the requested contribution to ${mission.originStarbaseName}.` };
  const containers = context.holds.flatMap((hold) => hold.specimens ?? []);
  const allocated = allocateSpecimenObjectives(
    mission.objectives.filter((objective) => objective.kind === 'specimen'),
    containers
  );
  const completed = progress.getCompletedObjectiveIds(mission, containers);
  for (const objective of mission.objectives) {
    if (!isBiologicalMissionObjective(objective))
      return { ok: false, message: 'Unsupported biological objective.' };
    if (objective.kind === 'biology-behaviour') {
      if (
        !completed.includes(objective.id) ||
        !research.hasBehaviour(objective.speciesId, objective.siteId, objective.requiredBehaviour)
      )
        return { ok: false, message: `Field episode not recorded: ${objective.targetLabel}.` };
      continue;
    }
    if (objective.kind === 'biology-data') {
      if (
        !completed.includes(objective.id) ||
        (research.evidence(objective.speciesId)?.level ?? 0) < objective.requiredEvidenceLevel
      )
        return { ok: false, message: `Detailed analysis not recorded: ${objective.targetLabel}.` };
      continue;
    }
    const container = allocated.get(objective.id);
    if (!container)
      return {
        ok: false,
        message: `Contribution missing: ${objective.targetLabel}. ${specimenObjectiveShortfall(objective, containers)}`,
      };
    if (
      containers.filter(
        (entry) =>
          entry.id === container.id ||
          (entry.sourceId === container.sourceId && entry.kind === container.kind)
      ).length !== 1
    )
      return { ok: false, message: 'Specimen ownership is ambiguous; delivery refused.' };
    const field = research.snapshot.fields[container.siteId];
    if (
      !field ||
      !hasSpecimenProvenance(container, field) ||
      (research.evidence(container.species.id)?.level ?? 0) < 2
    )
      return { ok: false, message: 'Specimen collection provenance cannot be confirmed.' };
    if (
      research.snapshot.demand[container.species.id]?.contributions.includes(
        `${container.sourceId}:${container.kind}`
      )
    )
      return { ok: false, message: 'This specimen has already been submitted.' };
  }
  // No callbacks run between preparation and commit. Every ordinary refusal occurs above.
  const selected = [...allocated.values()];
  const settled = progress.handIn(missionId, context.station.name, context.station.id, selected);
  if (!settled) return { ok: false, message: 'Contract delivery is not ready for settlement.' };
  let researchCredits = 0;
  for (const objective of mission.objectives)
    if (objective.kind === 'biology-data')
      researchCredits += research.submit(research.evidence(objective.speciesId)!.species, undefined, true);
  for (const container of selected) researchCredits += research.submit(container.species, container, true);
  const consumed = new Set(selected.map((container) => container.id));
  for (const hold of context.holds)
    if (selected.length) hold.specimens = (hold.specimens ?? []).filter((entry) => !consumed.has(entry.id));
  const credits = settled.rewardCredits + researchCredits;
  context.resources.credits += credits;
  return {
    ok: true,
    credits,
    containerId: selected.length === 1 ? selected[0].id : undefined,
    containerIds: selected.map((container) => container.id),
    message: `${mission.objectives.length > 1 ? `Comparative study accepted (${mission.objectives.length} contributions)` : selected.length ? `${selected[0].kind === 'propagule' ? 'Viable propagule' : selected[0].kind === 'live' ? 'Live' : 'Tissue'} reference accepted: ${selected[0].species.name}` : mission.objectives[0].kind === 'biology-behaviour' ? 'Field behaviour record accepted' : 'Field analysis accepted'}. Contract ${settled.rewardCredits} Cr + research ${researchCredits} Cr.`,
  };
}
