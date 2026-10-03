import type {
  BiosphereDefinition,
  EncounterField,
  SpecimenContainer,
} from '../entities/biology/biology_types';
import type { Starbase } from '../entities/starbase';
import type { CargoComponent, ResourceComponent } from './components';
import { createEncounter, individualProfile } from '../systems/surface_encounter_system';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import { matchesSpecimenObjective, type StarbaseMission } from './mission_board';
import type { MissionProgressService } from './mission_progress';
import type { XenobiologyService } from './xenobiology_service';

export interface BiologicalDeliveryContext {
  readonly station: Pick<Starbase, 'id' | 'name' | 'kind'>;
  readonly holds: readonly CargoComponent[];
  readonly resources: Pick<ResourceComponent, 'credits'>;
}

export type BiologicalDeliveryResult =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly message: string; readonly credits: number; readonly containerId?: string };

/** Formats the actual acquisition requirement for field, journal and station readouts. */
export function biologicalRequirement(mission: StarbaseMission): string {
  const objective = mission.objectives[0];
  return objective?.kind === 'specimen'
    ? `${objective.requiredKind.toUpperCase()} / quality >=${Math.round(objective.minimumQuality * 100)}%`
    : objective?.kind === 'biology-data'
      ? 'DETAILED FIELD ANALYSIS / no cargo required'
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
                !stasisCompatibility(container.species, 1, container.sizeScale)
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
      summary: `Live ${species.name} from ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
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
          targetLabel: `Live ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y} / quality >=75%`,
          speciesId: species.id,
          siteId: site.id,
          requiredKind: 'live',
          minimumQuality: 0.75,
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
          title: analysis ? 'Habitat biochemical profile' : 'Habitat tissue reference',
          type: 'xenobiology',
          issuer: 'Xenobiology Survey Office',
          summary: `${analysis ? 'Analyse' : 'Sample'} ${species.name} on ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
          detail: `${site.label}: ${site.habitat.description} ${analysis ? 'Record detailed analysis within 25 m at this habitat; remote preliminary scans and observations from other sites do not count. No physical collection required.' : 'Deliver one sealed tissue sample from this habitat with quality at least 60%. No stasis required; an intact or live organism is a different contribution.'} Return to ${station.name}. Finite contract fee plus any remaining ordinary research value; prior scientific submissions do not renew novelty.`,
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
                }
              : {
                  id: 'tissue-reference',
                  kind: 'specimen',
                  speciesId: species.id,
                  siteId: site.id,
                  targetName: species.name,
                  targetLabel: `Tissue / ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y} / quality >=60%`,
                  requiredKind: 'tissue',
                  minimumQuality: 0.6,
                },
          ],
        };
        break;
      }
      if (offer) break;
    }
    if (offer) offers.push(offer);
  }
  return offers;
}

/** Validates contribution ownership before settling field data or one whole specimen atomically. */
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
    mission.objectives.length !== 1 ||
    mission.objectives[0].kind === 'scan'
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
  const objective = mission.objectives[0];
  if (objective.kind === 'biology-data') {
    const evidence = research.evidence(objective.speciesId);
    if (
      !evidence ||
      evidence.level < objective.requiredEvidenceLevel ||
      progress.getStatus(mission) !== 'READY'
    )
      return { ok: false, message: 'Detailed field analysis from the requested habitat is not recorded.' };
    const settled = progress.handIn(missionId, context.station.name, context.station.id);
    if (!settled) return { ok: false, message: 'Field analysis is not ready for settlement.' };
    const researchCredits = research.submit(evidence.species, undefined, true);
    const credits = settled.rewardCredits + researchCredits;
    context.resources.credits += credits;
    return {
      ok: true,
      credits,
      message: `Field analysis accepted: ${evidence.species.name}. Contract ${settled.rewardCredits} Cr + research ${researchCredits} Cr.`,
    };
  }
  const containers = context.holds.flatMap((hold) => hold.specimens ?? []);
  const container = containers.find((entry) => matchesSpecimenObjective(objective, entry));
  if (!container)
    return {
      ok: false,
      message: `Requested ${objective.requiredKind} specimen is not aboard, or its habitat/quality does not match.`,
    };
  if (containers.filter((entry) => entry.id === container.id).length !== 1)
    return { ok: false, message: 'Specimen ownership is ambiguous; delivery refused.' };
  const field = research.snapshot.fields[container.siteId];
  const source = field?.individuals.find((actor) => actor.id === container.sourceId);
  if (
    !source ||
    (container.kind === 'tissue' ? !source.sampled : source.state !== 'collected') ||
    container.sizeScale !== source.sizeScale ||
    source.speciesId !== container.species.id ||
    field.bodyId !== container.species.bodyId ||
    (research.evidence(container.species.id)?.level ?? 0) < 2
  )
    return { ok: false, message: 'Specimen collection provenance cannot be confirmed.' };
  const contribution = `${container.sourceId}:${container.kind}`;
  if (research.snapshot.demand[container.species.id]?.contributions.includes(contribution))
    return { ok: false, message: 'This specimen has already been submitted.' };
  // No callbacks run between preparation and commit. Every ordinary refusal occurs above.
  const settled = progress.handIn(missionId, context.station.name, context.station.id, container);
  if (!settled) return { ok: false, message: 'Contract delivery is not ready for settlement.' };
  const researchCredits = research.submit(container.species, container, true);
  for (const hold of context.holds)
    hold.specimens = (hold.specimens ?? []).filter((entry) => entry.id !== container.id);
  const credits = settled.rewardCredits + researchCredits;
  context.resources.credits += credits;
  return {
    ok: true,
    credits,
    containerId: container.id,
    message: `${container.kind === 'live' ? 'Live' : 'Tissue'} reference accepted: ${container.species.name}. Contract ${settled.rewardCredits} Cr + research ${researchCredits} Cr.`,
  };
}
